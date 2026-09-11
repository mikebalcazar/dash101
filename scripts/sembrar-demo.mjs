/* Siembra la org `demo` en STAGING: «Familia Ramírez» y «Cocina Ramírez».
 *
 * Es la org de demostración de la decisión D6: capturas y pruebas van contra
 * ella, nunca contra `forespot`, que tiene dinero real de clientes reales. La
 * siembra dash101 porque el dinero es suyo (arranque §4, fase 3).
 *
 * Tres cosas que este guion garantiza:
 *
 *   1. **Nunca toca producción.** Antes de escribir pregunta `/salud` y, si
 *      `entorno` es `produccion`, para. No hay bandera para saltárselo.
 *   2. **Se puede correr las veces que haga falta.** Busca cada cosa por su
 *      nombre antes de crearla y sólo crea lo que falta; las etapas sólo
 *      avanzan hasta la que toca. Correrlo dos veces deja la org igual.
 *   3. **Todo es ficticio.** Nombres, correos (`@ejemplo.mx`, que no entrega)
 *      y cifras. Entra por la puerta normal de la API, con los permisos de
 *      cada app —dash101 para el dinero, quell101 para las etapas—, así que
 *      lo que siembra es lo que una app podría sembrar.
 *
 * Cómo entra: en staging `/auth/codigo` devuelve `codigo_prueba`, así que el
 * superadmin entra sin buzón. En producción no lo devuelve, y por eso además
 * de la guarda de arriba esto no podría correr allá aunque quisiera.
 *
 *   STAGING=https://suite101-api-staging.mike-929.workers.dev node scripts/sembrar-demo.mjs
 */

const STAGING = process.env.STAGING || 'https://suite101-api-staging.mike-929.workers.dev';
const CORREO = process.env.CORREO_SUPERADMIN || 'mike@forespot.com';
const ORG = 'demo';

/* La familia y su cocina. Dinero en centavos, como lo guarda la API. */
const DEMO = {
  negocio: { nombre: 'Taller Demo', moneda: 'MXN' },
  cuentas: [
    { nombre: 'Banco Demo', tipo: 'banco', banco: 'Banco Ficticio', saldo_inicial: 25000000 },
    { nombre: 'Caja chica', tipo: 'caja', saldo_inicial: 500000 },
  ],
  proveedores: [
    { nombre: 'Maderas del Sur', categoria: 'insumos', correo: 'ventas@maderas-del-sur.ejemplo.mx', terminos_pago: '30 días' },
    { nombre: 'Herrajes Aztecas', categoria: 'herrajes', correo: 'pedidos@herrajes-aztecas.ejemplo.mx' },
  ],
  cliente: { nombre: 'Familia Ramírez', correo: 'familia.ramirez@ejemplo.mx', telefono: '55 0000 0000', notas: 'Org de demostración. Todo es ficticio.' },
  /** El PIN del portal de la familia. Es de demostración: se publica a propósito. */
  pin: '480217',
  proyecto: { nombre: 'Cocina Ramírez', descripcion: 'Cocina integral en L con isla, para la casa de Coyoacán.', estado: 'activo', fecha_inicio: '2026-08-18' },
  items: [
    { nombre: 'Cocina integral en L', tipo: 'mueble', monto: 18500000, fecha_entrega: '2026-10-15', etapa: 4, notas: ['diseño firmado por la familia', 'anticipo en banco', 'tablero y chapa en taller', 'embalada y etiquetada'] },
    { nombre: 'Isla con cubierta de cuarzo', tipo: 'mueble', monto: 6200000, fecha_entrega: '2026-10-22', etapa: 2, notas: ['diseño firmado', 'anticipo en banco'] },
    { nombre: 'Instalación y ajuste en sitio', tipo: 'servicio', monto: 1500000, fecha_entrega: '2026-10-29', etapa: 0, notas: [] },
    { nombre: 'Visita de medición', tipo: 'visita', monto: 0, fecha_entrega: '2026-08-20', etapa: 7, notas: ['agendada', 'sin anticipo: cortesía', '—', '—', 'visita hecha', '—', 'la familia recibió el levantamiento'] },
  ],
  partidas: [
    { proveedor: 'Maderas del Sur', concepto: 'Tablero, chapa de encino y cantos', monto_acordado: 4200000 },
    { proveedor: 'Herrajes Aztecas', concepto: 'Bisagras, correderas y tiradores', monto_acordado: 850000 },
  ],
  movimientos: [
    { tipo: 'ingreso', monto: 12000000, fecha: '2026-08-21', cuenta: 'Banco Demo', contraparte_tipo: 'cliente', descripcion: 'Anticipo 50% cocina e isla', item: 'Cocina integral en L' },
    { tipo: 'ingreso', monto: 2000000, fecha: '2026-09-05', cuenta: 'Banco Demo', contraparte_tipo: 'cliente', descripcion: 'Segundo pago', item: 'Isla con cubierta de cuarzo' },
    { tipo: 'egreso', monto: 2500000, fecha: '2026-08-28', cuenta: 'Banco Demo', contraparte_tipo: 'proveedor', proveedor: 'Maderas del Sur', descripcion: 'Anticipo de tablero y chapa' },
    { tipo: 'egreso', monto: 850000, fecha: '2026-09-02', cuenta: 'Caja chica', contraparte_tipo: 'proveedor', proveedor: 'Herrajes Aztecas', descripcion: 'Herrajes completos' },
  ],
  opex: [
    { nombre: 'Renta del local', tipo: 'egreso', monto: 1800000, frecuencia: 'mensual', dia_del_mes: 5, fecha_inicio: '2026-01-05', cuenta: 'Banco Demo', categoria: 'renta' },
    { nombre: 'Luz del taller', tipo: 'egreso', monto: 320000, frecuencia: 'mensual', dia_del_mes: 20, fecha_inicio: '2026-01-20', cuenta: 'Banco Demo', categoria: 'servicios' },
  ],
};

let galleta = '';
let fallas = 0;
const creados = [];
const hallados = [];

const linea = (t) => console.log(t);
function rev(ok, texto, extra = '') {
  if (!ok) fallas++;
  linea(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
}

async function pedir(ruta, { app, method = 'GET', body } = {}) {
  const cabeceras = { 'Content-Type': 'application/json' };
  if (app) cabeceras['X-App'] = app;
  if (galleta) cabeceras.Cookie = galleta;
  const r = await fetch(`${STAGING}${ruta}`, { method, headers: cabeceras, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const puesta = r.headers.get('set-cookie');
  if (puesta) galleta = puesta.split(';')[0];
  const texto = await r.text();
  let cuerpo = {};
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = { no_json: texto.slice(0, 200) }; }
  return { estado: r.status, ...cuerpo };
}

/** Quien manda escribe; si la API dice que no, esto truena con el motivo. */
async function crear(tabla, datos, app = 'dash101') {
  const r = await pedir(`/orgs/${ORG}/${tabla}`, { app, method: 'POST', body: datos });
  if (r.estado !== 201) throw new Error(`${tabla}: ${r.estado} ${r.error ?? ''} ${JSON.stringify(r.detalle ?? r.no_json ?? '')}`);
  creados.push(`${tabla}/${r.data.id}`);
  return r.data;
}

/** Busca por nombre (o por lo que se diga) en la lista; si no está, crea. */
async function asegurar(tabla, filtro, clave, valor, datos, app = 'dash101') {
  const q = filtro ? `?${new URLSearchParams(filtro)}` : '';
  const l = await pedir(`/orgs/${ORG}/${tabla}${q}`, { app });
  if (l.estado !== 200) throw new Error(`${tabla}: no se pudo listar (${l.estado} ${l.error ?? ''})`);
  const ya = l.data.filas.find((f) => String(f[clave] ?? '') === valor);
  if (ya) { hallados.push(`${tabla}/${ya.id}`); return ya; }
  return crear(tabla, datos, app);
}

async function entrar(correo, { codigo = true, pin } = {}) {
  galleta = '';
  if (codigo) {
    const c = await pedir('/auth/codigo', { method: 'POST', body: { correo } });
    if (!c.data?.codigo_prueba) throw new Error(`staging no devolvió codigo_prueba para ${correo}: ${c.estado} ${c.error ?? ''}`);
    const e = await pedir('/auth/entrar', { method: 'POST', body: { correo, codigo: c.data.codigo_prueba } });
    if (e.estado !== 200) throw new Error(`no entró ${correo}: ${e.estado} ${e.error ?? ''}`);
  } else {
    const e = await pedir('/auth/entrar', { method: 'POST', body: { correo, pin } });
    if (e.estado !== 200) throw new Error(`no entró ${correo} con PIN: ${e.estado} ${e.error ?? ''}`);
  }
}

async function main() {
  linea(`Siembra de la org «${ORG}» en ${STAGING}`);

  /* ── la guarda: jamás en producción ── */
  const salud = await pedir('/salud');
  if (salud.estado !== 200) throw new Error(`/salud contestó ${salud.estado}`);
  linea(`  entorno=${salud.data.entorno} · contrato ${salud.data.contrato}`);
  if (salud.data.entorno === 'produccion') throw new Error('ESTO ES PRODUCCIÓN. La org demo sólo se siembra en staging (D6).');
  if (salud.data.entorno !== 'staging') throw new Error(`entorno desconocido: ${salud.data.entorno}`);

  await entrar(CORREO);
  const yo = await pedir('/yo');
  if (!yo.data?.superadmin) throw new Error(`${CORREO} no es superadmin en staging`);

  /* ── la org ── */
  const org = await pedir('/admin/orgs', { method: 'POST', body: { id: ORG, nombre: 'Demo · Suite 101' } });
  if (org.estado === 201) { creados.push(`orgs/${ORG}`); rev(true, `se creó la org ${ORG}`, `OrgDB v${org.data.org_db_version}`); }
  else if (org.estado === 409) { hallados.push(`orgs/${ORG}`); rev(true, `la org ${ORG} ya existía`); }
  else throw new Error(`crear org: ${org.estado} ${org.error ?? ''}`);

  /* ── negocio, cuentas, proveedores ── */
  const negocio = await asegurar('negocios', null, 'nombre', DEMO.negocio.nombre, DEMO.negocio);
  const cuentas = {};
  for (const c of DEMO.cuentas) cuentas[c.nombre] = await asegurar('cuentas', { negocio_id: negocio.id }, 'nombre', c.nombre, { ...c, negocio_id: negocio.id });
  const proveedores = {};
  for (const p of DEMO.proveedores) proveedores[p.nombre] = await asegurar('proveedores', null, 'nombre', p.nombre, p);

  /* ── la familia y su cocina ── */
  const cliente = await asegurar('clientes', { negocio_id: negocio.id }, 'nombre', DEMO.cliente.nombre, { ...DEMO.cliente, negocio_id: negocio.id });
  const proyecto = await asegurar('proyectos', { negocio_id: negocio.id, cliente_id: cliente.id }, 'nombre', DEMO.proyecto.nombre, { ...DEMO.proyecto, negocio_id: negocio.id, cliente_id: cliente.id });

  /* ── ítems en varias etapas ── */
  const items = {};
  for (const it of DEMO.items) {
    const { etapa, notas, ...datos } = it;
    const fila = await asegurar('items', { proyecto_id: proyecto.id }, 'nombre', it.nombre, {
      ...datos, estado: 'vendido', proyecto_id: proyecto.id, cliente_id: cliente.id, negocio_id: negocio.id, moneda: 'MXN',
    });
    items[it.nombre] = fila;
    // Las etapas sólo se mueven con /etapa y sólo hacia adelante, una por una,
    // para que el historial de `avances` tenga sentido.
    for (let e = Number(fila.etapa) + 1; e <= etapa; e++) {
      const r = await pedir(`/orgs/${ORG}/items/${fila.id}/etapa`, { app: 'quell101', method: 'POST', body: { etapa: e, nota: notas[e - 1] ?? null } });
      if (r.estado !== 200) throw new Error(`etapa ${e} de ${it.nombre}: ${r.estado} ${r.error ?? ''}`);
      items[it.nombre] = r.data.item;
    }
  }

  /* ── partidas (fase 2: tabla propia, cuelgan del proyecto) ── */
  for (const p of DEMO.partidas) {
    await asegurar('partidas', { proyecto_id: proyecto.id }, 'concepto', p.concepto, {
      proyecto_id: proyecto.id, proveedor_id: proveedores[p.proveedor].id, proveedor_nombre: p.proveedor,
      concepto: p.concepto, monto_acordado: p.monto_acordado,
    });
  }

  /* ── movimientos: anticipos de la familia y pagos a proveedores ── */
  for (const m of DEMO.movimientos) {
    const { cuenta, proveedor, item, ...datos } = m;
    await asegurar('movimientos', { proyecto_id: proyecto.id }, 'descripcion', m.descripcion, {
      ...datos, negocio_id: negocio.id, cuenta_id: cuentas[cuenta].id, proyecto_id: proyecto.id,
      item_id: item ? items[item].id : null,
      contraparte_id: m.contraparte_tipo === 'cliente' ? cliente.id : proveedores[proveedor].id,
      contraparte_nombre: m.contraparte_tipo === 'cliente' ? cliente.nombre : proveedor,
    });
  }

  /* ── gastos fijos ── */
  for (const o of DEMO.opex) {
    const { cuenta, ...datos } = o;
    await asegurar('opex', { negocio_id: negocio.id }, 'nombre', o.nombre, { ...datos, negocio_id: negocio.id, cuenta_id: cuentas[cuenta].id });
  }

  /* ── el portal de la familia (peek101 depende de esto) ── */
  const acceso = await pedir(`/orgs/${ORG}/clientes/${cliente.id}/acceso`, { app: 'dash101', method: 'POST', body: { correo: DEMO.cliente.correo, pin: DEMO.pin } });
  rev(acceso.estado === 201, 'la familia tiene acceso al portal', `${acceso.estado} · ${DEMO.cliente.correo}`);

  linea('');
  linea(`  creados: ${creados.length} · ya estaban: ${hallados.length}`);

  /* ── lo que quedó, medido con la API ── */
  linea('');
  linea('== Lo que hay en la org demo (visto como dash101) ==');
  const p = await pedir(`/orgs/${ORG}/proyectos/${proyecto.id}`, { app: 'dash101' });
  rev(p.estado === 200, 'el proyecto existe', p.data?.nombre);
  const vendido = DEMO.items.reduce((s, i) => s + i.monto, 0);
  rev(p.data?.precio_venta === vendido, 'precio_venta = Σ ítems vendidos', `${p.data?.precio_venta} de ${vendido}`);
  const cobrado = DEMO.movimientos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
  rev(p.data?.cobrado === cobrado, 'cobrado = Σ ingresos', `${p.data?.cobrado} de ${cobrado}`);
  const pagado = DEMO.movimientos.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0);
  rev(p.data?.pagado_prov === pagado, 'pagado_prov = Σ egresos', `${p.data?.pagado_prov} de ${pagado}`);
  const compromiso = DEMO.partidas.reduce((s, x) => s + x.monto_acordado, 0);
  rev(p.data?.compromiso === compromiso, 'compromiso = Σ partidas acordadas', `${p.data?.compromiso} de ${compromiso}`);

  const partidas = await pedir(`/orgs/${ORG}/partidas?proyecto_id=${proyecto.id}`, { app: 'dash101' });
  const porConcepto = Object.fromEntries((partidas.data?.filas ?? []).map((f) => [f.concepto, f]));
  rev(porConcepto['Tablero, chapa de encino y cantos']?.estado === 'parcial', 'la partida de maderas quedó parcial', `${porConcepto['Tablero, chapa de encino y cantos']?.monto_pagado} pagados de 4200000`);
  rev(porConcepto['Bisagras, correderas y tiradores']?.estado === 'pagado', 'la partida de herrajes quedó pagada');

  const lista = await pedir(`/orgs/${ORG}/items?proyecto_id=${proyecto.id}`, { app: 'dash101' });
  const porNombre = Object.fromEntries((lista.data?.filas ?? []).map((f) => [f.nombre, f]));
  for (const it of DEMO.items) rev(porNombre[it.nombre]?.etapa === it.etapa, `${it.nombre}: etapa ${it.etapa}`, porNombre[it.nombre]?.clave ? `clave ${porNombre[it.nombre].clave}` : '');
  rev(!!porNombre['Cocina integral en L']?.clave, 'la cocina ya tiene clave (nace en la 4)');

  for (const t of ['negocios', 'cuentas', 'clientes', 'proveedores', 'proyectos', 'items', 'partidas', 'movimientos', 'opex', 'avances']) {
    const l = await pedir(`/orgs/${ORG}/${t}`, { app: 'dash101' });
    linea(`  ${t.padEnd(12)} ${String(l.data?.total ?? '?').padStart(3)}`);
  }

  /* ── y lo que ve la familia ── */
  linea('');
  linea('== Lo que ve la familia en su portal (peek101) ==');
  const mia = galleta;
  await entrar(DEMO.cliente.correo, { codigo: false, pin: DEMO.pin });
  const peek = await pedir(`/orgs/${ORG}/peek`, { app: 'peek101' });
  rev(peek.estado === 200, 'la familia entra con su PIN y abre /peek', `${peek.estado}`);
  rev(peek.data?.totales?.vendido === vendido, 've lo vendido', String(peek.data?.totales?.vendido));
  rev(peek.data?.totales?.cobrado === cobrado, 've lo cobrado', String(peek.data?.totales?.cobrado));
  rev(peek.data?.totales?.saldo === vendido - cobrado, 'y su saldo', String(peek.data?.totales?.saldo));
  const proy = peek.data?.proyectos?.[0];
  rev(proy && proy.partidas === undefined && proy.compromiso === undefined && proy.pagado_prov === undefined, 'no ve costos ni partidas');
  const part = await pedir(`/orgs/${ORG}/partidas`, { app: 'peek101' });
  rev(part.estado === 403, 'ni por /partidas', `${part.estado}`);
  galleta = mia;

  linea('');
  if (fallas) { linea(`RESULTADO: ${fallas} comprobación(es) fallaron`); process.exit(1); }
  linea(`RESULTADO: la org demo está sembrada y cuadra · portal: ${DEMO.cliente.correo} / PIN ${DEMO.pin}`);
}

main().catch((e) => { console.error(`FALLA: ${e.message}`); process.exit(1); });
