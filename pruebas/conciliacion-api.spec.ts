/* La conciliación semanal, medida por donde la llama la pantalla.
 *
 * Se usan los módulos de `lib/` tal cual, con pesos y `Timestamp`, contra una
 * org propia de STAGING que nace y se reinicia en cada corrida. Los números
 * son los de la tarea del chat de dash101 (Drive,
 * `suite101/dash101/2026-09-11-tarea-conciliacion-semanal.md`), sólo que aquí
 * en pesos: la API los guarda en centavos. */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Timestamp } from "firebase/firestore";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createNegocio, getNegocio, updateNegocio } from "@/lib/negocios";
import { createCuenta, listCuentas } from "@/lib/cuentas";
import { createMovimiento, listMovimientos } from "@/lib/movimientos";
import {
  DIA_POR_OMISION,
  conciliar,
  cuentasPorConciliar,
  estadisticaConciliacion,
  listConciliaciones,
  tocaConciliar,
} from "@/lib/conciliacion";
import { CATEGORIA_AJUSTE, type Negocio } from "@/types/schema";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `pc-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
let negocio: Negocio;
const ids: Record<string, string> = {};

beforeAll(async () => {
  expect(fuente()).toBe("api");
  const salud = await pedir<{ entorno: string }>("/salud");
  expect(salud.entorno).toBe("staging");
  const u = await entrarDePrueba(CORREO);
  uid = u.id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try {
    await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" });
  } catch {
    /* no existía */
  }
  const alta = await pedir<{ org_db_version: number }>("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Prueba de conciliación" } });
  // La migración 0003 corre sola al nacer el Durable Object.
  expect(alta.org_db_version).toBe(3);

  const negocioId = await createNegocio(uid, { nombre: "Taller que concilia", moneda: "MXN" });
  negocio = (await getNegocio(negocioId))!;
  for (const [clave, nombre, tipo, saldo] of [
    ["banco", "Banco", "banco", 250000],
    ["caja", "Caja", "caja", 5000],
    ["tarjeta", "Tarjeta", "credito", -30000],
    ["otra", "Otra", "otro", 1000],
  ] as Array<[string, string, "banco" | "caja" | "credito" | "otro", number]>) {
    ids[clave] = await createCuenta(uid, { nombre, tipo, moneda: "MXN", saldo_inicial: saldo, negocio_id: negocioId });
  }
  // Banco: 250,000 + 120,000 − 25,000 = 345,000. Caja: 5,000 − 8,500 = −3,500.
  for (const [tipo, monto, cuenta] of [
    ["ingreso", 120000, "banco"],
    ["egreso", 25000, "banco"],
    ["egreso", 8500, "caja"],
  ] as Array<["ingreso" | "egreso", number, string]>) {
    await createMovimiento(uid, {
      tipo, monto, fecha: new Date(2026, 8, 2), cuenta_id: ids[cuenta], cuenta_nombre: "x",
      contraparte_tipo: "otro", contraparte_nombre: "x", negocio_id: negocioId,
    });
  }
}, 120000);

afterAll(async () => {
  try {
    await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" });
  } finally {
    process.env.NEXT_PUBLIC_ORG = ORG_ANTES;
  }
});

describe("el día y el aviso", () => {
  it("un negocio nace en lunes y el día se puede cambiar", async () => {
    expect(negocio.dia_conciliacion).toBe(DIA_POR_OMISION);
    await updateNegocio(negocio.id!, { dia_conciliacion: 3 });
    expect((await getNegocio(negocio.id!))!.dia_conciliacion).toBe(3);
    await updateNegocio(negocio.id!, { dia_conciliacion: 1 });
    negocio = (await getNegocio(negocio.id!))!;
  });

  it("sin ningún corte toca conciliar; con uno de hoy, no; y si se saltó el día, sigue tocando", () => {
    const lunes = new Date(2026, 8, 7); // lunes
    const jueves = new Date(2026, 8, 10);
    const corte = (d: Date) => ({ corte_at: { toDate: () => d } } as never);
    expect(tocaConciliar(negocio, null, lunes)).toBe(true);
    expect(tocaConciliar(negocio, corte(lunes), lunes)).toBe(false);
    // Se hizo el lunes pasado y ya pasó otro lunes: vuelve a tocar.
    expect(tocaConciliar(negocio, corte(new Date(2026, 7, 31)), lunes)).toBe(true);
    // Se saltó el lunes: el jueves sigue pendiente.
    expect(tocaConciliar(negocio, corte(new Date(2026, 8, 6)), jueves)).toBe(true);
    expect(tocaConciliar(negocio, corte(lunes), jueves)).toBe(false);
  });
});

describe("el primer corte", () => {
  it("las cuentas llegan con el saldo que dash101 tiene registrado", async () => {
    const cuentas = await cuentasPorConciliar(negocio.id!);
    const por = Object.fromEntries(cuentas.map((c) => [c.cuenta.id!, c.saldo_registrado]));
    expect(por[ids.banco]).toBe(345000);
    expect(por[ids.caja]).toBe(-3500);
    expect(por[ids.tarjeta]).toBe(-30000);
    expect(por[ids.otra]).toBe(1000);
  });

  it("la que cuadra no recibe ajuste; las demás quedan iguales al real", async () => {
    const hecha = await conciliar(negocio.id!, [
      { cuenta_id: ids.banco, saldo_real: 344200 },   // le faltan $800
      { cuenta_id: ids.caja, saldo_real: -3500 },     // cuadra
      { cuenta_id: ids.tarjeta, saldo_real: -30500 }, // se debe $500 más
      { cuenta_id: ids.otra, saldo_real: 1300 },      // hay $300 de más
    ]);

    const por = Object.fromEntries(hecha.cuentas.map((c) => [c.cuenta_id, c]));
    expect(por[ids.banco]).toMatchObject({ saldo_registrado: 345000, saldo_real: 344200, diferencia: 800, cuenta_nombre: "Banco" });
    expect(por[ids.caja]).toMatchObject({ diferencia: 0, movimiento_id: null });
    expect(por[ids.tarjeta]).toMatchObject({ diferencia: 500 });
    expect(por[ids.otra]).toMatchObject({ diferencia: -300 });
    expect(hecha.diferencia_total).toBe(1000);
    expect(hecha.cuentas.filter((c) => c.movimiento_id)).toHaveLength(3);

    // Y ahora cada cuenta dice exactamente lo que hay.
    const saldos = Object.fromEntries((await listCuentas(negocio.id!)).map((c) => [c.id!, c.saldo_actual]));
    expect(saldos[ids.banco]).toBe(344200);
    expect(saldos[ids.caja]).toBe(-3500);
    expect(saldos[ids.tarjeta]).toBe(-30500);
    expect(saldos[ids.otra]).toBe(1300);
  });

  it("el ajuste es un movimiento aparte: sin proyecto y sin identificar", async () => {
    const movs = await listMovimientos(negocio.id!);
    const ajustes = movs.filter((m) => m.categoria === CATEGORIA_AJUSTE);
    expect(ajustes).toHaveLength(3);
    for (const a of ajustes) {
      expect(a.proyecto_id).toBe(null);
      expect(a.contraparte_nombre).toBe("Sin identificar");
    }
    // Falta dinero → egreso; sobra → ingreso.
    expect(ajustes.find((m) => m.cuenta_id === ids.banco)).toMatchObject({ tipo: "egreso", monto: 800 });
    expect(ajustes.find((m) => m.cuenta_id === ids.otra)).toMatchObject({ tipo: "ingreso", monto: 300 });
  });
});

describe("la segunda semana y la estadística", () => {
  it("sólo mide lo nuevo, y el acumulado es la suma", async () => {
    const segunda = await conciliar(negocio.id!, [
      { cuenta_id: ids.banco, saldo_real: 344000 }, // otros $200 que se fueron
      { cuenta_id: ids.caja, saldo_real: -3500 },
      { cuenta_id: ids.tarjeta, saldo_real: -30500 },
      { cuenta_id: ids.otra, saldo_real: 1300 },
    ]);
    expect(segunda.diferencia_total).toBe(200);
    expect(segunda.cuentas.filter((c) => c.movimiento_id)).toHaveLength(1);

    const e = await estadisticaConciliacion(negocio.id!);
    expect(e.acumulado).toEqual({ cortes: 2, diferencia_total: 1200, faltante: 1500, sobrante: 300 });
    expect(e.cortes).toHaveLength(2);
    expect(e.cortes[0].diferencia_total).toBe(200); // el más reciente primero
    expect(e.por_cuenta.find((c) => c.cuenta_id === ids.banco)).toMatchObject({ nombre: "Banco", cortes: 2, diferencia_total: 1000 });
  });

  it("un gasto capturado después con fecha vieja no cambia el corte pasado", async () => {
    const antes = (await listConciliaciones(negocio.id!)).at(-1)!;
    const delBanco = antes.cuentas.find((c) => c.cuenta_id === ids.banco)!;
    expect(delBanco.saldo_registrado).toBe(345000);

    await createMovimiento(uid, {
      tipo: "egreso", monto: 1111, fecha: new Date(2026, 8, 3), cuenta_id: ids.banco, cuenta_nombre: "x",
      contraparte_tipo: "otro", contraparte_nombre: "x", negocio_id: negocio.id!, descripcion: "se capturó tarde",
    });

    const despues = (await listConciliaciones(negocio.id!)).find((c) => c.id === antes.id)!;
    const mismo = despues.cuentas.find((c) => c.cuenta_id === ids.banco)!;
    expect(mismo.saldo_registrado).toBe(345000);
    expect(mismo.diferencia).toBe(800);
    expect((despues.corte_at as Timestamp).toMillis()).toBe((antes.corte_at as Timestamp).toMillis());
  });
});

describe("lo que no se puede", () => {
  it("faltar una cuenta rechaza el corte entero y no escribe nada", async () => {
    const antes = (await listConciliaciones(negocio.id!)).length;
    await expect(conciliar(negocio.id!, [{ cuenta_id: ids.caja, saldo_real: -3500 }])).rejects.toThrow();
    expect((await listConciliaciones(negocio.id!)).length).toBe(antes);
  });
});
