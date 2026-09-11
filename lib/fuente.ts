/* El interruptor de la migración (arranque §4, fase 3).
 *
 * `FUENTE` dice de dónde lee y escribe la app:
 *
 *   firestore   lo de siempre: el SDK de Firebase contra `contamaster-fs`.
 *   api         `suite101-api`, por el prefijo `/s101/` del mismo origen.
 *
 * Se decide al construir (`NEXT_PUBLIC_FUENTE`), no en la pantalla: así no hay
 * un botón que a media sesión cambie de base y deje la mitad de las cosas en
 * un lado y la otra mitad en el otro. Para probar los dos caminos se
 * construye dos veces.
 *
 * Mientras la app se mueve, cada módulo de `lib/` pregunta aquí al entrar y
 * toma un camino u otro con la MISMA firma: las pantallas no se enteran. Lo
 * que la API todavía no cubre cuando `FUENTE = api` truena con un mensaje
 * claro en vez de escribir en Firestore por debajo. */

export type Fuente = 'firestore' | 'api';

/** Se lee en cada llamada, no al cargar el módulo: las pruebas de node ponen
 *  la variable después de importar. */
export function fuente(): Fuente {
  return process.env.NEXT_PUBLIC_FUENTE === 'api' ? 'api' : 'firestore';
}

/** La empresa (org) en la API. Una sola por construcción, igual que FUENTE. */
export function org(): string {
  const o = process.env.NEXT_PUBLIC_ORG;
  if (!o) throw new Error('Falta NEXT_PUBLIC_ORG: con FUENTE=api hay que decir qué empresa.');
  return o;
}

/** Dónde vive la API vista desde aquí.
 *
 *  En el navegador es `/s101`, el mismo origen: en Netlify lo reenvía la
 *  regla de `netlify.toml`, en `next dev` el `rewrite` de `next.config.ts`, y
 *  en Cloudflare (fase 4) el Worker. Así la cookie `s101` es propia y Safari
 *  no la bloquea (decisión D1).
 *
 *  Fuera del navegador —las pruebas de node— no hay proxy, así que se le
 *  habla al Worker directo con `NEXT_PUBLIC_API_ORIGEN`. */
export function apiBase(): string {
  const origen = process.env.NEXT_PUBLIC_API_ORIGEN;
  if (typeof window === 'undefined' && origen) return origen.replace(/\/$/, '');
  return '/s101';
}

/** Lo que se dice cuando algo todavía no se puede hacer contra la API. */
export function noEscribeTodavia(que: string): Error {
  return new Error(`Con FUENTE=api todavía no se escribe ${que}: es la parte de escritura de la fase 3.`);
}
