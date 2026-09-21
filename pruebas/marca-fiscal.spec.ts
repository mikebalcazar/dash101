/* Qué marca le toca a cada movimiento en la lista.
 *
 * Mike, 21-sep: «los que sí van fiscalizados deberían tener un iconito en su
 * renglón. Sugiero que el ícono sea el mismo, pero en ROJO cuando aún no se
 * expide la factura, y VERDE cuando ya esté facturada».
 *
 * LO QUE DE VERDAD APORTA: que los TRES casos se distingan. Antes había dos
 * marcas para tres estados —con factura salía el ícono, y sin factura no
 * salía nada, tanto si el movimiento debía una como si no—, y eso es lo que
 * la lista no dejaba ver: cuál le debe una factura al SAT y cuál no debe
 * nada.
 */

import { describe, expect, it } from "vitest";
import { marcaDe } from "@/components/marca-fiscal";

describe("la marca fiscal del renglón", () => {
  it("un movimiento que no lleva factura no lleva marca", () => {
    expect(marcaDe({ requiere_factura: false, facturado: false })).toBeNull();
  });

  it("fiscal y sin factura todavía: ROJO", () => {
    const m = marcaDe({ requiere_factura: true, facturado: false });
    expect(m?.color).toBe("rojo");
    expect(m?.etiqueta, "y lo dice con palabras, no sólo con el color").toBe("Falta facturar");
  });

  it("fiscal y ya facturado: VERDE", () => {
    const m = marcaDe({ requiere_factura: true, facturado: true });
    expect(m?.color).toBe("verde");
    expect(m?.etiqueta).toBe("Facturado");
  });

  it("los tres estados se distinguen entre sí", () => {
    /* Es el punto entero del encargo: antes «no lleva factura» y «falta
     * facturar» se veían igual —los dos sin marca— y son lo contrario uno
     * del otro. */
    const tres = [
      marcaDe({ requiere_factura: false, facturado: false }),
      marcaDe({ requiere_factura: true, facturado: false }),
      marcaDe({ requiere_factura: true, facturado: true }),
    ].map((m) => m?.color ?? "sin marca");
    expect(new Set(tres).size, "tres estados, tres pintas").toBe(3);
  });

  it("un movimiento viejo, sin los campos, no lleva marca", () => {
    /* Los movimientos de antes de lo fiscal no traen `requiere_factura`.
     * Que no truenen ni se pinten de rojo: no deben nada. */
    expect(marcaDe({})).toBeNull();
  });
});
