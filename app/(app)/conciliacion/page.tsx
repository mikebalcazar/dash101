"use client";

/* Conciliación semanal (B1). Cuenta por cuenta: lo que dash101 tiene
 * registrado, lo que hay de verdad, y la diferencia en vivo. Al guardar, la
 * API ajusta cada cuenta a la realidad y deja la diferencia escrita para
 * siempre. Abajo, lo que se ha escapado por semana y por cuenta. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { useAuth } from "@/lib/auth-context";
import {
  DIAS,
  DIA_POR_OMISION,
  conciliar,
  cuentasPorConciliar,
  estadisticaConciliacion,
  listConciliaciones,
  tocaConciliar,
  type CuentaPorConciliar,
} from "@/lib/conciliacion";
import { updateNegocio } from "@/lib/negocios";
import { formatMontoExact, formatDateLong } from "@/lib/format";
import { TIPO_CUENTA_LABELS, type Conciliacion, type EstadisticaConciliacion } from "@/types/schema";
import type { Timestamp } from "firebase/firestore";
import { IconScale, IconAlertTriangle, IconCheck, IconCalendarEvent } from "@tabler/icons-react";

const caja =
  "w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm text-right tabular-nums focus:outline-none focus:border-ink/40 transition";

export default function ConciliacionPage() {
  const { activo, loading: cargandoNegocio, refresh } = useNegocioActivo();
  const { user } = useAuth();
  const [cuentas, setCuentas] = useState<CuentaPorConciliar[]>([]);
  const [reales, setReales] = useState<Record<string, string>>({});
  const [cortes, setCortes] = useState<Conciliacion[]>([]);
  const [stats, setStats] = useState<EstadisticaConciliacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    if (!activo?.id) {
      setCargando(false);
      return;
    }
    setCargando(true);
    setError("");
    try {
      const [c, l, e] = await Promise.all([
        cuentasPorConciliar(activo.id),
        listConciliaciones(activo.id),
        estadisticaConciliacion(activo.id),
      ]);
      setCuentas(c);
      setCortes(l);
      setStats(e);
      setReales(Object.fromEntries(c.map((x) => [x.cuenta.id!, ""])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setCargando(false);
    }
  }, [activo]);

  useEffect(() => {
    if (cargandoNegocio) return;
    void cargar();
  }, [cargandoNegocio, cargar]);

  const dia = activo?.dia_conciliacion ?? DIA_POR_OMISION;
  const pendiente = useMemo(() => tocaConciliar(activo, cortes[0] ?? null), [activo, cortes]);

  /** La diferencia en vivo: lo registrado menos lo que se capturó. */
  const diferencia = (c: CuentaPorConciliar): number | null => {
    const crudo = (reales[c.cuenta.id!] ?? "").trim();
    if (crudo === "" || crudo === "-") return null;
    const real = Number(crudo.replace(/[\s$,]/g, ""));
    if (!Number.isFinite(real)) return null;
    return c.saldo_registrado - real;
  };

  const completas = cuentas.length > 0 && cuentas.every((c) => diferencia(c) !== null);
  const totalVivo = cuentas.reduce((t, c) => t + (diferencia(c) ?? 0), 0);

  const guardar = async () => {
    if (!activo?.id) return;
    setError("");
    setAviso("");
    setGuardando(true);
    try {
      const saldos = cuentas.map((c) => ({
        cuenta_id: c.cuenta.id!,
        saldo_real: Number((reales[c.cuenta.id!] ?? "0").replace(/[\s$,]/g, "")),
      }));
      const hecha = await conciliar(activo.id, saldos);
      const ajustadas = hecha.cuentas.filter((c) => c.movimiento_id).length;
      setAviso(
        ajustadas === 0
          ? "Todo cuadró: no hizo falta ningún ajuste."
          : `Listo. ${ajustadas} ${ajustadas === 1 ? "cuenta quedó ajustada" : "cuentas quedaron ajustadas"} a la realidad; se escaparon ${formatMontoExact(hecha.diferencia_total, activo.moneda)}.`,
      );
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al conciliar");
    } finally {
      setGuardando(false);
    }
  };

  const cambiarDia = async (nuevo: number) => {
    if (!activo?.id) return;
    try {
      await updateNegocio(activo.id, { dia_conciliacion: nuevo });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  };

  if (cargandoNegocio || cargando) return <div className="text-sm text-ink-muted">Cargando…</div>;

  if (!activo) {
    return (
      <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
        <p className="text-sm font-medium text-ink-dim mb-1">Sin negocio activo</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-baseline mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-medium text-ink-dim flex items-center gap-2">
            <IconScale size={18} />
            Conciliación
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {activo.nombre} · cada {DIAS[dia]}
            {stats && stats.acumulado.cortes > 0 && (
              <>
                {" · "}
                {stats.acumulado.cortes} {stats.acumulado.cortes === 1 ? "corte" : "cortes"}
              </>
            )}
          </p>
        </div>
        <label className="text-xs text-ink-muted inline-flex items-center gap-2">
          <IconCalendarEvent size={13} />
          Día
          <select
            value={dia}
            onChange={(e) => void cambiarDia(Number(e.target.value))}
            className="bg-white border border-black/10 rounded-lg px-2 py-1 text-xs"
          >
            {DIAS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>

      {pendiente && (
        <div className="bg-mauve-50 text-mauve-900 rounded-2xl px-4 py-3 mb-4 flex items-start gap-2">
          <IconAlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
          <p className="text-xs">
            <b>Toca conciliar.</b> Captura cuánto hay de verdad en cada cuenta. Lo que no cuadre se
            ajusta y queda registrado como dinero que se escapó.
          </p>
        </div>
      )}

      {/* ── el corte ── */}
      <div className="bg-white border border-black/5 rounded-2xl overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs text-ink-muted uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Cuenta</th>
              <th className="text-right px-4 py-2 font-medium">Registrado</th>
              <th className="text-right px-4 py-2 font-medium w-40">Real</th>
              <th className="text-right px-4 py-2 font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map(({ cuenta, saldo_registrado }) => {
              const d = diferencia({ cuenta, saldo_registrado });
              return (
                <tr key={cuenta.id} className="border-t border-black/5">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-ink-dim">{cuenta.nombre}</p>
                    <p className="text-[11px] text-ink-muted">{TIPO_CUENTA_LABELS[cuenta.tipo]}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                    {formatMontoExact(saldo_registrado, cuenta.moneda)}
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      inputMode="decimal"
                      value={reales[cuenta.id!] ?? ""}
                      onChange={(e) => setReales((r) => ({ ...r, [cuenta.id!]: e.target.value }))}
                      placeholder="cuánto hay"
                      className={caja}
                    />
                  </td>
                  <td
                    className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                      d === null ? "text-ink-muted" : d === 0 ? "text-mint-900" : "text-mauve-900"
                    }`}
                  >
                    {d === null ? "—" : d === 0 ? "cuadra" : formatMontoExact(d, cuenta.moneda)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-cream/30 flex-wrap">
          <p className="text-xs text-ink-muted">
            {completas ? (
              <>
                En total se escaparon{" "}
                <b className={totalVivo === 0 ? "text-mint-900" : "text-mauve-900"}>
                  {formatMontoExact(totalVivo, activo.moneda)}
                </b>
                . Al guardar, cada cuenta queda igual a lo que capturaste.
              </>
            ) : (
              "Se concilian todas las cuentas a la vez: captura las que faltan."
            )}
          </p>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={!completas || guardando || !user}
            className="bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-40 transition"
          >
            {guardando ? "Conciliando…" : "Conciliar"}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl mb-4">{error}</p>}
      {aviso && (
        <p className="text-xs text-mint-900 bg-mint-50 px-3 py-2 rounded-xl mb-4 inline-flex items-center gap-1.5">
          <IconCheck size={13} />
          {aviso}
        </p>
      )}

      {/* ── lo que se ha escapado ── */}
      {stats && stats.acumulado.cortes > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { que: "Se escapó en total", monto: stats.acumulado.diferencia_total, color: "text-mauve-900" },
              { que: "Salidas sin registrar", monto: stats.acumulado.faltante, color: "text-mauve-900" },
              { que: "Entradas que faltaban", monto: stats.acumulado.sobrante, color: "text-mint-900" },
            ].map((k) => (
              <div key={k.que} className="bg-white border border-black/5 rounded-2xl p-4">
                <p className="text-[10px] uppercase tracking-wide text-ink-muted font-medium">{k.que}</p>
                <p className={`text-lg font-medium tabular-nums mt-1 ${k.color}`}>
                  {formatMontoExact(k.monto, activo.moneda)}
                </p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
              <h3 className="text-xs font-medium text-ink-dim uppercase tracking-wide px-4 py-2.5 bg-cream/50">
                Por semana
              </h3>
              {stats.cortes.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2.5 border-t border-black/5">
                  <div>
                    <p className="text-sm text-ink-dim">{formatDateLong((c.corte_at as Timestamp).toDate())}</p>
                    <p className="text-[11px] text-ink-muted">
                      {c.cuentas} {c.cuentas === 1 ? "cuenta" : "cuentas"}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-medium tabular-nums ${
                      c.diferencia_total === 0 ? "text-mint-900" : "text-mauve-900"
                    }`}
                  >
                    {c.diferencia_total === 0 ? "cuadró" : formatMontoExact(c.diferencia_total, activo.moneda)}
                  </p>
                </div>
              ))}
            </div>

            <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
              <h3 className="text-xs font-medium text-ink-dim uppercase tracking-wide px-4 py-2.5 bg-cream/50">
                Por cuenta
              </h3>
              {stats.por_cuenta.map((c) => (
                <div key={c.cuenta_id} className="flex items-center justify-between px-4 py-2.5 border-t border-black/5">
                  <div>
                    <p className="text-sm text-ink-dim">{c.nombre}</p>
                    <p className="text-[11px] text-ink-muted">
                      {c.cortes} {c.cortes === 1 ? "corte" : "cortes"}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-medium tabular-nums ${
                      c.diferencia_total === 0 ? "text-mint-900" : "text-mauve-900"
                    }`}
                  >
                    {formatMontoExact(c.diferencia_total, activo.moneda)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
