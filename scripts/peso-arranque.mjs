/* Cuánto JavaScript viaja en el arranque: lo que el layout carga en TODAS
 * las pantallas.
 *
 *   npm run build && node scripts/peso-arranque.mjs [tope_kb]
 *
 * Con un tope, sale con error si se pasa: así una construcción que vuelva a
 * meter Firebase (o cualquier otra cosa gorda) no llega callada.
 *
 * DE DÓNDE SE LEE (18-nov-2026, Next 16). Hasta Next 15 lo decía
 * `.next/app-build-manifest.json` (`pages['/layout']`); Next 16 ya no lo
 * escribe. Ahora se lee lo que de verdad baja un navegador: los `<script
 * src>` de cada pantalla ya construida (`.next/server/app/**\/*.html`), y se
 * queda con los que traen TODAS. Eso es el arranque: lo que paga cualquier
 * pantalla antes de pintar lo suyo. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(new URL('..', import.meta.url).pathname);
const app = path.join(raiz, '.next/server/app');

const paginas = [];
const recorrer = (dir) => {
  for (const n of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, n.name);
    if (n.isDirectory()) recorrer(p);
    else if (n.name.endsWith('.html') && !n.name.startsWith('_')) paginas.push(p);
  }
};
recorrer(app);
if (!paginas.length) { console.error('No hay pantallas construidas en .next/server/app: corre `npm run build` antes.'); process.exit(1); }

/* Los `noModule` (los polyfills) no los baja un navegador de hoy: sólo uno
 * que no entiende módulos. No cuentan para el arranque de nadie que use
 * dash101. */
const scriptsDe = (html) => new Set([...html.matchAll(/<script([^>]*)\ssrc="([^"]+\.js)"([^>]*)>/g)]
  .filter((m) => !/noModule/i.test(m[1] + m[3])).map((m) => m[2]));
let comunes = null;
for (const p of paginas) {
  const s = scriptsDe(readFileSync(p, 'utf8'));
  comunes = comunes ? new Set([...comunes].filter((x) => s.has(x))) : s;
}

let total = 0;
const filas = [];
for (const src of comunes ?? []) {
  const rel = src.replace(/^.*\/_next\//, '');
  const bytes = statSync(path.join(raiz, '.next', rel)).size;
  total += bytes;
  filas.push([bytes, rel]);
}
filas.sort((a, b) => b[0] - a[0]);
for (const [bytes, f] of filas) console.log(`${String(Math.round(bytes / 1024)).padStart(6)} KB  ${f}`);
console.log(`\n${Math.round(total / 1024)} KB de JavaScript en el arranque (${filas.length} archivos, comunes a ${paginas.length} pantallas)`);
const tope = Number(process.argv[2]);
if (tope && total > tope * 1024) { console.error(`Se pasa del tope de ${tope} KB.`); process.exit(1); }
