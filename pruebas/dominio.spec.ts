/* La dirección de workers.dev manda al dominio propio; el dominio y staging
 * sirven. Corre contra el doble de OpenNext (vitest.config.ts). */
import { describe, expect, it } from "vitest";
import worker from "@/worker/index";

const API = { async fetch() { return new Response("api", { status: 200 }); } };
const ctx = {} as ExecutionContext;
const prod = { API, DOMINIO_PROPIO: "dash.suite101.app", DOMINIO_ANTERIOR: "dash101.taller101.com" };
const staging = { API };
const pide = (url: string, env: { API: typeof API; DOMINIO_PROPIO?: string; DOMINIO_ANTERIOR?: string }, init?: RequestInit) => worker.fetch(new Request(url, init), env, ctx);

describe("workers.dev manda al dominio propio", () => {
  it("una lectura en workers.dev contesta 301 al mismo camino en el dominio", async () => {
    const r = await pide("https://dash101.mike-929.workers.dev/proyectos?x=1", prod);
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("https://dash.suite101.app/proyectos?x=1");
  });
  it("en el dominio atiende Next como siempre", async () => {
    const r = await pide("https://dash.suite101.app/proyectos", prod);
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
  it("sin la «s»: http en el dominio propio manda a https con 301 (30-sep-2026)", async () => {
    const r = await pide("http://dash.suite101.app/proyectos?x=1", prod);
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("https://dash.suite101.app/proyectos?x=1");
    expect((await pide("http://dash.suite101.app/", prod, { method: "POST" })).status).not.toBe(301);
    expect((await pide("http://dash101-staging.mike-929.workers.dev/", staging)).status).not.toBe(301);
  });
});

/* 11-oct-2026 · suite101.app es la marca; la dirección de taller101.com sigue
 * viva pero manda a la nueva, con las mismas reglas que workers.dev. */
describe("taller101.com manda a suite101.app", () => {
  it("una lectura en la dirección vieja contesta 301 a la nueva, con ruta y consulta", async () => {
    for (const url of ["https://dash101.taller101.com/proyectos?x=1", "http://dash101.taller101.com/proyectos?x=1"]) {
      const r = await pide(url, prod);
      expect(r.status).toBe(301);
      expect(r.headers.get("location")).toBe("https://dash.suite101.app/proyectos?x=1");
    }
    const h = await pide("https://dash101.taller101.com/", prod, { method: "HEAD" });
    expect(h.status).toBe(301);
    expect(h.headers.get("location")).toBe("https://dash.suite101.app/");
  });
  it("la puerta a la suite y lo que no es lectura no se redirigen desde la vieja", async () => {
    const r = await pide("https://dash101.taller101.com/s101/yo", prod);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("api");
    expect((await pide("https://dash101.taller101.com/s101", prod)).status).toBe(200);
    expect((await pide("https://dash101.taller101.com/proyectos", prod, { method: "POST" })).status).toBe(200);
  });
  it("DOMINIO_ANTERIOR acepta varias, separadas por comas", async () => {
    const varias = { ...prod, DOMINIO_ANTERIOR: " otra.ejemplo.com , dash101.taller101.com " };
    const r = await pide("https://dash101.taller101.com/a?b=c", varias);
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("https://dash.suite101.app/a?b=c");
  });
  it("un dominio de empresa no se redirige", async () => {
    const r = await pide("https://dash.acme.com/proyectos", prod);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("next atendió /proyectos");
  });
  it("staging, sin DOMINIO_ANTERIOR, no redirige taller101.com", async () => {
    expect((await pide("https://dash101.taller101.com/", staging)).status).toBe(200);
  });
});
