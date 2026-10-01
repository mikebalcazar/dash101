/* Órdenes de compra · contrato 0.21.0 de la suite.
 *
 * Encargo del chat de dash101 (19-sep-2026). El módulo habla con
 * `/orgs/:o/ordenes/*`, que NO es el CRUD genérico: esas tablas no salen por
 * ahí a propósito, porque un miembro tiene que ver sólo SUS órdenes y ese
 * filtro lo hace el servidor.
 *
 * DINERO: la API guarda centavos enteros; las pantallas de dash101 siempre
 * han trabajado en pesos. La conversión vive AQUÍ y en un solo lugar, igual
 * que en `lib/api/adaptar.ts`. Una pantalla que reciba centavos y los pinte
 * con `formatMonto` enseña cien veces de más, y eso no truena: sólo miente.
 */

import { aCentavos, aPesos } from './api/adaptar';
import { listar, pedir } from './api/cliente';
import { apiBase, org } from './fuente';

export type EstadoOrden = 'en_buzon' | 'devuelta' | 'pagada' | 'rechazada';

/** Contrato 0.47.0 · Una compra se le paga a un proveedor; un reembolso se le
 *  regresa a quien puso el dinero. Mike, 28-sep-2026: «poner una opción en el
 *  tipo de orden si es reembolso o compra». Mismo camino, otro folio (RE-) y
 *  otra categoría en el egreso. */
export type TipoOrden = 'compra' | 'reembolso';

export const TIPO_ORDEN: Record<TipoOrden, string> = {
  compra: 'Compra',
  reembolso: 'Reembolso',
};

export interface Orden {
  id: string;
  folio: string;
  tipo: TipoOrden;
  negocio_id: string;
  solicitante_usuario_id: string;
  solicitante_correo: string | null;
  solicitante_nombre: string | null;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  proyecto_id: string | null;
  partida_id: string | null;
  concepto: string;
  /** En PESOS. */
  monto: number;
  moneda: string;
  con_factura: boolean;
  /** En PESOS. */
  subtotal: number;
  /** En PESOS. */
  iva: number;
  /** Puntos base: 1600 = 16 %. */
  tasa_iva: number;
  fecha_maxima_pago: string | null;
  urgente: boolean;
  estado: EstadoOrden;
  nota_contador: string | null;
  movimiento_id: string | null;
  creado_at: string;
  pagada_at: string | null;
}

export interface EventoOrden {
  id: string;
  que: 'creada' | 'devuelta' | 'corregida' | 'pagada' | 'rechazada' | 'contador';
  quien_nombre: string | null;
  nota: string | null;
  ts: string;
}

export interface ArchivoOrden {
  id: string; nombre: string; mime: string | null; bytes: number | null;
}

export interface Buzon {
  filas: Orden[];
  /** En PESOS. */
  total: number;
  vence_esta_semana: number;
  vencidas: number;
}

export interface Contador {
  usuario_id: string; correo: string; nombre: string;
  rol: string; personal_id: string | null; es_contador: boolean;
}

interface FilaOrden extends Omit<Orden, 'monto' | 'subtotal' | 'iva'> {
  monto: number; subtotal: number; iva: number;
}

const base = () => `/orgs/${org()}/ordenes`;

/** Centavos → pesos, en los tres campos de dinero de una orden. */
const orden = (f: FilaOrden): Orden => ({
  ...f,
  monto: aPesos(f.monto),
  subtotal: aPesos(f.subtotal),
  iva: aPesos(f.iva),
});

/* ─────────────── lo que ve quien pide ─────────────── */

/** Con `negocio_id`, sólo las de ese negocio. dash101 trabaja con un negocio
 *  activo a la vez y el filtro lo hace el servidor, no la pantalla: filtrar
 *  aquí dejaría los totales del buzón contando dinero de otro negocio. */
export async function listMisOrdenes(negocio_id?: string | null): Promise<Orden[]> {
  const r = await pedir<{ filas: FilaOrden[] }>(`${base()}${negocio_id ? `?negocio_id=${encodeURIComponent(negocio_id)}` : ''}`);
  return r.filas.map(orden);
}

export interface OrdenInput {
  negocio_id: string;
  /** Sin él, es compra. */
  tipo?: TipoOrden;
  proveedor_id?: string | null;
  proveedor_nombre?: string | null;
  proyecto_id?: string | null;
  partida_id?: string | null;
  concepto: string;
  /** En PESOS, tal como lo teclea la persona. */
  monto: number | string;
  con_factura?: boolean;
  /** En PESOS. Sólo si se editó el desglose que propone la pantalla. */
  subtotal?: number | string;
  iva?: number | string;
  tasa_iva?: number;
  fecha_maxima_pago?: string | null;
  urgente?: boolean;
}

export async function crearOrden(d: OrdenInput): Promise<Orden> {
  const cuerpo: Record<string, unknown> = {
    negocio_id: d.negocio_id,
    tipo: d.tipo ?? 'compra',
    proveedor_id: d.proveedor_id ?? null,
    proveedor_nombre: d.proveedor_nombre ?? null,
    proyecto_id: d.proyecto_id || null,
    partida_id: d.partida_id || null,
    concepto: d.concepto,
    monto: aCentavos(d.monto),
    con_factura: !!d.con_factura,
    fecha_maxima_pago: d.fecha_maxima_pago || null,
    urgente: !!d.urgente,
  };
  // El desglose sólo se manda si la persona lo tocó: si no, lo calcula la
  // suite, y así hay una sola fórmula en toda la plataforma.
  if (d.subtotal !== undefined && d.iva !== undefined) {
    cuerpo.subtotal = aCentavos(d.subtotal);
    cuerpo.iva = aCentavos(d.iva);
  }
  if (d.tasa_iva !== undefined) cuerpo.tasa_iva = d.tasa_iva;
  return orden(await pedir<FilaOrden>(base(), { method: 'POST', body: cuerpo }));
}

export async function verOrden(id: string): Promise<{ orden: Orden; eventos: EventoOrden[]; archivos: ArchivoOrden[] }> {
  const r = await pedir<{ orden: FilaOrden; eventos: EventoOrden[]; archivos: ArchivoOrden[] }>(`${base()}/${id}`);
  return { ...r, orden: orden(r.orden) };
}

/** 0.56.1 · La orden que dejó ese egreso: desde el movimiento se llega a
 *  la orden con su historia y sus papeles. 404 si el movimiento no viene de
 *  una orden. */
export async function getOrdenDeMovimiento(movimiento_id: string): Promise<{ orden: Orden; eventos: EventoOrden[]; archivos: ArchivoOrden[] }> {
  const r = await pedir<{ orden: FilaOrden; eventos: EventoOrden[]; archivos: ArchivoOrden[] }>(`${base()}/de-movimiento/${encodeURIComponent(movimiento_id)}`);
  return { ...r, orden: orden(r.orden) };
}

/** Corregir una devuelta. Vuelve al buzón con el mismo folio. */
export async function corregirOrden(id: string, d: Partial<OrdenInput>): Promise<Orden> {
  const cuerpo: Record<string, unknown> = {};
  if (d.concepto !== undefined) cuerpo.concepto = d.concepto;
  if (d.monto !== undefined) cuerpo.monto = aCentavos(d.monto);
  if (d.con_factura !== undefined) cuerpo.con_factura = d.con_factura;
  if (d.subtotal !== undefined && d.iva !== undefined) {
    cuerpo.subtotal = aCentavos(d.subtotal);
    cuerpo.iva = aCentavos(d.iva);
  }
  for (const k of ['proveedor_id', 'proveedor_nombre', 'proyecto_id', 'partida_id', 'fecha_maxima_pago', 'urgente'] as const) {
    if (d[k] !== undefined) cuerpo[k] = d[k];
  }
  return orden(await pedir<FilaOrden>(`${base()}/${id}`, { method: 'PATCH', body: cuerpo }));
}

/* ─────────────── lo que ve quien paga ─────────────── */

/** Con `tipo`, una sola pestaña (compras o reembolsos) con SUS totales: la
 *  cifra de arriba tiene que ser la suma de los renglones de abajo, y en la
 *  pestaña de reembolsos esos renglones son sólo los reembolsos. */
export async function getBuzon(negocio_id?: string | null, tipo?: TipoOrden | null): Promise<Buzon> {
  const q = new URLSearchParams();
  if (negocio_id) q.set('negocio_id', negocio_id);
  if (tipo) q.set('tipo', tipo);
  const qs = q.toString();
  const r = await pedir<{ filas: FilaOrden[]; total: number; vence_esta_semana: number; vencidas: number }>(
    `${base()}/buzon${qs ? `?${qs}` : ''}`,
  );
  return {
    filas: r.filas.map(orden),
    total: aPesos(r.total),
    vence_esta_semana: aPesos(r.vence_esta_semana),
    vencidas: r.vencidas,
  };
}

/** El historial de lo pagado (contrato 0.59.0). Mike, 1-oct-2026: «quiero
 *  ver en la pantalla de compras un historial completo de las órdenes de
 *  compra ya pagadas». La más reciente arriba; lo lee quien paga, como el
 *  buzón. `total` en PESOS: la suma de lo que se lista. */
export async function listOrdenesPagadas(negocio_id?: string | null, tipo?: TipoOrden | null): Promise<{ filas: Orden[]; total: number }> {
  const q = new URLSearchParams();
  if (negocio_id) q.set('negocio_id', negocio_id);
  if (tipo) q.set('tipo', tipo);
  const qs = q.toString();
  const r = await pedir<{ filas: FilaOrden[]; total: number }>(`${base()}/pagadas${qs ? `?${qs}` : ''}`);
  return { filas: r.filas.map(orden), total: aPesos(r.total) };
}

/** Lo que hay en el buzón, en dos cifras (0.47.0), EN PESOS. Para el inicio:
 *  Mike pidió «el total de reembolsos pendientes en la pantalla inicial junto
 *  con los otros totales», y que reste del capital de la empresa. Lo lee
 *  quien ve dinero aunque no pague; los renglones siguen siendo del buzón. */
export interface ResumenOrdenes {
  compras: { total: number; cuantas: number };
  reembolsos: { total: number; cuantas: number };
}

export async function getResumenOrdenes(negocio_id?: string | null): Promise<ResumenOrdenes> {
  const r = await pedir<ResumenOrdenes>(`${base()}/resumen${negocio_id ? `?negocio_id=${encodeURIComponent(negocio_id)}` : ''}`);
  return {
    compras: { total: aPesos(r.compras.total), cuantas: r.compras.cuantas },
    reembolsos: { total: aPesos(r.reembolsos.total), cuantas: r.reembolsos.cuantas },
  };
}

/** Qué puede hacer quien pregunta (0.47.0). En dash101 casi siempre puede
 *  comprar; la excepción vive en supply101, donde quien no trae la llave de
 *  compras entra sólo a reembolsos. Se pinta lo que diga el servidor. */
export const getPermisosOrdenes = () =>
  pedir<{ puede_comprar: boolean; puede_pagar: boolean }>(`${base()}/permisos`);

export async function pagarOrden(id: string, d: { cuenta_id: string; fecha?: string; nota?: string }) {
  const r = await pedir<{ orden: FilaOrden; movimiento: { id: string; monto: number }; correo: { enviado: boolean; motivo?: string; para?: string } }>(
    `${base()}/${id}/pagar`, { method: 'POST', body: d },
  );
  return { ...r, orden: orden(r.orden) };
}

export const devolverOrden = (id: string, nota: string) =>
  pedir<{ orden: FilaOrden }>(`${base()}/${id}/devolver`, { method: 'POST', body: { nota } }).then((r) => orden(r.orden));

export const rechazarOrden = (id: string, nota: string) =>
  pedir<{ orden: FilaOrden }>(`${base()}/${id}/rechazar`, { method: 'POST', body: { nota } }).then((r) => orden(r.orden));

/* ─────────────── quién puede pagar ─────────────── */

export async function listContadores(): Promise<Contador[]> {
  const r = await pedir<{ filas: Contador[] }>(`${base()}/contadores`);
  return r.filas;
}

export const marcarContador = (usuario_id: string, valor: boolean) =>
  pedir<{ id: string; es_contador: boolean }>(`${base()}/contadores`, { method: 'POST', body: { usuario_id, valor } });

/* ─────────────── el desglose, para pintarlo antes de guardar ───────────────
 * La misma fórmula que la suite: se parte del TOTAL hacia atrás y el IVA es
 * la resta, nunca otra multiplicación. Así `subtotal + iva` da el total
 * exacto y la pantalla enseña lo mismo que se va a guardar. */
export function desglosar(montoPesos: number | string, tasaBase = 1600): { subtotal: number; iva: number } {
  const total = aCentavos(montoPesos);
  const subtotal = Math.round((total * 10000) / (10000 + tasaBase));
  return { subtotal: aPesos(subtotal), iva: aPesos(total - subtotal) };
}

/** ¿Ya venció? Se compara por día, no por hora: una orden que vence hoy no
 *  está vencida a las nueve de la mañana. */
export const vencida = (o: Orden, hoy = new Date().toISOString().slice(0, 10)) =>
  !!o.fecha_maxima_pago && o.fecha_maxima_pago < hoy && o.estado === 'en_buzon';

export const ESTADO_ORDEN: Record<EstadoOrden, string> = {
  en_buzon: 'En el buzón',
  devuelta: 'Devuelta para corregir',
  pagada: 'Pagada',
  rechazada: 'Rechazada',
};

/* ─────────────── las partidas de un proyecto ───────────────
 * La pantalla necesita el `id` de cada partida para ligarle la orden, y el
 * tipo `PartidaProyecto` de la app no lo trae (nació de Firestore, donde las
 * partidas eran un arreglo dentro del proyecto). Así que se leen crudas de la
 * API, con su id, y se pasan a pesos aquí. */

export interface PartidaDeProyecto {
  id: string;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  concepto: string | null;
  /** En PESOS. */
  monto_acordado: number;
  /** En PESOS. */
  monto_pagado: number;
  estado: 'pendiente' | 'parcial' | 'pagado';
}

export async function listPartidasDe(proyecto_id: string): Promise<PartidaDeProyecto[]> {
  const filas = await listar<{
    id: string; proveedor_id: string | null; proveedor_nombre: string | null; concepto: string | null;
    monto_acordado: number; monto_pagado: number; estado: 'pendiente' | 'parcial' | 'pagado';
  }>('partidas', { proyecto_id });
  return filas.map((f) => ({
    ...f,
    monto_acordado: aPesos(f.monto_acordado),
    monto_pagado: aPesos(f.monto_pagado),
  }));
}

/* ─────────────── la cotización y el comprobante ───────────────
 * Cuelgan de `archivos`, la tabla que ya existe: no se inventa otra.
 *
 * La subida es multipart, y antes armaba su propio `fetch` a un lado de
 * `pedir`. En el navegador funcionaba de casualidad —la cookie la pone el
 * navegador— pero fuera de él no hay galletero, así que la sesión no viajaba
 * y la API contestaba `sin_sesion`: la subida era el único camino de dash101
 * que no se podía medir desde una prueba. Ahora va por `pedir` como todo lo
 * demás, que sabe mandar una forma sin pisarle el `Content-Type`. */

export async function subirArchivo(de_tabla: string, de_id: string, archivo: File): Promise<ArchivoOrden> {
  const forma = new FormData();
  forma.set('archivo', archivo);
  forma.set('de_tabla', de_tabla);
  forma.set('de_id', de_id);
  return pedir<ArchivoOrden>(`/orgs/${org()}/archivos`, { method: 'POST', body: forma });
}

/** Para pintarlo en un `<img>` o abrirlo en otra pestaña. Va por el mismo
 *  origen, así que la cookie de sesión viaja sola. */
export const urlArchivo = (id: string) => `${apiBase()}/orgs/${org()}/archivos/${id}`;

/** Lo que ya está colgado de un renglón (un movimiento, una orden). Hasta el
 *  1-oct-2026 un comprobante de movimiento sólo se veía desde su orden; al
 *  corregir un movimiento no había manera de saber qué traía. */
export async function archivosDe(de_tabla: string, de_id: string): Promise<ArchivoOrden[]> {
  return listar<ArchivoOrden>('archivos', { de_tabla, de_id });
}
