/* Los ítems de un proyecto al editarlos: que se respeten los cambios.
 *
 * Mike lo reportó el 20-sep: al editar la lista de ítems dentro de un
 * proyecto y guardar, en vez de quedar la lista que se ve en pantalla,
 * quedaban los de antes MÁS los editados, y no había manera de borrar uno.
 * Eso infla el precio de venta del proyecto, que es la suma de sus ítems.
 *
 * Esta prueba recorre exactamente eso contra staging, con los mismos módulos
 * que usa la pantalla.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCliente } from "@/lib/clientes";
import { createProyecto, getProyecto, updateProyecto } from "@/lib/proyectos";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `it-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { negocio: "", cliente: "", proyecto: "" };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Prueba de ítems" } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cliente = await createCliente(uid, { nombre: "Cliente Uno", negocio_id: ids.negocio });
  ids.proyecto = await createProyecto(uid, {
    nombre: "Casa Uno", cliente_id: ids.cliente, cliente_nombre: "Cliente Uno",
    negocio_id: ids.negocio, negocio_nombre: "Taller",
    precio_venta: 0, estado: "activo", fecha_inicio: new Date(2026, 8, 1), partidas: [],
    productos: [
      { nombre: "Cocina", monto: 100 },
      { nombre: "Clóset", monto: 200 },
    ],
  });
}, 90000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("editar la lista de ítems de un proyecto", () => {
  it("nace con los dos que se pidieron, y el precio es su suma", async () => {
    const p = (await getProyecto(ids.proyecto))!;
    expect(p.productos).toHaveLength(2);
    expect(p.precio_venta).toBe(300);
  });

  it("se cambia uno, se borra otro y se agrega uno nuevo: queda LO QUE SE VE", async () => {
    const p = (await getProyecto(ids.proyecto))!;
    const cocina = p.productos!.find((x) => x.nombre === "Cocina")!;

    await updateProyecto(ids.proyecto, {
      productos: [
        // el que se queda, con otro monto
        { id: cocina.id, nombre: "Cocina", monto: 150 },
        // uno nuevo, sin id
        { nombre: "Isla", monto: 50 },
        // y «Clóset» ya no viene: se borró en la pantalla
      ],
    });

    const d = (await getProyecto(ids.proyecto))!;
    const nombres = d.productos!.map((x) => x.nombre).sort();
    expect(nombres, "quedan exactamente los dos de la lista").toEqual(["Cocina", "Isla"]);
    expect(d.productos!.find((x) => x.nombre === "Cocina")!.monto).toBe(150);
    expect(d.precio_venta, "y el precio es la suma de lo que quedó").toBe(200);
  });

  it("guardar dos veces seguidas lo mismo no duplica nada", async () => {
    const antes = (await getProyecto(ids.proyecto))!;
    const mismos = antes.productos!.map((x) => ({ id: x.id, nombre: x.nombre, monto: x.monto }));
    await updateProyecto(ids.proyecto, { productos: mismos });
    await updateProyecto(ids.proyecto, { productos: mismos });
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.productos).toHaveLength(antes.productos!.length);
    expect(d.precio_venta).toBe(antes.precio_venta);
  });

  it("guardar con la MISMA forma que manda la pantalla no duplica", async () => {
    /* La pantalla no manda sólo `productos`: manda también nombre,
     * descripción, precio_venta, estado, fecha y partidas, todo junto. Esta
     * prueba usa esa forma exacta, porque es la que reportó Mike. */
    const antes = (await getProyecto(ids.proyecto))!;
    const filas = antes.productos!.map((x) => ({
      id: x.id, nombre: x.nombre, descripcion: x.descripcion || undefined,
      monto: x.monto, fecha_entrega: null,
    }));
    await updateProyecto(ids.proyecto, {
      nombre: antes.nombre,
      descripcion: antes.descripcion ?? "",
      precio_venta: antes.precio_venta,
      estado: antes.estado,
      fecha_inicio: new Date(2026, 8, 1),
      productos: filas,
      partidas: [],
    });
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.productos!.map((x) => x.nombre).sort()).toEqual(antes.productos!.map((x) => x.nombre).sort());
    expect(d.precio_venta).toBe(antes.precio_venta);
  });

  it("la cantidad viaja y el precio de venta NO se multiplica otra vez", async () => {
    /* Mike, 20-sep: «a veces son 20 puertas del mismo acabado y precio».
     * `monto` es el importe de la LÍNEA —las 20 juntas—; si alguien lo
     * tratara como el precio de una, el precio de venta del proyecto saldría
     * multiplicado por veinte y nadie lo notaría hasta cobrarle al cliente. */
    await updateProyecto(ids.proyecto, {
      productos: [{ nombre: "Puerta de clóset", monto: 30_000, cantidad: 20 }],
    });
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.productos).toHaveLength(1);
    expect(d.productos![0].cantidad).toBe(20);
    expect(d.productos![0].monto).toBe(30_000);
    expect(d.precio_venta, "la suma es del importe de la línea").toBe(30_000);
  });

  it("sin decir cantidad, es uno: lo que ya existía no cambia", async () => {
    await updateProyecto(ids.proyecto, { productos: [{ nombre: "Barra", monto: 8_000 }] });
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.productos![0].cantidad).toBe(1);
    expect(d.precio_venta).toBe(8_000);
  });

  it("se pueden dejar en cero: un proyecto sin ítems vale cero", async () => {
    await updateProyecto(ids.proyecto, { productos: [] });
    const d = (await getProyecto(ids.proyecto))!;
    expect(d.productos).toHaveLength(0);
    expect(d.precio_venta).toBe(0);
  });
});
