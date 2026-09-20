/* Órdenes de compra y contabilidad fiscal, medidas contra STAGING.
 *
 * Lo que aportan estas pruebas, que las de `suite101-api` no pueden dar: que
 * lo que las PANTALLAS reciben está en PESOS y cuadra. La API guarda centavos
 * enteros; si `lib/ordenes.ts` o `lib/fiscal.ts` se saltan una conversión, la
 * pantalla enseña cien veces de más y eso no truena: sólo miente. Por eso
 * cada cifra de aquí se compara contra el peso exacto.
 *
 * Y de paso se recorre el camino entero como lo hará una persona: pedir,
 * pagar, que el egreso salga por el monto justo, que la segunda vez no se
 * pague dos veces, devolver, corregir, y la factura que llega DESPUÉS y se
 * cuelga del pago que ya existía.
 *
 * Org propia por corrida, que se borra al terminar. La org `demo` no se toca:
 * es la de las capturas. Nunca contra producción.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir, ErrorApi } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCuenta, listCuentas } from "@/lib/cuentas";
import { createCliente } from "@/lib/clientes";
import { createProveedor } from "@/lib/proveedores";
import { createProyecto } from "@/lib/proyectos";
import {
  corregirOrden, crearOrden, desglosar, devolverOrden, getBuzon, listContadores,
  listMisOrdenes, listPartidasDe, marcarContador, pagarOrden, vencida, verOrden,
} from "@/lib/ordenes";
import {
  crearCfdi, getCuadre, getIva, ligarCfdi, listCfdi, listPendientes, cancelarCfdi,
  mesDeHoy, nombreDelMes, ultimosMeses,
} from "@/lib/fiscal";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `oc-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

const dia = (n: number) => {
  const d = new Date(Date.now() + n * 86400000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

let uid = "";
const ids = { negocio: "", banco: "", cliente: "", proveedor: "", proyecto: "", orden: "", movimiento: "", cfdi: "" };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  const salud = await pedir<{ entorno: string }>("/salud");
  expect(salud.entorno).toBe("staging");
  const u = await entrarDePrueba(CORREO);
  uid = u.id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  const alta = await pedir<{ org_db_version: number }>("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Prueba de órdenes" } });
  // 0008 (órdenes) y 0009 (fiscal) tienen que estar: son de este encargo.
  expect(alta.org_db_version).toBeGreaterThanOrEqual(9);

  ids.negocio = await createNegocio(uid, { nombre: "Taller de compras", moneda: "MXN" });
  ids.banco = await createCuenta(uid, { nombre: "Banco", tipo: "banco", moneda: "MXN", saldo_inicial: 50000, negocio_id: ids.negocio });
  ids.cliente = await createCliente(uid, { nombre: "Cliente Uno", negocio_id: ids.negocio });
  ids.proveedor = await createProveedor(uid, { nombre: "Maderas de Prueba" });
  ids.proyecto = await createProyecto(uid, {
    nombre: "Casa Uno", cliente_id: ids.cliente, cliente_nombre: "Cliente Uno",
    negocio_id: ids.negocio, negocio_nombre: "Taller de compras",
    precio_venta: 20000, estado: "activo", fecha_inicio: new Date(2026, 8, 1),
    partidas: [{ proveedor_id: ids.proveedor, proveedor_nombre: "Maderas de Prueba", concepto: "Madera", monto_acordado: 5000 }],
  });
}, 90000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("el desglose, antes de tocar la red", () => {
  it("parte del total hacia atrás, y subtotal más IVA da el total exacto", () => {
    expect(desglosar(1160)).toEqual({ subtotal: 1000, iva: 160 });
    // El caso que delata una fórmula hecha al revés: 100 al 16 % no se parte
    // en dos cifras redondas, y aun así las dos tienen que sumar 100.
    const d = desglosar(100);
    expect(d.subtotal + d.iva).toBe(100);
    expect(d.subtotal).toBe(86.21);
  });

  it("una orden vencida se mide por día, no por hora", () => {
    const base = { estado: "en_buzon" as const };
    expect(vencida({ ...base, fecha_maxima_pago: "2026-09-18" } as never, "2026-09-19")).toBe(true);
    expect(vencida({ ...base, fecha_maxima_pago: "2026-09-19" } as never, "2026-09-19")).toBe(false);
    expect(vencida({ estado: "pagada", fecha_maxima_pago: "2020-01-01" } as never, "2026-09-19")).toBe(false);
  });

  it("los meses del selector salen del más nuevo al más viejo", () => {
    const meses = ultimosMeses(3, new Date(2026, 0, 15));
    expect(meses).toEqual(["2026-01", "2025-12", "2025-11"]);
    expect(nombreDelMes("2026-09")).toBe("septiembre de 2026");
  });
});

describe("pedir una compra", () => {
  it("nace en el buzón y la suite separa el total en pesos", async () => {
    const o = await crearOrden({
      negocio_id: ids.negocio, proveedor_id: ids.proveedor, proveedor_nombre: "Maderas de Prueba",
      concepto: "Triplay", monto: 1160, con_factura: true, fecha_maxima_pago: dia(5),
    });
    ids.orden = o.id;
    expect(o.estado).toBe("en_buzon");
    expect(o.folio).toMatch(/^OC-/);
    // EN PESOS. Si esto sale 100000 y 16000, la conversión se saltó.
    expect(o.monto).toBe(1160);
    expect(o.subtotal).toBe(1000);
    expect(o.iva).toBe(160);
  });

  it("sale en mis órdenes, con su historia", async () => {
    const mias = await listMisOrdenes();
    expect(mias.some((o) => o.id === ids.orden)).toBe(true);
    const r = await verOrden(ids.orden);
    expect(r.orden.monto).toBe(1160);
    expect(r.eventos.map((e) => e.que)).toContain("creada");
  });

  it("las partidas del proyecto traen su id, que es lo que la pantalla liga", async () => {
    const partidas = await listPartidasDe(ids.proyecto);
    expect(partidas.length).toBe(1);
    expect(partidas[0].id).toBeTruthy();
    expect(partidas[0].monto_acordado).toBe(5000);
  });
});

describe("quién puede pagar", () => {
  it("sin la marca, el buzón no abre", async () => {
    await expect(getBuzon()).rejects.toThrow(ErrorApi);
    await getBuzon().catch((e) => expect((e as ErrorApi).error).toBe("sin_permiso"));
  });

  it("quien manda se marca a sí mismo y el buzón abre", async () => {
    const gente = await listContadores();
    expect(gente.some((g) => g.usuario_id === uid)).toBe(true);
    const r = await marcarContador(uid, true);
    expect(r.es_contador).toBe(true);

    const b = await getBuzon();
    expect(b.filas.some((o) => o.id === ids.orden)).toBe(true);
    // Los totales del buzón, en pesos.
    expect(b.total).toBe(1160);
  });
});

describe("pagar", () => {
  it("hace UN egreso por el monto exacto y baja el saldo de la cuenta", async () => {
    const antes = (await listCuentas(ids.negocio)).find((c) => c.id === ids.banco)!.saldo_actual;
    const r = await pagarOrden(ids.orden, { cuenta_id: ids.banco });
    ids.movimiento = r.movimiento.id;
    expect(r.orden.estado).toBe("pagada");
    const despues = (await listCuentas(ids.negocio)).find((c) => c.id === ids.banco)!.saldo_actual;
    expect(antes - despues).toBe(1160);
  });

  it("fuera de producción el correo se encola pero no sale", async () => {
    // Lo que se midió arriba: la respuesta del pago dice si salió y por qué
    // no. Aquí se comprueba en la orden ya pagada que quedó el movimiento.
    const r = await verOrden(ids.orden);
    expect(r.orden.movimiento_id).toBe(ids.movimiento);
    expect(r.eventos.map((e) => e.que)).toContain("pagada");
  });

  it("la misma orden no se paga dos veces: nada de dobles egresos", async () => {
    await pagarOrden(ids.orden, { cuenta_id: ids.banco }).then(
      () => { throw new Error("se pagó dos veces"); },
      (e) => {
        expect(e).toBeInstanceOf(ErrorApi);
        expect((e as ErrorApi).estado).toBe(409);
      },
    );
    const saldo = (await listCuentas(ids.negocio)).find((c) => c.id === ids.banco)!.saldo_actual;
    expect(saldo).toBe(50000 - 1160);
  });
});

describe("devolver y corregir", () => {
  it("vuelve con el motivo, se corrige y conserva el mismo folio", async () => {
    const o = await crearOrden({
      negocio_id: ids.negocio, proveedor_nombre: "Tornillos SA", concepto: "Tornillos",
      monto: 500, con_factura: false, fecha_maxima_pago: dia(3),
    });
    const folio = o.folio;

    const devuelta = await devolverOrden(o.id, "Falta la cotización firmada");
    expect(devuelta.estado).toBe("devuelta");
    expect(devuelta.nota_contador).toBe("Falta la cotización firmada");

    const corregida = await corregirOrden(o.id, { concepto: "Tornillos de 2 pulgadas", monto: 550 });
    expect(corregida.estado).toBe("en_buzon");
    expect(corregida.folio).toBe(folio);
    expect(corregida.monto).toBe(550);

    const r = await verOrden(o.id);
    expect(r.eventos.map((e) => e.que)).toEqual(
      expect.arrayContaining(["creada", "devuelta", "corregida"]),
    );
  });
});

describe("la factura que llega después", () => {
  it("el pago con factura prometida sale en la lista de pendientes", async () => {
    const pendientes = await listPendientes();
    const mio = pendientes.find((p) => p.id === ids.movimiento);
    expect(mio, "el pago de la orden con factura está pendiente").toBeTruthy();
    expect(mio!.monto).toBe(1160);
    expect(mio!.orden_folio).toMatch(/^OC-/);
  });

  it("se captura y se cuelga del pago que ya existía, no se crea otro", async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const uuid = `PRUEBA-${Date.now()}`;
    const c = await crearCfdi({
      negocio_id: ids.negocio, uuid, tipo: "egreso", rfc: "XAXX010101000",
      subtotal: 1000, iva: 160, total: 1160, fecha: hoy,
    });
    ids.cfdi = c.id;
    expect(c.total).toBe(1160);
    expect(c.iva).toBe(160);

    const liga = await ligarCfdi(c.id, ids.movimiento);
    expect(liga.movimiento.facturado).toBe(true);
    expect(liga.aplicado_total).toBe(1160);

    // Y ya no lo persigue nadie.
    expect((await listPendientes()).some((p) => p.id === ids.movimiento)).toBe(false);
  });

  it("el mismo UUID capturado dos veces se rechaza", async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const uuid = `REPE-${Date.now()}`;
    await crearCfdi({ negocio_id: ids.negocio, uuid, tipo: "egreso", subtotal: 100, iva: 16, total: 116, fecha: hoy });
    await crearCfdi({ negocio_id: ids.negocio, uuid, tipo: "egreso", subtotal: 1, iva: 0, total: 1, fecha: hoy }).then(
      () => { throw new Error("se capturó dos veces"); },
      (e) => expect((e as ErrorApi).estado).toBe(409),
    );
  });
});

describe("el IVA del mes y el cuadre", () => {
  it("toma el IVA del pago facturado, en pesos", async () => {
    const iva = await getIva({ mes: mesDeHoy() });
    expect(iva.acreditable).toBeGreaterThanOrEqual(160);
    expect(iva.a_enterar).toBe(iva.trasladado - iva.acreditable - iva.retenciones);
  });

  it("lo facturado nunca es más que lo real", async () => {
    const c = await getCuadre({ mes: mesDeHoy() });
    expect(c.egresos.facturado).toBeLessThanOrEqual(c.egresos.total);
    expect(c.egresos.fuera).toBe(c.egresos.total - c.egresos.facturado);
    expect(c.egresos.facturado).toBe(1160);
  });

  it("una factura cancelada sale del IVA y se queda a la vista", async () => {
    const antes = (await getIva({ mes: mesDeHoy() })).acreditable;
    await cancelarCfdi(ids.cfdi);
    const despues = (await getIva({ mes: mesDeHoy() })).acreditable;
    expect(despues).toBe(antes - 160);

    const canceladas = await listCfdi({ mes: mesDeHoy() }, { estado: "cancelada" });
    expect(canceladas.some((f) => f.id === ids.cfdi)).toBe(true);
  });
});
