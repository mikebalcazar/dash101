"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listProveedores } from "@/lib/proveedores";
import { saldosProveedores, type SaldoProveedor } from "@/lib/proveedor-cuenta";
import { formatMonto } from "@/lib/format";
import type { Proveedor } from "@/types/schema";
import { IconTruck, IconPlus } from "@tabler/icons-react";

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  /* Lo que se le debe a cada uno (Mike, 21-nov-2026: «similar a la de
   * proyectos»). Si quien entra no ve costos, la API dice que no y la lista
   * se enseña sin saldos. */
  const [saldos, setSaldos] = useState<Map<string, SaldoProveedor> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    saldosProveedores().then(setSaldos).catch(() => setSaldos(null));
    listProveedores()
      .then(setProveedores)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-sm text-ink-muted">Cargando…</div>;

  return (
    <div>
      <div className="flex justify-between items-baseline mb-5">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">Proveedores</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Catálogo de la empresa ·{" "}
            {proveedores.length === 0
              ? "vacío"
              : `${proveedores.length} ${proveedores.length === 1 ? "proveedor" : "proveedores"}`}
            {saldos && ` · Por pagar ${formatMonto([...saldos.values()].reduce((t, x) => t + Math.max(0, x.saldo), 0), "MXN")}`}
          </p>
        </div>
        <Link
          href="/proveedores/nuevo"
          className="flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3.5 py-2 text-sm font-medium transition"
        >
          <IconPlus size={14} />
          Crear proveedor
        </Link>
      </div>

      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">{error}</div>
      )}

      {proveedores.length === 0 ? (
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-cream flex items-center justify-center mb-3">
            <IconTruck size={22} className="text-ink-muted" />
          </div>
          <p className="text-sm font-medium text-ink-dim mb-1">Sin proveedores</p>
          <p className="text-xs text-ink-muted mb-5 max-w-xs mx-auto">
            Un proveedor se registra una vez y sirve para todos los proyectos.
          </p>
          <Link
            href="/proveedores/nuevo"
            className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 transition"
          >
            <IconPlus size={14} />
            Crear primer proveedor
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...proveedores]
            .sort((a, b) => (saldos?.get(b.id!)?.saldo ?? 0) - (saldos?.get(a.id!)?.saldo ?? 0) || a.nombre.localeCompare(b.nombre))
            .map((p) => {
              const s = saldos?.get(p.id!);
              const pct = s && s.acordado > 0 ? Math.min(100, (s.pagado / s.acordado) * 100) : 0;
              return (
                <Link
                  key={p.id}
                  href={`/proveedores/${p.id}`}
                  data-proveedor={p.id}
                  className="bg-white border border-black/5 rounded-2xl p-4 hover:border-black/20 hover:-translate-y-px transition"
                >
                  {/* Como el recuadro del proyecto: el saldo por pagar, grande,
                      arriba a la derecha; abajo lo acordado y lo pagado. */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-dim truncate">{p.nombre}</p>
                      <p className="text-[11px] text-ink-muted truncate">
                        {p.tipo === "servicios" ? "Servicios" : "Materiales"}{(p.categoria || p.rfc) ? ` · ${p.categoria || p.rfc}` : ""}
                      </p>
                      {s && s.proyectos > 0 && (
                        <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-cream text-ink-muted">
                          {s.proyectos} {s.proyectos === 1 ? "proyecto" : "proyectos"}
                        </span>
                      )}
                    </div>
                    {s && (
                      <div className="text-right shrink-0" data-saldo-proveedor={p.id}>
                        <p className="text-[10px] text-ink-muted uppercase tracking-wide">Saldo por pagar</p>
                        <p className="text-xl sm:text-2xl font-medium text-mauve-900 tabular-nums leading-tight">
                          {formatMonto(Math.max(0, s.saldo), "MXN")}
                        </p>
                      </div>
                    )}
                  </div>
                  {s && s.acordado > 0 ? (
                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <p className="text-ink-muted">Por pagar acordado</p>
                        <p className="font-medium text-ink-dim">{formatMonto(s.acordado, "MXN", { short: true })}</p>
                      </div>
                      <div>
                        <p className="text-ink-muted">Pagado</p>
                        <p className="font-medium text-mauve-900">{formatMonto(s.pagado, "MXN", { short: true })}</p>
                        <div className="h-1 bg-cream rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-mauve-900" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-ink-muted">{s ? "Sin cuentas por pagar todavía" : (p.notas || "")}</p>
                  )}
                </Link>
              );
            })}
        </div>
      )}
    </div>
  );
}
