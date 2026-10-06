/* El ítem en la obra, visto desde dash101 (6-oct-2026).
 *
 * Mike: «Necesito en dash también me abra la barra lateral de detalle de los
 * ítems cuando doy click sobre uno o sobre el ícono de info. No importa en
 * dónde esté viendo el ítem en lista, siempre debe tener esa función. Y
 * dentro de la barra lateral de detalles del ítem, debe haber un hiperlink
 * al ítem en quell».
 *
 * Es lo mismo que quote101 hace desde el 5-oct: dash101 tiene el ítem; la
 * pieza del plano la tiene el motor de obra (`/orgs/:o/quell/*`, contrato
 * 0.67.1), y de ella cuelgan la bitácora con sus fotos, el punchlist, los
 * contratistas y los archivos. Tres lecturas con el X-App de esta app, de
 * sólo lectura. Para escribir está quell101, y para eso va la liga. */
import { pedirCrudo } from './api/cliente';
import { apiBase, org } from './fuente';
import { casaQuell } from './obras';

export interface PiezaDeItem {
  element_id: string; project_id: string; project_name: string; plan_id: string; plan_name: string;
  code: string; name: string; type: string; fase: string; padre_id: string | null;
}
export interface ElementoDeObra {
  id: string; code: string; name: string; type: string; fase: string; resp: string; plan_name: string;
  alcance?: string; item_id?: string | null; item_descripcion?: string | null; item_monto?: number | null;
  item_cantidad?: number | null; item_fecha_entrega?: string | null; item_entrega_falta?: number | null;
  diseno_definido?: string | null; anticipo_fecha?: string | null; anticipo_monto?: number | null;
  created_at: string; entregado_en?: string | null;
}
export interface DetalleDePieza {
  element: ElementoDeObra;
  log: Array<{ id: string; user_name?: string; created_at: string; text?: string; kind?: string; photos?: Array<{ id?: string; r2_key: string; file_name?: string }> }>;
  punch: Array<{ id: string; title?: string; description?: string; status: string; assignee_name?: string; resp?: string; due_date?: string; photos?: Array<{ id?: string; r2_key: string; file_name?: string }> }>;
  contratistas: Array<{ id: string; name: string; company?: string }>;
}
export interface DocsDePieza {
  principal?: { id: string; nombre?: string; r2_key: string } | null;
  soporte?: Array<{ id: string; nombre?: string; r2_key: string }>;
}

const q = (ruta: string) => `/orgs/${org()}/quell${ruta}`;

/** La pieza del plano que corresponde al ítem. 404 → el ítem no está en ningún plano. */
export async function piezaDeItem(item_id: string): Promise<PiezaDeItem> {
  try {
    const r = await pedirCrudo<{ pieza: PiezaDeItem }>(q(`/items/${encodeURIComponent(item_id)}/pieza`));
    return r.pieza;
  } catch (e) {
    if (e && typeof e === 'object' && (e as { status?: number }).status === 404) throw new Error('Este ítem no está en ningún plano de la obra.');
    throw e;
  }
}
export async function pieza(element_id: string): Promise<DetalleDePieza> {
  return pedirCrudo<DetalleDePieza>(q(`/elements/${encodeURIComponent(element_id)}`));
}
export async function piezaDocs(element_id: string): Promise<DocsDePieza> {
  return pedirCrudo<DocsDePieza>(q(`/elements/${encodeURIComponent(element_id)}/docs`));
}
/** La dirección de un archivo del bucket de la obra (foto, plano): la llave
 *  lleva diagonales y se codifica tramo por tramo. Pasa por el mismo proxy
 *  que todo lo demás, con la galleta de la sesión. */
export function archivoDeQuell(llave: string): string {
  return `${apiBase()}/orgs/${org()}/quell/files/${String(llave).split('/').map(encodeURIComponent).join('/')}`;
}
/** Dónde abrir ESA pieza en quell101: su enrutador es `#/p/<obra>/e/<pieza>`
 *  (bitacora-obra, web/src/navegar.js). */
export function urlPiezaEnQuell(project_id: string, element_id: string): string {
  return `${casaQuell()}/#/p/${encodeURIComponent(project_id)}/e/${encodeURIComponent(element_id)}`;
}

/** Abrir el panel desde cualquier lista: un evento en la ventana, que el
 *  anfitrión del panel (montado en el marco de la app) escucha. Así ninguna
 *  lista necesita saber dónde vive el panel. */
export const EVENTO_ABRIR_ITEM = 'dash101:abrir-item';
export function abrirItem(item_id: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_ITEM, { detail: { item_id } }));
}
