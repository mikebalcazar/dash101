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

/** Agruparlos: se escribe el PRODUCTO y las piezas le apuntan.
 *
 *  YA NO FUSIONA. Hasta el contrato 0.34.0 esto borraba los renglones que se
 *  juntaban y dejaba uno solo con `cantidad = 21`. Mike pidió el 20-sep
 *  poder mover de grupo un ítem ya agrupado, y un renglón borrado no se
 *  puede mover; escogió con botones que el grupo de producto reemplace a la
 *  fusión.
 *
 *  Las piezas heredan el precio del producto, así que el precio de venta del
 *  proyecto SÍ se puede mover. Por eso vuelve el antes y el después: la
 *  pantalla lo enseña y quien agrupó ve lo que hizo. En CENTAVOS. */
export async function agrupar(
  proyecto_id: string,
  args: { items: string[]; nombre?: string; codigo?: string; precio?: number },
): Promise<{ producto: Producto; items: number; venta_antes: number; venta_despues: number }> {
  const r = await pedir<{ producto: Producto; items: unknown[]; venta_antes: number; venta_despues: number }>(
    `${base(proyecto_id)}/agrupar`,
    { method: 'POST', body: args },
  );
  return { producto: r.producto, items: r.items?.length ?? 0, venta_antes: r.venta_antes, venta_despues: r.venta_despues };
}

/* ────────── el producto de cada ítem (contrato 0.35.0) ──────────
 *
 * Mike, 20-sep: «todos los ítems, aparte del tipo de ítem, deberían tener un
 * dropdown para seleccionar qué producto es, o nuevo si el ítem es su mismo
 * producto único. A lo mejor un ítem pasó de ser modelo A a modelo B y sólo
 * se cambia de grupo. El dropdown debe tener 1) los ítems que son únicos en
 * el proyecto 2) los productos que ya tienen varios ítems agrupados».
 */

/** Un modelo del catálogo. `precio` es POR PIEZA y viene en CENTAVOS. */
export interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  precio: number;
  moneda: string;
  /** Cuántos ítems del proyecto le apuntan, y cuántas piezas son en total.
   *  Sólo vienen en la lista del dropdown. */
  items?: number;
  piezas?: number;
}

/** Un ítem que todavía es su propio producto único. Escogerlo desde otro
 *  ítem es decir «somos el mismo modelo», y eso es lo que escribe el
 *  producto. */
export interface ItemUnico {
  id: string;
  clave: string | null;
  nombre: string;
  tipo: string;
  cantidad: number;
  /** En CENTAVOS. */
  monto: number;
  precio_pieza: number;
  moneda: string;
  estado: string;
}

/** Las dos listas del dropdown. No escribe nada. */
export async function productosDelProyecto(
  proyecto_id: string,
): Promise<{ productos: Producto[]; unicos: ItemUnico[] }> {
  const r = await pedir<{ productos: Producto[]; unicos: ItemUnico[] }>(`${base(proyecto_id)}/productos`);
  return { productos: r.productos ?? [], unicos: r.unicos ?? [] };
}

/** Cambiar un ítem de grupo. Tres formas de decirlo:
 *
 *   · `{ producto_id }`  entra a un producto que ya existe;
 *   · `{ desde_item }`   «es el mismo modelo que aquél»: escribe el producto
 *                        a partir de ese ítem único y mete a los dos;
 *   · `{ solo: true }`   se sale y vuelve a ser su propio producto único.
 *
 *  Entrar HEREDA EL PRECIO del producto. Salirse no se lo quita: la pieza se
 *  queda con el que ya tenía. Vuelve el precio de venta del proyecto antes y
 *  después, en CENTAVOS. */
export async function asignarProducto(
  item_id: string,
  args: { producto_id?: string; desde_item?: string; solo?: boolean },
): Promise<{ producto: Producto | null; venta_antes: number; venta_despues: number }> {
  const r = await pedir<{ producto: Producto | null; venta_antes: number; venta_despues: number }>(
    `/orgs/${org()}/items/${encodeURIComponent(item_id)}/producto`,
    { method: 'POST', body: args },
  );
  return { producto: r.producto, venta_antes: r.venta_antes, venta_despues: r.venta_despues };
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
