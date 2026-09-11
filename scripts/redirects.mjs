/* Escribe `public/_redirects` con el proxy `/s101/*` hacia la API que diga
 * `NEXT_PUBLIC_API_ORIGEN`, y sólo cuando la construcción lleva
 * `NEXT_PUBLIC_FUENTE=api` y esa variable puesta.
 *
 * Por qué existe: las reglas de `netlify.toml` son globales, no se pueden
 * cambiar por contexto (lo dice la documentación de Netlify), y ahí `/s101/`
 * apunta a producción. Un deploy preview que quiera hablar con STAGING y la
 * org `demo` necesita otra regla, y la única manera por contexto es un
 * archivo `_redirects` en la carpeta publicada, que manda sobre `netlify.toml`.
 *
 * En producción la variable no está: no se escribe nada, se borra lo que
 * hubiera, y manda la regla de `netlify.toml`. `X-App` la manda el navegador
 * (lib/api/cliente.ts); en producción el proxy la vuelve a poner. */
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ruta = fileURLToPath(new URL("../public/_redirects", import.meta.url));
const origen = (process.env.NEXT_PUBLIC_API_ORIGEN ?? "").replace(/\/$/, "");
const conApi = process.env.NEXT_PUBLIC_FUENTE === "api";

if (conApi && origen) {
  mkdirSync(fileURLToPath(new URL("../public", import.meta.url)), { recursive: true });
  writeFileSync(ruta, `/s101/*  ${origen}/:splat  200!\n`);
  console.log(`public/_redirects: /s101/* → ${origen} (manda sobre netlify.toml)`);
} else {
  if (existsSync(ruta)) unlinkSync(ruta);
  console.log("public/_redirects: no se escribe; manda la regla de netlify.toml (producción)");
}
