/* Dar de alta un proveedor desde «Pedir» (29-sep-2026).
 *
 * Mike: «poner la opción de dar de alta a un nuevo proveedor, y dentro de los
 * datos deben poder agregar: nombre, RFC, número de cuenta (CLABE y banco y
 * beneficiario), email de contacto, teléfono de contacto, ubicación (si se
 * puede guardar una ubicación de Google Maps)».
 *
 * Se sirve `publico/` y se finge la API en `/s101/**`. Se mide: que el alta
 * mande a POST /orgs/:o/proveedores exactamente esos campos, que el proveedor
 * recién dado de alta quede escogido en la compra, que un 400 de la API con
 * `errores` por campo se enseñe señalando el campo, y que «📍 Aquí» arme la
 * liga de Google Maps con la ubicación del teléfono.
 *
 *   node supply101/pruebas/el-proveedor-nuevo.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PUBLICO = fileURLToPath(new URL('../publico/', import.meta.url));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
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

const proveedores = [{ id: 'pv-1', nombre: 'Maderas SA', nombre_norm: 'maderas sa' }];
const posts = [];
let rechazar = null;   // si está puesto, el POST contesta 400 con estos errores

const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: { latitude: 19.432608, longitude: -99.133209 }, permissions: ['geolocation'] });
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push('excepción: ' + e));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });

await p.route('**/s101/**', async (route) => {
  const u = new URL(route.request().url());
  const r = u.pathname.replace(/^\/s101/, '');
  const metodo = route.request().method();
  const cuerpo = route.request().postDataJSON?.() ?? {};
  if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'ana@ejemplo.mx' }, orgs: [{ id: 'demo', nombre: 'Demo', apps: ['dash', 'supply'] }] }));
  if (r === '/orgs/demo/negocios') return route.fulfill(ok({ filas: [{ id: 'n-1', nombre: 'Taller' }] }));
  if (r === '/orgs/demo/ordenes/permisos') return route.fulfill(ok({ puede_comprar: true }));
  if (r === '/orgs/demo/ordenes') return route.fulfill(ok({ ordenes: [], filas: [] }));
  if (r === '/orgs/demo/proyectos') return route.fulfill(ok({ filas: [] }));
  if (r === '/orgs/demo/partidas') return route.fulfill(ok({ filas: [] }));
  if (r === '/orgs/demo/proveedores' && metodo === 'GET') return route.fulfill(ok({ filas: proveedores }));
  if (r === '/orgs/demo/proveedores' && metodo === 'POST') {
    posts.push(cuerpo);
    if (rechazar) return route.fulfill(json(400, { ok: false, error: 'datos_invalidos', detalle: { errores: rechazar } }));
    const pv = { id: 'pv-' + (proveedores.length + 1), ...cuerpo, nombre_norm: String(cuerpo.nombre).toLowerCase(), creado_en_app: 'supply101' };
    proveedores.push(pv);
    return route.fulfill(ok(pv, 201));
  }
  return route.fulfill(ok({ filas: [] }));
});

await p.goto(base + '/#/pedir');
await p.waitForSelector('#v-pedir:not(.oculto)', { timeout: 8000 });
await p.waitForFunction(() => document.querySelectorAll('#proveedor option').length >= 2, null, { timeout: 8000 });

console.log('· el alta vive dentro de «Pedir»');
rev(await p.locator('#b-alta-proveedor').isVisible(), 'hay «Dar de alta un proveedor nuevo»');
rev(await p.locator('#alta-proveedor').isHidden(), 'y el formulario del alta está plegado');
await p.locator('#proveedor-nuevo').fill('Ferretería La Esquina');
await p.locator('#b-alta-proveedor').click();
rev(await p.locator('#alta-proveedor').isVisible(), 'al picarlo se abre');
rev((await p.locator('#pv-nombre').inputValue()) === 'Ferretería La Esquina', 'y aprovecha el nombre que ya se había escrito en «Otro»');
for (const c of ['rfc', 'correo', 'telefono', 'clabe', 'banco', 'beneficiario', 'direccion', 'maps']) rev(await p.locator('#pv-' + c).isVisible(), `pide ${c}`);

console.log('· «📍 Aquí» arma la liga de Google Maps con la ubicación');
await p.locator('#pv-aqui').click();
await p.waitForFunction(() => /google\.com\/maps\?q=/.test(document.querySelector('#pv-maps').value), null, { timeout: 5000 }).catch(() => {});
const liga = await p.locator('#pv-maps').inputValue();
rev(/^https:\/\/www\.google\.com\/maps\?q=19\.4326\d\d,-99\.1332\d\d$/.test(liga), 'la liga trae las coordenadas del teléfono', liga);
rev(await p.locator('#pv-maps-ver').isVisible() && (await p.locator('#pv-maps-ver').getAttribute('href')) === liga, 'y se ofrece «Abrir en Google Maps»');

console.log('· lo que manda al guardar');
await p.locator('#pv-rfc').fill('fle010101ab1');
await p.locator('#pv-correo').fill('ventas@esquina.mx');
await p.locator('#pv-telefono').fill('55 1234 5678');
await p.locator('#pv-clabe').fill('012 180 00123456789 0');
await p.locator('#pv-banco').fill('BBVA');
await p.locator('#pv-beneficiario').fill('Ferretería La Esquina SA');
await p.locator('#pv-direccion').fill('Av. Central 10, CDMX');
await p.locator('#pv-guardar').click();
await p.waitForFunction(() => document.querySelector('#alta-proveedor').classList.contains('oculto'), null, { timeout: 5000 }).catch(() => {});
const m = posts[0] || {};
rev(posts.length === 1, 'un solo POST a proveedores');
rev(m.nombre === 'Ferretería La Esquina' && m.rfc === 'FLE010101AB1' && m.correo === 'ventas@esquina.mx' && m.telefono === '55 1234 5678', 'con nombre, RFC (en mayúsculas), correo y teléfono', JSON.stringify(m));
rev(m.clabe === '012180001234567890' && m.banco === 'BBVA' && m.beneficiario === 'Ferretería La Esquina SA', 'con la CLABE sin espacios, banco y beneficiario');
rev(m.direccion === 'Av. Central 10, CDMX' && m.maps_url === liga, 'con dirección y la liga de Google Maps');
rev(Object.keys(m).sort().join(',') === 'banco,beneficiario,clabe,correo,direccion,maps_url,nombre,rfc,telefono', 'y nada más', Object.keys(m).sort().join(','));
rev(await p.locator('#alta-proveedor').isHidden(), 'el formulario se pliega');
rev((await p.locator('#proveedor').inputValue()) === 'pv-2', 'y el proveedor nuevo queda escogido para esta compra');
rev(await p.locator('#proveedor-nuevo').isHidden(), 'sin el campo de «Otro» estorbando');
rev(/dado de alta/.test(await p.locator('#err-pedir').innerText()), 'y lo dice');

console.log('· un rechazo de la API señala el campo');
rechazar = { clabe: 'La CLABE son 18 dígitos y no cuadra su dígito verificador.', rfc: 'El RFC son 12 o 13 caracteres: letras, fecha y homoclave.' };
await p.locator('#b-alta-proveedor').click();
rev((await p.locator('#pv-nombre').inputValue()) === '', 'el alta abre limpia');
await p.locator('#pv-guardar').click();
rev(/Escribe el nombre/.test(await p.locator('#err-proveedor').innerText()) && posts.length === 1, 'sin nombre no se manda nada');
await p.locator('#pv-nombre').fill('Pinturas Norte');
await p.locator('#pv-clabe').fill('123');
await p.locator('#pv-guardar').click();
await p.waitForFunction(() => document.querySelector('#err-proveedor').textContent.includes('CLABE'), null, { timeout: 5000 }).catch(() => {});
rev(/18 dígitos/.test(await p.locator('#err-proveedor').innerText()) && /RFC/.test(await p.locator('#err-proveedor').innerText()), 'enseña lo que dijo la API', await p.locator('#err-proveedor').innerText());
rev((await p.locator('#pv-clabe').getAttribute('class') || '').includes('campo-mal') && (await p.locator('#pv-rfc').getAttribute('class') || '').includes('campo-mal'), 'y marca los campos malos');
rev(await p.locator('#alta-proveedor').isVisible() && (await p.locator('#pv-nombre').inputValue()) === 'Pinturas Norte', 'sin cerrar el formulario ni perder lo escrito');

await ctx.close(); await navegador.close(); servidor.close();
rev(errores.length === 0, 'sin errores de JavaScript', errores.join(' | '));
console.log(fallas ? `\n${fallas} falla(s).` : '\nTodo en orden.');
process.exit(fallas ? 1 : 0);
