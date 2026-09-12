/* La puerta del Worker de dash101.
 *
 * Decisión D1: cada app vive en su propio Worker y le habla a `suite101-api`
 * **desde su mismo origen**, por `/s101/*`, con un *service binding*. No es
 * capricho: la sesión es una cookie `SameSite=None`, y servida desde otro
 * origen es cookie de terceros — Safari la bloquea, o sea todo iPhone. Desde
 * el mismo origen la cookie es propia y no hay CORS que configurar.
 *
 * El proxy pone `X-App`; la interfaz no tiene que mandarlo (aunque lo manda,
 * y aquí se sobrescribe: la app no decide quién dice ser).
 *
 * Lo que no empieza con `/s101/` lo atiende Next, por el Worker que genera
 * OpenNext. */

// Lo genera `opennextjs-cloudflare build`; no está en el repositorio. Sus
// tipos los declara `worker/open-next.d.ts`.
import next from '../.open-next/worker.js';

const PREFIJO = '/s101';

export default {
  async fetch(req: Request, env: { API: { fetch: (r: Request) => Promise<Response> } }, ctx: ExecutionContext): Promise<Response> {
    const u = new URL(req.url);
    if (u.pathname === PREFIJO || u.pathname.startsWith(PREFIJO + '/')) {
      // `/s101/auth/codigo` → `/auth/codigo`. Un `/s101` pelón va a la raíz.
      u.pathname = u.pathname.slice(PREFIJO.length) || '/';
      const r = new Request(u, req);
      r.headers.set('X-App', 'dash101');
      return env.API.fetch(r);
    }
    return next.fetch(req, env, ctx);
  },
};

// Lo que OpenNext exporte además del `fetch` (Durable Objects de caché, por
// ejemplo) tiene que seguir saliendo de aquí, o wrangler no lo encuentra.
export * from '../.open-next/worker.js';
