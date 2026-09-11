"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { IconBrandGoogle, IconLeaf } from "@tabler/icons-react";

export default function LoginPage() {
  const { fuente } = useAuth();
  return fuente === "api" ? <LoginApi /> : <LoginFirebase />;
}

/* ─────────────── FUENTE=api: correo + código, o correo + PIN ───────────────
 * Es la puerta de suite101-api (arranque §2). El código llega al correo y
 * vence en diez minutos; el PIN es de seis dígitos y lo fija cada quien. */

function LoginApi() {
  const router = useRouter();
  const { user, pedirCodigo, entrarConCodigo, entrarConPin } = useAuth();
  const [correo, setCorreo] = useState("");
  const [pin, setPin] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoPedido, setCodigoPedido] = useState(false);
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

  return (
    <Marco pie="Entra con el PIN que fijaste, o pide un código a tu correo.">
      <form onSubmit={(e) => { e.preventDefault(); void intenta(() => entrarConPin(correo, pin)); }} className="space-y-3">
        <input type="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="tu@correo.mx" className={caja} />
        <input type="password" inputMode="numeric" pattern="\d{6}" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN de 6 dígitos" className={caja} />
        <button type="submit" disabled={loading || pin.length !== 6} className={boton}>
          {loading ? "Entrando…" : "Entrar con PIN"}
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-ink-muted my-4">
        <div className="flex-1 h-px bg-black/10" />
        o con un código al correo
        <div className="flex-1 h-px bg-black/10" />
      </div>

      {!codigoPedido ? (
        <button
          type="button"
          disabled={loading || !correo}
          onClick={() => intenta(async () => {
            const r = await pedirCodigo(correo);
            // Staging devuelve el código en la respuesta para poder entrar sin
            // buzón; producción nunca lo hace. Se rellena y se dice.
            if (r.codigo_prueba) { setCodigo(r.codigo_prueba); setDePrueba(true); }
            setCodigoPedido(true);
          })}
          className={botonSuave}
        >
          Mandarme un código
        </button>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void intenta(() => entrarConCodigo(correo, codigo)); }} className="space-y-3">
          <p className="text-xs text-ink-muted">
            {dePrueba ? "Ambiente de pruebas: el código se rellenó solo. Sólo falta entrar." : `Te mandamos seis dígitos a ${correo}. Vencen en diez minutos.`}
          </p>
          <input inputMode="numeric" pattern="\d{6}" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="código de 6 dígitos" className={caja} autoFocus />
          <button type="submit" disabled={loading || codigo.length !== 6} className={boton}>
            {loading ? "Entrando…" : "Entrar con el código"}
          </button>
        </form>
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
  pin_invalido: "Correo o PIN equivocados.",
  demasiados_intentos: "Demasiados intentos. Espera unos minutos.",
  correo_no_configurado: "El servidor no puede mandar correos ahora mismo. Entra con tu PIN.",
  sin_sesion: "La sesión no quedó puesta. Vuelve a intentar.",
};

function mensaje(e: unknown): string {
  const err = e as { error?: string; message?: string };
  if (err?.error && ERRORES[err.error]) return ERRORES[err.error];
  return err?.message ?? "Error desconocido";
}

function Marco({ children, pie }: { children: React.ReactNode; pie: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-ink text-cream flex items-center justify-center">
            <IconLeaf size={20} />
          </div>
          <h1 className="text-xl font-marca">Conta Master</h1>
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
