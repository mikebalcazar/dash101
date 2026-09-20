/* Corregir el saldo inicial de una cuenta.
 *
 * Mike, 20-sep: «antes de hoy, había un saldo en FORESPOT de 148,000 y ese
 * monto es el que había ingresado de prueba, pero no puedo ver los
 * movimientos que componen ese saldo y no los puedo borrar».
 *
 * No eran movimientos: era el SALDO INICIAL de la cuenta, el número que se
 * teclea al darla de alta. No aparece en Movimientos porque no es uno, y
 * hasta hoy no se podía corregir —la escritura lo excluía a propósito—, así
 * que la única salida era borrar la cuenta.
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS:
 *
 *   · que el saldo sea `saldo_inicial + ingresos − egresos`, que es la
 *     fórmula que explica por qué no había nada que borrar;
 *   · que al corregirlo el saldo se recorra en esa misma cantidad y NI UN
 *     PESO MÁS: los movimientos que ya existen no se tocan;
 *   · que ponerlo en cero deje el saldo exactamente en lo que suman los
 *     movimientos, que es lo que Mike necesita hoy.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCliente } from "@/lib/clientes";
import { createCuenta, getCuenta, updateCuenta } from "@/lib/cuentas";
import { createMovimiento } from "@/lib/movimientos";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `si-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { negocio: "", cuenta: "", cliente: "" };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Saldo inicial" } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  // El número de prueba con el que se abrió la cuenta, igual que el de Mike.
  ids.cuenta = await createCuenta(uid, {
    nombre: "Banco", tipo: "banco", saldo_inicial: 148_000, negocio_id: ids.negocio, moneda: "MXN",
  });
  ids.cliente = await createCliente(uid, { nombre: "HOLCIM", negocio_id: ids.negocio });
}, 90000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("el saldo inicial de una cuenta", () => {
  it("una cuenta sin un solo movimiento ya trae saldo: es el inicial", async () => {
    const c = (await getCuenta(ids.cuenta))!;
    expect(c.saldo_inicial).toBe(148_000);
    expect(c.saldo_actual, "sin movimientos, el saldo ES el inicial").toBe(148_000);

    const movs = await pedir<{ filas: unknown[] }>(
      `/orgs/${ORG}/movimientos?negocio_id=${ids.negocio}&cuenta_id=${ids.cuenta}`,
    );
    expect(movs.filas, "y no hay ningún movimiento que borrar: por eso no se veían").toEqual([]);
  });

  it("se corrige a cero y el saldo queda en lo que suman los movimientos", async () => {
    await createMovimiento(uid, {
      tipo: "ingreso", monto: 30_000, fecha: new Date(2026, 2, 20),
      cuenta_id: ids.cuenta, cuenta_nombre: "Banco",
      contraparte_id: ids.cliente, contraparte_tipo: "cliente", contraparte_nombre: "HOLCIM",
      negocio_id: ids.negocio,
    });
    expect((await getCuenta(ids.cuenta))!.saldo_actual, "148,000 + 30,000").toBe(178_000);

    await updateCuenta(ids.cuenta, { saldo_inicial: 0 });

    const c = (await getCuenta(ids.cuenta))!;
    expect(c.saldo_inicial).toBe(0);
    expect(c.saldo_actual, "ya sólo queda lo que de verdad entró").toBe(30_000);
  });

  it("corregirlo NO toca los movimientos que ya existen", async () => {
    const antes = await pedir<{ total: number; filas: Array<{ monto: number }> }>(
      `/orgs/${ORG}/movimientos?negocio_id=${ids.negocio}&cuenta_id=${ids.cuenta}`,
    );
    await updateCuenta(ids.cuenta, { saldo_inicial: 5_000 });
    const despues = await pedir<{ total: number; filas: Array<{ monto: number }> }>(
      `/orgs/${ORG}/movimientos?negocio_id=${ids.negocio}&cuenta_id=${ids.cuenta}`,
    );
    expect(despues.total, "los mismos movimientos").toBe(antes.total);
    expect(despues.filas.map((m) => m.monto)).toEqual(antes.filas.map((m) => m.monto));
    expect((await getCuenta(ids.cuenta))!.saldo_actual, "el saldo se recorre en lo que se movió, y nada más").toBe(35_000);
  });

  it("cambiar el nombre no borra el saldo inicial sin querer", async () => {
    /* Se guarda sólo lo que viene. Si `saldo_inicial` se escribiera siempre,
     * cualquier pantalla que no lo mande lo pondría en cero y el saldo de la
     * cuenta se caería sin que nadie tocara un movimiento. */
    await updateCuenta(ids.cuenta, { nombre: "Banco principal" });
    const c = (await getCuenta(ids.cuenta))!;
    expect(c.nombre).toBe("Banco principal");
    expect(c.saldo_inicial, "sigue en su lugar").toBe(5_000);
  });
});
