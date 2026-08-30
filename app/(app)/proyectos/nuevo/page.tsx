"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { listClientes } from "@/lib/clientes";
import { listProveedores } from "@/lib/proveedores";
import { createProyecto } from "@/lib/proyectos";
import type { Cliente, Proveedor, EstadoProyecto } from "@/types/schema";
import { ESTADO_PROYECTO_LABELS } from "@/types/schema";
import { formatMonto } from "@/lib/format";
import { IconArrowLeft, IconPlus, IconTrash } from "@tabler/icons-react";

interface Partida {
  proveedor_id: string;
  proveedor_nombre: string;
  concepto: string;
  monto_acordado: string;
}

export default function NuevoProyectoPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { activo } = useNegocioActivo();

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [precioVenta, setPrecioVenta] = useState("0");
  const [estado, setEstado] = useState<EstadoProyecto>("planeando");
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().slice(0, 10));
  const [partidas, setPartidas] = useState<Partida[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!activo?.id) {
      setLoadingCatalog(false);
      return;
    }
    Promise.all([listClientes(activo.id), listProveedores()])
      .then(([cs, ps]) => {
        setClientes(cs);
        setProveedores(ps);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error cargando catálogo"))
      .finally(() => setLoadingCatalog(false));
  }, [activo]);

  if (!activo) {
    return (
      <div className="max-w-lg">
        <Link href="/proyectos" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-ink-muted">Selecciona o crea un negocio primero.</p>
      </div>
    );
  }

  const addPartida = () => {
    setPartidas([
      ...partidas,
      { proveedor_id: "", proveedor_nombre: "", concepto: "", monto_acordado: "0" },
    ]);
  };

  const updatePartida = (i: number, patch: Partial<Partida>) => {
    setPartidas((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const removePartida = (i: number) => {
    setPartidas((prev) => prev.filter((_, idx) => idx !== i));
  };

  const compromiso = partidas.reduce((s, p) => s + (parseFloat(p.monto_acordado) || 0), 0);
  const precioNum = parseFloat(precioVenta) || 0;
  const margen = precioNum - compromiso;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError("");

    const cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente) {
      setError("Selecciona un cliente");
      return;
    }

    // Validar partidas
    const partidasValidas = partidas.filter((p) => p.proveedor_id && parseFloat(p.monto_acordado) > 0);
    for (const p of partidas) {
      if (p.proveedor_id && !parseFloat(p.monto_acordado)) {
        setError("Todas las partidas deben tener monto");
        return;
      }
      if (!p.proveedor_id && parseFloat(p.monto_acordado) > 0) {
        setError("Selecciona proveedor para todas las partidas");
        return;
      }
    }

    setSubmitting(true);
    try {
      await createProyecto(user.uid, {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        cliente_id: cliente.id!,
        cliente_nombre: cliente.nombre,
        negocio_id: activo.id!,
        negocio_nombre: activo.nombre,
        precio_venta: precioNum,
        partidas: partidasValidas.map((p) => ({
          proveedor_id: p.proveedor_id,
          proveedor_nombre: p.proveedor_nombre,
          concepto: p.concepto.trim() || undefined,
          monto_acordado: parseFloat(p.monto_acordado),
        })),
        estado,
        fecha_inicio: new Date(fechaInicio),
      });
      router.push("/proyectos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingCatalog) return <div className="text-sm text-ink-muted">Cargando catálogo…</div>;

  return (
    <div className="max-w-2xl">
      <Link
        href="/proyectos"
        className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition"
      >
        <IconArrowLeft size={13} />
        Volver a proyectos
      </Link>

      <h2 className="text-lg font-medium text-ink-dim">Crear proyecto</h2>
      <p className="text-xs text-ink-muted mt-0.5 mb-6">
        Se agregará a <strong>{activo.nombre}</strong>
      </p>

      {clientes.length === 0 && (
        <div className="bg-sky-50 text-sky-900 text-xs px-3 py-2 rounded-xl mb-4">
          Este negocio no tiene clientes.{" "}
          <Link href="/clientes/nuevo" className="underline">
            Crear cliente
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">
            Nombre <span className="text-mauve-900">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={100}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Sitio web Boutique Luna"
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Descripción</label>
          <textarea
            maxLength={300}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 resize-none transition"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">
              Cliente <span className="text-mauve-900">*</span>
            </label>
            <select
              required
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              disabled={clientes.length === 0}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition disabled:opacity-60"
            >
              <option value="">— Selecciona —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Estado</label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoProyecto)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            >
              {Object.entries(ESTADO_PROYECTO_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Fecha inicio</label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">
              Precio de venta ({activo.moneda})
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>
        </div>

        {/* Partidas */}
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

          {partidas.length === 0 ? (
            <div className="bg-cream/60 rounded-xl p-4 text-center text-xs text-ink-muted">
              Sin partidas. Agrega proveedores con montos acordados para calcular margen.
            </div>
          ) : (
            <div className="space-y-2">
              {partidas.map((p, i) => (
                <div key={i} className="bg-white border border-black/10 rounded-xl p-3 flex gap-2 items-start">
                  <select
                    value={p.proveedor_id}
                    onChange={(e) => {
                      const prov = proveedores.find((x) => x.id === e.target.value);
                      updatePartida(i, {
                        proveedor_id: e.target.value,
                        proveedor_nombre: prov?.nombre ?? "",
                      });
                    }}
                    className="flex-1 min-w-0 bg-bg border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                  >
                    <option value="">— Proveedor —</option>
                    {proveedores.map((pr) => (
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

          {(partidas.length > 0 || precioNum > 0) && (
            <div className="mt-3 bg-cream rounded-xl p-3 grid grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-ink-muted">Compromiso total</p>
                <p className="font-medium text-mauve-900">{formatMonto(compromiso, activo.moneda)}</p>
              </div>
              <div>
                <p className="text-ink-muted">Precio venta</p>
                <p className="font-medium text-ink-dim">{formatMonto(precioNum, activo.moneda)}</p>
              </div>
              <div>
                <p className="text-ink-muted">Margen proyectado</p>
                <p className={`font-medium ${margen >= 0 ? "text-mint-900" : "text-mauve-900"}`}>
                  {formatMonto(margen, activo.moneda)}
                </p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
        )}

        <div className="flex gap-2 pt-2">
          <Link
            href="/proyectos"
            className="bg-transparent border border-black/15 rounded-xl px-4 py-2 text-sm text-ink-dim hover:bg-white transition"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={submitting || !nombre.trim() || !clienteId || clientes.length === 0}
            className="bg-ink text-cream rounded-xl px-5 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
          >
            {submitting ? "Creando…" : "Crear proyecto"}
          </button>
        </div>
      </form>
    </div>
  );
}
