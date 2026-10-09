/* Cancelar una orden que ya no se necesita (9-oct-2026, contrato 0.86.0).
 *
 * Mike: «en supply, hay que poner un botón para cancelar una orden que ya no
 * se necesita».
 *
 * Se sirve `publico/` y se finge la API en `/s101/**`, a 390 × 844 con
 * pantalla táctil. Se mide, contando elementos y no mirando:
 *
 *   · «Cancelar orden» sale sólo en lo MÍO que está en el buzón o devuelto;
 *     no en una pagada, ni en una ya cancelada, ni en la de otro (quien paga
 *     también abre órdenes aquí). Y mide al menos 44 px de alto.
 *   · Al picarlo NO sale `window.confirm`: sale la confirmación en su
 *     lugar, con el folio («¿Cancelar OC-000142? Ya no se va a pagar.»), el
 *     porqué opcional y «Sí, cancelarla» / «No». «No» no manda nada.
 *   · «Sí, cancelarla» manda POST …/cancelar con el porqué, y la orden se
 *     vuelve a pintar «Cancelada», ya sin el botón.
 *   · «Mis compras» dice «Cancelada», y la deja al final.
 *   · Si la API dice 409 (alguien la pagó mientras tanto), se dice en
 *     palabras y la confirmación se queda.
 *
 * Con `CAPTURAS=<carpeta>` deja la confirmación y la orden cancelada en PNG.
 *
 *   node supply101/pruebas/la-orden-se-cancela.mjs
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
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
const CAPTURAS = process.env.CAPTURAS || '';
if (CAPTURAS) await mkdir(CAPTURAS, { recursive: true });

let fallas = 0;
const rev = (ok, que, dato = '') => { if (!ok) fallas++; console.log(`  [${ok ? 'ok ' : 'MAL'}] ${que}${dato ? ' — ' + dato : ''}`); };
const json = (status, cuerpo) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) });
const ok = (data, status = 200) => json(status, { ok: true, data });

const T = '2026-10-08T15:30:00.000Z';
const orden = (id, folio, estado, extra = {}) => ({
  id, folio, estado, tipo: 'compra', solicitante_usuario_id: 'u-ana', solicitante_correo: 'ana@ejemplo.mx', solicitante_nombre: 'Ana',
  proveedor_nombre: 'Maderas del Sur', concepto: `Concepto ${folio}`, monto: 116000, moneda: 'MXN', con_factura: 1, subtotal: 100000, iva: 16000,
  tasa_iva: 1600, fecha_maxima_pago: '2026-10-15', urgente: 0, nota_contador: null, movimiento_id: null, creado_at: T, actualizado_at: null, pagada_at: null, ...extra,
});
const ordenes = [
  orden('o1', 'OC-000142', 'en_buzon', { concepto: 'Triplay de 18 mm, 12 hojas' }),
  orden('o2', 'OC-000143', 'devuelta', { concepto: 'Bisagras', nota_contador: 'Falta la cotización' }),
  orden('o3', 'OC-000140', 'pagada', { concepto: 'Pegamento', pagada_at: T }),
  orden('o5', 'OC-000139', 'cancelada', { concepto: 'Lijas', actualizado_at: T }),
];
const deOtro = orden('o4', 'OC-000144', 'en_buzon', { solicitante_usuario_id: 'u-beto', solicitante_nombre: 'Beto', concepto: 'Brocas de Beto' });
const eventos = { o1: [{ id: 'e1', que: 'creada', quien_nombre: 'ana@ejemplo.mx', ts: T, nota: null }] };
const cancelaciones = [];
let responder409 = false;

const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'es-MX' });
const p = await ctx.newPage();
const errores = [];
const dialogos = [];
p.on('pageerror', (e) => errores.push('excepción: ' + e));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });
p.on('dialog', (d) => { dialogos.push(d.message()); void d.dismiss(); });

await p.route('**/s101/**', async (route) => {
  const r = new URL(route.request().url()).pathname.replace(/^\/s101/, '');
  const metodo = route.request().method();
  if (r === '/yo') return route.fulfill(ok({ usuario: { id: 'u-ana', correo: 'ana@ejemplo.mx' }, orgs: [{ id: 'demo', nombre: 'Familia Ramírez', apps: ['dash', 'supply'] }] }));
  if (r === '/orgs/demo/ordenes/permisos') return route.fulfill(ok({ puede_comprar: true, puede_pagar: true }));
  if (r === '/orgs/demo/ordenes' && metodo === 'GET') return route.fulfill(ok({ filas: ordenes }));
  let m;
  if ((m = r.match(/^\/orgs\/demo\/ordenes\/([^/]+)\/cancelar$/)) && metodo === 'POST') {
    let cuerpo = {};
    try { cuerpo = route.request().postDataJSON() ?? {}; } catch { cuerpo = {}; }
    cancelaciones.push({ id: m[1], cuerpo });
    const o = ordenes.find((x) => x.id === m[1]);
    if (responder409) return route.fulfill(json(409, { ok: false, error: 'orden_no_se_puede_cancelar', detalle: { estado: 'pagada' } }));
    o.estado = 'cancelada';
    o.actualizado_at = '2026-10-09T04:30:00.000Z';
    (eventos[o.id] ||= []).push({ id: 'e-c' + o.id, que: 'cancelada', quien_nombre: 'ana@ejemplo.mx', ts: o.actualizado_at, nota: cuerpo.nota ?? null });
    return route.fulfill(ok(o));
  }
  if ((m = r.match(/^\/orgs\/demo\/ordenes\/([^/]+)$/)) && metodo === 'GET') {
    const o = ordenes.find((x) => x.id === m[1]) || (m[1] === 'o4' ? deOtro : null);
    if (!o) return route.fulfill(json(404, { ok: false, error: 'no_encontrado' }));
    return route.fulfill(ok({ orden: o, eventos: eventos[o.id] || [], archivos: [], proveedor: null }));
  }
  return route.fulfill(ok({ filas: [] }));
});

const abrir = async (id) => {
  await p.goto(`${base}/#/orden/${id}`);
  await p.waitForSelector('#v-detalle:not(.oculto) h1', { timeout: 8000 });
};
const botones = () => p.locator('#b-cancelar').count();

console.log('· el botón sale sólo donde se puede cancelar, y sólo para quien la pidió');
await abrir('o1');
rev(await botones() === 1 && await p.locator('#b-cancelar').isVisible(), 'en una mía «Esperando pago» está «Cancelar orden»');
rev((await p.locator('#b-cancelar').innerText()).trim() === 'Cancelar orden', 'y se llama así');
const caja = await p.locator('#b-cancelar').boundingBox();
rev(caja && caja.height >= 44 && caja.width >= 300, 'grande para el pulgar', caja ? `${Math.round(caja.width)}×${Math.round(caja.height)}` : 'sin caja');
rev(await p.locator('#confirma-cancelar').isHidden(), 'la confirmación empieza plegada');
await abrir('o2');
rev(await botones() === 1, 'en una mía devuelta también');
await abrir('o3');
rev(await botones() === 0, 'en una pagada no');
await abrir('o5');
rev(await botones() === 0, 'en una ya cancelada no');
await abrir('o4');
rev(await botones() === 0, 'en la de otro (quien paga la abre aquí) no');

console.log('· picarlo pregunta aquí mismo, con el folio, y «No» no manda nada');
await abrir('o1');
await p.locator('#b-cancelar').tap();
await p.waitForSelector('#confirma-cancelar:not(.oculto)', { timeout: 3000 });
const pregunta = await p.locator('#confirma-cancelar').innerText();
rev(/¿Cancelar OC-000142\? Ya no se va a pagar\./.test(pregunta), 'dice qué folio y qué pasa', pregunta.split('\n')[0]);
rev(await p.getByLabel('Por qué (opcional)').count() === 1, 'el porqué es opcional y tiene su etiqueta');
rev(await p.getByRole('button', { name: 'Sí, cancelarla' }).isVisible() && await p.getByRole('button', { name: 'No', exact: true }).isVisible(), '«Sí, cancelarla» y «No»');
rev(await p.locator('#b-cancelar').isHidden(), 'el botón de arriba se esconde mientras pregunta');
for (const b of ['#b-si-cancelar', '#b-no-cancelar']) {
  const c = await p.locator(b).boundingBox();
  rev(c && c.height >= 44, `${b} se atina con el pulgar`, c ? `${Math.round(c.height)} px` : '');
}
rev(dialogos.length === 0, 'sin window.confirm');
if (CAPTURAS) {
  await p.getByLabel('Por qué (opcional)').fill('Ya lo trajo el cliente');
  await p.locator('#confirma-cancelar').scrollIntoViewIfNeeded();
  await p.screenshot({ path: join(CAPTURAS, 'supply101-cancelar-confirmar-390.png') });
  await p.getByLabel('Por qué (opcional)').fill('');
}
await p.getByRole('button', { name: 'No', exact: true }).tap();
rev(await p.locator('#confirma-cancelar').isHidden() && await p.locator('#b-cancelar').isVisible(), '«No» la pliega y regresa el botón');
rev(cancelaciones.length === 0, 'y no mandó nada a la API');

console.log('· «Sí, cancelarla» la cancela con su porqué');
await p.locator('#b-cancelar').tap();
await p.getByLabel('Por qué (opcional)').fill('  Ya lo trajo el cliente ');
await p.getByRole('button', { name: 'Sí, cancelarla' }).tap();
await p.waitForSelector('.marca.apagada', { timeout: 5000 }).catch(() => {});
rev(cancelaciones.length === 1 && cancelaciones[0].id === 'o1', 'un solo POST …/o1/cancelar', JSON.stringify(cancelaciones));
rev(cancelaciones[0]?.cuerpo?.nota === 'Ya lo trajo el cliente', 'con el porqué, sin espacios de sobra');
rev((await p.locator('#detalle .marca.apagada').first().innerText()).trim() === 'Cancelada', 'la orden dice «Cancelada»');
rev(await botones() === 0, 'y ya no ofrece cancelarla');
rev(/La cancelaste\. Ya no se va a pagar\./.test(await p.locator('#detalle').innerText()), 'dice qué pasó');
rev(/La cancelaste/.test(await p.locator('ol.historia').innerText()), 'y queda en su historia');
const estilo = await p.locator('#detalle .marca.apagada').first().evaluate((e) => { const s = getComputedStyle(e); return { fondo: s.backgroundColor, tinta: s.color }; });
rev(estilo.fondo === 'rgba(0, 0, 0, 0)', 'el chip es apagado: sin relleno', JSON.stringify(estilo));
if (CAPTURAS) await p.screenshot({ path: join(CAPTURAS, 'supply101-cancelada-detalle-390.png') });

console.log('· «Mis compras» dice «Cancelada», al final');
await p.goto(`${base}/#/`);
await p.waitForSelector('#lista .renglon', { timeout: 8000 });
const renglones = await p.locator('#lista .renglon').evaluateAll((rs) => rs.map((r) => r.innerText));
const canceladas = renglones.filter((t) => /\bCancelada\b/.test(t));
rev(canceladas.length === 2, 'las dos canceladas dicen «Cancelada»', `${canceladas.length}`);
rev(renglones.slice(-2).every((t) => /\bCancelada\b/.test(t)), 'y van al final de la lista');
const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
rev(ancho <= 391, 'a 390 no hay barrido horizontal', `${ancho}`);
if (CAPTURAS) await p.screenshot({ path: join(CAPTURAS, 'supply101-mis-compras-cancelada-390.png') });

console.log('· si alguien la pagó mientras tanto, se dice y la pregunta se queda');
responder409 = true;
await abrir('o2');
await p.locator('#b-cancelar').tap();
await p.getByRole('button', { name: 'Sí, cancelarla' }).tap();
await p.waitForSelector('#err-cancelar:not(.oculto)', { timeout: 5000 }).catch(() => {});
rev(/ya no se puede cancelar/.test(await p.locator('#err-cancelar').innerText()), 'en palabras', await p.locator('#err-cancelar').innerText());
rev(await p.locator('#confirma-cancelar').isVisible() && await p.getByRole('button', { name: 'Sí, cancelarla' }).isEnabled(), 'la confirmación sigue y se puede reintentar');
rev(cancelaciones.length === 2 && cancelaciones[1].cuerpo && !('nota' in cancelaciones[1].cuerpo), 'sin porqué no se manda nota');

await ctx.close(); await navegador.close(); servidor.close();
rev(dialogos.length === 0, 'nunca salió un diálogo del navegador', dialogos.join(' | '));
rev(errores.length === 0, 'sin errores de JavaScript', errores.join(' | '));
console.log(fallas ? `\n${fallas} falla(s).` : '\nTodo en orden.');
process.exit(fallas ? 1 : 0);
