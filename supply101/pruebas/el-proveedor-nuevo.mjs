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
 * Desde el 30-sep-2026 (Mike: «más de una cuenta bancaria con un ALIAS» y
 * «adjuntar uno o más documentos de respaldo»): las cuentas son filas de
 * proveedor_cuentas (una por cuenta, con alias) y los documentos van a
 * archivos con de_tabla = 'proveedores'. Se mide que el alta mande el
 * proveedor, luego cada cuenta, luego cada documento; que una CLABE
 * rechazada señale SU fila sin volver a crear el proveedor; y que la ficha
 * de un proveedor ya existente enseñe sus cuentas y documentos, agregue una
 * cuenta y quite un documento.
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
const cuentas = [];    // proveedor_cuentas fingidas
let rechazarCuenta = null;
const archivos = [];   // archivos fingidos
const borrados = [];   // DELETEs que llegaron

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
  let cuerpo = {};
  try { cuerpo = route.request().postDataJSON?.() ?? {}; } catch { cuerpo = {}; }  // multipart (los documentos) no es JSON
  if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'ana@ejemplo.mx' }, orgs: [{ id: 'demo', nombre: 'Demo', apps: ['dash', 'supply'] }] }));
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
  if (r === '/orgs/demo/proveedor_cuentas' && metodo === 'POST') {
    if (rechazarCuenta) return route.fulfill(json(400, { ok: false, error: 'datos_invalidos', detalle: { errores: rechazarCuenta } }));
    const c = { id: 'c-' + (cuentas.length + 1), ...cuerpo, creado_at: new Date().toISOString() };
    cuentas.push(c);
    return route.fulfill(ok(c, 201));
  }
  if (r === '/orgs/demo/proveedor_cuentas' && metodo === 'GET') return route.fulfill(ok({ filas: cuentas.filter((c) => c.proveedor_id === u.searchParams.get('proveedor_id')) }));
  if (r === '/orgs/demo/archivos' && metodo === 'POST') {
    const crudo = route.request().postData() || '';
    const de_id = (crudo.match(/name="de_id"\r\n\r\n([^\r]+)/) || [])[1];
    const de_tabla = (crudo.match(/name="de_tabla"\r\n\r\n([^\r]+)/) || [])[1];
    const nombre = (crudo.match(/name="archivo"; filename="([^"]+)"/) || [])[1];
    const a = { id: 'a-' + (archivos.length + 1), nombre, de_tabla, de_id, mime: 'application/pdf', creado_at: new Date().toISOString() };
    archivos.push(a);
    return route.fulfill(ok(a, 201));
  }
  if (r === '/orgs/demo/archivos' && metodo === 'GET') return route.fulfill(ok({ filas: archivos.filter((a) => a.de_tabla === u.searchParams.get('de_tabla') && a.de_id === u.searchParams.get('de_id')) }));
  let m;
  if ((m = r.match(/^\/orgs\/demo\/(archivos|proveedor_cuentas)\/([^/]+)$/)) && metodo === 'DELETE') {
    borrados.push(`${m[1]}/${m[2]}`);
    const lista = m[1] === 'archivos' ? archivos : cuentas;
    const i = lista.findIndex((x) => x.id === m[2]);
    if (i >= 0) lista.splice(i, 1);
    return route.fulfill(ok({ borrado: true }));
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
for (const c of ['rfc', 'correo', 'telefono', 'direccion', 'maps', 'docs']) rev(await p.locator('#pv-' + c).isVisible(), `pide ${c}`);
rev((await p.locator('#pv-cuentas .pv-cuenta').count()) === 1 && (await p.locator('#pv-cuentas .c-alias').first().inputValue()) === 'Principal', 'y una cuenta de fábrica, con alias «Principal»');
for (const c of ['alias', 'clabe', 'banco', 'beneficiario']) rev(await p.locator('#pv-cuentas .c-' + c).first().isVisible(), `la cuenta pide ${c}`);

console.log('· «📍 Aquí» arma la liga de Google Maps con la ubicación');
await p.locator('#pv-aqui').click();
await p.waitForFunction(() => /google\.com\/maps\?q=/.test(document.querySelector('#pv-maps').value), null, { timeout: 5000 }).catch(() => {});
const liga = await p.locator('#pv-maps').inputValue();
rev(/^https:\/\/www\.google\.com\/maps\?q=19\.4326\d\d,-99\.1332\d\d$/.test(liga), 'la liga trae las coordenadas del teléfono', liga);
rev(await p.locator('#pv-maps-ver').isVisible() && (await p.locator('#pv-maps-ver').getAttribute('href')) === liga, 'y se ofrece «Abrir en Google Maps»');

console.log('· lo que manda al guardar');
await p.locator('#pv-rfc').fill('fle010101ab1');
rev((await p.locator('#pv-tipo').inputValue()) === 'materiales', 'el tipo arranca en materiales');
await p.locator('#pv-tipo').selectOption('servicios');
await p.locator('#pv-correo').fill('ventas@esquina.mx');
await p.locator('#pv-telefono').fill('55 1234 5678');
await p.locator('#pv-cuentas .c-clabe').first().fill('012 180 00123456789 0');
await p.locator('#pv-cuentas .c-banco').first().fill('BBVA');
await p.locator('#pv-cuentas .c-beneficiario').first().fill('Ferretería La Esquina SA');
await p.locator('#pv-otra-cuenta').click();
rev((await p.locator('#pv-cuentas .pv-cuenta').count()) === 2, '«＋ Otra cuenta» agrega una fila más');
await p.locator('#pv-cuentas .c-alias').nth(1).fill('Nómina');
await p.locator('#pv-cuentas .c-clabe').nth(1).fill('002180009988776655');
await p.locator('#pv-cuentas .c-banco').nth(1).fill('Banorte');
await p.locator('#pv-direccion').fill('Av. Central 10, CDMX');
await p.locator('#pv-docs').setInputFiles([{ name: 'caratula.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 caratula') }]);
rev(/caratula\.pdf/.test(await p.locator('#pv-docs-lista').innerText()), 'el documento escogido se enseña por nombre');
await p.locator('#pv-guardar').click();
await p.waitForFunction(() => document.querySelector('#alta-proveedor').classList.contains('oculto'), null, { timeout: 5000 }).catch(() => {});
const m = posts[0] || {};
rev(posts.length === 1, 'un solo POST a proveedores');
rev(m.nombre === 'Ferretería La Esquina' && m.rfc === 'FLE010101AB1' && m.correo === 'ventas@esquina.mx' && m.telefono === '55 1234 5678', 'con nombre, RFC (en mayúsculas), correo y teléfono', JSON.stringify(m));
rev(m.direccion === 'Av. Central 10, CDMX' && m.maps_url === liga, 'con dirección y la liga de Google Maps');
rev(m.tipo === 'servicios', 'con el tipo escogido (servicios: un contratista)', m.tipo);
rev(Object.keys(m).sort().join(',') === 'correo,direccion,maps_url,nombre,rfc,telefono,tipo', 'y nada más: la cuenta ya no va en columnas', Object.keys(m).sort().join(','));
rev(cuentas.length === 2 && cuentas.every((c) => c.proveedor_id === 'pv-2'), 'dos POST a proveedor_cuentas, colgadas del proveedor nuevo', JSON.stringify(cuentas.map((c) => c.proveedor_id)));
rev(cuentas[0].alias === 'Principal' && cuentas[0].clabe === '012180001234567890' && cuentas[0].banco === 'BBVA' && cuentas[0].beneficiario === 'Ferretería La Esquina SA', 'la primera con su alias, la CLABE sin espacios, banco y beneficiario', JSON.stringify(cuentas[0]));
rev(cuentas[1].alias === 'Nómina' && cuentas[1].clabe === '002180009988776655' && cuentas[1].banco === 'Banorte', 'y la segunda con el suyo', JSON.stringify(cuentas[1]));
rev(archivos.length === 1 && archivos[0].de_tabla === 'proveedores' && archivos[0].de_id === 'pv-2' && archivos[0].nombre === 'caratula.pdf', 'el documento se subió colgado del proveedor', JSON.stringify(archivos));
rev(await p.locator('#alta-proveedor').isHidden(), 'el formulario se pliega');
rev((await p.locator('#proveedor').inputValue()) === 'pv-2', 'y el proveedor nuevo queda escogido para esta compra');
rev(await p.locator('#proveedor-nuevo').isHidden(), 'sin el campo de «Otro» estorbando');
rev(/dado de alta con 2 cuentas y 1 documento/.test(await p.locator('#err-pedir').innerText()), 'y lo dice, con cuántas cuentas y documentos', await p.locator('#err-pedir').innerText());

console.log('· la ficha del proveedor ya existente: cuentas y documentos');
rev(await p.locator('#b-ficha-proveedor').isVisible(), 'con un proveedor escogido se ofrece «Ver la ficha»');
await p.locator('#b-ficha-proveedor').click();
await p.waitForSelector('#ficha-proveedor:not(.oculto)', { timeout: 5000 });
await p.waitForFunction(() => document.querySelectorAll('#fc-cuentas li[data-cuenta]').length === 2, null, { timeout: 5000 }).catch(() => {});
rev((await p.locator('#fc-nombre').innerText()) === 'Ferretería La Esquina', 'la ficha dice de quién es');
rev((await p.locator('#fc-cuentas li[data-cuenta]').count()) === 2 && /Nómina/.test(await p.locator('#fc-cuentas').innerText()), 'enseña sus dos cuentas con alias');
rev(/012 180 00123456789 0/.test(await p.locator('#fc-cuentas').innerText()), 'y la CLABE en bloques para leerla');
rev((await p.locator('#fc-docs-lista li[data-doc]').count()) === 1 && (await p.locator('#fc-docs-lista a').getAttribute('href')) === '/s101/orgs/demo/archivos/a-1', 'y su documento, con liga para abrirlo');
await p.locator('#fc-alias').fill('Dólares');
await p.locator('#fc-clabe').fill('014 180 00112233445 9');
await p.locator('#fc-banco').fill('Santander');
await p.locator('#fc-agregar').click();
await p.waitForFunction(() => document.querySelectorAll('#fc-cuentas li[data-cuenta]').length === 3, null, { timeout: 5000 }).catch(() => {});
rev(cuentas.length === 3 && cuentas[2].alias === 'Dólares' && cuentas[2].clabe === '014180001122334459' && cuentas[2].proveedor_id === 'pv-2', 'desde la ficha se agrega una cuenta más', JSON.stringify(cuentas[2]));
rev((await p.locator('#fc-cuentas li[data-cuenta]').count()) === 3 && (await p.locator('#fc-alias').inputValue()) === '', 'la lista se repinta y el renglón queda limpio');
p.once('dialog', (d) => d.accept());
await p.locator('#fc-docs-lista [data-quitar-doc]').click();
await p.waitForFunction(() => document.querySelectorAll('#fc-docs-lista li[data-doc]').length === 0, null, { timeout: 5000 }).catch(() => {});
rev(borrados.includes('archivos/a-1') && (await p.locator('#fc-docs-lista li[data-doc]').count()) === 0, 'quitar un documento manda DELETE y desaparece', JSON.stringify(borrados));
await p.locator('#fc-docs').setInputFiles([{ name: 'tarjeta.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('ffd8ffe0', 'hex') }]).catch(() => {});
await p.locator('#fc-cerrar').click();
rev(await p.locator('#ficha-proveedor').isHidden() && await p.locator('#b-ficha-proveedor').isVisible(), 'cerrar la ficha la pliega y deja el botón');

console.log('· un rechazo de la API señala el campo');
rechazar = { rfc: 'El RFC son 12 o 13 caracteres: letras, fecha y homoclave.' };
await p.locator('#b-alta-proveedor').click();
rev((await p.locator('#pv-nombre').inputValue()) === '' && (await p.locator('#pv-cuentas .pv-cuenta').count()) === 1 && (await p.locator('#pv-docs-lista').innerText()).trim() === '', 'el alta abre limpia: una cuenta vacía y sin documentos');
rev((await p.locator('#pv-tipo').inputValue()) === 'materiales', 'y el tipo vuelve a materiales');
await p.locator('#pv-guardar').click();
rev(/Escribe el nombre/.test(await p.locator('#err-proveedor').innerText()) && posts.length === 1, 'sin nombre no se manda nada');
await p.locator('#pv-nombre').fill('Pinturas Norte');
await p.locator('#pv-cuentas .c-clabe').first().fill('123');
await p.locator('#pv-guardar').click();
await p.waitForFunction(() => document.querySelector('#err-proveedor').textContent.includes('RFC'), null, { timeout: 5000 }).catch(() => {});
rev(/RFC/.test(await p.locator('#err-proveedor').innerText()), 'enseña lo que dijo la API del proveedor', await p.locator('#err-proveedor').innerText());
rev((await p.locator('#pv-rfc').getAttribute('class') || '').includes('campo-mal'), 'y marca el campo malo');
rev(await p.locator('#alta-proveedor').isVisible() && (await p.locator('#pv-nombre').inputValue()) === 'Pinturas Norte', 'sin cerrar el formulario ni perder lo escrito');
rev(cuentas.length === 3, 'y no se mandó ninguna cuenta: el proveedor no quedó');

console.log('· una CLABE que la API rechaza señala SU fila, y al corregir no se crea otro proveedor');
rechazar = null;
rechazarCuenta = { clabe: 'La CLABE no cuadra: son 18 dígitos y el último los verifica.' };
await p.locator('#pv-guardar').click();
await p.waitForFunction(() => document.querySelector('#err-proveedor').textContent.includes('CLABE'), null, { timeout: 5000 }).catch(() => {});
// posts: el alta buena (1), el RFC rechazado (2, la API falsa lo apunta antes de decir que no) y éste (3).
rev(posts.length === 3 && /Cuenta «Principal»/.test(await p.locator('#err-proveedor').innerText()) && /no cuadra/.test(await p.locator('#err-proveedor').innerText()), 'el proveedor se creó y el error dice de qué cuenta es', await p.locator('#err-proveedor').innerText());
rev((await p.locator('#pv-cuentas .c-clabe').first().getAttribute('class') || '').includes('campo-mal'), 'y marca la CLABE de esa fila');
rechazarCuenta = null;
await p.locator('#pv-cuentas .c-clabe').first().fill('012180001234567890');
await p.locator('#pv-guardar').click();
await p.waitForFunction(() => document.querySelector('#alta-proveedor').classList.contains('oculto'), null, { timeout: 5000 }).catch(() => {});
rev(posts.length === 3 && cuentas.length === 4 && cuentas[3].proveedor_id === 'pv-3', 'al reintentar no se crea otro proveedor: sólo se guarda la cuenta', `posts ${posts.length}, cuentas ${cuentas.length}`);
rev((await p.locator('#proveedor').inputValue()) === 'pv-3', 'y Pinturas Norte queda escogido');

await ctx.close(); await navegador.close(); servidor.close();
rev(errores.length === 0, 'sin errores de JavaScript', errores.join(' | '));
console.log(fallas ? `\n${fallas} falla(s).` : '\nTodo en orden.');
process.exit(fallas ? 1 : 0);
