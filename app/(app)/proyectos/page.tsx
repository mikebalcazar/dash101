"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useEmpresa } from "@/lib/empresa-context";
import { listProyectos } from "@/lib/proyectos";
import type { Proyecto } from "@/types/schema";
import { ESTADO_PROYECTO_LABELS } from "@/types/schema";
import { formatMonto } from "@/lib/format";
import { IconFolder, IconPlus } from "@tabler/icons-react";

const ESTADO_STYLE: Record<string, string> = {
  planeando: "bg-cream text-ink-muted",
  activo: "bg-mint-50 text-mint-900",
  pausado: "bg-sky-50 text-sky-900",
  finiquito: "bg-cream text-ink-muted",
  cerrado: "bg-mauve-50 text-mauve-900",
};

export default function ProyectosPage() {
  const { empresa, loading: loadingEmpresa } = useEmpresa();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loadingEmpresa) return;
    if (!empresa?.id) {
      setProyectos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    listProyectos()
      .then(setProyectos)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }, [empresa, loadingEmpresa]);

  if (loadingEmpresa || loading) return <div className="text-sm text-ink-muted">Cargando…</div>;

  if (!empresa) {
    return (
      <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
        <p className="text-sm font-medium text-ink-dim mb-1">Cargando la empresa…</p>
      </div>
    );
  }

  /* Mike, 19-nov-2026: «oculta de la pantalla de proyectos en dash todos los
   * proyectos que aún no tienen conceptos de cobro». Siguen en la base: se
   * llega a ellos desde «Crear proyecto → Ya existe». */
  const todos = proyectos;
  const ocultos = todos.filter((p) => p.precio_por_cargar).length;
  const visibles = todos.filter((p) => !p.precio_por_cargar);
  const totalDisp = visibles.reduce((s, p) => s + (p.disponible ?? 0), 0);
  const totalVenta = visibles.reduce((s, p) => s + (p.precio_venta ?? 0), 0);

  return (
    <div>
      <div className="flex justify-between items-baseline mb-5">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">Proyectos</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {empresa.nombre} ·{" "}
            {visibles.length === 0
              ? "Sin proyectos con conceptos de cobro"
              : `${visibles.length} · Vendido ${formatMonto(totalVenta, empresa.moneda)} · Disponible ${formatMonto(totalDisp, empresa.moneda)}`}
          </p>
          {ocultos > 0 && (
            <p className="text-[11px] text-ink-muted mt-0.5" data-proyectos-ocultos={ocultos}>
              {ocultos} {ocultos === 1 ? "proyecto sin conceptos de cobro no se muestra" : "proyectos sin conceptos de cobro no se muestran"}: búscalos en «Crear proyecto → Ya existe».
            </p>
          )}
        </div>
        <Link
          href="/proyectos/nuevo"
          className="flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3.5 py-2 text-sm font-medium transition"
        >
          <IconPlus size={14} />
          Crear proyecto
        </Link>
      </div>

      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">{error}</div>
      )}

      {visibles.length === 0 ? (
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-cream flex items-center justify-center mb-3">
            <IconFolder size={22} className="text-ink-muted" />
          </div>
          <p className="text-sm font-medium text-ink-dim mb-1">Sin proyectos</p>
          <p className="text-xs text-ink-muted mb-5 max-w-xs mx-auto">
            Un proyecto tiene un cliente, un precio de venta y partidas de proveedores.
          </p>
          <Link
            href="/proyectos/nuevo"
            className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 transition"
          >
            <IconPlus size={14} />
            Crear primer proyecto
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {visibles.map((p) => {
            // 0.107.0 · sin IVA, contra el precio que también va sin IVA.
            const cobradoSinIva = p.cobrado_sin_iva ?? p.cobrado;
            const pctCobrado = p.precio_venta > 0 ? (cobradoSinIva / p.precio_venta) * 100 : 0;
            const pctPagado =
              p.compromiso_total > 0 ? (p.pagado / p.compromiso_total) * 100 : 0;
            return (
              <Link
                key={p.id}
                href={`/proyectos/${p.id}`}
                className="bg-white border border-black/5 rounded-2xl p-4 hover:border-black/20 hover:-translate-y-px transition"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-dim truncate">{p.nombre}</p>
                    <p className="text-[11px] text-ink-muted truncate">{p.cliente_nombre}</p>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${ESTADO_STYLE[p.estado] ?? "bg-cream text-ink-muted"}`}
                  >
                    {ESTADO_PROYECTO_LABELS[p.estado]}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] mb-3">
                  <div>
                    <p className="text-ink-muted">Cobrado</p>
                    <p className="font-medium text-mint-900">
                      {formatMonto(cobradoSinIva, "MXN", { short: true })}
                    </p>
                    <div className="h-1 bg-cream rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-mint-900"
                        style={{ width: `${Math.min(pctCobrado, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-ink-muted">Pagado</p>
                    <p className="font-medium text-mauve-900">
                      {formatMonto(p.pagado, "MXN", { short: true })}
                    </p>
                    <div className="h-1 bg-cream rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full bg-mauve-900"
                        style={{ width: `${Math.min(pctPagado, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-black/5">
                  <div className="flex justify-between items-end gap-2">
                    <div>
                      <p className="text-[10px] text-ink-muted uppercase tracking-wide">
                        Disponible
                      </p>
                      <p className="text-base font-medium text-ink-dim">
                        {formatMonto(p.disponible ?? 0, "MXN")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-ink-muted uppercase tracking-wide">Precio</p>
                      {p.precio_por_cargar
                        ? <p data-precio-por-cargar className="text-[11px] font-medium text-mauve-900">Por cargar</p>
                        : <p className="text-[11px] font-medium text-ink-dim">{formatMonto(p.precio_venta, "MXN", { short: true })}</p>}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
