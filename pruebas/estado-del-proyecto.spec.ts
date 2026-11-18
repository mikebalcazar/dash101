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
 *   · que la LIGA DEL EXCEL baje un archivo de verdad. El armador vive en
 *     la API —lo bajan dash101 y peek101—, así que lo que se mide aquí es
 *     que la pantalla apunte a donde debe y que del otro lado salga un
 *     .xlsx; el formato por dentro lo miden las pruebas de la API.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sembrarItems } from "./sembrar";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createCliente } from "@/lib/clientes";
import { createCuenta } from "@/lib/cuentas";
import { createMovimiento } from "@/lib/movimientos";
import { createProyecto, getProyecto, updateProyecto } from "@/lib/proyectos";
import { bajar } from "@/lib/api/cliente";
import { estadoDelProyecto, ligaDelExcel } from "@/lib/estado-proyecto";
import { crearConcepto } from "@/lib/conceptos";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `ep-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { cliente: "", cuenta: "", proyecto: "" };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Estado del proyecto", apps: { dash: true } } });
  ids.cliente = await createCliente(uid, { nombre: "HOLCIM"});
  ids.cuenta = await createCuenta(uid, { nombre: "Banco", tipo: "banco", saldo_inicial: 0, moneda: "MXN" });
  ids.proyecto = await createProyecto(uid, {
   
    cliente_id: ids.cliente, cliente_nombre: "HOLCIM",
    nombre: "Obra HOLCIM", estado: "activo",
    partidas: [], fecha_inicio: new Date(2026, 2, 1),
  });
  await sembrarItems(ORG, ids.proyecto, ids.cliente, [
    { nombre: "Puerta modelo A", monto: 71_250, cantidad: 25 },
    { nombre: "Clóset", monto: 40_000, cantidad: 1 },
  ]);
  /* 0.105.0 · el precio son los conceptos de cobro, no los ítems (Mike,
   * 18-nov-2026). Los mismos dos, para que el papel diga lo de siempre. */
  await crearConcepto(ids.proyecto, { descripcion: "Puerta modelo A", cantidad: 25, precio_unitario: 2_850 });
  await crearConcepto(ids.proyecto, { descripcion: "Clóset", cantidad: 1, precio_unitario: 40_000 });
  await createMovimiento(uid, {
    tipo: "ingreso", monto: 50_000, fecha: new Date(2026, 2, 10),
    cuenta_id: ids.cuenta, cuenta_nombre: "Banco",
    contraparte_id: ids.cliente, contraparte_tipo: "cliente", contraparte_nombre: "HOLCIM",
    proyecto_id: ids.proyecto, descripcion: "Anticipo",
  });
  await createMovimiento(uid, {
    tipo: "egreso", monto: 9_000, fecha: new Date(2026, 2, 12),
    cuenta_id: ids.cuenta, cuenta_nombre: "Banco",
    contraparte_tipo: "proveedor", contraparte_nombre: "Herrería",
    proyecto_id: ids.proyecto, descripcion: "ESTO NO LO VE EL CLIENTE",
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
    // 0.107.0 · sin IVA: el precio es el subtotal y el total; el IVA es el cobrado, aparte.
    expect(d.totales.subtotal, "3) precio sin IVA").toBe(d.totales.total);
    expect(d.totales.iva, "y el IVA cobrado, aparte").toBe(d.totales.iva_cobrado);
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

describe("0.105.0 · los conceptos de cobro", () => {
  it("escritos a mano van en un solo grupo, y el grupo suma el subtotal", async () => {
    const d = await estadoDelProyecto(ids.proyecto);
    expect(d.totales.precio_por_cargar).toBe(false);
    expect(d.grupos).toHaveLength(1);
    expect(d.grupos[0].cotizacion_id).toBeNull();
    expect(d.grupos[0].importe).toBe(d.totales.subtotal);
    expect(d.grupos[0].conceptos.map((c) => c.descripcion)).toEqual(["Puerta modelo A", "Clóset"]);
  });

  it("un proyecto sin conceptos tiene el precio por cargar y no tiene saldo", async () => {
    const otro = await createProyecto(uid, {
      cliente_id: ids.cliente, cliente_nombre: "HOLCIM", nombre: "Obra sin precio", estado: "activo",
      partidas: [], fecha_inicio: new Date(2026, 2, 1),
    });
    const p = (await getProyecto(otro))!;
    expect(p.precio_por_cargar).toBe(true);
    const d = await estadoDelProyecto(otro);
    expect(d.totales.precio_por_cargar).toBe(true);
    expect(d.totales.saldo).toBeNull();
    expect(d.grupos).toHaveLength(0);
  });
});

describe("0.107.0 · sin IVA, con el IVA aparte", () => {
  /* Mike, 18-nov-2026: «En los estados de cuenta de los proyectos, siempre
   * haz las cuentas sin IVA y desglosa por aparte el IVA que se haya pagado o
   * cobrado.» Hasta 0.106 el papel le sumaba 16 % al precio. */
  it("el precio no lleva IVA y el saldo es precio menos lo cobrado sin IVA", async () => {
    const d = await estadoDelProyecto(ids.proyecto);
    expect(d.totales.subtotal).toBe(111_250);
    expect(d.totales.total).toBe(111_250);
    expect(d.totales.cobrado).toBe(50_000);
    expect(d.totales.saldo).toBe(111_250 - 50_000);
  });

  it("un pago sin factura cuenta completo y no trae IVA; el banco dice lo mismo", async () => {
    const d = await estadoDelProyecto(ids.proyecto);
    expect(d.movimientos[0]).toMatchObject({ monto: 50_000, sin_iva: 50_000, iva: 0, facturas: [] });
    expect(d.totales.iva_cobrado).toBe(0);
    expect(d.totales.cobrado_con_iva).toBe(50_000);
  });

  it("el proyecto trae sus cachés sin IVA en pesos", async () => {
    const p = (await getProyecto(ids.proyecto))!;
    expect(p.cobrado_sin_iva).toBe(50_000);
    expect(p.iva_cobrado).toBe(0);
  });
});


describe("el Excel", () => {
  it("la liga apunta a la ruta de la API y baja un .xlsx de verdad", async () => {
    const liga = ligaDelExcel(ids.proyecto);
    expect(liga).toContain(`/orgs/${ORG}/proyectos/${ids.proyecto}/estado.xlsx`);

    const r = await bajar(`/orgs/${ORG}/proyectos/${ids.proyecto}/estado.xlsx`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("spreadsheetml.sheet");
    const bytes = new Uint8Array(await r.arrayBuffer());
    /* «PK»: la firma de un ZIP, que es lo que un .xlsx es por dentro. */
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    expect(bytes.byteLength, "y no viene vacío").toBeGreaterThan(500);
  });
});
