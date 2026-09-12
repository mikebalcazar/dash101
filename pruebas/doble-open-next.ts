/* El doble del Worker que genera OpenNext.
 *
 * `worker/index.ts` importa `../.open-next/worker.js`, que no está en el
 * repositorio: lo construye `opennextjs-cloudflare build`. Para medir el
 * reparto de peticiones no hace falta Next entero —hace falta saber **a quién
 * le tocó** cada una—, así que en las pruebas ese archivo se sustituye por
 * esto desde `vitest.config.ts`. */

export default {
  async fetch(peticion: Request): Promise<Response> {
    return new Response(`next atendió ${new URL(peticion.url).pathname}`, { status: 200 });
  },
};
