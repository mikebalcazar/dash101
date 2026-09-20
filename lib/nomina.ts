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
  negocio_id: string;
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

export async function listRayas(negocio_id: string): Promise<Raya[]> {
  const r = await pedir<{ rayas: Record<string, unknown>[] }>(`${base()}/rayas?negocio_id=${encodeURIComponent(negocio_id)}`);
  return r.rayas.map(enPesos);
}

export async function getRaya(id: string): Promise<{ raya: Raya; pagos: PagoDeRaya[] }> {
  const r = await pedir<{ raya: Record<string, unknown>; pagos: Record<string, unknown>[] }>(`${base()}/rayas/${encodeURIComponent(id)}`);
  return { raya: enPesos(r.raya), pagos: r.pagos.map(pagoEnPesos) };
}

export async function crearRaya(d: {
  negocio_id: string; periodo_inicio: string; periodo_fin: string; nota?: string; pagos?: RenglonDeRaya[];
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
