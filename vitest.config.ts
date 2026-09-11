import path from "node:path";
import { defineConfig } from "vitest/config";

/* Las pruebas de la capa de datos corren en node contra la API de STAGING, con
 * la org `demo` que sembró `scripts/sembrar-demo.mjs`. No hay dobles: lo que
 * se mide es lo que una pantalla recibiría. En staging `/auth/codigo` devuelve
 * el código, así que se entra sin buzón. Nunca contra producción. */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["pruebas/**/*.spec.ts"],
    environment: "node",
    testTimeout: 30000,
    env: {
      NEXT_PUBLIC_FUENTE: "api",
      NEXT_PUBLIC_ORG: "demo",
      NEXT_PUBLIC_API_ORIGEN: process.env.STAGING ?? "https://suite101-api-staging.mike-929.workers.dev",
    },
  },
});
