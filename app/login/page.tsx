"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { IconBrandGoogle, IconLeaf } from "@tabler/icons-react";

export default function LoginPage() {
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
      setError(e instanceof Error ? e.message : "Error desconocido");
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
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-ink text-cream flex items-center justify-center">
            <IconLeaf size={20} />
          </div>
          <h1 className="text-xl font-medium">Conta Master</h1>
        </div>

        <div className="bg-white border border-black/5 rounded-3xl p-7">
          <h2 className="text-lg font-medium mb-1">Entrar</h2>
          <p className="text-xs text-ink-muted mb-6">Accede a tu panel financiero</p>

          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-cream hover:bg-cream/80 transition rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 mb-4"
          >
            <IconBrandGoogle size={16} />
            Continuar con Google
          </button>

          <div className="flex items-center gap-3 text-xs text-ink-muted mb-4">
            <div className="flex-1 h-px bg-black/10" />
            o con email
            <div className="flex-1 h-px bg-black/10" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="w-full bg-bg border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="contraseña"
              className="w-full bg-bg border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ink hover:bg-ink/90 transition text-cream rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>

          {error && (
            <p className="mt-4 text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}
        </div>

        <p className="text-center text-xs text-ink-muted mt-6">
          Acceso restringido · 3 usuarios
        </p>
      </div>
    </div>
  );
}
