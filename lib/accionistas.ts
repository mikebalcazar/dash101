/* Accionistas y retiros de utilidades · contrato 0.57.0.
 *
 * Mike, 30-sep-2026: «El dash, necesito un módulo de accionistas donde se
 * registren pagos a los accionistas como retiro de utilidades».
 *
 * El accionista es una fila de la suite (`accionistas`, por negocio). El
 * RETIRO NO ES UNA TABLA: es un egreso en `movimientos` con la categoría
 * `retiro_utilidades` y la contraparte `accionista`. Se registra con el
 * mismo `createMovimiento` de siempre —pesos con decimales, `Date`— para
 * que baje el saldo de la cuenta de la que salió, aparezca en Movimientos,
 * en la conciliación y en el flujo, y se pueda corregir o borrar como
 * cualquier otro movimiento. La categoría es lo que lo aparta de los
 * gastos: un retiro no es un gasto del negocio, es utilidad que se reparte.
 *
 * Sólo API (como la raya): no hay versión de Firestore de esto. */

import * as A from './api/adaptar';
import { ErrorApi, listar, listarCompleto, pedir } from './api/cliente';
import { org } from './fuente';
import { createMovimiento } from './movimientos';
import { CATEGORIA_RETIRO_UTILIDADES, type Accionista } from '@/types/schema';

export interface FilaAccionista {
  id: string; negocio_id: string; nombre: string; nombre_norm: string; rfc: string | null; correo: string | null;
  telefono: string | null; porcentaje: number | null; notas: string | null; activo: boolean; creado_at: string;
}

export interface AccionistaInput {
  nombre: string;
  rfc?: string;
  correo?: string;
  telefono?: string;
  /** Participación 0-100; vacío = sin capturar. */
  porcentaje?: number | '';
  notas?: string;
}

export interface Retiro {
  id: string;
  accionista_id: string | null;
  accionista_nombre: string;
  cuenta_id: string;
  cuenta_nombre: string;
  /** pesos */
  monto: number;
  /** AAAA-MM-DD */
  fecha: string;
  descripcion: string;
}

const ruta = (resto = '') => `/orgs/${org()}/accionistas${resto}`;

export function accionista(f: FilaAccionista): Accionista {
  return {
    id: f.id, negocio_id: f.negocio_id, nombre: f.nombre, rfc: f.rfc ?? '', correo: f.correo ?? '', telefono: f.telefono ?? '',
    porcentaje: f.porcentaje === null || f.porcentaje === undefined ? null : Number(f.porcentaje), notas: f.notas ?? '', activo: !!f.activo,
  };
}

/** Lo que la API contesta cuando un dato no pasa, dicho en claro: «La
 *  participación es un número entre 0 y 100», y no `datos_invalidos (400)`. */
function enClaro(e: unknown): never {
  if (e instanceof ErrorApi) {
    const d = (e.detalle ?? {}) as { errores?: Record<string, string>; falta?: string | string[]; motivo?: string };
    if (e.error === 'datos_invalidos' && d.errores) throw new Error(Object.values(d.errores).join(' '));
    if (e.error === 'datos_invalidos' && d.falta) throw new Error(`Falta: ${Array.isArray(d.falta) ? d.falta.join(', ') : d.falta}.`);
    if (e.error === 'sin_permiso') throw new Error(`No tienes permiso para esto${d.motivo ? `: ${d.motivo}` : '.'}`);
    if (e.error === 'en_uso') throw new Error('Este accionista tiene retiros registrados: dalo de baja en vez de borrarlo.');
    if (e.error === 'sin_sesion') throw new Error('La sesión terminó. Vuelve a entrar.');
  }
  throw e;
}

const limpio = (d: AccionistaInput) => ({
  nombre: d.nombre.trim(),
  rfc: d.rfc?.trim() || null, correo: d.correo?.trim() || null, telefono: d.telefono?.trim() || null,
  porcentaje: d.porcentaje === '' || d.porcentaje === undefined ? null : d.porcentaje,
  notas: d.notas?.trim() || null,
});

/** Quién está en los expedientes de roster101 (contrato 0.60.0), para dar de
 *  alta a un accionista sin volver a teclear sus datos. Mike, 1-oct-2026:
 *  «se debe poder jalar al accionista de la base de datos de roster». */
export interface PersonaDeRoster { id: string; nombre: string; rfc: string; correo: string; puesto: string }
export async function personasDeRoster(): Promise<PersonaDeRoster[]> {
  const r = await pedir<{ personas: Array<{ id: string; nombre: string; rfc: string | null; correo: string | null; puesto: string | null }> }>(ruta('/de-roster'));
  return r.personas.map((p) => ({ id: p.id, nombre: p.nombre, rfc: p.rfc ?? '', correo: p.correo ?? '', puesto: p.puesto ?? '' }));
}

/** Todos del negocio, activos primero y en orden de nombre. */
export async function listAccionistas(negocio_id: string): Promise<Accionista[]> {
  const filas = (await listarCompleto<FilaAccionista>('accionistas', { negocio_id })).map(accionista);
  return filas.sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'));
}

/** `_negocio_id` ya no viaja (0.61.0): la API cuelga al accionista de la empresa. */
export async function createAccionista(_negocio_id: string, d: AccionistaInput): Promise<Accionista> {
  try {
    return accionista(await pedir<FilaAccionista>(ruta(), { method: 'POST', body: limpio(d) }));
  } catch (e) { enClaro(e); }
}

export async function updateAccionista(id: string, d: Partial<AccionistaInput>): Promise<Accionista> {
  const cuerpo: Record<string, unknown> = {};
  if (d.nombre !== undefined) cuerpo.nombre = d.nombre.trim();
  for (const k of ['rfc', 'correo', 'telefono', 'notas'] as const) if (d[k] !== undefined) cuerpo[k] = d[k]?.trim() || null;
  if (d.porcentaje !== undefined) cuerpo.porcentaje = d.porcentaje === '' ? null : d.porcentaje;
  try {
    return accionista(await pedir<FilaAccionista>(ruta(`/${id}`), { method: 'PATCH', body: cuerpo }));
  } catch (e) { enClaro(e); }
}

/** Dar de baja no borra: los retiros que ya se le hicieron siguen apuntando
 *  a esta persona y tienen que seguir sumando en su renglón. */
export async function darDeBaja(id: string, activo = false): Promise<Accionista> {
  try {
    return accionista(await pedir<FilaAccionista>(ruta(`/${id}`), { method: 'PATCH', body: { activo } }));
  } catch (e) { enClaro(e); }
}

/** Los retiros del negocio, el más reciente primero. Se leen los egresos
 *  COMPLETOS (no las 500 de siempre) y se quedan los de la categoría. */
export async function listRetiros(negocio_id: string): Promise<Retiro[]> {
  const [egresos, cuentas] = await Promise.all([
    listarCompleto<A.FilaMovimiento>('movimientos', { negocio_id, tipo: 'egreso' }),
    listar<A.FilaCuenta>('cuentas', { negocio_id }),
  ]);
  const nombreDeCuenta = new Map(cuentas.map((c) => [c.id, c.nombre]));
  return egresos
    .filter((m) => m.categoria === CATEGORIA_RETIRO_UTILIDADES)
    .map((m) => ({
      id: m.id, accionista_id: m.contraparte_id, accionista_nombre: m.contraparte_nombre ?? '',
      cuenta_id: m.cuenta_id, cuenta_nombre: nombreDeCuenta.get(m.cuenta_id) ?? '', monto: A.aPesos(m.monto),
      fecha: m.fecha.slice(0, 10), descripcion: m.descripcion ?? '',
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

export interface RetiroInput {
  negocio_id: string;
  accionista: Accionista;
  cuenta_id: string;
  cuenta_nombre: string;
  /** pesos */
  monto: number;
  fecha: Date;
  descripcion?: string;
}

/** Un retiro: un egreso de la cuenta que se escoja, a nombre del accionista,
 *  con la categoría que lo aparta de los gastos. Devuelve el id del movimiento. */
export async function registrarRetiro(uid: string, d: RetiroInput): Promise<string> {
  if (!(d.monto > 0)) throw new Error('El monto del retiro tiene que ser mayor que cero.');
  return createMovimiento(uid, {
    tipo: 'egreso', monto: d.monto, fecha: d.fecha, cuenta_id: d.cuenta_id, cuenta_nombre: d.cuenta_nombre,
    contraparte_tipo: 'accionista', contraparte_id: d.accionista.id, contraparte_nombre: d.accionista.nombre,
    /* El tipo todavía lo pide; escribir.ts ya no lo manda a la API. */
    negocio_id: d.negocio_id, categoria: CATEGORIA_RETIRO_UTILIDADES,
    descripcion: d.descripcion?.trim() || `Retiro de utilidades · ${d.accionista.nombre}`,
  });
}

/** Cuánto se ha retirado por accionista, en pesos, y el total. */
export function retiradoPor(retiros: Retiro[]): { por: Map<string, number>; total: number } {
  const por = new Map<string, number>();
  let total = 0;
  for (const r of retiros) {
    total += r.monto;
    if (r.accionista_id) por.set(r.accionista_id, (por.get(r.accionista_id) ?? 0) + r.monto);
  }
  return { por, total };
}
