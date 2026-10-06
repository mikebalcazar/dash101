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
 *   · los COBROS DE PROYECTOS, por el plan de pagos de cada uno (contrato
 *     0.72.0; Mike lo escogió con botones el 6-oct): cada parcialidad entra
 *     en su fecha, pero lo que el proyecto ya cobró se descuenta de las
 *     parcialidades en orden de fecha, así sólo lo pendiente entra. Una
 *     parcialidad vencida cae en el primer bloque. Lo que el proyecto tiene
 *     por cobrar sin parcialidad que lo cubra queda SIN FECHA y no entra:
 *     la pantalla dice cuánto es.
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

export type ClasePlaneado = "opex" | "nomina" | "orden" | "cobro" | "compromiso";

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

/** Un cobro de proyecto que falta, ya con lo cobrado descontado. En PESOS. */
export interface CobroPlaneado {
  id: string;
  nombre: string;
  monto: number;
  /** AAAA-MM-DD. */
  fecha: string;
}

/** Un compromiso con proveedor que falta pagar, con fecha. En PESOS. */
export interface CompromisoPlaneado {
  id: string;
  nombre: string;
  monto: number;
  /** AAAA-MM-DD. */
  fecha: string;
}

export interface Fuentes {
  opex: Opex[];
  nomina?: { programa: ProgramaDeNomina | null; borradores: BorradorDeRaya[] } | null;
  ordenes?: OrdenPlaneada[] | null;
  cobros?: CobroPlaneado[] | null;
  compromisos?: CompromisoPlaneado[] | null;
}

/* ─────────────── los compromisos con proveedores ───────────────
 *
 * Mike, 6-oct: «el costo de cada fase, así de ahí se pobla la lista de
 * compromisos de gastos en el proyecto para la proyección del flujo». Cada
 * partida del proyecto (acordado − pagado) es un gasto que falta. Las que
 * nacen del cronograma traen `fecha_esperada`; las capturadas a mano, no, y
 * quedan SIN FECHA: se dice cuánto suman. Una orden de compra pendiente que
 * ya apunta a la partida (`partida_id`) es parte de ese mismo dinero y entra
 * por su lado, así que se le resta a la partida para no contarlo dos veces. */

export interface PartidaParaPagar {
  id: string;
  proyecto_nombre: string;
  proveedor_nombre: string | null;
  concepto: string | null;
  /** En PESOS. */
  monto_acordado: number;
  /** En PESOS. */
  monto_pagado: number;
  fecha_esperada: string | null;
}

export interface CompromisosDeProyectos {
  compromisos: CompromisoPlaneado[];
  /** Lo que falta pagar de partidas sin fecha. En PESOS. */
  sin_fecha: number;
  cuantos_sin_fecha: number;
}

export function compromisosDeProyectos(partidas: PartidaParaPagar[], ordenesPendientes: Array<{ partida_id: string | null; monto: number }> = []): CompromisosDeProyectos {
  const enOrdenes = new Map<string, number>();
  for (const o of ordenesPendientes) if (o.partida_id) enOrdenes.set(o.partida_id, (enOrdenes.get(o.partida_id) ?? 0) + o.monto);
  const compromisos: CompromisoPlaneado[] = [];
  let sin_fecha = 0;
  let cuantos_sin_fecha = 0;
  for (const p of partidas) {
    const falta = Math.round((p.monto_acordado - p.monto_pagado - (enOrdenes.get(p.id) ?? 0)) * 100) / 100;
    if (falta <= 0) continue;
    const nombre = `${p.proyecto_nombre} · ${p.concepto || p.proveedor_nombre || "Compromiso"}${p.concepto && p.proveedor_nombre ? ` (${p.proveedor_nombre})` : ""}`;
    if (p.fecha_esperada) compromisos.push({ id: p.id, nombre, monto: falta, fecha: p.fecha_esperada });
    else { sin_fecha += falta; cuantos_sin_fecha += 1; }
  }
  sin_fecha = Math.round(sin_fecha * 100) / 100;
  return { compromisos: compromisos.sort((a, b) => a.fecha.localeCompare(b.fecha)), sin_fecha, cuantos_sin_fecha };
}

/* ─────────────── los cobros de proyectos ─────────────── */

export interface ProyectoParaCobrar {
  id: string;
  nombre: string;
  /** En PESOS. */
  precio_venta: number;
  /** En PESOS. */
  cobrado: number;
}

export interface ParcialidadParaCobrar {
  id: string;
  proyecto_id: string;
  concepto: string;
  fecha: string;
  /** En PESOS. */
  monto: number;
}

export interface CobrosDeProyectos {
  cobros: CobroPlaneado[];
  /** Lo que los proyectos tienen por cobrar y ningún plan fecha. En PESOS. */
  sin_fecha: number;
  /** Cuántos proyectos con saldo por cobrar no tienen plan completo. */
  proyectos_sin_fecha: number;
}

/** Lo cobrado se descuenta de las parcialidades EN ORDEN DE FECHA: la
 *  primera se da por cobrada antes que la última. Lo que sobra de cada una
 *  es el cobro que falta. Un proyecto cobrado de más no genera cobros
 *  negativos ni resta: simplemente ya no tiene nada pendiente. */
export function cobrosDeProyectos(proyectos: ProyectoParaCobrar[], plan: ParcialidadParaCobrar[]): CobrosDeProyectos {
  const cobros: CobroPlaneado[] = [];
  let sin_fecha = 0;
  let proyectos_sin_fecha = 0;
  for (const p of proyectos) {
    const suyas = plan.filter((x) => x.proyecto_id === p.id).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
    let cobrado = Math.max(0, p.cobrado);
    let pendientePlaneado = 0;
    for (const x of suyas) {
      const aplicado = Math.min(cobrado, x.monto);
      cobrado -= aplicado;
      const resto = Math.round((x.monto - aplicado) * 100) / 100;
      if (resto <= 0) continue;
      pendientePlaneado += resto;
      cobros.push({ id: x.id, nombre: `${p.nombre} · ${x.concepto || "Parcialidad"}`, monto: resto, fecha: x.fecha });
    }
    const porCobrar = Math.max(0, p.precio_venta - Math.max(0, p.cobrado));
    const sinPlan = Math.round((porCobrar - pendientePlaneado) * 100) / 100;
    if (sinPlan > 0) { sin_fecha += sinPlan; proyectos_sin_fecha += 1; }
  }
  sin_fecha = Math.round(sin_fecha * 100) / 100;
  return { cobros: cobros.sort((a, b) => a.fecha.localeCompare(b.fecha)), sin_fecha, proyectos_sin_fecha };
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

  for (const cb of fuentes.cobros ?? []) {
    const f = delDiaLocal(cb.fecha);
    if (f > hasta) continue;
    const vencido = f < desde;
    salida.push({ clase: "cobro", id: cb.id, nombre: cb.nombre, tipo: "ingreso", monto: cb.monto, fecha: vencido ? new Date(desde) : f, vencido });
  }

  for (const cp of fuentes.compromisos ?? []) {
    const f = delDiaLocal(cp.fecha);
    if (f > hasta) continue;
    const vencido = f < desde;
    salida.push({ clase: "compromiso", id: cp.id, nombre: cp.nombre, tipo: "egreso", monto: cp.monto, fecha: vencido ? new Date(desde) : f, vencido });
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
