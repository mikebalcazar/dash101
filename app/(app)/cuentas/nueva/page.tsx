"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { createCuenta } from "@/lib/cuentas";
import type { Moneda, TipoCuenta } from "@/types/schema";
import { TIPO_CUENTA_LABELS } from "@/types/schema";
import { IconArrowLeft } from "@tabler/icons-react";

export default function NuevaCuentaPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { activo } = useNegocioActivo();

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoCuenta>("banco");
  const [banco, setBanco] = useState("");
  const [numero, setNumero] = useState("");
  const [moneda, setMoneda] = useState<Moneda>(activo?.moneda ?? "MXN");
  const [saldoInicial, setSaldoInicial] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!activo) {
    return (
      <div className="max-w-lg">
        <Link href="/cuentas" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-ink-muted">Selecciona o crea un negocio primero.</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError("");
    setSubmitting(true);
    try {
      const saldoNum = parseFloat(saldoInicial) || 0;
      await createCuenta(user.uid, {
        nombre: nombre.trim(),
        tipo,
        banco: banco.trim() || undefined,
        numero: numero.trim() || undefined,
        moneda,
        saldo_inicial: saldoNum,
        negocio_id: activo.id!,
      });
      router.push("/cuentas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear cuenta");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg">
      <Link
        href="/cuentas"
        className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition"
      >
        <IconArrowLeft size={13} />
        Volver a cuentas
      </Link>

      <h2 className="text-lg font-medium text-ink-dim">Crear cuenta</h2>
      <p className="text-xs text-ink-muted mt-0.5 mb-6">
        Se agregará a <strong>{activo.nombre}</strong>
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">
            Nombre <span className="text-mauve-900">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={60}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Cuenta principal BBVA"
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoCuenta)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            >
              {Object.entries(TIPO_CUENTA_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Moneda</label>
            <select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as Moneda)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            >
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        {(tipo === "banco" || tipo === "credito") && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-ink-dim block mb-1.5">Banco</label>
              <input
                type="text"
                maxLength={40}
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
                placeholder="BBVA, Santander, etc."
                className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-dim block mb-1.5">
                Últimos 4 dígitos
              </label>
              <input
                type="text"
                maxLength={4}
                value={numero}
                onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))}
                placeholder="opcional"
                className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
              />
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">
            Saldo inicial ({moneda})
          </label>
          <input
            type="number"
            step="0.01"
            value={saldoInicial}
            onChange={(e) => setSaldoInicial(e.target.value)}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
          <p className="text-[11px] text-ink-muted mt-1">
            Cuánto dinero hay en la cuenta hoy. Los movimientos futuros se suman/restan de aquí.
          </p>
        </div>

        {error && (
          <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
        )}

        <div className="flex gap-2 pt-2">
          <Link
            href="/cuentas"
            className="bg-transparent border border-black/15 rounded-xl px-4 py-2 text-sm text-ink-dim hover:bg-white transition"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={submitting || !nombre.trim()}
            className="bg-ink text-cream rounded-xl px-5 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
          >
            {submitting ? "Creando…" : "Crear cuenta"}
          </button>
        </div>
      </form>
    </div>
  );
}
