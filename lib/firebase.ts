import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { fuente } from "./fuente";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

/* Con `FUENTE=api` Firebase NO se inicializa. Las construcciones del Worker
 * no llevan `NEXT_PUBLIC_FIREBASE_*` —no tienen por qué: ahí todo va por la
 * API— y `getAuth` con una llave vacía tira `auth/invalid-api-key` al cargar,
 * lo que tumba el árbol entero de React: «Application error: a client-side
 * exception». Así estaban `dash101-staging` Y `dash101` en producción hasta
 * el 12-sep-2026, y nadie lo vio porque el corredor medía HTML y JSON, no un
 * navegador. Lo encontró la primera prueba de Playwright.
 *
 * Quien importe `auth` o `db` ya sabe que pueden venir vacíos: `auth-context`
 * pregunta `if (!auth)`, y los módulos de `lib/` bifurcan por `fuente()`
 * antes de tocar `db`. */
if (typeof window !== "undefined" && fuente() !== "api") {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export { app, auth, db };
