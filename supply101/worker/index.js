/* La puerta del Worker de supply101.
 *
 * Decisión D1: cada app vive en su propio Worker y le habla a `suite101-api`
 * desde su mismo origen, por `/s101/*`, con un *service binding*. La sesión
 * es la galleta `s101` de la API; servida desde el mismo origen es galleta
 * propia y Safari no la bloquea.
 *
 * MANDA `X-App: dash101`, Y ESO ES A PROPÓSITO. supply101 no es una app
 * aparte para la suite: es la cara de empleado del módulo de órdenes de
 * dash101, y las órdenes viven detrás de esa llave. Si mandara un nombre
 * nuevo, la API lo rechazaría (`app_desconocida`) y habría que prender otra
 * app en cada empresa para algo que ya está prendido. El día que Mike quiera
 * venderlo por separado, se le da llave propia en el contrato y se cambia
 * este renglón.
 *
 * La interfaz no manda `X-App`, y si lo manda se sobrescribe: la app no
 * decide quién dice ser.
 */

const PREFIJO = '/s101';

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === PREFIJO || u.pathname.startsWith(PREFIJO + '/')) {
      u.pathname = u.pathname.slice(PREFIJO.length) || '/';
      const r = new Request(u, req);
      r.headers.set('X-App', 'dash101');
      return env.API.fetch(r);
    }
    return env.ASSETS.fetch(req);
  },
};
