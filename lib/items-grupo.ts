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
 *  Con `producto_id` las piezas entran a un modelo QUE YA EXISTE y adoptan
 *  su precio, en vez de escribir uno nuevo (contrato 0.37.0). Ahí el nombre
 *  y el precio se ignoran: el modelo ya tiene los suyos.
 *
 *  Las piezas heredan el precio del producto, así que el precio de venta del
 *  proyecto SÍ se puede mover. Por eso vuelve el antes y el después: la
 *  pantalla lo enseña y quien agrupó ve lo que hizo. En CENTAVOS. */
export async function agrupar(
  proyecto_id: string,
  args: { items: string[]; nombre?: string; codigo?: string; precio?: number; producto_id?: string },
): Promise<{ producto: Producto; items: number; nuevo: boolean; venta_antes: number; venta_despues: number }> {
  const r = await pedir<{ producto: Producto; items: unknown[]; nuevo: boolean; venta_antes: number; venta_despues: number }>(
    `${base(proyecto_id)}/agrupar`,
    { method: 'POST', body: args },
  );
  return {
    producto: r.producto, items: r.items?.length ?? 0, nuevo: r.nuevo,
    venta_antes: r.venta_antes, venta_despues: r.venta_despues,
  };
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
/* ────────── separar (contrato 0.36.0) ──────────
 *
 * Mike, 20-sep, con HOLCIM enfrente: «ya se hizo un desastre y ahora no puedo
 * separar los ítems para agruparlos en otro producto. O mejor sepárame todos
 * los ítems de puertas otra vez».
 *
 * Dos cosas que desde la pantalla se ven igual: un ítem metido en un producto
 * —sacarlo de uno en uno son 29 clics— y un renglón que viene de la FUSIÓN
 * del contrato 0.30.0, que borraba los renglones que absorbía y por eso no se
 * puede partir. Estas dos funciones atienden las dos.
 */

/** Lo que devolvió un separar. El dinero no se mueve: `venta_antes` y
 *  `venta_despues` salen iguales salvo que algo raro pase, y la pantalla lo
 *  dice. En CENTAVOS. */
export interface Separado {
  /** Cuántos renglones se sacaron de su producto. */
  separados: number;
  /** Cuántos renglones borrados por la fusión vieja se devolvieron. */
  reconstruidos: number;
  /** Cuántas piezas del plano se repartieron a su renglón, por código. */
  piezas_repartidas: number;
  venta_antes: number;
  venta_despues: number;
}

/** Separar UN ítem: sacarlo de su producto y, si es un renglón fusionado,
 *  devolver los renglones que se tragó. */
export async function separarItem(item_id: string): Promise<Separado> {
  const r = await pedir<{ reconstruidos: unknown[]; piezas_repartidas: number; venta_antes: number; venta_despues: number }>(
    `/orgs/${org()}/items/${encodeURIComponent(item_id)}/separar`,
    { method: 'POST' },
  );
  return {
    separados: 1, reconstruidos: r.reconstruidos?.length ?? 0, piezas_repartidas: r.piezas_repartidas,
    venta_antes: r.venta_antes, venta_despues: r.venta_despues,
  };
}

/** Separar TODAS las piezas de un producto en una obra, de un golpe. */
export async function separarProducto(proyecto_id: string, producto_id: string): Promise<Separado> {
  return pedir<Separado>(`${base(proyecto_id)}/separar`, { method: 'POST', body: { producto_id } });
}

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

/* ─────────────── agregar al alcance y sacar del alcance (contrato 0.64.0) ───────────────
 *
 * Mike, 20-sep: «se debe poder cancelar algún ítem ya sea desde quell o
 * desde dash, y se refleja en los 2». Mike, 2-oct: «solo existirá "en
 * alcance" o "fuera de alcance" (…) solo en la bitácora sí aparecerá como
 * "se sacó del alcance" y si se agrega de nuevo aparecerá después "se agregó
 * al alcance" con su fecha y quién la agregó».
 *
 * Ya no hay cancelado ni descartado que clasificar: sacar deja el ítem
 * fuera, y la historia la cuenta la bitácora que guarda la API.
 */

/** Agregar al alcance: entra y desde ahí suma en el proyecto. */
export async function aprobarItem(id: string): Promise<void> {
  await pedir(`/orgs/${org()}/items/${encodeURIComponent(id)}/aprobar`, { method: 'POST' });
}

/** Sacar del alcance, con su motivo. Queda fuera; no hay otra respuesta. */
export async function sacarItem(id: string, motivo?: string): Promise<void> {
  await pedir(`/orgs/${org()}/items/${encodeURIComponent(id)}/sacar`, { method: 'POST', body: { motivo } });
}

/** Un renglón de la bitácora del alcance, tal como lo manda la API. */
export interface MovimientoAlcance {
  id: string; item_id: string; proyecto_id: string | null;
  accion: 'entra' | 'sale';
  /** Correo de quien lo movió; `null` en lo sembrado por la migración 0028. */
  quien: string | null; app: string | null; motivo: string | null; at: string;
}

/** Lo que dice cada movimiento, en palabras de Mike. */
export const NOMBRE_MOVIMIENTO_ALCANCE: Record<MovimientoAlcance['accion'], string> = {
  entra: 'Se agregó al alcance',
  sale: 'Se sacó del alcance',
};

/** La bitácora del alcance de un ítem, del más viejo al más nuevo. */
export async function bitacoraAlcance(id: string): Promise<MovimientoAlcance[]> {
  const r = await pedir<{ movimientos: MovimientoAlcance[] }>(`/orgs/${org()}/items/${encodeURIComponent(id)}/alcance`);
  return r.movimientos ?? [];
}

/* ─────────────── borrar lo cancelado (contrato 0.38.0) ───────────────
 *
 * Mike, 21-sep: «ya todo lo cancelado lo puedes eliminar por completo».
 *
 * Dos llamadas al mismo sitio y la diferencia es una bandera, a propósito:
 * la vista previa TIENE que ser el mismo cálculo que el borrado. Si fueran
 * dos cuentas distintas, la pantalla prometería una cosa y la base haría
 * otra, y esto no se deshace.
 */

export interface CensoDeCancelados {
  /** Todo lo que se SACÓ del alcance (0.64.0: fuera y con `cancelado_at`).
   *  Un requerimiento que nadie ha decidido no entra aquí. */
  total: number;
  /** Cuántos se borraron de verdad. En seco siempre es 0. */
  borrados: number;
  /** De los sacados, los que alguna vez estuvieron en alcance. */
  cancelados: number;
  /** De los sacados, los que nunca entraron al alcance. */
  descartados: number;
  /** `monto` en CENTAVOS. */
  se_van: Array<{ id: string; clave: string | null; nombre: string; monto: number; piezas: number }>;
  se_quedan: Array<{ id: string; clave: string | null; nombre: string; monto: number; porque: string[] }>;
  /** Piezas del plano que quedan sin ítem. La pieza es de quell101 y no se
   *  borra desde aquí. */
  piezas_sin_item: number;
  /** En CENTAVOS, como todo este archivo. Un cancelado nunca sumó, así que
   *  estos dos tienen que ser iguales; se enseñan para que se vea, no para
   *  creerlo. */
  venta_antes: number;
  venta_despues: number;
}

const censo = (proyecto_id: string, modo: 'seco' | 'borrar') =>
  pedir<CensoDeCancelados>(`${base(proyecto_id)}/borrar-cancelados`, { method: 'POST', body: { modo } });

/** Qué pasaría. No escribe nada. */
export const revisarCancelados = (proyecto_id: string) => censo(proyecto_id, 'seco');

/** Hazlo. No se deshace. */
export const borrarCancelados = (proyecto_id: string) => censo(proyecto_id, 'borrar');
