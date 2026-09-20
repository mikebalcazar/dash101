/* Agrupar, acomodar, y dar de alta con precio desde el plano · contrato 0.30.0
 *
 * Cuatro encargos de Mike del 20-sep sobre la misma lista de ítems:
 *
 *   «Necesito poder agrupar varios ítems en un solo concepto» · «quiero
 *   poder ordenar los ítems y agrupar por partidas, incluso por pestañas» ·
 *   «debería poder agregar un ítem nuevo con precio y descripción para que
 *   ya se sume» · «o agregarlo al conteo de un concepto ya existente».
 *
 * LO QUE DE VERDAD MIDE ESTE ARCHIVO, y la pantalla no puede revisar sola:
 *
 *   · que el DINERO viaje en centavos en las tres rutas nuevas, y que la
 *     pantalla lo divida una sola vez. `agrupables` trae el precio por
 *     pieza; si viniera en pesos saldría cien veces más chico;
 *   · que juntar NO MUEVA el precio de venta del proyecto, leído por donde
 *     lo lee la pantalla (`getProyecto`), no por donde lo escribe la API;
 *   · que la partida y el orden LLEGUEN HASTA `productos`, que es el
 *     renglón con el que se pintan las pestañas. Una columna nueva que la
 *     API guarda y el adaptador no copia se ve igual que una que no se
 *     guardó;
 *   · que el alta con precio deje el ítem VENDIDO y sumado, y sin precio no.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir, pedirCrudo } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCliente } from "@/lib/clientes";
import { createProyecto, getProyecto } from "@/lib/proyectos";
import { ligarObra, itemsDeLaObra, fusionarItemsDeLaObra } from "@/lib/obras";
import { acomodar, agrupables, agrupar } from "@/lib/items-grupo";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `ag-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

let uid = "";
const ids = { negocio: "", cliente: "", proyecto: "", obra: "", plano: "" };

const pieza = async (name: string) =>
  (await pedirCrudo<{ id: string }>(`/orgs/${ORG}/quell/plans/${ids.plano}/elements`, {
    method: "POST",
    body: { op_id: crypto.randomUUID(), name, type: "Puerta", x: 0.3, y: 0.3 },
  })).id;

const productos = async () => (await getProyecto(ids.proyecto))!.productos ?? [];
const venta = async () => (await getProyecto(ids.proyecto))!.precio_venta;

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Agrupar ítems", apps: { dash: true, quell: true } } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cliente = await createCliente(uid, { nombre: "Familia", negocio_id: ids.negocio });
  ids.proyecto = await createProyecto(uid, {
    negocio_id: ids.negocio, negocio_nombre: "Taller",
    cliente_id: ids.cliente, cliente_nombre: "Familia",
    nombre: "Casa", estado: "activo", precio_venta: 26_000,
    partidas: [], fecha_inicio: new Date(2026, 2, 1),
    /* Tres renglones capturados por separado, que es justo el problema:
     * dos puertas iguales y una barra. */
    productos: [
      { nombre: "Puerta de recámara", monto: 8_000, cantidad: 1 },
      { nombre: "Puerta de recámara", monto: 8_000, cantidad: 1 },
      { nombre: "Barra de cocina", monto: 10_000, cantidad: 1 },
    ],
  });

  await pedirCrudo(`/orgs/${ORG}/quell/me`);
  ids.obra = (await pedirCrudo<{ id: string }>(`/orgs/${ORG}/quell/projects`, {
    method: "POST", body: { name: "Casa (obra)", client: "Familia" },
  })).id;
  const fd = new FormData();
  fd.set("name", "Planta"); fd.set("file_name", "p.pdf"); fd.set("width", "1000"); fd.set("height", "800");
  fd.set("image", new File([PNG], "plan.png", { type: "image/png" }));
  ids.plano = (await pedirCrudo<{ id: string }>(`/orgs/${ORG}/quell/projects/${ids.obra}/plans`, { method: "POST", body: fd })).id;
  await ligarObra(ids.obra, ids.proyecto);
}, 120000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("juntar varios renglones en un concepto", () => {
  it("propone las dos puertas, con el precio POR PIEZA en centavos", async () => {
    const g = await agrupables(ids.proyecto);
    const puertas = g.find((x) => x.nombre === "Puerta de recámara");
    expect(puertas, `las propuso: ${JSON.stringify(g)}`).toBeTruthy();
    expect(puertas!.renglones).toBe(2);
    /* En CENTAVOS. Si viniera en pesos, la pantalla pintaría $80.00 la
     * puerta y nadie lo notaría hasta cuadrar un total. */
    expect(puertas!.precio_pieza).toBe(8_000_00);
    expect(g.find((x) => x.nombre === "Barra de cocina"), "la barra no se repite").toBeFalsy();
  });

  it("proponer no escribe: el precio de venta no se mueve", async () => {
    const antes = await venta();
    await agrupables(ids.proyecto);
    await agrupables(ids.proyecto);
    expect(await venta()).toBe(antes);
  });

  it("al juntarlas queda un renglón de dos piezas, y la venta sigue igual", async () => {
    const antes = await venta();
    const g = (await agrupables(ids.proyecto)).find((x) => x.nombre === "Puerta de recámara")!;
    const r = await agrupar(ids.proyecto, {
      queda_id: g.items[0].id,
      se_van: g.items.slice(1).map((i) => i.id),
      nombre: "Puerta de recámara 0.90 × 2.40",
    });
    expect(r.absorbidos).toBe(1);

    const lista = await productos();
    const concepto = lista.find((p) => p.nombre === "Puerta de recámara 0.90 × 2.40");
    expect(concepto, `quedó el concepto: ${JSON.stringify(lista.map((l) => l.nombre))}`).toBeTruthy();
    expect(concepto!.cantidad).toBe(2);
    expect(concepto!.monto, "el importe es la suma, en pesos del lado de la pantalla").toBe(16_000);
    expect(lista.length, "y un renglón menos").toBe(2);
    expect(await venta(), "acomodar la lista no cambia lo que se cobra").toBe(antes);
  });
});

describe("la partida y el orden", () => {
  it("se guardan y llegan hasta `productos`, que es con lo que se pintan las pestañas", async () => {
    const lista = await productos();
    const puerta = lista.find((p) => p.nombre.startsWith("Puerta"))!;
    const barra = lista.find((p) => p.nombre === "Barra de cocina")!;
    expect(puerta.partida ?? "", "nace sin partida: nada se acomoda solo").toBe("");

    const cuantos = await acomodar(ids.proyecto, [
      { id: barra.id, partida: "Cocina", orden: 1 },
      { id: puerta.id, partida: "Recámaras", orden: 1 },
    ]);
    expect(cuantos).toBe(2);

    const luego = await productos();
    expect(luego.find((p) => p.id === barra.id)!.partida).toBe("Cocina");
    expect(luego.find((p) => p.id === puerta.id)!.partida).toBe("Recámaras");
    expect(luego.find((p) => p.id === puerta.id)!.orden).toBe(1);
  });

  it("acomodar no mueve un peso", async () => {
    const antes = await venta();
    const lista = await productos();
    await acomodar(ids.proyecto, lista.map((p, i) => ({ id: p.id, orden: lista.length - i })));
    expect(await venta()).toBe(antes);
  });
});

describe("desde el plano", () => {
  it("con precio, el ítem nace vendido y la venta sube", async () => {
    const antes = await venta();
    const e = await pieza("Clóset de blancos");
    const p = await itemsDeLaObra(ids.obra);
    const suelta = p.nuevos.find((n) => n.element_id === e)!;
    expect(suelta, "la pieza no se parece a ningún ítem").toBeTruthy();

    const r = await fusionarItemsDeLaObra(ids.obra, {
      crear: [{ element_id: e, monto: 12_000_00, nombre: "Clóset de blancos 1.20", descripcion: "Nogal" }],
    });
    expect(r.creados).toBe(1);
    expect(await venta(), "12,000 más, en pesos").toBe(antes + 12_000);

    const nuevo = (await productos()).find((x) => x.nombre === "Clóset de blancos 1.20");
    expect(nuevo, "y sale en la lista del proyecto").toBeTruthy();
    expect(nuevo!.descripcion).toBe("Nogal");
  });

  it("sin precio no mueve la venta", async () => {
    const antes = await venta();
    const e = await pieza("Repisa sin cotizar");
    const r = await fusionarItemsDeLaObra(ids.obra, { crear: [e] });
    expect(r.creados).toBe(1);
    expect(await venta()).toBe(antes);
  });

  it("una pieza más al concepto: sin pedirlo se rechaza; pidiéndolo, sube la venta", async () => {
    /* El concepto de las puertas dice dos piezas y ya tiene dos… si están
     * ubicadas. Aquí no lo están, así que primero se ubican las dos y la
     * tercera es la que no cabe. */
    const lista = await productos();
    const concepto = lista.find((p) => p.nombre.startsWith("Puerta"))!;
    const e1 = await pieza("Puerta 1");
    const e2 = await pieza("Puerta 2");
    await fusionarItemsDeLaObra(ids.obra, { ligar: [
      { element_id: e1, item_id: concepto.id }, { element_id: e2, item_id: concepto.id },
    ] });

    const e3 = await pieza("Puerta 3");
    await expect(
      fusionarItemsDeLaObra(ids.obra, { ligar: [{ element_id: e3, item_id: concepto.id }] }),
    ).rejects.toThrow();

    const antes = await venta();
    const r = await fusionarItemsDeLaObra(ids.obra, { ligar: [{ element_id: e3, item_id: concepto.id, sumar: true }] });
    expect(r.sumados).toBe(1);
    expect(await venta(), "una puerta más vale una puerta más").toBe(antes + 8_000);
    expect((await productos()).find((p) => p.id === concepto.id)!.cantidad).toBe(3);
  });
});
