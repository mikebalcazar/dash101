/* El Worker de supply101, pero en esta máquina, para poder probarlo con un
 * navegador de verdad.
 *
 * `wrangler dev` no sirve aquí: el *service binding* a `suite101-api` sólo
 * existe dentro de Cloudflare. Esto hace lo MISMO que `worker/index.js`
 * —servir `publico/` y reenviar `/s101/*` con `X-App: supply101`— pero por HTTP
 * contra la API de STAGING. Nunca contra producción: la dirección por omisión
 * es la de staging y hay que escribir la otra a mano para cambiarla.
 *
 *   node supply101/pruebas/servidor.mjs [puerto]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLICO = fileURLToPath(new URL('../publico/', import.meta.url));
const API = process.env.API_ORIGEN || 'https://suite101-api-staging.mike-929.workers.dev';
const PUERTO = Number(process.argv[2] || process.env.PUERTO || 8798);

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json',
};

const servidor = createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PUERTO}`);

  if (u.pathname === '/s101' || u.pathname.startsWith('/s101/')) {
    const destino = API + (u.pathname.slice('/s101'.length) || '/') + u.search;
    const cabeceras = { ...req.headers, 'X-App': 'supply101', host: new URL(API).host };
    delete cabeceras['accept-encoding'];
    const trozos = [];
    for await (const t of req) trozos.push(t);
    const r = await fetch(destino, {
      method: req.method,
      headers: cabeceras,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(trozos),
      redirect: 'manual',
    });
    const salida = {};
    r.headers.forEach((v, k) => {
      if (k === 'content-encoding' || k === 'content-length') return;
      /* La galleta de la suite viene `Secure; SameSite=None`, que es lo
       * correcto en Cloudflare. En `http://127.0.0.1` el navegador la tira
       * dos veces: por `Secure` sin https, y porque `SameSite=None` EXIGE
       * `Secure`. Así que aquí, y sólo aquí, se le quita `Secure` y se le
       * baja a `SameSite=Lax` —todo es del mismo origen en esta máquina—.
       * Costó media hora encontrarlo: la API contestaba 200 al entrar y 401
       * a la siguiente llamada, como si la sesión no se hubiera abierto. */
      if (k === 'set-cookie') {
        salida[k] = v.replace(/;\s*Secure/gi, '').replace(/SameSite=None/gi, 'SameSite=Lax');
        return;
      }
      salida[k] = v;
    });
    res.writeHead(r.status, salida);
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }

  let ruta = normalize(u.pathname).replace(/^(\.\.[/\\])+/, '');
  if (ruta === '/' || ruta === '') ruta = '/index.html';
  try {
    const cuerpo = await readFile(join(PUBLICO, ruta));
    res.writeHead(200, { 'Content-Type': TIPOS[extname(ruta)] || 'application/octet-stream' });
    res.end(cuerpo);
  } catch {
    // Una sola página: cualquier dirección que no sea archivo devuelve el
    // index, igual que `not_found_handling = single-page-application`.
    res.writeHead(200, { 'Content-Type': TIPOS['.html'] });
    res.end(await readFile(join(PUBLICO, 'index.html')));
  }
});

servidor.listen(PUERTO, () => console.log(`supply101 en http://127.0.0.1:${PUERTO} · API ${API}`));
