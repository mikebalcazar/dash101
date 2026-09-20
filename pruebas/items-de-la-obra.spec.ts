/* Juntar los ítems del proyecto con las piezas del plano · contrato 0.26.0.
 *
 * Mike, 20-sep: los ítems de la obra en quell101 y los del proyecto en
 * dash101 son la misma lista de piezas capturada dos veces.
 *
 * LO QUE DE VERDAD MIDE ESTE ARCHIVO, que es lo que la pantalla no puede
 * revisar sola:
 *
 *   · que el DINERO llegue en centavos y se lea como tal. La propuesta trae
 *     el monto del ítem, y la pantalla lo divide entre cien una sola vez; si
 *     la API lo mandara en pesos, saldría cien veces más chico y nadie lo
 *     notaría hasta ver un total raro;
 *   · que PEDIR LA PROPUESTA no escriba nada. La pantalla la pide cada vez
 *     que se abre el proyecto: si escribiera, abrir un proyecto cambiaría los
 *     datos de ese proyecto;
 *   · que aplicar sólo lo palomeado deje lo demás EN PAZ. La pantalla manda
 *     una parte de la propuesta, no toda, y eso tiene que bastar.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir, pedirCrudo } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCliente } from "@/lib/clientes";
import { createProyecto, getProyecto } from "@/lib/proyectos";
import { ligarObra, listObras, itemsDeLaObra, fusionarItemsDeLaObra } from "@/lib/obras";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `io-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

let uid = "";
const ids = { negocio: "", cliente: "", proyecto: "", obra: "", plano: "" };

/** Una pieza en el plano, sin ítem: es la que hay que emparejar. */
const pieza = async (name: string, type = "Mueble") =>
  (await pedirCrudo<{ id: string }>(`/orgs/${ORG}/quell/plans/${ids.plano}/elements`, {
    method: "POST",
    body: { op_id: crypto.randomUUID(), name, type, x: 0.3, y: 0.3 },
  })).id;

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Ítems de la obra", apps: { dash: true, quell: true } } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cliente = await createCliente(uid, { nombre: "Familia", negocio_id: ids.negocio });
  ids.proyecto = await createProyecto(uid, {
    negocio_id: ids.negocio, negocio_nombre: "Taller",
    cliente_id: ids.cliente, cliente_nombre: "Familia",
    nombre: "Casa", estado: "activo", precio_venta: 60_000,
    partidas: [], fecha_inicio: new Date(2026, 2, 1),
    productos: [{ nombre: "Barra de cocina", monto: 60_000, cantidad: 1 }],
  });

  // El lado de la obra. La sesión de quell101 se abre con /me, como en la app.
  await pedirCrudo(`/orgs/${ORG}/quell/me`);
  ids.obra = (await pedirCrudo<{ id: string }>(`/orgs/${ORG}/quell/projects`, {
    method: "POST", body: { name: "Casa (obra)", client: "Familia" },
  })).id;

  const fd = new FormData();
  fd.set("name", "Planta"); fd.set("file_name", "p.pdf"); fd.set("width", "1000"); fd.set("height", "800");
  fd.set("image", new File([PNG], "plan.png", { type: "image/png" }));
  ids.plano = (await pedirCrudo<{ id: string }>(`/orgs/${ORG}/quell/projects/${ids.obra}/plans`, { method: "POST", body: fd })).id;
  expect(ids.plano, "el plano se subió").toBeTruthy();
}, 120000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("juntar los ítems de la obra con los del proyecto", () => {
  it("ligada la casa, la propuesta empareja la pieza con su ítem y trae el monto en centavos", async () => {
    await ligarObra(ids.obra, ids.proyecto);
    await pieza("Barra de cocina");

    const p = await itemsDeLaObra(ids.obra);
    const par = p.parejas.find((x) => x.pieza === "Barra de cocina");
    expect(par, `la emparejó: ${JSON.stringify(p)}`).toBeTruthy();
    expect(par!.por).toBe("nombre");
    /* En CENTAVOS. El ítem se capturó en 60,000 pesos; si esto viniera en
     * pesos, la pantalla lo pintaría en $600.00 y nadie lo notaría hasta
     * cuadrar un total. */
    expect(par!.monto).toBe(60_000_00);
  });

  it("pedir la propuesta no escribe: el precio de venta no se mueve", async () => {
    /* La pantalla la pide cada vez que se abre el proyecto. Si escribiera,
     * abrir un proyecto cambiaría los datos de ese proyecto. */
    const antes = (await getProyecto(ids.proyecto))!.precio_venta;
    await itemsDeLaObra(ids.obra);
    await itemsDeLaObra(ids.obra);
    expect((await getProyecto(ids.proyecto))!.precio_venta).toBe(antes);
  });

  it("aplicar sólo lo palomeado deja lo demás en paz", async () => {
    await pieza("Clóset del pasillo");
    await pieza("Cabecera");

    const p = await itemsDeLaObra(ids.obra);
    const closet = p.nuevos.find((n) => n.pieza === "Clóset del pasillo")!;
    expect(closet, "hay una pieza sin ítem").toBeTruthy();

    const r = await fusionarItemsDeLaObra(ids.obra, { crear: [closet.element_id] });
    expect(r.creados).toBe(1);

    const luego = await itemsDeLaObra(ids.obra);
    expect(luego.nuevos.map((n) => n.pieza), "la que no se palomeó sigue esperando").toContain("Cabecera");
    expect(luego.nuevos.map((n) => n.pieza)).not.toContain("Clóset del pasillo");
  });

  it("el ítem traído del plano NO mueve el monto de venta del proyecto", async () => {
    /* Es la razón de que nazca cotizado y en cero: una pieza del plano no
     * trae precio, y una venta de cero pesos en la proyección es una cifra
     * que nadie tecleó. */
    const p = await getProyecto(ids.proyecto);
    expect(p!.precio_venta).toBe(60_000);
    const closet = (p!.productos ?? []).find((x) => x.nombre === "Clóset del pasillo");
    expect(closet, "pero el ítem sí está en la lista, para ponerle precio").toBeTruthy();
    expect(closet!.monto).toBe(0);
  });

  it("una obra sin liga lo dice, no contesta una lista vacía", async () => {
    /* Una lista vacía se lee igual que «no hay nada que juntar», y no es lo
     * mismo que «falta ligar la casa». */
    const otra = await pedirCrudo<{ id: string }>(`/orgs/${ORG}/quell/projects`, {
      method: "POST", body: { name: "Depa suelto", client: "Otro" },
    });
    await expect(itemsDeLaObra(otra.id)).rejects.toThrow(/sin_liga/);
    expect((await listObras(true)).map((o) => o.id)).toContain(otra.id);
  });
});
