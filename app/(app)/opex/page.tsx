"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { listOpex, updateOpex, estimarMensual } from "@/lib/opex";
import type { Opex } from "@/types/schema";
import { FRECUENCIA_LABELS, DIAS_SEMANA } from "@/types/schema";
import { formatMonto } from "@/lib/format";
import {
  IconReceipt,
  IconPlus,
  IconRepeat,
  IconArrowUpRight,
  IconArrowDownLeft,
} from "@tabler/icons-react";

export default function OpexPage() {
  const { activo, loading: loadingNegocio } = useNegocioActivo();
  const [opexes, setOpexes] = useState<Opex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    if (!activo?.id) {
      setOpexes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    listOpex(activo.id)
      .then(setOpexes)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (loadingNegocio) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, loadingNegocio]);

  const toggleActivo = async (o: Opex) => {
    try {
      await updateOpex(o.id!, { activo: !o.activo });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    }
  };

  if (loadingNegocio || loading) return <div className="text-sm text-ink-muted">Cargando…</div>;

  if (!activo) {
    return (
      <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
        <p className="text-sm font-medium text-ink-dim mb-1">Sin negocio activo</p>
      </div>
    );
  }

  const activos = opexes.filter((o) => o.activo);
  const totalMensual = activos.reduce((s, o) => {
    const m = estimarMensual(o);
    return s + (o.tipo === "ingreso" ? m : -m);
  }, 0);
  const egresoMensual = activos
    .filter((o) => o.tipo === "egreso")
    .reduce((s, o) => s + estimarMensual(o), 0);
  const ingresoMensual = activos
    .filter((o) => o.tipo === "ingreso")
    .reduce((s, o) => s + estimarMensual(o), 0);

  return (
    <div>
      <div className="flex justify-between items-baseline mb-4">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">OPEX recurrentes</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {activo.nombre} · {opexes.length} {opexes.length === 1 ? "gasto" : "gastos"}
            {activos.length !== opexes.length && ` (${activos.length} activos)`}
          </p>
        </div>
        <Link
          href="/opex/nueva"
          className="flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3.5 py-2 text-sm font-medium transition"
        >
          <IconPlus size={14} />
          Agregar
        </Link>
      </div>

      {activos.length > 0 && (
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <div className="bg-mauve-50 rounded-2xl p-4">
            <p className="text-xs text-mauve-label font-medium">Egresos / mes</p>
            <p className="text-xl font-medium text-mauve-900 mt-1">
              {formatMonto(egresoMensual, activo.moneda, { short: true })}
            </p>
            <p className="text-[11px] text-mauve-label mt-1 opacity-75">
              Estimado ~4.33 sem/mes
            </p>
          </div>
          <div className="bg-mint-50 rounded-2xl p-4">
            <p className="text-xs text-mint-label font-medium">Ingresos / mes</p>
            <p className="text-xl font-medium text-mint-900 mt-1">
              {formatMonto(ingresoMensual, activo.moneda, { short: true })}
            </p>
            <p className="text-[11px] text-mint-label mt-1 opacity-75">
              Fijos recurrentes
            </p>
          </div>
          <div
            className={`rounded-2xl p-4 ${
              totalMensual >= 0 ? "bg-cream" : "bg-mauve-50"
            }`}
          >
            <p className="text-xs text-ink-muted font-medium">Neto / mes</p>
            <p
              className={`text-xl font-medium mt-1 ${
                totalMensual >= 0 ? "text-ink-dim" : "text-mauve-900"
              }`}
            >
              {totalMensual >= 0 ? "+" : ""}
              {formatMonto(totalMensual, activo.moneda, { short: true })}
            </p>
            <p className="text-[11px] text-ink-muted mt-1 opacity-75">
              {totalMensual >= 0 ? "Superávit" : "Déficit"}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">
          {error}
        </div>
      )}

      {opexes.length === 0 ? (
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-cream flex items-center justify-center mb-3">
            <IconReceipt size={22} className="text-ink-muted" />
          </div>
          <p className="text-sm font-medium text-ink-dim mb-1">Sin gastos recurrentes</p>
          <p className="text-xs text-ink-muted mb-5 max-w-xs mx-auto">
            Salarios, rentas, licencias, gasolinas, celular. Todo lo que pagas cada
            semana/mes/año.
          </p>
          <Link
            href="/opex/nueva"
            className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 transition"
          >
            <IconPlus size={14} />
            Agregar primer gasto
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
          {opexes.map((o) => {
            const Icon = o.tipo === "ingreso" ? IconArrowDownLeft : IconArrowUpRight;
            const color =
              o.tipo === "ingreso"
                ? "bg-mint-50 text-mint-900"
                : "bg-mauve-50 text-mauve-900";
            const montoColor =
              o.tipo === "ingreso" ? "text-mint-900" : "text-mauve-900";
            const mensual = estimarMensual(o);

            let frecDetalle = FRECUENCIA_LABELS[o.frecuencia];
            if (o.frecuencia === "semanal" && o.dia_semana != null) {
              frecDetalle = DIAS_SEMANA[o.dia_semana];
            } else if (o.frecuencia === "mensual" && o.dia_del_mes != null) {
              frecDetalle = `Día ${o.dia_del_mes} de cada mes`;
            }

            return (
              <div
                key={o.id}
                className={`flex items-center gap-3 px-4 py-3 border-b border-black/5 last:border-b-0 hover:bg-cream/30 transition ${
                  !o.activo ? "opacity-50" : ""
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${color}`}>
                  <Icon size={15} />
                </div>
                <Link href={`/opex/${o.id}`} className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-dim truncate">
                    {o.nombre}
                    {o.categoria && (
                      <span className="text-ink-muted font-normal">
                        {" · "}
                        {o.categoria}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-ink-muted truncate">
                    <IconRepeat size={10} className="inline mr-1" />
                    {frecDetalle}
                    {o.cuenta_nombre && ` · ${o.cuenta_nombre}`}
                    {!o.activo && " · Pausado"}
                  </p>
                </Link>
                <div className="text-right">
                  <p className={`text-sm font-medium ${montoColor}`}>
                    {o.tipo === "ingreso" ? "+" : "−"}
                    {formatMonto(o.monto, o.moneda)}
                  </p>
                  <p className="text-[10px] text-ink-muted">
                    ~{formatMonto(mensual, o.moneda, { short: true })}/mes
                  </p>
                </div>
                <button
                  onClick={() => toggleActivo(o)}
                  className={`text-[10px] px-2 py-1 rounded-full transition ${
                    o.activo
                      ? "bg-mint-50 text-mint-900 hover:bg-mint-50/70"
                      : "bg-cream text-ink-muted hover:bg-cream/70"
                  }`}
                >
                  {o.activo ? "Activo" : "Pausado"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
