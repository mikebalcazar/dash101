/* Cuánto JavaScript viaja en el arranque: lo que el layout carga en TODAS
 * las pantallas. Se lee de lo construido (`.next/app-build-manifest.json`).
 *
 *   npm run build && node scripts/peso-arranque.mjs [tope_kb]
 *
 * Con un tope, sale con error si se pasa: así una construcción que vuelva a
 * meter Firebase (o cualquier otra cosa gorda) no llega callada. */
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(new URL('..', import.meta.url).pathname);
const manifiesto = JSON.parse(readFileSync(path.join(raiz, '.next/app-build-manifest.json'), 'utf8'));
const capa = manifiesto.pages['/layout'] || [];
let total = 0;
const filas = [];
for (const f of capa) {
  if (!f.endsWith('.js')) continue;
  const bytes = statSync(path.join(raiz, '.next', f)).size;
  total += bytes;
  filas.push([bytes, f]);
}
filas.sort((a, b) => b[0] - a[0]);
for (const [bytes, f] of filas) console.log(`${String(Math.round(bytes / 1024)).padStart(6)} KB  ${f}`);
console.log(`\n${Math.round(total / 1024)} KB de JavaScript en el arranque (${filas.length} archivos)`);
const tope = Number(process.argv[2]);
if (tope && total > tope * 1024) { console.error(`Se pasa del tope de ${tope} KB.`); process.exit(1); }
