/* Acomodar y juntar los ítems de un proyecto · contrato 0.30.0 de la suite.
 *
 * Dos encargos de Mike del 20-sep, sobre la misma lista:
 *
 *   «Necesito poder agrupar varios ítems en un solo concepto. Son varias
 *   puertas iguales en diferente ubicación —quell las ubica en plano y cada
 *   una tiene su seguimiento— pero el producto es el mismo, y no tiene caso
 *   tener 21 ítems idénticos enlistados en dash.»
 *
 *   «Quiero también poder ordenar los ítems y agrupar por partidas. Incluso
 *   podría ser por pestañas (como folders) para cambiar entre partidas.»
 *
 * Las dos operaciones viven en el servidor y no aquí: juntar mueve piezas
 * del plano, movimientos y avances de un renglón a otro, y acomodar 21
 * renglones de uno en uno son 21 idas y vueltas donde la número 12 puede
 * fallar y dejar la lista a medias.
 *
 * OJO con la palabra `partida`: aquí es el capítulo de la cotización
 * —Cocina, Recámaras—, NO los compromisos con proveedores, que en esta app
 * se enseñan aparte y con ese nombre.
 *
 * El dinero llega y se manda en CENTAVOS, como todo lo de la API; quien
 * pinta convierte.
 */

import { pedir } from './api/cliente';
import { org } from './fuente';

export interface ItemDelGrupo {
  id: string;
  clave: string | null;
  nombre: string;
  cantidad: number;
  /** En CENTAVOS. */
  monto: number;
  etapa: number;
  fecha_entrega: string | null;
  /** Cuántas piezas suyas están ya en un plano de la obra. */
  ubicados: number;
}

/** Renglones que parecen el mismo producto capturado varias veces. */
export interface GrupoDeItems {
  nombre: string;
  tipo: string;
  estado: string;
  moneda: string;
  /** En CENTAVOS. Dos renglones con el mismo nombre y distinto precio por
   *  pieza NO son el mismo grupo: o no son lo mismo, o alguien se equivocó
   *  en uno, y juntarlos escondería el error en un promedio. */
  precio_pieza: number;
  renglones: number;
  piezas: number;
  monto: number;
  items: ItemDelGrupo[];
}

const base = (proyecto_id: string) => `/orgs/${org()}/proyectos/${encodeURIComponent(proyecto_id)}`;

/** Qué se podría juntar. NO escribe nada. */
export async function agrupables(proyecto_id: string): Promise<GrupoDeItems[]> {
  const r = await pedir<{ grupos: GrupoDeItems[] }>(`${base(proyecto_id)}/agrupables`);
  return r.grupos ?? [];
}

/** Juntarlos. `queda_id` se queda con todo; los de `se_van` desaparecen y le
 *  dejan sus piezas del plano, movimientos, partidas y avances. El precio de
 *  venta del proyecto no se mueve: el importe del concepto es la suma. */
export async function agrupar(
  proyecto_id: string,
  args: { queda_id: string; se_van: string[]; nombre?: string },
): Promise<{ absorbidos: number; movidos: Record<string, number> }> {
  const r = await pedir<{ absorbidos: number; movidos: Record<string, number> }>(
    `${base(proyecto_id)}/agrupar`,
    { method: 'POST', body: args },
  );
  return { absorbidos: r.absorbidos, movidos: r.movidos };
}

/** La partida de cada ítem y su lugar dentro de ella, en un solo envío. Lo
 *  que no se mande no se mueve, así que renombrar una partida es mandar sus
 *  ítems con el nombre nuevo. */
export async function acomodar(
  proyecto_id: string,
  items: Array<{ id: string; partida?: string; orden?: number }>,
): Promise<number> {
  const r = await pedir<{ acomodados: number }>(`${base(proyecto_id)}/acomodar`, {
    method: 'POST',
    body: { items },
  });
  return r.acomodados;
}

/* ─────────────── aprobar y cancelar (contrato 0.31.0) ───────────────
 *
 * Mike, 20-sep: «se debe poder cancelar algún ítem ya sea desde quell o
 * desde dash, y se refleja en los 2. (…) Para que un ítem se considere
 * cancelado tiene que haber estado aprobado primero y luego cancelado.»
 *
 * La clasificación la contesta la API: `cancelar` devuelve si quedó
 * CANCELADO —estuvo aprobado— o DESCARTADO —nunca lo estuvo—, y la pantalla
 * dice esa palabra en vez de volver a sacar la cuenta.
 */

/** Aprobar: entra al alcance y desde ahí suma en el proyecto. */
export async function aprobarItem(id: string): Promise<void> {
  await pedir(`/orgs/${org()}/items/${encodeURIComponent(id)}/aprobar`, { method: 'POST' });
}

/** Cancelar. Devuelve cómo quedó, para poder decirlo con su nombre. */
export async function cancelarItem(id: string, motivo?: string): Promise<'cancelado' | 'descartado'> {
  const r = await pedir<{ alcance: 'cancelado' | 'descartado' }>(
    `/orgs/${org()}/items/${encodeURIComponent(id)}/cancelar`,
    { method: 'POST', body: { motivo } },
  );
  return r.alcance;
}
