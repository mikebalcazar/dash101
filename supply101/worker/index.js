/* La puerta del Worker de supply101.
 *
 * Decisión D1: cada app vive en su propio Worker y le habla a `suite101-api`
 * desde su mismo origen, por `/s101/*`, con un *service binding*. La sesión
 * es la galleta `s101` de la API; servida desde el mismo origen es galleta
 * propia y Safari no la bloquea.
 *
 * MANDA `X-App: supply101`, QUE ES SU PROPIO NOMBRE. Hasta el 21-sep-2026
 * mandaba `dash101`, y aquí decía que era a propósito: «las órdenes viven
 * detrás de esa llave, y si mandara un nombre nuevo habría que prender otra
 * app en cada empresa para algo que ya está prendido».
 *
 * Ese razonamiento era correcto para las EMPRESAS y falso para las PERSONAS.
 * La suite reparte permisos persona por persona con esa misma llave, así que
 * pedir una compra exigía tener dash101 — y supply101 existe justamente para
 * quien NO entra al tablero del dinero. Le cerraba la puerta a la gente para
 * la que se hizo: Mike lo reportó con fer@forespot.com, que es exactamente
 * ese caso.
 *
 * Desde el contrato 0.42.0 la llave es `supply`, va prendida en toda empresa
 * que tenga dash101 —no hay nada que prender a mano— y se reparte aparte.
 * Compartir una llave es compartir el permiso; aquí tenían que ser distintos.
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
      r.headers.set('X-App', 'supply101');
      return env.API.fetch(r);
    }
    return env.ASSETS.fetch(req);
  },
};
