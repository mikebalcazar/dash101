/* Un solo negocio por empresa · contrato 0.50.0
 *
 * Mike, 29-sep-2026: «borres de dash (y de todas las plataformas) la opción
 * de agregar diferentes negocios. Ya no vamos a tener esa funcionalidad (los
 * otros negocios son como TUYS y vibehome). Todo es para un negocio nada
 * más.» Y escogió fusionar lo que ya existe en uno.
 *
 * Aquí se mide lo que la pantalla del negocio hace con los mismos módulos:
 * ensayar en seco (sin escribir) y fusionar de verdad, contra staging, en
 * una empresa propia de la prueba.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createNegocio, fusionarNegocios, listNegocios } from "@/lib/negocios";
import { createCliente, listClientes } from "@/lib/clientes";
import { createProyecto, getProyecto } from "@/lib/proyectos";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `un-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { queda: "", seVa: "", proyectoB: "" };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Prueba de un solo negocio" } });

  ids.queda = await createNegocio(uid, { nombre: "Forespot", moneda: "MXN" });
  ids.seVa = await createNegocio(uid, { nombre: "TUYS", moneda: "MXN" });
  const clienteB = await createCliente(uid, { nombre: "Cliente de TUYS", negocio_id: ids.seVa });
  ids.proyectoB = await createProyecto(uid, {
    nombre: "Obra de TUYS", cliente_id: clienteB, cliente_nombre: "Cliente de TUYS",
    negocio_id: ids.seVa, negocio_nombre: "TUYS",
    precio_venta: 0, estado: "activo", fecha_inicio: new Date(2026, 8, 1), partidas: [],
    items: [{ nombre: "Barra", monto: 100 }, { nombre: "Puerta", monto: 50 }],
  });
}, 90000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("fusionar los negocios en uno", () => {
  it("en seco dice qué se movería y no escribe", async () => {
    const r = await fusionarNegocios(ids.queda, true);
    expect(r.seco).toBe(true);
    expect(r.se_fueron.map((n) => n.nombre)).toEqual(["TUYS"]);
    expect(r.movidos).toMatchObject({ clientes: 1, proyectos: 1, items: 2 });
    expect((await listNegocios(uid)).length, "siguen siendo dos").toBe(2);
  });

  it("de verdad: queda uno y todo lo de TUYS está en él", async () => {
    const r = await fusionarNegocios(ids.queda, false);
    expect(r.seco).toBe(false);
    expect(r.se_fueron.length).toBe(1);
    const negocios = await listNegocios(uid);
    expect(negocios.map((n) => n.nombre)).toEqual(["Forespot"]);
    const p = (await getProyecto(ids.proyectoB))!;
    expect(p.negocio_id).toBe(ids.queda);
    expect(p.items).toHaveLength(2);
    const clientes = await listClientes(ids.queda);
    expect(clientes.map((c) => c.nombre)).toContain("Cliente de TUYS");
  });
});
