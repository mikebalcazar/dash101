"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { listCuentas } from "@/lib/cuentas";
import { listClientes } from "@/lib/clientes";
import { listProveedores } from "@/lib/proveedores";
import { listProyectos } from "@/lib/proyectos";
import { createMovimiento } from "@/lib/movimientos";
import type {
  Cuenta,
  Cliente,
  Proveedor,
  Proyecto,
  TipoMovimiento,
} from "@/types/schema";
import { formatMonto } from "@/lib/format";
import { IconArrowLeft, IconArrowDownLeft, IconArrowUpRight, IconTransfer } from "@tabler/icons-react";

const TIPO_META = {
  ingreso: {
    label: "Ingreso",
    color: "bg-mint-50 text-mint-900 border-mint-900",
    icon: IconArrowDownLeft,
    verbo: "entra a",
  },
  egreso: {
    label: "Egreso",
    color: "bg-mauve-50 text-mauve-900 border-mauve-900",
    icon: IconArrowUpRight,
    verbo: "sale de",
  },
  transferencia: {
    label: "Transferencia",
    color: "bg-sky-50 text-sky-900 border-sky-900",
    icon: IconTransfer,
    verbo: "se mueve de",
  },
} as const;

export default function NuevoMovimientoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { activo } = useNegocioActivo();

  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loadingCat, setLoadingCat] = useState(true);

  const [tipo, setTipo] = useState<TipoMovimiento>(
    (searchParams?.get("tipo") as TipoMovimiento) || "ingreso"
  );
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [cuentaId, setCuentaId] = useState("");
  const [cuentaDestinoId, setCuentaDestinoId] = useState("");
  const [proyectoId, setProyectoId] = useState(searchParams?.get("proyecto") || "");
  const [contraparteId, setContraparteId] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!activo?.id) {
      setLoadingCat(false);
      return;
    }
    Promise.all([
      listCuentas(activo.id),
      listClientes(activo.id),
      listProveedores(),
      listProyectos(activo.id),
    ])
      .then(([cs, cls, pvs, prs]) => {
        setCuentas(cs);
        setClientes(cls);
        setProveedores(pvs);
        setProyectos(prs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error catálogo"))
      .finally(() => setLoadingCat(false));
  }, [activo]);

  // Auto-seleccionar cliente cuando se elige proyecto (ingreso)
  useEffect(() => {
    if (tipo === "ingreso" && proyectoId) {
      const pr = proyectos.find((p) => p.id === proyectoId);
      if (pr) setContraparteId(pr.cliente_id);
    }
  }, [proyectoId, tipo, proyectos]);

  if (!activo) {
    return (
      <div className="max-w-lg">
        <Link href="/movimientos" className="text-xs text-ink-muted hover:text-ink-dim">
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

    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) {
      setError("Ingresa un monto válido");
      return;
    }

    const cuentaOrigen = cuentas.find((c) => c.id === cuentaId);
    if (!cuentaOrigen) {
      setError("Selecciona una cuenta");
      return;
    }

    let cuentaDestino: Cuenta | undefined;
    let contraparteNombre = "";
    let contraparteTipoVal: "cliente" | "proveedor" | "cuenta" = "cliente";
    let proyectoNombre: string | null = null;

    if (tipo === "transferencia") {
      cuentaDestino = cuentas.find((c) => c.id === cuentaDestinoId);
      if (!cuentaDestino) {
        setError("Selecciona cuenta destino");
        return;
      }
      if (cuentaDestino.id === cuentaOrigen.id) {
        setError("Cuenta origen y destino no pueden ser la misma");
        return;
      }
      contraparteNombre = cuentaDestino.nombre;
      contraparteTipoVal = "cuenta";
    } else {
      if (tipo === "ingreso") {
        const cl = clientes.find((c) => c.id === contraparteId);
        if (!cl) {
          setError("Selecciona un cliente");
          return;
        }
        contraparteNombre = cl.nombre;
        contraparteTipoVal = "cliente";
      } else {
        const pv = proveedores.find((p) => p.id === contraparteId);
        if (!pv) {
          setError("Selecciona un proveedor");
          return;
        }
        contraparteNombre = pv.nombre;
        contraparteTipoVal = "proveedor";
      }

      if (proyectoId) {
        const pr = proyectos.find((p) => p.id === proyectoId);
        proyectoNombre = pr?.nombre ?? null;
      }
    }

    setSubmitting(true);
    try {
      await createMovimiento(user.uid, {
        tipo,
        monto: montoNum,
        fecha: new Date(fecha),
        cuenta_id: cuentaOrigen.id!,
        cuenta_nombre: cuentaOrigen.nombre,
        cuenta_destino_id: cuentaDestino?.id ?? null,
        cuenta_destino_nombre: cuentaDestino?.nombre ?? null,
        proyecto_id: tipo === "transferencia" ? null : proyectoId || null,
        proyecto_nombre: tipo === "transferencia" ? null : proyectoNombre,
        contraparte_id: tipo === "transferencia" ? cuentaDestino!.id! : contraparteId,
        contraparte_tipo: contraparteTipoVal,
        contraparte_nombre: contraparteNombre,
        negocio_id: activo.id!,
        descripcion: descripcion.trim() || undefined,
      });
      router.push("/movimientos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear movimiento");
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingCat) return <div className="text-sm text-ink-muted">Cargando catálogo…</div>;

  const cuentasDisponibles = cuentas;
  const proyectosActivos = proyectos.filter((p) => p.estado !== "cerrado");

  return (
    <div className="max-w-lg">
      <Link
        href="/movimientos"
        className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition"
      >
        <IconArrowLeft size={13} />
        Volver a movimientos
      </Link>

      <h2 className="text-lg font-medium text-ink-dim">Registrar movimiento</h2>
      <p className="text-xs text-ink-muted mt-0.5 mb-6">
        Se agregará a <strong>{activo.nombre}</strong>
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tipo — segmented */}
        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Tipo</label>
          <div className="grid grid-cols-3 gap-2">
            {(["ingreso", "egreso", "transferencia"] as TipoMovimiento[]).map((t) => {
              const meta = TIPO_META[t];
              const active = tipo === t;
              const Icon = meta.icon;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTipo(t);
                    setContraparteId("");
                    setProyectoId("");
                    setCuentaDestinoId("");
                  }}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition ${
                    active ? meta.color : "bg-white border-black/10 text-ink-muted hover:border-black/20"
                  }`}
                >
                  <Icon size={16} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">
              Monto ({activo.moneda}) <span className="text-mauve-900">*</span>
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
        </div>

        {/* Cuenta origen / destino según tipo */}
        {tipo === "transferencia" ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-ink-dim block mb-1.5">
                Cuenta origen <span className="text-mauve-900">*</span>
              </label>
              <select
                required
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
                className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
              >
                <option value="">— Selecciona —</option>
                {cuentasDisponibles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} · {formatMonto(c.saldo_actual, c.moneda)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-ink-dim block mb-1.5">
                Cuenta destino <span className="text-mauve-900">*</span>
              </label>
              <select
                required
                value={cuentaDestinoId}
                onChange={(e) => setCuentaDestinoId(e.target.value)}
                className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
              >
                <option value="">— Selecciona —</option>
                {cuentasDisponibles
                  .filter((c) => c.id !== cuentaId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs font-medium text-ink-dim block mb-1.5">
                Cuenta ({tipo === "ingreso" ? "destino" : "origen"}){" "}
                <span className="text-mauve-900">*</span>
              </label>
              <select
                required
                value={cuentaId}
                onChange={(e) => setCuentaId(e.target.value)}
                className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
              >
                <option value="">— Selecciona —</option>
                {cuentasDisponibles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} · {formatMonto(c.saldo_actual, c.moneda)}
                  </option>
                ))}
              </select>
              {cuentas.length === 0 && (
                <p className="text-xs text-ink-muted mt-1">
                  Sin cuentas.{" "}
                  <Link href="/cuentas/nueva" className="underline">
                    Crear cuenta
                  </Link>
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-ink-dim block mb-1.5">
                Proyecto {tipo === "ingreso" && <span className="text-mauve-900">*</span>}
                {tipo === "egreso" && <span className="text-ink-muted"> (opcional)</span>}
              </label>
              <select
                required={tipo === "ingreso"}
                value={proyectoId}
                onChange={(e) => setProyectoId(e.target.value)}
                className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
              >
                <option value="">
                  {tipo === "ingreso" ? "— Selecciona —" : "— Sin proyecto —"}
                </option>
                {proyectosActivos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · {p.cliente_nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-ink-dim block mb-1.5">
                {tipo === "ingreso" ? "Cliente" : "Proveedor"}{" "}
                <span className="text-mauve-900">*</span>
              </label>
              <select
                required
                value={contraparteId}
                onChange={(e) => setContraparteId(e.target.value)}
                className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
              >
                <option value="">— Selecciona —</option>
                {tipo === "ingreso"
                  ? clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))
                  : proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
              </select>
            </div>
          </>
        )}

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Descripción</label>
          <input
            type="text"
            maxLength={200}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Nota opcional"
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>

        {error && (
          <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
        )}

        <div className="flex gap-2 pt-2">
          <Link
            href="/movimientos"
            className="bg-transparent border border-black/15 rounded-xl px-4 py-2 text-sm text-ink-dim hover:bg-white transition"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={submitting || !monto || !cuentaId}
            className="bg-ink text-cream rounded-xl px-5 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
          >
            {submitting ? "Registrando…" : "Registrar movimiento"}
          </button>
        </div>
      </form>
    </div>
  );
}
