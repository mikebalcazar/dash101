/* Qué archivo se acepta al arrastrarlo, y cómo se lee su tamaño.
 *
 * Mike, 20-sep: «quiero poder arrastrar los archivos para subirlos. Y que me
 * muestre un preview del archivo abajo».
 *
 * POR QUÉ ESTAS DOS FUNCIONES LLEVAN PRUEBA, y no la pantalla entera:
 *
 * Al arrastrar, el navegador NO siempre dice de qué tipo es el archivo. Un
 * `.xml` soltado desde el explorador de Windows llega muchas veces con el
 * tipo vacío, y un `accept` que sólo mire el tipo lo rechazaría: sería
 * rechazar justo el caso normal —la factura del contador— y quien la
 * arrastra no tendría manera de saber por qué no pasa. Al revés también
 * cuenta: aceptar cualquier cosa deja colgar el archivo equivocado, y eso se
 * descubre meses después, cuando alguien lo abre.
 *
 * Es la parte del control que puede fallar en silencio; lo demás —que el
 * área se pinte, que la vista previa salga— se ve con los ojos y lo mide el
 * recorrido en navegador.
 */

import { describe, expect, it } from "vitest";
import { aceptado, pesa } from "@/components/soltar-archivo";

const archivo = (name: string, type = "") => ({ name, type });

describe("qué archivo pasa", () => {
  const FACTURA = ".xml,.pdf,application/xml,text/xml,application/pdf";

  it("el XML del contador pasa aunque el navegador no diga de qué tipo es", () => {
    /* El caso normal al arrastrar desde Windows. */
    expect(aceptado(archivo("FacturaA1B2.xml"), FACTURA)).toBe(true);
    expect(aceptado(archivo("FACTURA.XML"), FACTURA), "y sin importar las mayúsculas").toBe(true);
  });

  it("el PDF pasa por extensión o por tipo", () => {
    expect(aceptado(archivo("factura.pdf"), FACTURA)).toBe(true);
    expect(aceptado(archivo("sin-extension", "application/pdf"), FACTURA)).toBe(true);
  });

  it("lo que no se pidió no pasa", () => {
    /* Aceptarlo en silencio es lo caro: el archivo equivocado colgado de un
     * movimiento no se descubre hasta que alguien lo abre. */
    expect(aceptado(archivo("foto.jpg", "image/jpeg"), FACTURA)).toBe(false);
    expect(aceptado(archivo("hoja.xlsx"), FACTURA)).toBe(false);
  });

  it("donde se pide una foto, cualquier imagen pasa", () => {
    const COMPROBANTE = "image/*,application/pdf";
    expect(aceptado(archivo("recibo.jpg", "image/jpeg"), COMPROBANTE)).toBe(true);
    expect(aceptado(archivo("recibo.heic", "image/heic"), COMPROBANTE), "la del iPhone también").toBe(true);
    expect(aceptado(archivo("recibo.pdf", "application/pdf"), COMPROBANTE)).toBe(true);
    expect(aceptado(archivo("notas.txt", "text/plain"), COMPROBANTE)).toBe(false);
  });

  it("sin lista de aceptados, pasa todo", () => {
    expect(aceptado(archivo("lo-que-sea.zip"), "")).toBe(true);
  });
});

describe("el tamaño se lee de un vistazo", () => {
  it("en bytes, kilos o megas según toque", () => {
    expect(pesa(900)).toBe("900 B");
    expect(pesa(2048)).toBe("2 KB");
    expect(pesa(3_500_000)).toBe("3.3 MB");
  });
});
