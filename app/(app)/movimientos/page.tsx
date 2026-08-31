"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import {
  listMovimientos,
  deleteMovimiento,
  recalcularCuenta,
} from "@/lib/movimientos";
import type { Movimiento, TipoMovimiento } from "@/types/schema";
import { formatMonto, formatDateShort } from "@/lib/format";
import { Timestamp } from "firebase/firestore";
import {
  IconArrowsExchange,
  IconPlus,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconTrash,
  IconLink,
} from "@tabler/icons-react";

const TIPO_META = {
  ingreso: {
    icon: IconArrowDownLeft,
    color: "bg-mint-50 text-mint-900",
    montoColor: "text-mint-900",
    prefix: "+",
  },
  egreso: {
    icon: IconArrowUpRight,
    color: "bg-mauve-50 text-mauve-900",
    montoColor: "text-mauve-900",
    prefix: "−",
  },
} as const;

export default function MovimientosPage() {
  const { activo, loading: loadingNegocio } = useNegocioActivo();
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoMovimiento | "todos">("todos");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cleanupNotice, setCleanupNotice] = useState("");

  const load = () => {
    if (!activo?.id) {
      setMovimientos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    listMovimientos(activo.id, { max: 200 })
      .then(async (all) => {
        // Auto-cleanup: borrar movs viejos con tipo="transferencia"
        const legacy = all.filter((m) => (m.tipo as string) === "transferencia");
        if (legacy.length > 0) {
          try {
            const cuentasAfectadas = new Set<string>();
            legacy.forEach((m) => {
              cuentasAfectadas.add(m.cuenta_id);
              if (m.cuenta_destino_id) cuentasAfectadas.add(m.cuenta_destino_id);
            });
            await Promise.all(
              legacy.map((m) => deleteDoc(doc(db, "movimientos", m.id!)))
            );
            await Promise.all(Array.from(cuentasAfectadas).map(recalcularCuenta));
            setCleanupNotice(
              `Se limpiaron ${legacy.length} transferencia${legacy.length === 1 ? "" : "s"} del formato anterior. Saldos actualizados.`
            );
            setTimeout(() => setCleanupNotice(""), 5000);
            // Recargar sin las viejas
            const fresh = await listMovimientos(activo!.id!, { max: 200 });
            setMovimientos(fresh.filter((m) => m.tipo === "ingreso" || m.tipo === "egreso"));
          } catch (e) {
            console.warn("Cleanup legacy transfers falló:", e);
            setMovimientos(all.filter((m) => m.tipo === "ingreso" || m.tipo === "egreso"));
          }
        } else {
          setMovimientos(all.filter((m) => m.tipo === "ingreso" || m.tipo === "egreso"));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (loadingNegocio) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, loadingNegocio]);

  const handleDelete = async (m: Movimiento) => {
    const msg = m.transfer_id
      ? "¿Eliminar esta transferencia? Se borrarán los 2 movimientos ligados y los saldos se recalcularán."
      : "¿Eliminar este movimiento? Los saldos se recalcularán.";
    if (!confirm(msg)) return;
    setDeletingId(m.id!);
    try {
      await deleteMovimiento(m.id!);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  };

  if (loadingNegocio || loading) return <div className="text-sm text-ink-muted">Cargando…</div>;

  if (!activo) {
    return (
      <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
        <p className="text-sm font-medium text-ink-dim mb-1">Sin negocio activo</p>
        <Link
          href="/negocios/nuevo"
          className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 transition mt-3"
        >
          <IconPlus size={14} />
          Crear negocio
        </Link>
      </div>
    );
  }

  const filtrados =
    filtroTipo === "todos" ? movimientos : movimientos.filter((m) => m.tipo === filtroTipo);

  // Totales del mes actual
  const now = new Date();
  const mesActual = now.getMonth();
  const anoActual = now.getFullYear();
  const totalesMes = movimientos.reduce(
    (acc, m) => {
      const f = m.fecha as Timestamp | undefined;
      if (!f || typeof f.toDate !== "function") return acc;
      const d = f.toDate();
      if (d.getMonth() !== mesActual || d.getFullYear() !== anoActual) return acc;
      if (m.tipo === "ingreso") acc.ingresos += m.monto;
      else if (m.tipo === "egreso") acc.egresos += m.monto;
      return acc;
    },
    { ingresos: 0, egresos: 0 }
  );

  return (
    <div>
      <div className="flex justify-between items-baseline mb-4">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">Movimientos</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {activo.nombre} · Mes:{" "}
            <span className="text-mint-900">
              +{formatMonto(totalesMes.ingresos, activo.moneda, { short: true })}
            </span>{" "}
            /{" "}
            <span className="text-mauve-900">
              −{formatMonto(totalesMes.egresos, activo.moneda, { short: true })}
            </span>
          </p>
        </div>
        <Link
          href="/movimientos/nuevo"
          className="flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3.5 py-2 text-sm font-medium transition"
        >
          <IconPlus size={14} />
          Registrar
        </Link>
      </div>

      {cleanupNotice && (
        <div className="bg-mint-50 text-mint-900 text-xs px-3 py-2 rounded-xl mb-4">
          {cleanupNotice}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-4">
        {(["todos", "ingreso", "egreso"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFiltroTipo(t)}
            className={`text-xs px-3 py-1.5 rounded-lg transition ${
              filtroTipo === t
                ? "bg-ink text-cream"
                : "bg-white border border-black/10 text-ink-muted hover:border-black/20"
            }`}
          >
            {t === "todos" ? "Todos" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">
          {error}
        </div>
      )}

      {filtrados.length === 0 ? (
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-cream flex items-center justify-center mb-3">
            <IconArrowsExchange size={22} className="text-ink-muted" />
          </div>
          <p className="text-sm font-medium text-ink-dim mb-1">
            {movimientos.length === 0 ? "Sin movimientos" : "Nada con este filtro"}
          </p>
          {movimientos.length === 0 && (
            <>
              <p className="text-xs text-ink-muted mb-5 max-w-xs mx-auto">
                Registra ingresos y egresos de tus proyectos.
              </p>
              <Link
                href="/movimientos/nuevo"
                className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 transition"
              >
                <IconPlus size={14} />
                Registrar primer movimiento
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
          {filtrados.map((m) => {
            const meta = TIPO_META[m.tipo as "ingreso" | "egreso"];
            const Icon = meta.icon;
            const fecha = m.fecha as Timestamp | undefined;
            const dateStr =
              fecha && typeof fecha.toDate === "function"
                ? formatDateShort(fecha.toDate())
                : "—";
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-black/5 last:border-b-0 hover:bg-cream/30 transition"
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${meta.color}`}
                >
                  <Icon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-dim truncate">
                    {m.descripcion || m.contraparte_nombre}
                    {m.descripcion && (
                      <span className="text-ink-muted font-normal">
                        {" · "}
                        {m.contraparte_nombre}
                      </span>
                    )}
                    {m.transfer_id && (
                      <IconLink
                        size={11}
                        className="inline-block ml-1 text-sky-900"
                      />
                    )}
                  </p>
                  <p className="text-[11px] text-ink-muted truncate">
                    {dateStr} · {m.cuenta_nombre}
                    {m.proyecto_nombre && ` · ${m.proyecto_nombre}`}
                  </p>
                </div>
                <p className={`text-sm font-medium whitespace-nowrap ${meta.montoColor}`}>
                  {meta.prefix}
                  {formatMonto(m.monto, activo.moneda)}
                </p>
                <button
                  onClick={() => handleDelete(m)}
                  disabled={deletingId === m.id}
                  className="text-ink-muted hover:text-mauve-900 p-1 disabled:opacity-50"
                  title="Eliminar"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
