/* Un día sin hora es un día, y se lee y se escribe en la misma zona.
 *
 * Mike, 21-sep: «me está poniendo un día menos de lo que estoy marcando en
 * el calendario como la fecha del movimiento».
 *
 * Tenía razón, y el error no estaba en una zona ni en la otra: estaba en
 * MEZCLARLAS dentro del mismo guardado. El formulario hacía
 * `new Date("2026-09-21")`, que el estándar manda leer como medianoche en
 * UTC —en la Ciudad de México, el día 20 a las seis de la tarde—, y `aDia`
 * lo volvía a texto leyendo componentes LOCALES. Resultado: 20.
 *
 * LO QUE DE VERDAD APORTA: que la vuelta completa no pierda el día, en
 * cualquier zona. Se corre en una zona al OESTE de Greenwich y en otra al
 * ESTE, porque el error se ve de un lado y se esconde del otro: en CDMX
 * `toISOString()` daba la casualidad de acertar al leer, y por eso el
 * defecto sólo se notaba al guardar.
 */

import { describe, expect, it } from "vitest";
import { aDia, aTimestamp, delDia } from "@/lib/api/adaptar";

/** Corre algo con el reloj del proceso puesto en otra zona. */
function enZona<T>(tz: string, f: () => T): T {
  const antes = process.env.TZ;
  process.env.TZ = tz;
  try { return f(); } finally {
    if (antes === undefined) delete process.env.TZ; else process.env.TZ = antes;
  }
}

const DIAS = ["2026-09-21", "2026-01-01", "2026-12-31", "2026-02-28", "2026-06-15"];

describe("el día que se escoge es el día que se guarda", () => {
  it("`aDia(delDia(x))` devuelve x, tal cual", () => {
    for (const d of DIAS) expect(aDia(delDia(d)), `${d} ida y vuelta`).toBe(d);
  });

  it("y el caso exacto que Mike reportó: el 21 se guarda como 21, no como 20", () => {
    expect(aDia(delDia("2026-09-21"))).toBe("2026-09-21");
  });

  it("`new Date(dia)` —lo que había antes— sí pierde el día al oeste de Greenwich", () => {
    /* Esta prueba fija el PORQUÉ, no sólo el qué. Si algún día alguien
     * «simplifica» `delDia` de vuelta a `new Date(dia)`, esto le explica en
     * el acto qué se rompe. */
    const perdido = enZona("America/Mexico_City", () => aDia(new Date("2026-09-21")));
    expect(perdido, "medianoche en Londres es todavía el 20 aquí").toBe("2026-09-20");
  });

  it("la vuelta aguanta al este de Greenwich también", () => {
    /* Al este, el que se equivocaba era el camino de LECTURA con
     * `toISOString()`. En CDMX acertaba de casualidad. */
    for (const tz of ["Europe/Madrid", "Asia/Tokyo", "Pacific/Auckland"]) {
      enZona(tz, () => {
        for (const d of DIAS) expect(aDia(delDia(d)), `${d} en ${tz}`).toBe(d);
      });
    }
  });

  it("y lo que vuelve de la API tampoco pierde el día", () => {
    /* `aTimestamp` arma la medianoche de aquí; leerla con `aDia` tiene que
     * devolver el mismo texto que mandó la API. */
    for (const d of DIAS) {
      const t = aTimestamp(d);
      expect(t, `${d} se pudo leer`).toBeTruthy();
      expect(aDia(t!.toDate()), `${d} de la API a la pantalla`).toBe(d);
    }
  });
});
