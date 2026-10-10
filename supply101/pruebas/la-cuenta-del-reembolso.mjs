/* La cuenta a la que se reembolsa (10-oct-2026, contrato 0.92.0).
 *
 * Mike: un reembolso se paga SÓLO a quien lo pidió, nunca a la cuenta de un
 * proveedor ni de un tercero; «requieras su cuenta bancaria cuando pida un
 * reembolso si es que no la tiene registrada».
 *
 * Se sirve `publico/` y se finge la API en `/s101/**`, a 390 × 844 con
 * pantalla táctil. Se mide contando elementos, no mirando:
 *
 *   · En modo reembolso sale «A qué cuenta te lo regresamos»; en compra no.
 *     Y en reembolso la ficha del proveedor (con sus cuentas) NO se ofrece
 *     aunque se escoja uno; en compra sí.
 *   · Sin cuenta guardada, la forma está abierta: sin CLABE no se manda, con
 *     una que no cuadra tampoco (se dice en palabras y se señala el campo),
 *     y con una buena el POST lleva `cuenta` con CLABE limpia, banco y a
 *     nombre de quién. Ningún POST antes de eso.
 *   · La orden muestra «A qué cuenta» con la CLABE legible.
 *   · Al volver a pedir, la cuenta ya está guardada: se enseña, la forma va
 *     cerrada, y el POST va SIN `cuenta`. «Cambiar la cuenta» abre la forma
 *     con «Dejar la que tenía», que la vuelve a cerrar.
 *   · Al recargar, /permisos la trae y se enseña desde el principio.
 *   · Si la API rechaza la CLABE (400 con errores.clabe), se dicen sus
 *     palabras y se señala el campo.
 *   · Al corregir un reembolso devuelto, la cuenta que se enseña es la que la
 *     ORDEN traía, no la mía de hoy.
 *
 *   node supply101/pruebas/la-cuenta-del-reembolso.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PUBLICO = fileURLToPath(new URL('../publico/', import.meta.url));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const servidor = createServer(async (req, res) => {
  const ruta = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const archivo = join(PUBLICO, ruta === '/' ? 'index.html' : ruta);
  try {
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream' });
    res.end(cuerpo);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

let fallas = 0;
const rev = (ok, que, dato = '') => { if (!ok) fallas++; console.log(`  [${ok ? 'ok ' : 'MAL'}] ${que}${dato ? ' — ' + dato : ''}`); };
const json = (status, cuerpo) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) });
const ok = (data, status = 200) => json(status, { ok: true, data });

const T = '2026-10-10T01:00:00.000Z';
const CLABE = '012180015621788594';     // cuadra
const CLABE_MAL = '012180015621788591';  // mismo cuerpo, verificador malo
let cuentaGuardada = null;               // lo que /permisos contesta: la «base» fingida
let rechazarClabe = null;                // si está puesto, el POST contesta 400 con esto
const posts = [];
const ordenes = [];
const devuelta = {
  id: 'o-dev', folio: 'RE-000007', estado: 'devuelta', tipo: 'reembolso', solicitante_usuario_id: 'u-ana', solicitante_correo: 'ana@ejemplo.mx',
  solicitante_nombre: 'Ana', proveedor_id: null, proveedor_nombre: null, concepto: 'Casetas', monto: 30000, moneda: 'MXN', con_factura: 0,
  subtotal: 30000, iva: 0, tasa_iva: 0, fecha_maxima_pago: null, urgente: 0, nota_contador: 'Sube el ticket', movimiento_id: null,
  creado_at: T, actualizado_at: T, pagada_at: null, reembolso_clabe: '002010077777777771', reembolso_banco: 'Banamex', reembolso_beneficiario: 'Ana de Antes',
};
let n = 0;

const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'es-MX' });
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push('excepción: ' + e));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });

await p.route('**/s101/**', async (route) => {
  const u = new URL(route.request().url());
  const r = u.pathname.replace(/^\/s101/, '');
  const metodo = route.request().method();
  if (r === '/yo') return route.fulfill(ok({ usuario: { id: 'u-ana', correo: 'ana@ejemplo.mx' }, orgs: [{ id: 'demo', nombre: 'Familia Ramírez', apps: ['dash', 'supply'] }] }));
  if (r === '/orgs/demo/ordenes/permisos') return route.fulfill(ok({ puede_comprar: true, puede_pagar: false, cuenta_reembolso: cuentaGuardada }));
  if (r === '/orgs/demo/ordenes' && metodo === 'GET') return route.fulfill(ok({ filas: [devuelta, ...ordenes] }));
  if (r === '/orgs/demo/proveedores') return route.fulfill(ok({ filas: [{ id: 'pv1', nombre: 'OXXO' }] }));
  if (r === '/orgs/demo/proveedor_cuentas') return route.fulfill(ok({ filas: [{ id: 'c1', alias: 'Principal', clabe: '646180000000000000', banco: 'STP', beneficiario: 'OXXO SA' }] }));
  if (r === '/orgs/demo/proyectos' || r === '/orgs/demo/partidas' || r === '/orgs/demo/archivos') return route.fulfill(ok({ filas: [] }));
  if (r === '/orgs/demo/ordenes' && metodo === 'POST') {
    const cuerpo = route.request().postDataJSON();
    posts.push(cuerpo);
    if (rechazarClabe) return route.fulfill(json(400, { ok: false, error: 'datos_invalidos', detalle: { errores: { clabe: rechazarClabe } } }));
    // Lo mismo que la API: la cuenta que viene se guarda como la mía; si no viene, la guardada; sin ninguna, no entra.
    if (cuerpo.cuenta) cuentaGuardada = { clabe: cuerpo.cuenta.clabe, banco: cuerpo.cuenta.banco, beneficiario: cuerpo.cuenta.beneficiario || 'Ana', actualizado_at: T };
    if (cuerpo.tipo === 'reembolso' && !cuentaGuardada) return route.fulfill(json(400, { ok: false, error: 'falta_cuenta_reembolso', detalle: { mensaje: 'Falta la cuenta' } }));
    n += 1;
    const o = {
      id: `o${n}`, folio: `RE-00000${n}`, estado: 'en_buzon', tipo: cuerpo.tipo, solicitante_usuario_id: 'u-ana', solicitante_correo: 'ana@ejemplo.mx',
      solicitante_nombre: 'Ana', proveedor_id: cuerpo.proveedor_id, proveedor_nombre: cuerpo.proveedor_nombre, concepto: cuerpo.concepto, monto: cuerpo.monto,
      moneda: 'MXN', con_factura: 0, subtotal: cuerpo.monto, iva: 0, tasa_iva: 0, fecha_maxima_pago: null, urgente: 0, nota_contador: null, movimiento_id: null,
      creado_at: T, actualizado_at: null, pagada_at: null,
      reembolso_clabe: cuerpo.tipo === 'reembolso' ? cuentaGuardada.clabe : null,
      reembolso_banco: cuerpo.tipo === 'reembolso' ? cuentaGuardada.banco : null,
      reembolso_beneficiario: cuerpo.tipo === 'reembolso' ? cuentaGuardada.beneficiario : null,
    };
    ordenes.push(o);
    return route.fulfill(ok(o, 201));
  }
  let m;
  if ((m = r.match(/^\/orgs\/demo\/ordenes\/([^/]+)$/)) && metodo === 'GET') {
    const o = [devuelta, ...ordenes].find((x) => x.id === m[1]);
    if (!o) return route.fulfill(json(404, { ok: false, error: 'no_encontrado' }));
    return route.fulfill(ok({ orden: o, eventos: [], archivos: [], proveedor: null, reembolso_a: null }));
  }
  if ((m = r.match(/^\/orgs\/demo\/ordenes\/([^/]+)$/)) && metodo === 'PATCH') {
    const cuerpo = route.request().postDataJSON();
    posts.push({ patch: m[1], ...cuerpo });
    return route.fulfill(ok({ ...devuelta, estado: 'en_buzon', monto: cuerpo.monto ?? devuelta.monto }));
  }
  return route.fulfill(ok({ filas: [] }));
});

const ir = async (hash, selector) => {
  await p.goto(`${base}/${hash}`);
  await p.waitForSelector(selector, { timeout: 8000 });
};
const visible = (sel) => p.locator(sel).isVisible();
const texto = (sel) => p.locator(sel).innerText();

console.log('· en compra no hay bloque de cuenta y la ficha del proveedor sí se ofrece');
await ir('#/pedir', '#v-pedir:not(.oculto) #monto');
await p.waitForFunction(() => document.querySelectorAll('#proveedor option').length > 1);
rev(await p.locator('#bloque-cuenta').isHidden(), 'sin «A qué cuenta te lo regresamos»');
await p.selectOption('#proveedor', 'pv1');
rev(await visible('#b-ficha-proveedor'), 'con un proveedor escogido, «Ver la ficha del proveedor» sale');

console.log('· en reembolso sale el bloque, y la ficha del proveedor NO, aunque se escoja uno');
await ir('#/reembolso', '#v-pedir:not(.oculto) #monto');
await p.waitForFunction(() => document.querySelectorAll('#proveedor option').length > 1);
rev(await visible('#bloque-cuenta'), 'está «A qué cuenta te lo regresamos»');
rev(await visible('#cuenta-forma') && await p.locator('#cuenta-guardada').isHidden(), 'sin cuenta guardada, la forma está abierta');
rev(/primer reembolso/.test(await texto('#cuenta-forma-p')), 'y dice que es la primera vez');
rev(await p.locator('#b-dejar-cuenta').isHidden(), 'no hay «Dejar la que tenía»: no había ninguna');
await p.selectOption('#proveedor', 'pv1');
rev(await p.locator('#b-ficha-proveedor').isHidden() && await p.locator('#ficha-proveedor').isHidden(), 'la ficha del proveedor con cuentas no se ofrece');
for (const id of ['#rc-clabe', '#rc-banco', '#rc-beneficiario']) {
  const c = await p.locator(id).boundingBox();
  rev(c && c.height >= 44, `${id} se atina con el pulgar`, c ? `${Math.round(c.height)} px` : 'sin caja');
}

console.log('· sin CLABE no se manda; con una que no cuadra tampoco; con una buena, el POST la lleva');
await p.getByLabel('Cuánto pagaste').fill('850');
await p.getByLabel('Qué compraste').fill('Gasolina');
await p.locator('#con-factura').uncheck();
await p.getByRole('button', { name: 'Pedir el reembolso' }).tap();
await p.waitForSelector('#err-pedir:not(.oculto)', { timeout: 3000 });
rev(/Escribe la CLABE/.test(await texto('#err-pedir')), 'sin CLABE: se dice', await texto('#err-pedir'));
rev(await p.locator('#rc-clabe.campo-mal').count() === 1, 'y se señala el campo');
rev(posts.length === 0, 'ningún POST');
await p.locator('#rc-clabe').fill(CLABE_MAL);
await p.getByRole('button', { name: 'Pedir el reembolso' }).tap();
await p.waitForTimeout(200);
rev(/no cuadra/.test(await texto('#err-pedir')), 'con verificador malo: «no cuadra»', await texto('#err-pedir'));
rev(posts.length === 0, 'sigue sin POST');
await p.locator('#rc-clabe').fill('012 180 01562178859-4');
await p.locator('#rc-banco').fill('BBVA');
await p.locator('#rc-beneficiario').fill('Ana Pide Ortega');
await p.getByRole('button', { name: 'Pedir el reembolso' }).tap();
await p.waitForFunction(() => location.hash.startsWith('#/orden/'), { timeout: 8000 });
rev(posts.length === 1, 'un solo POST');
rev(posts[0]?.tipo === 'reembolso' && JSON.stringify(posts[0]?.cuenta) === JSON.stringify({ clabe: CLABE, banco: 'BBVA', beneficiario: 'Ana Pide Ortega' }), 'con `cuenta`: CLABE sin espacios ni guiones, banco y a nombre de quién', JSON.stringify(posts[0]?.cuenta));
await p.waitForSelector('#v-detalle:not(.oculto) dl.datos', { timeout: 8000 });
const detalle = await texto('#detalle');
rev(/A qué cuenta/.test(detalle) && /012 180 01562178859 4/.test(detalle) && /BBVA/.test(detalle) && /Ana Pide Ortega/.test(detalle), 'la orden dice a qué cuenta, con la CLABE legible');

console.log('· al volver a pedir, la cuenta ya está guardada: se enseña y el POST va sin `cuenta`');
await ir('#/reembolso', '#v-pedir:not(.oculto) #monto');
rev(await visible('#cuenta-guardada') && await p.locator('#cuenta-forma').isHidden(), 'la tarjeta con la cuenta, la forma cerrada');
rev(/012 180 01562178859 4/.test(await texto('#cg-clabe')) && /BBVA/.test(await texto('#cg-banco')) && /Ana Pide Ortega/.test(await texto('#cg-beneficiario')), 'con la CLABE legible, el banco y el nombre');
await p.getByLabel('Cuánto pagaste').fill('120');
await p.getByLabel('Qué compraste').fill('Taxi');
await p.locator('#con-factura').uncheck();
await p.getByRole('button', { name: 'Pedir el reembolso' }).tap();
await p.waitForFunction(() => location.hash.startsWith('#/orden/'), { timeout: 8000 });
rev(posts.length === 2 && !('cuenta' in posts[1]), 'el POST no lleva `cuenta`: la API usa la guardada');

console.log('· «Cambiar la cuenta» abre la forma, «Dejar la que tenía» la cierra, y la nueva viaja');
await ir('#/reembolso', '#v-pedir:not(.oculto) #monto');
await p.locator('#b-cambiar-cuenta').tap();
rev(await visible('#cuenta-forma') && await p.locator('#cuenta-guardada').isHidden(), 'la forma abre');
rev(await visible('#b-dejar-cuenta'), 'con «Dejar la que tenía»');
rev(await p.locator('#rc-clabe').inputValue() === '' && await p.locator('#rc-banco').inputValue() === 'BBVA', 'la CLABE en blanco, el banco y el nombre prellenados');
await p.locator('#b-dejar-cuenta').tap();
rev(await visible('#cuenta-guardada') && await p.locator('#cuenta-forma').isHidden(), '«Dejar la que tenía» la cierra');
await p.locator('#b-cambiar-cuenta').tap();
await p.locator('#rc-clabe').fill('002010077777777771');
await p.locator('#rc-banco').fill('Banamex');
await p.getByLabel('Cuánto pagaste').fill('60');
await p.getByLabel('Qué compraste').fill('Pasaje');
await p.locator('#con-factura').uncheck();
await p.getByRole('button', { name: 'Pedir el reembolso' }).tap();
await p.waitForFunction(() => location.hash.startsWith('#/orden/'), { timeout: 8000 });
rev(posts.length === 3 && posts[2]?.cuenta?.clabe === '002010077777777771' && posts[2]?.cuenta?.banco === 'Banamex', 'la cuenta nueva viaja con la orden');
await ir('#/reembolso', '#v-pedir:not(.oculto) #monto');
rev(/002 010 07777777777 1/.test(await texto('#cg-clabe')), 'y desde entonces es la que se enseña');

console.log('· al recargar, /permisos la trae y se enseña desde el principio');
await p.goto(`${base}/#/reembolso`, { waitUntil: 'load' });
await p.waitForSelector('#v-pedir:not(.oculto) #monto', { timeout: 8000 });
rev(await visible('#cuenta-guardada') && /002 010 07777777777 1/.test(await texto('#cg-clabe')), 'la cuenta guardada, sin pedirla otra vez');

console.log('· si la API rechaza la CLABE, se dicen sus palabras y se señala el campo');
rechazarClabe = 'La CLABE no cuadra: son 18 dígitos y el último los verifica.';
await p.locator('#b-cambiar-cuenta').tap();
await p.locator('#rc-clabe').fill(CLABE);
await p.getByLabel('Cuánto pagaste').fill('10');
await p.getByLabel('Qué compraste').fill('Chicles');
await p.locator('#con-factura').uncheck();
await p.getByRole('button', { name: 'Pedir el reembolso' }).tap();
await p.waitForSelector('#err-pedir:not(.oculto)', { timeout: 5000 });
rev((await texto('#err-pedir')).trim() === rechazarClabe, 'las palabras de la API', await texto('#err-pedir'));
rev(await p.locator('#rc-clabe.campo-mal').count() === 1 && await visible('#cuenta-forma'), 'el campo señalado y la forma sigue abierta');
rev((await p.evaluate(() => location.hash)) === '#/reembolso', 'y no se fue a ningún lado');
rechazarClabe = null;

console.log('· al corregir un reembolso devuelto, la cuenta es la de la ORDEN, y sin tocarla el PATCH no manda `cuenta`');
await ir('#/orden/o-dev', '#v-detalle:not(.oculto) #b-corregir');
await p.locator('#b-corregir').tap();
await p.waitForSelector('#v-pedir:not(.oculto) #monto', { timeout: 8000 });
rev(/Corregir RE-000007/.test(await texto('#pedir-t')), 'se está corrigiendo');
rev(await visible('#cuenta-guardada') && /002 010 07777777777 1/.test(await texto('#cg-clabe')) && /Ana de Antes/.test(await texto('#cg-beneficiario')), 'la cuenta que la orden traía, a nombre de quien la dio');
await p.getByLabel('Cuánto pagaste').fill('310');
await p.getByRole('button', { name: 'Volver a mandarla' }).tap();
await p.waitForFunction(() => location.hash.startsWith('#/orden/'), { timeout: 8000 });
const patch = posts.find((x) => x.patch === 'o-dev');
rev(!!patch && !('cuenta' in patch) && patch.monto === 31000, 'el PATCH sin `cuenta`: la orden se queda con la suya', JSON.stringify(patch));

const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
rev(ancho <= 391, 'a 390 no hay barrido horizontal', `${ancho}`);

await ctx.close(); await navegador.close(); servidor.close();
rev(errores.length === 0, 'sin errores de JavaScript', errores.join(' | '));
console.log(fallas ? `\n${fallas} falla(s).` : '\nTodo en orden.');
process.exit(fallas ? 1 : 0);
