/* Corregir un movimiento capturado mal.
 *
 * Mike, 20-sep: «no hay manera de editar un movimiento, no puedo. necesito
 * corregir un movimiento». Antes sólo se podía borrar y recapturar.
 *
 * LO QUE DE VERDAD APORTAN ESTAS PRUEBAS son las dos cerraduras, que valen
 * más que la corrección misma:
 *
 *   · una pata de TRANSFERENCIA no se corrige sola. Son dos movimientos
 *     espejo; cambiarle el monto a uno deja las dos cuentas descuadradas y
 *     nadie se entera hasta el corte;
 *   · el MONTO de un movimiento ya facturado no se mueve. El CFDI se capturó
 *     por un importe, y de esa pareja sale el IVA que se entera.
 *
 * Las dos se revisan en la escritura y no sólo en la pantalla: una pantalla
 * vieja en un teléfono que no se refrescó sigue mandando lo de antes.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCliente } from "@/lib/clientes";
import { createCuenta, getCuenta } from "@/lib/cuentas";
import { createMovimiento, createTransferencia, getMovimiento, updateMovimiento } from "@/lib/movimientos";
import { crearCfdi, ligarCfdi } from "@/lib/fiscal";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `em-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { negocio: "", cuenta: "", otra: "", cliente: "" };

const cobrar = (monto: number, extra: Record<string, unknown> = {}) =>
  createMovimiento(uid, {
    tipo: "ingreso", monto, fecha: new Date(2026, 2, 18),
    cuenta_id: ids.cuenta, cuenta_nombre: "Banco",
    contraparte_id: ids.cliente, contraparte_tipo: "cliente", contraparte_nombre: "HOLCIM",
    negocio_id: ids.negocio, descripcion: "Con un cero de mas", ...extra,
  });

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Corregir movimientos" } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cuenta = await createCuenta(uid, { nombre: "Banco", tipo: "banco", saldo_inicial: 0, negocio_id: ids.negocio, moneda: "MXN" });
  ids.otra = await createCuenta(uid, { nombre: "Caja", tipo: "caja", saldo_inicial: 100_000, negocio_id: ids.negocio, moneda: "MXN" });
  ids.cliente = await createCliente(uid, { nombre: "HOLCIM", negocio_id: ids.negocio });
}, 90000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("corregir un movimiento", () => {
  it("se corrige el monto y el saldo de la cuenta se recalcula solo", async () => {
    const antes = (await getCuenta(ids.cuenta))!.saldo_actual;
    const id = await cobrar(90_000); // un cero de más
    expect((await getCuenta(ids.cuenta))!.saldo_actual).toBe(antes + 90_000);

    await updateMovimiento(id, { monto: 9_000 });

    const d = (await getMovimiento(id))!;
    expect(d.monto, "quedó corregido").toBe(9_000);
    expect(d.descripcion, "y lo que no se tocó no se perdió").toBe("Con un cero de mas");
    expect((await getCuenta(ids.cuenta))!.saldo_actual, "el saldo se recalculó solo").toBe(antes + 9_000);
  });

  it("se corrige la fecha, la nota y el proyecto sin tocar el monto", async () => {
    const id = await cobrar(5_000);
    await updateMovimiento(id, { fecha: new Date(2026, 3, 2), descripcion: "Ya con la nota buena" });
    const d = (await getMovimiento(id))!;
    expect(d.monto).toBe(5_000);
    expect(d.descripcion).toBe("Ya con la nota buena");
  });

  it("una pata de transferencia NO se corrige: son dos movimientos espejo", async () => {
    await createTransferencia(uid, {
      negocio_id: ids.negocio, monto: 20_000, fecha: new Date(2026, 2, 20),
      cuenta_origen: { id: ids.otra, nombre: "Caja" },
      cuenta_destino: { id: ids.cuenta, nombre: "Banco" },
    });
    const filas = await pedir<{ filas: Array<{ id: string; transfer_id: string | null }> }>(
      `/orgs/${ORG}/movimientos?negocio_id=${ids.negocio}`,
    );
    const pata = filas.filas.find((m) => m.transfer_id);
    expect(pata, "se creó la transferencia").toBeTruthy();

    await expect(updateMovimiento(pata!.id, { monto: 1 })).rejects.toThrow(/transferencia/i);
  });

  it("el monto de un movimiento YA facturado no se mueve, pero lo demás sí", async () => {
    const id = await cobrar(116_000);
    const c = await crearCfdi({
      negocio_id: ids.negocio, uuid: `${Date.now()}-1111-2222-3333-444444444444`.slice(0, 36),
      tipo: "ingreso", rfc: "XAXX010101000",
      subtotal: 100_000, iva: 16_000, retenciones: 0, total: 116_000, fecha: "2026-03-18",
    });
    await ligarCfdi(c.id, id);

    await expect(updateMovimiento(id, { monto: 50_000 }), "el monto se rechaza").rejects.toThrow(/factura/i);

    // Y lo demás sí se corrige: la cerradura es del monto, no del movimiento.
    await updateMovimiento(id, { descripcion: "Nota corregida con factura puesta" });
    const d = (await getMovimiento(id))!;
    expect(d.monto, "el importe siguió intacto").toBe(116_000);
    expect(d.descripcion).toBe("Nota corregida con factura puesta");
  });

  it("corregir uno que ya no existe avisa en vez de callarse", async () => {
    await expect(updateMovimiento("01ZZZZZZZZZZZZZZZZZZZZZZZZ", { monto: 1 })).rejects.toThrow(/ya no existe/i);
  });
});

describe("la nota se puede borrar, no sólo agregar", () => {
  /* Mike, 21-sep: «cuando borro una nota en el movimiento, le doy guardar
   * cambios y no la borra. Se queda igual. Sí puedo agregar, pero no puedo
   * borrar».
   *
   * Tenía razón y la causa estaba en la pantalla, no aquí: mandaba
   * `descripcion.trim() || undefined`, y en el guardado `undefined` quiere
   * decir «no toques este campo». Vaciar la caja mandaba `undefined`, o sea
   * «déjala como está». Agregar sí funcionaba porque ahí el texto no era
   * vacío.
   *
   * Esta prueba mide la regla del lado de la escritura, que es donde vive:
   * la cadena VACÍA borra, y `undefined` —de verdad no mandar el campo— no
   * toca nada. Las dos cosas importan: si la vacía no borrara, no habría
   * arreglo; si `undefined` borrara, cualquier guardado parcial se llevaría
   * la nota por delante. */
  it("mandar la cadena vacía deja el movimiento sin nota", async () => {
    const id = await cobrar(150_00, { descripcion: "Nota que hay que quitar" });
    expect((await getMovimiento(id))!.descripcion).toBe("Nota que hay que quitar");

    await updateMovimiento(id, { descripcion: "" });
    const ya = await getMovimiento(id);
    expect(ya!.descripcion ?? "", "la nota se fue").toBe("");
  });

  it("y NO mandar el campo la deja como estaba", async () => {
    const id = await cobrar(160_00, { descripcion: "Ésta se queda" });
    await updateMovimiento(id, { monto: 170_00 });
    expect((await getMovimiento(id))!.descripcion).toBe("Ésta se queda");
  });

  it("agregar una nota a un movimiento que no tenía también funciona", async () => {
    const id = await cobrar(180_00, { descripcion: "" });
    await updateMovimiento(id, { descripcion: "Le pongo una" });
    expect((await getMovimiento(id))!.descripcion).toBe("Le pongo una");
  });
});
