/* El movimiento que no tiene contraparte, y por qué no se podía corregir.
 *
 * Mike, 20-sep: «cuando quiero editar un movimiento, a la hora de guardar no
 * me hace nada». Sin mensaje: nada.
 *
 * No es la escritura —eso es lo que mide este archivo—, es la PANTALLA: el
 * botón de guardar estaba apagado cuando faltaba la contraparte, y un botón
 * apagado sin explicación se ve igual que uno descompuesto.
 *
 * Y hay movimientos que legítimamente no tienen contraparte: un ajuste, un
 * gasto fijo, un movimiento importado de antes. El formulario los daba por
 * imposibles sin decirlo.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCuenta } from "@/lib/cuentas";
import { createMovimiento, getMovimiento, updateMovimiento, listMovimientos } from "@/lib/movimientos";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `sc-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { negocio: "", cuenta: "", sinContraparte: "" };

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Sin contraparte" } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cuenta = await createCuenta(uid, { nombre: "Banco", tipo: "banco", saldo_inicial: 0, negocio_id: ids.negocio, moneda: "MXN" });

  /* El movimiento de Mike: un egreso sin proveedor. Existe de sobra —un
   * ajuste, un gasto fijo, algo importado— y la API lo acepta sin chistar. */
  ids.sinContraparte = await createMovimiento(uid, {
    tipo: "egreso", monto: 4_500, fecha: new Date(2026, 2, 24),
    cuenta_id: ids.cuenta, cuenta_nombre: "Banco",
    contraparte_id: null, contraparte_tipo: "otro", contraparte_nombre: "Caseta",
    negocio_id: ids.negocio,
  });
}, 90000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("corregir un movimiento sin contraparte", () => {
  it("existe y viene SIN contraparte: es la forma que apagaba el botón", async () => {
    const m = await getMovimiento(ids.sinContraparte);
    expect(m, "el movimiento se abre").toBeTruthy();
    expect(m!.contraparte_id, "y no tiene contraparte").toBeFalsy();
    expect(m!.contraparte_nombre, "aunque sí tenga a quién se le pagó").toBe("Caseta");
  });

  it("la escritura SÍ lo deja corregir: lo que estorbaba era la pantalla", async () => {
    /* Esto es lo que prueba de qué lado estaba el defecto. Si la escritura
     * también lo rechazara, el arreglo iría en la API; como lo acepta, el
     * arreglo va en el formulario y nada más. */
    await updateMovimiento(ids.sinContraparte, { monto: 5_200, descripcion: "Caseta, ida y vuelta" });
    const m = await getMovimiento(ids.sinContraparte);
    expect(m!.monto, "el monto corregido").toBe(5_200);
    expect(m!.descripcion).toBe("Caseta, ida y vuelta");
  });

  it("corregirlo no le inventa una contraparte", async () => {
    /* La otra mitad: al guardar no se le puede colgar un proveedor nada más
     * porque el formulario necesitaba uno. Quedaría un pago atribuido a
     * alguien que nunca lo cobró, y eso es peor que no poder corregirlo. */
    const m = await getMovimiento(ids.sinContraparte);
    expect(m!.contraparte_id).toBeFalsy();
    expect(m!.contraparte_tipo).toBe("otro");
    expect(m!.contraparte_nombre).toBe("Caseta");
  });

  it("y sigue en la lista, con su nombre para reconocerlo", async () => {
    const lista = await listMovimientos(ids.negocio);
    const mio = lista.find((x) => x.id === ids.sinContraparte);
    expect(mio, "no desaparece de la lista por no tener contraparte").toBeTruthy();
    expect(mio!.contraparte_nombre).toBe("Caseta");
  });
});
