/* La conciliación semanal (B1 del backlog, pedida por Mike el 11-sep).
 *
 * Una vez por semana alguien captura cuánto hay de verdad en cada cuenta.
 * dash101 se ajusta a la realidad y guarda la diferencia para siempre: la
 * suma de todas las diferencias es cuánto dinero se escapa del registro.
 *
 * Vive **sólo en la suite**. No se construyó en Firestore a propósito:
 * Firestore se apaga en el corte, y hacerlo en los dos lados sería
 * construirlo dos veces. Con `FUENTE=firestore` cada función lo dice.
 *
 * Como el resto de `lib/`, aquí se habla en **pesos con decimales** y en
 * `Timestamp`; la conversión a centavos la hace el adaptador. */

import * as A from "./api/adaptar";
import { listar, pedir } from "./api/cliente";
import { fuente, org } from "./fuente";
import { listCuentas } from "./cuentas";
import type { Conciliacion, Cuenta, EstadisticaConciliacion, Negocio } from "@/types/schema";
import type { Timestamp } from "firebase/firestore";

function soloApi(): void {
  if (fuente() !== "api") {
    throw new Error("La conciliación semanal vive en la suite, no en Firestore. Se prende con FUENTE=api.");
  }
}

/** El día por omisión es el lunes, como decidió Mike. */
export const DIA_POR_OMISION = 1;

export interface CuentaPorConciliar {
  cuenta: Cuenta;
  /** Lo que dash101 tiene registrado hoy, en pesos. */
  saldo_registrado: number;
}

/** Las cuentas del negocio con el saldo que dash101 cree tener ahora mismo. */
export async function cuentasPorConciliar(negocioId: string): Promise<CuentaPorConciliar[]> {
  soloApi();
  const cuentas = await listCuentas(negocioId);
  return cuentas.map((cuenta) => ({ cuenta, saldo_registrado: cuenta.saldo_actual }));
}

/**
 * Corre el corte. La API calcula el saldo registrado de cada cuenta, guarda
 * la diferencia contra el real y crea los ajustes, todo de una vez: o queda
 * entero o no queda nada.
 *
 * Se mandan **todas** las cuentas del negocio (decisión 5 de Mike); si falta
 * alguna, la API contesta `faltan_cuentas` y no escribe nada.
 */
export async function conciliar(
  negocioId: string,
  saldos: Array<{ cuenta_id: string; saldo_real: number }>,
): Promise<Conciliacion> {
  soloApi();
  const cuerpo = {
    negocio_id: negocioId,
    corte_at: new Date().toISOString(),
    saldos: saldos.map((s) => ({ cuenta_id: s.cuenta_id, saldo_real: A.aCentavos(s.saldo_real) })),
  };
  const r = await pedir<{ conciliacion: A.FilaConciliacion; cuentas: A.FilaConciliacionCuenta[] }>(
    `/orgs/${org()}/conciliaciones`,
    { method: "POST", body: cuerpo },
  );
  const nombres = new Map((await listCuentas(negocioId)).map((c) => [c.id!, c.nombre]));
  return A.conciliacion(r.conciliacion, r.cuentas, nombres);
}

/** Los cortes del negocio, del más reciente al más viejo. */
export async function listConciliaciones(negocioId: string): Promise<Conciliacion[]> {
  soloApi();
  const [filas, renglones, cuentas] = await Promise.all([
    listar<A.FilaConciliacion>("conciliaciones", { negocio_id: negocioId }),
    listar<A.FilaConciliacionCuenta>("conciliacion_cuentas"),
    listCuentas(negocioId),
  ]);
  const nombres = new Map(cuentas.map((c) => [c.id!, c.nombre]));
  return filas
    .map((f) => A.conciliacion(f, renglones, nombres))
    .sort((a, b) => (b.corte_at as Timestamp).toMillis() - (a.corte_at as Timestamp).toMillis());
}

/** Lo que se escapó: por corte, por cuenta y el acumulado. */
export async function estadisticaConciliacion(negocioId: string): Promise<EstadisticaConciliacion> {
  soloApi();
  const d = await pedir<Parameters<typeof A.estadistica>[0]>(
    `/orgs/${org()}/conciliaciones/estadistica?negocio_id=${encodeURIComponent(negocioId)}`,
  );
  return A.estadistica(d);
}

/**
 * ¿Toca conciliar? Sí cuando no hay ningún corte desde la última vez que cayó
 * el día configurado. Si se saltó el lunes, sigue pendiente el martes: la
 * conciliación no se pierde por no hacerla a tiempo.
 */
export function tocaConciliar(negocio: Negocio | null, ultima: Conciliacion | null, hoy = new Date()): boolean {
  if (!negocio) return false;
  const dia = negocio.dia_conciliacion ?? DIA_POR_OMISION;
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  // Cuántos días hay que retroceder para caer en el día configurado.
  desde.setDate(desde.getDate() - ((desde.getDay() - dia + 7) % 7));
  if (!ultima) return true;
  return (ultima.corte_at as Timestamp).toDate() < desde;
}

/** Día de la semana → nombre, para la pantalla. */
export const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
