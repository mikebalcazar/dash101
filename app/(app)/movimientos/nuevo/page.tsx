"use client";

import { useEffect, useMemo, useState } from "react";
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
  Negocio,
  TipoMovimiento,
} from "@/types/schema";
import { formatMonto } from "@/lib/format";
import { IconArrowLeft, IconArrowDownLeft, IconArrowUpRight, IconChevronDown } from "@tabler/icons-react";

export default function NuevoMovimientoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { negocios, activo } = useNegocioActivo();

  const [negocioId, setNegocioId] = useState<string>("");
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loadingCat, setLoadingCat] = useState(false);

  const [tipo, setTipo] = useState<TipoMovimiento>(
    (searchParams?.get("tipo") as TipoMovimiento) ?? "ingreso"
  );
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [proyectoId, setProyectoId] = useState(searchParams?.get("proyecto") ?? "");
  const [cuentaId, setCuentaId] = useState("");
  const [contraparteId, setContraparteId] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [showNota, setShowNota] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const negocio = useMemo<Negocio | null>(
    () => negocios.find((n) => n.id === negocioId) ?? null,
    [negocios, negocioId]
  );

  // Setear negocio activo inicial
  useEffect(() => {
    if (!negocioId && activo?.id) setNegocioId(activo.id);
  }, [activo, negocioId]);

  // Cargar catálogos cuando cambia el negocio
  useEffect(() => {
    if (!negocioId) return;
    setLoadingCat(true);
    setCuentaId("");
    setProyectoId("");
    setContraparteId("");
    Promise.all([
      listCuentas(negocioId),
      listClientes(negocioId),
      listProveedores(),
      listProyectos(negocioId),
    ])
      .then(([cs, cls, pvs, prs]) => {
        setCuentas(cs);
        setClientes(cls);
        setProveedores(pvs);
        setProyectos(prs);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error catálogo"))
      .finally(() => setLoadingCat(false));
  }, [negocioId]);

  const proyectoSel = proyectos.find((p) => p.id === proyectoId);
  const proveedoresDelProyecto = useMemo(() => {
    if (!proyectoSel) return proveedores;
    // Proveedores en partidas del proyecto (más relevantes primero) + resto
    const ids = new Set(proyectoSel.partidas.map((p) => p.proveedor_id));
    const enPartidas = proveedores.filter((p) => ids.has(p.id!));
    const otros = proveedores.filter((p) => !ids.has(p.id!));
    return [...enPartidas, ...otros];
  }, [proyectoSel, proveedores]);

  const proyectosActivos = proyectos.filter((p) => p.estado !== "cerrado");
  const contrapartes = tipo === "ingreso" ? clientes : proveedoresDelProyecto;
  const contraparteLabel = tipo === "ingreso" ? "Cliente" : "Proveedor";

  if (negocios.length === 0) {
    return (
      <div className="max-w-lg">
        <Link href="/movimientos" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-ink-muted">
          Crea un negocio primero.{" "}
          <Link href="/negocios/nuevo" className="underline">
            Crear negocio
          </Link>
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !negocio) return;
    setError("");

    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) {
      setError("Ingresa un monto válido");
      return;
    }

    const cuenta = cuentas.find((c) => c.id === cuentaId);
    if (!cuenta) {
      setError("Selecciona una cuenta");
      return;
    }

    const contraparteObj =
      tipo === "ingreso"
        ? clientes.find((c) => c.id === contraparteId)
        : proveedores.find((p) => p.id === contraparteId);
    if (!contraparteObj) {
      setError(`Selecciona un ${contraparteLabel.toLowerCase()}`);
      return;
    }

    setSubmitting(true);
    try {
      await createMovimiento(user.uid, {
        tipo,
        monto: montoNum,
        fecha: new Date(fecha),
        cuenta_id: cuenta.id!,
        cuenta_nombre: cuenta.nombre,
        proyecto_id: proyectoId || null,
        proyecto_nombre: proyectoSel?.nombre ?? null,
        contraparte_id: contraparteObj.id!,
        contraparte_tipo: tipo === "ingreso" ? "cliente" : "proveedor",
        contraparte_nombre: contraparteObj.nombre,
        negocio_id: negocio.id!,
        descripcion: descripcion.trim() || undefined,
      });
      router.push("/movimientos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear movimiento");
    } finally {
      setSubmitting(false);
    }
  };

  const isIngreso = tipo === "ingreso";
  const accentBg = isIngreso ? "bg-mint-50" : "bg-mauve-50";
  const accentTxt = isIngreso ? "text-mint-900" : "text-mauve-900";
  const accentLabel = isIngreso ? "text-mint-label" : "text-mauve-label";
  const symbol = isIngreso ? "+" : "−";

  return (
    <div className="max-w-lg">
      <Link
        href="/movimientos"
        className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition"
      >
        <IconArrowLeft size={13} />
        Volver
      </Link>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Hero: monto + tipo */}
        <div className={`${accentBg} rounded-3xl p-6`}>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-medium ${accentTxt}`}>{symbol}</span>
            <span className={`text-xs font-medium ${accentLabel} mb-1`}>
              {negocio?.moneda ?? "MXN"}
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0"
              className={`flex-1 bg-transparent border-none text-4xl font-medium tracking-tight ${accentTxt} placeholder-current placeholder-opacity-30 focus:outline-none min-w-0`}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                setTipo("ingreso");
                setContraparteId("");
              }}
              className={`px-3 py-2.5 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 transition ${
                isIngreso
                  ? "bg-white border-mint-900 text-mint-900"
                  : "bg-transparent border-transparent text-ink-muted hover:bg-white/50"
              }`}
            >
              <IconArrowDownLeft size={14} />
              Ingreso
            </button>
            <button
              type="button"
              onClick={() => {
                setTipo("egreso");
                setContraparteId("");
              }}
              className={`px-3 py-2.5 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 transition ${
                !isIngreso
                  ? "bg-white border-mauve-900 text-mauve-900"
                  : "bg-transparent border-transparent text-ink-muted hover:bg-white/50"
              }`}
            >
              <IconArrowUpRight size={14} />
              Egreso
            </button>
          </div>
        </div>

        {/* Campos */}
        <div className="space-y-3">
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
              Negocio <span className="text-mauve-900">*</span>
            </label>
            <select
              value={negocioId}
              onChange={(e) => setNegocioId(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            >
              {negocios.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </div>

          {loadingCat ? (
            <p className="text-xs text-ink-muted text-center py-3">Cargando catálogo…</p>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-ink-dim block mb-1.5">
                  Proyecto {isIngreso && <span className="text-mauve-900">*</span>}
                  {!isIngreso && <span className="text-ink-muted"> (opcional)</span>}
                </label>
                <select
                  required={isIngreso}
                  value={proyectoId}
                  onChange={(e) => setProyectoId(e.target.value)}
                  className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
                >
                  <option value="">
                    {isIngreso ? "— Selecciona —" : "— Sin proyecto —"}
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
                  Cuenta <span className="text-mauve-900">*</span>
                </label>
                <select
                  required
                  value={cuentaId}
                  onChange={(e) => setCuentaId(e.target.value)}
                  className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
                >
                  <option value="">— Selecciona —</option>
                  {cuentas.map((c) => (
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
                  {contraparteLabel} <span className="text-mauve-900">*</span>
                </label>
                <select
                  required
                  value={contraparteId}
                  onChange={(e) => setContraparteId(e.target.value)}
                  className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
                >
                  <option value="">— Selecciona —</option>
                  {contrapartes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                {contrapartes.length === 0 && (
                  <p className="text-xs text-ink-muted mt-1">
                    Sin {contraparteLabel.toLowerCase()}s.{" "}
                    <Link
                      href={isIngreso ? "/clientes/nuevo" : "/proveedores/nuevo"}
                      className="underline"
                    >
                      Crear {contraparteLabel.toLowerCase()}
                    </Link>
                  </p>
                )}
              </div>

              {/* Nota expandible */}
              {!showNota ? (
                <button
                  type="button"
                  onClick={() => setShowNota(true)}
                  className="text-xs text-ink-muted hover:text-ink-dim transition flex items-center gap-1"
                >
                  <IconChevronDown size={12} />
                  Agregar nota
                </button>
              ) : (
                <div>
                  <label className="text-xs font-medium text-ink-dim block mb-1.5">
                    Nota
                  </label>
                  <input
                    type="text"
                    maxLength={200}
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    placeholder="Ej: Factura 456, anticipo 2a parcialidad…"
                    className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
                    autoFocus
                  />
                </div>
              )}
            </>
          )}
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
            disabled={submitting || !monto || !cuentaId || !contraparteId || loadingCat}
            className="flex-1 bg-ink text-cream rounded-xl px-5 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
          >
            {submitting ? "Registrando…" : `Registrar ${isIngreso ? "ingreso" : "egreso"}`}
          </button>
        </div>
      </form>
    </div>
  );
}
