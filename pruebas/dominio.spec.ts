/* La dirección de workers.dev manda al dominio propio; el dominio y staging
 * sirven. Corre contra el doble de OpenNext (vitest.config.ts). */
import { describe, expect, it } from "vitest";
import worker from "@/worker/index";

const API = { async fetch() { return new Response("api", { status: 200 }); } };
const ctx = {} as ExecutionContext;
const prod = { API, DOMINIO_PROPIO: "dash101.taller101.com" };
const staging = { API };
const pide = (url: string, env: typeof prod | typeof staging, init?: RequestInit) => worker.fetch(new Request(url, init), env, ctx);

describe("workers.dev manda al dominio propio", () => {
  it("una lectura en workers.dev contesta 301 al mismo camino en el dominio", async () => {
    const r = await pide("https://dash101.mike-929.workers.dev/proyectos?x=1", prod);
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("https://dash101.taller101.com/proyectos?x=1");
  });
  it("en el dominio atiende Next como siempre", async () => {
    const r = await pide("https://dash101.taller101.com/proyectos", prod);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("next atendió /proyectos");
  });
  it("la puerta a la suite y lo que no es lectura no se redirigen", async () => {
    expect((await pide("https://dash101.mike-929.workers.dev/s101/yo", prod)).status).toBe(200);
    expect((await pide("https://dash101.mike-929.workers.dev/proyectos", prod, { method: "POST" })).status).toBe(200);
  });
  it("staging, sin DOMINIO_PROPIO, sirve tal cual", async () => {
    const r = await pide("https://dash101-staging.mike-929.workers.dev/", staging);
    expect(r.status).toBe(200);
  });
});
