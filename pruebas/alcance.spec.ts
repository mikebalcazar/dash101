/* Lo que está fuera del alcance, visto desde dash101 · contrato 0.64.0 (antes 0.31.0)
 *
 * Mike, 20-sep: «hay ítems nuevos no aprobados e ítems cancelados. Para que
 * un ítem se considere cancelado tiene que haber estado aprobado primero y
 * luego cancelado. (…) En dash, en la pestaña de partida de ítems fuera de
 * alcance, dividirlos entre "no aprobados" y "Cancelados". Los no aprobados,
 * a pesar de que tienen precio y toda la info, NO SUMAN en dash.»
 *
 * Mike, 2-oct: «solo existirá "en alcance" o "fuera de alcance" (…) no pasan a
 * otra lista, regresan a fuera de alcance, solo en la bitácora sí aparecerá
 * como "se sacó del alcance" y si se agrega de nuevo aparecerá después "se
 * agregó al alcance" con su fecha y quién la agregó».
 *
 * LO QUE DE VERDAD MIDE ESTE ARCHIVO:
 *
 *   · que fuera del alcance sea UNA lista, con lo que nadie ha decidido y
 *     lo que se sacó, y que cada renglón diga cuál es cuál (`sacado`);
 *   · que agregar mueva el precio de venta y sacar lo regrese, leído por
 *     donde lo lee la pantalla (`getProyecto`);
 *   · que la bitácora traiga cada entrada y salida con quién y motivo: es lo
 *     que se lee tres meses después, cuando alguien pregunta por qué se cayó.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sembrarItems } from "./sembrar";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { fueraDeAlcance } from "@/lib/api/leer";
import { createCliente } from "@/lib/clientes";
import { createProyecto, getProyecto } from "@/lib/proyectos";
import { aprobarItem, bitacoraAlcance, NOMBRE_MOVIMIENTO_ALCANCE, sacarItem } from "@/lib/items-grupo";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `al-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { cliente: "", proyecto: "" };

const nuevoItem = async (nombre: string, pesos: number, estado: "vendido" | "cotizado") =>
  (await pedir<{ id: string }>(`/orgs/${ORG}/items`, {
    method: "POST",
    body: {
      cliente_id: ids.cliente, proyecto_id: ids.proyecto,
      nombre, monto: Math.round(pesos * 100), cantidad: 1, estado,
    },
  })).id;

const venta = async () => (await getProyecto(ids.proyecto))!.precio_venta;

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Alcance", apps: { dash: true } } });
  ids.cliente = await createCliente(uid, { nombre: "Familia"});
  ids.proyecto = await createProyecto(uid, {
   
    cliente_id: ids.cliente, cliente_nombre: "Familia",
    nombre: "Casa", estado: "activo",
    partidas: [], fecha_inicio: new Date(2026, 2, 1),
  });
  await sembrarItems(ORG, ids.proyecto, ids.cliente, [{ nombre: "Cocina", monto: 50_000, cantidad: 1 }]);
}, 120000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("una sola lista de fuera del alcance (0.64.0)", () => {
  let requerimiento = "", sacado = "", descartado = "";

  beforeAll(async () => {
    requerimiento = await nuevoItem("Clóset de más", 20_000, "cotizado");
    sacado = await nuevoItem("Barra", 30_000, "vendido");
    descartado = await nuevoItem("Pérgola que no fue", 40_000, "cotizado");
    await sacarItem(sacado, "El cliente la quitó");
    await sacarItem(descartado);
  });

  it("lo que está fuera tiene precio y NO suma", async () => {
    expect(await venta(), "sólo la cocina: ni el requerimiento ni lo sacado").toBe(50_000);
    const f = await fueraDeAlcance(ids.proyecto);
    const req = f.find((i) => i.id === requerimiento);
    expect(req, `salió en fuera: ${JSON.stringify(f.map((i) => i.nombre))}`).toBeTruthy();
    expect(req!.monto, "y trae su precio, en pesos").toBe(20_000);
    expect(req!.sacado, "nadie lo ha decidido: no lo sacaron").toBe(false);
  });

  it("lo que estuvo en alcance y se sacó está en la MISMA lista, con su motivo", async () => {
    /* Mike, 2-oct: «no pasan a otra lista, regresan a fuera de alcance». */
    const f = await fueraDeAlcance(ids.proyecto);
    const c = f.find((i) => i.id === sacado);
    expect(c, "está en fuera").toBeTruthy();
    expect(c!.sacado).toBe(true);
    expect(c!.motivo).toBe("El cliente la quitó");
    expect(c!.cancelado_at).toBeTruthy();
  });

  it("y lo que nunca estuvo y se sacó también, sin un tercer nombre", async () => {
    const f = await fueraDeAlcance(ids.proyecto);
    const d = f.find((i) => i.id === descartado);
    expect(d).toBeTruthy();
    expect(d!.sacado).toBe(true);
    expect(f.every((i) => i.alcance === "fuera"), "todos dicen lo mismo: fuera").toBe(true);
  });

  it("agregar lo mete a la venta, y sacar lo regresa a la lista", async () => {
    const antes = await venta();
    await aprobarItem(requerimiento);
    expect(await venta()).toBe(antes + 20_000);
    expect((await fueraDeAlcance(ids.proyecto)).map((i) => i.id)).not.toContain(requerimiento);

    await sacarItem(requerimiento, "Se arrepintió");
    expect(await venta()).toBe(antes);
    const otraVez = (await fueraDeAlcance(ids.proyecto)).find((i) => i.id === requerimiento);
    expect(otraVez?.sacado).toBe(true);
    expect(otraVez?.motivo).toBe("Se arrepintió");
  });

  it("la bitácora cuenta cada entrada y salida, con quién y por qué", async () => {
    /* Mike, 2-oct: «solo en la bitácora sí aparecerá como "se sacó del
     * alcance" y si se agrega de nuevo aparecerá después "se agregó al
     * alcance" con su fecha y quién la agregó». */
    const b = await bitacoraAlcance(requerimiento);
    expect(b.map((m) => m.accion)).toEqual(["entra", "sale"]);
    expect(b[1].motivo).toBe("Se arrepintió");
    expect(b[1].quien, "quién lo sacó").toBeTruthy();
    expect(b[1].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(NOMBRE_MOVIMIENTO_ALCANCE[b[1].accion]).toBe("Se sacó del alcance");
    expect(NOMBRE_MOVIMIENTO_ALCANCE[b[0].accion]).toBe("Se agregó al alcance");
  });

  it("y volver a agregar uno sacado lo regresa a la venta, y a la bitácora", async () => {
    const antes = await venta();
    await aprobarItem(sacado);
    expect(await venta()).toBe(antes + 30_000);
    expect((await bitacoraAlcance(sacado)).map((m) => m.accion)).toEqual(["entra", "sale", "entra"]);
  });
});
