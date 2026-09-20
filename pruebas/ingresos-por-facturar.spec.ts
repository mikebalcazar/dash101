/* Un cobro que falta facturar, desde las mismas funciones que usa la pantalla.
 *
 * Encargo de Mike del 20-sep. Lo que se mide aquí, y que la prueba de la API
 * no alcanza a ver, es EL CAMINO DE LA PANTALLA: que lo que captura el
 * formulario de un movimiento nuevo llegue como espera de factura, y que la
 * lista de pendientes lo traiga con su tipo —de eso depende que el IVA de esa
 * factura se traslade o se acredite, y ése es el número que se entera—.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCliente } from "@/lib/clientes";
import { createCuenta } from "@/lib/cuentas";
import { createMovimiento } from "@/lib/movimientos";
import { listPendientes, crearCfdi, ligarCfdi, getIva } from "@/lib/fiscal";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `if-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { negocio: "", cuenta: "", cliente: "" };

/** Un cobro al cliente, como lo manda el formulario. */
const cobrar = (monto: number, requiere_factura: boolean) =>
  createMovimiento(uid, {
    tipo: "ingreso", monto, fecha: new Date(2026, 2, 10),
    cuenta_id: ids.cuenta, cuenta_nombre: "Banco",
    contraparte_id: ids.cliente, contraparte_tipo: "cliente", contraparte_nombre: "HOLCIM",
    negocio_id: ids.negocio, requiere_factura,
  });

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Ingresos por facturar" } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cuenta = await createCuenta(uid, { nombre: "Banco", tipo: "banco", saldo_inicial: 0, negocio_id: ids.negocio, moneda: "MXN" });
  ids.cliente = await createCliente(uid, { nombre: "HOLCIM", negocio_id: ids.negocio });
}, 90000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("los ingresos pendientes de facturar", () => {
  it("un cobro marcado «falta facturar» aparece en la lista, con su tipo", async () => {
    const id = await cobrar(900_000, true);
    const filas = await listPendientes(ids.negocio);
    const mio = filas.find((f) => f.id === id);
    expect(mio, "el cobro sale en pendientes").toBeTruthy();
    expect(mio!.tipo, "y viene marcado como ingreso").toBe("ingreso");
    expect(mio!.monto, "en pesos, no en centavos").toBe(900_000);
  });

  it("uno marcado «no lleva» no estorba en la lista", async () => {
    const id = await cobrar(50_000, false);
    const filas = await listPendientes(ids.negocio);
    expect(filas.some((f) => f.id === id), "un préstamo del socio no es una venta").toBe(false);
  });

  it("se puede pedir un lado solo", async () => {
    const soloIngresos = await listPendientes(ids.negocio, "ingreso");
    expect(soloIngresos.length).toBeGreaterThan(0);
    expect(soloIngresos.every((f) => f.tipo === "ingreso")).toBe(true);
    expect(await listPendientes(ids.negocio, "egreso"), "aquí no hay pagos pendientes").toEqual([]);
  });

  it("al colgarle la factura sale de la lista, y su IVA se TRASLADA (no se acredita)", async () => {
    /* El caso que más caro cuesta si se hace mal. El tipo del CFDI decide de
     * qué lado cae el IVA: el de un cobro se traslada —lo cobraste— y el de
     * un pago se acredita. La pantalla lo tenía fijo en «egreso» de cuando
     * esta lista sólo podía traer pagos; si se hubiera quedado así, cada
     * factura de venta habría bajado el IVA a enterar en vez de subirlo. */
    const id = await cobrar(116_000, true);
    const antes = await getIva({ mes: "2026-03" }, ids.negocio);

    const c = await crearCfdi({
      negocio_id: ids.negocio, uuid: `${Date.now()}-AAAA-BBBB-CCCC-DDDDDDDDDDDD`.slice(0, 36),
      tipo: "ingreso", rfc: "XAXX010101000",
      subtotal: 100_000, iva: 16_000, retenciones: 0, total: 116_000, fecha: "2026-03-10",
    });
    await ligarCfdi(c.id, id);

    const filas = await listPendientes(ids.negocio, "ingreso");
    expect(filas.some((f) => f.id === id), "ya no está pendiente").toBe(false);

    const despues = await getIva({ mes: "2026-03" }, ids.negocio);
    expect(despues.trasladado - antes.trasladado, "subió el IVA que trasladas").toBe(16_000);
    expect(despues.acreditable - antes.acreditable, "y el acreditable no se movió").toBe(0);
  });
});
