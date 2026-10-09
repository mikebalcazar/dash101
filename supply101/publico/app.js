/* supply101 — pedir una compra o un reembolso, y darle seguimiento.
 *
 * Tres cosas, y ninguna más, porque así lo encargó Mike el 20-sep: pedir una
 * compra, ver si ya se pagó, y abrir el comprobante para reclamarle al
 * proveedor. **Pagar no está aquí**: eso vive en dash101, con las cuentas.
 *
 * Desde el 28-sep (contrato 0.47.0) también se pide un REEMBOLSO: el mismo
 * formulario con un selector arriba, porque Mike lo pidió así: «podría ser
 * el mismo portal de supply, pero poner una opción en el tipo de orden si es
 * reembolso o compra». Quien no tiene la llave de compras entra de todos
 * modos, ve «tu usuario no está autorizado para compras» y sólo puede pedir
 * reembolsos; eso lo decide el servidor (`/ordenes/permisos`) y aquí nada
 * más se apaga la opción.
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

import { irA, sellar } from './navegar.js';
import { achicarImagen } from './imagen.js';

/* ─────────────── lo básico ─────────────── */

/* Qué tan hondo está cada dirección. Sirve para decidir si moverse APILA una
 * entrada del historial, la REEMPLAZA o RETROCEDE; el detalle está en
 * `navegar.js`. Pedir y una orden están al mismo nivel a propósito: mandar la
 * compra reemplaza el formulario en vez de dejarlo esperando atrás, para que
 * «atrás» no lo devuelva lleno de una compra ya pedida. */
const HONDURA = { lista: 1, pedir: 2, orden: 2, corregir: 3 };

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
  orden_no_esta_devuelta: 'Esta orden ya no se puede corregir: cambió de estado.',
  orden_no_se_puede_cancelar: 'Esta orden ya no se puede cancelar: cambió de estado.',
  compras_no_autorizadas: 'Tu usuario no está autorizado para compras. Puedes pedir un reembolso.',
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
  /* 9-oct-2026 · la canceló quien la pidió: ya no se va a pagar. Apagada a
   * propósito, para que no compita con lo que todavía está vivo. */
  cancelada: { texto: 'Cancelada', clase: 'marca apagada' },
};
const ORDEN_LISTA = { devuelta: 0, en_buzon: 1, pagada: 2, rechazada: 3, cancelada: 4 };
/** Se cancela mientras nadie la ha pagado ni rechazado (contrato 0.86.0). */
const SE_CANCELA = ['en_buzon', 'devuelta'];

/* ─────────────── el estado de la app ─────────────── */

const est = {
  yo: null,
  org: null,          // la empresa
  proveedores: [],
  proyectos: [],
  corrigiendo: null,  // la orden que se está corrigiendo, si es que
  orden: null,        // la última orden abierta, para no volver a pedirla
  puedeComprar: true, // lo dice el servidor; sin respuesta, se asume que sí
  tipo: 'compra',     // lo que se está pidiendo: compra o reembolso
};
const TIPO = { compra: 'Compra', reembolso: 'Reembolso' };
const LLAVE_ORG = 'supply101:org';
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

/** Pide el código y enseña la pantalla donde se teclea. Se llama desde
 *  «Olvidé mi contraseña» y desde «Volver a mandar el código»: si el correo
 *  no llega —pasa—, tiene que haber manera de pedir otro sin empezar de
 *  cero. La API pide esperar unos segundos entre uno y otro, y eso se dice
 *  con sus palabras en vez de dejar el botón mudo. */
async function mandarCodigo() {
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
}
$('b-olvide').onclick = mandarCodigo;
$('b-reenviar').onclick = mandarCodigo;

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

  // Quién puede comprar lo dice el servidor. Si no contesta, se deja la
  // opción prendida: el servidor lo vuelve a decir al mandar.
  try {
    const p = await pedir(`/orgs/${est.org.id}/ordenes/permisos`);
    est.puedeComprar = p.puede_comprar !== false;
  } catch { est.puedeComprar = true; }
  ver('b-nueva-compra', est.puedeComprar);
  ver('sin-compras', !est.puedeComprar);

  /* La empresa es una (Mike, 1-oct-2026): la API cuelga sola cada orden de
   * ella. Aquí no se lista, no se escoge ni se recuerda nada. */
  enrutar();
}

const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ─────────────── mis compras ─────────────── */

async function verLista() {
  mostrar('v-lista');
  decir('err-lista', '');
  $('lista-sub').textContent = 'Lo que has pedido, y en qué va cada una.';
  $('lista').innerHTML = '<p class="vacio">Cargando…</p>';
  try {
    const filas = (await pedir(`/orgs/${est.org.id}/ordenes`)).filas || [];
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
  const reembolso = o.tipo === 'reembolso';
  const aQuien = reembolso ? 'reembolso' : escapar(o.proveedor_nombre || 'sin proveedor');
  const vence = o.fecha_maxima_pago
    ? (o.estado === 'en_buzon' && o.fecha_maxima_pago < hoy()
        ? `venció el ${o.fecha_maxima_pago}` : `para el ${o.fecha_maxima_pago}`)
    : 'sin fecha';
  return `<a class="renglon" href="#/orden/${o.id}">
    <span class="texto">
      <b>${escapar(o.concepto)}</b>
      <small>${escapar(o.folio)} · ${aQuien} · ${vence}</small>
      <small style="margin-top:4px"><span class="${e.clase}">${e.texto}</span>${
        o.estado === 'devuelta' && o.nota_contador ? ` «${escapar(o.nota_contador)}»` : ''}</small>
    </span>
    <span class="plata">${pesos(o.monto, o.moneda)}${
      o.con_factura ? `<small>+ IVA ${pesos(o.iva, o.moneda)}</small>` : '<small>sin factura</small>'}</span>
  </a>`;
}

/* ─────────────── pedir una compra ─────────────── */

$('b-nueva-compra').onclick = () => irA('/pedir', HONDURA.pedir);
$('b-nuevo-reembolso').onclick = () => irA('/reembolso', HONDURA.pedir);
/* «← Mis compras» dice a dónde va, así que va hasta allá: desde el
 * formulario es un paso atrás y desde una corrección son dos. Y retrocede, no
 * apila: si escribiera una entrada nueva, el siguiente «atrás» reabriría la
 * pantalla que se acaba de cerrar. */
$('b-volver-1').onclick = $('b-volver-2').onclick = () => irA('/', HONDURA.lista);

/** Compra o reembolso: cambian las palabras, no los campos. Al corregir, el
 *  tipo es el de la orden y no se toca —corregir un reembolso no lo vuelve
 *  compra—. Sin llave de compras, la opción se apaga y se dice por qué. */
function ponerTipo(tipo, fijo) {
  if (tipo === 'compra' && !est.puedeComprar) tipo = 'reembolso';
  est.tipo = tipo;
  const re = tipo === 'reembolso';
  for (const b of document.querySelectorAll('#tipo .opcion')) {
    b.setAttribute('aria-checked', String(b.dataset.tipo === tipo));
    b.disabled = fijo ? b.dataset.tipo !== tipo : (b.dataset.tipo === 'compra' && !est.puedeComprar);
  }
  ver('pedir-sin-compras', !est.puedeComprar && !fijo);
  const corrigiendo = !!est.corrigiendo;
  $('pedir-t').textContent = corrigiendo ? `Corregir ${est.corrigiendo.folio}` : re ? 'Pedir un reembolso' : 'Pedir una compra';
  $('pedir-sub').textContent = corrigiendo
    ? 'Conserva el mismo folio y toda su historia: una orden corregida no es otra orden.'
    : re ? 'Ya pusiste el dinero y se te regresa. Le llega directo a quien paga.'
    : 'Le llega directo a quien paga. Nadie tiene que autorizarla antes.';
  $('b-pedir').textContent = corrigiendo ? 'Volver a mandarla' : re ? 'Pedir el reembolso' : 'Pedir la compra';
  $('monto-l').textContent = re ? 'Cuánto pagaste' : 'Cuánto es';
  $('concepto-l').textContent = re ? 'Qué compraste' : 'Qué se compra';
  $('concepto').placeholder = re ? 'Gasolina de la camioneta' : 'Triplay de 18 mm, 12 hojas';
  $('proveedor-l').textContent = re ? 'Dónde lo compraste (si quieres)' : 'A quién se le compra';
  $('archivo-l').textContent = re ? 'Foto o PDF del ticket o la factura' : 'Foto o PDF de la cotización';
}
for (const b of document.querySelectorAll('#tipo .opcion')) {
  b.onclick = () => { if (!b.disabled) ponerTipo(b.dataset.tipo, false); };
}

async function verPedir(orden, tipo = 'compra') {
  est.corrigiendo = orden || null;
  mostrar('v-pedir');
  decir('err-pedir', '');
  ponerTipo(orden ? (orden.tipo || 'compra') : tipo, !!orden);
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
  limpiarAltaProveedor();
  abrirAltaProveedor(false);

  // Los pools: proveedores y proyectos. Si la API dice que no —una cuenta de
  // nómina sin permiso para verlos—, se sigue sin ellos: el nombre del
  // proveedor se escribe a mano y la compra queda como gasto general.
  const [pv, py] = await Promise.all([
    pedir(`/orgs/${est.org.id}/proveedores`).then((r) => r.filas || []).catch(() => []),
    pedir(`/orgs/${est.org.id}/proyectos`).then((r) => r.filas || []).catch(() => []),
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

const refrescarProveedor = () => {
  ver('proveedor-nuevo', !$('proveedor').value);
  ver('b-ficha-proveedor', !!$('proveedor').value && $('ficha-proveedor').classList.contains('oculto'));
  if (!$('proveedor').value) ver('ficha-proveedor', false);
};
$('proveedor').onchange = () => { ver('ficha-proveedor', false); refrescarProveedor(); };

/* ─────────────── alta de proveedor ───────────────
 * Mike, 29-sep-2026: «poner la opción de dar de alta a un nuevo proveedor, y
 * dentro de los datos deben poder agregar: nombre, RFC, número de cuenta
 * (CLABE y banco y beneficiario), email de contacto, teléfono de contacto,
 * ubicación (si se puede guardar una ubicación de Google Maps)».
 * Se guarda por el CRUD genérico de la API (POST /orgs/:o/proveedores); la
 * API revisa CLABE, RFC y correo y contesta 400 con `errores` por campo. La
 * ubicación es la liga que Google Maps comparte, o la de donde está parado
 * quien lo da de alta («📍 Aquí» → https://www.google.com/maps?q=lat,lng). */
const PV_CAMPOS = ['nombre', 'rfc', 'correo', 'telefono', 'direccion', 'maps'];

/* ─────────────── las cuentas del alta ───────────────
 * Mike, 30-sep-2026: «que se puedan registrar más de una cuenta bancaria
 * con un ALIAS para identificarla». Cada cuenta es una fila de
 * proveedor_cuentas en la API (contrato 0.55.0); aquí son tarjetitas con
 * alias, CLABE, banco y beneficiario. La primera se llama «Principal» de
 * fábrica; las vacías no se mandan. */
let pvCreado = null;   // el proveedor ya quedó creado y falló algo después: no se vuelve a crear
function filaCuenta(n, datos = {}) {
  const d = document.createElement('div');
  d.className = 'pv-cuenta';
  d.dataset.n = String(n);
  d.innerHTML = `
    <button type="button" class="quitar" title="Quitar esta cuenta" aria-label="Quitar esta cuenta">×</button>
    <div class="fila">
      <input class="c-alias" placeholder="Alias (Principal, Nómina…)" value="${escapar(datos.alias ?? (n === 0 ? 'Principal' : ''))}">
      <input class="c-clabe" inputmode="numeric" maxlength="24" placeholder="CLABE, 18 dígitos" value="${escapar(datos.clabe ?? '')}">
    </div>
    <div class="fila">
      <input class="c-banco" placeholder="Banco" value="${escapar(datos.banco ?? '')}">
      <input class="c-beneficiario" placeholder="Beneficiario" value="${escapar(datos.beneficiario ?? '')}">
    </div>`;
  d.querySelector('.quitar').onclick = () => { d.remove(); if (!$('pv-cuentas').children.length) $('pv-cuentas').appendChild(filaCuenta(0)); };
  return d;
}
function pintarCuentasAlta() {
  $('pv-cuentas').innerHTML = '';
  $('pv-cuentas').appendChild(filaCuenta(0));
}
$('pv-otra-cuenta').onclick = () => {
  const n = $('pv-cuentas').children.length;
  $('pv-cuentas').appendChild(filaCuenta(n));
  $('pv-cuentas').lastElementChild.querySelector('.c-alias').focus();
};
/** Las cuentas escritas en el alta, sin las vacías. */
function cuentasDelAlta() {
  return [...$('pv-cuentas').querySelectorAll('.pv-cuenta')].map((d) => ({
    el: d,
    alias: d.querySelector('.c-alias').value.trim(),
    clabe: d.querySelector('.c-clabe').value.replace(/[\s-]/g, ''),
    banco: d.querySelector('.c-banco').value.trim(),
    beneficiario: d.querySelector('.c-beneficiario').value.trim(),
  })).filter((c) => c.clabe || c.banco || c.beneficiario);
}
/* Los documentos escogidos en el alta se enseñan por nombre; se suben al
 * guardar, colgados del proveedor (archivos, de_tabla = 'proveedores'). Las
 * fotos se achican antes, como el ticket; un PDF va tal cual. */
function pintarDocsAlta() {
  const fs = [...($('pv-docs').files || [])];
  $('pv-docs-lista').innerHTML = fs.map((f) => `<li><span>${escapar(f.name)}</span><span class="pista">${(f.size / 1024).toFixed(0)} KB</span></li>`).join('');
}
$('pv-docs').onchange = pintarDocsAlta;
async function subirDocumento(proveedorId, f) {
  const forma = new FormData();
  forma.set('archivo', /^image\//.test(f.type) ? await achicarImagen(f) : f, f.name);
  forma.set('de_tabla', 'proveedores');
  forma.set('de_id', proveedorId);
  return pedir(`/orgs/${est.org.id}/archivos`, { method: 'POST', form: forma });
}
function abrirAltaProveedor(abrir) {
  ver('alta-proveedor', abrir);
  ver('b-alta-proveedor', !abrir);
  $('err-proveedor').classList.add('oculto');
  if (abrir && !$('pv-cuentas').children.length) pintarCuentasAlta();
  if (abrir) {
    ver('ficha-proveedor', false);
    // Si ya había escrito un nombre en «Otro», se aprovecha.
    if (!$('pv-nombre').value && !$('proveedor').value) $('pv-nombre').value = $('proveedor-nuevo').value.trim();
    refrescarMapsVer();
    $('pv-nombre').focus();
  }
}
function limpiarAltaProveedor() {
  for (const c of PV_CAMPOS) $('pv-' + c).value = '';
  $('pv-tipo').value = 'materiales';
  for (const el of document.querySelectorAll('#alta-proveedor .campo-mal')) el.classList.remove('campo-mal');
  pintarCuentasAlta();
  $('pv-docs').value = '';
  pintarDocsAlta();
  pvCreado = null;
  refrescarMapsVer();
}
function refrescarMapsVer() {
  const u = $('pv-maps').value.trim();
  const a = $('pv-maps-ver');
  a.href = u || '#';
  ver('pv-maps-ver', /^https:\/\//i.test(u));
}
$('pv-maps').oninput = refrescarMapsVer;
$('b-alta-proveedor').onclick = () => abrirAltaProveedor(true);
$('pv-cancelar').onclick = () => abrirAltaProveedor(false);
$('pv-aqui').onclick = () => {
  if (!navigator.geolocation) return decir('err-proveedor', 'Este navegador no da la ubicación. Pega la liga de Google Maps.');
  const b = $('pv-aqui'); b.disabled = true; b.textContent = 'Buscando…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      $('pv-maps').value = `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
      refrescarMapsVer();
      b.disabled = false; b.textContent = '📍 Aquí';
    },
    () => {
      decir('err-proveedor', 'No se pudo tomar la ubicación. Pega la liga de Google Maps.');
      b.disabled = false; b.textContent = '📍 Aquí';
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  );
};
$('pv-guardar').onclick = async () => {
  $('err-proveedor').classList.add('oculto');
  for (const el of document.querySelectorAll('#alta-proveedor .campo-mal')) el.classList.remove('campo-mal');
  const nombre = $('pv-nombre').value.trim();
  if (!nombre) { $('pv-nombre').classList.add('campo-mal'); $('pv-nombre').focus(); return decir('err-proveedor', 'Escribe el nombre del proveedor.'); }
  const cuerpo = {
    nombre,
    tipo: $('pv-tipo').value === 'servicios' ? 'servicios' : 'materiales',
    rfc: $('pv-rfc').value.trim().toUpperCase(),
    correo: $('pv-correo').value.trim(),
    telefono: $('pv-telefono').value.trim(),
    direccion: $('pv-direccion').value.trim(),
    maps_url: $('pv-maps').value.trim(),
  };
  const cuentas = cuentasDelAlta();
  for (const c of cuentas) {
    if (!c.alias) { c.el.querySelector('.c-alias').classList.add('campo-mal'); return decir('err-proveedor', 'Ponle un alias a cada cuenta para saber cuál es.'); }
    if (!c.clabe) { c.el.querySelector('.c-clabe').classList.add('campo-mal'); return decir('err-proveedor', `La cuenta «${c.alias}» no trae CLABE.`); }
  }
  const b = $('pv-guardar'); const antes = b.textContent; b.disabled = true; b.textContent = 'Guardando…';
  try {
    /* Tres pasos, en orden: el proveedor, sus cuentas, sus documentos. Si el
     * proveedor ya quedó y falló una cuenta, al reintentar no se crea otro:
     * se recuerda en `pvCreado` y se sigue desde las cuentas. */
    const p = pvCreado || await pedir(`/orgs/${est.org.id}/proveedores`, { method: 'POST', body: cuerpo });
    pvCreado = p;
    for (const c of cuentas) {
      if (c.el.dataset.guardada) continue;
      try {
        await pedir(`/orgs/${est.org.id}/proveedor_cuentas`, { method: 'POST', body: { proveedor_id: p.id, alias: c.alias, clabe: c.clabe, banco: c.banco, beneficiario: c.beneficiario } });
        c.el.dataset.guardada = '1';
      } catch (e) {
        const errores = (e && e.detalle && e.detalle.errores) || {};
        for (const k of Object.keys(errores)) { const el = c.el.querySelector('.c-' + k); if (el) el.classList.add('campo-mal'); }
        throw Object.assign(new Error(`Cuenta «${c.alias}»: ${Object.values(errores).join(' ') || 'no se pudo guardar.'}`), { dicho: true });
      }
    }
    const docs = [...($('pv-docs').files || [])];
    const noSubidos = [];
    for (const f of docs) { try { await subirDocumento(p.id, f); } catch { noSubidos.push(f.name); } }
    est.proveedores = [...est.proveedores.filter((q) => q.id !== p.id), p].sort((x, y) => (x.nombre_norm || x.nombre).localeCompare(y.nombre_norm || y.nombre));
    $('proveedor').innerHTML = `<option value="">Otro (lo escribo)</option>` +
      est.proveedores.map((q) => `<option value="${q.id}">${escapar(q.nombre)}</option>`).join('');
    $('proveedor').value = p.id;
    $('proveedor-nuevo').value = '';
    refrescarProveedor();
    limpiarAltaProveedor();
    abrirAltaProveedor(false);
    const conQue = [cuentas.length ? `${cuentas.length} cuenta${cuentas.length === 1 ? '' : 's'}` : '', docs.length - noSubidos.length ? `${docs.length - noSubidos.length} documento${docs.length - noSubidos.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' y ');
    decir('err-pedir', `Proveedor «${p.nombre}» dado de alta${conQue ? ` con ${conQue}` : ''}. Ya está escogido para esta compra.${noSubidos.length ? ` No se pudo subir: ${noSubidos.join(', ')}; inténtalo desde su ficha.` : ''}`, noSubidos.length ? 'mal' : 'bien');
  } catch (e) {
    if (e && e.dicho) return decir('err-proveedor', e.message);
    const errores = (e && e.detalle && e.detalle.errores) || {};
    const campos = Object.keys(errores);
    for (const k of campos) { const el = $('pv-' + (k === 'maps_url' ? 'maps' : k)); if (el) el.classList.add('campo-mal'); }
    decir('err-proveedor', campos.length ? campos.map((k) => errores[k]).join(' ') : (e && e.error === 'sin_permiso' ? 'Tu usuario no puede dar de alta proveedores.' : 'No se pudo guardar el proveedor. Intenta otra vez.'));
  } finally { b.disabled = false; b.textContent = antes; }
};

/* ─────────────── la ficha del proveedor ───────────────
 * Un proveedor que ya existe también necesita cuentas y documentos (los de
 * ayer nacieron con una cuenta en columnas, o sin ninguna). Al escoger uno
 * en «A quién se le compra» aparece «Ver la ficha»: sus datos, sus cuentas
 * (se agregan y se quitan) y sus documentos (se suben y se quitan). Vive
 * dentro de «Pedir», como el alta, para no salir del formulario a medias. */
const fmtClabe = (c) => String(c || '').replace(/(\d{3})(\d{3})(\d{11})(\d)/, '$1 $2 $3 $4');
async function abrirFicha(abrir) {
  ver('ficha-proveedor', abrir);
  ver('b-ficha-proveedor', !abrir && !!$('proveedor').value);
  if (!abrir) return;
  const p = est.proveedores.find((q) => q.id === $('proveedor').value);
  if (!p) return abrirFicha(false);
  $('fc-nombre').textContent = p.nombre;
  $('fc-datos').textContent = [p.rfc, p.correo, p.telefono, p.direccion].filter(Boolean).join(' · ') || 'Sin más datos.';
  $('fc-maps').href = p.maps_url || '#';
  ver('fc-maps', /^https:\/\//i.test(p.maps_url || ''));
  decir('err-ficha', '');
  for (const id of ['fc-alias', 'fc-clabe', 'fc-banco', 'fc-beneficiario']) { $(id).value = ''; $(id).classList.remove('campo-mal'); }
  $('fc-docs').value = '';
  await pintarFicha(p.id);
}
async function pintarFicha(pid) {
  const [cuentas, docs] = await Promise.all([
    pedir(`/orgs/${est.org.id}/proveedor_cuentas?proveedor_id=${encodeURIComponent(pid)}`).then((r) => r.filas || []).catch(() => []),
    pedir(`/orgs/${est.org.id}/archivos?de_tabla=proveedores&de_id=${encodeURIComponent(pid)}`).then((r) => r.filas || []).catch(() => []),
  ]);
  $('fc-cuentas').innerHTML = cuentas.length
    ? cuentas.map((c) => `<li data-cuenta="${escapar(c.id)}"><span><b>${escapar(c.alias)}</b>${c.banco ? ` · ${escapar(c.banco)}` : ''}<br><span class="clabe">${escapar(fmtClabe(c.clabe))}</span>${c.beneficiario ? `<br>${escapar(c.beneficiario)}` : ''}</span><button type="button" class="quitar" data-quitar-cuenta="${escapar(c.id)}" title="Quitar esta cuenta" aria-label="Quitar esta cuenta">×</button></li>`).join('')
    : '<li><span class="pista">Sin cuentas todavía.</span></li>';
  $('fc-docs-lista').innerHTML = docs.length
    ? docs.map((d) => `<li data-doc="${escapar(d.id)}"><a href="/s101/orgs/${est.org.id}/archivos/${escapar(d.id)}" target="_blank" rel="noreferrer">${escapar(d.nombre)}</a><button type="button" class="quitar" data-quitar-doc="${escapar(d.id)}" title="Quitar este documento" aria-label="Quitar este documento">×</button></li>`).join('')
    : '<li><span class="pista">Sin documentos todavía.</span></li>';
  for (const b of $('fc-cuentas').querySelectorAll('[data-quitar-cuenta]')) b.onclick = () => quitarDeFicha('proveedor_cuentas', b.dataset.quitarCuenta, pid, '¿Quitar esta cuenta del proveedor?');
  for (const b of $('fc-docs-lista').querySelectorAll('[data-quitar-doc]')) b.onclick = () => quitarDeFicha('archivos', b.dataset.quitarDoc, pid, '¿Quitar este documento?');
}
async function quitarDeFicha(tabla, id, pid, pregunta) {
  if (!confirm(pregunta)) return;
  try { await pedir(`/orgs/${est.org.id}/${tabla}/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  catch { decir('err-ficha', 'No se pudo quitar. Intenta otra vez.'); }
  await pintarFicha(pid);
}
$('b-ficha-proveedor').onclick = () => abrirFicha(true);
$('fc-cerrar').onclick = () => abrirFicha(false);
$('fc-agregar').onclick = async () => {
  const pid = $('proveedor').value;
  if (!pid) return;
  for (const id of ['fc-alias', 'fc-clabe', 'fc-banco', 'fc-beneficiario']) $(id).classList.remove('campo-mal');
  decir('err-ficha', '');
  const alias = $('fc-alias').value.trim();
  const clabe = $('fc-clabe').value.replace(/[\s-]/g, '');
  if (!alias) { $('fc-alias').classList.add('campo-mal'); return decir('err-ficha', 'Ponle un alias a la cuenta.'); }
  if (!clabe) { $('fc-clabe').classList.add('campo-mal'); return decir('err-ficha', 'Escribe la CLABE.'); }
  const b = $('fc-agregar'); b.disabled = true;
  try {
    await pedir(`/orgs/${est.org.id}/proveedor_cuentas`, { method: 'POST', body: { proveedor_id: pid, alias, clabe, banco: $('fc-banco').value.trim(), beneficiario: $('fc-beneficiario').value.trim() } });
    for (const id of ['fc-alias', 'fc-clabe', 'fc-banco', 'fc-beneficiario']) $(id).value = '';
    await pintarFicha(pid);
  } catch (e) {
    const errores = (e && e.detalle && e.detalle.errores) || {};
    for (const k of Object.keys(errores)) { const el = $('fc-' + k); if (el) el.classList.add('campo-mal'); }
    decir('err-ficha', Object.values(errores).join(' ') || (e && e.error === 'sin_permiso' ? 'Tu usuario no puede agregar cuentas.' : 'No se pudo guardar la cuenta.'));
  } finally { b.disabled = false; }
};
$('fc-docs').onchange = async () => {
  const pid = $('proveedor').value;
  const fs = [...($('fc-docs').files || [])];
  if (!pid || !fs.length) return;
  decir('err-ficha', '');
  const noSubidos = [];
  for (const f of fs) { try { await subirDocumento(pid, f); } catch { noSubidos.push(f.name); } }
  $('fc-docs').value = '';
  if (noSubidos.length) decir('err-ficha', `No se pudo subir: ${noSubidos.join(', ')}.`);
  await pintarFicha(pid);
};

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
    tipo: est.tipo,
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
        // Una foto de cámara pesa de 3 a 12 MB; a 1600 de lado se lee igual
        // y sube en segundos con datos móviles (batería, 29-sep-2026).
        forma.set('archivo', await achicarImagen(f));
        forma.set('de_tabla', 'ordenes');
        forma.set('de_id', orden.id);
        try {
          await pedir(`/orgs/${est.org.id}/archivos`, { method: 'POST', form: forma });
        } catch (e) {
          // La compra ya quedó pedida, que es lo que importa. Se dice qué pasó
          // con la foto en vez de fingir que subió.
          irA(`/orden/${orden.id}`, HONDURA.orden);
          decir('err-lista', est.tipo === 'reembolso'
            ? `El reembolso quedó pedido, pero el ticket no subió: ${enPalabras(e)}`
            : `La compra quedó pedida, pero la cotización no subió: ${enPalabras(e)}`);
          return;
        }
      }
    }
    est.corrigiendo = null;
    irA(`/orden/${orden.id}`, HONDURA.orden);
  } catch (e) {
    decir('err-pedir', enPalabras(e));
  } finally { b.disabled = false; b.textContent = antes; }
};

/* ─────────────── una compra ─────────────── */

const QUE = {
  creada: 'La pediste', devuelta: 'Te la devolvieron', corregida: 'La corregiste',
  pagada: 'La pagaron', rechazada: 'La rechazaron', contador: 'Cambió quién puede pagar',
  cancelada: 'La cancelaste',
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
  est.orden = o;
  const e = ESTADO[o.estado] || { texto: o.estado, clase: 'marca gris' };
  const reembolso = o.tipo === 'reembolso';
  /* Cancelar es de quien la pidió (el servidor lo vuelve a revisar: 403
   * solo_quien_la_pidio). Quien paga también abre la orden aquí, y a ése no
   * se le ofrece. */
  const yo = est.yo?.usuario?.id;
  const puedeCancelar = SE_CANCELA.includes(o.estado) && !!yo && String(o.solicitante_usuario_id) === String(yo);
  const cotizaciones = (r.archivos || []).filter((a) => a.de !== 'pago');
  const comprobantes = (r.archivos || []).filter((a) => a.de === 'pago');

  const papel = (a) => a.mime && a.mime.startsWith('image/')
    ? `<a class="papel" href="/s101/orgs/${est.org.id}/archivos/${a.id}" target="_blank" rel="noreferrer">
         <img src="/s101/orgs/${est.org.id}/archivos/${a.id}" alt="${escapar(a.nombre)}" loading="lazy" decoding="async"></a>`
    : `<a class="papel" href="/s101/orgs/${est.org.id}/archivos/${a.id}" target="_blank" rel="noreferrer">
         <span class="pdf">📄 ${escapar(a.nombre)}</span></a>`;

  $('detalle').innerHTML = `
    <h1>${escapar(o.concepto)}</h1>
    <p class="sub">${escapar(o.folio)}${reembolso ? ' · reembolso' : ''}${
      o.proveedor_nombre ? ` · ${escapar(o.proveedor_nombre)}` : reembolso ? '' : ' · sin proveedor'}</p>
    <p><span class="${e.clase}">${e.texto}</span>${reembolso ? ` <span class="marca gris">${TIPO.reembolso}</span>` : ''}${
      o.urgente ? ' <span class="marca pend">Urgente</span>' : ''}</p>

    <div class="tarjeta" style="margin-top:12px">
      <dl class="datos">
        <div><dt>${reembolso ? 'Cuánto se te regresa' : 'Cuánto'}</dt><dd><b>${pesos(o.monto, o.moneda)}</b></dd></div>
        ${o.con_factura ? `<div><dt>Subtotal e IVA</dt><dd>${pesos(o.subtotal, o.moneda)} + ${pesos(o.iva, o.moneda)}</dd></div>` : ''}
        <div><dt>${o.estado === 'pagada' ? 'Se pagó el' : o.estado === 'cancelada' ? 'Se canceló el' : 'Se tiene que pagar'}</dt><dd>${
          o.estado === 'pagada' ? escapar(String(o.pagada_at || '').slice(0, 10))
            : o.estado === 'cancelada' ? escapar(String(o.actualizado_at || '').slice(0, 10))
              : escapar(o.fecha_maxima_pago || 'sin fecha')}</dd></div>
        <div><dt>Con factura</dt><dd>${o.con_factura ? 'sí' : 'no'}</dd></div>
      </dl>
    </div>

    ${o.nota_contador ? `<p class="aviso ${o.estado === 'rechazada' ? 'mal' : 'gris'}">
      <b>Quien paga dice:</b> «${escapar(o.nota_contador)}»</p>` : ''}

    ${o.estado === 'cancelada' ? `<p class="aviso gris" id="dice-cancelada">La cancelaste. Ya no se va a pagar.</p>` : ''}

    ${o.estado === 'devuelta' ? `<button class="b" id="b-corregir" type="button">Corregirla y volver a mandarla</button>` : ''}

    ${puedeCancelar ? `<button class="b claro cancelar" id="b-cancelar" type="button">Cancelar orden</button>
      <div class="tarjeta confirma oculto" id="confirma-cancelar" role="group" aria-labelledby="confirma-t">
        <p id="confirma-t"><b>¿Cancelar ${escapar(o.folio)}?</b> Ya no se va a pagar.</p>
        <label for="cancelar-nota">Por qué (opcional)</label>
        <textarea id="cancelar-nota" rows="2" maxlength="500" placeholder="Ya no hace falta, se consiguió por otro lado…"></textarea>
        <p class="aviso mal oculto" id="err-cancelar"></p>
        <div class="fila">
          <button class="b peligro" id="b-si-cancelar" type="button">Sí, cancelarla</button>
          <button class="b claro" id="b-no-cancelar" type="button">No</button>
        </div>
      </div>` : ''}

    ${comprobantes.length ? `<h2>El comprobante del pago</h2>
      <p class="sub">${reembolso ? 'Con esto sabes de dónde y cuándo te lo regresaron.' : 'Con esto le reclamas al proveedor si dice que no le llegó.'}</p>
      ${comprobantes.map(papel).join('')}` : ''}

    ${cotizaciones.length ? `<h2>${reembolso ? 'El ticket' : 'La cotización'}</h2>${cotizaciones.map(papel).join('')}` : ''}

    <h2>Su historia</h2>
    <ol class="historia">${(r.eventos || []).map((ev) => `<li>
      ${escapar(QUE[ev.que] || ev.que)}
      <small>${escapar(ev.quien_nombre || 'alguien')} · ${escapar(String(ev.ts || '').slice(0, 16).replace('T', ' '))}</small>
      ${ev.nota ? `<small>«${escapar(ev.nota)}»</small>` : ''}
    </li>`).join('')}</ol>`;

  const bc = $('b-corregir');
  /* Corregir es una dirección y no sólo un cambio de pantalla: si no, la
   * barra seguiría diciendo `#/orden/…` mientras se ve el formulario, y
   * «atrás» saltaría hasta la lista en vez de regresar a la orden. */
  if (bc) bc.onclick = () => { est.orden = o; irA(`/corregir/${o.id}`, HONDURA.corregir); };

  /* Cancelar (Mike, 9-oct-2026: «un botón para cancelar una orden que ya no
   * se necesita»). Se confirma aquí mismo, no con `window.confirm`: en el
   * teléfono ése sale con letra chica, sin decir qué folio, y no deja
   * escribir el porqué. Después la orden se vuelve a pintar ya cancelada. */
  const bx = $('b-cancelar');
  if (bx) {
    const caja = $('confirma-cancelar');
    bx.onclick = () => {
      ver('b-cancelar', false);
      ver('confirma-cancelar', true);
      decir('err-cancelar', '');
      caja.scrollIntoView({ block: 'nearest' });
    };
    $('b-no-cancelar').onclick = () => {
      ver('confirma-cancelar', false);
      ver('b-cancelar', true);
      $('cancelar-nota').value = '';
    };
    $('b-si-cancelar').onclick = async () => {
      const si = $('b-si-cancelar');
      const antes = si.textContent;
      si.disabled = true; $('b-no-cancelar').disabled = true;
      si.textContent = 'Cancelando…';
      decir('err-cancelar', '');
      try {
        const nota = $('cancelar-nota').value.trim();
        await pedir(`/orgs/${est.org.id}/ordenes/${o.id}/cancelar`, { method: 'POST', body: nota ? { nota } : {} });
        await verDetalle(o.id);
      } catch (e) {
        decir('err-cancelar', enPalabras(e));
        si.disabled = false; $('b-no-cancelar').disabled = false;
        si.textContent = antes;
      }
    };
  }
}

/* ─────────────── las direcciones ─────────────── */

function enrutar() {
  if (!est.org) return;
  const h = location.hash || '#/';
  /* Cada llegada sella su hondura, también las que no pasaron por `irA`: a
   * `#/orden/…` se entra picando una liga de la lista, que apila sola. */
  const mc = /^#\/corregir\/(.+)$/.exec(h);
  if (mc) { sellar(HONDURA.corregir); return verCorregir(mc[1]); }
  const m = /^#\/orden\/(.+)$/.exec(h);
  if (m) { sellar(HONDURA.orden); return verDetalle(m[1]); }
  if (h === '#/pedir') { sellar(HONDURA.pedir); return verPedir(null, 'compra'); }
  if (h === '#/reembolso') { sellar(HONDURA.pedir); return verPedir(null, 'reembolso'); }
  sellar(HONDURA.lista);
  return verLista();
}

/** Corregir una orden devuelta. Se llega picando el botón de la orden —y ahí
 *  ya la tenemos cargada— o recargando la página con esa dirección, y
 *  entonces hay que traerla. */
async function verCorregir(id) {
  if (est.orden?.id === id) return verPedir(est.orden);
  mostrar('v-cargando');
  try {
    est.orden = (await pedir(`/orgs/${est.org.id}/ordenes/${id}`)).orden;
    return verPedir(est.orden);
  } catch (e) {
    irA(`/orden/${id}`, HONDURA.orden);
    decir('err-lista', enPalabras(e));
  }
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
