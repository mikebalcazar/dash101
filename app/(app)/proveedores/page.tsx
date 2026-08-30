"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listProveedores } from "@/lib/proveedores";
import type { Proveedor } from "@/types/schema";
import { IconTruck, IconPlus, IconBriefcase } from "@tabler/icons-react";

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
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
            Catálogo global · compartido entre todos los negocios ·{" "}
            {proveedores.length === 0
              ? "vacío"
              : `${proveedores.length} ${proveedores.length === 1 ? "proveedor" : "proveedores"}`}
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
            Un proveedor puede trabajar en proyectos de varios negocios. Solo se registra una vez.
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
        <div className="grid grid-cols-2 gap-3">
          {proveedores.map((p) => (
            <Link
              key={p.id}
              href={`/proveedores/${p.id}`}
              className="bg-white border border-black/5 rounded-2xl p-4 hover:border-black/20 hover:-translate-y-px transition"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-full bg-mauve-50 text-mauve-900 flex items-center justify-center flex-shrink-0">
                  <IconBriefcase size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-dim truncate">{p.nombre}</p>
                  <p className="text-[11px] text-ink-muted truncate">
                    {p.categoria || p.rfc || p.email || "—"}
                  </p>
                </div>
              </div>
              {p.notas && (
                <p className="text-xs text-ink-muted mt-2 line-clamp-2">{p.notas}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
