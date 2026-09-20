"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getCuenta, updateCuenta, deleteCuenta } from "@/lib/cuentas";
import type { Cuenta, TipoCuenta, Moneda } from "@/types/schema";
import { TIPO_CUENTA_LABELS } from "@/types/schema";
import { IconArrowLeft, IconTrash } from "@tabler/icons-react";

function formatMonto(n: number, moneda: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: moneda === "USD" ? "USD" : "MXN",
  }).format(n);
}

export default function CuentaDetallePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoCuenta>("banco");
  const [banco, setBanco] = useState("");
  const [numero, setNumero] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("MXN");
  /* El saldo inicial: con cuánto empezó la cuenta.
   *
   * NO es un movimiento, y por eso no sale en la lista de Movimientos: el
   * saldo de una cuenta es `saldo_inicial + ingresos − egresos`. Hasta el
   * 20-sep no se podía corregir, y eso dejaba sin salida el caso más común
   * de todos: el número que se teclea el primer día, cuando uno apenas está
   * conociendo el sistema. Mike se topó con $148,000 de prueba que no
   * aparecían en ningún movimiento —porque no son uno— y que no había
   * manera de bajar sin borrar la cuenta entera. */
  const [saldoInicial, setSaldoInicial] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!id) return;
    getCuenta(id)
      .then((c) => {
        if (!c) {
          setError("Cuenta no encontrada");
          return;
        }
        setCuenta(c);
        setNombre(c.nombre);
        setTipo(c.tipo);
        setBanco(c.banco ?? "");
        setNumero(c.numero ?? "");
        setMoneda(c.moneda);
        setSaldoInicial(String(c.saldo_inicial));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await updateCuenta(id, {
        nombre: nombre.trim(),
        tipo,
        banco: banco.trim() || undefined,
        numero: numero.trim() || undefined,
        moneda,
        saldo_inicial: Number(saldoInicial) || 0,
      });
      setNotice("Cambios guardados");
      setTimeout(() => setNotice(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setError("");
    setDeleting(true);
    try {
      await deleteCuenta(id);
      router.push("/cuentas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
      setDeleting(false);
    }
  };

  if (loading) return <div className="text-sm text-ink-muted">Cargando…</div>;
  if (!cuenta && error)
    return (
      <div>
        <Link href="/cuentas" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
      </div>
    );

  return (
    <div className="max-w-lg">
      <Link
        href="/cuentas"
        className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition"
      >
        <IconArrowLeft size={13} />
        Volver a cuentas
      </Link>

      <h2 className="text-lg font-medium text-ink-dim">Editar cuenta</h2>
      <p className="text-xs text-ink-muted mt-0.5 mb-6">
        Saldo actual: <strong>{formatMonto(cuenta!.saldo_actual, cuenta!.moneda)}</strong>
      </p>

      <form onSubmit={handleSave} className="space-y-4">
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
                className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
              />
            </div>
          </div>
        )}

        <div>
          <label htmlFor="saldo-inicial" className="text-xs font-medium text-ink-dim block mb-1.5">
            Saldo inicial
          </label>
          <input
            id="saldo-inicial"
            type="number"
            step="0.01"
            value={saldoInicial}
            onChange={(e) => setSaldoInicial(e.target.value)}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-ink/40 transition"
          />
          <p className="text-[11px] text-ink-muted mt-1.5">
            Con cuánto empezó esta cuenta. <strong>No es un movimiento</strong>: por eso no aparece en
            la lista de Movimientos. El saldo que ves es este número más los ingresos, menos los egresos —
            así que al cambiarlo se recorre el saldo completo de la cuenta en esa misma cantidad.
          </p>
        </div>

        {error && (
          <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
        )}
        {notice && (
          <p className="text-xs text-mint-900 bg-mint-50 px-3 py-2 rounded-xl">{notice}</p>
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
            disabled={saving || !nombre.trim()}
            className="bg-ink text-cream rounded-xl px-5 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>

      <div className="mt-10 pt-6 border-t border-mauve-50">
        <h3 className="text-xs font-medium text-mauve-900 uppercase tracking-wide mb-2">
          Zona peligrosa
        </h3>
        <p className="text-xs text-ink-muted mb-3">
          Eliminar esta cuenta <strong>no</strong> borra sus movimientos históricos.
        </p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 border border-mauve-50 text-mauve-900 rounded-xl px-3 py-2 text-sm hover:bg-mauve-50 transition"
          >
            <IconTrash size={14} />
            Eliminar cuenta
          </button>
        ) : (
          <div className="bg-mauve-50 rounded-xl p-3 flex gap-2 items-center">
            <span className="text-xs text-mauve-900 flex-1">¿Confirmar eliminación?</span>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="text-xs text-mauve-900 px-2 py-1.5 hover:underline"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-mauve-900 text-cream rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40 transition"
            >
              {deleting ? "Eliminando…" : "Sí, eliminar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
