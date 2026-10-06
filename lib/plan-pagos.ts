/* El plan de pagos de un proyecto · contrato 0.72.0 de la suite.
 *
 * Mike, 6-oct, escogió con botones cómo fechar los cobros de un proyecto
 * para el flujo proyectado: «plan de pagos por proyecto». En cada proyecto
 * se capturan parcialidades con fecha y monto (anticipo, avance, entrega).
 * El flujo las pone en su fecha; lo ya cobrado del proyecto se descuenta de
 * las parcialidades en orden de fecha (lib/proyeccion.ts, cobrosDeProyectos),
 * y sólo lo pendiente entra como cobro.
 *
 * No mueve dinero ni toca `cobrado`: es lo que se ESPERA. En PESOS de este
 * lado; la API guarda centavos. Las palabras de un rechazo se devuelven tal
 * cual las dice la API (`errores` por campo).
 */

import { ErrorApi, listar, pedir } from './api/cliente';
import { aCentavos, aPesos } from './api/adaptar';
import { org } from './fuente';

export interface Parcialidad {
  id: string;
  proyecto_id: string;
  concepto: string;
  /** AAAA-MM-DD. */
  fecha: string;
  /** En PESOS. */
  monto: number;
  creado_at: string;
  actualizado_at: string | null;
}

interface Fila extends Omit<Parcialidad, 'monto'> { monto: number }

const base = () => `/orgs/${org()}/plan_pagos`;
const enPesos = (f: Fila): Parcialidad => ({ ...f, monto: aPesos(f.monto) });

/** Un rechazo de la API con palabras por campo, en una sola frase. */
function enClaro(e: unknown): never {
  if (e instanceof ErrorApi && e.error === 'datos_invalidos') {
    const d = e.detalle as { errores?: Record<string, string> } | undefined;
    const palabras = d?.errores ? Object.values(d.errores).join(' ') : '';
    if (palabras) throw new Error(palabras);
  }
  throw e;
}

export async function listPlanDeProyecto(proyecto_id: string): Promise<Parcialidad[]> {
  return (await listar<Fila>('plan_pagos', { proyecto_id, limite: '5000' })).map(enPesos);
}

/** Todas las parcialidades de la empresa: el flujo las necesita de una vez. */
export async function listPlanes(): Promise<Parcialidad[]> {
  return (await listar<Fila>('plan_pagos', { limite: '5000' })).map(enPesos);
}

export async function crearParcialidad(d: { proyecto_id: string; concepto?: string; fecha: string; monto: number }): Promise<Parcialidad> {
  try {
    return enPesos(await pedir<Fila>(base(), {
      method: 'POST',
      body: { proyecto_id: d.proyecto_id, concepto: d.concepto ?? '', fecha: d.fecha, monto: aCentavos(d.monto) },
    }));
  } catch (e) { return enClaro(e); }
}

export async function editarParcialidad(id: string, d: { concepto?: string; fecha?: string; monto?: number }): Promise<Parcialidad> {
  const cuerpo: Record<string, unknown> = {};
  if (d.concepto !== undefined) cuerpo.concepto = d.concepto;
  if (d.fecha !== undefined) cuerpo.fecha = d.fecha;
  if (d.monto !== undefined) cuerpo.monto = aCentavos(d.monto);
  try {
    return enPesos(await pedir<Fila>(`${base()}/${encodeURIComponent(id)}`, { method: 'PATCH', body: cuerpo }));
  } catch (e) { return enClaro(e); }
}

export async function borrarParcialidad(id: string): Promise<void> {
  await pedir(`${base()}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
