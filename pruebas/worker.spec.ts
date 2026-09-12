/* El reparto de peticiones del Worker de dash101 (fase 4).
 *
 * Es la pieza más chica y la más peligrosa de toda la fase: si el prefijo se
 * recorta mal, la app le pide `/s101/salud` a Next —404— o, peor, le manda a
 * la API una ruta con el prefijo pegado. Y si `X-App` no se sobrescribe, la
 * app puede decir que es otra.
 *
 * Esto corre en node, sin red y sin Cloudflare: el enlace de servicio es un
 * doble que devuelve lo que recibió. Lo que pasa contra el Worker de verdad,
 * ya publicado, lo mide `scripts/medir.mjs` desde el corredor de GitHub. Las
 * dos pruebas hacen falta y ninguna sustituye a la otra. */

import { describe, expect, it } from "vitest";
import worker from "@/worker/index";

/** El doble de `suite101-api`: cuenta lo que le llegó, no hace nada. */
function apiDoble() {
  const recibidas: Array<{ url: string; app: string | null; metodo: string; cuerpo: string }> = [];
  return {
    recibidas,
    API: {
      async fetch(r: Request): Promise<Response> {
        recibidas.push({
          url: r.url,
          app: r.headers.get("X-App"),
          metodo: r.method,
          cuerpo: r.body ? await r.text() : "",
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    },
  };
}

const ctx = {} as ExecutionContext;
const pedir = (ruta: string, init?: RequestInit) => new Request(`https://dash101.ejemplo${ruta}`, init);

describe("lo que empieza con /s101 va a la API", () => {
  it("se le quita el prefijo y se le pone X-App: dash101", async () => {
    const api = apiDoble();
    const r = await worker.fetch(pedir("/s101/orgs/demo/cuentas?negocio_id=n1"), api, ctx);
    expect(r.status).toBe(200);
    expect(api.recibidas).toHaveLength(1);
    expect(api.recibidas[0].url).toBe("https://dash101.ejemplo/orgs/demo/cuentas?negocio_id=n1");
    expect(api.recibidas[0].app).toBe("dash101");
  });

  it("`/s101` pelón cae en la raíz de la API, no en una ruta vacía", async () => {
    const api = apiDoble();
    await worker.fetch(pedir("/s101"), api, ctx);
    expect(new URL(api.recibidas[0].url).pathname).toBe("/");
  });

  it("la app no decide quién dice ser: X-App se sobrescribe", async () => {
    const api = apiDoble();
    await worker.fetch(pedir("/s101/yo", { headers: { "X-App": "peek101" } }), api, ctx);
    expect(api.recibidas[0].app).toBe("dash101");
  });

  it("un POST llega con su método y su cuerpo enteros", async () => {
    const api = apiDoble();
    await worker.fetch(
      pedir("/s101/auth/codigo", { method: "POST", body: JSON.stringify({ correo: "a@b.c" }), headers: { "Content-Type": "application/json" } }),
      api,
      ctx,
    );
    expect(api.recibidas[0].metodo).toBe("POST");
    expect(api.recibidas[0].cuerpo).toBe('{"correo":"a@b.c"}');
  });
});

describe("lo demás lo atiende Next", () => {
  it("la portada y las pantallas no pasan por la API", async () => {
    for (const ruta of ["/", "/proyectos", "/conciliacion", "/proyectos/abc123", "/fonts/raleway-400.woff2"]) {
      const api = apiDoble();
      const r = await worker.fetch(pedir(ruta), api, ctx);
      expect(await r.text()).toBe(`next atendió ${ruta}`);
      expect(api.recibidas).toHaveLength(0);
    }
  });

  it("una ruta que sólo se parece al prefijo no se desvía", async () => {
    // `/s101cosas` empieza con las mismas letras y NO es la API. Con un
    // `startsWith('/s101')` a secas, esto se habría ido a la API con la ruta
    // `cosas` y nadie lo habría notado hasta ver un 404 raro.
    for (const ruta of ["/s101cosas", "/s1019", "/proyectos/s101"]) {
      const api = apiDoble();
      const r = await worker.fetch(pedir(ruta), api, ctx);
      expect(await r.text()).toBe(`next atendió ${ruta}`);
      expect(api.recibidas).toHaveLength(0);
    }
  });
});
