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
import { acomodar, agrupables, agrupar, asignarProducto, productosDelProyecto } from "@/lib/items-grupo";

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

  it("al agruparlas NO se borra ningún renglón: los dos apuntan al producto", async () => {
    /* Esta prueba decía «queda un renglón de dos piezas» y era cierta hasta
     * el contrato 0.34.0, cuando agrupar fusionaba. Mike pidió el 20-sep
     * poder mover de grupo un ítem ya agrupado —imposible con un renglón
     * borrado— y escogió que el grupo de producto reemplace a la fusión.
     * Se reescribe en vez de borrarse: dejarla habría dejado en pie el
     * entendimiento que él corrigió. */
    const antes = await venta();
    const g = (await agrupables(ids.proyecto)).find((x) => x.nombre === "Puerta de recámara")!;
    const cuantos = (await productos()).length;
    const r = await agrupar(ids.proyecto, {
      items: g.items.map((i) => i.id),
      nombre: "Puerta de recámara 0.90 × 2.40",
    });
    expect(r.items, "las dos entraron").toBe(2);
    expect(r.producto.nombre).toBe("Puerta de recámara 0.90 × 2.40");
    expect(r.producto.precio, "el precio del modelo es POR PIEZA y en centavos").toBe(8_000_00);
    expect(r.venta_antes, "y dice cuánto valía antes, para poder enseñarlo").toBe(r.venta_despues);

    const lista = await productos();
    expect(lista.length, "ningún renglón se borró").toBe(cuantos);
    for (const id of g.items.map((i) => i.id)) {
      const fila = lista.find((x) => x.id === id);
      expect(fila, `${id} sigue en la lista`).toBeTruthy();
      expect(fila!.producto_id, "y apunta al producto").toBe(r.producto.id);
      expect(fila!.cantidad, "cada renglón sigue siendo una pieza").toBe(1);
    }
    expect(await venta(), "agruparlas al mismo precio no cambia lo que se cobra").toBe(antes);
  });

  it("y ya no se vuelven a proponer", async () => {
    const g = await agrupables(ids.proyecto);
    expect(g.find((x) => x.nombre.startsWith("Puerta"))).toBeFalsy();
  });
});

describe("el dropdown del producto, y cambiarse de grupo", () => {
  /* Mike, 20-sep: «todos los ítems deberían tener un dropdown para
   * seleccionar qué producto es, o nuevo si el ítem es su mismo producto
   * único. El dropdown debe tener 1) los ítems que son únicos en el proyecto
   * 2) los productos que ya tienen varios ítems agrupados». */
  it("trae los productos de la obra y los ítems todavía únicos", async () => {
    const { productos: prods, unicos } = await productosDelProyecto(ids.proyecto);
    expect(prods.length, "el de las puertas ya está").toBeGreaterThan(0);
    expect(prods[0].items, "dice cuántas piezas trae, que es lo que se lee al escoger").toBe(2);
    const nombres = unicos.map((u) => u.nombre);
    expect(nombres, "la barra sigue siendo su propio producto único").toContain("Barra de cocina");
    expect(nombres, "y las puertas ya no, porque ya están agrupadas").not.toContain("Puerta de recámara");
    expect(unicos[0].precio_pieza, "cada único trae su precio por pieza, en centavos").toBeGreaterThan(0);
  });

  it("meter un ítem al producto le hereda el costo y mueve la venta", async () => {
    const { productos: prods } = await productosDelProyecto(ids.proyecto);
    const modelo = prods[0];
    const barra = (await productos()).find((p) => p.nombre === "Barra de cocina")!;
    const antes = await venta();
    const r = await asignarProducto(barra.id, { producto_id: modelo.id });
    expect(r.producto!.id).toBe(modelo.id);
    /* La venta se mueve por la diferencia entre lo que costaba la barra y lo
     * que cuesta el modelo. Es la regla de Mike —«adquiere en automático ese
     * costo»— y la única de esto con consecuencia en dinero. */
    /* `venta()` está en PESOS —es lo que pinta la pantalla— y la respuesta
     * de la API en CENTAVOS. Dividir aquí es la conversión de siempre. */
    expect(r.venta_antes / 100).toBe(antes);
    expect(r.venta_despues).not.toBe(r.venta_antes);
    const ya = (await productos()).find((p) => p.id === barra.id)!;
    expect(ya.monto, "en pesos del lado de la pantalla").toBe(modelo.precio / 100);
    expect(await venta()).toBe(r.venta_despues / 100);
  });

  it("sacarlo del grupo lo deja como su propio producto único, con su precio", async () => {
    const barra = (await productos()).find((p) => p.nombre === "Barra de cocina")!;
    const antes = await venta();
    const r = await asignarProducto(barra.id, { solo: true });
    expect(r.producto).toBeNull();
    const ya = (await productos()).find((p) => p.id === barra.id)!;
    expect(ya.producto_id ?? null, "ya no apunta a ninguno").toBeNull();
    expect(await venta(), "y salirse no le quita el precio que heredó").toBe(antes);
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

  it("una pieza más al ítem: sin pedirlo se rechaza; pidiéndolo, sube la venta", async () => {
    /* Esta prueba decía «el concepto de las puertas dice dos piezas» porque
     * antes agrupar FUSIONABA y dejaba un renglón de cantidad 2. Desde el
     * contrato 0.35.0 las dos puertas siguen siendo dos renglones de una
     * pieza cada uno —agrupar ya no borra—, así que el cupo se llena con la
     * primera y la segunda es la que no cabe. Lo que mide es lo mismo: que
     * pasarse del cupo NO sea silencioso, y que crecer el ítem cueste. */
    const lista = await productos();
    const item = lista.find((p) => p.nombre.startsWith("Puerta"))!;
    expect(item.cantidad, "una pieza: agrupar ya no fusiona").toBe(1);

    const e1 = await pieza("Puerta 1");
    await fusionarItemsDeLaObra(ids.obra, { ligar: [{ element_id: e1, item_id: item.id }] });

    const e2 = await pieza("Puerta 2");
    await expect(
      fusionarItemsDeLaObra(ids.obra, { ligar: [{ element_id: e2, item_id: item.id }] }),
    ).rejects.toThrow();

    const antes = await venta();
    const r = await fusionarItemsDeLaObra(ids.obra, { ligar: [{ element_id: e2, item_id: item.id, sumar: true }] });
    expect(r.sumados).toBe(1);
    expect(await venta(), "una puerta más vale una puerta más").toBe(antes + 8_000);
    expect((await productos()).find((p) => p.id === item.id)!.cantidad).toBe(2);
  });
});
