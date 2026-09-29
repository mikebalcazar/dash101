/* La foto del ticket se achica antes de subir, y el papel se pinta perezoso.
 *
 * Mike, 29-sep-2026: «Hay que reducir el consumo de recursos de las apps en
 * MÓVIL. Es crítico.» supply101 subía la foto tal cual sale de la cámara
 * (3–12 MB) y la volvía a pintar completa en el detalle.
 *
 * Se mide en un navegador de verdad, con `publico/` servido como sitio
 * estático y sin API: lo que se prueba es `imagen.js` solo, con una foto
 * fabricada de 3000×4000 en un lienzo. Y se revisa en app.js que la foto
 * pase por ahí antes de subir y que el papel lleve `loading="lazy"`.
 *
 *     node supply101/pruebas/la-foto-se-achica.mjs
 */
import { createServer } from 'node:http';
import { readFile, readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PUBLICO = fileURLToPath(new URL('../publico/', import.meta.url));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml' };
const servidor = createServer((req, res) => {
  const ruta = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const archivo = join(PUBLICO, ruta === '/' ? 'index.html' : ruta);
  readFile(archivo, (e, cuerpo) => {
    if (e) { res.writeHead(404).end('no está'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream' });
    res.end(cuerpo);
  });
});
await new Promise((r) => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

let fallas = 0;
const rev = (ok, que, dato = '') => { if (!ok) fallas++; console.log(`  [${ok ? 'ok ' : 'MAL'}] ${que}${dato ? ' — ' + dato : ''}`); };

const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
const p = await navegador.newPage({ viewport: { width: 390, height: 844 } });
await p.route('**/s101/**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' }));
await p.goto(base + '/imagen.js');   // basta con estar en el origen para importar el módulo

console.log('· una foto de cámara, 3000×4000');
const r = await p.evaluate(async () => {
  const { achicarImagen, LADO_MAYOR } = await import('/imagen.js');
  const fabrica = async (w, h, tipo = 'image/png') => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d');
    for (let i = 0; i < 40; i++) { cx.fillStyle = `hsl(${i * 9},70%,50%)`; cx.fillRect((i * 97) % w, (i * 131) % h, 400, 300); }
    const blob = await new Promise((res) => c.toBlob(res, tipo, 0.95));
    return new File([blob], 'ticket.png', { type: tipo });
  };
  const medir = async (f) => { const b = await createImageBitmap(f); const m = { w: b.width, h: b.height }; b.close?.(); return m; };
  const grande = await fabrica(3000, 4000);
  const chica = await achicarImagen(grande);
  const mChica = await medir(chica);
  const yaChica = await fabrica(800, 600, 'image/jpeg');
  const pasa = await achicarImagen(yaChica);
  const pdf = new File([new Uint8Array([37, 80, 68, 70])], 'cot.pdf', { type: 'application/pdf' });
  const pdfPasa = await achicarImagen(pdf);
  return {
    LADO_MAYOR,
    grande: { size: grande.size, type: grande.type },
    chica: { size: chica.size, type: chica.type, name: chica.name, ...mChica },
    pasa: pasa === yaChica,
    pdfPasa: pdfPasa === pdf,
  };
});
rev(r.LADO_MAYOR === 1600, 'el lado mayor tope es 1600', String(r.LADO_MAYOR));
rev(Math.max(r.chica.w, r.chica.h) === 1600, 'la foto queda a 1600 en su lado mayor', `${r.chica.w}×${r.chica.h}`);
rev(Math.abs(r.chica.w / r.chica.h - 3000 / 4000) < 0.01, 'sin deformarla');
rev(r.chica.type === 'image/jpeg' && r.chica.name.endsWith('.jpg'), 'sale como JPEG', r.chica.name);
rev(r.chica.size < r.grande.size / 3, 'y pesa mucho menos', `${Math.round(r.grande.size / 1024)} KB → ${Math.round(r.chica.size / 1024)} KB`);
rev(r.pasa, 'una foto que ya es chica pasa tal cual: nunca se agranda');
rev(r.pdfPasa, 'un PDF pasa tal cual');

console.log('· la pantalla la usa');
const app = readFileSync(new URL('../publico/app.js', import.meta.url), 'utf8');
rev(/import \{ achicarImagen \} from '\.\/imagen\.js'/.test(app), 'app.js importa el achicador');
rev(/forma\.set\('archivo', await achicarImagen\(f\)\)/.test(app), 'y la foto pasa por él antes de subir');
rev(/<img src="\/s101\/orgs\/\$\{est\.org\.id\}\/archivos\/\$\{a\.id\}"[^>]*loading="lazy"[^>]*decoding="async"/.test(app), 'el papel del detalle se pinta perezoso');

await navegador.close(); servidor.close();
console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden.');
process.exit(fallas ? 1 : 0);
