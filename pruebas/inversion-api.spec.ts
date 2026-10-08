/* Los préstamos de investor101 vistos desde dash101, medidos contra STAGING.
 *
 * Mike, 8-oct-2026: los pagos a los inversionistas se registran en dash101,
 * y lo que se debe y lo que va a entrar tiene que salir en el flujo
 * proyectado.
 *
 * Lo que aportan estas pruebas, que las de `suite101-api` no pueden dar: que
 * lo que las PANTALLAS reciben está en PESOS y cuadra (la API guarda
 * centavos; una conversión saltada enseña cien veces de más y no truena), y
 * que el camino entero se puede recorrer con `X-App: dash101`: leer el
 * flujo, confirmar un depósito, pagar, colgar el comprobante y dejar una
 * ronda en borrador desde un hueco.
 *
 * Org propia por corrida, que se borra al terminar. Nunca contra producción.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { bajar, entrarDePrueba, listar, pedir } from "@/lib/api/cliente";
import { createCuenta, listCuentas } from "@/lib/cuentas";
import type { FilaMovimiento } from "@/lib/api/adaptar";
import {
  confirmarDeposito, crearRondaDesdeElFlujo, getFlujoDeInversion, listPagosDePrestamos, pagarPagoDePrestamo, prestamosParaElFlujo,
  sinInversion, subirComprobanteDePago,
} from "@/lib/inversion";
import { proyectar } from "@/lib/proyeccion";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `inv-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;
const inv = () => `/orgs/${ORG}/inversion`;

let hoy = "";
const mas = (n: number) => new Date(Date.parse(`${hoy}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const ids = { banco: "", ana: "", prestamo: "", pagos: [] as string[] };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  const salud = await pedir<{ entorno: string }>("/salud");
  expect(salud.entorno).toBe("staging");
  const u = await entrarDePrueba(CORREO);
  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Prueba de préstamos", apps: { dash: true, investor: true } } });
  ids.banco = await createCuenta(u.id, { nombre: "Banco", tipo: "banco", moneda: "MXN", saldo_inicial: 1000 });
  hoy = (await pedir<{ hoy: string }>(inv())).hoy;
  ids.ana = (await pedir<{ id: string }>(`${inv()}/inversionistas`, { method: "POST", body: { nombre: "Ana Robles", clabe: "002180012345678901", banco: "Banamex" } })).id;
  // $20,000.00 en dos pagos semanales, 4 % fijo: 10,000 + 400 cada uno.
  ids.prestamo = (await pedir<{ id: string }>(`${inv()}/prestamos`, { method: "POST", body: {
    inversionista_id: ids.ana, monto: 2_000_000, tipo_tasa: "fija", tasa_pb: 400, esquema: "parcialidades", frecuencia: "semanal", num_pagos: 2, fecha_inicio: mas(2),
  } })).id;
}, 90000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("lo que va al flujo, en pesos", () => {
  it("antes del depósito: entra el depósito por recibir y salen los dos pagos, todo en pesos", async () => {
    const f = await getFlujoDeInversion();
    expect(f.depositos).toHaveLength(1);
    expect(f.depositos[0]).toMatchObject({ id: ids.prestamo, folio: "PRE-000001", inversionista_nombre: "Ana Robles", monto: 20_000, fecha: mas(2) });
    expect(f.pagos.map((g) => [g.numero, g.de, g.capital, g.interes, g.total, g.fecha, g.vencido])).toEqual([
      [1, 2, 10_000, 400, 10_400, mas(9), false], [2, 2, 10_000, 400, 10_400, mas(16), false],
    ]);
    // Y lo que el motor de la proyección recibe: nombres que se leen, signos correctos.
    const planeado = prestamosParaElFlujo(f);
    expect(planeado.map((x) => [x.tipo, x.monto, x.fecha])).toEqual([["egreso", 10_400, mas(9)], ["egreso", 10_400, mas(16)], ["ingreso", 20_000, mas(2)]]);
    expect(planeado[0].nombre).toBe("PRE-000001 · pago 1 de 2 a Ana Robles");
    expect(planeado[2].nombre).toBe("PRE-000001 · depósito de Ana Robles");
    const p = proyectar(1000, { opex: [], prestamos: planeado }, { bloque: "mes", meses: 2, hoy: new Date(`${hoy}T12:00:00`) });
    expect(p.reduce((s, b) => s + b.ingresos, 0)).toBe(20_000);
    expect(p.reduce((s, b) => s + b.egresos, 0)).toBe(20_800);
    expect(p[p.length - 1].saldo_final).toBe(1000 - 800); // lo único que cuesta el préstamo es el interés
    // El buzón de pagos sólo trae préstamos que ya arrancaron.
    expect(await listPagosDePrestamos()).toEqual([]);
  });

  it("confirmar el depósito deja el ingreso en la cuenta, en pesos, y arranca el préstamo", async () => {
    await expect(pagarPagoDePrestamo((await getFlujoDeInversion()).pagos[0].id, { cuenta_id: ids.banco })).rejects.toThrow(/todavía no arranca|falta confirmar|depósito/);
    const r = await confirmarDeposito(ids.prestamo, { cuenta_id: ids.banco });
    expect(r.movimiento_id).toBeTruthy();
    const cuentas = await listCuentas();
    expect(cuentas[0].saldo_actual).toBe(1000 + 20_000);
    const f = await getFlujoDeInversion();
    expect(f.depositos).toEqual([]);
    // Llegó hoy y no en dos días: las fechas se recorren; el interés fijo, no.
    expect(f.pagos.map((g) => [g.total, g.fecha])).toEqual([[10_400, mas(7)], [10_400, mas(14)]]);
    await expect(confirmarDeposito(ids.prestamo, { cuenta_id: ids.banco })).rejects.toThrow(/ya estaba confirmado/);
  });
});

describe("pagar desde dash101", () => {
  it("el buzón trae a quién, cuánto y a dónde pagarle", async () => {
    const pagos = await listPagosDePrestamos();
    ids.pagos = pagos.map((g) => g.id);
    expect(pagos).toHaveLength(2);
    expect(pagos[0]).toMatchObject({ folio: "PRE-000001", inversionista_nombre: "Ana Robles", numero: 1, de: 2, capital: 10_000, interes: 400, total: 10_400, vencido: false, banco: "Banamex", clabe: "002180012345678901" });
  });

  it("pagar deja dos egresos —capital e interés— por el monto justo, y baja el saldo", async () => {
    const r = await pagarPagoDePrestamo(ids.pagos[0], { cuenta_id: ids.banco, fecha: hoy, nota: "SPEI 1" });
    expect(r.liquidado).toBe(false);
    expect(r.pago).toMatchObject({ estado: "pagado", pagado_fecha: hoy, capital: 10_000, interes: 400, total: 10_400 });
    expect(r.movimientos).toHaveLength(2);
    const movs = await listar<FilaMovimiento>("movimientos", { limite: "100" });
    const egresos = movs.filter((m) => m.tipo === "egreso").map((m) => [m.categoria, m.monto]).sort();
    expect(egresos).toEqual([["prestamo_capital", 1_000_000], ["prestamo_interes", 40_000]]);
    expect((await listCuentas())[0].saldo_actual).toBe(21_000 - 10_400);
    await expect(pagarPagoDePrestamo(ids.pagos[0], { cuenta_id: ids.banco })).rejects.toThrow(/ya estaba registrado/);
    await expect(pagarPagoDePrestamo(ids.pagos[1], { cuenta_id: "" })).rejects.toThrow(/cuenta/);
  });

  it("el comprobante se cuelga del pago y se puede volver a bajar", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45]);
    const a = await subirComprobanteDePago(ids.prestamo, ids.pagos[0], new File([bytes], "spei.pdf", { type: "application/pdf" }));
    expect(a.id).toBeTruthy();
    const r = await bajar(`${inv()}/archivos/${a.id}`);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes);
    await expect(subirComprobanteDePago(ids.prestamo, ids.pagos[0], new File(["x"], "x.exe", { type: "application/x-msdownload" }))).rejects.toThrow();
  });

  it("con el último pago el préstamo se liquida y el flujo queda limpio", async () => {
    const r = await pagarPagoDePrestamo(ids.pagos[1], { cuenta_id: ids.banco });
    expect(r.liquidado).toBe(true);
    expect(await listPagosDePrestamos()).toEqual([]);
    expect(await getFlujoDeInversion()).toEqual({ pagos: [], depositos: [] });
    // Entraron 20,000 y salieron 20,800: el préstamo costó 800.
    expect((await listCuentas())[0].saldo_actual).toBe(1000 - 800);
  });
});

describe("una ronda desde un hueco del flujo", () => {
  it("nace en borrador, con el monto en centavos, de dónde salió, y la liga a investor101", async () => {
    const r = await crearRondaDesdeElFlujo({ nombre: "Cubrir octubre", monto: 90_000, fecha_inicio: mas(1), fecha_vencimiento: mas(31), origen: { desde: hoy, hasta: mas(20), deficit: 90_000 } });
    expect(r.folio).toBe("RON-000001");
    expect(r.url).toMatch(/investor101.*#\/ronda\//);
    const guardada = await pedir<Record<string, unknown>>(`${inv()}/rondas/${r.id}`);
    expect(guardada).toMatchObject({ estado: "borrador", nombre: "Cubrir octubre", monto_meta: 9_000_000, fecha_inicio: mas(1), fecha_vencimiento: mas(31), esquema: "unico" });
    expect(guardada.origen).toMatchObject({ app: "dash101", desde: hoy, hasta: mas(20), deficit: 9_000_000 });
    await expect(crearRondaDesdeElFlujo({ nombre: "", monto: 0, fecha_inicio: mas(1), fecha_vencimiento: mas(31), origen: { desde: hoy, hasta: hoy, deficit: 0 } })).rejects.toThrow(/nombre|juntar/i);
  });

  it("una empresa sin investor101 contesta «no es tuyo», y la pantalla lo toma como respuesta", async () => {
    const otra = `${ORG}-x`;
    await pedir("/admin/orgs", { method: "POST", body: { id: otra, nombre: "Sin investor", apps: { dash: true } } });
    process.env.NEXT_PUBLIC_ORG = otra;
    try {
      const e = await getFlujoDeInversion().then(() => null, (x) => x);
      expect(sinInversion(e)).toBe(true);
    } finally {
      process.env.NEXT_PUBLIC_ORG = ORG;
      await pedir(`/admin/orgs/${otra}`, { method: "DELETE" });
    }
  });
});
