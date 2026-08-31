"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { listCuentas } from "@/lib/cuentas";
import { listClientes, createCliente } from "@/lib/clientes";
import { listProveedores, createProveedor } from "@/lib/proveedores";
import { listProyectos, createProyecto } from "@/lib/proyectos";
import { createMovimiento } from "@/lib/movimientos";
import { getUserDoc } from "@/lib/users";
import type {
  Cuenta,
  Cliente,
  Proveedor,
  Proyecto,
  Negocio,
  TipoMovimiento,
} from "@/types/schema";
import { formatMonto } from "@/lib/format";
import {
  IconArrowLeft,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconChevronDown,
  IconPlus,
  IconX,
} from "@tabler/icons-react";

type QuickCreate = null | "proyecto" | "cliente" | "proveedor";

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
  const [quickCreate, setQuickCreate] = useState<QuickCreate>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [diagInfo, setDiagInfo] = useState<string>("");

  const negocio = useMemo<Negocio | null>(
    () => negocios.find((n) => n.id === negocioId) ?? null,
    [negocios, negocioId]
  );

  useEffect(() => {
    if (!negocioId && activo?.id) setNegocioId(activo.id);
  }, [activo, negocioId]);

  const loadCatalogos = async (nid: string) => {
    setLoadingCat(true);
    try {
      const [cs, cls, pvs, prs] = await Promise.all([
        listCuentas(nid),
        listClientes(nid),
        listProveedores(),
        listProyectos(nid),
      ]);
      setCuentas(cs);
      setClientes(cls);
      setProveedores(pvs);
      setProyectos(prs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error catálogo");
    } finally {
      setLoadingCat(false);
    }
  };

  useEffect(() => {
    if (!negocioId) return;
    setCuentaId("");
    setProyectoId("");
    setContraparteId("");
    setQuickCreate(null);
    loadCatalogos(negocioId);
  }, [negocioId]);

  const proyectoSel = proyectos.find((p) => p.id === proyectoId);
  const proveedoresDelProyecto = useMemo(() => {
    if (!proyectoSel) return proveedores;
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
      const msg = err instanceof Error ? err.message : "Error al crear movimiento";
      setError(msg);
      // Si es error de permisos, cargar diagnóstico
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("insufficient")) {
        try {
          const uDoc = await getUserDoc(user.uid);
          const membership = uDoc?.memberships?.[negocio.id!];
          const info = {
            uid: user.uid,
            email: user.email,
            negocio_id: negocio.id,
            negocio_nombre: negocio.nombre,
            tengo_memberships: !!uDoc?.memberships,
            memberships_keys: Object.keys(uDoc?.memberships ?? {}),
            membership_this_negocio: membership ?? null,
            negocios_acceso: uDoc?.negocios_acceso ?? [],
          };
          setDiagInfo(JSON.stringify(info, null, 2));
        } catch (diagErr) {
          setDiagInfo("No se pudo cargar diagnóstico: " + String(diagErr));
        }
      }
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
                setQuickCreate(null);
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
                setQuickCreate(null);
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
              {/* Proyecto */}
              <SelectConCrear
                label={`Proyecto ${isIngreso ? "*" : "(opcional)"}`}
                required={isIngreso}
                value={proyectoId}
                onChange={setProyectoId}
                emptyLabel={isIngreso ? "— Selecciona —" : "— Sin proyecto —"}
                options={proyectosActivos.map((p) => ({
                  id: p.id!,
                  label: `${p.nombre} · ${p.cliente_nombre}`,
                }))}
                createLabel="Crear nuevo proyecto"
                onOpenCreate={() =>
                  setQuickCreate(quickCreate === "proyecto" ? null : "proyecto")
                }
                isOpenCreate={quickCreate === "proyecto"}
              />
              {quickCreate === "proyecto" && (
                <QuickCreateProyecto
                  clientes={clientes}
                  moneda={negocio?.moneda ?? "MXN"}
                  onCancel={() => setQuickCreate(null)}
                  onCreated={async (newId) => {
                    await loadCatalogos(negocioId);
                    setProyectoId(newId);
                    setQuickCreate(null);
                  }}
                  onNeedCliente={() => setQuickCreate("cliente")}
                  uid={user!.uid}
                  negocio={negocio!}
                />
              )}

              {/* Cuenta */}
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

              {/* Contraparte */}
              <SelectConCrear
                label={`${contraparteLabel} *`}
                required
                value={contraparteId}
                onChange={setContraparteId}
                emptyLabel="— Selecciona —"
                options={contrapartes.map((c) => ({ id: c.id!, label: c.nombre }))}
                createLabel={`Crear nuevo ${contraparteLabel.toLowerCase()}`}
                onOpenCreate={() =>
                  setQuickCreate(
                    quickCreate === (isIngreso ? "cliente" : "proveedor")
                      ? null
                      : isIngreso
                      ? "cliente"
                      : "proveedor"
                  )
                }
                isOpenCreate={
                  quickCreate === (isIngreso ? "cliente" : "proveedor")
                }
              />
              {quickCreate === "cliente" && (
                <QuickCreateCliente
                  onCancel={() => setQuickCreate(null)}
                  onCreated={async (newId) => {
                    await loadCatalogos(negocioId);
                    if (tipo === "ingreso") setContraparteId(newId);
                    setQuickCreate(null);
                  }}
                  uid={user!.uid}
                  negocioId={negocioId}
                />
              )}
              {quickCreate === "proveedor" && (
                <QuickCreateProveedor
                  onCancel={() => setQuickCreate(null)}
                  onCreated={async (newId) => {
                    await loadCatalogos(negocioId);
                    if (tipo === "egreso") setContraparteId(newId);
                    setQuickCreate(null);
                  }}
                  uid={user!.uid}
                />
              )}

              {/* Nota */}
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
                  <label className="text-xs font-medium text-ink-dim block mb-1.5">Nota</label>
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
        {diagInfo && (
          <details className="bg-cream border border-black/10 rounded-xl overflow-hidden" open>
            <summary className="text-xs font-medium text-ink-dim px-3 py-2 cursor-pointer">
              🔍 Diagnóstico (compárteme esto)
            </summary>
            <pre className="text-[10px] text-ink-dim px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">
              {diagInfo}
            </pre>
          </details>
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

// ─── Componentes helper ───

function SelectConCrear({
  label,
  required,
  value,
  onChange,
  options,
  emptyLabel,
  createLabel,
  onOpenCreate,
  isOpenCreate,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  emptyLabel: string;
  createLabel: string;
  onOpenCreate: () => void;
  isOpenCreate: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-ink-dim block mb-1.5">{label}</label>
      <div className="flex gap-2">
        <select
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition min-w-0"
        >
          <option value="">{emptyLabel}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onOpenCreate}
          title={createLabel}
          className={`flex-shrink-0 rounded-xl px-3 py-2 text-sm border transition flex items-center gap-1 ${
            isOpenCreate
              ? "bg-ink text-cream border-ink"
              : "bg-white text-ink-dim border-black/10 hover:border-black/20"
          }`}
        >
          {isOpenCreate ? <IconX size={14} /> : <IconPlus size={14} />}
        </button>
      </div>
    </div>
  );
}

function QuickCreateProyecto({
  clientes,
  moneda,
  onCancel,
  onCreated,
  onNeedCliente,
  uid,
  negocio,
}: {
  clientes: Cliente[];
  moneda: string;
  onCancel: () => void;
  onCreated: (id: string) => void | Promise<void>;
  onNeedCliente: () => void;
  uid: string;
  negocio: Negocio;
}) {
  const [nombre, setNombre] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [precio, setPrecio] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    setErr("");
    if (!nombre.trim()) return setErr("Nombre requerido");
    const cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente) return setErr("Selecciona un cliente");
    setSaving(true);
    try {
      const id = await createProyecto(uid, {
        nombre: nombre.trim(),
        cliente_id: cliente.id!,
        cliente_nombre: cliente.nombre,
        negocio_id: negocio.id!,
        negocio_nombre: negocio.nombre,
        precio_venta: parseFloat(precio) || 0,
        partidas: [],
        estado: "activo",
        fecha_inicio: new Date(),
      });
      await onCreated(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  };

  return (
    <div className="bg-cream/60 rounded-xl p-3 space-y-2 border border-black/5">
      <p className="text-xs font-medium text-ink-dim">Crear proyecto rápido</p>
      <input
        type="text"
        placeholder="Nombre del proyecto"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
        autoFocus
      />
      {clientes.length === 0 ? (
        <div className="bg-sky-50 text-sky-900 text-xs px-2.5 py-2 rounded-lg">
          Necesitas crear un cliente primero.{" "}
          <button
            type="button"
            onClick={onNeedCliente}
            className="underline font-medium"
          >
            Crear cliente
          </button>
        </div>
      ) : (
        <select
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
          className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
        >
          <option value="">— Cliente —</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      )}
      <input
        type="number"
        step="0.01"
        min="0"
        placeholder={`Precio de venta (${moneda}) — opcional`}
        value={precio}
        onChange={(e) => setPrecio(e.target.value)}
        className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
      />
      {err && <p className="text-xs text-mauve-900">{err}</p>}
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-xs text-ink-muted px-2 py-1 hover:underline"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !nombre.trim() || clientes.length === 0}
          className="bg-ink text-cream rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-ink/90 disabled:opacity-50 transition"
        >
          {saving ? "Creando…" : "Crear proyecto"}
        </button>
      </div>
    </div>
  );
}

function QuickCreateCliente({
  onCancel,
  onCreated,
  uid,
  negocioId,
}: {
  onCancel: () => void;
  onCreated: (id: string) => void | Promise<void>;
  uid: string;
  negocioId: string;
}) {
  const [nombre, setNombre] = useState("");
  const [rfc, setRfc] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    setErr("");
    if (!nombre.trim()) return setErr("Nombre requerido");
    setSaving(true);
    try {
      const id = await createCliente(uid, {
        nombre: nombre.trim(),
        rfc: rfc.trim() || undefined,
        negocio_id: negocioId,
      });
      await onCreated(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  };

  return (
    <div className="bg-cream/60 rounded-xl p-3 space-y-2 border border-black/5">
      <p className="text-xs font-medium text-ink-dim">Crear cliente rápido</p>
      <input
        type="text"
        placeholder="Nombre o razón social"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
        autoFocus
      />
      <input
        type="text"
        placeholder="RFC (opcional)"
        value={rfc}
        onChange={(e) => setRfc(e.target.value.toUpperCase())}
        maxLength={13}
        className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none uppercase"
      />
      {err && <p className="text-xs text-mauve-900">{err}</p>}
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-xs text-ink-muted px-2 py-1 hover:underline"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !nombre.trim()}
          className="bg-ink text-cream rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-ink/90 disabled:opacity-50 transition"
        >
          {saving ? "Creando…" : "Crear cliente"}
        </button>
      </div>
    </div>
  );
}

function QuickCreateProveedor({
  onCancel,
  onCreated,
  uid,
}: {
  onCancel: () => void;
  onCreated: (id: string) => void | Promise<void>;
  uid: string;
}) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    setErr("");
    if (!nombre.trim()) return setErr("Nombre requerido");
    setSaving(true);
    try {
      const id = await createProveedor(uid, {
        nombre: nombre.trim(),
        categoria: categoria.trim() || undefined,
      });
      await onCreated(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
      setSaving(false);
    }
  };

  return (
    <div className="bg-cream/60 rounded-xl p-3 space-y-2 border border-black/5">
      <p className="text-xs font-medium text-ink-dim">Crear proveedor rápido</p>
      <input
        type="text"
        placeholder="Nombre del proveedor"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
        autoFocus
      />
      <input
        type="text"
        placeholder="Categoría (opcional)"
        value={categoria}
        onChange={(e) => setCategoria(e.target.value)}
        className="w-full bg-white border border-black/10 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none"
      />
      {err && <p className="text-xs text-mauve-900">{err}</p>}
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-xs text-ink-muted px-2 py-1 hover:underline"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !nombre.trim()}
          className="bg-ink text-cream rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-ink/90 disabled:opacity-50 transition"
        >
          {saving ? "Creando…" : "Crear proveedor"}
        </button>
      </div>
    </div>
  );
}
