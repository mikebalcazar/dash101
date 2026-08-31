"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { listCuentas } from "@/lib/cuentas";
import { listOpex } from "@/lib/opex";
import { proyectarFlujo, primeraSemanaBajaUmbral } from "@/lib/proyeccion";
import type { Cuenta, Opex } from "@/types/schema";
import { formatMonto } from "@/lib/format";
import {
  IconChartLine,
  IconAlertTriangle,
  IconPlus,
  IconInfoCircle,
} from "@tabler/icons-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";

function formatWeekLabel(d: Date, index: number): string {
  if (index % 4 === 0) {
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  }
  return "";
}

function formatFecha(d: Date): string {
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export default function FlujoPage() {
  const { activo, loading: loadingNegocio } = useNegocioActivo();
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [opexes, setOpexes] = useState<Opex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [semanas, setSemanas] = useState(52);

  useEffect(() => {
    if (loadingNegocio) return;
    if (!activo?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([listCuentas(activo.id), listOpex(activo.id)])
      .then(([cs, os]) => {
        setCuentas(cs);
        setOpexes(os);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [activo, loadingNegocio]);

  const capitalInicial = cuentas.reduce((s, c) => s + (c.saldo_actual ?? 0), 0);
  const opexActivos = useMemo(() => opexes.filter((o) => o.activo), [opexes]);

  const proyeccion = useMemo(
    () => proyectarFlujo(capitalInicial, opexActivos, { semanas }),
    [capitalInicial, opexActivos, semanas]
  );

  const chartData = useMemo(
    () =>
      proyeccion.map((p) => ({
        semana: p.index,
        fecha: p.fecha_inicio,
        saldo: Math.round(p.saldo_final),
        label: formatWeekLabel(p.fecha_inicio, p.index),
      })),
    [proyeccion]
  );

  const primeraNeg = primeraSemanaBajaUmbral(proyeccion, 0);
  const saldoFinal = proyeccion[proyeccion.length - 1]?.saldo_final ?? capitalInicial;
  const saldoMin = Math.min(...proyeccion.map((p) => p.saldo_final));
  const saldoMinSemana = proyeccion.find((p) => p.saldo_final === saldoMin);

  if (loadingNegocio || loading) return <div className="text-sm text-ink-muted">Cargando…</div>;

  if (!activo) {
    return (
      <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
        <p className="text-sm font-medium text-ink-dim mb-1">Sin negocio activo</p>
      </div>
    );
  }

  if (opexActivos.length === 0) {
    return (
      <div>
        <div className="flex justify-between items-baseline mb-5">
          <div>
            <h2 className="text-lg font-medium text-ink-dim">Flujo proyectado</h2>
            <p className="text-xs text-ink-muted mt-0.5">{activo.nombre}</p>
          </div>
        </div>
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-cream flex items-center justify-center mb-3">
            <IconChartLine size={22} className="text-ink-muted" />
          </div>
          <p className="text-sm font-medium text-ink-dim mb-1">
            Necesitas OPEX activos para proyectar
          </p>
          <p className="text-xs text-ink-muted mb-5 max-w-xs mx-auto">
            Registra tus gastos recurrentes (salarios, rentas, licencias) y la proyección
            aparecerá aquí.
          </p>
          <Link
            href="/opex/nueva"
            className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 transition"
          >
            <IconPlus size={14} />
            Agregar primer OPEX
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-baseline mb-5 gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-medium text-ink-dim">Flujo proyectado</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {activo.nombre} · {opexActivos.length} OPEX activos · {semanas} semanas
          </p>
        </div>
        <select
          value={semanas}
          onChange={(e) => setSemanas(parseInt(e.target.value, 10))}
          className="bg-white border border-black/10 rounded-xl px-3 py-1.5 text-xs focus:outline-none"
        >
          <option value={13}>13 semanas (~3 meses)</option>
          <option value={26}>26 semanas (~6 meses)</option>
          <option value={52}>52 semanas (1 año)</option>
        </select>
      </div>

      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">
          {error}
        </div>
      )}

      {/* Hero */}
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <div className="bg-cream rounded-2xl p-4">
          <p className="text-xs text-ink-muted font-medium">Capital hoy</p>
          <p className="text-xl font-medium text-ink-dim mt-1">
            {formatMonto(capitalInicial, activo.moneda, { short: true })}
          </p>
          <p className="text-[11px] text-ink-muted mt-1">
            Suma de {cuentas.length} cuenta{cuentas.length === 1 ? "" : "s"}
          </p>
        </div>
        <div
          className={`rounded-2xl p-4 ${
            saldoFinal >= capitalInicial
              ? "bg-mint-50"
              : saldoFinal >= 0
              ? "bg-sky-50"
              : "bg-mauve-50"
          }`}
        >
          <p
            className={`text-xs font-medium ${
              saldoFinal >= capitalInicial
                ? "text-mint-label"
                : saldoFinal >= 0
                ? "text-sky-label"
                : "text-mauve-label"
            }`}
          >
            En {semanas} semanas
          </p>
          <p
            className={`text-xl font-medium mt-1 ${
              saldoFinal >= capitalInicial
                ? "text-mint-900"
                : saldoFinal >= 0
                ? "text-sky-900"
                : "text-mauve-900"
            }`}
          >
            {formatMonto(saldoFinal, activo.moneda, { short: true })}
          </p>
          <p
            className={`text-[11px] mt-1 opacity-75 ${
              saldoFinal >= capitalInicial
                ? "text-mint-label"
                : saldoFinal >= 0
                ? "text-sky-label"
                : "text-mauve-label"
            }`}
          >
            {saldoFinal >= capitalInicial
              ? `+${formatMonto(saldoFinal - capitalInicial, activo.moneda, { short: true })}`
              : `−${formatMonto(capitalInicial - saldoFinal, activo.moneda, { short: true })}`}
          </p>
        </div>
        <div
          className={`rounded-2xl p-4 ${
            saldoMin < 0 ? "bg-mauve-50" : "bg-white border border-black/5"
          }`}
        >
          <p
            className={`text-xs font-medium ${
              saldoMin < 0 ? "text-mauve-label" : "text-ink-muted"
            }`}
          >
            Punto más bajo
          </p>
          <p
            className={`text-xl font-medium mt-1 ${
              saldoMin < 0 ? "text-mauve-900" : "text-ink-dim"
            }`}
          >
            {formatMonto(saldoMin, activo.moneda, { short: true })}
          </p>
          <p
            className={`text-[11px] mt-1 opacity-75 ${
              saldoMin < 0 ? "text-mauve-label" : "text-ink-muted"
            }`}
          >
            {saldoMinSemana ? formatFecha(saldoMinSemana.fecha_inicio) : "—"}
          </p>
        </div>
      </div>

      {/* Alerta */}
      {primeraNeg && (
        <div className="bg-mauve-50 rounded-2xl p-4 mb-4 flex items-start gap-3">
          <IconAlertTriangle size={20} className="text-mauve-900 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-mauve-900">
              Cruzas cero en la semana {primeraNeg.index + 1}
            </p>
            <p className="text-xs text-mauve-label mt-0.5">
              Semana del {formatFecha(primeraNeg.fecha_inicio)}. Saldo proyectado:{" "}
              <strong>{formatMonto(primeraNeg.saldo_final, activo.moneda)}</strong>.
              Considera aumentar ingresos, reducir gastos, o revisar tu OPEX.
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-white border border-black/5 rounded-2xl p-4 mb-4">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#6E737E" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) =>
                  new Intl.NumberFormat("es-MX", {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  }).format(v)
                }
                tick={{ fontSize: 10, fill: "#6E737E" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#FBF8F2",
                  border: "1px solid rgba(0,0,0,0.1)",
                  borderRadius: "10px",
                  fontSize: 12,
                }}
                formatter={(value) => [
                  formatMonto(Number(value), activo.moneda),
                  "Saldo",
                ]}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as
                    | { fecha: Date; semana: number }
                    | undefined;
                  if (!p) return "";
                  return `Semana ${p.semana + 1} — ${formatFecha(p.fecha)}`;
                }}
              />
              <ReferenceLine y={0} stroke="#5C485E" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="saldo"
                stroke="#1E2A3A"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "#1E2A3A" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Nota */}
      <div className="bg-sky-50 text-sky-900 text-[11px] px-3 py-2 rounded-xl mb-4 flex gap-2 items-start">
        <IconInfoCircle size={14} className="flex-shrink-0 mt-0.5" />
        <p>
          <strong>Solo cuenta OPEX recurrentes.</strong> Pagos a proveedores y cobros de
          proyectos aún no tienen fecha esperada (siguiente iteración). La proyección real
          será más completa cuando esos datos se calendaricen.
        </p>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
        <div className="px-4 py-2 bg-cream/50 text-xs text-ink-muted uppercase tracking-wide font-medium">
          Detalle por semana
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream/30 text-xs text-ink-muted sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-medium">#</th>
                <th className="text-left px-4 py-2 font-medium">Semana</th>
                <th className="text-right px-4 py-2 font-medium">Ingresos</th>
                <th className="text-right px-4 py-2 font-medium">Egresos</th>
                <th className="text-right px-4 py-2 font-medium">Neto</th>
                <th className="text-right px-4 py-2 font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {proyeccion.map((s) => {
                const neg = s.saldo_final < 0;
                const activity = s.ingresos > 0 || s.egresos > 0;
                return (
                  <tr
                    key={s.index}
                    className={`border-t border-black/5 ${neg ? "bg-mauve-50/40" : ""}`}
                  >
                    <td className="px-4 py-2 text-xs text-ink-muted">{s.index + 1}</td>
                    <td className="px-4 py-2 text-xs text-ink-dim">
                      {formatFecha(s.fecha_inicio)}
                    </td>
                    <td className="text-right px-4 py-2 text-xs">
                      {s.ingresos > 0 ? (
                        <span className="text-mint-900">
                          +{formatMonto(s.ingresos, activo.moneda, { short: true })}
                        </span>
                      ) : (
                        <span className="text-ink-muted opacity-40">—</span>
                      )}
                    </td>
                    <td className="text-right px-4 py-2 text-xs">
                      {s.egresos > 0 ? (
                        <span className="text-mauve-900">
                          −{formatMonto(s.egresos, activo.moneda, { short: true })}
                        </span>
                      ) : (
                        <span className="text-ink-muted opacity-40">—</span>
                      )}
                    </td>
                    <td className="text-right px-4 py-2 text-xs">
                      {activity ? (
                        <span
                          className={`font-medium ${s.neto >= 0 ? "text-mint-900" : "text-mauve-900"}`}
                        >
                          {s.neto >= 0 ? "+" : ""}
                          {formatMonto(s.neto, activo.moneda, { short: true })}
                        </span>
                      ) : (
                        <span className="text-ink-muted opacity-40">—</span>
                      )}
                    </td>
                    <td
                      className={`text-right px-4 py-2 text-xs font-medium ${
                        neg ? "text-mauve-900" : "text-ink-dim"
                      }`}
                    >
                      {formatMonto(s.saldo_final, activo.moneda)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
