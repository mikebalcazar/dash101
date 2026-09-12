import path from "node:path";
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

/* Firebase, en el paquete del servidor del Worker.
 *
 * El 12-sep la primera publicación en Cloudflare contestó **500 en todas las
 * pantallas** y 200 en las fuentes. El error, leído del propio workerd:
 *
 *   EvalError: Code generation from strings disallowed for this context
 *       … at l.fromJSON  (codegen de protobufjs)
 *
 * De dónde sale: `firebase/firestore` publica dos construcciones. La de Node
 * (`dist/index.mjs`) trae protobufjs, que **fabrica funciones con
 * `new Function`** al cargar el módulo; un Worker no permite eso y truena
 * antes de que se pinte nada. La de navegador (`dist/esm/index.esm.js`) no
 * trae protobufjs. Al empaquetar el servidor, webpack tomaba la de Node
 * porque ahí la condición `node` sí aplica — sólo que el servidor de este
 * Worker no es Node.
 *
 * Hay que apuntar los **dos niveles**. `firebase/firestore` es sólo un
 * envoltorio de una línea —`export * from '@firebase/firestore'`—, así que
 * redirigir nada más el envoltorio no sirve: el paquete de dentro se vuelve a
 * resolver por la condición `node` y protobufjs entra igual. Se midió: con
 * sólo el envoltorio redirigido, el 500 seguía idéntico.
 *
 * Se apunta a la de navegador, y **sólo en el paquete del servidor del
 * Worker**: el del navegador no se toca, así que en Netlify nada cambia.
 * Tampoco es un parche que esconda algo: con `FUENTE=api` la app no le habla
 * a Firestore, y `lib/firebase.ts` sólo lo inicializa si hay `window`. Lo que
 * se quita es código que nunca se ejecuta y que aun así tiraba la página. */
const FIREBASE_NAVEGADOR = {
  // El envoltorio que importa la app…
  "firebase/app": "firebase/app/dist/esm/index.esm.js",
  "firebase/auth": "firebase/auth/dist/esm/index.esm.js",
  "firebase/firestore": "firebase/firestore/dist/esm/index.esm.js",
  // …y el paquete de dentro, que es donde de verdad está la construcción de
  // Node con protobufjs.
  "@firebase/app": "@firebase/app/dist/esm/index.esm2017.js",
  "@firebase/auth": "@firebase/auth/dist/esm2017/index.js",
  "@firebase/firestore": "@firebase/firestore/dist/index.esm2017.js",
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    if (EN_WORKER) return [];
    return [{ source: "/s101/:ruta*", destination: `${API_ORIGEN}/:ruta*` }];
  },
  webpack(config, { isServer }) {
    if (EN_WORKER && isServer) {
      config.resolve.alias = { ...config.resolve.alias };
      for (const [de, a] of Object.entries(FIREBASE_NAVEGADOR)) {
        config.resolve.alias[de] = path.resolve(process.cwd(), "node_modules", a);
      }
    }
    return config;
  },
};

export default nextConfig;
