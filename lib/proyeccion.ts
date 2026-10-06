/* El flujo proyectado, por BLOQUES de tiempo.
 *
 * Mike, 6-oct-2026: «en la proyección de flujos necesito que haya opción
 * para presentar por bloques de tiempo, ya sea por semana, por quincena,
 * por mes, por trimestre, por semestre y por año. Quiero ver todos los
 * gastos y los cobros que están planeados para esa semana. Hay que ver en
 * nómina el programar la nómina para que también se considere en los
 * gastos».
 *
 * Es un motor PURO: entra el saldo de hoy y lo que está planeado, sale una
 * lista de bloques con sus cobros, sus gastos y el saldo al cerrar cada uno.
 * No lee la API ni la pantalla; por eso se prueba sin red (pruebas/
 * proyeccion.spec.ts).
 *
 * LO QUE ENTRA, y de dónde:
 *
 *   · los OPEX activos (gastos e ingresos recurrentes), en cada fecha en que
 *     caen;
 *   · la NÓMINA PROGRAMADA (contrato 0.71.0): cada fecha de pago futura
 *     entra como gasto con el monto estimado; si para esa fecha ya hay un
 *     corte abierto (borrador), entra el corte con su total de verdad y no
 *     la estimación. Un borrador cuyo periodo ya pasó cae en el primer
 *     bloque, marcado como vencido;
 *   · las ÓRDENES DE COMPRA pendientes de pago, en su fecha máxima de pago.
 *     Una ya vencida cae en el primer bloque; una sin fecha también, porque
 *     está pendiente hoy y no hay otro lugar donde ponerla.
 *
 * Los cobros de proyectos NO entran todavía: no tienen fecha esperada. La
 * pantalla lo dice con esas palabras en vez de inventarles una.
 *
 * EL PRIMER BLOQUE es el que contiene HOY, pero sólo cuenta lo que cae de
 * hoy en adelante: el saldo de arranque ya trae lo que pasó antes. Con
 * bloques de un año, contar enero cuando ya es octubre restaría dos veces.
 */

import { Timestamp } from "firebase/firestore";
import type { Opex } from "@/types/schema";
import type { ProgramaDeNomina, BorradorDeRaya } from "@/lib/nomina";

export type Bloque = "semana" | "quincena" | "mes" | "trimestre" | "semestre" | "anio";

export const BLOQUES: Array<{ valor: Bloque; nombre: string }> = [
  { valor: "semana", nombre: "Semana" },
  { valor: "quincena", nombre: "Quincena" },
  { valor: "mes", nombre: "Mes" },
  { valor: "trimestre", nombre: "Trimestre" },
  { valor: "semestre", nombre: "Semestre" },
  { valor: "anio", nombre: "Año" },
];

export interface Lapso {
  index: number;
  /** A las 00:00:00. */
  inicio: Date;
  /** A las 23:59:59.999. */
  fin: Date;
}

export type ClasePlaneado = "opex" | "nomina" | "orden";

/** Un cobro o un gasto que cae en una fecha. En PESOS. */
export interface Planeado {
  clase: ClasePlaneado;
  id: string;
  nombre: string;
  tipo: "ingreso" | "egreso";
  monto: number;
  fecha: Date;
  /** La nómina sin corte abierto: es la estimación del programa. */
  estimado?: boolean;
  /** Debió pagarse antes de hoy y sigue pendiente: cae en el primer bloque. */
  vencido?: boolean;
  /** Una orden sin fecha máxima de pago: cae en el primer bloque. */
  sin_fecha?: boolean;
}

export interface BloqueProyeccion extends Lapso {
  ingresos: number;
  egresos: number;
  neto: number;
  saldo_final: number;
  planeados: Planeado[];
}

/** Una orden de compra pendiente de pago, ya en PESOS. */
export interface OrdenPlaneada {
  id: string;
  nombre: string;
  monto: number;
  /** AAAA-MM-DD o null. */
  fecha_maxima_pago: string | null;
}

export interface Fuentes {
  opex: Opex[];
  nomina?: { programa: ProgramaDeNomina | null; borradores: BorradorDeRaya[] } | null;
  ordenes?: OrdenPlaneada[] | null;
}

export interface ProyeccionOpts {
  bloque?: Bloque;
  /** Cuántos meses hacia adelante. */
  meses?: number;
  hoy?: Date;
}

/* ─────────────── fechas ─────────────── */

const DIA_MS = 24 * 60 * 60 * 1000;

const medianoche = (d: Date): Date => {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
};

/** 'AAAA-MM-DD' leído como día LOCAL (no como medianoche UTC). */
export function delDiaLocal(dia: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, (m || 1) - 1, d || 1);
}

const diaTexto = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const ultimoDiaDelMes = (anio: number, mes: number): number => new Date(anio, mes + 1, 0).getDate();

/** Dónde empieza el bloque que contiene `d`. */
export function inicioDeBloque(bloque: Bloque, d: Date): Date {
  const r = medianoche(d);
  switch (bloque) {
    case "semana": {
      const dia = r.getDay(); // 0 = domingo
      r.setDate(r.getDate() + (dia === 0 ? -6 : 1 - dia));
      return r;
    }
    case "quincena":
      r.setDate(r.getDate() <= 15 ? 1 : 16);
      return r;
    case "mes":
      r.setDate(1);
      return r;
    case "trimestre":
      r.setMonth(Math.floor(r.getMonth() / 3) * 3, 1);
      return r;
    case "semestre":
      r.setMonth(r.getMonth() < 6 ? 0 : 6, 1);
      return r;
    case "anio":
      r.setMonth(0, 1);
      return r;
  }
}

/** Dónde empieza el bloque que sigue a uno que empieza en `inicio`. */
export function siguienteBloque(bloque: Bloque, inicio: Date): Date {
  const r = new Date(inicio);
  switch (bloque) {
    case "semana":
      r.setDate(r.getDate() + 7);
      return r;
    case "quincena":
      if (r.getDate() === 1) r.setDate(16);
      else r.setMonth(r.getMonth() + 1, 1);
      return r;
    case "mes":
      r.setMonth(r.getMonth() + 1, 1);
      return r;
    case "trimestre":
      r.setMonth(r.getMonth() + 3, 1);
      return r;
    case "semestre":
      r.setMonth(r.getMonth() + 6, 1);
      return r;
    case "anio":
      r.setFullYear(r.getFullYear() + 1, 0, 1);
      return r;
  }
}

/** Los bloques desde el que contiene `desde` hasta el que contiene
 *  `desde + meses`, ENTERO. Un bloque nunca se parte: uno que dijera «2027»
 *  con sólo diez meses adentro mentiría. */
export function lapsos(bloque: Bloque, desde: Date, meses: number): Lapso[] {
  const tope = medianoche(desde);
  tope.setMonth(tope.getMonth() + meses);
  const salida: Lapso[] = [];
  let inicio = inicioDeBloque(bloque, desde);
  while (inicio < tope) {
    const sig = siguienteBloque(bloque, inicio);
    salida.push({ index: salida.length, inicio, fin: new Date(sig.getTime() - 1) });
    inicio = sig;
  }
  return salida;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const corto = (d: Date) => d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });

/** Cómo se llama un bloque en la pantalla. */
export function etiquetaDeLapso(bloque: Bloque, l: Lapso): string {
  const d = l.inicio;
  switch (bloque) {
    case "semana":
      return `Semana del ${corto(d)}`;
    case "quincena":
      return `${d.getDate() === 1 ? "1.ª" : "2.ª"} quincena de ${MESES[d.getMonth()]}`;
    case "mes":
      return `${MESES[d.getMonth()][0].toUpperCase()}${MESES[d.getMonth()].slice(1)} ${d.getFullYear()}`;
    case "trimestre":
      return `${Math.floor(d.getMonth() / 3) + 1}.º trimestre ${d.getFullYear()}`;
    case "semestre":
      return `${d.getMonth() < 6 ? "1.º" : "2.º"} semestre ${d.getFullYear()}`;
    case "anio":
      return String(d.getFullYear());
  }
}

/* ─────────────── los OPEX ─────────────── */

const aFecha = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const t = v as Timestamp;
  return typeof t.toDate === "function" ? t.toDate() : null;
};

export function opexOcurreEn(fecha: Date, opex: Opex): boolean {
  const inicio = aFecha(opex.fecha_inicio);
  const fin = aFecha(opex.fecha_fin);
  if (!inicio) return false;
  const inicioMidnight = medianoche(inicio);
  const finMidnight = fin ? medianoche(fin) : null;
  if (fecha < inicioMidnight) return false;
  if (finMidnight && fecha > finMidnight) return false;

  switch (opex.frecuencia) {
    case "semanal":
      return fecha.getDay() === (opex.dia_semana ?? inicioMidnight.getDay());
    case "mensual": {
      const dia = opex.dia_del_mes ?? inicioMidnight.getDate();
      // Auto-ajuste: el día 31 en febrero es el 28 (o el 29).
      return fecha.getDate() === Math.min(dia, ultimoDiaDelMes(fecha.getFullYear(), fecha.getMonth()));
    }
    case "anual":
      return fecha.getMonth() === inicioMidnight.getMonth() && fecha.getDate() === inicioMidnight.getDate();
    default:
      return false;
  }
}

/* ─────────────── la nómina ─────────────── */

/** Si el programa paga ese día. La quincenal paga el 15 y el último del
 *  mes; la mensual, el día dicho, recortado al mes corto. */
export function nominaOcurreEn(fecha: Date, p: ProgramaDeNomina): boolean {
  if (!p.activo) return false;
  switch (p.frecuencia) {
    case "semanal":
      return fecha.getDay() === (p.dia_semana ?? 6);
    case "quincenal":
      return fecha.getDate() === 15 || fecha.getDate() === ultimoDiaDelMes(fecha.getFullYear(), fecha.getMonth());
    case "mensual":
      return fecha.getDate() === Math.min(p.dia_del_mes ?? 1, ultimoDiaDelMes(fecha.getFullYear(), fecha.getMonth()));
    default:
      return false;
  }
}

/* ─────────────── la proyección ─────────────── */

/** Lo que cae en cada fecha de aquí a `hasta`, de las tres fuentes. */
export function planear(fuentes: Fuentes, hoy: Date, hasta: Date): Planeado[] {
  const desde = medianoche(hoy);
  const salida: Planeado[] = [];
  const opex = fuentes.opex.filter((o) => o.activo);
  const programa = fuentes.nomina?.programa ?? null;
  const borradores = fuentes.nomina?.borradores ?? [];
  const cubre = (d: Date) => {
    const t = diaTexto(d);
    return borradores.find((b) => b.periodo_inicio <= t && t <= b.periodo_fin);
  };

  for (let d = new Date(desde); d <= hasta; d = new Date(d.getTime() + DIA_MS)) {
    for (const o of opex) {
      if (!opexOcurreEn(d, o)) continue;
      salida.push({ clase: "opex", id: o.id ?? o.nombre, nombre: o.nombre, tipo: o.tipo, monto: o.monto, fecha: new Date(d) });
    }
    if (programa && nominaOcurreEn(d, programa) && !cubre(d)) {
      salida.push({ clase: "nomina", id: `nomina:${diaTexto(d)}`, nombre: "Nómina (estimada)", tipo: "egreso", monto: programa.monto, fecha: new Date(d), estimado: true });
    }
  }

  for (const b of borradores) {
    const fin = delDiaLocal(b.periodo_fin);
    const vencido = fin < desde;
    salida.push({
      clase: "nomina", id: b.id, nombre: `Nómina del ${corto(delDiaLocal(b.periodo_inicio))} al ${corto(fin)}`,
      tipo: "egreso", monto: b.total, fecha: vencido ? new Date(desde) : fin, vencido,
    });
  }

  for (const o of fuentes.ordenes ?? []) {
    const f = o.fecha_maxima_pago ? delDiaLocal(o.fecha_maxima_pago) : null;
    const vencido = !!f && f < desde;
    if (f && f > hasta) continue;
    salida.push({
      clase: "orden", id: o.id, nombre: o.nombre, tipo: "egreso", monto: o.monto,
      fecha: f && !vencido ? f : new Date(desde), vencido, sin_fecha: !f,
    });
  }

  return salida.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}

/** Proyecta el saldo por bloques partiendo del saldo de hoy. */
export function proyectar(saldoInicial: number, fuentes: Fuentes, opts?: ProyeccionOpts): BloqueProyeccion[] {
  const bloque = opts?.bloque ?? "semana";
  const meses = opts?.meses ?? 12;
  const hoy = opts?.hoy ?? new Date();
  const ls = lapsos(bloque, hoy, meses);
  if (!ls.length) return [];
  const todo = planear(fuentes, hoy, ls[ls.length - 1].fin);

  let saldo = saldoInicial;
  return ls.map((l) => {
    const planeados = todo.filter((p) => p.fecha >= l.inicio && p.fecha <= l.fin);
    const ingresos = planeados.filter((p) => p.tipo === "ingreso").reduce((s, p) => s + p.monto, 0);
    const egresos = planeados.filter((p) => p.tipo === "egreso").reduce((s, p) => s + p.monto, 0);
    const neto = ingresos - egresos;
    saldo += neto;
    return { ...l, ingresos, egresos, neto, saldo_final: saldo, planeados };
  });
}

/** El primer bloque donde el saldo cae bajo el umbral, o null si nunca. */
export function primerBloqueBajoUmbral(proyeccion: BloqueProyeccion[], umbral = 0): BloqueProyeccion | null {
  return proyeccion.find((b) => b.saldo_final < umbral) ?? null;
}
