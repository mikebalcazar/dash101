/* El interruptor de la migración (arranque §4, fase 3).
 *
 * `FUENTE` dice de dónde lee y escribe la app:
 *
 *   api         `suite101-api`, por el prefijo `/s101/` del mismo origen.
 *               Es lo que hay desde el corte del 16-sep-2026, y es el valor
 *               por omisión.
 *   firestore   el SDK de Firebase contra `contamaster-fs`. Ya no lo usa
 *               nadie publicado; hay que pedirlo por su nombre.
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
 *  la variable después de importar.
 *
 *  EL VALOR POR OMISIÓN SE INVIRTIÓ EL 16-SEP-2026, y no es un detalle.
 *
 *  Antes, una construcción a la que se le olvidara la variable se iba **a
 *  Firestore**, callada. Eso no era hipotético: es lo que servía
 *  `conta-master.netlify.app` desde el 12-sep —la app de verdad, con la llave
 *  de Firebase dentro de la página— porque Netlify construía sin la variable.
 *  El día que el corte quede hecho, ese olvido sería la única manera de
 *  deshacerlo sin que nadie lo notara.
 *
 *  Ahora el olvido cae del lado de la suite. Para hablarle a Firestore hay que
 *  escribir `firestore`, con todas sus letras, en alguna parte que se pueda
 *  leer en un diff.
 *
 *  Cuesta algo, y es justo: `npm run dev` sin variables ya no arranca contra
 *  Firestore, sino contra la suite, y `org()` truena si no se dice la empresa.
 *  Truena diciendo qué falta, que es mejor que escribir en la base que no era. */
export function fuente(): Fuente {
  return process.env.NEXT_PUBLIC_FUENTE === 'firestore' ? 'firestore' : 'api';
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
