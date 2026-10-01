/* El orden de los movimientos: del más reciente al más antiguo, de verdad.
 *
 * Mike, 1-oct-2026: «necesito que el orden sea del más reciente al más
 * antiguo, no sólo por día (como está ahorita) sino por el segundo, el orden
 * real. quiero que el que esté hasta arriba es el último que se hizo, no el
 * primero que se hizo del día presente».
 *
 * El día manda; dentro del mismo día, el momento en que se capturó. Se mide
 * el comparador solo, sin red: es lo que ordena la lista de Movimientos, la
 * del proyecto y el historial de la cuenta. */

import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase/firestore";
import { masRecientePrimero } from "@/lib/api/leer";
import type { Movimiento } from "@/types/schema";

const mov = (id: string, dia: string, creado: string): Movimiento => ({
  id, tipo: "egreso", monto: 1, fecha: Timestamp.fromDate(new Date(`${dia}T12:00:00`)),
  cuenta_id: "c", cuenta_nombre: "Caja", contraparte_tipo: "otro", contraparte_nombre: "",
  creado_at: Timestamp.fromDate(new Date(creado)), creado_por: "",
});

describe("del más reciente al más antiguo", () => {
  it("dentro del mismo día, el último capturado va hasta arriba", () => {
    const primero = mov("primero", "2026-10-01", "2026-10-01T09:00:00Z");
    const ultimo = mov("ultimo", "2026-10-01", "2026-10-01T18:30:05Z");
    const enMedio = mov("en-medio", "2026-10-01", "2026-10-01T12:00:00Z");
    expect([primero, ultimo, enMedio].sort(masRecientePrimero).map((m) => m.id)).toEqual(["ultimo", "en-medio", "primero"]);
  });

  it("el día manda sobre la hora de captura: lo de ayer capturado hoy sigue siendo de ayer", () => {
    const ayerCapturadoHoy = mov("ayer", "2026-09-30", "2026-10-01T20:00:00Z");
    const hoyTemprano = mov("hoy", "2026-10-01", "2026-10-01T08:00:00Z");
    expect([ayerCapturadoHoy, hoyTemprano].sort(masRecientePrimero).map((m) => m.id)).toEqual(["hoy", "ayer"]);
  });

  it("sin hora de captura no truena: queda después de los que sí la traen", () => {
    const sin = { ...mov("sin", "2026-10-01", "2026-10-01T08:00:00Z"), creado_at: undefined as unknown as Timestamp };
    const con = mov("con", "2026-10-01", "2026-10-01T07:00:00Z");
    expect([sin, con].sort(masRecientePrimero).map((m) => m.id)).toEqual(["con", "sin"]);
  });
});
