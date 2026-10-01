/* Juntar dos proyectos en uno · contrato 0.52.0, medido contra STAGING en una
 * org propia.
 *
 * Mike, 29-sep-2026: «No puedo fusionar el proyecto, solo el cliente. Y
 * quiero fusionar proyectos.» Lo que aquí se mide es lo que la pantalla del
 * proyecto usa (`lib/proyectos.fusionarProyectos`): que en seco cuente sin
 * mover nada, que al juntar el que se va desaparezca y sus ítems y su dinero
 * queden en el que se queda, y que los cachés del que se queda ya vengan
 * recalculados cuando la pantalla los vuelve a leer.
 *
 * La misma regla que las demás pruebas de escritura: una org por corrida,
 * que se borra al terminar. Nunca contra producción. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createCuenta } from "@/lib/cuentas";
import { createCliente } from "@/lib/clientes";
import { createProyecto, getProyecto, listProyectos, fusionarProyectos } from "@/lib/proyectos";
import { createMovimiento, listMovimientosByProyecto } from "@/lib/movimientos";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `fp-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { cuenta: "", cliente: "", queda: "", seVa: "" };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  const salud = await pedir<{ entorno: string; contrato: string }>("/salud");
  expect(salud.entorno).toBe("staging");
  const u = await entrarDePrueba(CORREO);
  uid = u.id;
  process.env.NEXT_PUBLIC_ORG = ORG;
  const alta = await pedir<{ org_db_version: number }>("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Prueba de fusión de proyectos" } });
  expect(alta.org_db_version).toBeGreaterThanOrEqual(3);
  ids.cuenta = await createCuenta(uid, { nombre: "Banco", tipo: "banco", moneda: "MXN", saldo_inicial: 0});
  ids.cliente = await createCliente(uid, { nombre: "Sanje"});
  const base = { cliente_id: ids.cliente, cliente_nombre: "Sanje", partidas: [], estado: "activo" as const, fecha_inicio: new Date("2026-09-01T12:00:00") };
  ids.queda = await createProyecto(uid, { ...base, nombre: "Sanje CC37", precio_venta: 20000, items: [{ nombre: "Barra", monto: 20000 }] });
  ids.seVa = await createProyecto(uid, { ...base, nombre: "Sanje CC37 NEW", precio_venta: 30000, items: [{ nombre: "Cocina", monto: 10000, partida: "Planta baja" }, { nombre: "Clóset", monto: 20000, partida: "Planta baja" }] });
  await createMovimiento(uid, { tipo: "ingreso", monto: 15000, fecha: new Date("2026-09-10T12:00:00"), cuenta_id: ids.cuenta, cuenta_nombre: "Banco", proyecto_id: ids.seVa, proyecto_nombre: "Sanje CC37 NEW", contraparte_id: ids.cliente, contraparte_tipo: "cliente", contraparte_nombre: "Sanje", descripcion: "Anticipo" });
}, 60000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("juntar dos proyectos", () => {
  it("en seco dice qué se movería y no mueve nada", async () => {
    const r = await fusionarProyectos(ids.queda, ids.seVa, true);
    expect(r.seco).toBe(true);
    expect(r.se_va.nombre).toBe("Sanje CC37 NEW");
    expect(r.movidos).toMatchObject({ items: 2, movimientos: 1 });
    expect(await getProyecto(ids.seVa)).not.toBeNull();
  });
  it("al juntar, el que se va desaparece y el que se queda trae sus ítems, su dinero y sus cachés al día", async () => {
    const r = await fusionarProyectos(ids.queda, ids.seVa);
    expect(r.seco).toBe(false);
    expect(r.movidos).toMatchObject({ items: 2, movimientos: 1 });
    expect(r.obra_suelta).toBe(false);

    expect(await getProyecto(ids.seVa)).toBeNull();
    const lista = await listProyectos();
    expect(lista.map((p) => p.nombre)).toEqual(["Sanje CC37"]);

    const p = (await getProyecto(ids.queda))!;
    expect((p.items ?? []).map((i) => i.nombre).sort()).toEqual(["Barra", "Clóset", "Cocina"]);
    expect((p.items ?? []).find((i) => i.nombre === "Cocina")?.partida).toBe("Planta baja");
    expect(p.precio_venta).toBe(50000);
    expect(p.cobrado).toBe(15000);
    const movs = await listMovimientosByProyecto(ids.queda);
    expect(movs.length).toBe(1);
    expect(movs[0].monto).toBe(15000);
  });
  it("con uno mismo, o con uno que no existe, la API dice que no", async () => {
    await expect(fusionarProyectos(ids.queda, ids.queda)).rejects.toThrow();
    await expect(fusionarProyectos(ids.queda, "no-existe")).rejects.toThrow();
  });
});
