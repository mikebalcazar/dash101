/* Borrar lo cancelado de un proyecto, desde dash101 · contrato 0.38.0
 *
 * Mike, 21-sep, con HOLCIM enfrente: «ya todo lo cancelado lo puedes
 * eliminar por completo».
 *
 * Contra staging, con los mismos módulos que llama la pantalla.
 *
 * LO QUE DE VERDAD MIDE:
 *
 *   · que REVISAR no escriba. La pantalla enseña ese censo y encima de él
 *     alguien pica un botón que no se deshace; si revisar borrara aunque
 *     fuera un renglón, la vista previa sería el daño;
 *   · que lo que la vista previa PROMETE sea lo que el borrado HACE. Son la
 *     misma llamada con una bandera justamente para esto, y esta prueba es
 *     la que lo sostiene;
 *   · que un cancelado con un COBRO encima se quede, y que el cobro siga
 *     ahí. Es el caso que hace peligrosa la limpieza de HOLCIM;
 *   · que el precio de venta no se mueva, leído por donde lo lee la
 *     pantalla (`getProyecto`), no por donde lo devuelve la ruta;
 *   · que lo VIVO no se toque.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { fueraDeAlcance } from "@/lib/api/leer";
import { createNegocio } from "@/lib/negocios";
import { createCliente } from "@/lib/clientes";
import { createCuenta } from "@/lib/cuentas";
import { createMovimiento } from "@/lib/movimientos";
import { createProyecto, getProyecto } from "@/lib/proyectos";
import { aprobarItem, borrarCancelados, cancelarItem, revisarCancelados } from "@/lib/items-grupo";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `bc-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { negocio: "", cliente: "", cuenta: "", proyecto: "" };

const nuevoItem = async (nombre: string, pesos: number, estado: "vendido" | "cotizado" = "vendido") =>
  (await pedir<{ id: string }>(`/orgs/${ORG}/items`, {
    method: "POST",
    body: {
      negocio_id: ids.negocio, cliente_id: ids.cliente, proyecto_id: ids.proyecto,
      nombre, monto: Math.round(pesos * 100), cantidad: 1, estado,
    },
  })).id;

/** Aprobado y luego cancelado: un cancelado de verdad. */
const cancelado = async (nombre: string, pesos: number) => {
  const id = await nuevoItem(nombre, pesos);
  await aprobarItem(id);
  expect(await cancelarItem(id, "el cliente lo quitó")).toBe("cancelado");
  return id;
};

const vive = async (id: string) => {
  try { return !!(await pedir<{ id: string }>(`/orgs/${ORG}/items/${id}`)).id; }
  catch { return false; }
};

const venta = async () => (await getProyecto(ids.proyecto))!.precio_venta;

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Borrar cancelados", apps: { dash: true } } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cliente = await createCliente(uid, { nombre: "HOLCIM", negocio_id: ids.negocio });
  ids.cuenta = await createCuenta(uid, { nombre: "Banco", tipo: "banco", saldo_inicial: 0, negocio_id: ids.negocio, moneda: "MXN" });
  ids.proyecto = await createProyecto(uid, {
    negocio_id: ids.negocio, negocio_nombre: "Taller",
    cliente_id: ids.cliente, cliente_nombre: "HOLCIM",
    nombre: "Obra", estado: "activo", precio_venta: 0,
    partidas: [], fecha_inicio: new Date(2026, 2, 1), items: [],
  });
}, 120000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("revisar no escribe", () => {
  let uno = "", dos = "";

  beforeAll(async () => {
    uno = await cancelado("Puerta que se cayó", 5_000);
    dos = await cancelado("Clóset que se cayó", 3_000);
  });

  it("el censo cuenta los dos y no borra ninguno", async () => {
    const antes = await venta();
    const r = await revisarCancelados(ids.proyecto);
    expect(r.total).toBe(2);
    expect(r.cancelados).toBe(2);
    expect(r.borrados).toBe(0);
    expect(r.se_van.map((x) => x.id).sort()).toEqual([uno, dos].sort());
    expect(await vive(uno)).toBe(true);
    expect(await vive(dos)).toBe(true);
    expect(await venta()).toBe(antes);
  });

  it("revisar dos veces da lo mismo", async () => {
    const a = await revisarCancelados(ids.proyecto);
    const b = await revisarCancelados(ids.proyecto);
    expect(b.total).toBe(a.total);
    expect(b.se_van.length).toBe(a.se_van.length);
  });
});

describe("lo que trae dinero se queda", () => {
  let conCobro = "", limpio = "", vivo = "", movimiento = "";

  beforeAll(async () => {
    vivo = await nuevoItem("Éste está vendido", 12_000);
    conCobro = await cancelado("Cancelado con anticipo cobrado", 8_000);
    movimiento = await createMovimiento(uid, {
      tipo: "ingreso", monto: 2_000, fecha: new Date(2026, 2, 10),
      cuenta_id: ids.cuenta, cuenta_nombre: "Banco",
      contraparte_id: ids.cliente, contraparte_tipo: "cliente", contraparte_nombre: "HOLCIM",
      /* `producto_id` en dash101 es el ÍTEM del proyecto: el nombre viene de
       * la época de Firestore y el adaptador lo manda como `item_id`. */
      negocio_id: ids.negocio, proyecto_id: ids.proyecto, producto_id: conCobro,
      descripcion: "Anticipo de lo que luego se canceló",
    });
    limpio = await cancelado("Éste sí se puede ir", 4_000);
  });

  it("la vista previa lo aparta y dice por qué", async () => {
    const r = await revisarCancelados(ids.proyecto);
    const atado = r.se_quedan.find((x) => x.id === conCobro);
    expect(atado, "el del cobro sale en los que se quedan").toBeTruthy();
    expect(atado!.porque.join(" ")).toContain("movimiento");
    expect(r.se_van.map((x) => x.id)).toContain(limpio);
    expect(r.se_van.map((x) => x.id)).not.toContain(conCobro);
  });

  it("el borrado hace exactamente lo que la vista previa prometió", async () => {
    const previa = await revisarCancelados(ids.proyecto);
    const hecho = await borrarCancelados(ids.proyecto);
    expect(hecho.borrados).toBe(previa.se_van.length);
    expect(hecho.se_quedan.map((x) => x.id).sort()).toEqual(previa.se_quedan.map((x) => x.id).sort());
    for (const x of previa.se_van) expect(await vive(x.id), `${x.nombre} debía irse`).toBe(false);
    expect(await vive(conCobro), "el del cobro se queda").toBe(true);
  });

  it("y el cobro sigue colgado de su ítem", async () => {
    const m = await pedir<{ item_id: string | null }>(`/orgs/${ORG}/movimientos/${movimiento}`);
    expect(m.item_id).toBe(conCobro);
  });

  it("lo vendido no se tocó y el precio de venta no se movió", async () => {
    expect(await vive(vivo)).toBe(true);
    expect(await venta()).toBe(12_000);
  });

  it("la pestaña «Cancelados» ya sólo tiene el que no se pudo borrar", async () => {
    const { cancelados } = await fueraDeAlcance(ids.proyecto);
    expect(cancelados.map((x) => x.id)).toEqual([conCobro]);
  });
});
