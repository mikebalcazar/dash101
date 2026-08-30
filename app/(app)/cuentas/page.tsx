"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { listCuentas } from "@/lib/cuentas";
import type { Cuenta } from "@/types/schema";
import { TIPO_CUENTA_LABELS } from "@/types/schema";
import { IconWallet, IconPlus, IconBuildingBank, IconCoin, IconCreditCard, IconCircleDashed } from "@tabler/icons-react";

function iconoPorTipo(tipo: string) {
  switch (tipo) {
    case "banco":
      return IconBuildingBank;
    case "caja":
      return IconCoin;
    case "credito":
      return IconCreditCard;
    default:
      return IconCircleDashed;
  }
}

function formatMonto(n: number, moneda: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: moneda === "USD" ? "USD" : "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function CuentasPage() {
  const { activo, loading: loadingNegocio } = useNegocioActivo();
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loadingNegocio) return;
    if (!activo?.id) {
      setCuentas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    listCuentas(activo.id)
      .then(setCuentas)
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar cuentas"))
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

  const total = cuentas.reduce((sum, c) => sum + (c.saldo_actual ?? 0), 0);

  return (
    <div>
      <div className="flex justify-between items-baseline mb-5">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">Cuentas</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {activo.nombre} ·{" "}
            {cuentas.length === 0
              ? "Sin cuentas"
              : `${cuentas.length} ${cuentas.length === 1 ? "cuenta" : "cuentas"} · Saldo total ${formatMonto(total, activo.moneda)}`}
          </p>
        </div>
        <Link
          href="/cuentas/nueva"
          className="flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3.5 py-2 text-sm font-medium transition"
        >
          <IconPlus size={14} />
          Crear cuenta
        </Link>
      </div>

      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">{error}</div>
      )}

      {cuentas.length === 0 ? (
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-cream flex items-center justify-center mb-3">
            <IconWallet size={22} className="text-ink-muted" />
          </div>
          <p className="text-sm font-medium text-ink-dim mb-1">Sin cuentas todavía</p>
          <p className="text-xs text-ink-muted mb-5 max-w-xs mx-auto">
            Registra bancos, caja, tarjetas o cualquier lugar donde entra o sale dinero de {activo.nombre}.
          </p>
          <Link
            href="/cuentas/nueva"
            className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 transition"
          >
            <IconPlus size={14} />
            Crear primera cuenta
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {cuentas.map((c) => {
            const Icon = iconoPorTipo(c.tipo);
            return (
              <Link
                key={c.id}
                href={`/cuentas/${c.id}`}
                className="bg-white border border-black/5 rounded-2xl p-4 hover:border-black/20 hover:-translate-y-px transition"
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-9 h-9 rounded-full bg-sky-50 text-sky-900 flex items-center justify-center flex-shrink-0">
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-dim truncate">{c.nombre}</p>
                    <p className="text-[11px] text-ink-muted">
                      {TIPO_CUENTA_LABELS[c.tipo]}
                      {c.banco ? ` · ${c.banco}` : ""}
                    </p>
                  </div>
                </div>
                <p className="text-lg font-medium text-ink-dim">
                  {formatMonto(c.saldo_actual ?? 0, c.moneda)}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
