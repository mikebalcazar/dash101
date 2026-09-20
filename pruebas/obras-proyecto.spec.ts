/* La obra de quell101 ligada al proyecto de dash101, desde los módulos que
 * usa la pantalla · contrato 0.22.0.
 *
 * Mike, 20-sep: «si le pongo en crear un proyecto, deberían aparecer los
 * proyectos creados en quell101 que aún no están activados dentro de
 * dash101», y «si ya se crearon de los 2 lados, se deberían poder ligar».
 *
 * La API ya tiene sus once pruebas de esto adentro (pruebas/obras.spec.ts de
 * suite101-api). Lo que se mide AQUÍ es lo que aquélla no puede: que
 * `lib/obras.ts` —el módulo que llaman las dos pantallas— hable bien con la
 * API publicada, con la empresa y la sesión de verdad.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir, pedirCrudo } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCliente } from "@/lib/clientes";
import { createProyecto } from "@/lib/proyectos";
import { desligarObra, ligarObra, listObras, obraDeProyecto, urlObra } from "@/lib/obras";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `ob-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { negocio: "", cliente: "", casaUno: "", casaDos: "", obraUno: "", obraDos: "" };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Prueba de obras", apps: { dash: true, quell: true } } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cliente = await createCliente(uid, { nombre: "Familia Uno", negocio_id: ids.negocio });
  const proyecto = (nombre: string) => createProyecto(uid, {
    nombre, cliente_id: ids.cliente, cliente_nombre: "Familia Uno",
    negocio_id: ids.negocio, negocio_nombre: "Taller",
    precio_venta: 0, estado: "activo", fecha_inicio: new Date(2026, 8, 1), partidas: [], items: [],
  });
  ids.casaUno = await proyecto("Casa Uno");
  ids.casaDos = await proyecto("Casa Dos");

  // Las obras se abren del lado de quell101, que es de donde vienen.
  await pedirCrudo(`/orgs/${ORG}/quell/me`);
  const obra = async (name: string) =>
    (await pedirCrudo<{ id: string }>(`/orgs/${ORG}/quell/projects`, { method: "POST", body: { name, client: "Familia Uno" } })).id;
  ids.obraUno = await obra("Casa Uno (obra)");
  ids.obraDos = await obra("Casa Dos (obra)");
}, 120000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("las obras de quell101 en dash101", () => {
  it("al crear un proyecto salen las obras que todavía no tienen uno", async () => {
    const sueltas = await listObras(true);
    expect(sueltas.map((o) => o.nombre).sort()).toEqual(["Casa Dos (obra)", "Casa Uno (obra)"]);
    // Con los nombres de la suite, que es lo que la pantalla pinta.
    expect(sueltas[0].cliente).toBe("Familia Uno");
    expect(sueltas[0].proyecto_id).toBe(null);
  });

  it("se ligan y la obra deja de ofrecerse", async () => {
    const obra = await ligarObra(ids.obraUno, ids.casaUno);
    expect(obra.proyecto_id).toBe(ids.casaUno);
    expect(obra.proyecto_nombre).toBe("Casa Uno");

    const sueltas = await listObras(true);
    expect(sueltas.map((o) => o.id)).toEqual([ids.obraDos]);
  });

  it("desde el proyecto se sabe cuál es su obra, y cuál no tiene", async () => {
    expect((await obraDeProyecto(ids.casaUno))?.id).toBe(ids.obraUno);
    expect(await obraDeProyecto(ids.casaDos)).toBe(null);
  });

  it("la liga al plano apunta a quell101, no a la API", async () => {
    const obra = (await obraDeProyecto(ids.casaUno))!;
    expect(urlObra(obra)).toBe(`https://bitacora-obra-staging.mike-929.workers.dev/#/p/${obra.id}`);
  });

  it("una obra ya ligada no se liga a otro proyecto, y lo dice en claro", async () => {
    await expect(ligarObra(ids.obraUno, ids.casaDos)).rejects.toThrow();
    // y el par de antes no se movió
    expect((await obraDeProyecto(ids.casaUno))?.id).toBe(ids.obraUno);
  });

  it("quitar la liga deja a los dos sueltos, sin borrar nada", async () => {
    await desligarObra(ids.obraUno);
    expect(await obraDeProyecto(ids.casaUno)).toBe(null);
    expect((await listObras(true)).map((o) => o.id).sort()).toEqual([ids.obraUno, ids.obraDos].sort());
    // la obra sigue viva del lado de quell101
    const r = await pedirCrudo<{ project: { id: string } }>(`/orgs/${ORG}/quell/projects/${ids.obraUno}`);
    expect(r.project.id).toBe(ids.obraUno);
  });
});
