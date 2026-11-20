/* De qué proyecto es una compra o un reembolso: se pregunta arriba, y se ve
 * después.
 *
 * Mike, 20-nov-2026, pidiendo un reembolso desde el teléfono: «hago el
 * reembolso, en dónde lo compré, todo, pero no hay un lugar donde diga de
 * qué proyecto es (…) sería bueno meter en reembolsos también lo del
 * proyecto». El campo SÍ existía —el formulario es el mismo para compras y
 * reembolsos— y el proyecto se guardaba. Lo que pasaba:
 *
 *   · en el formulario iba hasta abajo, después del proveedor y de toda la
 *     tarjeta de la cuenta bancaria: a 390 × 844 quedaba fuera de la vista,
 *     con «Gasto general» ya escogido, y nadie llegaba a tocarlo;
 *   · una vez pedida, ni «mis compras» ni el detalle decían el proyecto.
 *
 * Aquí se mide lo que se arregló, con un navegador a 390 × 844 y una API de
 * mentiras (lo que la API de verdad contesta se mide en suite101-api,
 * `pruebas/ordenes.spec.ts`, «0.113.0 · la orden dice de qué proyecto es»):
 *
 *   1. «Para qué proyecto» va ANTES que el proveedor y que la cuenta, y se
 *      alcanza a ver sin recorrer toda la pantalla.
 *   2. No ofrece proyectos cerrados.
 *   3. Lo escogido viaja en el pedido (`proyecto_id`), también en un
 *      reembolso; sin escoger, viaja null (gasto general).
 *      Y un pedido nuevo NO hereda el proyecto (ni el proveedor) del
 *      anterior: eso pasaba, y esta prueba fue la que lo encontró.
 *   4. La lista y el detalle dicen el proyecto, o «Gasto general»; y si la
 *      orden trae proyecto pero la API no mandó el nombre, no se inventa un
 *      «Gasto general» que no es.
 *
 *   node supply101/pruebas/el-proyecto-se-ve.mjs
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

const T = '2026-11-20T01:00:00.000Z';
const orden = (mas) => ({
  estado: 'en_buzon', tipo: 'reembolso', solicitante_usuario_id: 'u-ana', solicitante_correo: 'ana@ejemplo.mx', solicitante_nombre: 'Ana',
  proveedor_id: null, proveedor_nombre: null, moneda: 'MXN', con_factura: 0, iva: 0, tasa_iva: 0, fecha_maxima_pago: null, urgente: 0,
  nota_contador: null, movimiento_id: null, creado_at: T, actualizado_at: null, pagada_at: null,
  reembolso_clabe: '012180015621788594', reembolso_banco: 'BBVA', reembolso_beneficiario: 'Ana', ...mas,
});
const ordenes = [
  orden({ id: 'o-casa', folio: 'RE-000001', concepto: 'Tornillos', monto: 30000, subtotal: 30000, proyecto_id: 'py1', proyecto_nombre: 'Casa Uno' }),
  orden({ id: 'o-gral', folio: 'RE-000002', concepto: 'Gasolina', monto: 85000, subtotal: 85000, proyecto_id: null, proyecto_nombre: null }),
  // Lo que contestaría una API anterior a la 0.113.0: con proyecto y sin su nombre.
  orden({ id: 'o-vieja', folio: 'OC-000003', tipo: 'compra', concepto: 'Triplay', monto: 116000, subtotal: 116000, proyecto_id: 'py1' }),
];
const posts = [];

const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'es-MX' });
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push('excepción: ' + e));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });

await p.route('**/s101/**', async (route) => {
  const r = new URL(route.request().url()).pathname.replace(/^\/s101/, '');
  const metodo = route.request().method();
  if (r === '/yo') return route.fulfill(ok({ usuario: { id: 'u-ana', correo: 'ana@ejemplo.mx' }, orgs: [{ id: 'demo', nombre: 'Familia Ramírez', apps: ['dash', 'supply'] }] }));
  if (r === '/orgs/demo/ordenes/permisos') return route.fulfill(ok({ puede_comprar: true, puede_pagar: false, cuenta_reembolso: { clabe: '012180015621788594', banco: 'BBVA', beneficiario: 'Ana', actualizado_at: T, origen: 'roster', firmada: true, caratula: true } }));
  if (r === '/orgs/demo/ordenes' && metodo === 'GET') return route.fulfill(ok({ filas: ordenes }));
  if (r === '/orgs/demo/proveedores') return route.fulfill(ok({ filas: [{ id: 'pv1', nombre: 'OXXO' }] }));
  if (r === '/orgs/demo/proyectos') return route.fulfill(ok({ filas: [
    { id: 'py1', nombre: 'Casa Uno', estado: 'activo' }, { id: 'py2', nombre: 'Cocina Dos', estado: 'activo' }, { id: 'py9', nombre: 'Obra ya cerrada', estado: 'cerrado' },
  ] }));
  if (r === '/orgs/demo/ordenes' && metodo === 'POST') {
    const cuerpo = route.request().postDataJSON();
    posts.push(cuerpo);
    // Como la API (0.113.0): la orden vuelve con el nombre de su proyecto.
    const nombres = { py1: 'Casa Uno', py2: 'Cocina Dos' };
    const nueva = orden({ id: `o${posts.length}`, folio: `RE-00001${posts.length}`, tipo: cuerpo.tipo, concepto: cuerpo.concepto, monto: cuerpo.monto, subtotal: cuerpo.monto,
      proyecto_id: cuerpo.proyecto_id, proyecto_nombre: cuerpo.proyecto_id ? nombres[cuerpo.proyecto_id] ?? null : null });
    ordenes.push(nueva);
    return route.fulfill(ok(nueva, 201));
  }
  let m;
  if ((m = r.match(/^\/orgs\/demo\/ordenes\/([^/]+)$/)) && metodo === 'GET') {
    const o = ordenes.find((x) => x.id === m[1]);
    return o ? route.fulfill(ok({ orden: o, eventos: [], archivos: [], proveedor: null, reembolso_a: null })) : route.fulfill(json(404, { ok: false, error: 'no_encontrado' }));
  }
  return route.fulfill(ok({ filas: [] }));
});

const ir = async (hash, selector) => { await p.goto(`${base}/${hash}`); await p.waitForSelector(selector, { timeout: 8000 }); };
const arriba = async (sel) => (await p.locator(sel).evaluate((e) => e.getBoundingClientRect().top + window.scrollY));
const conProyectos = () => p.waitForFunction(() => document.querySelectorAll('#proyecto option').length > 1);

console.log('· en un reembolso, «para qué proyecto» va arriba: antes del proveedor y de la cuenta');
await ir('#/reembolso', '#v-pedir:not(.oculto) #monto');
await conProyectos();
const [yProyecto, yProveedor, yCuenta, yConcepto] = [await arriba('#proyecto'), await arriba('#proveedor'), await arriba('#bloque-cuenta'), await arriba('#concepto')];
rev(yConcepto < yProyecto && yProyecto < yProveedor && yProyecto < yCuenta, 'va después de «qué compraste» y antes del proveedor y de la cuenta bancaria', `concepto ${Math.round(yConcepto)} · proyecto ${Math.round(yProyecto)} · proveedor ${Math.round(yProveedor)} · cuenta ${Math.round(yCuenta)}`);
rev(yProyecto < 844, 'se alcanza a ver en la primera pantalla del teléfono, sin recorrer', `a ${Math.round(yProyecto)} px de 844`);
rev((await p.locator('#proyecto-l').innerText()) === 'Para qué proyecto fue', 'en reembolso pregunta «Para qué proyecto fue»', await p.locator('#proyecto-l').innerText());
const opciones = await p.locator('#proyecto option').allInnerTexts();
rev(opciones.join('|') === 'Gasto general, no es de un proyecto|Casa Uno|Cocina Dos', 'ofrece gasto general y los proyectos abiertos; el cerrado no', opciones.join(' · '));

console.log('· lo escogido viaja con el reembolso; sin escoger, viaja como gasto general');
await p.fill('#monto', '300');
await p.fill('#concepto', 'Tornillos para la casa');
await p.selectOption('#proyecto', 'py1');
await p.selectOption('#proveedor', 'pv1');
await p.uncheck('#con-factura');
await p.click('#b-pedir');
await p.locator('#detalle h1', { hasText: 'Tornillos para la casa' }).waitFor({ timeout: 8000 });
rev(posts.length === 1 && posts[0].tipo === 'reembolso' && posts[0].proyecto_id === 'py1', 'el reembolso se pidió con su proyecto', JSON.stringify({ tipo: posts[0]?.tipo, proyecto_id: posts[0]?.proyecto_id }));
rev(/Casa Uno/.test(await p.locator('#detalle [data-proyecto]').innerText()), 'y al terminar de pedirlo, su pantalla ya dice de qué proyecto fue');
await ir('#/reembolso', '#v-pedir:not(.oculto) #monto');
await conProyectos();
rev((await p.locator('#proyecto').inputValue()) === '', 'un pedido nuevo no hereda el proyecto del anterior');
rev((await p.locator('#proveedor').inputValue()) === '', 'ni el proveedor');
await p.fill('#monto', '850');
await p.fill('#concepto', 'Gasolina');
await p.uncheck('#con-factura');
await p.click('#b-pedir');
await p.locator('#detalle h1', { hasText: 'Gasolina' }).waitFor({ timeout: 8000 });
rev(posts.length === 2 && posts[1].proyecto_id === null, 'sin escoger proyecto va como gasto general (null)', JSON.stringify(posts[1]?.proyecto_id));
rev(posts[1]?.proveedor_id == null, 'y sin proveedor, que tampoco se escogió', JSON.stringify(posts[1]?.proveedor_id));

console.log('· en una compra es el mismo campo, en el mismo lugar');
await ir('#/pedir', '#v-pedir:not(.oculto) #monto');
await conProyectos();
rev((await p.locator('#proyecto-l').innerText()) === 'Para qué proyecto es', 'en compra pregunta «Para qué proyecto es»');
rev(await arriba('#proyecto') < await arriba('#proveedor'), 'también antes del proveedor');

console.log('· «mis compras» dice de qué proyecto es cada una');
await ir('#/', '#lista .renglon');
const renglon = (id) => p.locator(`#lista a[href="#/orden/${id}"]`);
rev((await renglon('o-casa').locator('[data-proyecto]').innerText()) === 'Casa Uno', 'el reembolso con proyecto dice «Casa Uno»');
rev((await renglon('o-gral').locator('[data-proyecto]').innerText()) === 'Gasto general', 'el que no es de ninguno dice «Gasto general»');
rev((await renglon('o-vieja').locator('[data-proyecto]').count()) === 0, 'con proyecto pero sin nombre no se inventa «Gasto general»');

console.log('· y el detalle también');
await ir('#/orden/o-casa', '#detalle h1');
rev(/De qué proyecto fue\s*Casa Uno/.test(await p.locator('#detalle [data-proyecto]').innerText()), 'el detalle del reembolso: «De qué proyecto fue · Casa Uno»', (await p.locator('#detalle [data-proyecto]').innerText()).replace(/\n/g, ' · '));
await ir('#/orden/o-gral', '#detalle h1');
rev(/Gasto general, no es de un proyecto/.test(await p.locator('#detalle [data-proyecto]').innerText()), 'el de gasto general lo dice');
await ir('#/orden/o-vieja', '#detalle h1');
rev((await p.locator('#detalle [data-proyecto]').count()) === 0, 'y con proyecto sin nombre, el renglón no sale');

const barrido = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
rev(barrido <= 1, 'sin barrido horizontal a 390', `${barrido} px`);
rev(errores.length === 0, 'cero errores de JavaScript', errores.join(' | '));

await navegador.close();
servidor.close();
console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO BIEN');
process.exit(fallas ? 1 : 0);
