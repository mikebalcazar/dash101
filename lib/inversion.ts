/* Los préstamos de investor101, vistos desde dash101 · contrato 0.82.0.
 *
 * Mike, 8-oct-2026, con botones: los pagos a los inversionistas SE REGISTRAN
 * AQUÍ, en dash101 —«un solo lugar de captura»— y se reflejan solos en
 * investor101. Y: «esto se tiene que reflejar en la proyección de flujos de
 * dash (…) desde dash donde tenemos déficit de flujos, poder seleccionar esa
 * parte y generar una ronda de inversión para cubrir ese flujo».
 *
 * Así que dash101 hace cuatro cosas con investor101, y nada más:
 *   1. lee lo que va a su flujo (pagos por salir, depósitos por entrar);
 *   2. registra un pago (deja los egresos) y le cuelga su comprobante;
 *   3. confirma un depósito recibido (deja el ingreso y arranca el préstamo);
 *   4. deja una ronda en borrador desde un hueco del flujo.
 * Las rondas, las ofertas, las tablas y el directorio se llevan en
 * investor101.
 *
 * Todo lo abre SÓLO quien dirige la empresa (dueño o administración): a los
 * demás la API contesta 403, y la pantalla lo dice en vez de adivinar. Si la
 * empresa no tiene investor101 contratada, contesta 403 `app_inactiva`.
 *
 * En PESOS de este lado; la API guarda centavos.
 */

import { ErrorApi, pedir } from './api/cliente';
import { aCentavos, aPesos } from './api/adaptar';
import { org } from './fuente';

const base = () => `/orgs/${org()}/inversion`;

/** Un pago que se le debe a un inversionista. */
export interface PagoDePrestamo {
  id: string;
  prestamo_id: string;
  folio: string;
  inversionista_nombre: string;
  numero: number;
  /** Cuántos pagos tiene el préstamo. */
  de: number;
  /** AAAA-MM-DD: cuándo toca. */
  fecha: string;
  /** En PESOS. */
  capital: number;
  interes: number;
  total: number;
  vencido: boolean;
  /** A dónde se le paga (sólo en el buzón de pagos). */
  banco?: string | null;
  clabe?: string | null;
  beneficiario?: string | null;
  /** `por_depositar`: el dinero todavía no llega, la fecha es estimada. */
  prestamo_estado?: 'activo' | 'por_depositar';
}

/** Un depósito aceptado que todavía no llega. */
export interface DepositoPorRecibir {
  id: string;
  folio: string;
  inversionista_nombre: string;
  /** En PESOS. */
  monto: number;
  /** AAAA-MM-DD, estimada. */
  fecha: string;
  ronda_id: string | null;
}

type Fila = Record<string, unknown>;
const pago = (f: Fila): PagoDePrestamo => ({
  ...(f as unknown as PagoDePrestamo),
  capital: aPesos(f.capital as number), interes: aPesos(f.interes as number), total: aPesos(f.total as number),
});
const deposito = (f: Fila): DepositoPorRecibir => ({ ...(f as unknown as DepositoPorRecibir), monto: aPesos(f.monto as number) });

/** ¿La API dijo «esto no es tuyo»? Quien no dirige, o la empresa sin
 *  investor101. No es un error: es la respuesta. */
export const sinInversion = (e: unknown): boolean =>
  e instanceof ErrorApi && (e.estado === 403 || e.error === 'sin_permiso' || e.error === 'app_inactiva');

/** Las palabras de un rechazo, como las dice la API. */
function enClaro(e: unknown): never {
  if (e instanceof ErrorApi) {
    const d = e.detalle as { errores?: Record<string, string>; mensaje?: string } | undefined;
    const palabras = d?.errores ? Object.values(d.errores).join(' ') : d?.mensaje ?? '';
    if (palabras) throw new Error(palabras);
    if (e.error === 'pago_ya_hecho') throw new Error('Ese pago ya estaba registrado.');
    if (e.error === 'prestamo_ya_arranco') throw new Error('Ese depósito ya estaba confirmado.');
    if (e.error === 'prestamo_no_activo') throw new Error('El préstamo todavía no arranca: falta confirmar su depósito.');
  }
  throw e;
}

/** Lo que va al flujo proyectado: lo que va a salir y lo que va a entrar. */
export async function getFlujoDeInversion(): Promise<{ pagos: PagoDePrestamo[]; depositos: DepositoPorRecibir[] }> {
  const r = await pedir<{ pagos: Fila[]; depositos: Fila[] }>(`${base()}/flujo`);
  return { pagos: r.pagos.map(pago), depositos: r.depositos.map(deposito) };
}

/** El buzón: lo pendiente de pagar de los préstamos que ya arrancaron. */
export async function listPagosDePrestamos(): Promise<PagoDePrestamo[]> {
  return (await pedir<{ filas: Fila[] }>(`${base()}/pagos`)).filas.map(pago);
}

export interface PagoHecho {
  pago: PagoDePrestamo & { pagado_fecha: string };
  /** Los egresos que dejó: capital e interés (el que valga cero no nace). */
  movimientos: string[];
  /** Con este pago ya no queda nada pendiente. */
  liquidado: boolean;
}

/** Registrar un pago: deja los egresos en la cuenta y avisa a quien prestó. */
export async function pagarPagoDePrestamo(id: string, d: { cuenta_id: string; fecha?: string; nota?: string }): Promise<PagoHecho> {
  try {
    const r = await pedir<{ pago: Fila; movimientos: string[]; liquidado: boolean }>(`${base()}/pagos/${encodeURIComponent(id)}/pagar`, { method: 'POST', body: d });
    return { pago: pago(r.pago) as PagoHecho['pago'], movimientos: r.movimientos, liquidado: r.liquidado };
  } catch (e) { return enClaro(e); }
}

/** El comprobante de un pago. Lo ve quien prestó, en su estado de cuenta. */
export async function subirComprobanteDePago(prestamo_id: string, pago_id: string, archivo: File): Promise<{ id: string; nombre: string }> {
  const forma = new FormData();
  forma.set('archivo', archivo);
  forma.set('prestamo_id', prestamo_id);
  forma.set('pago_id', pago_id);
  forma.set('clase', 'comprobante_pago');
  try { return await pedir<{ id: string; nombre: string }>(`${base()}/archivos`, { method: 'POST', body: forma }); } catch (e) { return enClaro(e); }
}

/** Confirmar que un depósito llegó: nace el ingreso y arranca el préstamo. */
export async function confirmarDeposito(prestamo_id: string, d: { cuenta_id: string; fecha?: string }): Promise<{ movimiento_id: string }> {
  try { return await pedir<{ movimiento_id: string }>(`${base()}/prestamos/${encodeURIComponent(prestamo_id)}/recibido`, { method: 'POST', body: d }); } catch (e) { return enClaro(e); }
}

export interface RondaBorrador { id: string; folio: string; nombre: string; url: string }

/** Dejar una ronda en BORRADOR desde un hueco del flujo. Se termina —monto,
 *  tasa, a quién avisar— en investor101; `url` lleva directo ahí. */
export async function crearRondaDesdeElFlujo(d: {
  nombre: string;
  /** En PESOS. */
  monto: number;
  fecha_inicio: string;
  fecha_vencimiento: string;
  origen: { desde: string; hasta: string; deficit: number };
}): Promise<RondaBorrador> {
  try {
    return await pedir<RondaBorrador>(`${base()}/rondas`, {
      method: 'POST',
      body: {
        nombre: d.nombre, monto_meta: aCentavos(d.monto), fecha_inicio: d.fecha_inicio, fecha_vencimiento: d.fecha_vencimiento,
        origen: { desde: d.origen.desde, hasta: d.origen.hasta, deficit: aCentavos(d.origen.deficit) },
      },
    });
  } catch (e) { return enClaro(e); }
}

/** A dónde vive la app de quienes prestan, desde donde esté dash101.
 *
 *  PARA LA GENTE SE LLAMA patron101 (Mike, 8-oct-2026: «esta plataforma se va
 *  a llamar patron101»); por dentro —app, llave, Worker, repo— sigue siendo
 *  `investor101`, que no se renombra. Por eso en el dominio propio la casa es
 *  patron101.taller101.com y en workers.dev (staging) el Worker conserva su
 *  nombre: dash101-staging.x → investor101-staging.x. */
export function hostDePatron(host: string): string {
  return host.replace(/^dash101/, host.endsWith('.taller101.com') ? 'patron101' : 'investor101');
}
export function urlInvestor(ruta = ''): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.protocol}//${hostDePatron(window.location.host)}/${ruta ? `#/${ruta}` : ''}`;
}

/** Lo del flujo, dicho como lo espera `lib/proyeccion.ts`. */
export function prestamosParaElFlujo(f: { pagos: PagoDePrestamo[]; depositos: DepositoPorRecibir[] }): Array<{ id: string; nombre: string; tipo: 'ingreso' | 'egreso'; monto: number; fecha: string }> {
  return [
    ...f.pagos.map((g) => ({ id: g.id, nombre: `${g.folio} · pago ${g.numero} de ${g.de} a ${g.inversionista_nombre}`, tipo: 'egreso' as const, monto: g.total, fecha: g.fecha })),
    ...f.depositos.map((d) => ({ id: d.id, nombre: `${d.folio} · depósito de ${d.inversionista_nombre}`, tipo: 'ingreso' as const, monto: d.monto, fecha: d.fecha })),
  ];
}
