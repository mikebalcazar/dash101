/* Lectura desde `suite101-api`, con la misma firma que los módulos de `lib/`.
 *
 * Cada función devuelve exactamente lo que devolvía su gemela de Firestore,
 * para que las pantallas no cambien. Lo que Firestore guardaba como caché
 * (`saldo_actual`, `productos[].pagado`, `cliente_nombre`…) aquí se arma con
 * una lista por tabla y un join en memoria: una empresa de taller tiene
 * decenas de filas, no millones, y la API tope cada lista en 500.
 *
 * Regla: **primero lectura, comparando contra el cuadre**. Nada de aquí
 * escribe. */

import * as A from './adaptar';
import { listar, listarCompleto, obtener, pedir, yo } from './cliente';
import { org } from '../fuente';
import type { Cliente, Cuenta, Movimiento, Negocio, Opex, Proveedor, Proyecto, Usuario } from '@/types/schema';

const porId = <T extends { id: string }>(filas: T[]): Map<string, T> => new Map(filas.map((f) => [f.id, f]));

/* ─────────────── negocios ─────────────── */

export async function listNegocios(uid: string): Promise<Negocio[]> {
  const filas = await listar<A.FilaNegocio>('negocios');
  return filas.map((f) => A.negocio(f, uid)).sort((a, b) => String(b.creado_at) < String(a.creado_at) ? -1 : 1);
}

export async function getNegocio(id: string, uid = ''): Promise<Negocio | null> {
  const f = await obtener<A.FilaNegocio>('negocios', id);
  return f ? A.negocio(f, uid) : null;
}

/* ─────────────── cuentas ─────────────── */

export async function listCuentas(negocioId: string): Promise<Cuenta[]> {
  const [cuentas, movimientos] = await Promise.all([
    listar<A.FilaCuenta>('cuentas', { negocio_id: negocioId }),
    listar<A.FilaMovimiento>('movimientos', { negocio_id: negocioId }),
  ]);
  return cuentas.map((c) => A.cuenta(c, movimientos));
}

export async function getCuenta(id: string): Promise<Cuenta | null> {
  const f = await obtener<A.FilaCuenta>('cuentas', id);
  if (!f) return null;
  const movimientos = await listar<A.FilaMovimiento>('movimientos', { cuenta_id: id });
  return A.cuenta(f, movimientos);
}

/* ─────────────── clientes y proveedores ─────────────── */

export async function listClientes(negocioId: string): Promise<Cliente[]> {
  return (await listar<A.FilaCliente>('clientes', { negocio_id: negocioId })).map(A.cliente);
}

/** «¿No te refieres a…?» — la regla la contesta la API (contrato 0.23.0), no
 *  esta pantalla: tres apps con tres ideas de qué se parece a qué son tres
 *  reglas, y la que falle va a ser la que nadie probó. */
export async function clientesParecidos(nombre: string, negocioId?: string): Promise<Cliente[]> {
  const q = new URLSearchParams({ nombre });
  if (negocioId) q.set('negocio_id', negocioId);
  const r = await pedir<{ parecidos: A.FilaCliente[] }>(`/orgs/${org()}/clientes/parecidos?${q}`);
  return r.parecidos.map(A.cliente);
}

export async function getCliente(id: string): Promise<Cliente | null> {
  const f = await obtener<A.FilaCliente>('clientes', id);
  return f ? A.cliente(f) : null;
}

export async function getClienteUid(clienteId: string): Promise<string | null> {
  const f = clienteId ? await obtener<A.FilaCliente>('clientes', clienteId) : null;
  return f?.portal_activo && f.usuario_id ? f.usuario_id : null;
}

export async function listProveedores(): Promise<Proveedor[]> {
  return (await listar<A.FilaProveedor>('proveedores')).map(A.proveedor);
}

export async function getProveedor(id: string): Promise<Proveedor | null> {
  const f = await obtener<A.FilaProveedor>('proveedores', id);
  return f ? A.proveedor(f) : null;
}

/* ─────────────── proyectos ─────────────── */

async function partesDeProyectos(negocioId: string) {
  const [partidas, items, movimientos, clientes, negocios] = await Promise.all([
    listar<A.FilaPartida>('partidas'),
    /* Sólo los vivos: el adaptador tira los cancelados de todos modos, y
     * pedirlos nada más los hace ocupar lugar contra el tope de 500 de la
     * API, empujando fuera a ítems vivos de proyectos recientes. Aquí no se
     * usa `listarCompleto` a propósito: esto pinta la LISTA de proyectos, y
     * en una empresa con años de trabajo pasar de 5,000 ítems vivos es
     * posible. Que la lista enseñe de menos un renglón de detalle se nota y
     * no rompe nada; que truene la pantalla de proyectos, sí. El detalle del
     * proyecto —el que decide qué se guarda— sí exige la lista completa. */
    listar<A.FilaItem>('items', { negocio_id: negocioId, estado: 'vendido' }),
    listar<A.FilaMovimiento>('movimientos', { negocio_id: negocioId }),
    listar<A.FilaCliente>('clientes', { negocio_id: negocioId }),
    listar<A.FilaNegocio>('negocios'),
  ]);
  return { partidas, items, movimientos, clientes: porId(clientes), negocios: porId(negocios) };
}

export async function listProyectos(negocioId: string): Promise<Proyecto[]> {
  const [filas, partes] = await Promise.all([listar<A.FilaProyecto>('proyectos', { negocio_id: negocioId }), partesDeProyectos(negocioId)]);
  return filas.map((f) => A.proyecto(f, partes));
}

export async function getProyecto(id: string): Promise<Proyecto | null> {
  const f = await obtener<A.FilaProyecto>('proyectos', id);
  if (!f) return null;
  const partes = await partesDeProyectos(f.negocio_id);
  /* Los ítems de ESTE proyecto, vivos, y completos.
   *
   * Tres cosas que costaron, las tres del mismo tope de 500 filas:
   *
   *   · se piden por proyecto y no de la lista del negocio entero, porque en
   *     una empresa con años de trabajo los de un proyecto reciente se caen
   *     del tope y la pantalla los enseña de menos;
   *   · se piden SÓLO LOS VIVOS. Los cancelados son los más viejos y la lista
   *     viene ordenada por fecha: en un proyecto muy editado llenan las 500
   *     primeras filas y empujan a los vivos fuera de la respuesta. Así se
   *     veía el proyecto de Mike el 20-sep: «Sin ítems» en pantalla y
   *     $6,473,790 de precio de venta, que era la cifra CORRECTA —ésa la suma
   *     la API en la base—. No faltaba nada; faltaba verlo;
   *   · y se piden con `listarCompleto`, que compara `total` contra lo que
   *     llegó y truena si falta. Enseñar de menos aquí no es un detalle de
   *     presentación: lo que la pantalla no enseña, al guardar se cancela. */
  const items = await listarCompleto<A.FilaItem>('items', { proyecto_id: id, estado: 'vendido' });
  return A.proyecto(f, { ...partes, items });
}

/** Los ítems del proyecto que TODAVÍA NO SE VENDEN: cotizados, sin precio.
 *
 *  Van aparte de `productos` y no revueltos con ellos, y es a propósito.
 *  `productos` es lo que el formulario del proyecto guarda, y el guardado
 *  marca VENDIDO todo lo que le llega. Si un cotizado entrara ahí, abrir el
 *  proyecto y guardar convertiría en venta una cotización que nadie cerró
 *  —las de quote101, sin ir más lejos— e inflaría el precio de venta con
 *  dinero que nunca entró.
 *
 *  Hoy los usa el bloque «traídos del plano»: las piezas que vinieron de la
 *  obra nacen cotizadas y en cero, y hay que poder verlas para ponerles
 *  precio. Sin esta lectura quedaban invisibles en dash101, que era un hueco
 *  de verdad: la pieza existía y no había dónde tocarla. */
export async function itemsSinPrecio(proyecto_id: string): Promise<Array<{ id: string; nombre: string; clave: string | null; tipo: string; monto: number; cantidad: number }>> {
  const filas = await listarCompleto<A.FilaItem>('items', { proyecto_id, estado: 'cotizado' });
  return filas.map((i) => ({
    id: i.id, nombre: i.nombre, clave: i.clave ?? null, tipo: i.tipo ?? '',
    monto: A.aPesos(i.monto), cantidad: Number(i.cantidad ?? 1),
  }));
}

/** Lo que está FUERA DEL ALCANCE del proyecto, en sus dos montones
 *  (contrato 0.31.0).
 *
 *  Mike, 20-sep: «hay ítems nuevos no aprobados e ítems cancelados. Para que
 *  un ítem se considere cancelado tiene que haber estado aprobado primero y
 *  luego cancelado. (…) Los no aprobados, a pesar de que tienen precio y toda
 *  la info, NO SUMAN en dash».
 *
 *  Se pide aparte de `productos` por lo mismo que `itemsSinPrecio`: el
 *  formulario del proyecto marca VENDIDO todo lo que le llega, así que un no
 *  aprobado metido ahí se volvería venta al primer guardado.
 *
 *  Quién es qué NO se decide aquí: lo dice `alcanceDeItem`, del contrato, que
 *  es el mismo archivo que leen la API y quell101. Tres pantallas con tres
 *  ideas de qué es un cancelado son tres reglas. */
export async function fueraDeAlcance(proyecto_id: string): Promise<{
  no_aprobados: ItemFuera[];
  cancelados: ItemFuera[];
}> {
  const [cotizados, cancelados] = await Promise.all([
    listarCompleto<A.FilaItem>('items', { proyecto_id, estado: 'cotizado' }),
    listarCompleto<A.FilaItem>('items', { proyecto_id, estado: 'cancelado' }),
  ]);
  const fuera = [...cotizados, ...cancelados].map((i) => ({
    id: i.id, nombre: i.nombre, clave: i.clave ?? null, tipo: i.tipo ?? '',
    descripcion: i.descripcion ?? '', monto: A.aPesos(i.monto), cantidad: Number(i.cantidad ?? 1),
    partida: String(i.partida ?? ''), motivo: i.cancelado_motivo ?? null,
    /* El alcance lo dice la API, resuelto. Aquí no se deduce de `estado` y
     * `aprobado_at`: esa cuenta vive en un solo lugar (el contrato), y la
     * pantalla la lee. */
    alcance: i.alcance ?? 'no_aprobado',
  }));
  return {
    no_aprobados: fuera.filter((i) => i.alcance === 'no_aprobado'),
    /* Los descartados —los que se quitaron SIN haber estado aprobados— no
     * son cancelados y no salen aquí: meterlos diría que se echó para atrás
     * una venta que nunca existió. Es la regla textual de Mike. */
    cancelados: fuera.filter((i) => i.alcance === 'cancelado'),
  };
}

export interface ItemFuera {
  id: string; nombre: string; clave: string | null; tipo: string; descripcion: string;
  monto: number; cantidad: number; partida: string; motivo: string | null;
  alcance: 'dentro' | 'no_aprobado' | 'cancelado' | 'descartado';
}

/* ─────────────── movimientos ─────────────── */

async function nombresDe(negocioId: string) {
  const [cuentas, proyectos, items, clientes] = await Promise.all([
    listar<A.FilaCuenta>('cuentas', { negocio_id: negocioId }),
    listar<A.FilaProyecto>('proyectos', { negocio_id: negocioId }),
    listar<A.FilaItem>('items', { negocio_id: negocioId }),
    listar<A.FilaCliente>('clientes', { negocio_id: negocioId }),
  ]);
  return { cuentas: porId(cuentas), proyectos: porId(proyectos), items: porId(items), clientes: porId(clientes) };
}

export async function listMovimientos(negocioId: string, opts?: { max?: number }): Promise<Movimiento[]> {
  const [filas, nombres] = await Promise.all([listar<A.FilaMovimiento>('movimientos', { negocio_id: negocioId }), nombresDe(negocioId)]);
  const lista = filas.map((f) => A.movimiento(f, nombres));
  lista.sort((a, b) => ((b.fecha as { toMillis: () => number }).toMillis() - (a.fecha as { toMillis: () => number }).toMillis()));
  return lista.slice(0, opts?.max ?? 100);
}

export async function listMovimientosByProyecto(proyectoId: string): Promise<Movimiento[]> {
  const p = await obtener<A.FilaProyecto>('proyectos', proyectoId);
  if (!p) return [];
  const [filas, nombres] = await Promise.all([listar<A.FilaMovimiento>('movimientos', { proyecto_id: proyectoId }), nombresDe(p.negocio_id)]);
  const lista = filas.map((f) => A.movimiento(f, nombres));
  lista.sort((a, b) => ((b.fecha as { toMillis: () => number }).toMillis() - (a.fecha as { toMillis: () => number }).toMillis()));
  return lista;
}

export async function getMovimiento(id: string): Promise<Movimiento | null> {
  const f = await obtener<A.FilaMovimiento>('movimientos', id);
  if (!f) return null;
  return A.movimiento(f, await nombresDe(f.negocio_id));
}

/* ─────────────── opex ─────────────── */

export async function listOpex(negocioId: string): Promise<Opex[]> {
  const [filas, cuentas] = await Promise.all([listar<A.FilaOpex>('opex', { negocio_id: negocioId }), listar<A.FilaCuenta>('cuentas', { negocio_id: negocioId })]);
  return filas.map((f) => A.opex(f, porId(cuentas)));
}

export async function getOpex(id: string): Promise<Opex | null> {
  const f = await obtener<A.FilaOpex>('opex', id);
  if (!f) return null;
  const cuentas = await listar<A.FilaCuenta>('cuentas', { negocio_id: f.negocio_id });
  return A.opex(f, porId(cuentas));
}

/* ─────────────── el usuario en sesión ─────────────── */

export async function getUserDoc(): Promise<Usuario | null> {
  const sesion = await yo();
  if (!sesion) return null;
  const negocios = await listar<A.FilaNegocio>('negocios');
  return A.usuario(sesion, org(), negocios.map((n) => n.id));
}
