/* El cliente HTTP de `suite101-api`, y la sesión.
 *
 * Toda respuesta de la API tiene la forma `{ok:true, data}` o
 * `{ok:false, error, detalle}`; aquí se desenvuelve y un `ok:false` se vuelve
 * una excepción con el error en snake_case, para que quien llama pueda
 * prender por él (`sin_sesion`, `campo_no_permitido`…).
 *
 * `X-App` se manda desde aquí aunque el proxy (Netlify hoy, el Worker en la
 * fase 4) lo vuelva a poner: el proxy lo sobrescribe, así que no cambia nada
 * en producción, y en `next dev` y en las pruebas de node, que hablan con el
 * Worker sin proxy, es lo que hace que la API sepa quién le habla. */

import { apiBase, org } from '../fuente';

export type Respuesta<T> = { ok: true; data: T } | { ok: false; error: string; detalle?: unknown };

export class ErrorApi extends Error {
  constructor(public error: string, public estado: number, public detalle?: unknown) {
    super(`${error} (${estado})${detalle ? ' · ' + JSON.stringify(detalle) : ''}`);
  }
}

/* Fuera del navegador no hay cookie jar: se guarda la cookie a mano, como en
 * la prueba de humo de la API. En el navegador la lleva el propio navegador
 * (`credentials: 'include'`) y esto queda vacío. */
let galleta = '';
const enNavegador = typeof window !== 'undefined';

/** El viaje: cabeceras, galleta y `fetch`. Lo comparten las dos formas de
 *  pedir, para que la sesión se guarde en un solo lugar. */
async function llamar(ruta: string, opciones: { method?: string; body?: unknown }): Promise<Response> {
  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json', 'X-App': 'dash101' };
  if (!enNavegador && galleta) cabeceras.Cookie = galleta;
  const r = await fetch(`${apiBase()}${ruta}`, {
    method: opciones.method ?? 'GET',
    headers: cabeceras,
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
    credentials: 'include',
  });
  if (!enNavegador) {
    const puesta = r.headers.get('set-cookie');
    if (puesta) galleta = puesta.split(';')[0];
  }
  return r;
}

export async function pedir<T>(ruta: string, opciones: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await llamar(ruta, opciones);
  let cuerpo: Respuesta<T>;
  try {
    cuerpo = (await r.json()) as Respuesta<T>;
  } catch {
    throw new ErrorApi('respuesta_no_json', r.status);
  }
  if (!cuerpo.ok) throw new ErrorApi(cuerpo.error, r.status, cuerpo.detalle);
  return cuerpo.data;
}

/** Lo mismo, pero SIN desenvolver.
 *
 *  El motor de quell101 corre dentro de la API (`/orgs/:o/quell/*`) y es el
 *  mismo código que corría en su Worker: contesta el objeto pelón, no el
 *  `{ok, data}` de la suite. Pasarlo por `pedir` truena con
 *  «undefined (200)», que no dice nada. Esto es para esas rutas y nada más;
 *  todo lo de la suite va por `pedir`. */
export async function pedirCrudo<T>(ruta: string, opciones: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await llamar(ruta, opciones);
  let cuerpo: unknown;
  try {
    cuerpo = await r.json();
  } catch {
    throw new ErrorApi('respuesta_no_json', r.status);
  }
  if (!r.ok) {
    const e = cuerpo as { error?: string; detalle?: unknown };
    throw new ErrorApi(e?.error ?? 'error', r.status, e?.detalle);
  }
  return cuerpo as T;
}

/** GET /orgs/:o/<tabla>?filtros — la lista completa (la API tope en 500). */
export async function listar<T>(tabla: string, filtros: Record<string, string | undefined> = {}): Promise<T[]> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v !== undefined && v !== '') q.set(k, v);
  const s = q.toString();
  const r = await pedir<{ total: number; filas: T[] }>(`/orgs/${org()}/${tabla}${s ? '?' + s : ''}`);
  return r.filas;
}

/** GET /orgs/:o/<tabla>/:id — null si no existe. */
export async function obtener<T>(tabla: string, id: string): Promise<T | null> {
  try {
    return await pedir<T>(`/orgs/${org()}/${tabla}/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof ErrorApi && e.error === 'no_encontrado') return null;
    throw e;
  }
}

/* ─────────────── la sesión ─────────────── */

export interface Yo {
  /** Si la persona ya tiene contraseña puesta, y con qué entró (contrato 0.7.0).
   *  La pantalla los usa para pedir la contraseña a quien entró con código. */
  tiene_clave?: boolean;
  /** Si la cuenta tiene una de Google ligada (contrato 0.17.2). */
  tiene_google?: boolean;
  entro_con?: 'codigo' | 'pin' | 'clave' | 'google';
  usuario: { id: string; correo: string; nombre: string | null; creado_at: string };
  superadmin: boolean;
  orgs: Array<{ id: string; nombre: string; rol: 'owner' | 'admin' | 'socio' | 'staff'; apps: string[]; negocios: string[] }>;
  acceso: { org_id: string; tipo: 'cliente' | 'personal'; ref_id: string } | null;
}

/** Quién está en sesión, o null si nadie. */
export async function yo(): Promise<Yo | null> {
  try {
    return await pedir<Yo>('/yo');
  } catch (e) {
    if (e instanceof ErrorApi && e.error === 'sin_sesion') return null;
    throw e;
  }
}

/** Entra con correo y contraseña (contrato 0.7.0). Desde el 16-sep-2026 es la
 *  forma normal de entrar sin Google, en todas las apps de la suite. */
export async function entrarConClave(correo: string, clave: string): Promise<Yo['usuario']> {
  const r = await pedir<{ usuario: Yo['usuario'] }>('/auth/entrar', { method: 'POST', body: { correo, clave } });
  return r.usuario;
}

/** Pone o cambia la contraseña. Si la sesión se abrió con código o con
 *  Google, la suite no pide la anterior: así «olvidé mi contraseña» es entrar
 *  con un código y poner otra. */
export async function ponerClave(clave: string, actual?: string): Promise<void> {
  await pedir<{ puesta: boolean }>('/auth/clave', { method: 'POST', body: actual ? { clave, actual } : { clave } });
}

export async function entrarConCodigo(correo: string, codigo: string): Promise<Yo['usuario']> {
  const r = await pedir<{ usuario: Yo['usuario'] }>('/auth/entrar', { method: 'POST', body: { correo, codigo } });
  return r.usuario;
}

/** Canjea el boleto de entrada por la cookie de sesión. Un solo uso. */
export async function canjear(entrada: string): Promise<void> {
  await pedir<{ entro: boolean }>('/auth/canje', { method: 'POST', body: { entrada } });
}

/** Manda el código de seis dígitos al correo. En staging lo devuelve también,
 *  y las pruebas entran con él sin buzón. */
export async function pedirCodigo(correo: string): Promise<{ codigo_prueba?: string }> {
  return pedir<{ codigo_prueba?: string }>('/auth/codigo', { method: 'POST', body: { correo } });
}

/** Pide un código y entra con él, reintentando si otro proceso pidió otro
 *  código para el mismo correo entre medias (pasa cuando dos corridas de las
 *  pruebas entran a la vez con el mismo superadmin). Sólo sirve donde la API
 *  devuelve `codigo_prueba`, o sea fuera de producción. */
export async function entrarDePrueba(correo: string, intentos = 4): Promise<Yo['usuario']> {
  let ultimo: unknown;
  for (let i = 0; i < intentos; i++) {
    try {
      const c = await pedirCodigo(correo);
      if (!c.codigo_prueba) throw new Error('la API no devolvió codigo_prueba: esto no es staging');
      return await entrarConCodigo(correo, c.codigo_prueba);
    } catch (e) {
      ultimo = e;
      const reintentable = e instanceof ErrorApi && (e.error === 'codigo_invalido' || e.error === 'demasiados_intentos');
      if (!reintentable) throw e;
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
  throw ultimo;
}

/* ─────────────── Google, detrás del proxy ───────────────
 * El navegador va a /s101/auth/google?volver_a=<esta app>/login; Google
 * devuelve al Worker, el Worker abre la sesión y regresa a la app con
 * ?entrada=<boleto>; la app lo canjea aquí y la cookie queda en su origen. */

export function urlGoogle(volverA: string): string {
  return `${apiBase()}/auth/google?volver_a=${encodeURIComponent(volverA)}`;
}


export async function fijarPin(pin: string): Promise<void> {
  await pedir('/auth/pin', { method: 'POST', body: { pin } });
}

export async function salir(): Promise<void> {
  await pedir('/auth/salir', { method: 'POST' });
  galleta = '';
}
