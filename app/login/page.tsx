"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { IconBrandGoogle } from "@tabler/icons-react";

export default function LoginPage() {
  const { fuente } = useAuth();
  return fuente === "api" ? <LoginApi /> : <LoginFirebase />;
}

/* ─────────────── FUENTE=api: correo + código, o correo + PIN ───────────────
 * Es la puerta de suite101-api (arranque §2). El código llega al correo y
 * vence en diez minutos; el PIN es de seis dígitos y lo fija cada quien. */

function LoginApi() {
  const router = useRouter();
  const { user, pedirCodigo, entrarConCodigo, entrarConClave, ponerClave, refrescar, signInGoogle } = useAuth();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nueva1, setNueva1] = useState("");
  const [nueva2, setNueva2] = useState("");
  // correo → clave → (olvidé) codigo → nueva → adentro
  const [paso, setPaso] = useState<"correo" | "clave" | "codigo" | "nueva">("correo");
  const [dePrueba, setDePrueba] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  const intenta = async (fn: () => Promise<void>) => {
    setError("");
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setLoading(false);
    }
  };

  /* «Olvidé mi contraseña», que es la misma puerta para quien nunca tuvo una:
   * manda el código y pasa a teclearlo. */
  const mandarCodigo = () => intenta(async () => {
    const r = await pedirCodigo(correo);
    // Staging devuelve el código en la respuesta para poder entrar sin buzón;
    // producción nunca lo hace. Se rellena y se dice.
    if (r.codigo_prueba) { setCodigo(r.codigo_prueba); setDePrueba(true); } else { setCodigo(""); setDePrueba(false); }
    setPaso("codigo");
  });

  /* Quien entra con un código y no tiene contraseña no puede seguir sin
   * ponerla: el código es de un solo uso y de diez minutos. Con Google no se
   * le pide nada —Google ya es una forma de entrar—, y por eso esto sólo se
   * decide aquí, en el camino del código. `user` no se pone hasta que haya
   * contraseña, para que el `useEffect` de arriba no lo mande a /dashboard
   * antes de tiempo. */
  const entrarConElCodigo = () => intenta(async () => {
    const r = await entrarConCodigo(correo, codigo);
    if (r.necesitaClave) { setNueva1(""); setNueva2(""); setPaso("nueva"); }
  });

  const guardarClave = () => intenta(async () => {
    if (nueva1 !== nueva2) {
      // No se dice cuál falló ni se deja la primera puesta: si no
      // coincidieron, una de las dos está mal y no hay forma de saber cuál.
      setNueva1(""); setNueva2("");
      throw new Error("No coincidieron. Vamos otra vez, desde el principio.");
    }
    await ponerClave(nueva1);
    await refrescar();
  });

  const volverAlCorreo = () => { setPaso("correo"); setClave(""); setCodigo(""); setError(""); };

  return (
    <Marco pie="Con tu cuenta de la suite 101: la misma de las demás aplicaciones.">
      {paso === "correo" && (
        <form onSubmit={(e) => { e.preventDefault(); if (correo) setPaso("clave"); }} className="space-y-3">
          <input type="email" required autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="tu@correo.mx" className={caja} />
          <button type="submit" disabled={loading || !correo} className={boton}>Continuar</button>
        </form>
      )}

      {paso === "clave" && (
        <form onSubmit={(e) => { e.preventDefault(); void intenta(() => entrarConClave(correo, clave)); }} className="space-y-3">
          <p className="text-xs text-ink-muted">La contraseña de {correo}.</p>
          {/* `name` y `autoComplete` van puestos para que el administrador de
              contraseñas la guarde y la vuelva a poner. */}
          <input type="password" name="password" autoComplete="current-password" required autoFocus value={clave} onChange={(e) => setClave(e.target.value)} placeholder="contraseña" className={caja} />
          <button type="submit" disabled={loading || !clave} className={boton}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
          <button type="button" disabled={loading} onClick={mandarCodigo} className={botonSuave}>
            Olvidé mi contraseña
          </button>
          <p className="text-xs text-ink-muted">Si es tu primera vez y todavía no tienes una, pícale ahí mismo: te mandamos un código al correo y la pones.</p>
          <button type="button" onClick={volverAlCorreo} className={botonSuave}>Usar otro correo</button>
        </form>
      )}

      {paso === "codigo" && (
        <form onSubmit={(e) => { e.preventDefault(); void entrarConElCodigo(); }} className="space-y-3">
          <p className="text-xs text-ink-muted">
            {dePrueba ? "Ambiente de pruebas: el código se rellenó solo. Sólo falta continuar." : `Te mandamos seis dígitos a ${correo}. Vencen en diez minutos.`}
          </p>
          <input inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="código de 6 dígitos" className={caja} autoFocus />
          <button type="submit" disabled={loading || codigo.length !== 6} className={boton}>
            {loading ? "Entrando…" : "Continuar"}
          </button>
          <button type="button" disabled={loading} onClick={mandarCodigo} className={botonSuave}>Mándame otro</button>
          <button type="button" onClick={volverAlCorreo} className={botonSuave}>Usar otro correo</button>
        </form>
      )}

      {paso === "nueva" && (
        <form onSubmit={(e) => { e.preventDefault(); void guardarClave(); }} className="space-y-3">
          <p className="text-xs text-ink-muted">Ponle una contraseña a tu cuenta. Con ella entras de ahora en adelante, aquí y en las demás apps de la suite.</p>
          <input type="password" name="new-password" autoComplete="new-password" required autoFocus value={nueva1} onChange={(e) => setNueva1(e.target.value)} placeholder="contraseña nueva" className={caja} />
          <input type="password" name="new-password" autoComplete="new-password" required value={nueva2} onChange={(e) => setNueva2(e.target.value)} placeholder="otra vez, de memoria" className={caja} />
          <p className="text-xs text-ink-muted">Al menos diez caracteres. Que no lleve tu correo adentro ni sea de las que cualquiera prueba primero.</p>
          <button type="submit" disabled={loading || nueva1.length < 10 || nueva2.length < 10} className={boton}>
            {loading ? "Guardando…" : "Guardar y entrar"}
          </button>
        </form>
      )}

      {paso !== "nueva" && (
        <>
          <div className="flex items-center gap-3 text-xs text-ink-muted my-4">
            <div className="flex-1 h-px bg-black/10" />
            o con tu cuenta de Google
            <div className="flex-1 h-px bg-black/10" />
          </div>
          <button type="button" disabled={loading} onClick={() => intenta(signInGoogle)} className={botonSuave}>
            Entrar con Google
          </button>
        </>
      )}

      {error && <p className="mt-4 text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-lg">{error}</p>}
    </Marco>
  );
}

/* ─────────────── FUENTE=firestore: lo de siempre ─────────────── */

function LoginFirebase() {
  const router = useRouter();
  const { user, signInGoogle, signInEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  const handleGoogle = async () => {
    setError("");
    setLoading(true);
    try {
      await signInGoogle();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInEmail(email, password);
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Marco pie="Acceso restringido · 3 usuarios">
      <button onClick={handleGoogle} disabled={loading} className={`${botonSuave} mb-4`}>
        <IconBrandGoogle size={16} />
        Continuar con Google
      </button>

      <div className="flex items-center gap-3 text-xs text-ink-muted mb-4">
        <div className="flex-1 h-px bg-black/10" />
        o con email
        <div className="flex-1 h-px bg-black/10" />
      </div>

      <form onSubmit={handleEmail} className="space-y-3">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" className={caja} />
        <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="contraseña" className={caja} />
        <button type="submit" disabled={loading} className={boton}>
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>

      {error && <p className="mt-4 text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-lg">{error}</p>}
    </Marco>
  );
}

/* ─────────────── lo común ─────────────── */

const caja = "w-full bg-bg border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40";
const boton = "w-full bg-ink hover:bg-ink/90 transition text-cream rounded-xl py-2.5 text-sm font-medium disabled:opacity-50";
const botonSuave = "w-full flex items-center justify-center gap-2 bg-cream hover:bg-cream/80 transition rounded-xl py-2.5 text-sm font-medium disabled:opacity-50";

const ERRORES: Record<string, string> = {
  codigo_invalido: "Ese código no es, o ya venció. Pide otro.",
  // `sin_permiso` es el correo sin cuenta y `clave_invalida` la contraseña
  // equivocada. Se dicen IGUAL a propósito: distinguirlos le diría a
  // cualquiera qué correos tienen cuenta aquí.
  clave_invalida: "Ese correo y esa contraseña no coinciden.",
  sin_permiso: "Ese correo y esa contraseña no coinciden.",
  demasiados_intentos: "Demasiados intentos. Espera unos minutos.",
  correo_no_configurado: "El servidor no puede mandar correos ahora mismo. Intenta más tarde.",
  sin_sesion: "La sesión no quedó puesta. Vuelve a intentar.",
};

function mensaje(e: unknown): string {
  const err = e as { error?: string; message?: string; detalle?: { porque?: string } };
  // La suite dice con palabras por qué una contraseña no pasa; se enseña tal cual.
  if (err?.error === "clave_debil" && err.detalle?.porque) return err.detalle.porque;
  if (err?.error && ERRORES[err.error]) return ERRORES[err.error];
  return err?.message ?? "Error desconocido";
}

function Marco({ children, pie }: { children: React.ReactNode; pie: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center mb-8 justify-center">
          {/* El logotipo oficial, el mismo del escaparate. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/dash101.svg" alt="dash101" className="h-8" />
        </div>

        <div className="bg-white border border-black/5 rounded-3xl p-7">
          <h2 className="text-lg font-medium mb-1">Entrar</h2>
          <p className="text-xs text-ink-muted mb-6">Accede a tu panel financiero</p>
          {children}
        </div>

        <p className="text-center text-xs text-ink-muted mt-6">{pie}</p>
      </div>
    </div>
  );
}
