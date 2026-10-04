/* Un solo cliente en las tres apps, desde los módulos que usa la pantalla ·
 * contrato 0.23.0.
 *
 * Mike, 20-sep: «El cliente es el mismo en los 3 […] Si por cualquier cosa se
 * crean en 2 apps diferentes con un nombre diferente, debería haber manera de
 * ligarlo y fusionar los 2 clientes en uno mismo […] Y si se quiere crear un
 * cliente con el nombre ya existente, preguntar si no te estás refiriendo a X
 * cliente.»
 *
 * La API ya tiene sus ocho pruebas de esto adentro (pruebas/clientes-fusion
 * .spec.ts de suite101-api). Lo que se mide AQUÍ es que `lib/clientes.ts` —el
 * módulo que llaman las pantallas— pregunte y fusione bien contra la API
 * publicada, con la empresa y la sesión de verdad.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sembrarItems } from "./sembrar";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { clienteDelChoque, clientePorCorreo, clientesParecidos, createCliente, fusionarClientes, getCliente, listClientes } from "@/lib/clientes";
import { createProyecto, getProyecto } from "@/lib/proyectos";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `cl-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { enDash: "", enQuote: "", proyecto: "" };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Prueba de clientes" } });
  // El mismo cliente, capturado dos veces con nombres distintos.
  ids.enDash = await createCliente(uid, { nombre: "Muebles Luna SA de CV", telefono: "5555555555"});
  ids.enQuote = await createCliente(uid, { nombre: "Muebles Luna", email: "compras@luna.mx"});
  ids.proyecto = await createProyecto(uid, {
    nombre: "Cocina Luna", cliente_id: ids.enQuote, cliente_nombre: "Muebles Luna",
   
    estado: "activo", fecha_inicio: new Date(2026, 8, 1), partidas: [],
  });
  await sembrarItems(ORG, ids.proyecto, ids.enQuote, [{ nombre: "Cocina", monto: 100 }]);
}, 120000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("¿no te refieres a X?", () => {
  it("el nombre corto encuentra al largo y al revés, sin importar acentos ni mayúsculas", async () => {
    const corto = await clientesParecidos("Muebles Luna", []);
    expect(corto.map((c) => c.id).sort()).toEqual([ids.enDash, ids.enQuote].sort());
    const feo = await clientesParecidos("  MÚEBLES   luna ", []);
    expect(feo.map((c) => c.id).sort()).toEqual([ids.enDash, ids.enQuote].sort());
  });

  it("otro nombre no molesta a nadie", async () => {
    expect(await clientesParecidos("Herrería Sol", [])).toHaveLength(0);
  });
});

/* Mike, 4-oct: «en caso de querer generar un nuevo cliente con el email de
 * otro que ya existe, avisar que ya existe un cliente, presentar su info y
 * preguntar si es ese cliente (…) o si quieres crear uno nuevo con otro
 * email». La regla la contesta la API (0.65.0); aquí se mide que el módulo
 * de la pantalla pregunte antes y entienda el rechazo si aun así choca. */
describe("el correo es de un solo cliente", () => {
  it("clientePorCorreo dice quién lo tiene, con su info, sin importar mayúsculas", async () => {
    const c = await clientePorCorreo("  Compras@LUNA.mx ", []);
    expect(c?.id).toBe(ids.enQuote);
    expect(c?.nombre).toBe("Muebles Luna");
    expect(c?.email).toBe("compras@luna.mx");
    expect(await clientePorCorreo("nadie@luna.mx", [])).toBeNull();
  });

  it("crear otro con ese correo lo rechaza la API, y el módulo entrega al dueño del correo", async () => {
    let choque: unknown = null;
    try { await createCliente(uid, { nombre: "Luna del Sur", email: "compras@luna.mx" }); } catch (e) { choque = e; }
    expect(choque, "la API dijo que no").not.toBeNull();
    const dueno = clienteDelChoque(choque);
    expect(dueno?.id).toBe(ids.enQuote);
    expect(dueno?.nombre).toBe("Muebles Luna");
    expect((await listClientes()).map((c) => c.id).sort()).toEqual([ids.enDash, ids.enQuote].sort());
  });
});

describe("fusionar los dos que son el mismo", () => {
  it("el que se queda hereda la historia y lo que le faltaba", async () => {
    const movidos = await fusionarClientes(ids.enDash, ids.enQuote);
    expect(movidos.proyectos).toBe(1);
    expect(movidos.items).toBe(1);

    const c = (await getCliente(ids.enDash))!;
    expect(c.email, "el correo sólo lo tenía el que se fue").toBe("compras@luna.mx");
    expect(c.telefono, "el teléfono que ya tenía no se pisa").toBe("5555555555");
    expect(c.nombre).toBe("Muebles Luna SA de CV");

    const p = (await getProyecto(ids.proyecto))!;
    expect(p.cliente_id, "el proyecto cambió de dueño").toBe(ids.enDash);
  });

  it("y queda un solo cliente en la lista", async () => {
    const lista = await listClientes();
    expect(lista.map((c) => c.id)).toEqual([ids.enDash]);
  });
});
