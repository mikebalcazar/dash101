import type { NextConfig } from "next";

/* `/s101/*` es la API vista desde el mismo origen (decisión D1). En Netlify lo
 * reenvía la regla de netlify.toml; en `next dev` no hay Netlify, así que lo
 * reenvía Next a la API de staging —nunca a producción desde una máquina—, o a
 * la que diga API_ORIGEN. */
const API_ORIGEN = process.env.API_ORIGEN ?? "https://suite101-api-staging.mike-929.workers.dev";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/s101/:ruta*", destination: `${API_ORIGEN}/:ruta*` }];
  },
};

export default nextConfig;
