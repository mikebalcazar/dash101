import path from "node:path";
import { defineConfig } from "vitest/config";

/* Las pruebas de la capa de datos corren en node contra la API de STAGING, con
 * la org `demo` que sembró `scripts/sembrar-demo.mjs`. No hay dobles: lo que
 * se mide es lo que una pantalla recibiría. En staging `/auth/codigo` devuelve
 * el código, así que se entra sin buzón. Nunca contra producción. */
export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname) },
      // Lo que OpenNext genera no está en el repositorio y las pruebas corren
      // sin construir. Se sustituye por un doble que sólo dice «me tocó a mí»:
      // lo que se mide en `worker.spec.ts` es el reparto, no Next.
      { find: /^\.\.\/\.open-next\/worker\.js$/, replacement: path.resolve(__dirname, "pruebas/doble-open-next.ts") },
    ],
  },
  test: {
    include: ["pruebas/**/*.spec.ts"],
    // Un archivo a la vez: los dos entran con el mismo correo por
    // `/auth/codigo`, y el segundo código invalida al primero si corren juntos.
    fileParallelism: false,
    environment: "node",
    testTimeout: 30000,
    env: {
      NEXT_PUBLIC_FUENTE: "api",
      NEXT_PUBLIC_ORG: "demo",
      NEXT_PUBLIC_API_ORIGEN: process.env.STAGING ?? "https://suite101-api-staging.mike-929.workers.dev",
    },
  },
});
