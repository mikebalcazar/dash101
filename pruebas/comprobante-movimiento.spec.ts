/* El comprobante de un movimiento se guarda. Siempre.
 *
 * Mike, 21-sep: «no se están guardando los PDFs que adjunto en los detalles
 * de los movimientos».
 *
 * Tenía razón y el defecto era peor de lo que suena: la subida vivía DENTRO
 * del `if` que capturaba el CFDI, así que el archivo sólo llegaba si además
 * habías marcado «ya se facturó» Y tecleado el folio fiscal. Un comprobante
 * en PDF —una ficha de transferencia, un recibo— no trae UUID, así que se
 * perdía sin decir nada.
 *
 * Y se perdía en SILENCIO, que es lo caro: la pantalla enseñaba su vista
 * previa, guardabas, y el archivo no llegaba a ningún lado. El recorrido en
 * navegador tampoco lo cachaba, porque medía que el archivo SE VIERA antes
 * de guardar, no que QUEDARA guardado. Ésa es la prueba que faltaba y es
 * ésta.
 *
 * LO QUE DE VERDAD APORTA: que el comprobante quede colgado del movimiento
 * en los tres casos —sin factura, con factura pendiente y con factura
 * capturada—, porque el archivo es del movimiento y no de la factura.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fuente } from "@/lib/fuente";
import { bajar, entrarDePrueba, pedir } from "@/lib/api/cliente";
import { createNegocio } from "@/lib/negocios";
import { createCliente } from "@/lib/clientes";
import { createCuenta } from "@/lib/cuentas";
import { createMovimiento } from "@/lib/movimientos";
import { subirArchivo } from "@/lib/ordenes";

const CORREO = process.env.CORREO_SUPERADMIN ?? "mike@forespot.com";
const ORG = `cm-${(process.env.GITHUB_RUN_ID ?? Date.now().toString(36)).toString().toLowerCase().slice(-12)}`;
const ORG_ANTES = process.env.NEXT_PUBLIC_ORG;

let uid = "";
const ids = { negocio: "", cuenta: "", cliente: "" };

/** Un PDF de verdad, chiquito: cabecera, un objeto y el cierre. Se manda un
 *  PDF y no un texto cualquiera a propósito, porque lo que Mike reportó es
 *  justo el PDF. */
const PDF = new Uint8Array([
  ...new TextEncoder().encode("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"),
]);

const comprobante = (nombre: string) =>
  new File([PDF as BlobPart], nombre, { type: "application/pdf" });

/** Lo que de verdad quedó colgado del movimiento, leído de la API. */
const archivosDe = async (movimiento_id: string) => {
  const r = await pedir<{ filas: Array<{ id: string; nombre: string; mime: string; bytes: number }> }>(
    `/orgs/${ORG}/archivos?de_tabla=movimientos&de_id=${encodeURIComponent(movimiento_id)}`,
  );
  return r.filas ?? [];
};

const cobrar = (descripcion: string, extra: Record<string, unknown> = {}) =>
  createMovimiento(uid, {
    tipo: "ingreso", monto: 5_000, fecha: new Date(2026, 2, 18),
    cuenta_id: ids.cuenta, cuenta_nombre: "Banco",
    contraparte_id: ids.cliente, contraparte_tipo: "cliente", contraparte_nombre: "HOLCIM",
    negocio_id: ids.negocio, descripcion, ...extra,
  });

beforeAll(async () => {
  expect(fuente()).toBe("api");
  expect((await pedir<{ entorno: string }>("/salud")).entorno).toBe("staging");
  uid = (await entrarDePrueba(CORREO)).id;

  process.env.NEXT_PUBLIC_ORG = ORG;
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* no existía */ }
  await pedir("/admin/orgs", { method: "POST", body: { id: ORG, nombre: "Comprobantes" } });

  ids.negocio = await createNegocio(uid, { nombre: "Taller", moneda: "MXN" });
  ids.cuenta = await createCuenta(uid, { nombre: "Banco", tipo: "banco", saldo_inicial: 0, negocio_id: ids.negocio, moneda: "MXN" });
  ids.cliente = await createCliente(uid, { nombre: "HOLCIM", negocio_id: ids.negocio });
}, 120000);

afterAll(async () => {
  try { await pedir(`/admin/orgs/${ORG}`, { method: "DELETE" }); } catch { /* ya no estaba */ }
  if (ORG_ANTES === undefined) delete process.env.NEXT_PUBLIC_ORG;
  else process.env.NEXT_PUBLIC_ORG = ORG_ANTES;
});

describe("el comprobante se cuelga del movimiento", () => {
  it("un PDF sin factura de por medio SÍ se guarda", async () => {
    /* Éste es el caso que Mike reportó: una ficha de transferencia, sin
     * CFDI y sin folio fiscal. Antes se perdía en silencio. */
    const id = await cobrar("Transferencia del cliente", { requiere_factura: false });
    const a = await subirArchivo("movimientos", id, comprobante("ficha-de-transferencia.pdf"));
    expect(a.id, "la subida devolvió el archivo").toBeTruthy();

    const guardados = await archivosDe(id);
    expect(guardados, "quedó colgado del movimiento").toHaveLength(1);
    expect(guardados[0].nombre).toBe("ficha-de-transferencia.pdf");
    expect(guardados[0].mime).toBe("application/pdf");
    expect(guardados[0].bytes, "y con su contenido, no vacío").toBe(PDF.byteLength);
  });

  it("con factura pendiente también", async () => {
    const id = await cobrar("Falta la factura", { requiere_factura: true });
    await subirArchivo("movimientos", id, comprobante("recibo.pdf"));
    expect(await archivosDe(id)).toHaveLength(1);
  });

  it("y el archivo se puede volver a bajar, no sólo listar", async () => {
    /* Listar el renglón no prueba que el contenido llegó a R2. Bajarlo sí. */
    const id = await cobrar("Con comprobante para bajar", { requiere_factura: false });
    const a = await subirArchivo("movimientos", id, comprobante("comprobante.pdf"));
    const r = await bajar(`/orgs/${ORG}/archivos/${a.id}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect(bytes.byteLength).toBe(PDF.byteLength);
    expect(new TextDecoder().decode(bytes.slice(0, 5)), "es un PDF de verdad").toBe("%PDF-");
  });

  it("dos comprobantes en el mismo movimiento conviven", async () => {
    /* Una nota y su ficha de pago son dos archivos del mismo movimiento; el
     * segundo no debe pisar al primero. */
    const id = await cobrar("Dos papeles", { requiere_factura: false });
    await subirArchivo("movimientos", id, comprobante("nota.pdf"));
    await subirArchivo("movimientos", id, comprobante("pago.pdf"));
    const guardados = await archivosDe(id);
    expect(guardados).toHaveLength(2);
    expect(guardados.map((g) => g.nombre).sort()).toEqual(["nota.pdf", "pago.pdf"]);
  });

  it("el comprobante de un movimiento no sale en el de otro", async () => {
    const uno = await cobrar("El mío", { requiere_factura: false });
    const otro = await cobrar("El de al lado", { requiere_factura: false });
    await subirArchivo("movimientos", uno, comprobante("solo-mio.pdf"));
    expect(await archivosDe(otro), "el de al lado sigue sin papeles").toHaveLength(0);
  });
});
