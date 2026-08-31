"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { listCuentas } from "@/lib/cuentas";
import { createOpex } from "@/lib/opex";
import type { Cuenta, FrecuenciaOpex, TipoOpex, Moneda } from "@/types/schema";
import { FRECUENCIA_LABELS, DIAS_SEMANA } from "@/types/schema";
import { IconArrowLeft } from "@tabler/icons-react";

export default function NuevoOpexPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { activo } = useNegocioActivo();

  const [cuentas, setCuentas] = useState<Cuenta[]>([]);

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoOpex>("egreso");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<Moneda>(activo?.moneda ?? "MXN");
  const [frecuencia, setFrecuencia] = useState<FrecuenciaOpex>("mensual");
  const [diaSemana, setDiaSemana] = useState<number>(1); // lunes
  const [diaDelMes, setDiaDelMes] = useState<number>(1);
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().slice(0, 10));
  const [fechaFin, setFechaFin] = useState("");
  const [cuentaId, setCuentaId] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!activo?.id) return;
    listCuentas(activo.id).then(setCuentas);
  }, [activo]);

  if (!activo) {
    return (
      <div className="max-w-lg">
        <Link href="/opex" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-ink-muted">Selecciona un negocio primero.</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError("");

    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) {
      setError("Monto inválido");
      return;
    }

    const cuenta = cuentas.find((c) => c.id === cuentaId);

    setSubmitting(true);
    try {
      await createOpex(user.uid, {
        nombre: nombre.trim(),
        tipo,
        monto: montoNum,
        moneda,
        frecuencia,
        dia_semana: frecuencia === "semanal" ? diaSemana : null,
        dia_del_mes: frecuencia === "mensual" ? diaDelMes : null,
        fecha_inicio: new Date(fechaInicio),
        fecha_fin: fechaFin ? new Date(fechaFin) : null,
        cuenta_id: cuenta?.id ?? null,
        cuenta_nombre: cuenta?.nombre ?? null,
        categoria: categoria.trim() || undefined,
        activo: true,
        negocio_id: activo.id!,
        descripcion: descripcion.trim() || undefined,
      });
      router.push("/opex");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg">
      <Link
        href="/opex"
        className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition"
      >
        <IconArrowLeft size={13} />
        Volver a OPEX
      </Link>

      <h2 className="text-lg font-medium text-ink-dim">Agregar gasto recurrente</h2>
      <p className="text-xs text-ink-muted mt-0.5 mb-6">
        Se agregará a <strong>{activo.nombre}</strong>
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo("egreso")}
              className={`p-3 rounded-xl border text-sm font-medium transition ${
                tipo === "egreso"
                  ? "bg-mauve-50 border-mauve-900 text-mauve-900"
                  : "bg-white border-black/10 text-ink-muted hover:border-black/20"
              }`}
            >
              Egreso (sale dinero)
            </button>
            <button
              type="button"
              onClick={() => setTipo("ingreso")}
              className={`p-3 rounded-xl border text-sm font-medium transition ${
                tipo === "ingreso"
                  ? "bg-mint-50 border-mint-900 text-mint-900"
                  : "bg-white border-black/10 text-ink-muted hover:border-black/20"
              }`}
            >
              Ingreso (entra dinero)
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">
            Nombre <span className="text-mauve-900">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={80}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Renta oficina, Salario Juan, Netflix, Gasolina…"
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">
              Monto <span className="text-mauve-900">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0.00"
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition text-right"
            />
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

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Frecuencia</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(FRECUENCIA_LABELS) as FrecuenciaOpex[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFrecuencia(f)}
                className={`p-2.5 rounded-xl border text-xs font-medium transition ${
                  frecuencia === f
                    ? "border-ink bg-cream"
                    : "border-black/10 bg-white text-ink-muted hover:border-black/20"
                }`}
              >
                {FRECUENCIA_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        {frecuencia === "semanal" && (
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">
              Día de la semana
            </label>
            <select
              value={diaSemana}
              onChange={(e) => setDiaSemana(parseInt(e.target.value, 10))}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            >
              {DIAS_SEMANA.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        {frecuencia === "mensual" && (
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">
              Día del mes
            </label>
            <input
              type="number"
              min="1"
              max="31"
              value={diaDelMes}
              onChange={(e) => setDiaDelMes(parseInt(e.target.value, 10) || 1)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
            <p className="text-[11px] text-ink-muted mt-1">
              Si el mes no tiene ese día (ej. 31 en febrero), se usa el último día del mes.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">
              Fecha inicio
            </label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">
              Fecha fin (opcional)
            </label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">
            Cuenta (opcional)
          </label>
          <select
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          >
            <option value="">— Sin especificar —</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-ink-muted mt-1">
            Cuenta preferida (solo referencia). No mueve saldos automáticamente.
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">
            Categoría (opcional)
          </label>
          <input
            type="text"
            maxLength={40}
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder="Salarios, Servicios, Infra…"
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Notas</label>
          <textarea
            maxLength={300}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 resize-none transition"
          />
        </div>

        {error && (
          <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
        )}

        <div className="flex gap-2 pt-2">
          <Link
            href="/opex"
            className="bg-transparent border border-black/15 rounded-xl px-4 py-2 text-sm text-ink-dim hover:bg-white transition"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={submitting || !nombre.trim() || !monto}
            className="bg-ink text-cream rounded-xl px-5 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
          >
            {submitting ? "Creando…" : "Crear OPEX"}
          </button>
        </div>
      </form>
    </div>
  );
}
