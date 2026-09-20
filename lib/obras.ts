/* Las obras de quell101, del lado de dash101 · contrato 0.22.0 de la suite.
 *
 * Mike, 20-sep: la obra que se abre en quell101 y el proyecto que se abre
 * aquí son la misma casa. Este módulo habla con `/orgs/:o/obras/*`, que la
 * API atiende aparte del CRUD genérico porque la liga se pone y se quita con
 * permiso —owner, admin o socio— y eso se revisa en el servidor.
 *
 * Aquí NO hay dinero: una obra son planos, ítems ubicados y bitácora. Por eso
 * este módulo no convierte centavos, a diferencia de `lib/ordenes.ts`.
 */

import { pedir } from './api/cliente';
import { apiBase, org } from './fuente';

export interface Obra {
  id: string;
  nombre: string;
  cliente: string;
  estado: 'activo' | 'cerrado';
  creado_at: string;
  /** `null` si la obra existe en quell101 y nadie le ha puesto precio aquí. */
  proyecto_id: string | null;
  proyecto_nombre: string | null;
  proyecto_negocio_id: string | null;
  planos: number;
  /** Cuántos ítems están ya ubicados en un plano. */
  ubicados: number;
}

const base = () => `/orgs/${org()}/obras`;

/** Todas las obras de la empresa. Con `sueltas`, sólo las que todavía no
 *  tienen proyecto: eso es lo que se ofrece al crear uno. */
export async function listObras(sueltas = false): Promise<Obra[]> {
  const r = await pedir<{ obras: Obra[] }>(`${base()}${sueltas ? '?sueltas=1' : ''}`);
  return r.obras;
}

/** La obra de un proyecto, o `null`. */
export async function obraDeProyecto(proyecto_id: string): Promise<Obra | null> {
  const r = await pedir<{ obra: Obra | null }>(`${base()}/de-proyecto/${encodeURIComponent(proyecto_id)}`);
  return r.obra;
}

export async function ligarObra(obra_id: string, proyecto_id: string): Promise<Obra> {
  const r = await pedir<{ obra: Obra }>(`${base()}/${encodeURIComponent(obra_id)}/ligar`, {
    method: 'POST',
    body: { proyecto_id },
  });
  return r.obra;
}

export async function desligarObra(obra_id: string): Promise<Obra> {
  const r = await pedir<{ obra: Obra }>(`${base()}/${encodeURIComponent(obra_id)}/ligar`, { method: 'DELETE' });
  return r.obra;
}

/** Dónde abrir la obra en quell101. dash101 y quell101 son dos Workers en
 *  dominios distintos, así que la liga se arma con la dirección de la app, no
 *  con la de la API; y la ruta es la de su enrutador de una sola página
 *  (`#/p/<id>`, en `web/src/App.jsx` de bitacora-obra). Que el Worker se
 *  llame `bitacora-obra` y la app `quell101` es de nacimiento: el Worker no
 *  se renombra en vivo. */
export function urlObra(obra: Obra): string {
  const casa = apiBase().includes('staging')
    ? 'https://bitacora-obra-staging.mike-929.workers.dev'
    : 'https://bitacora-obra.mike-929.workers.dev';
  return `${casa}/#/p/${obra.id}`;
}
