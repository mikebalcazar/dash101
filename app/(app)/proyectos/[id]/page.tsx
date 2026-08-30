"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getProyecto, updateProyecto, deleteProyecto } from "@/lib/proyectos";
import { listProveedores } from "@/lib/proveedores";
import type { Proyecto, Proveedor, EstadoProyecto, PartidaProyecto } from "@/types/schema";
import { ESTADO_PROYECTO_LABELS } from "@/types/schema";
import { formatMonto, formatMontoExact } from "@/lib/format";
import { Timestamp } from "firebase/firestore";
import { IconArrowLeft, IconTrash, IconPlus, IconEdit } from "@tabler/icons-react";

const ESTADO_STYLE: Record<string, string> = {
  planeando: "bg-cream text-ink-muted",
  activo: "bg-mint-50 text-mint-900",
  pausado: "bg-sky-50 text-sky-900",
  cerrado: "bg-mauve-50 text-mauve-900",
};

const PARTIDA_ESTADO_STYLE: Record<string, string> = {
  pendiente: "bg-cream text-ink-muted",
  parcial: "bg-sky-50 text-sky-900",
  pagado: "bg-mint-50 text-mint-900",
};

interface PartidaForm {
  proveedor_id: string;
  proveedor_nombre: string;
  concepto: string;
  monto_acordado: string;
}

export default function ProyectoDetallePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [editMode, setEditMode] = useState(false);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precioVenta, setPrecioVenta] = useState("0");
  const [estado, setEstado] = useState<EstadoProyecto>("planeando");
  const [fechaInicio, setFechaInicio] = useState("");
  const [partidasEdit, setPartidasEdit] = useState<PartidaForm[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadProyecto = () => {
    return getProyecto(id).then((p) => {
      if (!p) {
        setError("Proyecto no encontrado");
        return;
      }
      setProyecto(p);
      setNombre(p.nombre);
      setDescripcion(p.descripcion ?? "");
      setPrecioVenta(String(p.precio_venta));
      setEstado(p.estado);
      const fi = p.fecha_inicio as Timestamp | undefined;
      if (fi && typeof fi.toDate === "function") {
        setFechaInicio(fi.toDate().toISOString().slice(0, 10));
      }
      setPartidasEdit(
        (p.partidas ?? []).map((pt) => ({
          proveedor_id: pt.proveedor_id,
          proveedor_nombre: pt.proveedor_nombre,
          concepto: pt.concepto ?? "",
          monto_acordado: String(pt.monto_acordado),
        }))
      );
    });
  };

  useEffect(() => {
    if (!id) return;
    Promise.all([loadProyecto(), listProveedores().then(setProveedores)])
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      // Validar partidas
      const partidasValidas = partidasEdit.filter(
        (p) => p.proveedor_id && parseFloat(p.monto_acordado) > 0
      );
      for (const p of partidasEdit) {
        if (p.proveedor_id && !parseFloat(p.monto_acordado)) {
          setError("Todas las partidas necesitan monto");
          setSaving(false);
          return;
        }
      }

      await updateProyecto(id, {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || "",
        precio_venta: parseFloat(precioVenta) || 0,
        estado,
        fecha_inicio: fechaInicio ? new Date(fechaInicio) : undefined,
        partidas: partidasValidas.map((p) => ({
          proveedor_id: p.proveedor_id,
          proveedor_nombre: p.proveedor_nombre,
          concepto: p.concepto.trim() || undefined,
          monto_acordado: parseFloat(p.monto_acordado),
        })),
      });
      await loadProyecto();
      setEditMode(false);
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
      await deleteProyecto(id);
      router.push("/proyectos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
      setDeleting(false);
    }
  };

  if (loading) return <div className="text-sm text-ink-muted">Cargando…</div>;
  if (!proyecto)
    return (
      <div>
        <Link href="/proyectos" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">
          {error || "Proyecto no encontrado"}
        </p>
      </div>
    );

  const p = proyecto;
  const pctCobrado = p.precio_venta > 0 ? (p.cobrado / p.precio_venta) * 100 : 0;
  const pctPagado = p.compromiso_total > 0 ? (p.pagado / p.compromiso_total) * 100 : 0;
  const porCobrar = p.precio_venta - p.cobrado;
  const porPagar = p.compromiso_total - p.pagado;

  return (
    <div className="max-w-3xl">
      <Link
        href="/proyectos"
        className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition"
      >
        <IconArrowLeft size={13} />
        Volver a proyectos
      </Link>

      {!editMode ? (
        <>
          {/* Header */}
          <div className="flex justify-between items-start gap-3 mb-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-medium text-ink-dim">{p.nombre}</h2>
              <div className="flex items-center gap-2 mt-1 text-xs text-ink-muted flex-wrap">
                <span>{p.cliente_nombre}</span>
                <span className="opacity-40">·</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${ESTADO_STYLE[p.estado] ?? ""}`}
                >
                  {ESTADO_PROYECTO_LABELS[p.estado]}
                </span>
              </div>
              {p.descripcion && (
                <p className="text-xs text-ink-muted mt-2">{p.descripcion}</p>
              )}
            </div>
            <button
              onClick={() => setEditMode(true)}
              className="text-xs bg-white border border-black/10 rounded-xl px-3 py-1.5 hover:border-black/20 transition flex items-center gap-1"
            >
              <IconEdit size={13} />
              Editar
            </button>
          </div>

          {/* Hero disponible */}
          <div className="bg-cream rounded-3xl p-6 mb-3">
            <p className="text-xs text-ink-muted mb-1 font-medium">Capital disponible</p>
            <p className="text-4xl font-medium tracking-tight text-ink-dim leading-none">
              {formatMonto(p.disponible ?? 0, "MXN")}
            </p>
            <p className="text-xs text-ink-muted mt-2">
              {formatMonto(p.cobrado, "MXN")} cobrado − {formatMonto(p.pagado, "MXN")} pagado
            </p>
          </div>

          {/* Ingreso + Egreso side by side */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-mint-50 rounded-2xl p-4">
              <p className="text-xs text-mint-label font-medium mb-2">Ingreso del cliente</p>
              <div className="flex justify-between text-xs text-mint-label mb-0.5">
                <span>Precio venta</span>
                <span className="font-medium">{formatMonto(p.precio_venta, "MXN")}</span>
              </div>
              <div className="flex justify-between text-sm text-mint-900 mb-1.5">
                <span>Cobrado</span>
                <span className="font-medium">{formatMonto(p.cobrado, "MXN")}</span>
              </div>
              <div className="h-1.5 bg-white/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-mint-900"
                  style={{ width: `${Math.min(pctCobrado, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-mint-label mt-1">
                <span>{pctCobrado.toFixed(0)}% cobrado</span>
                <span>{formatMonto(porCobrar, "MXN")} pendiente</span>
              </div>
            </div>

            <div className="bg-mauve-50 rounded-2xl p-4">
              <p className="text-xs text-mauve-label font-medium mb-2">Egreso a proveedores</p>
              <div className="flex justify-between text-xs text-mauve-label mb-0.5">
                <span>Compromiso</span>
                <span className="font-medium">{formatMonto(p.compromiso_total, "MXN")}</span>
              </div>
              <div className="flex justify-between text-sm text-mauve-900 mb-1.5">
                <span>Pagado</span>
                <span className="font-medium">{formatMonto(p.pagado, "MXN")}</span>
              </div>
              <div className="h-1.5 bg-white/50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-mauve-900"
                  style={{ width: `${Math.min(pctPagado, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-mauve-label mt-1">
                <span>{pctPagado.toFixed(0)}% pagado</span>
                <span>{formatMonto(porPagar, "MXN")} pendiente</span>
              </div>
            </div>
          </div>

          {/* Margen */}
          <div className="bg-white border border-black/5 rounded-2xl p-4 mb-4 flex justify-between items-center">
            <div>
              <p className="text-xs text-ink-muted">Margen proyectado</p>
              <p className="text-lg font-medium text-ink-dim">
                {formatMonto(p.margen_proyectado ?? 0, "MXN")}{" "}
                {p.precio_venta > 0 && (
                  <span className="text-xs text-mint-900 font-medium ml-1">
                    {((p.margen_proyectado / p.precio_venta) * 100).toFixed(0)}%
                  </span>
                )}
              </p>
            </div>
            <p className="text-xs text-ink-muted font-mono">
              {formatMonto(p.precio_venta, "MXN")} − {formatMonto(p.compromiso_total, "MXN")}
            </p>
          </div>

          {/* Partidas table */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-ink-dim mb-2">Partidas de proveedores</h3>
            {p.partidas.length === 0 ? (
              <div className="bg-white border border-black/5 rounded-2xl p-6 text-center text-xs text-ink-muted">
                Sin partidas. Edita el proyecto para agregar.
              </div>
            ) : (
              <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-cream/50 text-xs text-ink-muted uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Proveedor</th>
                      <th className="text-right px-4 py-2 font-medium">Acordado</th>
                      <th className="text-right px-4 py-2 font-medium">Pagado</th>
                      <th className="text-right px-4 py-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.partidas.map((pt: PartidaProyecto) => (
                      <tr key={pt.proveedor_id} className="border-t border-black/5">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-ink-dim">{pt.proveedor_nombre}</p>
                          {pt.concepto && (
                            <p className="text-[11px] text-ink-muted">{pt.concepto}</p>
                          )}
                        </td>
                        <td className="text-right px-4 py-3 text-sm text-ink-dim">
                          {formatMonto(pt.monto_acordado, "MXN")}
                        </td>
                        <td className="text-right px-4 py-3 text-sm text-ink-dim">
                          {formatMonto(pt.monto_pagado, "MXN")}
                        </td>
                        <td className="text-right px-4 py-3">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full ${PARTIDA_ESTADO_STYLE[pt.estado] ?? ""}`}
                          >
                            {pt.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Zona peligrosa */}
          <div className="mt-8 pt-6 border-t border-mauve-50">
            <h3 className="text-xs font-medium text-mauve-900 uppercase tracking-wide mb-2">
              Zona peligrosa
            </h3>
            <p className="text-xs text-ink-muted mb-3">
              Eliminar el proyecto <strong>no</strong> borra sus movimientos históricos.
            </p>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 border border-mauve-50 text-mauve-900 rounded-xl px-3 py-2 text-sm hover:bg-mauve-50 transition"
              >
                <IconTrash size={14} />
                Eliminar proyecto
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
        </>
      ) : (
        <ProyectoEditForm
          proyecto={p}
          proveedores={proveedores}
          nombre={nombre}
          setNombre={setNombre}
          descripcion={descripcion}
          setDescripcion={setDescripcion}
          precioVenta={precioVenta}
          setPrecioVenta={setPrecioVenta}
          estado={estado}
          setEstado={setEstado}
          fechaInicio={fechaInicio}
          setFechaInicio={setFechaInicio}
          partidas={partidasEdit}
          setPartidas={setPartidasEdit}
          onSave={handleSave}
          onCancel={() => {
            setEditMode(false);
            loadProyecto();
          }}
          saving={saving}
          error={error}
          notice={notice}
        />
      )}
    </div>
  );
}

// --- Edit form (extracted for clarity) ---

interface EditFormProps {
  proyecto: Proyecto;
  proveedores: Proveedor[];
  nombre: string;
  setNombre: (v: string) => void;
  descripcion: string;
  setDescripcion: (v: string) => void;
  precioVenta: string;
  setPrecioVenta: (v: string) => void;
  estado: EstadoProyecto;
  setEstado: (v: EstadoProyecto) => void;
  fechaInicio: string;
  setFechaInicio: (v: string) => void;
  partidas: PartidaForm[];
  setPartidas: React.Dispatch<React.SetStateAction<PartidaForm[]>>;
  onSave: (e: React.FormEvent) => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
  notice: string;
}

function ProyectoEditForm(props: EditFormProps) {
  const addPartida = () => {
    props.setPartidas([
      ...props.partidas,
      { proveedor_id: "", proveedor_nombre: "", concepto: "", monto_acordado: "0" },
    ]);
  };
  const updatePartida = (i: number, patch: Partial<PartidaForm>) => {
    props.setPartidas((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };
  const removePartida = (i: number) => {
    props.setPartidas((prev) => prev.filter((_, idx) => idx !== i));
  };

  const compromiso = props.partidas.reduce(
    (s, p) => s + (parseFloat(p.monto_acordado) || 0),
    0
  );
  const precioNum = parseFloat(props.precioVenta) || 0;

  return (
    <form onSubmit={props.onSave} className="space-y-4">
      <h2 className="text-lg font-medium text-ink-dim">Editar proyecto</h2>

      <div>
        <label className="text-xs font-medium text-ink-dim block mb-1.5">Nombre</label>
        <input
          type="text"
          required
          value={props.nombre}
          onChange={(e) => props.setNombre(e.target.value)}
          className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-ink-dim block mb-1.5">Descripción</label>
        <textarea
          value={props.descripcion}
          onChange={(e) => props.setDescripcion(e.target.value)}
          rows={2}
          className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 resize-none transition"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Estado</label>
          <select
            value={props.estado}
            onChange={(e) => props.setEstado(e.target.value as EstadoProyecto)}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          >
            {Object.entries(ESTADO_PROYECTO_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Fecha inicio</label>
          <input
            type="date"
            value={props.fechaInicio}
            onChange={(e) => props.setFechaInicio(e.target.value)}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Precio venta</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={props.precioVenta}
            onChange={(e) => props.setPrecioVenta(e.target.value)}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>
      </div>

      <div className="pt-2">
        <div className="flex justify-between items-baseline mb-2">
          <label className="text-xs font-medium text-ink-dim">Partidas de proveedores</label>
          <button
            type="button"
            onClick={addPartida}
            className="text-xs text-ink hover:underline flex items-center gap-1"
          >
            <IconPlus size={12} />
            Agregar
          </button>
        </div>
        {props.partidas.length === 0 ? (
          <div className="bg-cream/60 rounded-xl p-4 text-center text-xs text-ink-muted">
            Sin partidas.
          </div>
        ) : (
          <div className="space-y-2">
            {props.partidas.map((p, i) => (
              <div
                key={i}
                className="bg-white border border-black/10 rounded-xl p-3 flex gap-2 items-start"
              >
                <select
                  value={p.proveedor_id}
                  onChange={(e) => {
                    const prov = props.proveedores.find((x) => x.id === e.target.value);
                    updatePartida(i, {
                      proveedor_id: e.target.value,
                      proveedor_nombre: prov?.nombre ?? "",
                    });
                  }}
                  className="flex-1 min-w-0 bg-bg border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                >
                  <option value="">— Proveedor —</option>
                  {props.proveedores.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Concepto"
                  value={p.concepto}
                  onChange={(e) => updatePartida(i, { concepto: e.target.value })}
                  className="flex-1 min-w-0 bg-bg border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Monto"
                  value={p.monto_acordado}
                  onChange={(e) => updatePartida(i, { monto_acordado: e.target.value })}
                  className="w-24 bg-bg border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none text-right"
                />
                <button
                  type="button"
                  onClick={() => removePartida(i)}
                  className="text-ink-muted hover:text-mauve-900 p-1"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {(props.partidas.length > 0 || precioNum > 0) && (
          <div className="mt-3 bg-cream rounded-xl p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-ink-muted">Compromiso total</span>
              <span className="font-medium text-mauve-900">
                {formatMontoExact(compromiso)}
              </span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-ink-muted">Margen proyectado</span>
              <span
                className={`font-medium ${precioNum - compromiso >= 0 ? "text-mint-900" : "text-mauve-900"}`}
              >
                {formatMontoExact(precioNum - compromiso)}
              </span>
            </div>
          </div>
        )}
      </div>

      {props.error && (
        <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{props.error}</p>
      )}
      {props.notice && (
        <p className="text-xs text-mint-900 bg-mint-50 px-3 py-2 rounded-xl">{props.notice}</p>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={props.onCancel}
          className="bg-transparent border border-black/15 rounded-xl px-4 py-2 text-sm text-ink-dim hover:bg-white transition"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={props.saving || !props.nombre.trim()}
          className="bg-ink text-cream rounded-xl px-5 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
        >
          {props.saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
