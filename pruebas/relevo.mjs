/* Un puente local para poder manejar con el navegador un sitio HTTPS desde
 * una sesión de Claude Code.
 *
 * POR QUÉ EXISTE
 *
 * En la máquina del chat, el Chromium de Playwright **no puede hacer HTTPS**:
 * contra cualquier host, con proxy o sin él, `ERR_CONNECTION_RESET`. Node y
 * curl sí salen. Se midió el 12-sep-2026 contra tres hosts distintos. Así que
 * el navegador habla HTTP plano con `127.0.0.1` y este guion reenvía cada
 * petición, con Node, al sitio de verdad.
 *
 * Es un relevo, no una imitación: lo que se prueba es el Worker publicado.
 * Lo único que se toca por el camino es la galleta —quitarle `Secure`, que en
 * `http://127.0.0.1` el navegador tiraría— y las cabeceras que un relevo no
 * puede pasar tal cual (`content-encoding`, porque `fetch` ya descomprimió).
 *
 * En el corredor de GitHub no hace falta: ahí el navegador sale solo y la
 * prueba apunta a la dirección de verdad.
 *
 *   node pruebas/relevo.mjs https://dash101-staging.mike-929.workers.dev [puerto]
 */

import { createServer } from 'node:http';

const DESTINO = (process.argv[2] || process.env.URL_DESTINO || '').replace(/\/$/, '');
const PUERTO = Number(process.argv[3] || process.env.PUERTO || 8797);
if (!DESTINO) {
  console.error('uso: node pruebas/relevo.mjs <https://destino> [puerto]');
  process.exit(1);
}
const ORIGEN_LOCAL = `http://127.0.0.1:${PUERTO}`;

const NO_SE_RELAYAN = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie']);

const servidor = createServer(async (pet, res) => {
  const trozos = [];
  for await (const t of pet) trozos.push(t);

  const cabeceras = new Headers();
  for (const [k, v] of Object.entries(pet.headers)) {
    if (typeof v !== 'string') continue;
    const n = k.toLowerCase();
    if (n === 'host' || n === 'connection' || n === 'content-length') continue;
    // `accept-encoding` NO se reenvía. Chromium pide «gzip, deflate, br, zstd»,
    // Cloudflare contesta en zstd, el `fetch` de Node no lo descomprime y el
    // navegador acababa recibiendo bytes comprimidos sin cabecera: basura.
    // Se pide sin compresión y ya. Medido el 12-sep: la portada llegaba como
    // «(�/�X_��t;0i4n…» y ningún input existía.
    if (n === 'accept-encoding') continue;
    cabeceras.set(k, v);
  }
  cabeceras.set('accept-encoding', 'identity');

  let r;
  try {
    r = await fetch(DESTINO + pet.url, {
      method: pet.method,
      headers: cabeceras,
      body: trozos.length ? Buffer.concat(trozos) : undefined,
      redirect: 'manual',
    });
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`el relevo no alcanzó ${DESTINO}${pet.url}: ${e.cause?.code || e.message}`);
    return;
  }

  const salida = {};
  for (const [k, v] of r.headers) {
    const n = k.toLowerCase();
    if (NO_SE_RELAYAN.has(n)) continue;
    // Una redirección absoluta al sitio de verdad se trae de vuelta al relevo,
    // si no el navegador se va a HTTPS y muere.
    salida[k] = n === 'location' ? v.replace(DESTINO, ORIGEN_LOCAL) : v;
  }
  const puestas = r.headers.getSetCookie?.() ?? [];
  if (puestas.length) {
    salida['Set-Cookie'] = puestas.map((c) => c.replace(/;\s*Secure/gi, '').replace(/SameSite=None/gi, 'SameSite=Lax'));
  }
  res.writeHead(r.status, salida);
  res.end(Buffer.from(await r.arrayBuffer()));
});

export const arrancar = (puerto = PUERTO) =>
  new Promise((listo, falla) => {
    servidor.once('error', (e) => falla(new Error(
      e.code === 'EADDRINUSE' ? `el puerto ${puerto} ya está ocupado` : e.message)));
    servidor.listen(puerto, '127.0.0.1', () => listo(servidor));
  });
export const cerrar = () => new Promise((listo) => servidor.close(listo));

if (import.meta.url === `file://${process.argv[1]}`) {
  arrancar().then(() => console.log(`relevo en ${ORIGEN_LOCAL}  →  ${DESTINO}`));
}
