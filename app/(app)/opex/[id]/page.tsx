"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { listCuentas } from "@/lib/cuentas";
import { getOpex, updateOpex, deleteOpex } from "@/lib/opex";
import type { Opex, Cuenta, FrecuenciaOpex, TipoOpex, Moneda } from "@/types/schema";
import { FRECUENCIA_LABELS, DIAS_SEMANA } from "@/types/schema";
import { Timestamp } from "firebase/firestore";
import { IconArrowLeft, IconTrash } from "@tabler/icons-react";

export default function OpexDetallePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { activo } = useNegocioActivo();

  const [opex, setOpex] = useState<Opex | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);

  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoOpex>("egreso");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("MXN");
  const [frecuencia, setFrecuencia] = useState<FrecuenciaOpex>("mensual");
  const [diaSemana, setDiaSemana] = useState<number>(1);
  const [diaDelMes, setDiaDelMes] = useState<number>(1);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [cuentaId, setCuentaId] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [activoOpex, setActivoOpex] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!id) return;
    getOpex(id)
      .then((o) => {
        if (!o) {
          setError("OPEX no encontrado");
          return;
        }
        setOpex(o);
        setNombre(o.nombre);
        setTipo(o.tipo);
        setMonto(String(o.monto));
        setMoneda(o.moneda);
        setFrecuencia(o.frecuencia);
        if (o.dia_semana != null) setDiaSemana(o.dia_semana);
        if (o.dia_del_mes != null) setDiaDelMes(o.dia_del_mes);
        const fi = o.fecha_inicio as Timestamp;
        if (fi?.toDate) setFechaInicio(fi.toDate().toISOString().slice(0, 10));
        const ff = o.fecha_fin as Timestamp | null;
        if (ff?.toDate) setFechaFin(ff.toDate().toISOString().slice(0, 10));
        setCuentaId(o.cuenta_id ?? "");
        setCategoria(o.categoria ?? "");
        setDescripcion(o.descripcion ?? "");
        setActivoOpex(o.activo);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!activo?.id) return;
    listCuentas(activo.id).then(setCuentas);
  }, [activo]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const cuenta = cuentas.find((c) => c.id === cuentaId);
      await updateOpex(id, {
        nombre: nombre.trim(),
        tipo,
        monto: parseFloat(monto) || 0,
        moneda,
        frecuencia,
        dia_semana: frecuencia === "semanal" ? diaSemana : null,
        dia_del_mes: frecuencia === "mensual" ? diaDelMes : null,
        fecha_inicio: new Date(fechaInicio),
        fecha_fin: fechaFin ? new Date(fechaFin) : null,
        cuenta_id: cuenta?.id ?? null,
        cuenta_nombre: cuenta?.nombre ?? null,
        categoria: categoria.trim() || undefined,
        descripcion: descripcion.trim() || undefined,
        activo: activoOpex,
      });
      setNotice("Cambios guardados");
      setTimeout(() => setNotice(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setError("");
    setDeleting(true);
    try {
      await deleteOpex(id);
      router.push("/opex");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
      setDeleting(false);
    }
  };

  if (loading) return <div className="text-sm text-ink-muted">Cargando…</div>;
  if (!opex)
    return (
      <div>
        <Link href="/opex" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">
          {error || "OPEX no encontrado"}
        </p>
      </div>
    );

  return (
    <div className="max-w-lg">
      <Link
        href="/opex"
        className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition"
      >
        <IconArrowLeft size={13} />
        Volver a OPEX
      </Link>

      <h2 className="text-lg font-medium text-ink-dim">Editar OPEX</h2>

      <form onSubmit={handleSave} className="space-y-4 mt-6">
        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipo("egreso")}
              className={`p-2.5 rounded-xl border text-sm font-medium transition ${
                tipo === "egreso"
                  ? "bg-mauve-50 border-mauve-900 text-mauve-900"
                  : "bg-white border-black/10 text-ink-muted"
              }`}
            >
              Egreso
            </button>
            <button
              type="button"
              onClick={() => setTipo("ingreso")}
              className={`p-2.5 rounded-xl border text-sm font-medium transition ${
                tipo === "ingreso"
                  ? "bg-mint-50 border-mint-900 text-mint-900"
                  : "bg-white border-black/10 text-ink-muted"
              }`}
            >
              Ingreso
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Nombre</label>
          <input
            type="text"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Monto</label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
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
                    : "border-black/10 bg-white text-ink-muted"
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
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Día del mes</label>
            <input
              type="number"
              min="1"
              max="31"
              value={diaDelMes}
              onChange={(e) => setDiaDelMes(parseInt(e.target.value, 10) || 1)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
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
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Fecha fin</label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Cuenta</label>
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
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Categoría</label>
          <input
            type="text"
            maxLength={40}
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Notas</label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 resize-none transition"
          />
        </div>

        <label className="flex items-center gap-2 pt-1 cursor-pointer">
          <input
            type="checkbox"
            checked={activoOpex}
            onChange={(e) => setActivoOpex(e.target.checked)}
          />
          <span className="text-sm text-ink-dim">Activo (se cuenta en proyección)</span>
        </label>

        {error && (
          <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
        )}
        {notice && (
          <p className="text-xs text-mint-900 bg-mint-50 px-3 py-2 rounded-xl">{notice}</p>
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
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 border border-mauve-50 text-mauve-900 rounded-xl px-3 py-2 text-sm hover:bg-mauve-50 transition"
          >
            <IconTrash size={14} />
            Eliminar OPEX
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
