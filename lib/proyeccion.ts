import { Timestamp } from "firebase/firestore";
import type { Opex } from "@/types/schema";

export interface SemanaProyeccion {
  index: number;
  fecha_inicio: Date; // Lunes de la semana
  fecha_fin: Date; // Domingo
  ingresos: number;
  egresos: number;
  neto: number; // ingresos - egresos
  saldo_final: number;
  detalles: { opex_id: string; nombre: string; monto: number; tipo: "ingreso" | "egreso" }[];
}

export interface ProyeccionOpts {
  semanas?: number; // default 52
  fecha_base?: Date; // default hoy
}

/**
 * Devuelve el lunes de la semana de la fecha dada (00:00:00).
 */
function lunesDeSemana(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const day = r.getDay(); // 0=domingo, 1=lunes ... 6=sábado
  const diff = day === 0 ? -6 : 1 - day; // dias hasta lunes
  r.setDate(r.getDate() + diff);
  return r;
}

function opexOcurreEn(fecha: Date, opex: Opex): boolean {
  const inicioTs = opex.fecha_inicio as Timestamp;
  const finTs = opex.fecha_fin as Timestamp | null | undefined;
  const inicio = inicioTs?.toDate ? inicioTs.toDate() : null;
  const fin = finTs?.toDate ? finTs.toDate() : null;

  if (!inicio) return false;
  const inicioMidnight = new Date(inicio);
  inicioMidnight.setHours(0, 0, 0, 0);
  const finMidnight = fin ? new Date(fin) : null;
  if (finMidnight) finMidnight.setHours(0, 0, 0, 0);

  if (fecha < inicioMidnight) return false;
  if (finMidnight && fecha > finMidnight) return false;

  switch (opex.frecuencia) {
    case "semanal":
      return fecha.getDay() === (opex.dia_semana ?? inicioMidnight.getDay());

    case "mensual": {
      const dia = opex.dia_del_mes ?? inicioMidnight.getDate();
      const diasEnMes = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
      // Auto-ajuste: si mes tiene menos días (ej. día 31 en febrero → 28), usar último día del mes
      const target = Math.min(dia, diasEnMes);
      return fecha.getDate() === target;
    }

    case "anual":
      return (
        fecha.getMonth() === inicioMidnight.getMonth() &&
        fecha.getDate() === inicioMidnight.getDate()
      );

    default:
      return false;
  }
}

/**
 * Cuenta las ocurrencias de un OPEX activo entre dos fechas (inclusive).
 */
function ocurrenciasEntre(opex: Opex, desde: Date, hasta: Date): number {
  if (!opex.activo) return 0;
  const d = new Date(desde);
  d.setHours(0, 0, 0, 0);
  const end = new Date(hasta);
  end.setHours(0, 0, 0, 0);
  let count = 0;
  while (d <= end) {
    if (opexOcurreEn(d, opex)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/**
 * Proyecta el flujo de caja a N semanas partiendo del saldo actual.
 * Semana 0 = semana que contiene la fecha_base.
 */
export function proyectarFlujo(
  saldoInicial: number,
  opexes: Opex[],
  opts?: ProyeccionOpts
): SemanaProyeccion[] {
  const semanas = opts?.semanas ?? 52;
  const base = opts?.fecha_base ?? new Date();
  const lunesBase = lunesDeSemana(base);

  const result: SemanaProyeccion[] = [];
  let saldoAcumulado = saldoInicial;

  for (let i = 0; i < semanas; i++) {
    const inicio = new Date(lunesBase);
    inicio.setDate(inicio.getDate() + i * 7);
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 6);
    fin.setHours(23, 59, 59, 999);

    let ingresos = 0;
    let egresos = 0;
    const detalles: SemanaProyeccion["detalles"] = [];

    opexes.forEach((opex) => {
      const n = ocurrenciasEntre(opex, inicio, fin);
      if (n === 0) return;
      const total = opex.monto * n;
      if (opex.tipo === "ingreso") {
        ingresos += total;
      } else {
        egresos += total;
      }
      detalles.push({
        opex_id: opex.id!,
        nombre: opex.nombre,
        monto: total,
        tipo: opex.tipo,
      });
    });

    const neto = ingresos - egresos;
    saldoAcumulado += neto;

    result.push({
      index: i,
      fecha_inicio: inicio,
      fecha_fin: fin,
      ingresos,
      egresos,
      neto,
      saldo_final: saldoAcumulado,
      detalles,
    });
  }

  return result;
}

/**
 * Encuentra la primera semana donde el saldo cae bajo un umbral.
 * Retorna null si nunca cae.
 */
export function primeraSemanaBajaUmbral(
  proyeccion: SemanaProyeccion[],
  umbral: number = 0
): SemanaProyeccion | null {
  return proyeccion.find((s) => s.saldo_final < umbral) ?? null;
}
