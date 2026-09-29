/* Firebase, apagado: lo que entra al paquete en lugar del SDK cuando la
 * fuente es la API.
 *
 * Mike, 29-sep-2026: «Hay que reducir el consumo de recursos de las apps en
 * MÓVIL. Es crítico.» En dash101 el gasto no estaba en la pantalla sino en el
 * arranque: el SDK de Firebase entero —Auth y Firestore, unos 385 KB de
 * JavaScript— se descargaba, se leía y se compilaba en cada pantalla, aunque
 * desde el 16-sep nadie publicado le habla a Firestore (`lib/fuente.ts`).
 * Los módulos de `lib/` lo importan arriba del archivo porque conservan su
 * rama `firestore`, y webpack no puede saber que esa rama nunca corre.
 *
 * Así que se decide al construir, igual que la fuente misma: con
 * `NEXT_PUBLIC_FUENTE` distinta de `firestore`, `next.config.ts` apunta
 * `firebase/app`, `firebase/auth` y `firebase/firestore` a este archivo. Lo
 * que la app importa de ahí sigue existiendo por nombre —si no, la
 * construcción truena— pero pesa nada y, si alguien lo llama, dice por qué
 * no en vez de fallar en silencio.
 *
 * `Timestamp` es la excepción: ése sí se usa con `FUENTE=api`.
 * `lib/api/adaptar.ts` convierte las fechas ISO de la API en `Timestamp`
 * para que las pantallas no cambien, y las pantallas les piden `.toDate()`.
 * Aquí vive una versión mínima con la misma cara: `fromDate`, `fromMillis`,
 * `now`, `toDate`, `toMillis`, `seconds` y `nanoseconds`.
 *
 * La construcción con `FUENTE=firestore` no pasa por aquí: ésa sigue con el
 * SDK de verdad. `pruebas/sin-firebase.spec.ts` mide las dos cosas. */

const NO_HAY = 'Con FUENTE=api no hay Firebase: ';

function apagado(nombre: string): (...args: unknown[]) => never {
  return () => {
    throw new Error(`${NO_HAY}${nombre}() no existe en esta construcción. Si de verdad hace falta Firestore, construye con NEXT_PUBLIC_FUENTE=firestore.`);
  };
}

/* ── firebase/app ─────────────────────────────────────────────────────── */
export type FirebaseApp = { name: string };
export const initializeApp = apagado('initializeApp');
export const getApps = (): FirebaseApp[] => [];
export const getApp = apagado('getApp');

/* ── firebase/auth ────────────────────────────────────────────────────── */
export type Auth = { currentUser: null };
export type User = { uid: string; email: string | null; displayName: string | null };
export class GoogleAuthProvider {
  constructor() { throw new Error(`${NO_HAY}Google entra por la suite (/s101/auth/google), no por Firebase.`); }
}
export const getAuth = apagado('getAuth');
export const onAuthStateChanged = apagado('onAuthStateChanged');
export const signInWithPopup = apagado('signInWithPopup');
export const signInWithEmailAndPassword = apagado('signInWithEmailAndPassword');
export const createUserWithEmailAndPassword = apagado('createUserWithEmailAndPassword');
export const sendPasswordResetEmail = apagado('sendPasswordResetEmail');
export const signOut = apagado('signOut');

/* ── firebase/firestore ───────────────────────────────────────────────── */
export type Firestore = { app: FirebaseApp };
export const getFirestore = apagado('getFirestore');
export const collection = apagado('collection');
export const doc = apagado('doc');
export const getDoc = apagado('getDoc');
export const getDocs = apagado('getDocs');
export const addDoc = apagado('addDoc');
export const setDoc = apagado('setDoc');
export const updateDoc = apagado('updateDoc');
export const deleteDoc = apagado('deleteDoc');
export const query = apagado('query');
export const where = apagado('where');
export const orderBy = apagado('orderBy');
export const limit = apagado('limit');
export const runTransaction = apagado('runTransaction');
export const writeBatch = apagado('writeBatch');
export const serverTimestamp = apagado('serverTimestamp');
export const arrayUnion = apagado('arrayUnion');
export const arrayRemove = apagado('arrayRemove');

/** La misma cara que `Timestamp` de Firestore, sin Firestore. Segundos
 *  enteros desde 1970 y nanosegundos dentro del segundo, como allá, para que
 *  cualquier comparación o resta que ya exista dé lo mismo. */
export class Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  static fromMillis(ms: number): Timestamp {
    const seconds = Math.floor(ms / 1000);
    return new Timestamp(seconds, Math.round((ms - seconds * 1000) * 1e6));
  }
  static fromDate(d: Date): Timestamp { return Timestamp.fromMillis(d.getTime()); }
  static now(): Timestamp { return Timestamp.fromMillis(Date.now()); }
  toMillis(): number { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  toDate(): Date { return new Date(this.toMillis()); }
  isEqual(o: Timestamp): boolean { return o.seconds === this.seconds && o.nanoseconds === this.nanoseconds; }
  valueOf(): string { return String(this.seconds).padStart(12, '0') + '.' + String(this.nanoseconds).padStart(9, '0'); }
  toJSON(): { seconds: number; nanoseconds: number } { return { seconds: this.seconds, nanoseconds: this.nanoseconds }; }
  toString(): string { return `Timestamp(seconds=${this.seconds}, nanoseconds=${this.nanoseconds})`; }
}
