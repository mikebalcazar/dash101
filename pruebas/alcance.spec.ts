/* Lo que está fuera del alcance, visto desde dash101 · contrato 0.31.0
 *
 * Mike, 20-sep: «hay ítems nuevos no aprobados e ítems cancelados. Para que
 * un ítem se considere cancelado tiene que haber estado aprobado primero y
 * luego cancelado. (…) En dash, en la pestaña de partida de ítems fuera de
 * alcance, dividirlos entre "no aprobados" y "Cancelados". Los no aprobados,
 * a pesar de que tienen precio y toda la info, NO SUMAN en dash.»
 *
 * LO QUE DE VERDAD MIDE ESTE ARCHIVO:
 *
 *   · que los dos montones lleguen SEPARADOS y con el criterio correcto. La
 *     pantalla pinta dos pestañas con lo que le den; si el reparto viniera
 *     mal, enseñaría como venta cancelada algo que nadie aprobó nunca;
 *   · que un descartado NO caiga en «Cancelados». Es la regla textual de
 *     Mike y es lo único que hace que esa lista se pueda leer;
 *   · que aprobar mueva el precio de venta y cancelar lo regrese, leído por
 *     donde lo lee la pantalla (`getProyecto`);
 *   · que el motivo de la cancelación viaje: es lo que se lee tres meses
 *     después, cuando alguien pregunta por qué se cayó.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { fueraDeAlcance } from "@/lib/api/leer";
import { createNegocio } from "@/lib/negocios";
import { createCliente } from "@/lib/clientes";
import { createProyecto, getProyecto } from "@/lib/proyectos";
import { aprobarItem, cancelarItem } from "@/lib/items-grupo";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `al-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { negocio: "", cliente: "", proyecto: "" };

const nuevoItem = async (nombre: string, pesos: number, estado: "vendido" | "cotizado") =>
  (await pedir<{ id: string }>(`/orgs/${ORG}/items`, {
    method: "POST",
    body: {
      negocio_id: ids.negocio, cliente_id: ids.cliente, proyecto_id: ids.proyecto,
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

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cliente = await createCliente(uid, { nombre: "Familia", negocio_id: ids.negocio });
  ids.proyecto = await createProyecto(uid, {
    negocio_id: ids.negocio, negocio_nombre: "Taller",
    cliente_id: ids.cliente, cliente_nombre: "Familia",
    nombre: "Casa", estado: "activo", precio_venta: 50_000,
    partidas: [], fecha_inicio: new Date(2026, 2, 1),
    items: [{ nombre: "Cocina", monto: 50_000, cantidad: 1 }],
  });
}, 120000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("los dos montones de fuera del alcance", () => {
  let requerimiento = "", cancelado = "", descartado = "";

  beforeAll(async () => {
    requerimiento = await nuevoItem("Clóset de más", 20_000, "cotizado");
    cancelado = await nuevoItem("Barra", 30_000, "vendido");
    descartado = await nuevoItem("Pérgola que no fue", 40_000, "cotizado");
    await cancelarItem(cancelado, "El cliente la quitó");
    await cancelarItem(descartado);
  });

  it("el no aprobado tiene precio y NO suma", async () => {
    expect(await venta(), "sólo la cocina: ni el requerimiento ni lo cancelado").toBe(50_000);
    const f = await fueraDeAlcance(ids.proyecto);
    const req = f.no_aprobados.find((i) => i.id === requerimiento);
    expect(req, `salió en no aprobados: ${JSON.stringify(f.no_aprobados.map((i) => i.nombre))}`).toBeTruthy();
    expect(req!.monto, "y trae su precio, en pesos").toBe(20_000);
  });

  it("el que estuvo aprobado cae en Cancelados, con su motivo", async () => {
    const f = await fueraDeAlcance(ids.proyecto);
    const c = f.cancelados.find((i) => i.id === cancelado);
    expect(c, "está en cancelados").toBeTruthy();
    expect(c!.motivo).toBe("El cliente la quitó");
  });

  it("el que nunca estuvo aprobado NO cae en Cancelados", async () => {
    /* La regla textual de Mike. Sin esto, la lista de cancelados se llena de
     * requerimientos que nadie aprobó y deja de poder leerse. */
    const f = await fueraDeAlcance(ids.proyecto);
    expect(f.cancelados.map((i) => i.id)).not.toContain(descartado);
    expect(f.no_aprobados.map((i) => i.id), "y tampoco se queda entre los que hay que decidir").not.toContain(descartado);
  });

  it("aprobar lo mete a la venta, y cancelar lo saca", async () => {
    const antes = await venta();
    await aprobarItem(requerimiento);
    expect(await venta()).toBe(antes + 20_000);
    expect((await fueraDeAlcance(ids.proyecto)).no_aprobados.map((i) => i.id)).not.toContain(requerimiento);

    const como = await cancelarItem(requerimiento, "Se arrepintió");
    expect(como, "ya había estado aprobado, así que ahora sí es un cancelado").toBe("cancelado");
    expect(await venta()).toBe(antes);
    expect((await fueraDeAlcance(ids.proyecto)).cancelados.map((i) => i.id)).toContain(requerimiento);
  });

  it("y revivir uno cancelado lo regresa a la venta", async () => {
    const antes = await venta();
    await aprobarItem(cancelado);
    expect(await venta()).toBe(antes + 30_000);
  });
});
