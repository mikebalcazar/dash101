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

/* Desde el 25-sep-2026 la app vive en su dominio propio (`DOMINIO_PROPIO`, en
 * el wrangler.toml de producción). La dirección de workers.dev SE QUEDA VIVA
 * pero manda para allá (Mike, 25-sep: «redirigir, no apagar»): las ligas que
 * ya se mandaron siguen sirviendo y todos acaban en el dominio. Sólo las
 * lecturas (GET/HEAD) y sólo lo que no es la puerta a la suite: una petición
 * a `/s101/*` desde workers.dev viene de una página que ya se está yendo.
 * Staging no tiene `DOMINIO_PROPIO` y no redirige. */
export function aDominioPropio(req: Request, env: { DOMINIO_PROPIO?: string }, u: URL): Response | null {
  const d = env.DOMINIO_PROPIO;
  if (!d || u.hostname === d || !u.hostname.endsWith('.workers.dev')) return null;
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  if (u.pathname === PREFIJO || u.pathname.startsWith(PREFIJO + '/')) return null;
  return Response.redirect(`https://${d}${u.pathname}${u.search}`, 301);
}

export default {
  async fetch(req: Request, env: { API: { fetch: (r: Request) => Promise<Response> }; DOMINIO_PROPIO?: string }, ctx: ExecutionContext): Promise<Response> {
    const u = new URL(req.url);
    const ida = aDominioPropio(req, env, u);
    if (ida) return ida;
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
