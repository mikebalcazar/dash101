import type { NextConfig } from "next";

/* `/s101/*` es la API vista desde el mismo origen (decisión D1). Quién lo
 * reenvía depende de dónde corra la app:
 *
 *   Netlify      la regla de `netlify.toml` (y `public/_redirects` en los
 *                deploy previews, que manda sobre ella).
 *   Cloudflare   el propio Worker, antes de que Next vea la petición
 *                (`worker/index.ts`, fase 4).
 *   next dev     este `rewrite`, contra STAGING: nunca contra producción
 *                desde una máquina.
 *
 * En la construcción del Worker el `rewrite` se quita a propósito. Si algún
 * día el Worker dejara de reconocer el prefijo, con el `rewrite` puesto Next
 * mandaría esas peticiones a STAGING sin decir nada —producción hablándole a
 * la base de prueba, en silencio—. Sin él, se ve: 404. */
const API_ORIGEN = process.env.API_ORIGEN ?? "https://suite101-api-staging.mike-929.workers.dev";
const EN_WORKER = process.env.EN_WORKER === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (EN_WORKER) return [];
    return [{ source: "/s101/:ruta*", destination: `${API_ORIGEN}/:ruta*` }];
  },
};

export default nextConfig;
