"use client";

/* Quién está en sesión. Dos caminos, una sola cara para las pantallas.
 *
 *   FUENTE=firestore   Firebase Auth, como siempre: Google o correo/contraseña.
 *   FUENTE=api         la cookie `s101` de suite101-api: correo + código,
 *                      correo + PIN, o Google. Google regresa al Worker, no
 *                      a la app; el Worker manda de vuelta un boleto de un
 *                      solo uso (?entrada=) y aquí se canjea por el proxy
 *                      /s101/, con lo que la cookie queda en este origen.
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
  /** Entra con el código. Si esa persona no tiene contraseña, NO deja la
   *  sesión puesta en `user` —se pondría en /dashboard antes de tiempo— y
   *  devuelve `necesitaClave: true` para que la pantalla la pida primero. */
  entrarConCodigo: (correo: string, codigo: string) => Promise<{ necesitaClave: boolean }>;
  entrarConClave: (correo: string, clave: string) => Promise<void>;
  ponerClave: (clave: string, actual?: string) => Promise<void>;
  /** Vuelve a leer /yo y actualiza `user`: después de poner la contraseña. */
  refrescar: () => Promise<void>;
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
      (async () => {
        try {
          // De regreso de Google: el boleto viene en la URL y se canjea una
          // sola vez. Se quita de la barra para que un recargar no lo repita.
          const u = new URL(window.location.href);
          const entrada = u.searchParams.get("entrada");
          if (entrada) {
            u.searchParams.delete("entrada");
            window.history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
            try {
              await api.canjear(entrada);
            } catch (e) {
              console.error("El boleto de entrada no valió:", e);
            }
          }
          const s = await api.yo();
          setUser(s ? desdeApi(s.usuario) : null);
        } catch (e) {
          console.error("No se pudo leer la sesión de la API:", e);
        } finally {
          setLoading(false);
        }
      })();
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
    if (modo === "api") throw new Error(`Con la API se entra con correo y código, PIN o Google, no con ${que}.`);
  };
  const soloApi = () => {
    if (modo !== "api") throw new Error("Este camino es de FUENTE=api.");
  };

  const signInGoogle = async () => {
    if (modo === "api") {
      const url = api.urlGoogle(`${window.location.origin}/login`);
      // Se pregunta primero sin seguir el salto: si la API no tiene
      // credenciales de Google contesta 501 y se dice aquí, en vez de dejar
      // al usuario en una pestaña con un JSON.
      const r = await fetch(url, { redirect: "manual", credentials: "include" });
      if (r.type === "opaqueredirect" || (r.status >= 300 && r.status < 400)) {
        window.location.href = url;
        return;
      }
      const cuerpo = (await r.json().catch(() => ({}))) as { error?: string };
      if (cuerpo.error === "google_no_configurado") throw new Error("Entrar con Google todavía no está configurado. Usa tu correo con código o PIN.");
      throw new Error(cuerpo.error ?? `Google contestó ${r.status}`);
    }
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
    await api.entrarConCodigo(correo.trim().toLowerCase(), codigo.trim());
    /* Quien entra con un código y no tiene contraseña no tiene por dónde
     * volver mañana: el código es de un solo uso y de diez minutos. La sesión
     * ya está abierta en la suite, pero `user` no se pone hasta que la ponga,
     * porque en cuanto se pone, el login lo manda a /dashboard. */
    const yo = await api.yo();
    if (yo && !yo.tiene_clave) return { necesitaClave: true };
    if (yo) setUser(desdeApi(yo.usuario));
    return { necesitaClave: false };
  };
  /* La contraseña NO se recorta: un espacio al borde es parte de ella —la
   * suite rechaza esas al ponerlas, no al usarlas— y recortarla haría que una
   * buena no entrara sin explicación. El correo sí se normaliza. */
  const entrarConClave = async (correo: string, clave: string) => {
    soloApi();
    setUser(desdeApi(await api.entrarConClave(correo.trim().toLowerCase(), clave)));
  };
  const ponerClave = async (clave: string, actual?: string) => {
    soloApi();
    await api.ponerClave(clave, actual);
  };
  const refrescar = async () => {
    soloApi();
    const yo = await api.yo();
    if (yo) setUser(desdeApi(yo.usuario));
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
      value={{ user, loading, fuente: modo, signInGoogle, signInEmail, signUpEmail, pedirCodigo, entrarConCodigo, entrarConClave, ponerClave, refrescar, signOut }}
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
