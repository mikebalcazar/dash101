/* La raya, del lado de dash101 · contrato 0.27.0 de la suite.
 *
 * Mike, 20-sep: «pon en la fila un administrador de nóminas», y escogió el
 * alcance —pagos de raya y recibos, no nómina calculada— y el lugar: aquí
 * dentro, con permiso aparte.
 *
 * EL DINERO VIAJA EN CENTAVOS con la API y se pinta en pesos en la pantalla.
 * Este módulo hace esa conversión en un solo lugar, igual que `lib/ordenes.ts`
 * y por la misma razón: dividir entre cien en tres pantallas distintas es
 * dividir mal en una de las tres.
 */

import { pedir } from './api/cliente';
import { org } from './fuente';

const base = () => `/orgs/${org()}/nomina`;

const aPesos = (centavos: number) => Math.round(centavos) / 100;
const aCentavos = (pesos: number) => Math.round(pesos * 100);

export interface EncargadoDeNomina {
  usuario_id: string;
  correo: string;
  nombre: string;
  rol: string;
  personal_id: string | null;
  es_nominas: boolean;
}

export interface GenteDeRaya {
  id: string;
  nombre: string;
  puesto: string;
}

export interface PagoDeRaya {
  id: string;
  personal_id: string;
  /** Congelado el día del pago: un recibo dice a quién se le pagó ESE día. */
  nombre: string;
  concepto: string;
  /** Todo en PESOS de aquí para adelante. */
  sueldo: number;
  extras: number;
  descuentos: number;
  neto: number;
  nota: string;
  movimiento_id: string | null;
  recibido_at: string | null;
}

export interface Raya {
  id: string;
  periodo_inicio: string;
  periodo_fin: string;
  cuenta_id: string | null;
  cuenta_nombre: string | null;
  estado: 'borrador' | 'pagada' | 'cancelada';
  /** En PESOS. Lo suma el servidor, nunca la pantalla. */
  total: number;
  nota: string;
  personas?: number;
  pagada_at: string | null;
  creado_at: string;
}

/** Un renglón tal como lo captura la pantalla, en PESOS. */
export interface RenglonDeRaya {
  personal_id: string;
  concepto?: string;
  sueldo?: number;
  extras?: number;
  descuentos?: number;
  nota?: string;
}

const enPesos = (r: Record<string, unknown>): Raya => ({
  ...(r as unknown as Raya),
  total: aPesos(Number(r.total ?? 0)),
});

const pagoEnPesos = (p: Record<string, unknown>): PagoDeRaya => ({
  ...(p as unknown as PagoDeRaya),
  sueldo: aPesos(Number(p.sueldo ?? 0)),
  extras: aPesos(Number(p.extras ?? 0)),
  descuentos: aPesos(Number(p.descuentos ?? 0)),
  neto: aPesos(Number(p.neto ?? 0)),
});

const enCentavos = (pagos: RenglonDeRaya[]) =>
  pagos.map((p) => ({
    personal_id: p.personal_id,
    concepto: p.concepto,
    sueldo: aCentavos(p.sueldo ?? 0),
    extras: aCentavos(p.extras ?? 0),
    descuentos: aCentavos(p.descuentos ?? 0),
    nota: p.nota,
  }));

/* ─────────────── quién puede ─────────────── */

export async function listEncargados(): Promise<EncargadoDeNomina[]> {
  return (await pedir<{ gente: EncargadoDeNomina[] }>(`${base()}/encargados`)).gente;
}

export async function marcarEncargado(quien: { usuario_id?: string; personal_id?: string }, valor: boolean): Promise<void> {
  await pedir(`${base()}/encargados`, { method: 'POST', body: { ...quien, valor } });
}

/* ─────────────── la gente ─────────────── */

export async function listGente(): Promise<GenteDeRaya[]> {
  return (await pedir<{ gente: GenteDeRaya[] }>(`${base()}/gente`)).gente;
}

export async function crearGente(nombre: string, puesto = ''): Promise<GenteDeRaya> {
  return (await pedir<{ persona: GenteDeRaya }>(`${base()}/gente`, { method: 'POST', body: { nombre, puesto } })).persona;
}

/* ─────────────── los cortes ─────────────── */

export async function listRayas(): Promise<Raya[]> {
  const r = await pedir<{ rayas: Record<string, unknown>[] }>(`${base()}/rayas`);
  return r.rayas.map(enPesos);
}

export async function getRaya(id: string): Promise<{ raya: Raya; pagos: PagoDeRaya[] }> {
  const r = await pedir<{ raya: Record<string, unknown>; pagos: Record<string, unknown>[] }>(`${base()}/rayas/${encodeURIComponent(id)}`);
  return { raya: enPesos(r.raya), pagos: r.pagos.map(pagoEnPesos) };
}

export async function crearRaya(d: {
  periodo_inicio: string; periodo_fin: string; nota?: string; pagos?: RenglonDeRaya[];
}): Promise<{ raya: Raya; pagos: PagoDeRaya[] }> {
  const r = await pedir<{ raya: Record<string, unknown>; pagos: Record<string, unknown>[] }>(`${base()}/rayas`, {
    method: 'POST',
    body: { ...d, pagos: enCentavos(d.pagos ?? []) },
  });
  return { raya: enPesos(r.raya), pagos: r.pagos.map(pagoEnPesos) };
}

export async function editarRaya(id: string, d: {
  periodo_inicio?: string; periodo_fin?: string; nota?: string; pagos?: RenglonDeRaya[];
}): Promise<{ raya: Raya; pagos: PagoDeRaya[] }> {
  const cuerpo: Record<string, unknown> = { ...d };
  if (d.pagos) cuerpo.pagos = enCentavos(d.pagos);
  const r = await pedir<{ raya: Record<string, unknown>; pagos: Record<string, unknown>[] }>(`${base()}/rayas/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: cuerpo,
  });
  return { raya: enPesos(r.raya), pagos: r.pagos.map(pagoEnPesos) };
}

/** Pagar deja UN EGRESO POR PERSONA. No se puede deshacer desde aquí: ese
 *  dinero ya salió, y lo que se corrige después es el movimiento. */
export async function pagarRaya(id: string, cuenta_id: string, fecha?: string): Promise<{ raya: Raya; pagos: PagoDeRaya[] }> {
  const r = await pedir<{ raya: Record<string, unknown>; pagos: Record<string, unknown>[] }>(`${base()}/rayas/${encodeURIComponent(id)}/pagar`, {
    method: 'POST', body: { cuenta_id, fecha },
  });
  return { raya: enPesos(r.raya), pagos: r.pagos.map(pagoEnPesos) };
}

export async function cancelarRaya(id: string): Promise<Raya> {
  const r = await pedir<{ raya: Record<string, unknown> }>(`${base()}/rayas/${encodeURIComponent(id)}/cancelar`, { method: 'POST' });
  return enPesos(r.raya);
}

/** Firmó de recibido, o se desmarca porque se palomeó por error. */
export async function marcarRecibido(pago_id: string, recibido: boolean): Promise<PagoDeRaya> {
  const r = await pedir<{ pago: Record<string, unknown> }>(`${base()}/pagos/${encodeURIComponent(pago_id)}/recibido`, {
    method: 'POST', body: { recibido },
  });
  return pagoEnPesos(r.pago);
}

/* ─────────────── la nómina programada (contrato 0.71.0) ───────────────
 *
 * Mike, 6-oct: «hay que ver en nómina el programar la nómina para que
 * también se considere en los gastos para proyectar los flujos».
 *
 * Es UNA por empresa: cada cuánto se paga, qué día y cuánto suele ser. No
 * es un corte ni mueve dinero: el flujo proyectado la pone como gasto en
 * cada fecha de pago futura. Mismo permiso que la raya: si la API contesta
 * 403, el flujo lo dice y sigue sin ella. En PESOS de este lado. */

export type FrecuenciaDeNomina = 'semanal' | 'quincenal' | 'mensual';

export interface ProgramaDeNomina {
  activo: boolean;
  frecuencia: FrecuenciaDeNomina;
  /** 0 domingo … 6 sábado; sólo con 'semanal'. */
  dia_semana: number | null;
  /** 1–31; sólo con 'mensual'. La quincenal paga el 15 y el último del mes. */
  dia_del_mes: number | null;
  /** En PESOS: lo que suele costar cada pago. */
  monto: number;
  nota: string;
  actualizado_at: string | null;
}

/** Un corte abierto: ya tiene total y fecha, la proyección lo usa tal cual. */
export interface BorradorDeRaya {
  id: string;
  periodo_inicio: string;
  periodo_fin: string;
  /** En PESOS. */
  total: number;
}

export interface NominaProgramada {
  programa: ProgramaDeNomina | null;
  /** En PESOS: el último corte pagado, para proponerlo como estimación. */
  ultimo_total: number | null;
  borradores: BorradorDeRaya[];
}

export async function getProgramaNomina(): Promise<NominaProgramada> {
  const r = await pedir<{
    programa: (Omit<ProgramaDeNomina, 'monto'> & { monto: number }) | null;
    ultimo_total: number | null;
    borradores: Array<Omit<BorradorDeRaya, 'total'> & { total: number }>;
  }>(`${base()}/programa`);
  return {
    programa: r.programa ? { ...r.programa, monto: aPesos(r.programa.monto) } : null,
    ultimo_total: r.ultimo_total === null ? null : aPesos(r.ultimo_total),
    borradores: r.borradores.map((b) => ({ ...b, total: aPesos(b.total) })),
  };
}

export async function ponerProgramaNomina(p: {
  activo: boolean; frecuencia: FrecuenciaDeNomina; dia_semana?: number | null; dia_del_mes?: number | null;
  /** En PESOS. */
  monto: number; nota?: string;
}): Promise<ProgramaDeNomina> {
  const r = await pedir<{ programa: Omit<ProgramaDeNomina, 'monto'> & { monto: number } }>(`${base()}/programa`, {
    method: 'PUT',
    body: { ...p, monto: aCentavos(p.monto) },
  });
  return { ...r.programa, monto: aPesos(r.programa.monto) };
}

export const DIAS_DE_LA_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_EN_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

/** Cómo se dice el programa en una línea: «cada semana, los sábados». */
export function describirPrograma(p: ProgramaDeNomina): string {
  switch (p.frecuencia) {
    case 'semanal': return `cada semana, los ${DIAS_EN_PLURAL[p.dia_semana ?? 6]}`;
    case 'quincenal': return 'cada quincena, el 15 y el último día del mes';
    case 'mensual': return `cada mes, el día ${p.dia_del_mes ?? 1}`;
  }
}

/* ─────────────── los expedientes de roster101 (contrato 0.32.0) ───────────────
 *
 * Mike, 20-sep: «en la sección de raya de dash debo poder escoger a quién se
 * le paga de la lista de los trabajadores en roster101, no en la de dash. Y
 * de agregar las personas a las que se les realiza el pago».
 *
 * Son dos listas y las dos hacen falta: el EXPEDIENTE es quién es la persona
 * —la llena roster101 y la llena ella misma desde su celular—, y `personal`
 * es a quién le toca algo en la suite. La raya se arma con la primera y paga
 * contra la segunda; escoger a alguien le abre su lugar, ligado.
 */

export interface TrabajadorDeRoster {
  id: string;
  /** Si todavía no llena su ficha, sale con su correo: hay que poder
   *  distinguirlo para escogerlo. */
  nombre: string;
  puesto: string;
  correo: string;
  /** 'borrador' | 'completo'. */
  expediente: string;
  /** Su lugar en la lista corta, si ya lo tiene. */
  personal_id: string | null;
}

export async function listTrabajadores(): Promise<TrabajadorDeRoster[]> {
  return (await pedir<{ trabajadores: TrabajadorDeRoster[] }>(`${base()}/trabajadores`)).trabajadores;
}

/** Escoger a alguien del expediente para poder pagarle. Devuelve su renglón
 *  de `personal`, el que ya tenía o el que se le acaba de abrir. */
export async function genteDeRoster(roster_id: string): Promise<GenteDeRaya> {
  return (await pedir<{ persona: GenteDeRaya }>(`${base()}/gente/de-roster`, {
    method: 'POST', body: { roster_id },
  })).persona;
}
