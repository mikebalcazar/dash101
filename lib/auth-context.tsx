"use client";

/* Quién está en sesión. Dos caminos, una sola cara para las pantallas.
 *
 *   FUENTE=firestore   Firebase Auth, como siempre: Google o correo/contraseña.
 *   FUENTE=api         la cookie `s101` de suite101-api: correo + código, o
 *                      correo + PIN. Sin Google por ahora: la API arma el
 *                      `redirect_uri` de /auth/google con el origen de la
 *                      petición, y detrás del proxy /s101/ el regreso caería
 *                      fuera del prefijo (arranque §4, fase 3).
 *
 * Las pantallas usan `user.uid`, `user.email` y `user.displayName` y nada
 * más; `Sesion` es justo eso, y un `User` de Firebase lo cumple tal cual. */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "./firebase";
import { ensureUserDoc } from "./users";
import { fuente, type Fuente } from "./fuente";
import * as api from "./api/cliente";

export type Sesion = { uid: string; email: string | null; displayName: string | null };

type AuthContextValue = {
  user: Sesion | null;
  loading: boolean;
  /** Qué hay detrás: decide qué formulario enseña /login. */
  fuente: Fuente;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  /** FUENTE=api: manda el código de seis dígitos al correo. */
  /** Devuelve `codigo_prueba` sólo fuera de producción (staging): la pantalla lo rellena. */
  pedirCodigo: (correo: string) => Promise<{ codigo_prueba?: string }>;
  entrarConCodigo: (correo: string, codigo: string) => Promise<void>;
  entrarConPin: (correo: string, pin: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const desdeApi = (u: api.Yo["usuario"]): Sesion => ({ uid: u.id, email: u.correo, displayName: u.nombre });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Sesion | null>(null);
  const [loading, setLoading] = useState(true);
  const modo = fuente();

  useEffect(() => {
    if (modo === "api") {
      api
        .yo()
        .then((s) => setUser(s ? desdeApi(s.usuario) : null))
        .catch((e) => console.error("No se pudo leer la sesión de la API:", e))
        .finally(() => setLoading(false));
      return;
    }
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        try {
          await ensureUserDoc(u);
        } catch (e) {
          console.error("Failed to ensure user doc:", e);
        }
      }
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, [modo]);

  const soloFirebase = (que: string) => {
    if (modo === "api") throw new Error(`Con la API se entra con correo y código o PIN, no con ${que}.`);
  };
  const soloApi = () => {
    if (modo !== "api") throw new Error("Este camino es de FUENTE=api.");
  };

  const signInGoogle = async () => {
    soloFirebase("Google");
    await signInWithPopup(auth, new GoogleAuthProvider());
  };
  const signInEmail = async (email: string, password: string) => {
    soloFirebase("contraseña");
    await signInWithEmailAndPassword(auth, email, password);
  };
  const signUpEmail = async (email: string, password: string) => {
    soloFirebase("contraseña");
    await createUserWithEmailAndPassword(auth, email, password);
  };

  const pedirCodigo = async (correo: string) => {
    soloApi();
    return api.pedirCodigo(correo.trim().toLowerCase());
  };
  const entrarConCodigo = async (correo: string, codigo: string) => {
    soloApi();
    setUser(desdeApi(await api.entrarConCodigo(correo.trim().toLowerCase(), codigo.trim())));
  };
  const entrarConPin = async (correo: string, pin: string) => {
    soloApi();
    setUser(desdeApi(await api.entrarConPin(correo.trim().toLowerCase(), pin.trim())));
  };

  const signOut = async () => {
    if (modo === "api") {
      await api.salir();
      setUser(null);
      return;
    }
    await fbSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, fuente: modo, signInGoogle, signInEmail, signUpEmail, pedirCodigo, entrarConCodigo, entrarConPin, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
