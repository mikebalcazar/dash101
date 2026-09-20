/* Las obras de quell101, del lado de dash101 · contrato 0.28.0 de la suite.
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

/* ─────────────── los ítems, uno solo de los dos lados (0.26.0) ───────────────
 *
 * Las piezas del plano y los ítems vendidos del proyecto son la misma lista
 * contada dos veces. La API no las junta sola: PROPONE y espera. Emparejar
 * por parecido acierta casi siempre, y la vez que falla le cuelga el dinero
 * de una pieza a otra, que se arregla a mano cuando alguien lo note.
 */

/** Una pieza del plano y el ítem al que se parece. */
export interface ParejaDeItem {
  element_id: string;
  codigo: string;
  pieza: string;
  tipo: string;
  item_id: string;
  item_clave: string | null;
  item_nombre: string;
  /** En CENTAVOS, como todo el dinero de la API. */
  monto: number;
  cantidad: number;
  estado: string;
  /** Por qué se emparejaron. Se enseña: quien decide no tiene que adivinar. */
  por: 'codigo' | 'nombre';
}

/** Una pieza del plano que no se parece a ningún ítem. */
export interface PiezaSinItem {
  element_id: string;
  codigo: string;
  pieza: string;
  tipo: string;
}

/** Un ítem vendido que todavía no tiene pieza en el plano. */
export interface ItemSinPieza {
  id: string;
  clave: string | null;
  nombre: string;
  monto: number;
  cantidad: number;
  estado: string;
}

/** Un ítem que todavía admite una pieza. Es lo que llena el desplegable
 *  para emparejar a mano: sin esta lista sólo se podía aceptar o rechazar lo
 *  que el parecido adivinó. */
export interface CandidatoDeItem {
  id: string;
  clave: string | null;
  nombre: string;
  /** En CENTAVOS, como todo el dinero de la API. */
  monto: number;
  cantidad: number;
  /** Cuántas piezas suyas ya están en un plano, y cuántas le caben. */
  ubicados: number;
  cupo: number;
  estado: string;
}

export interface PropuestaDeItems {
  parejas: ParejaDeItem[];
  nuevos: PiezaSinItem[];
  sueltos: ItemSinPieza[];
  candidatos: CandidatoDeItem[];
}

/** Lo que se manda por cada pieza que se liga.
 *
 *  `clave` sólo hace falta cuando los dos lados traen código y son
 *  distintos: es qué código gana, y queda en los dos lados. Sin ella la API
 *  no toca ninguno, a propósito.
 *
 *  `nombre` es aparte y siempre opcional: los dos lados traen nombre, así
 *  que no hay hueco que llenar —o cada uno conserva el suyo, o alguien
 *  escoge—. La descripción no entra: sólo dash101 la tiene. */
export interface LigaDeItem {
  element_id: string;
  item_id: string;
  clave?: 'quell' | 'dash';
  nombre?: 'quell' | 'dash';
}

/** Qué se emparejaría con qué. NO escribe nada. */
export async function itemsDeLaObra(obra_id: string): Promise<PropuestaDeItems> {
  const r = await pedir<PropuestaDeItems>(`${base()}/${encodeURIComponent(obra_id)}/items`);
  return { parejas: r.parejas, nuevos: r.nuevos, sueltos: r.sueltos, candidatos: r.candidatos ?? [] };
}

/** Aplicar lo que se aceptó. Lo que no se mande, no se toca. */
export async function fusionarItemsDeLaObra(
  obra_id: string,
  plan: { ligar?: LigaDeItem[]; crear?: string[] },
): Promise<{ ligados: number; creados: number; renombrados: number }> {
  const r = await pedir<{ ligados: number; creados: number; renombrados: number }>(
    `${base()}/${encodeURIComponent(obra_id)}/items`,
    { method: 'POST', body: plan },
  );
  return { ligados: r.ligados, creados: r.creados, renombrados: r.renombrados ?? 0 };
}
