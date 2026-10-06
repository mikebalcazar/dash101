/* Lectura desde `suite101-api`, con la misma firma que los módulos de `lib/`.
 *
 * Cada función devuelve exactamente lo que devolvía su gemela de Firestore,
 * para que las pantallas no cambien. Lo que Firestore guardaba como caché
 * (`saldo_actual`, `items[].pagado`, `cliente_nombre`…) aquí se arma con
 * una lista por tabla y un join en memoria: una empresa de taller tiene
 * decenas de filas, no millones, y la API tope cada lista en 500.
 *
 * Regla: **primero lectura, comparando contra el cuadre**. Nada de aquí
 * escribe. */

import * as A from './adaptar';
import { listar, listarCompleto, obtener, pedir, yo } from './cliente';
import { org } from '../fuente';
import type { Cliente, Cuenta, Movimiento, Opex, Proveedor, Proyecto, Usuario } from '@/types/schema';

const porId = <T extends { id: string }>(filas: T[]): Map<string, T> => new Map(filas.map((f) => [f.id, f]));

/* ─────────────── cuentas ─────────────── */

export async function listCuentas(): Promise<Cuenta[]> {
  const [cuentas, movimientos] = await Promise.all([
    listar<A.FilaCuenta>('cuentas'),
    listar<A.FilaMovimiento>('movimientos'),
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

export async function listClientes(): Promise<Cliente[]> {
  return (await listar<A.FilaCliente>('clientes')).map(A.cliente);
}

/** «¿No te refieres a…?» — la regla la contesta la API (contrato 0.23.0), no
 *  esta pantalla: tres apps con tres ideas de qué se parece a qué son tres
 *  reglas, y la que falle va a ser la que nadie probó. */
export async function clientesParecidos(nombre: string): Promise<Cliente[]> {
  const q = new URLSearchParams({ nombre });
  const r = await pedir<{ parecidos: A.FilaCliente[] }>(`/orgs/${org()}/clientes/parecidos?${q}`);
  return r.parecidos.map(A.cliente);
}

/** El cliente que YA tiene ese correo, si lo hay (contrato 0.65.0). Mike,
 *  4-oct: «en caso de querer generar un nuevo cliente con el email de otro
 *  que ya existe, avisar que ya existe un cliente, presentar su info y
 *  preguntar si es ese cliente». La API contesta el resumen; aquí se vuelve
 *  un `Cliente` para que la pantalla lo pinte como a cualquiera. */
export async function clientePorCorreo(correo: string): Promise<Cliente | null> {
  const c = correo.trim();
  if (!c) return null;
  const q = new URLSearchParams({ correo: c });
  const r = await pedir<{ por_correo: A.FilaCliente | null }>(`/orgs/${org()}/clientes/parecidos?${q}`);
  return r.por_correo ? A.cliente(r.por_correo) : null;
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

async function partesDeProyectos() {
  const [partidas, items, movimientos, anticipos, clientes] = await Promise.all([
    listar<A.FilaPartida>('partidas'),
    /* Sólo los vivos: el adaptador tira los cancelados de todos modos, y
     * pedirlos nada más los hace ocupar lugar contra el tope de 500 de la
     * API, empujando fuera a ítems vivos de proyectos recientes. Aquí no se
     * usa `listarCompleto` a propósito: esto pinta la LISTA de proyectos, y
     * en una empresa con años de trabajo pasar de 5,000 ítems vivos es
     * posible. Que la lista enseñe de menos un renglón de detalle se nota y
     * no rompe nada; que truene la pantalla de proyectos, sí. El detalle del
     * proyecto —el que decide qué se guarda— sí exige la lista completa. */
    listar<A.FilaItem>('items', { estado: 'vendido' }),
    /* Hasta 5,000, no las 500 de fábrica: de aquí sale `pagado` por ítem
     * (Σ ingresos con su item_id) y `cobrado` por proyecto, y con el tope
     * de 500 los movimientos viejos se caen de la respuesta y los ítems de
     * un proyecto de hace meses salen «sin pagar». Se vio el 1-oct en la
     * empresa demo, que pasó de 500 movimientos al juntar sus registros. */
    listar<A.FilaMovimiento>('movimientos', { limite: '5000' }),
    // 0.70.0 · los anticipos repartidos por ítem (candado del cronograma)
    listar<A.FilaMovimientoItem>('movimiento_items', { limite: '5000' }),
    listar<A.FilaCliente>('clientes'),
  ]);
  return { partidas, items, movimientos, clientes: porId(clientes), anticipos };
}

export async function listProyectos(): Promise<Proyecto[]> {
  const [filas, partes] = await Promise.all([listar<A.FilaProyecto>('proyectos'), partesDeProyectos()]);
  return filas.map((f) => A.proyecto(f, partes));
}

export async function getProyecto(id: string): Promise<Proyecto | null> {
  const f = await obtener<A.FilaProyecto>('proyectos', id);
  if (!f) return null;
  const partes = await partesDeProyectos();
  /* Los ítems de ESTE proyecto, vivos, y completos.
   *
   * Tres cosas que costaron, las tres del mismo tope de 500 filas:
   *
   *   · se piden por proyecto y no de la lista de la empresa entera, porque en
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
 *  Van aparte de `items` y no revueltos con ellos, y es a propósito.
 *  `items` es lo que el formulario del proyecto guarda, y el guardado
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

/** Lo que está FUERA DEL ALCANCE del proyecto, en UNA lista (contrato 0.64.0).
 *
 *  Mike, 2-oct: «solo existirá "en alcance" o "fuera de alcance". Así hay una
 *  lista unificada de las cosas que están requeridas pero aún no se
 *  confirman, o se confirmaron y se cancelaron, pero no pasan a otra lista,
 *  regresan a fuera de alcance».
 *
 *  Se pide aparte de `items` por lo mismo que `itemsSinPrecio`: el
 *  formulario del proyecto marca VENDIDO todo lo que le llega, así que un
 *  fuera metido ahí se volvería venta al primer guardado.
 *
 *  Desde la 0.64.0 fuera es `estado = 'cotizado'` y nada más: la API ya no
 *  escribe 'cancelado'. `sacado` dice si a ése lo SACARON (trae
 *  `cancelado_at`) o si nadie lo ha decidido; la historia completa —quién,
 *  cuándo, por qué— se lee con `bitacoraAlcance`. */
export async function fueraDeAlcance(proyecto_id: string): Promise<ItemFuera[]> {
  const fuera = await listarCompleto<A.FilaItem>('items', { proyecto_id, estado: 'cotizado' });
  return fuera.map((i) => ({
    id: i.id, nombre: i.nombre, clave: i.clave ?? null, tipo: i.tipo ?? '',
    descripcion: i.descripcion ?? '', monto: A.aPesos(i.monto), cantidad: Number(i.cantidad ?? 1),
    partida: String(i.partida ?? ''), motivo: i.cancelado_motivo ?? null,
    sacado: !!i.cancelado_at, cancelado_at: i.cancelado_at ?? null,
    /* El alcance lo dice la API, resuelto. Aquí no se deduce. */
    alcance: i.alcance ?? 'fuera',
  }));
}

export interface ItemFuera {
  id: string; nombre: string; clave: string | null; tipo: string; descripcion: string;
  monto: number; cantidad: number; partida: string; motivo: string | null;
  /** Lo SACARON del alcance (estuvo dentro o era un requerimiento que se
   *  descartó). `false` = nadie lo ha decidido todavía. */
  sacado: boolean; cancelado_at: string | null;
  alcance: 'dentro' | 'fuera';
}

/* ─────────────── movimientos ─────────────── */

async function nombresDe() {
  const [cuentas, proyectos, items, clientes] = await Promise.all([
    listar<A.FilaCuenta>('cuentas'),
    listar<A.FilaProyecto>('proyectos'),
    listar<A.FilaItem>('items'),
    listar<A.FilaCliente>('clientes'),
  ]);
  return { cuentas: porId(cuentas), proyectos: porId(proyectos), items: porId(items), clientes: porId(clientes) };
}

const millis = (t: unknown): number => (t && typeof (t as { toMillis?: unknown }).toMillis === 'function' ? (t as { toMillis: () => number }).toMillis() : 0);

/** Del más reciente al más antiguo DE VERDAD: por el día del movimiento y,
 *  dentro del mismo día, por el momento en que se capturó. Hasta el
 *  1-oct-2026 sólo contaba el día, y dentro de hoy el orden era el que
 *  devolviera la base: el primero capturado quedaba hasta arriba. Mike: «el
 *  que esté hasta arriba es el último que se hizo, no el primero que se hizo
 *  del día presente». */
export const masRecientePrimero = (a: Movimiento, b: Movimiento): number =>
  millis(b.fecha) - millis(a.fecha) || millis(b.creado_at) - millis(a.creado_at);

export async function listMovimientos(opts?: { max?: number }): Promise<Movimiento[]> {
  /* Hasta 5,000 y no las 500 de omisión: Mike quiere el historial, y con
   * 500 la pantalla se quedaba ciega a lo de hoy en cuanto la empresa pasó
   * de 500 movimientos (1-oct-2026). La API los manda del más reciente al
   * más viejo desde 0.60.0; aquí se vuelve a ordenar por si fuera vieja. */
  const [filas, nombres] = await Promise.all([listar<A.FilaMovimiento>('movimientos', { limite: '5000' }), nombresDe()]);
  const lista = filas.map((f) => A.movimiento(f, nombres));
  lista.sort(masRecientePrimero);
  return lista.slice(0, opts?.max ?? 100);
}

export async function listMovimientosByProyecto(proyectoId: string): Promise<Movimiento[]> {
  const p = await obtener<A.FilaProyecto>('proyectos', proyectoId);
  if (!p) return [];
  const [filas, nombres] = await Promise.all([listar<A.FilaMovimiento>('movimientos', { proyecto_id: proyectoId, limite: '5000' }), nombresDe()]);
  const lista = filas.map((f) => A.movimiento(f, nombres));
  lista.sort(masRecientePrimero);
  return lista;
}

/** Todos los movimientos de UNA cuenta, completos (no las 500 de siempre),
 *  del más reciente al más antiguo. Mike, 1-oct-2026: «cuando me meto a una
 *  cuenta, quiero ver el historial de los movimientos específicos de esa
 *  cuenta». */
export async function listMovimientosDeCuenta(cuentaId: string): Promise<Movimiento[]> {
  const c = await obtener<A.FilaCuenta>('cuentas', cuentaId);
  if (!c) return [];
  const [filas, nombres] = await Promise.all([listarCompleto<A.FilaMovimiento>('movimientos', { cuenta_id: cuentaId }), nombresDe()]);
  const lista = filas.map((f) => A.movimiento(f, nombres));
  lista.sort(masRecientePrimero);
  return lista;
}

export async function getMovimiento(id: string): Promise<Movimiento | null> {
  const f = await obtener<A.FilaMovimiento>('movimientos', id);
  if (!f) return null;
  return A.movimiento(f, await nombresDe());
}

/* ─────────────── opex ─────────────── */

export async function listOpex(): Promise<Opex[]> {
  const [filas, cuentas] = await Promise.all([listar<A.FilaOpex>('opex'), listar<A.FilaCuenta>('cuentas')]);
  return filas.map((f) => A.opex(f, porId(cuentas)));
}

export async function getOpex(id: string): Promise<Opex | null> {
  const f = await obtener<A.FilaOpex>('opex', id);
  if (!f) return null;
  const cuentas = await listar<A.FilaCuenta>('cuentas');
  return A.opex(f, porId(cuentas));
}

/* ─────────────── el usuario en sesión ─────────────── */

export async function getUserDoc(): Promise<Usuario | null> {
  const sesion = await yo();
  if (!sesion) return null;
  return A.usuario(sesion, org());
}

/** 0.70.0 · Lo que de un pago se repartió entre ítems (el anticipo). En pesos. */
export async function anticiposDeMovimiento(movimiento_id: string): Promise<Array<{ id: string; item_id: string; monto: number }>> {
  const filas = await listar<A.FilaMovimientoItem>('movimiento_items', { movimiento_id });
  return filas.map((f) => ({ id: f.id, item_id: f.item_id, monto: A.aPesos(f.monto) }));
}
