/* Las pruebas aguantan un corte de conexión con staging (6-oct).
 *
 * Desde el 6-oct, «Pruebas» se cae a ratos con `read ECONNRESET` contra
 * staging: una prueba distinta cada vez, a veces a la mitad, y la siguiente
 * del mismo archivo hereda el estado a medias. No es el código: es la red.
 * `pruebas/red-de-staging.ts` (setupFiles) repite una LECTURA cortada; una
 * escritura no se repite nunca, porque el corte puede llegar cuando la API ya
 * guardó, y repetirla duplicaría. Aquí se mide con un servidor local que
 * corta la primera conexión y contesta la segunda. */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let servidor: http.Server;
let base = "";
const vistas: Record<string, number> = {};

beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    const k = `${req.method} ${req.url}`;
    vistas[k] = (vistas[k] ?? 0) + 1;
    // La primera vez de cada ruta, se corta la conexión sin contestar.
    if (vistas[k] === 1) { req.socket.destroy(); return; }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, vez: vistas[k] }));
  });
  await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", () => listo()));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((listo) => servidor.close(() => listo())));

describe("un corte de conexión con staging (6-oct)", () => {
  it("una lectura cortada se repite y llega", async () => {
    const r = await fetch(`${base}/leer`);
    expect(await r.json()).toEqual({ ok: true, vez: 2 });
  });

  it("una escritura cortada NO se repite: truena y la API la vio una sola vez", async () => {
    await expect(fetch(`${base}/escribir`, { method: "POST", body: "{}" })).rejects.toThrow();
    expect(vistas["POST /escribir"]).toBe(1);
  });
});
