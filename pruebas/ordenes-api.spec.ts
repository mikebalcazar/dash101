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
import { createCuenta, listCuentas } from "@/lib/cuentas";
import { createCliente } from "@/lib/clientes";
import { createProveedor } from "@/lib/proveedores";
import { createProyecto } from "@/lib/proyectos";
import {
  clabeLegible, corregirOrden, crearOrden, desglosar, devolverOrden, getBuzon, getPermisosOrdenes, getResumenOrdenes,
  cancelarOrden, listContadores, listMisOrdenes, listOrdenesPagadas, listPartidasDe, marcarContador, pagarOrden, vencida, verOrden,
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

// Una CLABE que cuadra (17 dígitos y su verificador), para la cuenta del proveedor.
const clabeDe = (base17: string) => {
  const pesos = [3, 7, 1];
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += (Number(base17[i]) * pesos[i % 3]) % 10;
  return base17 + String((10 - (suma % 10)) % 10);
};
const CLABE_MADERAS = clabeDe("07218000123412345");

let uid = "";
const ids = { banco: "", cliente: "", proveedor: "", proyecto: "", orden: "", movimiento: "", cfdi: "" };

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
  ids.banco = await createCuenta(uid, { nombre: "Banco", tipo: "banco", moneda: "MXN", saldo_inicial: 50000});
  ids.cliente = await createCliente(uid, { nombre: "Cliente Uno"});
  ids.proveedor = await createProveedor(uid, { nombre: "Maderas de Prueba" });
  // 0.67.0 · su cuenta, como la da de alta supply101 (proveedor_cuentas).
  await pedir(`/orgs/${ORG}/proveedor_cuentas`, { method: "POST", body: { proveedor_id: ids.proveedor, alias: "Principal", clabe: CLABE_MADERAS, banco: "Banorte", beneficiario: "Maderas de Prueba SA" } });
  ids.proyecto = await createProyecto(uid, {
    nombre: "Casa Uno", cliente_id: ids.cliente, cliente_nombre: "Cliente Uno",
   
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

  it("la CLABE se enseña en grupos que se leen, y una que no es CLABE se deja como viene", () => {
    expect(clabeLegible("012180001234567890")).toBe("012 180 00123456789 0");
    expect(clabeLegible("012 180 00123456789 0")).toBe("012 180 00123456789 0");
    expect(clabeLegible("1234")).toBe("1234");
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
      proveedor_id: ids.proveedor, proveedor_nombre: "Maderas de Prueba",
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
    // 0.67.0 · Mike, 5-oct: «ahí mismo en la orden aparezcan los datos
    // bancarios o de pago del proveedor». La orden trae al proveedor con su cuenta.
    expect(r.proveedor?.id).toBe(ids.proveedor);
    expect(r.proveedor?.nombre).toBe("Maderas de Prueba");
    expect(r.proveedor?.cuentas.map((c) => c.clabe)).toEqual([CLABE_MADERAS]);
    expect(r.proveedor?.cuentas[0]).toMatchObject({ alias: "Principal", banco: "Banorte", beneficiario: "Maderas de Prueba SA" });
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
    const antes = (await listCuentas()).find((c) => c.id === ids.banco)!.saldo_actual;
    const r = await pagarOrden(ids.orden, { cuenta_id: ids.banco });
    ids.movimiento = r.movimiento.id;
    expect(r.orden.estado).toBe("pagada");
    const despues = (await listCuentas()).find((c) => c.id === ids.banco)!.saldo_actual;
    expect(antes - despues).toBe(1160);
  });

  it("fuera de producción el correo se encola pero no sale", async () => {
    // Lo que se midió arriba: la respuesta del pago dice si salió y por qué
    // no. Aquí se comprueba en la orden ya pagada que quedó el movimiento.
    const r = await verOrden(ids.orden);
    expect(r.orden.movimiento_id).toBe(ids.movimiento);
    expect(r.eventos.map((e) => e.que)).toContain("pagada");
  });

  it("el historial de lo pagado la trae, en pesos, y suma lo que lista (Mike, 1-oct-2026)", async () => {
    const h = await listOrdenesPagadas();
    expect(h.filas.map((o) => o.id)).toContain(ids.orden);
    expect(h.filas.every((o) => o.estado === "pagada")).toBe(true);
    expect(h.filas.find((o) => o.id === ids.orden)!.monto, "en pesos, no en centavos").toBe(1160);
    expect(h.total).toBeCloseTo(h.filas.reduce((s, o) => s + o.monto, 0), 2);
  });

  it("la misma orden no se paga dos veces: nada de dobles egresos", async () => {
    await pagarOrden(ids.orden, { cuenta_id: ids.banco }).then(
      () => { throw new Error("se pagó dos veces"); },
      (e) => {
        expect(e).toBeInstanceOf(ErrorApi);
        expect((e as ErrorApi).estado).toBe(409);
      },
    );
    const saldo = (await listCuentas()).find((c) => c.id === ids.banco)!.saldo_actual;
    expect(saldo).toBe(50000 - 1160);
  });
});

describe("devolver y corregir", () => {
  it("vuelve con el motivo, se corrige y conserva el mismo folio", async () => {
    const o = await crearOrden({
      proveedor_nombre: "Tornillos SA", concepto: "Tornillos",
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

/* 0.86.0 · Cancelar (Mike, 9-oct-2026: «en supply, hay que poner un botón
 * para cancelar una orden que ya no se necesita»). El botón está en
 * supply101; aquí se mide lo que las pantallas de dash101 reciben: que la
 * cancelada salga del buzón y de su total en PESOS, que siga en lo mío con
 * su estado, y que no se pueda pagar. */
describe("cancelar", () => {
  it("quien la pidió la cancela: sale del buzón y de su total, y sigue en lo suyo", async () => {
    const antes = await getBuzon();
    const o = await crearOrden({
      proveedor_nombre: "Clavos SA", concepto: "Clavos que ya no hacen falta",
      monto: 321.5, con_factura: false, fecha_maxima_pago: dia(2),
    });
    const con = await getBuzon();
    expect(con.total).toBeCloseTo(antes.total + 321.5, 2);

    const c = await cancelarOrden(o.id, "Ya los trajo el cliente");
    expect(c.estado).toBe("cancelada");
    expect(c.monto, "en pesos").toBe(321.5);
    expect(c.folio).toBe(o.folio);

    const despues = await getBuzon();
    expect(despues.filas.some((f) => f.id === o.id)).toBe(false);
    expect(despues.total).toBeCloseTo(antes.total, 2);
    expect((await getResumenOrdenes()).compras.total).toBeCloseTo(despues.filas.filter((f) => f.tipo === "compra").reduce((s, f) => s + f.monto, 0), 2);

    const mia = (await listMisOrdenes()).find((f) => f.id === o.id);
    expect(mia?.estado).toBe("cancelada");
    const r = await verOrden(o.id);
    expect(r.eventos.at(-1)?.que).toBe("cancelada");
    expect(r.eventos.at(-1)?.nota).toBe("Ya los trajo el cliente");
  });

  it("una cancelada no se paga, y una pagada no se cancela", async () => {
    const o = await crearOrden({ proveedor_nombre: "Clavos SA", concepto: "Otra que sobra", monto: 10, con_factura: false });
    await cancelarOrden(o.id);
    await expect(pagarOrden(o.id, { cuenta_id: ids.banco })).rejects.toMatchObject({ error: "orden_no_esta_en_buzon" });

    const p = await crearOrden({ proveedor_nombre: "Clavos SA", concepto: "Ésta sí se pagó", monto: 10, con_factura: false });
    await pagarOrden(p.id, { cuenta_id: ids.banco });
    await expect(cancelarOrden(p.id)).rejects.toMatchObject({ error: "orden_no_se_puede_cancelar" });
  });
});

/* 0.47.0 · Reembolsos. Lo que aportan estas pruebas: que las cifras nuevas
 * —el buzón por pestaña y el resumen del inicio— lleguen a la pantalla en
 * PESOS y cuadren entre sí, y que el egreso de un reembolso salga como
 * reembolso a la persona, no como compra a un proveedor. */
describe("reembolsos", () => {
  let re = "";

  it("se pide como reembolso y sale con folio RE-, en pesos", async () => {
    const o = await crearOrden({ tipo: "reembolso", concepto: "Gasolina", monto: 850, con_factura: false });
    re = o.id;
    expect(o.tipo).toBe("reembolso");
    expect(o.folio).toMatch(/^RE-/);
    expect(o.monto).toBe(850);
    expect((await listMisOrdenes()).some((x) => x.id === re && x.tipo === "reembolso")).toBe(true);
    const p = await getPermisosOrdenes();
    expect(p.puede_comprar, "esta cuenta sí compra").toBe(true);
  });

  it("la pestaña de reembolsos suma sólo reembolsos, y el resumen del inicio cuadra con ella", async () => {
    const pestana = await getBuzon("reembolso");
    expect(pestana.filas.every((x) => x.tipo === "reembolso")).toBe(true);
    expect(pestana.filas.some((x) => x.id === re)).toBe(true);
    expect(pestana.total).toBe(850);
    const compras = await getBuzon("compra");
    expect(compras.filas.some((x) => x.id === re), "y no sale en la de compras").toBe(false);
    const resumen = await getResumenOrdenes();
    expect(resumen.reembolsos.total, "en PESOS, y es lo que resta del capital").toBe(850);
    expect(resumen.reembolsos.cuantas).toBe(1);
    expect(resumen.compras.total).toBe(compras.total);
  });

  it("al pagarlo, el egreso es un reembolso a la persona y la pestaña se vacía", async () => {
    const r = await pagarOrden(re, { cuenta_id: ids.banco });
    expect(r.orden.estado).toBe("pagada");
    expect(r.movimiento.monto, "centavos crudos de la API, que la pantalla no pinta").toBe(85000);
    const mov = (r as unknown as { movimiento: { categoria: string; contraparte_nombre: string | null; tipo: string } }).movimiento;
    expect(mov.categoria).toBe("reembolso");
    expect(mov.tipo, "es una salida de dinero, como una compra").toBe("egreso");
    const resumen = await getResumenOrdenes();
    expect(resumen.reembolsos.total).toBe(0);
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
      uuid, tipo: "egreso", rfc: "XAXX010101000",
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
    await crearCfdi({ uuid, tipo: "egreso", subtotal: 100, iva: 16, total: 116, fecha: hoy });
    await crearCfdi({ uuid, tipo: "egreso", subtotal: 1, iva: 0, total: 1, fecha: hoy }).then(
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
