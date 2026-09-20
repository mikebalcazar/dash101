/* La marca de «fiscalizado» en las listas de movimientos.
 *
 * Mike, 20-sep: «en todas las listas que se desplieguen de movimientos,
 * agrega un iconito que indique que es un movimiento fiscalizado».
 *
 * El icono es dos líneas de pantalla. LO QUE DE VERDAD HAY QUE MEDIR es que
 * el dato llegue: `facturado` se escribe en el movimiento cuando se captura
 * el CFDI, y la LISTA tiene que traerlo. Si la lista lo perdiera —por un
 * campo podado en la API o por el adaptador— el icono no saldría nunca y no
 * habría manera de notarlo más que a ojo, pantalla por pantalla.
 *
 * Se mide con las mismas funciones que usan las dos listas de hoy.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCliente } from "@/lib/clientes";
import { createCuenta } from "@/lib/cuentas";
import { createMovimiento, listMovimientos } from "@/lib/movimientos";
import { crearCfdi, ligarCfdi } from "@/lib/fiscal";
import { subirArchivo } from "@/lib/ordenes";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `mf-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { negocio: "", cuenta: "", cliente: "", conFactura: "", sinFactura: "" };

const cobrar = (monto: number) =>
  createMovimiento(uid, {
    tipo: "ingreso", monto, fecha: new Date(2026, 2, 22),
    cuenta_id: ids.cuenta, cuenta_nombre: "Banco",
    contraparte_id: ids.cliente, contraparte_tipo: "cliente", contraparte_nombre: "HOLCIM",
    negocio_id: ids.negocio,
  });

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Marca de facturado" } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cuenta = await createCuenta(uid, { nombre: "Banco", tipo: "banco", saldo_inicial: 0, negocio_id: ids.negocio, moneda: "MXN" });
  ids.cliente = await createCliente(uid, { nombre: "HOLCIM", negocio_id: ids.negocio });

  ids.conFactura = await cobrar(116_000);
  ids.sinFactura = await cobrar(40_000);

  const c = await crearCfdi({
    negocio_id: ids.negocio, uuid: `${Date.now()}-9999-8888-7777-666666666666`.slice(0, 36),
    tipo: "ingreso", rfc: "XAXX010101000",
    subtotal: 100_000, iva: 16_000, retenciones: 0, total: 116_000, fecha: "2026-03-22",
  });
  await ligarCfdi(c.id, ids.conFactura);
}, 90000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); }
  finally { process.env.NEXT_PUBLIC_ORG = ORG_ANTES; }
});

describe("la marca de fiscalizado", () => {
  it("la LISTA de movimientos trae `facturado`: sin eso el icono no saldría nunca", async () => {
    const lista = await listMovimientos(ids.negocio);
    const conF = lista.find((m) => m.id === ids.conFactura);
    const sinF = lista.find((m) => m.id === ids.sinFactura);

    expect(conF, "el cobro facturado está en la lista").toBeTruthy();
    expect(conF!.facturado, "y viene marcado").toBe(true);
    expect(sinF!.facturado, "el otro no").toBe(false);
  });

  it("cancelar la factura apaga la marca: no se queda pegada", async () => {
    /* Es la mitad que se olvida. Una marca que se prende y no se apaga
     * miente peor que no tenerla: se ve un movimiento «fiscalizado» cuya
     * factura ya no existe, y esa es justo la que hay que perseguir. */
    await pedir(`/orgs/${ORG}/fiscal/movimientos/${ids.conFactura}/facturado`, {
      method: "POST", body: { facturado: false },
    });
    const lista = await listMovimientos(ids.negocio);
    expect(lista.find((m) => m.id === ids.conFactura)!.facturado).toBe(false);
  });

  it("capturar la factura al momento la deja colgada del movimiento, con su archivo", async () => {
    /* Es el camino que hace la pantalla cuando se escoge «Ya se facturó»:
     * se crea el movimiento, se crea el CFDI POR EL TOTAL DEL MOVIMIENTO, se
     * ligan, y se cuelga el archivo. Nunca se crea un movimiento aparte:
     * una factura no es un cobro más.
     *
     * Que el total salga del movimiento es lo que impide el error caro: una
     * factura por una cifra y su movimiento por otra, con el IVA saliendo de
     * en medio. */
    const total = 58_000, iva = 8_000;
    const id = await cobrar(total);
    const c = await crearCfdi({
      negocio_id: ids.negocio, uuid: `${Date.now()}-5555-4444-3333-222222222222`.slice(0, 36),
      tipo: "ingreso", rfc: "XAXX010101000",
      subtotal: total - iva, iva, retenciones: 0, total, fecha: "2026-03-22",
    });
    await ligarCfdi(c.id, id);

    const archivo = new File(["<cfdi:Comprobante/>"], "factura.xml", { type: "application/xml" });
    const subido = await subirArchivo("movimientos", id, archivo);
    expect(subido.nombre).toBe("factura.xml");

    const lista = await listMovimientos(ids.negocio);
    const mio = lista.find((m) => m.id === id)!;
    expect(mio.facturado, "queda marcado desde el primer guardado").toBe(true);
    expect(mio.monto, "y el movimiento vale lo mismo que su factura").toBe(total);

    const suyos = await pedir<{ filas: Array<{ nombre: string }> }>(
      `/orgs/${ORG}/archivos?de_tabla=movimientos&de_id=${id}`,
    );
    expect(suyos.filas.map((a) => a.nombre), "el archivo quedó colgado del movimiento").toEqual(["factura.xml"]);
  });

  it("y un egreso facturado se marca igual que un ingreso", async () => {
    const egreso = await createMovimiento(uid, {
      tipo: "egreso", monto: 23_200, fecha: new Date(2026, 2, 23),
      cuenta_id: ids.cuenta, cuenta_nombre: "Banco",
      contraparte_id: null, contraparte_tipo: "otro", contraparte_nombre: "Maderas",
      negocio_id: ids.negocio,
    });
    await pedir(`/orgs/${ORG}/fiscal/movimientos/${egreso}/facturado`, {
      method: "POST", body: { facturado: true, tasa_iva: 1600 },
    });
    const lista = await listMovimientos(ids.negocio);
    expect(lista.find((m) => m.id === egreso)!.facturado, "los dos lados se marcan igual").toBe(true);
  });
});
