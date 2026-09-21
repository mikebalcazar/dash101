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
  /* Una forma multipart se manda tal cual: `fetch` le pone su propio
   * `Content-Type` con la frontera, y si se la ponemos nosotros la rompemos. */
  const esForma = typeof FormData !== 'undefined' && opciones.body instanceof FormData;
  const cabeceras: Record<string, string> = { 'X-App': 'dash101' };
  if (!esForma) cabeceras['Content-Type'] = 'application/json';
  if (!enNavegador && galleta) cabeceras.Cookie = galleta;
  const r = await fetch(`${apiBase()}${ruta}`, {
    method: opciones.method ?? 'GET',
    headers: cabeceras,
    body: opciones.body === undefined ? undefined : esForma ? (opciones.body as FormData) : JSON.stringify(opciones.body),
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
/** Traer algo que NO es JSON: un PDF, una foto. Devuelve la respuesta tal
 *  cual, por la misma plumbería de sesión que todo lo demás.
 *
 *  Existe porque listar el renglón de un archivo no prueba que sus bytes
 *  llegaron a R2, y `pedir` revienta con `respuesta_no_json` al intentarlo.
 *  Sin esto, la única manera de comprobar que un comprobante se puede volver
 *  a bajar era abrirlo a mano en el navegador. */
export async function bajar(ruta: string): Promise<Response> {
  const r = await llamar(ruta, {});
  if (!r.ok) throw new ErrorApi('no_se_pudo_bajar', r.status);
  return r;
}

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

/** GET /orgs/:o/<tabla>?filtros — lo que la API dé, topado en 500 filas. */
export async function listar<T>(tabla: string, filtros: Record<string, string | undefined> = {}): Promise<T[]> {
  return (await listarConTotal<T>(tabla, filtros)).filas;
}

async function listarConTotal<T>(
  tabla: string,
  filtros: Record<string, string | undefined>,
): Promise<{ total: number; filas: T[] }> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v !== undefined && v !== '') q.set(k, v);
  const s = q.toString();
  return pedir<{ total: number; filas: T[] }>(`/orgs/${org()}/${tabla}${s ? '?' + s : ''}`);
}

/** Lo más que se pide de una vez. Es el techo de la API (contrato 0.24.2). */
const TOPE_MAXIMO = 5000;

/** GET de una lista que TIENE que venir completa.
 *
 *  Una lista topada se ve idéntica a una completa: 200, `filas`, y nada que
 *  diga que faltan. Lo único que lo delata es `total`. Cuando la lista sirve
 *  para decidir —«¿este ítem ya existe?», «¿cuáles sigo mostrando?»— venir
 *  corta no es enseñar de menos: es borrar.
 *
 *  Mike lo vio el 20-sep en un proyecto suyo: la pantalla decía «Sin ítems» y
 *  el precio de venta seguía en $6,473,790. Los ítems estaban ahí. Se pedían
 *  sin filtrar el estado, los cancelados —los más viejos— llenaban las 500
 *  primeras filas y los vivos se caían de la respuesta. El precio de venta no
 *  se equivocó porque ése lo suma la API en la base, no la pantalla.
 *
 *  Aquí se vuelve a pedir con el tope en alto, y si AUN ASÍ falta algo se
 *  truena con un mensaje que se entiende. Una pantalla que truena se arregla;
 *  una pantalla que enseña de menos se cree. */
export async function listarCompleto<T>(
  tabla: string,
  filtros: Record<string, string | undefined> = {},
): Promise<T[]> {
  const r = await listarConTotal<T>(tabla, filtros);
  if (r.filas.length >= r.total) return r.filas;

  const otra = await listarConTotal<T>(tabla, { ...filtros, limite: String(Math.min(r.total, TOPE_MAXIMO)) });
  if (otra.filas.length >= otra.total) return otra.filas;

  throw new ErrorApi('lista_incompleta', 200, {
    tabla,
    total: otra.total,
    llegaron: otra.filas.length,
    mensaje: `Hay ${otra.total} renglones en «${tabla}» y la API sólo entrega ${TOPE_MAXIMO} de una vez.`,
  });
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
      /* Cuando el freno de códigos contesta 429, DICE cuánto hay que
       * esperar. Hasta hoy esto esperaba 3, 6, 9 y 12 segundos —30 en
       * total— y el freno pide 45: se rendía justo antes de que cediera, y
       * la prueba que le tocara el turno malo salía roja sin que nada
       * estuviera mal. Pasó el 20-sep con toda la suite corriendo a la vez.
       *
       * Es el mismo arreglo que ya lleva la prueba de humo de la API: se
       * espera lo que la API pide, no lo que uno supone. */
      const espera = e instanceof ErrorApi
        ? Number((e.detalle as { espera_segundos?: number } | undefined)?.espera_segundos) || 0
        : 0;
      await new Promise((r) => setTimeout(r, espera > 0 ? (espera + 1) * 1000 : 3000 * (i + 1)));
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
