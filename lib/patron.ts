/* patron101 (investor101) dentro de dash101: rondas, ofertas, préstamos y el
 * directorio de quienes le prestan a la empresa.
 *
 * Mike, 20-nov-2026: «hay que meter patron101 a dash también. Igual que
 * bill101». Lo de QUIEN DIRIGE se rehízo aquí, en el menú «Préstamos»; la
 * API es la misma (`/orgs/:o/inversion/*`, contrato 0.82.0 en adelante) y no
 * cambió: dash101 ya era una de las apps que administran (`X-App: dash101`).
 * Lo de QUIEN PRESTA —su estado de cuenta, ofrecer en una ronda— se queda en
 * patron.suite101.app: esa gente no es de la empresa y no entra a dash101.
 *
 * DOS COSAS QUE VIENEN DE PATRON101 Y SE QUEDAN:
 *
 * 1. AQUÍ NO SE HACE NINGUNA CUENTA DE INTERESES. La tabla que se ve mientras
 *    se teclea la calcula la API (`POST /inversion/simular`), para que la
 *    pantalla, el estado de cuenta de quien presta y el flujo no puedan decir
 *    cosas distintas.
 *
 * 2. CENTAVOS ADENTRO, PESOS AFUERA, y la tasa en puntos base. A diferencia
 *    de `lib/inversion.ts` (los pagos, que convierte a pesos al llegar), lo
 *    de este archivo viaja como lo manda la API hasta el momento de pintarse.
 */

import { ErrorFiscal, emp, type Fila } from './bill';
import { apiBase, org } from './fuente';

export { pesos, aCentavos, enPesos, dia, falta, momento, diasEntre, mensajeDe, type Fila } from './bill';
import { pesos, dia } from './bill';

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ─────────────── dinero y tasa ─────────────── */

/** Sin centavos cuando son cerrados: para cifras grandes de un vistazo. */
export const pesosCorto = (centavos: unknown): string => {
  const n = Math.round(Number(centavos) || 0);
  return n % 100 === 0 ? `${n < 0 ? '−' : ''}$${(Math.abs(n) / 100).toLocaleString('es-MX')}` : pesos(n);
};

/** «2.5» → 250 puntos base. Vacío o basura → null. */
export const aPuntos = (texto: unknown): number | null => {
  const limpio = String(texto ?? '').replace(/[%\s]/g, '');
  if (!limpio || !/^\d+(\.\d{0,2})?$/.test(limpio)) return null;
  return Math.round(Number(limpio) * 100);
};
/** 250 → «2.5», para la caja del formulario. */
export const enPuntos = (pb: unknown): string => (pb === null || pb === undefined || pb === '' ? '' : String(Number(pb) / 100));
/** «2.5 % mensual». */
export const tasa = (tipo: unknown, pb: unknown): string => {
  const n = (Number(pb) / 100).toFixed(2).replace(/\.?0+$/, '');
  return `${n} % ${tipo === 'mensual' ? 'mensual' : tipo === 'anual' ? 'anual' : 'por todo el plazo'}`;
};

/* ─────────────── fechas ─────────────── */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const diaLargo = (d: unknown): string => {
  if (!d) return '';
  const [a, m, x] = String(d).slice(0, 10).split('-').map(Number);
  return `${x} de ${MESES_LARGOS[m - 1]} de ${a}`;
};
export const diaConSemana = (d: unknown): string => {
  if (!d) return '';
  const [a, m, x] = String(d).slice(0, 10).split('-').map(Number);
  return `${DIAS[new Date(Date.UTC(a, m - 1, x)).getUTCDay()]} ${x} ${MESES[m - 1]}`;
};
export const sumarDias = (d: string, n: number): string => {
  const [a, m, x] = d.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, x) + n * 86400000).toISOString().slice(0, 10);
};

/* ─────────────── la API ─────────────── */

const ERRORES: Record<string, string> = {
  correo_repetido: 'Ese correo ya es de otra persona del directorio.',
  en_uso: 'Ya tiene préstamos u ofertas: se desactiva, no se borra.',
  ronda_no_esta_abierta: 'La ronda no está abierta.',
  ronda_vencida: 'La fecha límite de la ronda ya pasó.',
  ronda_cerrada: 'La ronda ya está cerrada.',
  ronda_no_es_borrador: 'La ronda ya no es un borrador.',
  oferta_ya_resuelta: 'Esa oferta ya se resolvió.',
  prestamo_ya_arranco: 'El préstamo ya arrancó: eso ya no se puede cambiar así.',
  prestamo_cerrado: 'El préstamo ya está cerrado.',
  prestamo_no_activo: 'El préstamo no está activo.',
  pago_ya_hecho: 'Ese pago ya estaba registrado.',
  capital_no_cuadra: 'El capital de los pagos pendientes tiene que sumar exactamente lo que se debe.',
  fechas_no_cuadran: 'Con el dinero llegando ese día, las fechas de pago acordadas ya no caben.',
  archivo_no_aceptado: 'Ese tipo de archivo no se acepta: sube un PDF o una foto (JPG, PNG).',
  archivo_muy_grande: 'El archivo pasa de 10 MB.',
  cuenta_desconocida: 'Esa cuenta ya no existe.',
  app_inactiva: 'La empresa no tiene patron101: los préstamos no están prendidos.',
  sin_permiso: 'Los préstamos los lleva quien dirige la empresa (dueño o administración).',
};

/** `/orgs/:o/inversion<ruta>`. Con `body` y sin `method`, es POST. Los
 *  rechazos llegan en palabras: la API las manda por campo (`errores`) o en
 *  `mensaje`, y se enseñan tal cual, que para eso las escribió. */
export async function inv<T = any>(ruta = '', opciones: { method?: string; body?: unknown } = {}): Promise<T> {
  try {
    return await emp<T>(`/inversion${ruta}`, opciones);
  } catch (e) {
    if (e instanceof ErrorFiscal) {
      const d = e.detalle;
      const dichas = d && typeof d === 'object'
        ? (d.errores && typeof d.errores === 'object' ? Object.values(d.errores).join(' ') : typeof d.mensaje === 'string' ? d.mensaje : '')
        : '';
      const texto = dichas || ERRORES[e.cual];
      if (texto) throw new ErrorFiscal(e.cual, texto, e.estado, e.detalle);
    }
    throw e;
  }
}

/** Las cuentas de la empresa (para decir a cuál llegó un depósito). */
export const cuentasDeLaEmpresa = (): Promise<{ filas: Fila[] }> => emp('/cuentas');

/** Un papel guardado: el navegador lo abre con la sesión. */
export const ligaArchivo = (id: string): string => `${apiBase()}/orgs/${org()}/inversion/archivos/${encodeURIComponent(id)}`;

export type DatosDeArchivo = { prestamo_id: string; pago_id?: string; clase: 'comprobante_deposito' | 'contrato_firmado' | 'comprobante_pago' | 'otro' };
export function subirArchivo(archivo: File, datos: DatosDeArchivo): Promise<Fila> {
  const forma = new FormData();
  forma.set('archivo', archivo);
  for (const [k, v] of Object.entries(datos)) if (v) forma.set(k, v);
  return inv('/archivos', { method: 'POST', body: forma });
}

/* ─────────────── los nombres de las cosas ─────────────── */

type Tono = 'bien' | 'ojo' | 'mal' | 'azul' | '';
export const ESTADO_RONDA: Record<string, [string, Tono]> = { borrador: ['Borrador', ''], abierta: ['Abierta', 'bien'], cerrada: ['Cerrada', 'azul'], cancelada: ['Cancelada', 'mal'] };
export const ESTADO_PRESTAMO: Record<string, [string, Tono]> = { por_depositar: ['Por depositar', 'ojo'], activo: ['Activo', 'bien'], liquidado: ['Liquidado', 'azul'], cancelado: ['Cancelado', 'mal'] };
export const ESTADO_OFERTA: Record<string, [string, Tono]> = { pendiente: ['Por revisar', 'ojo'], aprobada: ['Aceptada', 'bien'], rechazada: ['No entró', 'mal'], retirada: ['Retirada', ''] };
export const CLASE_DE_PAPEL: Record<string, string> = { comprobante_deposito: 'Comprobante del depósito', contrato_firmado: 'Pagaré firmado', comprobante_pago: 'Comprobante de pago', otro: 'Otro' };

const CADA: Record<string, string> = { semanal: 'cada semana', quincenal: 'cada 15 días', mensual: 'cada mes' };
/** Cómo se paga, en una frase. */
export const comoSePaga = (c: Fila): string => (c.esquema === 'unico'
  ? `Un solo pago el ${dia(c.fecha_vencimiento)}`
  : `${c.num_pagos} pagos, ${CADA[c.frecuencia] || ''}`);

/** «18 % anual»: a cuánto equivale la ronda en tasa anual simple, para que
 *  quien presta la compare con un número que conoce (Mike, 9-oct-2026). La
 *  cuenta la hace la API (`ejemplo.tasa_anual_pb`); si la tasa ya es anual
 *  no se repite. */
export const anual = (c: Fila): string => {
  const pb = c?.ejemplo?.tasa_anual_pb;
  if (c?.tipo_tasa === 'anual' || pb == null || pb <= 0) return '';
  return `${(Math.round(pb / 10) / 10).toFixed(1).replace(/\.0$/, '')} % anual`;
};

/** Por qué no salió un correo de aviso. */
export const MOTIVO_CORREO: Record<string, string> = {
  sin_correo: 'no tiene correo', correo_apagado_fuera_de_produccion: 'en este entorno de pruebas el correo no sale',
  correo_no_configurado: 'el correo no está configurado', correo_no_salio: 'el servicio de correo falló',
};

/* ─────────────── las condiciones de un préstamo ─────────────── */

/** Lo tecleado en el formulario de condiciones, tal cual (texto). */
export interface Cond {
  monto: string;
  tipo_tasa: 'mensual' | 'anual' | 'fija';
  tasa: string;
  esquema: 'unico' | 'parcialidades';
  fecha_inicio: string;
  fecha_vencimiento: string;
  frecuencia: 'semanal' | 'quincenal' | 'mensual';
  num_pagos: string;
  fecha_primer_pago: string;
}

/** De lo que da la API (una ronda, un préstamo) a lo que va en las cajas. */
export const condDe = (v: Fila = {}): Cond => ({
  monto: v.monto === null || v.monto === undefined ? '' : String(Number(v.monto) / 100),
  tipo_tasa: v.tipo_tasa === 'anual' || v.tipo_tasa === 'fija' ? v.tipo_tasa : 'mensual',
  tasa: enPuntos(v.tasa_pb ?? ''),
  esquema: v.esquema === 'parcialidades' ? 'parcialidades' : 'unico',
  fecha_inicio: v.fecha_inicio || '',
  fecha_vencimiento: v.fecha_vencimiento || '',
  frecuencia: v.frecuencia === 'semanal' || v.frecuencia === 'quincenal' ? v.frecuencia : 'mensual',
  num_pagos: v.num_pagos === null || v.num_pagos === undefined ? '' : String(v.num_pagos),
  fecha_primer_pago: v.fecha_primer_pago || '',
});

/** Lo tecleado, dicho como lo espera la API. Lo que no se pudo leer queda en
 *  `null` y la API lo rechaza con sus palabras. `monto`: `undefined` deja el
 *  de la caja; un número lo fija (una ronda simula con un ejemplo); `false`
 *  no lo manda (las condiciones de una ronda no llevan monto). */
export function leerCond(c: Cond, monto?: number | false): Fila {
  const parcial = c.esquema === 'parcialidades';
  const limpio = c.monto.replace(/[$,\s]/g, '');
  const out: Fila = {
    tipo_tasa: c.tipo_tasa, tasa_pb: aPuntos(c.tasa || '0'), esquema: c.esquema, fecha_inicio: c.fecha_inicio || null,
    frecuencia: parcial ? c.frecuencia : null,
    num_pagos: parcial ? (/^\d+$/.test(c.num_pagos.trim()) ? Number(c.num_pagos) : null) : null,
    fecha_primer_pago: parcial ? (c.fecha_primer_pago || null) : null,
    fecha_vencimiento: parcial ? null : (c.fecha_vencimiento || null),
  };
  if (monto === false) return out;
  out.monto = monto !== undefined ? monto : (limpio && /^\d+(\.\d{0,2})?$/.test(limpio) ? Math.round(Number(limpio) * 100) : null);
  return out;
}
