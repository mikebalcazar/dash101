"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { listClientes } from "@/lib/clientes";
import type { Cliente } from "@/types/schema";
import { IconUsers, IconPlus, IconUser } from "@tabler/icons-react";

export default function ClientesPage() {
  const { activo, loading: loadingNegocio } = useNegocioActivo();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loadingNegocio) return;
    if (!activo?.id) {
      setClientes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    listClientes(activo.id)
      .then(setClientes)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar clientes"))
      .finally(() => setLoading(false));
  }, [activo, loadingNegocio]);

  if (loadingNegocio || loading) return <div className="text-sm text-ink-muted">Cargando…</div>;

  if (!activo) {
    return (
      <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
        <p className="text-sm font-medium text-ink-dim mb-1">Sin negocio activo</p>
        <p className="text-xs text-ink-muted mb-4">Crea un negocio primero.</p>
        <Link
          href="/negocios/nuevo"
          className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 transition"
        >
          <IconPlus size={14} />
          Crear negocio
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-baseline mb-5">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">Clientes</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {activo.nombre} ·{" "}
            {clientes.length === 0
              ? "Sin clientes"
              : `${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}`}
          </p>
        </div>
        <Link
          href="/clientes/nuevo"
          className="flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3.5 py-2 text-sm font-medium transition"
        >
          <IconPlus size={14} />
          Crear cliente
        </Link>
      </div>

      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">{error}</div>
      )}

      {clientes.length === 0 ? (
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-cream flex items-center justify-center mb-3">
            <IconUsers size={22} className="text-ink-muted" />
          </div>
          <p className="text-sm font-medium text-ink-dim mb-1">Sin clientes</p>
          <p className="text-xs text-ink-muted mb-5 max-w-xs mx-auto">
            Registra a quién le facturas. Cada proyecto se asocia a un cliente.
          </p>
          <Link
            href="/clientes/nuevo"
            className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 transition"
          >
            <IconPlus size={14} />
            Crear primer cliente
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {clientes.map((c) => (
            <Link
              key={c.id}
              href={`/clientes/${c.id}`}
              className="bg-white border border-black/5 rounded-2xl p-4 hover:border-black/20 hover:-translate-y-px transition"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-full bg-mint-50 text-mint-900 flex items-center justify-center flex-shrink-0">
                  <IconUser size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-dim truncate">{c.nombre}</p>
                  <p className="text-[11px] text-ink-muted truncate">
                    {c.rfc || c.email || c.telefono || "—"}
                  </p>
                </div>
              </div>
              {c.notas && (
                <p className="text-xs text-ink-muted mt-2 line-clamp-2">{c.notas}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
