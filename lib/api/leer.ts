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
import { listar, obtener, pedir, yo } from './cliente';
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
    listar<A.FilaItem>('items', { negocio_id: negocioId }),
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
  /* Los ítems de ESTE proyecto se piden aparte, y no se sacan de la lista del
   * negocio entero, porque esa lista viene topada en 500 filas: en una
   * empresa con años de trabajo —y con los ítems cancelados, que también
   * ocupan lugar— los de un proyecto reciente se caen del tope y la pantalla
   * los enseña de menos. Y lo que la pantalla no enseña, al guardar se
   * cancela. Así el tope se aplica por proyecto, donde 500 ítems es mucho. */
  const items = await listar<A.FilaItem>('items', { proyecto_id: id });
  return A.proyecto(f, { ...partes, items });
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
