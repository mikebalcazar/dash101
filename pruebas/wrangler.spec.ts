/* El wrangler.toml de dash101 escribe `assets` en línea. Un encabezado
 * `[vars]` antes de esa línea se la traga: `assets` pasa a ser una variable
 * de entorno, el Worker se publica sin la capa de archivos y en producción
 * las fuentes, el logotipo y los chunks de Next contestan 404 (pasó el
 * 25-sep, #86). Las variables van en línea (`vars = { ... }`). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("wrangler.toml", () => {
  const toml = readFileSync("wrangler.toml", "utf8");
  const sinComentarios = toml.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n");

  it("no lleva un encabezado [vars] que se trague la línea de assets", () => {
    expect(sinComentarios).not.toMatch(/^\[vars\]/m);
    expect(sinComentarios).toMatch(/^vars = \{ DOMINIO_PROPIO = "dash101\.taller101\.com" \}/m);
  });

  it("assets sigue escrito en línea, en la raíz", () => {
    expect(sinComentarios).toMatch(/^assets = \{ directory = "\.open-next\/assets", binding = "ASSETS" \}/m);
  });
});
