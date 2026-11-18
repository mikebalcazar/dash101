/* Los conceptos de cobro de un proyecto · contrato 0.105.0 de la suite.
 *
 * Mike, 18-nov-2026: «Vamos a separar la contabilidad. Ya no va a ir ligada
 * a los ítems. Los precios de los proyectos se harán por aparte.» Con
 * botones: «Conceptos de cobro con opción a importar de las cotizaciones del
 * proyecto de quote» y «Un concepto por renglón. Si se importa una segunda
 * cotización del mismo proyecto, se debe ver que es una segunda cotización
 * pero suma».
 *
 * El precio del proyecto es la suma de sus conceptos y lo suma la API; el
 * importe de cada uno (cantidad × precio unitario) también lo multiplica la
 * API. Aquí sólo se pide y se convierte a PESOS, una vez.
 *
 * Y lo que se les debe a los contratistas (`/pagos-pendientes`): Mike, el
 * mismo día, «vamos a poner en dash los pagos pendientes de cada proyecto a
 * cada contratista».
 */

import { listarCompleto, pedir } from './api/cliente';
import { aCentavos } from './api/adaptar';
import { org } from './fuente';

const aPesos = (centavos: unknown) => Math.round(Number(centavos ?? 0)) / 100;

export interface Concepto {
  id: string;
  proyecto_id: string;
  descripcion: string;
  cantidad: number;
  /** En PESOS. */
  precio_unitario: number;
  /** En PESOS: cantidad × precio unitario, lo multiplicó la API. */
  importe: number;
  orden: number;
  cotizacion_id: string | null;
  cotizacion_folio: string | null;
  cotizacion_nombre: string | null;
}

interface FilaConcepto {
  id: string; proyecto_id: string; descripcion: string; cantidad: number; precio_unitario: number; monto: number; orden: number;
  cotizacion_id: string | null; cotizacion_folio: string | null; cotizacion_nombre: string | null;
}

const concepto = (f: FilaConcepto): Concepto => ({
  id: f.id, proyecto_id: f.proyecto_id, descripcion: f.descripcion, cantidad: Number(f.cantidad ?? 1),
  precio_unitario: aPesos(f.precio_unitario), importe: aPesos(f.monto), orden: Number(f.orden ?? 0),
  cotizacion_id: f.cotizacion_id ?? null, cotizacion_folio: f.cotizacion_folio ?? null, cotizacion_nombre: f.cotizacion_nombre ?? null,
});

export async function listarConceptos(proyecto_id: string): Promise<Concepto[]> {
  const filas = await listarCompleto<FilaConcepto>('conceptos', { proyecto_id });
  return filas.map(concepto).sort((a, b) => a.orden - b.orden);
}

export interface ConceptoInput { descripcion: string; cantidad: number; /** En PESOS. */ precio_unitario: number }

export async function crearConcepto(proyecto_id: string, d: ConceptoInput): Promise<Concepto> {
  const f = await pedir<FilaConcepto>(`/orgs/${org()}/conceptos`, {
    method: 'POST', body: { proyecto_id, descripcion: d.descripcion.trim(), cantidad: d.cantidad, precio_unitario: aCentavos(d.precio_unitario) },
  });
  return concepto(f);
}

export async function cambiarConcepto(id: string, d: Partial<ConceptoInput>): Promise<Concepto> {
  const cuerpo: Record<string, unknown> = {};
  if (d.descripcion !== undefined) cuerpo.descripcion = d.descripcion.trim();
  if (d.cantidad !== undefined) cuerpo.cantidad = d.cantidad;
  if (d.precio_unitario !== undefined) cuerpo.precio_unitario = aCentavos(d.precio_unitario);
  return concepto(await pedir<FilaConcepto>(`/orgs/${org()}/conceptos/${encodeURIComponent(id)}`, { method: 'PATCH', body: cuerpo }));
}

export async function borrarConcepto(id: string): Promise<void> {
  await pedir(`/orgs/${org()}/conceptos/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* ─────────────── la hoja del presupuesto (0.106.0) ───────────────
 *
 * Mike, 18-nov-2026, con botones: «Hoja dentro de dash». La hoja se guarda
 * completa: los renglones con id se quedan, los nuevos nacen y los que no
 * vienen se quitan. Todo o nada, y la API suma el precio una vez. */

export interface RenglonDeHoja {
  id?: string | null;
  descripcion: string;
  cantidad: number;
  /** En PESOS. */
  precio_unitario: number;
}

export async function guardarHoja(proyecto_id: string, renglones: RenglonDeHoja[]): Promise<{ conceptos: Concepto[]; creados: number; cambiados: number; quitados: number }> {
  const r = await pedir<{ conceptos: FilaConcepto[]; creados: number; cambiados: number; quitados: number }>(
    `/orgs/${org()}/proyectos/${encodeURIComponent(proyecto_id)}/conceptos`,
    {
      method: 'PUT',
      body: { renglones: renglones.map((x) => ({ id: x.id ?? null, descripcion: x.descripcion.trim(), cantidad: x.cantidad, precio_unitario: aCentavos(x.precio_unitario) })) },
    },
  );
  return { conceptos: r.conceptos.map(concepto), creados: r.creados, cambiados: r.cambiados, quitados: r.quitados };
}

/* Las plantillas: un nombre y sus renglones. Usarla llena la hoja; no mueve
 * un peso hasta que la hoja se guarda. */

export interface Plantilla {
  id: string;
  nombre: string;
  /** precio_unitario en PESOS. */
  renglones: Array<{ descripcion: string; cantidad: number; precio_unitario: number }>;
}

interface FilaPlantilla { id: string; nombre: string; renglones: Array<{ descripcion: string; cantidad: number; precio_unitario: number }> | null }

const plantilla = (f: FilaPlantilla): Plantilla => ({
  id: f.id, nombre: f.nombre,
  renglones: (f.renglones ?? []).map((r) => ({ descripcion: r.descripcion, cantidad: Number(r.cantidad ?? 1), precio_unitario: aPesos(r.precio_unitario) })),
});

export async function listarPlantillas(): Promise<Plantilla[]> {
  return (await listarCompleto<FilaPlantilla>('plantillas_presupuesto')).map(plantilla);
}

export async function crearPlantilla(nombre: string, renglones: Plantilla['renglones']): Promise<Plantilla> {
  return plantilla(await pedir<FilaPlantilla>(`/orgs/${org()}/plantillas_presupuesto`, {
    method: 'POST',
    body: { nombre: nombre.trim(), renglones: renglones.map((r) => ({ descripcion: r.descripcion.trim(), cantidad: r.cantidad, precio_unitario: aCentavos(r.precio_unitario) })) },
  }));
}

export async function borrarPlantilla(id: string): Promise<void> {
  await pedir(`/orgs/${org()}/plantillas_presupuesto/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/* ─────────────── importar de quote101 ─────────────── */

export interface CotizacionParaImportar {
  id: string;
  folio: string | null;
  nombre: string;
  estado: string;
  /** 'quote': quote101 dejó el precio de cada renglón; 'piezas': aprobada
   *  antes y sale del precio de sus piezas; null: no trae precios. */
  fuente: 'quote' | 'piezas' | null;
  renglones: number;
  /** En PESOS, sin IVA. */
  subtotal: number;
  /** Cuántos conceptos del proyecto ya vienen de ella. */
  importados: number;
}

export async function cotizacionesParaImportar(proyecto_id: string): Promise<CotizacionParaImportar[]> {
  const r = await pedir<{ cotizaciones: Array<Record<string, any>> }>(`/orgs/${org()}/proyectos/${encodeURIComponent(proyecto_id)}/conceptos/cotizaciones`);
  return r.cotizaciones.map((c) => ({
    id: String(c.id), folio: c.folio ?? null, nombre: String(c.nombre ?? 'Cotización'), estado: String(c.estado ?? ''),
    fuente: c.fuente ?? null, renglones: Number(c.renglones ?? 0), subtotal: aPesos(c.subtotal), importados: Number(c.importados ?? 0),
  }));
}

export async function importarCotizacion(proyecto_id: string, cotizacion_id: string, reemplazar = false): Promise<{ conceptos: number; reemplazados: number }> {
  const r = await pedir<{ conceptos: unknown[]; reemplazados: number }>(
    `/orgs/${org()}/proyectos/${encodeURIComponent(proyecto_id)}/conceptos/importar`,
    { method: 'POST', body: { cotizacion_id, reemplazar } },
  );
  return { conceptos: r.conceptos.length, reemplazados: r.reemplazados };
}

/* ─────────────── lo que se les debe a los contratistas ─────────────── */

export interface PartidaPendiente {
  id: string; concepto: string; acordado: number; pagado: number; pendiente: number;
  estado: string; fecha_esperada: string | null; del_cronograma: boolean;
}
export interface ContratistaDelProyecto {
  clave: string; proveedor_id: string | null; nombre: string; tipo: string | null;
  acordado: number; pagado: number; pendiente: number; partidas: PartidaPendiente[];
}
export interface PendientesDelProyecto {
  proyecto_id: string; nombre: string; estado: string; cliente_nombre: string | null; pendiente: number;
  contratistas: ContratistaDelProyecto[];
}
export interface PagosPendientes {
  /** Todo en PESOS. */
  total: number;
  proyectos: PendientesDelProyecto[];
  contratistas: Array<{ clave: string; proveedor_id: string | null; nombre: string; tipo: string | null; pendiente: number; proyectos: number }>;
}

export async function pagosPendientes(proyecto_id?: string): Promise<PagosPendientes> {
  const q = proyecto_id ? `?proyecto_id=${encodeURIComponent(proyecto_id)}` : '';
  const r = await pedir<Record<string, any>>(`/orgs/${org()}/pagos-pendientes${q}`);
  return {
    total: aPesos(r.total),
    proyectos: (r.proyectos ?? []).map((p: Record<string, any>) => ({
      proyecto_id: String(p.proyecto_id), nombre: String(p.nombre ?? ''), estado: String(p.estado ?? ''),
      cliente_nombre: p.cliente_nombre ?? null, pendiente: aPesos(p.pendiente),
      contratistas: (p.contratistas ?? []).map((c: Record<string, any>) => ({
        clave: String(c.clave), proveedor_id: c.proveedor_id ?? null, nombre: String(c.nombre ?? ''), tipo: c.tipo ?? null,
        acordado: aPesos(c.acordado), pagado: aPesos(c.pagado), pendiente: aPesos(c.pendiente),
        partidas: (c.partidas ?? []).map((x: Record<string, any>) => ({
          id: String(x.id), concepto: String(x.concepto ?? ''), acordado: aPesos(x.acordado), pagado: aPesos(x.pagado),
          pendiente: aPesos(x.pendiente), estado: String(x.estado ?? ''), fecha_esperada: x.fecha_esperada ?? null,
          del_cronograma: Boolean(x.del_cronograma),
        })),
      })),
    })),
    contratistas: (r.contratistas ?? []).map((c: Record<string, any>) => ({
      clave: String(c.clave), proveedor_id: c.proveedor_id ?? null, nombre: String(c.nombre ?? ''), tipo: c.tipo ?? null,
      pendiente: aPesos(c.pendiente), proyectos: Number(c.proyectos ?? 0),
    })),
  };
}
