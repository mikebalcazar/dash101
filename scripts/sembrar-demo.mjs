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
  empresa: { nombre: 'Taller Demo', moneda: 'MXN' },
  cuentas: [
    { nombre: 'Banco Demo', tipo: 'banco', banco: 'Banco Ficticio', saldo_inicial: 25000000 },
    { nombre: 'Caja chica', tipo: 'caja', saldo_inicial: 500000 },
  ],
  proveedores: [
    { nombre: 'Maderas del Sur', categoria: 'insumos', correo: 'ventas@maderas-del-sur.ejemplo.mx', terminos_pago: '30 días' },
    { nombre: 'Herrajes Aztecas', categoria: 'herrajes', correo: 'pedidos@herrajes-aztecas.ejemplo.mx' },
  ],
  cliente: { nombre: 'Familia Ramírez', correo: 'familia.ramirez@ejemplo.mx', telefono: '55 0000 0000', notas: 'Org de demostración. Todo es ficticio.' },
  /* Las compras del taller (contrato 0.21.0). Dos esperando pago —una ya
   * vencida y urgente, que es lo que tiene que saltar en el buzón—, una
   * pagada con su factura, y una pagada de la que la factura NO ha llegado,
   * para que «Falta la factura» tenga algo que perseguir.
   *
   * Las pide `prueba.admin@ejemplo.mx`, no el superadmin: en las capturas del
   * escaparate tiene que verse una cuenta ficticia, no el correo de Mike. */
  compras: [
    { concepto: 'Tablero de encino, 12 hojas', proveedor: 'Maderas del Sur', monto: 870000, dias: 3, partida: 'Tablero, chapa de encino y cantos' },
    { concepto: 'Cinta de cantos y adhesivo', proveedor: 'Maderas del Sur', monto: 139200, dias: -1, urgente: true },
    { concepto: 'Herrajes de la isla', proveedor: 'Herrajes Aztecas', monto: 348000, dias: 5, pagar: 'Banco Demo', factura: 'DEMO-CFDI-0001' },
    { concepto: 'Flete de entrega', proveedor: 'Maderas del Sur', monto: 116000, dias: 7, pagar: 'Banco Demo' },
  ],
  /** Quién puede pagar en la demo. Es una etiqueta, no un rol. */
  contador: 'prueba.admin@ejemplo.mx',
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
  // Un FormData (planos, documentos, fotos) va tal cual: el navegador pone su
  // propio Content-Type con el separador.
  const forma = body instanceof FormData;
  const cabeceras = forma ? {} : { 'Content-Type': 'application/json' };
  if (app) cabeceras['X-App'] = app;
  if (galleta) cabeceras.Cookie = galleta;
  const r = await fetch(`${STAGING}${ruta}`, { method, headers: cabeceras, body: forma ? body : body ? JSON.stringify(body) : undefined, redirect: 'manual' });
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

/** Un día relativo a hoy, en `AAAA-MM-DD`. Las fechas de las compras son
 *  relativas a propósito: una demo con fechas fijas se ve vencida a los tres
 *  meses y las capturas salen en rojo sin que nada esté mal. */
function dia(n) {
  const d = new Date(Date.now() + n * 86400000);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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

/* Una llamada al motor de obra (`/orgs/demo/quell/…`), que contesta «pelón». */
const quell = (ruta, o = {}) => pedir(`/orgs/${ORG}/quell${ruta}`, { app: 'quell101', ...o });
const forma = (campos) => { const fd = new FormData(); fd.append('op_id', crypto.randomUUID()); for (const [k, v] of Object.entries(campos)) fd.append(k, v); return fd; };

/** Un PNG de verdad, dibujado aquí: un plano esquemático de 1000 × 700 con
 *  el contorno de la cocina y la isla. Sin dependencias: cabecera, IHDR,
 *  IDAT con zlib y CRC a mano. Es lo justo para que el plano se vea como
 *  plano y no como un cuadro blanco. */
async function pngPlano(ancho = 1000, alto = 700) {
  const { deflateSync } = await import('node:zlib');
  const px = new Uint8Array(ancho * alto * 3).fill(0xF6);
  const pinta = (x, y, c) => { if (x < 0 || y < 0 || x >= ancho || y >= alto) return; const i = (y * ancho + x) * 3; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; };
  const rect = (x0, y0, x1, y1, c, grosor = 3) => { for (let x = x0; x <= x1; x++) for (let g = 0; g < grosor; g++) { pinta(x, y0 + g, c); pinta(x, y1 - g, c); } for (let y = y0; y <= y1; y++) for (let g = 0; g < grosor; g++) { pinta(x0 + g, y, c); pinta(x1 - g, y, c); } };
  const gris = [0x9A, 0xA6, 0xB0], tinta = [0x2C, 0x2C, 0x2C], azul = [0x00, 0x80, 0xC1];
  for (let x = 0; x < ancho; x += 50) for (let y = 0; y < alto; y++) if (y % 4 === 0) pinta(x, y, [0xDD, 0xE3, 0xE8]);
  for (let y = 0; y < alto; y += 50) for (let x = 0; x < ancho; x++) if (x % 4 === 0) pinta(x, y, [0xDD, 0xE3, 0xE8]);
  rect(60, 60, 940, 640, tinta, 4);                 // los muros
  rect(80, 80, 920, 200, gris, 2); rect(80, 80, 240, 620, gris, 2); // la L de la cocina
  rect(420, 330, 720, 470, azul, 3);                // la isla
  for (let x = 80; x < 920; x += 60) rect(x, 80, x + 56, 200, [0xC4, 0xCC, 0xD3], 1);
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return (~c) >>> 0; };
  const trozo = (tipo, datos) => { const t = Buffer.from(tipo, 'ascii'); const l = Buffer.alloc(4); l.writeUInt32BE(datos.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, datos]))); return Buffer.concat([l, t, datos, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const filas = Buffer.alloc((ancho * 3 + 1) * alto);
  for (let y = 0; y < alto; y++) { filas[y * (ancho * 3 + 1)] = 0; Buffer.from(px.buffer, y * ancho * 3, ancho * 3).copy(filas, y * (ancho * 3 + 1) + 1); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(filas)), trozo('IEND', Buffer.alloc(0))]);
}

/** Dónde va cada pieza en el plano (fracción del ancho y del alto), por ítem. */
const PIEZAS = {
  'Cocina integral en L': { type: 'Mueble', x: 0.5, y: 0.2 },
  'Isla con cubierta de cuarzo': { type: 'Mueble', x: 0.57, y: 0.57 },
  'Instalación y ajuste en sitio': { type: 'Servicio', x: 0.16, y: 0.72 },
};
const PUNTO = '¿La cubierta de la isla la quieren en cuarzo blanco o gris? Necesitamos definirlo para pedirla.';

async function sembrarObra(cliente, proyecto, items) {
  linea('');
  linea('== La obra de la cocina, en quell101 ==');
  const yo = await quell('/me');
  if (yo.estado !== 200) throw new Error(`quell /me: ${yo.estado} ${yo.error ?? ''}`);
  const nombreObra = `${DEMO.proyecto.nombre} (obra)`;
  const lista = await quell('/projects');
  let obra = (lista.projects || []).find((p) => p.name === nombreObra);
  if (!obra) {
    const r = await quell('/projects', { method: 'POST', body: { name: nombreObra, client: DEMO.cliente.nombre } });
    if (r.estado !== 200) throw new Error(`obra: ${r.estado} ${r.error ?? ''}`);
    obra = { id: r.id, name: nombreObra }; creados.push(`quell/projects/${r.id}`);
  } else hallados.push(`quell/projects/${obra.id}`);

  // Ligada al proyecto de la familia (409 ya_ligada al mismo proyecto es «ya estaba»).
  const liga = await pedir(`/orgs/${ORG}/obras/${obra.id}/ligar`, { app: 'dash101', method: 'POST', body: { proyecto_id: proyecto.id } });
  rev(liga.estado === 200 || (liga.estado === 409 && liga.detalle?.proyecto_id === proyecto.id), 'la obra está ligada al proyecto de la familia', `${liga.estado} ${liga.error ?? ''}`);

  // El plano.
  let detalle = await quell(`/projects/${obra.id}`);
  let plano = (detalle.plans || [])[0];
  if (!plano) {
    const fd = forma({ name: 'Planta de la cocina', file_name: 'planta-cocina.png', width: '1000', height: '700', rotation: '0' });
    fd.append('image', new File([await pngPlano()], 'planta-cocina.png', { type: 'image/png' }));
    const r = await quell(`/projects/${obra.id}/plans`, { method: 'POST', body: fd });
    if (r.estado !== 200) throw new Error(`plano: ${r.estado} ${r.error ?? ''}`);
    plano = { id: r.id }; creados.push(`quell/plans/${r.id}`);
    detalle = await quell(`/projects/${obra.id}`);
  } else hallados.push(`quell/plans/${plano.id}`);
  rev(!!plano?.id, 'la obra tiene su plano');

  // Una pieza por ítem, colgada del ítem (ligar no mueve el precio de venta).
  const piezas = {};
  for (const [nombre, donde] of Object.entries(PIEZAS)) {
    const item = items[nombre];
    if (!item) continue;
    let pieza = (detalle.elements || []).find((e) => e.item_id === item.id || e.name === nombre);
    if (!pieza) {
      const r = await quell(`/plans/${plano.id}/elements`, { method: 'POST', body: { op_id: crypto.randomUUID(), name: nombre, type: donde.type, x: donde.x, y: donde.y } });
      if (r.estado !== 200) throw new Error(`pieza ${nombre}: ${r.estado} ${r.error ?? ''}`);
      pieza = { id: r.id, name: nombre }; creados.push(`quell/elements/${r.id}`);
    } else hallados.push(`quell/elements/${pieza.id}`);
    piezas[nombre] = pieza;
    if (!pieza.item_id) {
      const l = await pedir(`/orgs/${ORG}/obras/${obra.id}/items`, { app: 'dash101', method: 'POST', body: { ligar: [{ element_id: pieza.id, item_id: item.id }] } });
      rev(l.estado === 200, `la pieza «${nombre}» cuelga de su ítem`, `${l.estado} ${l.error ?? ''}`);
    }
  }

  // El plano de la isla, como documento principal de su pieza.
  const isla = piezas['Isla con cubierta de cuarzo'];
  if (isla) {
    const docs = await quell(`/elements/${isla.id}/docs`);
    if (!docs.principal) {
      const fd = forma({ rol: 'principal', nombre: 'Plano de la isla' });
      fd.append('archivo', new File([await pngPlano(800, 500)], 'plano-isla.png', { type: 'image/png' }));
      const r = await quell(`/elements/${isla.id}/docs`, { method: 'POST', body: fd });
      rev(r.estado === 200, 'la isla tiene su plano como documento', `${r.estado} ${r.error ?? ''}`);
      if (r.estado === 200) creados.push(`quell/docs/${r.doc.id}`);
    } else hallados.push(`quell/docs/${docs.principal.id}`);
    // Y un punto abierto para la familia, sobre la isla. Si la familia ya lo
    // contestó, no se vuelve a abrir: eso lo decide el taller en la demo.
    const dudas = await quell(`/projects/${obra.id}/dudas`);
    const ya = (dudas.dudas || []).find((d) => d.texto === PUNTO);
    if (!ya) {
      const r = await quell(`/projects/${obra.id}/dudas`, { method: 'POST', body: forma({ texto: PUNTO, element_id: isla.id, para: 'cliente' }) });
      rev(r.estado === 200 && r.para === 'cliente', 'hay un punto por definir para la familia, sobre la isla', `${r.estado} ${r.error ?? ''}`);
      if (r.estado === 200) creados.push(`quell/dudas/${r.id}`);
    } else { hallados.push(`quell/dudas/${ya.id}`); rev(true, `el punto de la isla ya estaba (${ya.estado})`); }
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

  /* ── la empresa, cuentas, proveedores ── */
  /* La empresa es una y nace con la org (contrato 0.63.0): se lee por su
   * ruta y, si no se llama como la demo, se le pone el nombre. */
  const empresa = await pedir(`/orgs/${ORG}/empresa`, { app: 'dash101' });
  if (empresa.estado !== 200) throw new Error(`empresa: ${empresa.estado} ${empresa.error ?? ''}`);
  if (empresa.data.nombre !== DEMO.empresa.nombre || empresa.data.moneda !== DEMO.empresa.moneda) {
    const r = await pedir(`/orgs/${ORG}/empresa`, { app: 'dash101', method: 'PATCH', body: DEMO.empresa });
    if (r.estado !== 200) throw new Error(`empresa: no se pudo nombrar (${r.estado} ${r.error ?? ''})`);
    rev(true, `la empresa se llama ${DEMO.empresa.nombre}`);
  } else hallados.push('empresa');
  const cuentas = {};
  for (const c of DEMO.cuentas) cuentas[c.nombre] = await asegurar('cuentas', null, 'nombre', c.nombre, c);
  const proveedores = {};
  for (const p of DEMO.proveedores) proveedores[p.nombre] = await asegurar('proveedores', null, 'nombre', p.nombre, p);

  /* ── la familia y su cocina ── */
  const cliente = await asegurar('clientes', null, 'nombre', DEMO.cliente.nombre, DEMO.cliente);
  const proyecto = await asegurar('proyectos', { cliente_id: cliente.id }, 'nombre', DEMO.proyecto.nombre, { ...DEMO.proyecto, cliente_id: cliente.id });

  /* ── ítems en varias etapas ── */
  const items = {};
  for (const it of DEMO.items) {
    const { etapa, notas, ...datos } = it;
    const fila = await asegurar('items', { proyecto_id: proyecto.id }, 'nombre', it.nombre, {
      ...datos, estado: 'vendido', proyecto_id: proyecto.id, cliente_id: cliente.id, moneda: 'MXN',
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
      ...datos, cuenta_id: cuentas[cuenta].id, proyecto_id: proyecto.id,
      item_id: item ? items[item].id : null,
      contraparte_id: m.contraparte_tipo === 'cliente' ? cliente.id : proveedores[proveedor].id,
      contraparte_nombre: m.contraparte_tipo === 'cliente' ? cliente.nombre : proveedor,
    });
  }

  /* ── gastos fijos ── */
  for (const o of DEMO.opex) {
    const { cuenta, ...datos } = o;
    await asegurar('opex', null, 'nombre', o.nombre, { ...datos, cuenta_id: cuentas[cuenta].id });
  }

  /* ── el portal de la familia (peek101 depende de esto) ── */
  const acceso = await pedir(`/orgs/${ORG}/clientes/${cliente.id}/acceso`, { app: 'dash101', method: 'POST', body: { correo: DEMO.cliente.correo, pin: DEMO.pin } });
  rev(acceso.estado === 201, 'la familia tiene acceso al portal', `${acceso.estado} · ${DEMO.cliente.correo}`);

  /* ── la obra en quell101, ligada al proyecto (5-oct-2026) ──
   *
   * peek101 es el único visor del cliente y enseña el plano, las piezas y los
   * puntos por definir desde el motor de obra. Para que la demo —y la prueba
   * de navegador de peek101— tengan qué enseñar, la cocina tiene su obra:
   * un plano, una pieza por ítem colgada del ítem, un plano de la isla como
   * documento, y un punto abierto para la familia. Todo por las rutas de
   * quell101 como superadmin (que nace como dueño de la bitácora). */
  await sembrarObra(cliente, proyecto, items);

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

  for (const t of ['cuentas', 'clientes', 'proveedores', 'proyectos', 'items', 'partidas', 'movimientos', 'opex', 'avances']) {
    const l = await pedir(`/orgs/${ORG}/${t}`, { app: 'dash101' });
    linea(`  ${t.padEnd(12)} ${String(l.data?.total ?? '?').padStart(3)}`);
  }

  /* ── las compras y la huella fiscal (0.21.0) ──
   *
   * Quién paga lo reparte el dueño, y en `demo` el único que entra como
   * dueño es el superadmin (los miembros de la demo son admin y socio). Por
   * eso la etiqueta la pone él aquí, una vez, y de ahí en adelante la demo ya
   * tiene quién pague: sin eso, el buzón sale vacío en las capturas y la
   * prueba de navegador no puede pagar nada. */
  linea('');
  linea('== Las compras del taller (órdenes y fiscal) ==');
  const dueno = galleta;

  const gente = await pedir(`/orgs/${ORG}/ordenes/contadores`, { app: 'dash101' });
  if (gente.estado !== 200) throw new Error(`contadores: ${gente.estado} ${gente.error ?? ''}`);
  const quienPaga = (gente.data.filas ?? []).find((f) => f.correo === DEMO.contador);
  if (!quienPaga) throw new Error(`${DEMO.contador} no es miembro de ${ORG}`);
  if (!quienPaga.es_contador) {
    const m = await pedir(`/orgs/${ORG}/ordenes/contadores`, { app: 'dash101', method: 'POST', body: { usuario_id: quienPaga.usuario_id, valor: true } });
    if (m.estado !== 200) throw new Error(`marcar contador: ${m.estado} ${m.error ?? ''}`);
    creados.push(`contador/${DEMO.contador}`);
  }
  rev(true, `${DEMO.contador} puede pagar`, quienPaga.es_contador ? 'ya podía' : 'se le marcó');

  // Las pide y las paga la cuenta ficticia, que es la que sale en pantalla.
  await entrar(DEMO.contador);
  const yaHay = await pedir(`/orgs/${ORG}/ordenes`, { app: 'dash101' });
  if (yaHay.estado !== 200) throw new Error(`ordenes: ${yaHay.estado} ${yaHay.error ?? ''}`);
  const porConceptoOC = Object.fromEntries((yaHay.data.filas ?? []).map((f) => [f.concepto, f]));

  const partidasDelProyecto = await pedir(`/orgs/${ORG}/partidas?proyecto_id=${proyecto.id}`, { app: 'dash101' });
  const partidaPorConcepto = Object.fromEntries((partidasDelProyecto.data?.filas ?? []).map((f) => [f.concepto, f]));

  for (const c of DEMO.compras) {
    let oc = porConceptoOC[c.concepto];
    if (!oc) {
      const r = await pedir(`/orgs/${ORG}/ordenes`, { app: 'dash101', method: 'POST', body: {
        proveedor_id: proveedores[c.proveedor].id, proveedor_nombre: c.proveedor,
        concepto: c.concepto, monto: c.monto, con_factura: true, urgente: !!c.urgente,
        fecha_maxima_pago: dia(c.dias),
        ...(c.partida ? { proyecto_id: proyecto.id, partida_id: partidaPorConcepto[c.partida]?.id ?? null } : {}),
      } });
      if (r.estado !== 201) throw new Error(`orden «${c.concepto}»: ${r.estado} ${r.error ?? ''} ${JSON.stringify(r.detalle ?? '')}`);
      oc = r.data;
      creados.push(`ordenes/${oc.id}`);
    } else hallados.push(`ordenes/${oc.id}`);

    if (c.pagar && oc.estado === 'en_buzon') {
      const pago = await pedir(`/orgs/${ORG}/ordenes/${oc.id}/pagar`, { app: 'dash101', method: 'POST', body: { cuenta_id: cuentas[c.pagar].id } });
      if (pago.estado !== 200) throw new Error(`pagar «${c.concepto}»: ${pago.estado} ${pago.error ?? ''}`);
      oc = pago.data.orden;
      // La factura del que la trae: se captura y se le cuelga al movimiento
      // que YA existe, que es como llega en la vida real.
      if (c.factura) {
        const cf = await pedir(`/orgs/${ORG}/fiscal/cfdi`, { app: 'dash101', method: 'POST', body: {
          uuid: c.factura, tipo: 'egreso', rfc: 'XAXX010101000',
          razon_social: c.proveedor, subtotal: oc.subtotal, iva: oc.iva, total: oc.monto, fecha: dia(0),
        } });
        if (cf.estado === 201) {
          const lg = await pedir(`/orgs/${ORG}/fiscal/cfdi/${cf.data.id}/ligar`, { app: 'dash101', method: 'POST', body: { movimiento_id: pago.data.movimiento.id } });
          if (lg.estado !== 200) throw new Error(`ligar CFDI: ${lg.estado} ${lg.error ?? ''}`);
          creados.push(`cfdi/${cf.data.id}`);
        } else if (cf.estado !== 409) throw new Error(`CFDI ${c.factura}: ${cf.estado} ${cf.error ?? ''}`);
      }
    }
    rev(true, `  ${oc.folio} · ${c.concepto}`, `${oc.estado} · ${oc.subtotal} + ${oc.iva}`);
  }

  const buzon = await pedir(`/orgs/${ORG}/ordenes/buzon`, { app: 'dash101' });
  rev(buzon.estado === 200, 'el buzón abre para quien paga', `${buzon.data?.filas?.length} por pagar · ${buzon.data?.vencidas} vencida(s)`);
  const pendientes = await pedir(`/orgs/${ORG}/fiscal/pendientes`, { app: 'dash101' });
  rev(pendientes.estado === 200, 'y hay algo que perseguir en «Falta la factura»', `${pendientes.data?.filas?.length}`);
  const ivaMes = await pedir(`/orgs/${ORG}/fiscal/iva?mes=${dia(0).slice(0, 7)}`, { app: 'dash101' });
  rev(ivaMes.estado === 200, 'el IVA del mes sale', `acreditable ${ivaMes.data?.acreditable} centavos`);
  galleta = dueno;

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
