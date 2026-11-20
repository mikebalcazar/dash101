/* Lo fiscal que era bill101, dentro de dash101.
 *
 * Mike, 19-nov-2026: «vamos a fusionar bill101 con dash101. bill101 va a
 * entrar en el menú "Fiscal" de dash101». Las pantallas de bill101 se
 * rehicieron aquí; la API es la misma (`/orgs/:o/fiscal/*`, contrato 0.85.0
 * en adelante) y no cambió: dash101 ya le hablaba.
 *
 * DOS COSAS QUE VIENEN DE BILL101 Y SE QUEDAN:
 *
 * 1. AQUÍ NO SE HACE NINGUNA CUENTA DE IMPUESTOS. El IVA, el ISR, los totales
 *    de un mes y el saldo corrido los calcula la API (`/fiscal/impuestos`,
 *    `/fiscal/estado-de-cuenta`); la pantalla los enseña. Así la pantalla, el
 *    estado de cuenta y lo que vea el contador no pueden decir cosas
 *    distintas.
 *
 * 2. CENTAVOS ADENTRO, PESOS AFUERA. A diferencia de `lib/fiscal.ts` (que
 *    convierte a pesos al llegar), lo de este archivo viaja en centavos
 *    enteros hasta el momento de pintarse (`pesos()`), como en bill101: son
 *    muchas cifras que la API ya sumó, y convertirlas una por una al llegar
 *    era pedir un redondeo de más.
 */

import { ErrorApi, pedir } from './api/cliente';
import { apiBase, org } from './fuente';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Un renglón de la API, como llega. */
export type Fila = Record<string, any>;

/* ─────────────── dinero ─────────────── */

export const pesos = (centavos: unknown): string => {
  const n = Math.round(Number(centavos) || 0);
  return `${n < 0 ? '−' : ''}$${(Math.abs(n) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
/** «50,000.50» → 5000050. Vacío → 0 si `vacioEsCero`; basura → null. */
export const aCentavos = (texto: unknown, vacioEsCero = false): number | null => {
  const limpio = String(texto ?? '').replace(/[$,\s]/g, '');
  if (!limpio) return vacioEsCero ? 0 : null;
  if (!/^\d+(\.\d{0,2})?$/.test(limpio)) return null;
  return Math.round(Number(limpio) * 100);
};
export const enPesos = (centavos: unknown): string =>
  (centavos === null || centavos === undefined || centavos === '' ? '' : String(Number(centavos) / 100));

/* ─────────────── el coeficiente: diezmilésimas adentro, 0.0523 afuera ─────────────── */

/** «0.0523» → 523. Vacío → null (todavía no lo dan). Basura → undefined. */
export const aCoeficiente = (texto: unknown): number | null | undefined => {
  const limpio = String(texto ?? '').trim();
  if (!limpio) return null;
  if (!/^0?\.\d{1,4}$/.test(limpio) && limpio !== '0') return undefined;
  return Math.round(Number(limpio) * 10000);
};
export const enCoeficiente = (dm: unknown): string => (dm === null || dm === undefined ? '' : (Number(dm) / 10000).toFixed(4));
export const enPorciento = (pb: unknown): string => `${(Number(pb) / 100).toFixed(2).replace(/\.?0+$/, '')} %`;

/* ─────────────── fechas: AAAA-MM-DD, leídas como día y no como instante ─────────────── */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const dia = (d: unknown): string => {
  if (!d) return '';
  const [a, m, x] = String(d).slice(0, 10).split('-').map(Number);
  return `${x} ${MESES[m - 1]} ${a}`;
};
/** «2026-03» → «marzo 2026». */
export const mes = (ym: string): string => {
  const [a, m] = String(ym).split('-').map(Number);
  return `${MESES_LARGOS[m - 1]} ${a}`;
};
export const mesCorto = (ym: string): string => MESES[Number(String(ym).split('-')[1]) - 1];
/** El mes anterior o siguiente de «AAAA-MM». */
export const mesMas = (ym: string, n: number): string => {
  const [a, m] = String(ym).split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}`;
};
export const diasEntre = (desde: string, hasta: string): number => {
  const u = (d: string) => { const [a, m, x] = d.split('-').map(Number); return Date.UTC(a, m - 1, x); };
  return Math.round((u(hasta) - u(desde)) / 86400000);
};
/** «en 5 días», «mañana», «hoy», «hace 3 días». `hoy` viene de la API. */
export const falta = (d: string, hoy: string): string => {
  const n = diasEntre(hoy, d);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
};
export const momento = (iso: unknown): string => {
  if (!iso) return '';
  const f = new Date(String(iso));
  return `${f.getDate()} ${MESES[f.getMonth()]} ${f.getFullYear()}, ${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`;
};
/** Un instante, dicho con la hora del centro de México. */
export const cuando = (iso: unknown): string =>
  (iso ? new Date(String(iso)).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }) : '');

/* ─────────────── la API, con los errores en palabras ─────────────── */

const ERRORES: Record<string, string> = {
  sin_respuesta: 'No hubo forma de llegar al servidor. Revisa tu señal.',
  respuesta_no_json: 'El servidor contestó algo que no se entiende. Vuelve a intentar.',
  sin_sesion: 'Tu sesión se acabó. Vuelve a entrar.',
  sin_permiso: 'No tienes permiso para eso.',
  no_encontrado: 'Eso ya no existe.',
  falta_rfc_empresa: 'Falta el RFC de la empresa. Ponlo en Ajustes: sin él no se sabe si una factura es emitida o recibida.',
  demasiadas_facturas: 'Son demasiadas en un solo archivo. Un .zip puede traer hasta 20 facturas.',
  subida_muy_grande: 'El archivo es muy pesado (más de 8 MB).',
  cfdi_desconocido: 'Esa factura ya no existe.',
  movimiento_desconocido: 'Ese movimiento ya no existe.',
  liga_desconocida: 'Esa liga ya no estaba.',
  monto_invalido: 'Ese monto no se puede usar.',
  coeficiente_invalido: 'El coeficiente va como 0.0523: cuatro decimales y menor que 1.',
  periodo_invalido: 'Ese periodo no es válido.',
  fecha_invalida: 'Falta la fecha, o no es una fecha.',
  regimen_invalido: 'El régimen es la clave de tres dígitos del SAT (601, 626…).',
  cp_invalido: 'El código postal son cinco dígitos.',
  solo_recibidas: 'Eso sólo aplica a las facturas que la empresa recibe.',
  org_sin_pago: 'La suscripción de la empresa venció.',
  sin_fiel: 'Primero hay que subir la FIEL de la empresa.',
  fiel_clave_incorrecta: 'La contraseña no abre la llave (.key), o ese .key no es el de la FIEL.',
  fiel_es_sello: 'Ese certificado es un SELLO (CSD), el de timbrar. Para bajar del SAT hace falta la FIEL (e.firma).',
  fiel_no_casan: 'La llave (.key) no es la de ese certificado (.cer): son de FIEL distintas, o una es del sello.',
  fiel_vencida: 'Esa FIEL ya venció. Se renueva en el SAT y se sube la nueva.',
  fiel_aun_no_vale: 'Esa FIEL todavía no empieza a valer.',
  fiel_cer_ilegible: 'El archivo .cer no es un certificado.',
  fiel_cer_sin_rfc: 'Ese certificado no es del SAT: no trae RFC.',
  fiel_key_ilegible: 'El archivo .key no es una llave privada.',
  fiel_de_otro_rfc: 'Esa FIEL es de otro RFC, no del de la empresa.',
  sin_pac: 'Primero hay que poner la cuenta de Facturama (Ajustes).',
  pac_credenciales: 'Facturama no acepta ese usuario y contraseña.',
  pac_no_responde: 'Facturama no contestó. Vuelve a intentar en un momento.',
  pac_rechaza: 'Facturama no aceptó la factura.',
  pac_de_otro_rfc: 'Esa cuenta de Facturama factura con otro RFC, no con el de la empresa.',
  pac_sin_sello: 'La cuenta de Facturama no tiene cargado el sello (CSD). Se carga en el portal de Facturama.',
  pac_clave_no_abre: 'La contraseña guardada de Facturama no se pudo abrir: ponla otra vez en Ajustes.',
  falta_cp_empresa: 'Falta el código postal fiscal de la empresa (Ajustes).',
  emision_repetida: 'Esa misma factura se está timbrando ahora mismo.',
  borrador_invalido: 'Falta algo en la factura.',
  serie_invalida: 'La serie son letras y números, hasta diez.',
  folio_invalido: 'El folio es un número entero mayor que cero.',
  no_se_emitio_aqui: 'Sólo se puede cancelar ante el SAT una factura que se timbró desde aquí.',
  ya_cancelada: 'Esa factura ya está cancelada.',
  motivo_invalido: 'El motivo de cancelación es una clave de 01 a 04.',
  falta_uuid_sustituto: 'Con el motivo 01 va el folio fiscal de la factura que la sustituye.',
  excede_la_factura: 'Esos pagos suman más de lo que le falta a la factura. Quita alguno.',
  pagos_invalidos: 'Alguno de esos pagos no se puede ligar a esta factura.',
  cfdi_cancelada: 'Esa factura está cancelada.',
  no_es_factura: 'Sólo una factura se liga con pagos.',
};

function palabras(cual: string, detalle: any): string {
  if (detalle && typeof detalle === 'object' && typeof detalle.mensaje === 'string') return detalle.mensaje;
  if (ERRORES[cual]) return ERRORES[cual];
  if (detalle && typeof detalle === 'object' && typeof detalle.motivo === 'string') return detalle.motivo;
  return `Algo no salió bien (${cual}). Vuelve a intentar.`;
}

/** Lo que truena aquí: el mensaje ya viene en palabras, y `cual` es el error
 *  de la API para quien quiera prender por él. */
export class ErrorFiscal extends Error {
  constructor(public cual: string, mensaje: string, public estado: number, public detalle?: any) {
    super(mensaje);
  }
}

async function conPalabras<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ErrorApi) throw new ErrorFiscal(e.error, palabras(e.error, e.detalle), e.estado, e.detalle);
    if (e instanceof ErrorFiscal) throw e;
    throw new ErrorFiscal('sin_respuesta', ERRORES.sin_respuesta, 0);
  }
}

type Opciones = { method?: string; body?: unknown };
/** `/orgs/:o<ruta>`: lo de la empresa. */
export const emp = <T = any>(ruta = '', opciones: Opciones = {}): Promise<T> =>
  conPalabras(() => pedir<T>(`/orgs/${org()}${ruta}`, opciones.body !== undefined && !opciones.method ? { ...opciones, method: 'POST' } : opciones));
/** `/orgs/:o/fiscal<ruta>`. Con `body` y sin `method`, es POST. */
export const fis = <T = any>(ruta = '', opciones: Opciones = {}): Promise<T> => emp<T>(`/fiscal${ruta}`, opciones);
/** Quién soy: para saber si dirige la empresa. */
export const quienSoy = <T = any>(): Promise<T> => conPalabras(() => pedir<T>('/yo'));

export const mensajeDe = (e: unknown): string => (e instanceof Error ? e.message : 'Algo no salió bien. Vuelve a intentar.');

/** Ligas que el navegador abre con la sesión (bajar el XML, ver el PDF). */
export const ligaXml = (id: string): string => `${apiBase()}/orgs/${org()}/fiscal/cfdi/${encodeURIComponent(id)}/xml`;
export const ligaPdf = (id: string): string => `${apiBase()}/orgs/${org()}/fiscal/cfdi/${encodeURIComponent(id)}/pdf`;
export const ligaPdfPrefactura = (id: string): string => `${apiBase()}/orgs/${org()}/fiscal/prefacturas/${encodeURIComponent(id)}/pdf`;

/** Por qué no salió un correo, en palabras (enviarCorreo de la API). */
export const motivoCorreo = (m: unknown): string =>
  (({ correo_no_configurado: 'la suite no tiene correo configurado', correo_apagado_fuera_de_produccion: 'fuera de producción el correo está apagado', correo_no_salio: 'el servicio de correo no lo aceptó' }) as Record<string, string>)[String(m)] || String(m || 'no se sabe por qué');

/* ─────────────── las palabras de una factura ─────────────── */

export const TIPO: Record<string, string> = { I: 'Factura', E: 'Nota de crédito', P: 'Complemento de pago', N: 'Nómina' };
export const TRATO: Record<string, [string, string]> = {
  normal: ['Gasto del año', 'Se deduce completo y su IVA se acredita.'],
  inversion: ['Inversión (activo)', 'Su IVA se acredita, pero no es gasto del año: se deprecia. No entra a las deducciones.'],
  no_deducible: ['No deducible', 'No entra ni al IVA ni a las deducciones.'],
};
export const FORMA: Record<string, string> = { '01': 'Efectivo', '02': 'Cheque', '03': 'Transferencia', '04': 'Tarjeta de crédito', '28': 'Tarjeta de débito', '99': 'Por definir' };
export const MOTIVO: Record<string, string> = {
  no_es_de_la_empresa: 'No es de esta empresa: ni la emitió ni la recibió.',
  no_es_cfdi: 'No es una factura (CFDI).',
  xml_ilegible: 'El archivo está dañado o no es un XML.',
  xml_vacio: 'El archivo viene vacío.',
  xml_muy_grande: 'El archivo es demasiado grande para ser una factura.',
  sin_timbre: 'No trae timbre: todavía no es una factura.',
  version_no_soportada: 'Es de una versión muy vieja (anterior a 2017).',
  uuid_invalido: 'Su folio fiscal no tiene forma de folio fiscal.',
  traslado_no_es_fiscal: 'Es un comprobante de traslado: no es ingreso ni gasto.',
  nomina_ajena: 'Es un recibo de nómina de otra empresa.',
  dos_veces_en_la_subida: 'Venía dos veces en lo que subiste.',
  total_invalido: 'Su total no se pudo leer.',
  fecha_invalida: 'Su fecha no se pudo leer.',
  sin_rfc: 'Le falta el RFC de quien emite o de quien recibe.',
};
/** A quién se le ve la cara de una factura: su serie y folio, o el final de
 *  su folio fiscal. */
export const folio = (f: Fila): string => ([f.serie, f.folio].filter(Boolean).join('-') || `…${String(f.uuid || '').slice(-6)}`);
export const signo = (f: Fila): number => (f.tipo_comprobante === 'E' ? -1 : 1);
export const estaCubierta = (f: Fila): boolean => Number(f.aplicado || 0) >= Number(f.total || 0) - 100;

export const NOTA_ESTIMACION = 'Es una estimación con lo que está facturado y cargado aquí. No es la declaración ni sustituye a tu contador.';

/* ─────────────── subir facturas ─────────────── */

export interface ResultadoDeSubida { nombre?: string; uuid?: string; resultado: string; motivo?: string; ligada_a?: unknown[] }

/** Sube lo escogido. Los XML van en tandas de veinte; un .zip va solo, tal
 *  cual. Devuelve todos los resultados juntos. */
export async function subirFacturas(archivos: File[], avance: (hechas: number, total: number) => void): Promise<ResultadoDeSubida[]> {
  const xmls: File[] = [], zips: File[] = [], otros: File[] = [];
  for (const a of archivos) {
    if (/\.zip$/i.test(a.name)) zips.push(a);
    else if (/\.xml$/i.test(a.name) || /xml/.test(a.type)) xmls.push(a);
    else otros.push(a);
  }
  const resultados: ResultadoDeSubida[] = otros.map((a) => ({ nombre: a.name, resultado: 'rechazada', motivo: 'no_es_cfdi' }));
  let hechas = 0;
  const total = xmls.length + zips.length;
  for (let i = 0; i < xmls.length; i += 20) {
    const tanda = xmls.slice(i, i + 20);
    const textos = await Promise.all(tanda.map((a) => a.text()));
    const r = await fis<{ resultados: ResultadoDeSubida[] }>('/xml', { body: { xmls: textos } });
    r.resultados.forEach((x, k) => resultados.push({ ...x, nombre: tanda[k].name }));
    hechas += tanda.length; avance(hechas, total);
  }
  for (const z of zips) {
    const forma = new FormData();
    forma.set('archivo', z);
    const r = await fis<{ resultados: ResultadoDeSubida[] }>('/xml', { body: forma });
    resultados.push(...r.resultados);
    hechas += 1; avance(hechas, total);
  }
  return resultados;
}

/* ─────────────── preguntarle al SAT ─────────────── */

/** Revisa en el SAT, de diez en diez, hasta cinco vueltas o hasta que el SAT
 *  deje de contestar. Con `ids`, sólo ésas. */
export async function verificarEnSat(ids: string[] | null, avance: (revisadas: number) => void): Promise<{ revisadas: number; canceladas: number; sin: number }> {
  let revisadas = 0, canceladas = 0, sin = 0;
  for (let vuelta = 0; vuelta < (ids ? 1 : 5); vuelta++) {
    avance(revisadas);
    const r = await fis<{ revisadas: number; canceladas: number; sin_respuesta: number }>('/verificar', { body: ids ? { ids } : { limite: 10 } });
    revisadas += r.revisadas; canceladas += r.canceladas; sin += r.sin_respuesta;
    if (r.sin_respuesta || r.revisadas < 10) break;
  }
  return { revisadas, canceladas, sin };
}
