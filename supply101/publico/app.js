/* supply101 — pedir una compra y darle seguimiento.
 *
 * Tres cosas, y ninguna más, porque así lo encargó Mike el 20-sep: pedir una
 * compra, ver si ya se pagó, y abrir el comprobante para reclamarle al
 * proveedor. **Pagar no está aquí**: eso vive en dash101, con las cuentas.
 *
 * Todo pasa contra `suite101-api` por `/s101/*`, que el Worker de al lado
 * reenvía con `X-App: dash101`. Los permisos los revisa el servidor en cada
 * llamada: esta pantalla nunca decide quién puede qué. Si la API dice que no,
 * se enseña lo que dijo.
 *
 * DINERO. La API guarda centavos enteros; aquí se teclean y se leen pesos. La
 * conversión vive en `aCentavos` y `pesos`, en un solo lugar. Un número que se
 * multiplica por cien de más no truena: sólo miente, y en una orden de compra
 * miente sobre dinero de verdad.
 *
 * LAS DIRECCIONES llevan `#`, para que quell101 y quote101 puedan mandar a la
 * gente directo a `…/#/pedir` sin que esta app necesite servidor de rutas.
 */

/* ─────────────── lo básico ─────────────── */

const $ = (id) => document.getElementById(id);
const ver = (id, si = true) => $(id).classList.toggle('oculto', !si);

const VISTAS = ['v-correo', 'v-clave', 'v-codigo', 'v-nueva', 'v-lista', 'v-pedir', 'v-detalle', 'v-cargando'];
function mostrar(id) {
  for (const v of VISTAS) ver(v, v === id);
  window.scrollTo(0, 0);
}
function decir(id, texto, tipo) {
  const e = $(id);
  e.textContent = texto || '';
  e.className = `aviso ${tipo || 'mal'}`;
  ver(id, !!texto);
}

/** Los errores de la API en palabras. Lo que no esté aquí se enseña tal cual:
 *  un código en snake_case es feo, pero es mejor que «algo salió mal». */
const DICHO = {
  sin_sesion: 'Se cerró la sesión. Vuelve a entrar.',
  sin_permiso: 'Tu cuenta no tiene permiso para esto en esta empresa.',
  clave_invalida: 'Esa contraseña no es.',
  codigo_invalido: 'Ese código no es. Revisa el correo y vuelve a intentar.',
  demasiados_intentos: 'Muchos intentos seguidos. Espera un minuto.',
  org_sin_pago: 'La suscripción de la empresa venció. Avísale a quien la administra.',
  app_inactiva: 'Esta empresa no tiene prendidas las compras. Avísale a quien la administra.',
  datos_invalidos: 'Faltan datos o alguno no cuadra.',
  desglose_no_cuadra: 'El subtotal más el IVA tiene que dar el total exacto.',
  orden_no_esta_devuelta: 'Esta compra ya no se puede corregir: cambió de estado.',
  no_encontrado: 'No se encontró.',
};
const enPalabras = (e) => DICHO[e?.error] || e?.error || 'No se pudo. Vuelve a intentar.';

/** Una llamada a la API. `form` manda multipart (la foto); `body`, JSON. */
async function pedir(ruta, opciones = {}) {
  const { method = 'GET', body, form } = opciones;
  const cabeceras = form ? {} : { 'Content-Type': 'application/json' };
  const r = await fetch(`/s101${ruta}`, {
    method, headers: cabeceras, credentials: 'include',
    body: form ? form : body === undefined ? undefined : JSON.stringify(body),
  });
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch { /* no vino JSON */ }
  if (!cuerpo || !cuerpo.ok) throw { estado: r.status, ...(cuerpo || { error: 'respuesta_no_json' }) };
  return cuerpo.data;
}

/* ─────────────── dinero ─────────────── */

/** Pesos tecleados → centavos enteros, leyendo el número como texto para no
 *  perder el medio centavo en la aritmética de flotantes. Medio centavo sube. */
function aCentavos(v) {
  if (v === null || v === undefined || v === '') return 0;
  const t = String(v).replace(/[\s$,]/g, '');
  const negativo = t.startsWith('-');
  const [entero = '0', dec = ''] = t.replace(/^[+-]/, '').split('.');
  const dos = (dec + '00').slice(0, 2);
  let c = (Number(entero) || 0) * 100 + (Number(dos) || 0);
  if (dec.length > 2 && dec[2] >= '5') c += 1;
  return negativo ? -c : c;
}
const pesos = (centavos, moneda = 'MXN') =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: moneda === 'USD' ? 'USD' : 'MXN' })
    .format((Number(centavos) || 0) / 100);

/** El desglose, con la MISMA fórmula que la suite: del total hacia atrás, y
 *  el IVA es la resta. Así `subtotal + iva` da el total exacto siempre. */
function desglosar(totalCentavos, tasa = 1600) {
  const sub = Math.round((totalCentavos * 10000) / (10000 + tasa));
  return { subtotal: sub, iva: totalCentavos - sub };
}

const hoy = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const ESTADO = {
  en_buzon: { texto: 'Esperando pago', clase: 'marca' },
  devuelta: { texto: 'Te la devolvieron', clase: 'marca pend' },
  pagada: { texto: 'Pagada', clase: 'marca bien' },
  rechazada: { texto: 'Rechazada', clase: 'marca mal' },
};
const ORDEN_LISTA = { devuelta: 0, en_buzon: 1, pagada: 2, rechazada: 3 };

/* ─────────────── el estado de la app ─────────────── */

const est = {
  yo: null,
  org: null,          // la empresa
  negocios: [],
  negocio: null,      // el negocio activo
  proveedores: [],
  proyectos: [],
  corrigiendo: null,  // la orden que se está corrigiendo, si es que
};
const LLAVE_ORG = 'supply101:org';
const LLAVE_NEG = 'supply101:negocio';
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } };
const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

/* ─────────────── entrar ─────────────── */

let correo = '';

$('b-google').href = `/s101/auth/google?volver_a=${encodeURIComponent(location.origin + '/')}`;

$('f-correo').onsubmit = async (ev) => {
  ev.preventDefault();
  correo = $('correo').value.trim().toLowerCase();
  if (!correo) return;
  decir('err-correo', '');
  $('clave-p').textContent = `La de tu cuenta, ${correo}.`;
  $('clave').value = '';
  mostrar('v-clave');
  $('clave').focus();
};

$('f-clave').onsubmit = async (ev) => {
  ev.preventDefault();
  const b = $('b-clave'); b.disabled = true; b.textContent = 'Entrando…';
  decir('err-clave', '');
  try {
    await pedir('/auth/entrar', { method: 'POST', body: { correo, clave: $('clave').value } });
    await arrancarSesion();
  } catch (e) {
    /* `sin_permiso` es el correo que no tiene cuenta y `clave_invalida` la
     * contraseña equivocada: no se distinguen a propósito, para no decirle a
     * nadie de fuera qué correos existen. */
    decir('err-clave', e.error === 'sin_permiso' || e.error === 'clave_invalida'
      ? 'El correo o la contraseña no son. Si no te acuerdas, usa «Olvidé mi contraseña».'
      : enPalabras(e));
    $('clave').value = '';
  } finally { b.disabled = false; b.textContent = 'Entrar'; }
};

$('b-olvide').onclick = async () => {
  decir('err-codigo', ''); decir('ok-codigo', '');
  $('codigo-p').textContent = `Te lo mandamos a ${correo}. Vence en 10 minutos.`;
  $('codigo').value = '';
  mostrar('v-codigo');
  try {
    const r = await pedir('/auth/codigo', { method: 'POST', body: { correo } });
    // Fuera de producción la API devuelve el código: se rellena solo y se
    // dice, para que nadie crea que se lo mandaron por correo.
    if (r?.codigo_prueba) {
      $('codigo').value = r.codigo_prueba;
      decir('ok-codigo', 'Ambiente de pruebas: el código se rellenó solo.', 'bien');
    }
  } catch (e) { decir('err-codigo', enPalabras(e)); }
};

$('f-codigo').onsubmit = async (ev) => {
  ev.preventDefault();
  const b = $('b-codigo'); b.disabled = true; b.textContent = 'Entrando…';
  decir('err-codigo', '');
  try {
    await pedir('/auth/entrar', { method: 'POST', body: { correo, codigo: $('codigo').value.trim() } });
    const yo = await pedir('/yo');
    if (!yo.tiene_clave) { mostrar('v-nueva'); $('nueva').focus(); return; }
    await arrancarSesion();
  } catch (e) { decir('err-codigo', enPalabras(e)); }
  finally { b.disabled = false; b.textContent = 'Continuar'; }
};

$('f-nueva').onsubmit = async (ev) => {
  ev.preventDefault();
  decir('err-nueva', '');
  if ($('nueva').value.length < 8) return decir('err-nueva', 'Que tenga al menos ocho letras o números.');
  if ($('nueva').value !== $('nueva2').value) return decir('err-nueva', 'Las dos no son iguales.');
  const b = $('b-nueva'); b.disabled = true; b.textContent = 'Guardando…';
  try {
    await pedir('/auth/clave', { method: 'POST', body: { clave: $('nueva').value } });
    await arrancarSesion();
  } catch (e) { decir('err-nueva', enPalabras(e)); }
  finally { b.disabled = false; b.textContent = 'Guardar y entrar'; }
};

$('b-otro').onclick = $('b-otro-2').onclick = () => { $('correo').value = correo; mostrar('v-correo'); };

$('b-salir').onclick = async () => {
  try { await pedir('/auth/salir', { method: 'POST' }); } catch { /* ya no había */ }
  location.hash = '';
  location.reload();
};

/* ─────────────── arranque ─────────────── */

/** Qué empresa. Quien es de la nómina trae `acceso`; quien es miembro trae
 *  `orgs`. Si hay más de una, se recuerda la última y se puede cambiar. */
function resolverEmpresa(yo) {
  if (yo.acceso?.org_id) return [{ id: yo.acceso.org_id, nombre: yo.acceso.org_id }];
  return (yo.orgs || []).map((o) => ({ id: o.id, nombre: o.nombre }));
}

async function arrancarSesion() {
  mostrar('v-cargando');
  est.yo = await pedir('/yo');
  const empresas = resolverEmpresa(est.yo);
  if (empresas.length === 0) {
    mostrar('v-lista');
    ver('b-nueva-compra', false);
    decir('err-lista', 'Tu cuenta no está en ninguna empresa todavía. Pídele a quien la administra que te dé de alta.');
    return;
  }
  const guardada = leer(LLAVE_ORG);
  est.org = empresas.find((e) => e.id === guardada) || empresas[0];
  guardar(LLAVE_ORG, est.org.id);

  $('barra-empresa').textContent = est.org.nombre || est.org.id;
  $('barra-correo').textContent = est.yo.usuario?.correo || '';
  ver('barra', true);

  try {
    est.negocios = (await pedir(`/orgs/${est.org.id}/negocios`)).filas || [];
  } catch (e) {
    mostrar('v-lista');
    ver('b-nueva-compra', false);
    decir('err-lista', enPalabras(e));
    return;
  }
  const negGuardado = leer(LLAVE_NEG);
  est.negocio = est.negocios.find((n) => n.id === negGuardado) || est.negocios[0] || null;
  if (est.negocio) guardar(LLAVE_NEG, est.negocio.id);

  const sel = $('negocio');
  sel.innerHTML = est.negocios.map((n) => `<option value="${n.id}">${escapar(n.nombre)}</option>`).join('');
  if (est.negocio) sel.value = est.negocio.id;
  ver('picker-negocio', est.negocios.length > 1);
  sel.onchange = () => {
    est.negocio = est.negocios.find((n) => n.id === sel.value) || null;
    if (est.negocio) guardar(LLAVE_NEG, est.negocio.id);
    verLista();
  };

  enrutar();
}

const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ─────────────── mis compras ─────────────── */

async function verLista() {
  mostrar('v-lista');
  decir('err-lista', '');
  $('lista-sub').textContent = est.negocio
    ? `Lo que has pedido en ${est.negocio.nombre}, y en qué va cada una.`
    : 'Lo que has pedido, y en qué va cada una.';
  $('lista').innerHTML = '<p class="vacio">Cargando…</p>';
  try {
    const q = est.negocio ? `?negocio_id=${encodeURIComponent(est.negocio.id)}` : '';
    const filas = (await pedir(`/orgs/${est.org.id}/ordenes${q}`)).filas || [];
    filas.sort((a, b) => (ORDEN_LISTA[a.estado] - ORDEN_LISTA[b.estado]) || String(b.creado_at).localeCompare(String(a.creado_at)));
    $('lista').innerHTML = filas.length === 0
      ? `<div class="vacio"><b>Todavía no pides nada</b>Pide una compra y le llega directo a quien paga.</div>`
      : `<div class="lista">${filas.map(renglon).join('')}</div>`;
  } catch (e) {
    $('lista').innerHTML = '';
    decir('err-lista', enPalabras(e));
  }
}

function renglon(o) {
  const e = ESTADO[o.estado] || { texto: o.estado, clase: 'marca gris' };
  const vence = o.fecha_maxima_pago
    ? (o.estado === 'en_buzon' && o.fecha_maxima_pago < hoy()
        ? `venció el ${o.fecha_maxima_pago}` : `para el ${o.fecha_maxima_pago}`)
    : 'sin fecha';
  return `<a class="renglon" href="#/orden/${o.id}">
    <span class="texto">
      <b>${escapar(o.concepto)}</b>
      <small>${escapar(o.folio)} · ${escapar(o.proveedor_nombre || 'sin proveedor')} · ${vence}</small>
      <small style="margin-top:4px"><span class="${e.clase}">${e.texto}</span>${
        o.estado === 'devuelta' && o.nota_contador ? ` «${escapar(o.nota_contador)}»` : ''}</small>
    </span>
    <span class="plata">${pesos(o.monto, o.moneda)}${
      o.con_factura ? `<small>+ IVA ${pesos(o.iva, o.moneda)}</small>` : '<small>sin factura</small>'}</span>
  </a>`;
}

/* ─────────────── pedir una compra ─────────────── */

$('b-nueva-compra').onclick = () => { location.hash = '#/pedir'; };
$('b-volver-1').onclick = $('b-volver-2').onclick = () => { location.hash = '#/'; };

async function verPedir(orden) {
  est.corrigiendo = orden || null;
  mostrar('v-pedir');
  decir('err-pedir', '');
  $('pedir-t').textContent = orden ? `Corregir ${orden.folio}` : 'Pedir una compra';
  $('pedir-sub').textContent = orden
    ? 'Conserva el mismo folio y toda su historia: una compra corregida no es otra compra.'
    : 'Le llega directo a quien paga. Nadie tiene que autorizarla antes.';
  $('b-pedir').textContent = orden ? 'Volver a mandarla' : 'Pedir la compra';
  ver('archivo', !orden);
  ver('bloque-partida', false);

  /* PRIMERO se vacía y se llena el formulario, y DESPUÉS se piden los pools.
   * Al revés, quien abre la pantalla y empieza a escribir de inmediato pierde
   * lo que escribió cuando las listas llegan: la línea que vaciaba el campo
   * del archivo corría medio segundo tarde y se llevaba la foto. Lo cachó la
   * prueba de navegador, no una revisión. */
  $('monto').value = orden ? String((orden.monto / 100).toFixed(2)) : '';
  $('concepto').value = orden ? orden.concepto : '';
  $('proveedor-nuevo').value = orden && !orden.proveedor_id ? (orden.proveedor_nombre || '') : '';
  $('fecha').value = orden?.fecha_maxima_pago || '';
  $('fecha').min = hoy();
  $('urgente').checked = !!orden?.urgente;
  $('con-factura').checked = orden ? !!orden.con_factura : true;
  $('archivo').value = '';
  tocado = false;
  refrescarIva();

  // Los pools: proveedores y proyectos. Si la API dice que no —una cuenta de
  // nómina sin permiso para verlos—, se sigue sin ellos: el nombre del
  // proveedor se escribe a mano y la compra queda como gasto general.
  const [pv, py] = await Promise.all([
    pedir(`/orgs/${est.org.id}/proveedores`).then((r) => r.filas || []).catch(() => []),
    est.negocio
      ? pedir(`/orgs/${est.org.id}/proyectos?negocio_id=${encodeURIComponent(est.negocio.id)}`).then((r) => r.filas || []).catch(() => [])
      : Promise.resolve([]),
  ]);
  est.proveedores = pv; est.proyectos = py;
  // Si entre tanto alguien ya escogió algo, se respeta.
  const provElegido = $('proveedor').value || orden?.proveedor_id || '';
  const proyElegido = $('proyecto').value || orden?.proyecto_id || '';
  $('proveedor').innerHTML = `<option value="">Otro (lo escribo)</option>` +
    pv.map((p) => `<option value="${p.id}">${escapar(p.nombre)}</option>`).join('');
  $('proyecto').innerHTML = `<option value="">Gasto general, no es de un proyecto</option>` +
    py.filter((p) => p.estado !== 'cerrado').map((p) => `<option value="${p.id}">${escapar(p.nombre)}</option>`).join('');
  $('proveedor').value = provElegido;
  $('proyecto').value = proyElegido;
  refrescarProveedor();
  await refrescarPartidas();
}

let tocado = false;  // ¿alguien editó el desglose a mano?

const refrescarProveedor = () => ver('proveedor-nuevo', !$('proveedor').value);
$('proveedor').onchange = refrescarProveedor;

function refrescarIva() {
  const con = $('con-factura').checked;
  ver('bloque-iva', con);
  if (!con || tocado) return;
  const d = desglosar(aCentavos($('monto').value));
  $('subtotal').value = d.subtotal ? (d.subtotal / 100).toFixed(2) : '';
  $('iva').value = d.iva ? (d.iva / 100).toFixed(2) : '';
  decir('err-iva', '');
}
$('monto').oninput = refrescarIva;
$('con-factura').onchange = refrescarIva;
$('subtotal').oninput = $('iva').oninput = () => { tocado = true; cuadra(); };

function cuadra() {
  if (!$('con-factura').checked || !tocado) { ver('err-iva', false); return true; }
  const ok = aCentavos($('subtotal').value) + aCentavos($('iva').value) === aCentavos($('monto').value);
  ver('err-iva', !ok);
  return ok;
}

/** Las partidas del proyecto: a cuál de los compromisos que ya existen va la
 *  compra. Son costos, así que sólo las ve quien puede ver costos; si la API
 *  contesta que no, el bloque no se enseña y la orden va sin partida. */
async function refrescarPartidas() {
  const proyecto = $('proyecto').value;
  if (!proyecto) { ver('bloque-partida', false); return; }
  try {
    const filas = (await pedir(`/orgs/${est.org.id}/partidas?proyecto_id=${encodeURIComponent(proyecto)}`)).filas || [];
    const abiertas = filas.filter((p) => p.estado !== 'pagado');
    $('partida').innerHTML = `<option value="">Es una partida nueva</option>` + abiertas.map((p) =>
      `<option value="${p.id}">${escapar(p.proveedor_nombre || 'sin proveedor')} · ${escapar(p.concepto || 'sin concepto')} · ${pesos(p.monto_acordado)}</option>`).join('');
    $('partida').value = est.corrigiendo?.partida_id || '';
    ver('bloque-partida', true);
  } catch { ver('bloque-partida', false); }
}
$('proyecto').onchange = refrescarPartidas;

$('f-pedir').onsubmit = async (ev) => {
  ev.preventDefault();
  decir('err-pedir', '');
  if (!cuadra()) return decir('err-pedir', 'El subtotal más el IVA tiene que dar el total exacto.');
  if (aCentavos($('monto').value) <= 0) return decir('err-pedir', 'Escribe cuánto es.');
  const b = $('b-pedir'); const antes = b.textContent; b.disabled = true; b.textContent = 'Mandando…';

  const cuerpo = {
    negocio_id: est.negocio?.id,
    proveedor_id: $('proveedor').value || null,
    proveedor_nombre: $('proveedor').value
      ? (est.proveedores.find((p) => p.id === $('proveedor').value)?.nombre || null)
      : ($('proveedor-nuevo').value.trim() || null),
    proyecto_id: $('proyecto').value || null,
    partida_id: $('partida').value || null,
    concepto: $('concepto').value.trim(),
    monto: aCentavos($('monto').value),
    con_factura: $('con-factura').checked,
    fecha_maxima_pago: $('fecha').value || null,
    urgente: $('urgente').checked,
  };
  // El desglose sólo viaja si alguien lo tocó. Si no, lo calcula el servidor:
  // así la fórmula existe una sola vez en toda la plataforma.
  if ($('con-factura').checked && tocado) {
    cuerpo.subtotal = aCentavos($('subtotal').value);
    cuerpo.iva = aCentavos($('iva').value);
  }

  try {
    let orden;
    if (est.corrigiendo) {
      orden = await pedir(`/orgs/${est.org.id}/ordenes/${est.corrigiendo.id}`, { method: 'PATCH', body: cuerpo });
    } else {
      orden = await pedir(`/orgs/${est.org.id}/ordenes`, { method: 'POST', body: cuerpo });
      const f = $('archivo').files?.[0];
      if (f) {
        const forma = new FormData();
        forma.set('archivo', f);
        forma.set('de_tabla', 'ordenes');
        forma.set('de_id', orden.id);
        try {
          await pedir(`/orgs/${est.org.id}/archivos`, { method: 'POST', form: forma });
        } catch (e) {
          // La compra ya quedó pedida, que es lo que importa. Se dice qué pasó
          // con la foto en vez de fingir que subió.
          location.hash = `#/orden/${orden.id}`;
          decir('err-lista', `La compra quedó pedida, pero la cotización no subió: ${enPalabras(e)}`);
          return;
        }
      }
    }
    est.corrigiendo = null;
    location.hash = `#/orden/${orden.id}`;
  } catch (e) {
    decir('err-pedir', enPalabras(e));
  } finally { b.disabled = false; b.textContent = antes; }
};

/* ─────────────── una compra ─────────────── */

const QUE = {
  creada: 'La pediste', devuelta: 'Te la devolvieron', corregida: 'La corregiste',
  pagada: 'La pagaron', rechazada: 'La rechazaron', contador: 'Cambió quién puede pagar',
};

async function verDetalle(id) {
  mostrar('v-detalle');
  $('detalle').innerHTML = '<p class="vacio">Cargando…</p>';
  let r;
  try {
    r = await pedir(`/orgs/${est.org.id}/ordenes/${id}`);
  } catch (e) {
    $('detalle').innerHTML = `<p class="aviso mal">${escapar(enPalabras(e))}</p>`;
    return;
  }
  const o = r.orden;
  const e = ESTADO[o.estado] || { texto: o.estado, clase: 'marca gris' };
  const cotizaciones = (r.archivos || []).filter((a) => a.de !== 'pago');
  const comprobantes = (r.archivos || []).filter((a) => a.de === 'pago');

  const papel = (a) => a.mime && a.mime.startsWith('image/')
    ? `<a class="papel" href="/s101/orgs/${est.org.id}/archivos/${a.id}" target="_blank" rel="noreferrer">
         <img src="/s101/orgs/${est.org.id}/archivos/${a.id}" alt="${escapar(a.nombre)}"></a>`
    : `<a class="papel" href="/s101/orgs/${est.org.id}/archivos/${a.id}" target="_blank" rel="noreferrer">
         <span class="pdf">📄 ${escapar(a.nombre)}</span></a>`;

  $('detalle').innerHTML = `
    <h1>${escapar(o.concepto)}</h1>
    <p class="sub">${escapar(o.folio)} · ${escapar(o.proveedor_nombre || 'sin proveedor')}</p>
    <p><span class="${e.clase}">${e.texto}</span>${o.urgente ? ' <span class="marca pend">Urgente</span>' : ''}</p>

    <div class="tarjeta" style="margin-top:12px">
      <dl class="datos">
        <div><dt>Cuánto</dt><dd><b>${pesos(o.monto, o.moneda)}</b></dd></div>
        ${o.con_factura ? `<div><dt>Subtotal e IVA</dt><dd>${pesos(o.subtotal, o.moneda)} + ${pesos(o.iva, o.moneda)}</dd></div>` : ''}
        <div><dt>${o.estado === 'pagada' ? 'Se pagó el' : 'Se tiene que pagar'}</dt><dd>${
          o.estado === 'pagada' ? escapar(String(o.pagada_at || '').slice(0, 10)) : escapar(o.fecha_maxima_pago || 'sin fecha')}</dd></div>
        <div><dt>Con factura</dt><dd>${o.con_factura ? 'sí' : 'no'}</dd></div>
      </dl>
    </div>

    ${o.nota_contador ? `<p class="aviso ${o.estado === 'rechazada' ? 'mal' : 'gris'}">
      <b>Quien paga dice:</b> «${escapar(o.nota_contador)}»</p>` : ''}

    ${o.estado === 'devuelta' ? `<button class="b" id="b-corregir" type="button">Corregirla y volver a mandarla</button>` : ''}

    ${comprobantes.length ? `<h2>El comprobante del pago</h2>
      <p class="sub">Con esto le reclamas al proveedor si dice que no le llegó.</p>
      ${comprobantes.map(papel).join('')}` : ''}

    ${cotizaciones.length ? `<h2>La cotización</h2>${cotizaciones.map(papel).join('')}` : ''}

    <h2>Su historia</h2>
    <ol class="historia">${(r.eventos || []).map((ev) => `<li>
      ${escapar(QUE[ev.que] || ev.que)}
      <small>${escapar(ev.quien_nombre || 'alguien')} · ${escapar(String(ev.ts || '').slice(0, 16).replace('T', ' '))}</small>
      ${ev.nota ? `<small>«${escapar(ev.nota)}»</small>` : ''}
    </li>`).join('')}</ol>`;

  const bc = $('b-corregir');
  if (bc) bc.onclick = () => verPedir(o);
}

/* ─────────────── las direcciones ─────────────── */

function enrutar() {
  if (!est.org) return;
  const h = location.hash || '#/';
  const m = /^#\/orden\/(.+)$/.exec(h);
  if (m) return verDetalle(m[1]);
  if (h === '#/pedir') return verPedir(null);
  return verLista();
}
window.addEventListener('hashchange', enrutar);

/* ─────────────── el primer segundo ─────────────── */

(async () => {
  // Google devuelve con un boleto de un solo uso: se canjea por la galleta y
  // se borra de la dirección, para que no quede en el historial del teléfono.
  const u = new URL(location.href);
  const entrada = u.searchParams.get('entrada');
  if (entrada) {
    try { await pedir('/auth/canje', { method: 'POST', body: { entrada } }); } catch { /* boleto vencido */ }
    u.searchParams.delete('entrada');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
  try {
    await pedir('/yo');
    await arrancarSesion();
  } catch {
    mostrar('v-correo');
    $('correo').focus();
  }
})();
