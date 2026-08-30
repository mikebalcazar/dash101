"use client";

import Link from "next/link";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { IconBuildingStore, IconPlus, IconCheck } from "@tabler/icons-react";

export default function NegociosPage() {
  const { negocios, activo, loading } = useNegocioActivo();

  if (loading) return <div className="text-sm text-ink-muted">Cargando…</div>;

  return (
    <div>
      <div className="flex justify-between items-baseline mb-5">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">Negocios</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {negocios.length === 0
              ? "Aún no tienes negocios"
              : `${negocios.length} ${negocios.length === 1 ? "negocio" : "negocios"}`}
          </p>
        </div>
        <Link
          href="/negocios/nuevo"
          className="flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3.5 py-2 text-sm font-medium transition"
        >
          <IconPlus size={14} />
          Crear negocio
        </Link>
      </div>

      {negocios.length === 0 ? (
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-cream flex items-center justify-center mb-3">
            <IconBuildingStore size={22} className="text-ink-muted" />
          </div>
          <p className="text-sm font-medium text-ink-dim mb-1">Tu primer negocio</p>
          <p className="text-xs text-ink-muted mb-5 max-w-xs mx-auto">
            Cada proyecto, cliente y movimiento se asocia a un negocio.
          </p>
          <Link
            href="/negocios/nuevo"
            className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 transition"
          >
            <IconPlus size={14} />
            Crear primer negocio
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {negocios.map((n) => {
            const isActive = activo?.id === n.id;
            return (
              <Link
                key={n.id}
                href={`/negocios/${n.id}`}
                className="bg-white border border-black/5 rounded-2xl p-4 hover:border-black/20 hover:-translate-y-px transition relative"
              >
                {isActive && (
                  <span className="absolute top-3 right-3 text-[10px] uppercase tracking-wide bg-mint-50 text-mint-900 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <IconCheck size={10} />
                    Activo
                  </span>
                )}
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-9 h-9 rounded-full bg-mint-50 text-mint-900 flex items-center justify-center flex-shrink-0">
                    <IconBuildingStore size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-dim truncate">{n.nombre}</p>
                    <p className="text-[11px] text-ink-muted">
                      {n.moneda}
                      {n.rfc ? ` · ${n.rfc}` : ""}
                    </p>
                  </div>
                </div>
                {n.descripcion && (
                  <p className="text-xs text-ink-muted mt-2 line-clamp-2">{n.descripcion}</p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
