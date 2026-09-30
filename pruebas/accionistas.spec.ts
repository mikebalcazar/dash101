/* Accionistas y retiros de utilidades, del lado de dash101 · contrato 0.57.0.
 *
 * Mike, 30-sep-2026: «El dash, necesito un módulo de accionistas donde se
 * registren pagos a los accionistas como retiro de utilidades».
 *
 * LO QUE DE VERDAD MIDE ESTE ARCHIVO —lo que la pantalla no puede revisar
 * sola:
 *
 *   · que el DINERO cruce bien: la pantalla captura pesos con decimales y la
 *     API guarda centavos; un retiro de $2,500.50 tiene que volver como
 *     2500.5 y bajar el saldo de la cuenta exactamente en eso;
 *   · que el retiro sea UN MOVIMIENTO con la categoría y la contraparte que
 *     lo apartan de los gastos, y que se encuentre por negocio aunque haya
 *     otros egresos;
 *   · que lo que la API rechaza (participación fuera de 0-100) llegue a la
 *     pantalla dicho en claro, y no como `datos_invalidos (400)`;
 *   · que dar de baja no borre: el retirado sigue sumando en su renglón.
 *
 * Corre contra STAGING en una org propia por corrida (`ac-<run>`). */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCuenta, listCuentas } from "@/lib/cuentas";
import { createMovimiento, listMovimientos } from "@/lib/movimientos";
import {
  createAccionista, darDeBaja, listAccionistas, listRetiros, registrarRetiro, retiradoPor, updateAccionista,
} from "@/lib/accionistas";
import { CATEGORIA_RETIRO_UTILIDADES } from "@/types/schema";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `ac-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { negocio: "", cuenta: "", mike: "", socia: "" };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Accionistas" } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cuenta = await createCuenta(uid, { nombre: "Banco", tipo: "banco", saldo_inicial: 100_000, negocio_id: ids.negocio, moneda: "MXN" });
}, 90000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("los accionistas, desde dash101", () => {
  it("se dan de alta con participación y salen en la lista del negocio, en orden de nombre", async () => {
    const mike = await createAccionista(ids.negocio, { nombre: "  Mike Balcázar ", porcentaje: 60, rfc: "bamx800101ab1", correo: "Mike@Ejemplo.MX" });
    ids.mike = mike.id;
    expect(mike.nombre).toBe("Mike Balcázar");
    expect(mike.porcentaje).toBe(60);
    expect(mike.rfc).toBe("BAMX800101AB1");
    expect(mike.correo).toBe("mike@ejemplo.mx");
    expect(mike.activo).toBe(true);
    const socia = await createAccionista(ids.negocio, { nombre: "Ana Socia", porcentaje: "" });
    ids.socia = socia.id;
    expect(socia.porcentaje).toBeNull();
    const lista = await listAccionistas(ids.negocio);
    expect(lista.map((a) => a.nombre)).toEqual(["Ana Socia", "Mike Balcázar"]);
  });

  it("lo que la API rechaza llega dicho en claro", async () => {
    await expect(createAccionista(ids.negocio, { nombre: "Paco", porcentaje: 140 })).rejects.toThrow(/entre 0 y 100/);
    await expect(createAccionista(ids.negocio, { nombre: "Paco", correo: "sin-arroba" })).rejects.toThrow(/correo/);
    await expect(updateAccionista(ids.mike, { porcentaje: -5 })).rejects.toThrow(/entre 0 y 100/);
    const sigue = await updateAccionista(ids.mike, { porcentaje: 55.5, telefono: "55 1234 5678" });
    expect(sigue.porcentaje).toBe(55.5);
    expect(sigue.telefono).toBe("55 1234 5678");
  });
});

describe("el retiro de utilidades", () => {
  it("es un egreso con categoría y contraparte de accionista, en pesos de ida y vuelta, y baja la cuenta", async () => {
    const antes = (await listCuentas(ids.negocio)).find((c) => c.id === ids.cuenta)!.saldo_actual;
    const mike = (await listAccionistas(ids.negocio)).find((a) => a.id === ids.mike)!;
    const id = await registrarRetiro(uid, {
      negocio_id: ids.negocio, accionista: mike, cuenta_id: ids.cuenta, cuenta_nombre: "Banco",
      monto: 2500.5, fecha: new Date(2026, 8, 30, 12), descripcion: "Utilidades de septiembre",
    });
    expect(id).toBeTruthy();

    // Otro egreso del negocio, para que la lista de retiros tenga que apartar.
    await createMovimiento(uid, {
      tipo: "egreso", monto: 10, fecha: new Date(2026, 8, 30, 12), cuenta_id: ids.cuenta, cuenta_nombre: "Banco",
      contraparte_tipo: "otro", contraparte_nombre: "Papelería", negocio_id: ids.negocio, categoria: "papeleria",
    });

    const retiros = await listRetiros(ids.negocio);
    expect(retiros.length).toBe(1);
    expect(retiros[0]).toMatchObject({ id, accionista_id: ids.mike, accionista_nombre: "Mike Balcázar", cuenta_id: ids.cuenta, cuenta_nombre: "Banco", monto: 2500.5, fecha: "2026-09-30", descripcion: "Utilidades de septiembre" });

    const mov = (await listMovimientos(ids.negocio)).find((m) => m.id === id)!;
    expect(mov.tipo).toBe("egreso");
    expect(mov.categoria).toBe(CATEGORIA_RETIRO_UTILIDADES);
    expect(mov.contraparte_tipo).toBe("accionista");
    expect(mov.contraparte_nombre).toBe("Mike Balcázar");
    expect(mov.monto).toBe(2500.5);

    const despues = (await listCuentas(ids.negocio)).find((c) => c.id === ids.cuenta)!.saldo_actual;
    expect(antes - despues).toBeCloseTo(2510.5, 2);
  });

  it("no acepta un retiro en cero, y el concepto se propone solo si no viene", async () => {
    const mike = (await listAccionistas(ids.negocio)).find((a) => a.id === ids.mike)!;
    await expect(registrarRetiro(uid, { negocio_id: ids.negocio, accionista: mike, cuenta_id: ids.cuenta, cuenta_nombre: "Banco", monto: 0, fecha: new Date() })).rejects.toThrow(/mayor que cero/);
    await registrarRetiro(uid, { negocio_id: ids.negocio, accionista: mike, cuenta_id: ids.cuenta, cuenta_nombre: "Banco", monto: 100, fecha: new Date(2026, 9, 1, 12) });
    const retiros = await listRetiros(ids.negocio);
    expect(retiros.length).toBe(2);
    expect(retiros[0].fecha).toBe("2026-10-01"); // el más reciente primero
    expect(retiros[0].descripcion).toBe("Retiro de utilidades · Mike Balcázar");
  });

  it("suma por accionista y en total, y dar de baja no borra lo retirado", async () => {
    const { por, total } = retiradoPor(await listRetiros(ids.negocio));
    expect(por.get(ids.mike)).toBeCloseTo(2600.5, 2);
    expect(por.get(ids.socia)).toBeUndefined();
    expect(total).toBeCloseTo(2600.5, 2);

    const baja = await darDeBaja(ids.mike);
    expect(baja.activo).toBe(false);
    const lista = await listAccionistas(ids.negocio);
    expect(lista.map((a) => `${a.nombre}:${a.activo}`)).toEqual(["Ana Socia:true", "Mike Balcázar:false"]);
    expect(retiradoPor(await listRetiros(ids.negocio)).por.get(ids.mike)).toBeCloseTo(2600.5, 2);
    const vuelve = await darDeBaja(ids.mike, true);
    expect(vuelve.activo).toBe(true);
  });
});
