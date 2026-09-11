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

export async function pedir<T>(ruta: string, opciones: { method?: string; body?: unknown } = {}): Promise<T> {
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
  let cuerpo: Respuesta<T>;
  try {
    cuerpo = (await r.json()) as Respuesta<T>;
  } catch {
    throw new ErrorApi('respuesta_no_json', r.status);
  }
  if (!cuerpo.ok) throw new ErrorApi(cuerpo.error, r.status, cuerpo.detalle);
  return cuerpo.data;
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

/** Manda el código de seis dígitos al correo. En staging lo devuelve también,
 *  y las pruebas entran con él sin buzón. */
export async function pedirCodigo(correo: string): Promise<{ codigo_prueba?: string }> {
  return pedir<{ codigo_prueba?: string }>('/auth/codigo', { method: 'POST', body: { correo } });
}

export async function entrarConCodigo(correo: string, codigo: string): Promise<Yo['usuario']> {
  const r = await pedir<{ usuario: Yo['usuario'] }>('/auth/entrar', { method: 'POST', body: { correo, codigo } });
  return r.usuario;
}

export async function entrarConPin(correo: string, pin: string): Promise<Yo['usuario']> {
  const r = await pedir<{ usuario: Yo['usuario'] }>('/auth/entrar', { method: 'POST', body: { correo, pin } });
  return r.usuario;
}

export async function fijarPin(pin: string): Promise<void> {
  await pedir('/auth/pin', { method: 'POST', body: { pin } });
}

export async function salir(): Promise<void> {
  await pedir('/auth/salir', { method: 'POST' });
  galleta = '';
}
