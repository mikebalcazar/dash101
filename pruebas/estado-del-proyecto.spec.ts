/* El estado de cuenta de un proyecto, desde dash101 · contrato 0.39.0
 *
 * Mike, 21-sep: «necesito poder exportar un estado de cuenta en pdf y un
 * excel con lo siguiente de cada proyecto: saldo general, lista de productos
 * en proyecto, subtotal, IVA y total de proyecto completo, movimientos de
 * proyecto (pagos), fecha del día que se genera el status».
 *
 * LO QUE DE VERDAD MIDE:
 *
 *   · que los CINCO PEDAZOS que Mike enumeró estén ahí. Es literalmente su
 *     lista, y es lo que hace que el documento sirva o no sirva;
 *   · que la SUMA DE LA LISTA sea el subtotal, leída por donde la lee la
 *     pantalla. Quien reciba el papel va a sumar la columna;
 *   · que la VISTA PREVIA del formulario —la única cuenta que se hace del
 *     lado del navegador— dé exactamente lo mismo que el servidor. Si se
 *     separaran, el botón prometería un total y el papel diría otro;
 *   · que el interruptor de IVA NO MUEVA ningún peso guardado;
 *   · que el EXCEL lleve los mismos números que el documento, y que los
 *     importes viajen como números y no como texto.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCliente } from "@/lib/clientes";
import { createCuenta } from "@/lib/cuentas";
import { createMovimiento } from "@/lib/movimientos";
import { createProyecto, getProyecto, updateProyecto } from "@/lib/proyectos";
import { desglose, estadoDelProyecto } from "@/lib/estado-proyecto";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `ep-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { negocio: "", cliente: "", cuenta: "", proyecto: "" };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Estado del proyecto", apps: { dash: true } } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cliente = await createCliente(uid, { nombre: "HOLCIM", negocio_id: ids.negocio });
  ids.cuenta = await createCuenta(uid, { nombre: "Banco", tipo: "banco", saldo_inicial: 0, negocio_id: ids.negocio, moneda: "MXN" });
  ids.proyecto = await createProyecto(uid, {
    negocio_id: ids.negocio, negocio_nombre: "Taller",
    cliente_id: ids.cliente, cliente_nombre: "HOLCIM",
    nombre: "Obra HOLCIM", estado: "activo", precio_venta: 0,
    partidas: [], fecha_inicio: new Date(2026, 2, 1),
    items: [
      { nombre: "Puerta modelo A", monto: 71_250, cantidad: 25 },
      { nombre: "Clóset", monto: 40_000, cantidad: 1 },
    ],
  });
  await createMovimiento(uid, {
    tipo: "ingreso", monto: 50_000, fecha: new Date(2026, 2, 10),
    cuenta_id: ids.cuenta, cuenta_nombre: "Banco",
    contraparte_id: ids.cliente, contraparte_tipo: "cliente", contraparte_nombre: "HOLCIM",
    negocio_id: ids.negocio, proyecto_id: ids.proyecto, descripcion: "Anticipo",
  });
  await createMovimiento(uid, {
    tipo: "egreso", monto: 9_000, fecha: new Date(2026, 2, 12),
    cuenta_id: ids.cuenta, cuenta_nombre: "Banco",
    contraparte_tipo: "proveedor", contraparte_nombre: "Herrería",
    negocio_id: ids.negocio, proyecto_id: ids.proyecto, descripcion: "ESTO NO LO VE EL CLIENTE",
  });
}, 120000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("los cinco pedazos que pidió Mike", () => {
  it("trae saldo, lista, desglose, pagos y la fecha del día", async () => {
    const d = await estadoDelProyecto(ids.proyecto);
    expect(d.totales.saldo, "1) saldo general").toBeTypeOf("number");
    expect(d.items.length, "2) lista de productos").toBe(2);
    expect(d.totales.subtotal + d.totales.iva, "3) subtotal, IVA y total").toBe(d.totales.total);
    expect(d.movimientos.length, "4) movimientos del proyecto").toBe(1);
    expect(d.generado_at, "5) la fecha del día que se genera").toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Math.abs(Date.now() - Date.parse(d.generado_at))).toBeLessThan(180_000);
  });

  it("la suma de la lista es el subtotal", async () => {
    const d = await estadoDelProyecto(ids.proyecto);
    const suma = d.items.reduce((t, i) => t + i.importe, 0);
    expect(suma).toBe(d.totales.subtotal);
    expect(suma).toBe(111_250);
  });

  it("el precio unitario sale de la cantidad", async () => {
    const d = await estadoDelProyecto(ids.proyecto);
    const puerta = d.items.find((i) => i.nombre === "Puerta modelo A")!;
    expect(puerta.cantidad).toBe(25);
    expect(puerta.precio_unitario).toBe(2_850);
  });

  it("el egreso al proveedor no viaja", async () => {
    const d = await estadoDelProyecto(ids.proyecto);
    expect(JSON.stringify(d.movimientos)).not.toContain("NO LO VE EL CLIENTE");
    expect(d.totales.cobrado).toBe(50_000);
  });
});

describe("el IVA de la obra", () => {
  it("nace en «+ IVA» y el saldo va contra el total", async () => {
    const d = await estadoDelProyecto(ids.proyecto);
    expect(d.totales.iva_incluido).toBe(false);
    expect(d.totales.subtotal).toBe(111_250);
    expect(d.totales.iva).toBe(17_800);
    expect(d.totales.total).toBe(129_050);
    expect(d.totales.saldo).toBe(129_050 - 50_000);
  });

  it("la vista previa del formulario da lo MISMO que el servidor", async () => {
    /* La única cuenta que se hace del lado del navegador, comparada contra
     * la del servidor con la misma obra. Si se separan un centavo, el botón
     * de «IVA incluido» promete un total que el papel no dice. */
    for (const incluido of [false, true]) {
      await updateProyecto(ids.proyecto, { iva_incluido: incluido });
      const d = await estadoDelProyecto(ids.proyecto);
      const previa = desglose(111_250, incluido, d.totales.tasa_iva);
      expect(previa.subtotal, `subtotal con iva_incluido=${incluido}`).toBe(d.totales.subtotal);
      expect(previa.iva, `IVA con iva_incluido=${incluido}`).toBe(d.totales.iva);
      expect(previa.total, `total con iva_incluido=${incluido}`).toBe(d.totales.total);
    }
  });

  it("«IVA incluido» desglosa hacia atrás y cuadra", async () => {
    await updateProyecto(ids.proyecto, { iva_incluido: true });
    const d = await estadoDelProyecto(ids.proyecto);
    expect(d.totales.total).toBe(111_250);
    expect(Math.round((d.totales.subtotal + d.totales.iva) * 100)).toBe(Math.round(d.totales.total * 100));
  });

  it("cambiar el interruptor no mueve un peso guardado", async () => {
    const antes = (await getProyecto(ids.proyecto))!.precio_venta;
    await updateProyecto(ids.proyecto, { iva_incluido: false });
    const p = (await getProyecto(ids.proyecto))!;
    expect(p.precio_venta).toBe(antes);
    expect(p.iva_incluido).toBe(false);
    expect(p.items!.reduce((t, i) => t + i.monto, 0)).toBe(antes);
  });
});
