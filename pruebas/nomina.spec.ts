/* La raya, del lado de dash101 · contrato 0.27.0.
 *
 * Mike, 20-sep: «pon en la fila un administrador de nóminas». Alcance:
 * pagos de raya y recibos. Lugar: aquí dentro, con permiso aparte.
 *
 * LO QUE DE VERDAD MIDE ESTE ARCHIVO —lo que la pantalla no puede revisar
 * sola, y que si se rompe nadie nota hasta que falta dinero:
 *
 *   · que el DINERO cruce bien en los dos sentidos. La pantalla captura en
 *     pesos y la API guarda en centavos: si la conversión se cayera de un
 *     lado, un sueldo de $3,500 se pagaría en $35 o en $350,000 y el total
 *     seguiría «cuadrando» consigo mismo;
 *   · que pagar deje UN MOVIMIENTO POR PERSONA, que es lo que hace que el
 *     estado de cuenta diga a quién se le pagó;
 *   · que el neto lo ponga el SERVIDOR: la pantalla enseña una suma mientras
 *     se teclea, y ésa es una ayuda para leer, no la cuenta buena.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCuenta } from "@/lib/cuentas";
import { listMovimientos } from "@/lib/movimientos";
import {
  crearGente, crearRaya, editarRaya, getRaya, listGente, listRayas,
  marcarRecibido, pagarRaya, cancelarRaya,
} from "@/lib/nomina";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `ny-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { negocio: "", cuenta: "", lupe: "", beto: "", raya: "" };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Raya" } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cuenta = await createCuenta(uid, { nombre: "Caja", tipo: "caja", saldo_inicial: 100_000, negocio_id: ids.negocio, moneda: "MXN" });
  ids.lupe = (await crearGente("Lupe Carpintera", "Carpintería")).id;
  ids.beto = (await crearGente("Beto Ayudante", "Ayudante")).id;
}, 90000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("la raya, desde dash101", () => {
  it("la gente que se da de alta aquí sale en la lista", async () => {
    const g = await listGente();
    expect(g.map((x) => x.nombre).sort()).toEqual(["Beto Ayudante", "Lupe Carpintera"]);
  });

  it("el corte se captura en PESOS y regresa en pesos, con el neto del servidor", async () => {
    /* Si la conversión se cayera de un lado, un sueldo de $3,500 se pagaría
     * en $35 o en $350,000 y el total seguiría cuadrando consigo mismo. */
    const { raya, pagos } = await crearRaya({
      negocio_id: ids.negocio, periodo_inicio: "2026-03-16", periodo_fin: "2026-03-22",
      pagos: [
        { personal_id: ids.lupe, concepto: "Semana", sueldo: 3_500, extras: 600, descuentos: 100 },
        { personal_id: ids.beto, concepto: "Semana", sueldo: 2_200 },
      ],
    });
    ids.raya = raya.id;
    expect(raya.estado).toBe("borrador");
    expect(pagos.find((p) => p.personal_id === ids.lupe)!.neto, "3,500 + 600 − 100").toBe(4_000);
    expect(raya.total, "y el corte suma los netos").toBe(6_200);
  });

  it("corregir el borrador reemplaza los renglones, no los suma", async () => {
    const { raya, pagos } = await editarRaya(ids.raya, {
      pagos: [
        { personal_id: ids.lupe, concepto: "Semana", sueldo: 3_500, extras: 600, descuentos: 100 },
        { personal_id: ids.beto, concepto: "Semana", sueldo: 2_400 },
      ],
    });
    expect(pagos).toHaveLength(2);
    expect(raya.total).toBe(6_400);
  });

  it("pagar deja UN MOVIMIENTO POR PERSONA, con su nombre y en pesos", async () => {
    const { raya, pagos } = await pagarRaya(ids.raya, ids.cuenta, "2026-03-23");
    expect(raya.estado).toBe("pagada");
    expect(pagos.every((p) => p.movimiento_id)).toBe(true);

    const movs = await listMovimientos(ids.negocio);
    const dela = movs.filter((m) => m.categoria === "raya");
    expect(dela, "dos egresos, uno por persona").toHaveLength(2);
    expect(dela.map((m) => m.contraparte_nombre).sort()).toEqual(["Beto Ayudante", "Lupe Carpintera"]);
    /* En PESOS del lado de la pantalla. La de Lupe es 4,000 y la de Beto
     * 2,400: si la conversión se rompiera, aquí saldrían 400000 y 240000. */
    expect(dela.map((m) => m.monto).sort((a, b) => a - b)).toEqual([2_400, 4_000]);
    expect(dela.every((m) => m.tipo === "egreso" && m.contraparte_tipo === "personal")).toBe(true);
  });

  it("y una raya pagada ya no se toca desde la pantalla", async () => {
    await expect(editarRaya(ids.raya, { nota: "ups" })).rejects.toThrow(/ya_pagada/);
    await expect(cancelarRaya(ids.raya)).rejects.toThrow(/ya_pagada/);
  });

  it("el recibo se marca y se desmarca", async () => {
    const { pagos } = await getRaya(ids.raya);
    const uno = pagos[0];
    expect(uno.recibido_at).toBe(null);
    expect((await marcarRecibido(uno.id, true)).recibido_at).toBeTruthy();
    expect((await marcarRecibido(uno.id, false)).recibido_at).toBe(null);
  });

  it("el corte sale en la lista con su total y cuánta gente trae", async () => {
    const lista = await listRayas(ids.negocio);
    const mio = lista.find((r) => r.id === ids.raya)!;
    expect(mio.total).toBe(6_400);
    expect(mio.personas).toBe(2);
    expect(mio.estado).toBe("pagada");
  });
});
