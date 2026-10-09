"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getOrdenDeMovimiento } from "@/lib/ordenes";
import { MarcaFiscal } from "@/components/marca-fiscal";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useEmpresa } from "@/lib/empresa-context";
import {
  listMovimientos,
  deleteMovimiento,
  recalcularCuenta,
} from "@/lib/movimientos";
import type { Movimiento, TipoMovimiento } from "@/types/schema";
import { CATEGORIA_AJUSTE, CATEGORIA_GASTO_GENERAL, CATEGORIA_PRESTAMO_CAPITAL, CATEGORIA_PRESTAMO_RECIBIDO } from "@/types/schema";
import { formatMonto, formatDateShort } from "@/lib/format";
import { Timestamp } from "firebase/firestore";
import {
  IconArrowsExchange,
  IconPlus,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconTrash,
  IconPencil,
  IconLink,
  IconExternalLink,
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
  const { empresa, loading: loadingEmpresa } = useEmpresa();
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoMovimiento | "todos" | "generales">("todos");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cleanupNotice, setCleanupNotice] = useState("");

  const load = () => {
    if (!empresa?.id) {
      setMovimientos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    listMovimientos({ max: 200 })
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
            const fresh = await listMovimientos({ max: 200 });
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
    if (loadingEmpresa) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa, loadingEmpresa]);

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

  if (loadingEmpresa || loading) return <div className="text-sm text-ink-muted">Cargando…</div>;

  if (!empresa) {
    return (
      <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
        <p className="text-sm font-medium text-ink-dim mb-1">Cargando la empresa…</p>
      </div>
    );
  }

  const esGastoGeneral = (m: Movimiento) => m.categoria === CATEGORIA_GASTO_GENERAL;
  const filtrados =
    filtroTipo === "todos" ? movimientos
    : filtroTipo === "generales" ? movimientos.filter(esGastoGeneral)
    : movimientos.filter((m) => m.tipo === filtroTipo);

  // El ajuste por conciliación es dinero que se movió sin que nadie lo
  // registrara: va aparte de los ingresos y gastos de verdad, no mezclado.
  const esAjuste = (m: Movimiento) => m.categoria === CATEGORIA_AJUSTE;
  /* 0.56.1 · Un egreso que dejó una orden pagada lleva a la orden, con su
   * historia y sus papeles (Mike, 30-sep-2026: «se pasen al movimiento con
   * toda la info que traían»). La orden se busca por el movimiento en la
   * API; si no viene de una orden, no pasa nada. */
  const router = useRouter();
  const deOrden = (m: Movimiento) => m.categoria === "orden_de_compra" || m.categoria === "reembolso";
  const irALaOrden = async (mid: string) => {
    try {
      const r = await getOrdenDeMovimiento(mid);
      router.push(`/ordenes/${r.orden.id}`);
    } catch {
      /* no viene de una orden, o ya no está */
    }
  };

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
      if (esAjuste(m)) {
        acc.sin_identificar += m.tipo === "egreso" ? m.monto : -m.monto;
        return acc;
      }
      // Un préstamo que entra no es ingreso, y el capital que se devuelve no
      // es gasto: van aparte. El interés sí es gasto y se queda en egresos.
      if (m.categoria === CATEGORIA_PRESTAMO_RECIBIDO) { acc.prestamo_recibido += m.monto; return acc; }
      if (m.categoria === CATEGORIA_PRESTAMO_CAPITAL) { acc.prestamo_capital += m.monto; return acc; }
      if (m.tipo === "ingreso") acc.ingresos += m.monto;
      else if (m.tipo === "egreso") acc.egresos += m.monto;
      return acc;
    },
    { ingresos: 0, egresos: 0, sin_identificar: 0, prestamo_recibido: 0, prestamo_capital: 0 }
  );

  return (
    <div>
      <div className="flex justify-between items-baseline mb-4">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">Movimientos</h2>
          <p className="text-xs text-ink-muted mt-0.5">{empresa.nombre} · este mes</p>
          <p className="mt-1 flex items-baseline gap-4 flex-wrap" data-totales-mes>
            <span className="text-xs text-ink-muted">
              Ingresos{" "}
              <span className="text-base font-semibold tabular-nums text-mint-900">
                +{formatMonto(totalesMes.ingresos, empresa.moneda, { short: true })}
              </span>
            </span>
            <span className="text-xs text-ink-muted">
              Egresos{" "}
              <span className="text-base font-semibold tabular-nums text-mauve-900">
                −{formatMonto(totalesMes.egresos, empresa.moneda, { short: true })}
              </span>
            </span>
          </p>
          {(totalesMes.prestamo_recibido !== 0 || totalesMes.prestamo_capital !== 0) && (
            <p className="text-xs text-ink-muted mt-1" data-prestamos-mes>
              Préstamos (no son ingreso ni gasto): recibido{" "}
              <span className="font-semibold tabular-nums text-mint-900">+{formatMonto(totalesMes.prestamo_recibido, empresa.moneda, { short: true })}</span>
              {" · "}capital devuelto{" "}
              <span className="font-semibold tabular-nums text-mauve-900">−{formatMonto(totalesMes.prestamo_capital, empresa.moneda, { short: true })}</span>
            </p>
          )}
          {totalesMes.sin_identificar !== 0 && (
            <p className="text-xs text-ink-muted mt-0.5">
              Sin identificar (conciliación):{" "}
              <span className="font-semibold tabular-nums text-mauve-900">
                {formatMonto(totalesMes.sin_identificar, empresa.moneda, { short: true })}
              </span>
            </p>
          )}
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
        {(["todos", "ingreso", "egreso", "generales"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFiltroTipo(t)}
            className={`text-xs px-3 py-1.5 rounded-lg transition ${
              filtroTipo === t
                ? "bg-ink text-cream"
                : "bg-white border border-black/10 text-ink-muted hover:border-black/20"
            }`}
          >
            {t === "todos" ? "Todos" : t === "generales" ? "Gastos generales" : t.charAt(0).toUpperCase() + t.slice(1)}
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
                    {esAjuste(m) && (
                      <span className="text-[10px] uppercase tracking-wide bg-cream text-ink-muted rounded px-1.5 py-0.5 mr-1.5">
                        sin identificar
                      </span>
                    )}
                    {esGastoGeneral(m) && (
                      <span className="text-[10px] uppercase tracking-wide bg-cream text-ink-muted rounded px-1.5 py-0.5 mr-1.5" data-gasto-general>
                        gasto general
                      </span>
                    )}
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
                    <MarcaFiscal mov={m} />
                  </p>
                  <p className="text-[11px] text-ink-muted truncate">
                    {dateStr} · {m.cuenta_nombre}
                    {m.proyecto_nombre && ` · ${m.proyecto_nombre}`}
                  </p>
                </div>
                <p className={`monto-fila ${meta.montoColor}`} data-monto>
                  {meta.prefix}
                  {formatMonto(m.monto, empresa.moneda)}
                </p>
                <div className="acciones-fila" data-acciones>
                {/* El egreso que dejó una orden pagada lleva a la orden. Va aquí,
                    entre las acciones, y no dentro del renglón del concepto: ese
                    renglón se recorta con `truncate` y en el teléfono el botón
                    quedaba tapado (corrida 36776132464). */}
                {deOrden(m) && m.id && (
                  <button
                    type="button"
                    data-orden-de={m.id}
                    onClick={() => void irALaOrden(m.id as string)}
                    title="Ver la orden, con su historia y sus papeles"
                    className="text-sky-900 hover:text-ink-dim p-1"
                  >
                    <IconExternalLink size={14} />
                  </button>
                )}
                {!(deOrden(m) && m.id) && <span className="hueco" aria-hidden />}
                {/* Corregir, antes que borrar: es lo que casi siempre se quiere.
                    Una transferencia no se corrige —son dos movimientos
                    espejo—, así que ahí sólo queda el bote. */}
                {!m.transfer_id && (
                  <Link
                    href={`/movimientos/${m.id}/editar`}
                    className="text-ink-muted hover:text-ink-dim p-1"
                    title="Corregir"
                  >
                    <IconPencil size={14} />
                  </Link>
                )}
                {m.transfer_id && <span className="hueco" aria-hidden />}
                <button
                  onClick={() => handleDelete(m)}
                  disabled={deletingId === m.id}
                  className="text-ink-muted hover:text-mauve-900 p-1 disabled:opacity-50"
                  title="Eliminar"
                >
                  <IconTrash size={14} />
                </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
