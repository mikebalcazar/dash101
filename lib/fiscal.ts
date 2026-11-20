/* Contabilidad fiscal · contrato 0.21.0 de la suite.
 *
 * LA IDEA, y decide todo lo demás: **no hay dos contabilidades**. Hay una
 * sola lista de movimientos y cada uno dice si es fiscal. La real es todo; la
 * fiscal es la misma lista filtrada por «facturado». Por eso aquí no hay
 * ninguna tabla paralela de pagos: sólo se le cuelgan facturas a movimientos
 * que ya existen.
 *
 * DINERO: la API guarda centavos enteros y estas pantallas pintan pesos. La
 * conversión vive AQUÍ, en un solo lugar, igual que en `lib/ordenes.ts`.
 *
 * TASAS: `tasa_iva` viaja en PUNTOS BASE (1600 = 16.00 %) para que no haya
 * decimales en la base. A la pantalla se le dan por ciento.
 */

import { aCentavos, aPesos } from './api/adaptar';
import { pedir } from './api/cliente';
import { apiBase, org } from './fuente';

const base = () => `/orgs/${org()}/fiscal`;

/* ─────────────── el IVA del mes ─────────────── */

export interface IvaDelMes {
  desde: string;
  hasta: string;
  /** IVA que le cobraste a clientes. En PESOS. */
  trasladado: number;
  /** IVA que les pagaste a proveedores. En PESOS. */
  acreditable: number;
  /** En PESOS. */
  retenciones: number;
  /** Trasladado − acreditable − retenciones. En PESOS. Es lo que decide
   *  cuánto se entera; negativo quiere decir saldo a favor. */
  a_enterar: number;
  facturas: { emitidas: number; recibidas: number; canceladas: number };
}

export async function getIva(rango: Rango): Promise<IvaDelMes> {
  const r = await pedir<IvaDelMes>(`${base()}/iva${query(rango)}`);
  return {
    ...r,
    trasladado: aPesos(r.trasladado),
    acreditable: aPesos(r.acreditable),
    retenciones: aPesos(r.retenciones),
    a_enterar: aPesos(r.a_enterar),
  };
}

/* ─────────────── lo facturado contra lo real ─────────────── */

export interface LadoDelCuadre {
  /** Todo lo que se movió. En PESOS. */
  total: number;
  /** Lo que está facturado. En PESOS. */
  facturado: number;
  /** La diferencia: lo que anda fuera. En PESOS. */
  fuera: number;
}

export interface Cuadre {
  desde: string;
  hasta: string;
  ingresos: LadoDelCuadre;
  egresos: LadoDelCuadre;
}

export async function getCuadre(rango: Rango): Promise<Cuadre> {
  const r = await pedir<Cuadre>(`${base()}/cuadre${query(rango)}`);
  const lado = (l: LadoDelCuadre): LadoDelCuadre => ({
    total: aPesos(l.total), facturado: aPesos(l.facturado), fuera: aPesos(l.fuera),
  });
  return { ...r, ingresos: lado(r.ingresos), egresos: lado(r.egresos) };
}

/* ─────────────── pendientes de factura ───────────────
 * Los pagos de órdenes marcadas «con factura» cuyo CFDI todavía no llega. Es
 * la lista que hay que perseguir cada mes, y por eso trae el folio de la
 * orden y el proveedor: sin ellos no se sabe a quién marcarle. */

export interface PendienteDeFactura {
  id: string;
  fecha: string;
  /** En PESOS. */
  monto: number;
  /** `ingreso` es un cobro al cliente que falta facturar; `egreso`, un pago
   *  a proveedor cuya factura no ha llegado. El tipo importa más de lo que
   *  parece: decide si el IVA de esa factura es trasladado o acreditable. */
  tipo: 'ingreso' | 'egreso';
  descripcion: string | null;
  contraparte_nombre: string | null;
  orden_folio: string | null;
  orden_proveedor: string | null;
}

/** Lo que falta facturar. Sin `tipo` vienen los dos lados (contrato 0.25.0);
 *  hasta entonces sólo podían venir egresos, porque la espera de la factura
 *  se leía de la orden de compra y un cobro no tiene orden. */
export async function listPendientes(
  tipo?: 'ingreso' | 'egreso',
): Promise<PendienteDeFactura[]> {
  const q = new URLSearchParams();
  if (tipo) q.set('tipo', tipo);
  const s = q.toString();
  const r = await pedir<{ filas: (Omit<PendienteDeFactura, 'monto'> & { monto: number })[] }>(
    `${base()}/pendientes${s ? '?' + s : ''}`,
  );
  return r.filas.map((f) => ({ ...f, monto: aPesos(f.monto) }));
}

/* ─────────────── las facturas ─────────────── */

export type TipoCfdi = 'ingreso' | 'egreso';
export type EstadoCfdi = 'vigente' | 'cancelada';

export interface Cfdi {
  id: string;
  /** El folio fiscal del SAT. Único por empresa. */
  uuid: string;
  rfc: string | null;
  razon_social: string | null;
  tipo: TipoCfdi;
  /** En PESOS. */
  subtotal: number;
  iva: number;
  retenciones: number;
  total: number;
  fecha: string;
  forma_pago: string | null;
  estado: EstadoCfdi;
  cancelada_at: string | null;
  creado_at: string;
}

interface FilaCfdi extends Omit<Cfdi, 'subtotal' | 'iva' | 'retenciones' | 'total'> {
  subtotal: number; iva: number; retenciones: number; total: number;
}

const cfdiDePesos = (f: FilaCfdi): Cfdi => ({
  ...f,
  subtotal: aPesos(f.subtotal), iva: aPesos(f.iva),
  retenciones: aPesos(f.retenciones), total: aPesos(f.total),
});

export interface CfdiInput {
  uuid: string;
  tipo: TipoCfdi;
  rfc?: string | null;
  razon_social?: string | null;
  /** En PESOS, tal como se teclean. */
  subtotal: number | string;
  iva: number | string;
  retenciones?: number | string;
  total: number | string;
  fecha: string;
  forma_pago?: string | null;
}

export async function listCfdi(
  rango: Rango, filtros: { tipo?: TipoCfdi; estado?: EstadoCfdi } = {},
): Promise<Cfdi[]> {
  const q = new URLSearchParams(parametros(rango));
  if (filtros.tipo) q.set('tipo', filtros.tipo);
  if (filtros.estado) q.set('estado', filtros.estado);
  const s = q.toString();
  const r = await pedir<{ filas: FilaCfdi[] }>(`${base()}/cfdi${s ? '?' + s : ''}`);
  return r.filas.map(cfdiDePesos);
}

export async function crearCfdi(d: CfdiInput): Promise<Cfdi> {
  return cfdiDePesos(await pedir<FilaCfdi>(`${base()}/cfdi`, {
    method: 'POST',
    body: {
      uuid: d.uuid.trim(), tipo: d.tipo,
      rfc: d.rfc || null, razon_social: d.razon_social || null,
      subtotal: aCentavos(d.subtotal), iva: aCentavos(d.iva),
      retenciones: aCentavos(d.retenciones ?? 0), total: aCentavos(d.total),
      fecha: d.fecha, forma_pago: d.forma_pago || null,
    },
  }));
}

/** Colgarle a la factura un pago que ya existía, que es el caso normal: la
 *  factura casi siempre llega DESPUÉS del pago. Sin `monto_aplicado`, la API
 *  aplica lo que quepa. */
export async function ligarCfdi(cfdi_id: string, movimiento_id: string, montoPesos?: number | string) {
  const cuerpo: Record<string, unknown> = { movimiento_id };
  if (montoPesos !== undefined && montoPesos !== '') cuerpo.monto_aplicado = aCentavos(montoPesos);
  const r = await pedir<{ ok: true; cfdi: FilaCfdi; movimiento: { id: string; facturado: boolean }; aplicado_total: number }>(
    `${base()}/cfdi/${cfdi_id}/ligar`, { method: 'POST', body: cuerpo },
  );
  return { ...r, cfdi: cfdiDePesos(r.cfdi), aplicado_total: aPesos(r.aplicado_total) };
}

/* ─────────────── las facturas de un pago (0.107.0) ───────────────
 *
 * Mike, 18-nov-2026: «NECESITO PODER LIGAR LOS PAGOS CARGADOS NUEVOS CON LAS
 * FACTURAS EXISTENTES. Así poder ver la factura o el movimiento en detalle si
 * doy clic sobre él. Esto dentro del estado de cuenta de un proyecto.» */

export interface FacturaDeUnPago extends Cfdi {
  serie: string | null;
  folio: string | null;
  tiene_xml: boolean;
  /** En PESOS: cuánto de ESTE pago cubre. */
  monto_aplicado: number;
}

export interface FacturaPosible extends Cfdi {
  serie: string | null;
  folio: string | null;
  tiene_xml: boolean;
  /** En PESOS: lo que le falta por ligar a la factura. */
  restante: number;
  /** En PESOS: lo que se le aplicaría a este pago al ligarla. */
  aplica: number;
  /** Es del RFC del cliente del proyecto. */
  mismo_rfc: boolean;
  /** Días entre la factura y el pago. */
  dias: number;
}

export interface FacturasDelPago {
  /** En PESOS. `falta`: lo del pago que ninguna factura cubre todavía. */
  movimiento: { id: string; monto: number; subtotal: number; iva: number; facturado: boolean; falta: number };
  ligadas: FacturaDeUnPago[];
  posibles: FacturaPosible[];
}

export async function facturasDelPago(movimiento_id: string): Promise<FacturasDelPago> {
  const r = await pedir<{ movimiento: Record<string, any>; ligadas: Array<Record<string, any>>; posibles: Array<Record<string, any>> }>(
    `${base()}/movimientos/${encodeURIComponent(movimiento_id)}/facturas`,
  );
  const comun = (f: Record<string, any>) => ({
    ...cfdiDePesos(f as FilaCfdi), serie: f.serie ?? null, folio: f.folio ?? null, tiene_xml: Boolean(f.tiene_xml),
  });
  return {
    movimiento: {
      id: String(r.movimiento.id), monto: aPesos(r.movimiento.monto), subtotal: aPesos(r.movimiento.subtotal ?? r.movimiento.monto),
      iva: aPesos(r.movimiento.iva), facturado: Boolean(r.movimiento.facturado), falta: aPesos(r.movimiento.falta),
    },
    ligadas: r.ligadas.map((f) => ({ ...comun(f), monto_aplicado: aPesos(f.monto_aplicado) })),
    posibles: r.posibles.map((f) => ({
      ...comun(f), restante: aPesos(f.restante), aplica: aPesos(f.aplica), mismo_rfc: Boolean(f.mismo_rfc), dias: Number(f.dias ?? 0),
    })),
  };
}

/* ─────────────── buscar la factura de un pago que se captura (0.112.0) ───────────────
 *
 * Mike, 19-nov-2026, en el formulario del movimiento: «agregar la opción de
 * buscar factura y que revise en los CFDIs si alguno coincide o está cerca y
 * los sugiera». */

export interface FacturaSugerida extends Cfdi {
  serie: string | null;
  folio: string | null;
  /** En PESOS: lo que le falta por ligar a la factura. */
  restante: number;
  /** En PESOS: cuánto se aleja del monto capturado (contra lo que le falta). */
  diferencia: number;
  /** `exacto`: el monto es lo que le falta o su total. `sin_iva`: el monto es
   *  su subtotal (se capturó sin IVA). `cerca`: a 10 % o menos. */
  coincide: 'exacto' | 'sin_iva' | 'cerca' | null;
  mismo_rfc: boolean;
  dias: number;
}

export async function facturasSugeridas(q: { tipo: TipoCfdi; monto: number; fecha?: string; cliente_id?: string; proyecto_id?: string; movimiento_id?: string }): Promise<FacturaSugerida[]> {
  const p = new URLSearchParams({ tipo: q.tipo, monto: String(aCentavos(q.monto)) });
  if (q.fecha) p.set('fecha', q.fecha);
  if (q.cliente_id) p.set('cliente_id', q.cliente_id);
  if (q.proyecto_id) p.set('proyecto_id', q.proyecto_id);
  if (q.movimiento_id) p.set('movimiento_id', q.movimiento_id);
  const r = await pedir<{ facturas: Array<Record<string, any>> }>(`${base()}/facturas-sugeridas?${p}`);
  return r.facturas.map((f) => ({
    ...cfdiDePesos(f as FilaCfdi), serie: f.serie ?? null, folio: f.folio ?? null,
    restante: aPesos(f.restante), diferencia: aPesos(f.diferencia), coincide: f.coincide ?? null,
    mismo_rfc: Boolean(f.mismo_rfc), dias: Number(f.dias ?? 0),
  }));
}

/** Quitar una liga equivocada: el pago vuelve a estar sin esa factura y la
 *  API le reparte otra vez su IVA. */
export const desligarCfdi = (cfdi_id: string, movimiento_id: string) =>
  pedir(`${base()}/cfdi/${encodeURIComponent(cfdi_id)}/desligar`, { method: 'POST', body: { movimiento_id } });

/** El XML de una factura que entró leída de su archivo. Una liga y no un
 *  fetch: el navegador lo baja con la sesión. */
export const ligaDelXml = (cfdi_id: string) => `${apiBase()}/orgs/${org()}/fiscal/cfdi/${encodeURIComponent(cfdi_id)}/xml`;

/** Una factura cancelada no se borra: sale del IVA del mes y se queda a la
 *  vista. Borrarla dejaría un hueco que nadie sabe explicar tres meses
 *  después. */
export const cancelarCfdi = (id: string) =>
  pedir<FilaCfdi>(`${base()}/cfdi/${id}/cancelar`, { method: 'POST' }).then(cfdiDePesos);

/** Marcar un movimiento como facturado con su desglose, sin capturar el CFDI
 *  completo. Es la puerta rápida para lo que ya trae factura de antes. */
export async function marcarFacturado(
  movimiento_id: string,
  d: { facturado?: boolean; subtotal?: number | string; iva?: number | string; retenciones?: number | string;
       uuid_cfdi?: string; fecha_cfdi?: string; forma_pago?: string } = {},
) {
  const cuerpo: Record<string, unknown> = { facturado: d.facturado !== false };
  if (d.subtotal !== undefined) cuerpo.subtotal = aCentavos(d.subtotal);
  if (d.iva !== undefined) cuerpo.iva = aCentavos(d.iva);
  if (d.retenciones !== undefined) cuerpo.retenciones = aCentavos(d.retenciones);
  for (const k of ['uuid_cfdi', 'fecha_cfdi', 'forma_pago'] as const) if (d[k]) cuerpo[k] = d[k];
  return pedir<{ id: string; facturado: boolean }>(`${base()}/movimientos/${movimiento_id}/facturado`, {
    method: 'POST', body: cuerpo,
  });
}

/* ─────────────── el rango ───────────────
 * `mes` lo resuelve el servidor a propósito: los meses de 28, 30 y 31 días
 * son justo donde se equivoca un cálculo hecho en el navegador. */

export type Rango = { mes: string } | { desde: string; hasta: string };

function parametros(r: Rango): Record<string, string> {
  return 'mes' in r ? { mes: r.mes } : { desde: r.desde, hasta: r.hasta };
}
function query(r: Rango): string {
  return `?${new URLSearchParams(parametros(r)).toString()}`;
}

/** El mes de hoy, en `AAAA-MM`, por día local. */
export function mesDeHoy(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Los últimos doce meses, del más reciente al más viejo, para el selector. */
export function ultimosMeses(cuantos = 12, desde = new Date()): string[] {
  const salida: string[] = [];
  const d = new Date(desde.getFullYear(), desde.getMonth(), 1);
  for (let i = 0; i < cuantos; i++) {
    salida.push(mesDeHoy(d));
    d.setMonth(d.getMonth() - 1);
  }
  return salida;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** `2026-09` → «septiembre de 2026». */
export function nombreDelMes(ym: string): string {
  const [a, m] = ym.split('-').map(Number);
  return `${MESES[(m || 1) - 1]} de ${a}`;
}

/** El aviso que Mike pidió ver en la pantalla, escrito una sola vez para que
 *  diga lo mismo en las cuatro. */
export const AVISO_FISCAL =
  'Esto ordena la información fiscal: no presenta declaraciones ni sustituye al contador. Los números salen de lo que se capture aquí.';
