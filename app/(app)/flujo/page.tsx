"use client";

/* El flujo proyectado, por bloques.
 *
 * Mike, 6-oct-2026: «en la proyección de flujos necesito que haya opción
 * para presentar por bloques de tiempo, ya sea por semana, por quincena,
 * por mes, por trimestre, por semestre y por año. Quiero ver todos los
 * gastos y los cobros que están planeados para esa semana».
 *
 * La cuenta la hace `lib/proyeccion.ts` (puro). Aquí sólo se juntan las
 * fuentes y se pinta:
 *
 *   · los OPEX activos;
 *   · la nómina programada y los cortes abiertos (contrato 0.71.0). Si la
 *     API contesta 403, esta persona no lleva la raya: la proyección sigue
 *     sin nómina y lo dice. La respuesta de la API ES la respuesta;
 *   · las órdenes de compra pendientes de pago, en su fecha máxima. Si el
 *     buzón no se puede leer (403), igual: sin ellas y dicho.
 *
 * Cada renglón de la tabla se abre y enseña lo planeado en ese bloque, uno
 * por uno, con su fecha y su monto.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useEmpresa } from "@/lib/empresa-context";
import { listCuentas } from "@/lib/cuentas";
import { listOpex } from "@/lib/opex";
import { getBuzon } from "@/lib/ordenes";
import { describirPrograma, getProgramaNomina, type NominaProgramada } from "@/lib/nomina";
import { ErrorApi } from "@/lib/api/cliente";
import {
  BLOQUES, etiquetaDeLapso, primerBloqueBajoUmbral, proyectar,
  type Bloque, type BloqueProyeccion, type OrdenPlaneada, type Planeado,
} from "@/lib/proyeccion";
import type { Cuenta, Opex } from "@/types/schema";
import { formatMonto } from "@/lib/format";
import {
  IconChartLine,
  IconAlertTriangle,
  IconPlus,
  IconInfoCircle,
  IconChevronDown,
  IconChevronRight,
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

const HORIZONTES: Array<{ meses: number; nombre: string }> = [
  { meses: 3, nombre: "3 meses" },
  { meses: 6, nombre: "6 meses" },
  { meses: 12, nombre: "1 año" },
  { meses: 24, nombre: "2 años" },
  { meses: 36, nombre: "3 años" },
];

const BLOQUE_POR_OMISION: Bloque = "semana";

const esBloque = (v: string | null): v is Bloque => BLOQUES.some((b) => b.valor === v);

/** Lo escogido se recuerda en este navegador: es una preferencia, no un dato. */
function recordar<T extends string | number>(clave: string, valor: T) {
  try { localStorage.setItem(clave, String(valor)); } catch { /* sin almacenamiento */ }
}
function recordado(clave: string): string | null {
  try { return localStorage.getItem(clave); } catch { return null; }
}

function formatFecha(d: Date): string {
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

const CLASE: Record<Planeado["clase"], string> = {
  opex: "OPEX",
  nomina: "Nómina",
  orden: "Orden de compra",
};

export default function FlujoPage() {
  const { empresa, loading: loadingEmpresa } = useEmpresa();
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [opexes, setOpexes] = useState<Opex[]>([]);
  const [nomina, setNomina] = useState<NominaProgramada | null>(null);
  const [nominaCerrada, setNominaCerrada] = useState(false);
  const [ordenes, setOrdenes] = useState<OrdenPlaneada[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bloque, setBloque] = useState<Bloque>(BLOQUE_POR_OMISION);
  const [meses, setMeses] = useState(12);
  const [abierto, setAbierto] = useState<number | null>(null);

  useEffect(() => {
    const b = recordado("flujo_bloque");
    if (esBloque(b)) setBloque(b);
    const m = parseInt(recordado("flujo_meses") ?? "", 10);
    if (HORIZONTES.some((h) => h.meses === m)) setMeses(m);
  }, []);

  useEffect(() => {
    if (loadingEmpresa) return;
    if (!empresa?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const sinPermiso = (e: unknown) => e instanceof ErrorApi && (e.estado === 403 || e.error === "sin_permiso");
    Promise.all([
      listCuentas(),
      listOpex(),
      getProgramaNomina().then(
        (n) => ({ n, cerrada: false }),
        (e) => { if (sinPermiso(e)) return { n: null, cerrada: true }; throw e; },
      ),
      getBuzon().then(
        (b) => b.filas
          .filter((o) => o.estado === "en_buzon" || o.estado === "devuelta")
          .map<OrdenPlaneada>((o) => ({
            id: o.id,
            nombre: `${o.folio} · ${o.proveedor_nombre || o.concepto}`,
            monto: o.monto,
            fecha_maxima_pago: o.fecha_maxima_pago,
          })),
        (e) => { if (sinPermiso(e)) return null; throw e; },
      ),
    ])
      .then(([cs, os, n, ords]) => {
        setCuentas(cs);
        setOpexes(os);
        setNomina(n.n);
        setNominaCerrada(n.cerrada);
        setOrdenes(ords);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [empresa, loadingEmpresa]);

  const capitalInicial = cuentas.reduce((s, c) => s + (c.saldo_actual ?? 0), 0);
  const opexActivos = useMemo(() => opexes.filter((o) => o.activo), [opexes]);
  const programa = nomina?.programa && nomina.programa.activo ? nomina.programa : null;
  const borradores = nomina?.borradores ?? [];
  const hayFuentes = opexActivos.length > 0 || !!programa || borradores.length > 0 || (ordenes?.length ?? 0) > 0;

  const proyeccion = useMemo(
    () => proyectar(capitalInicial, { opex: opexActivos, nomina, ordenes }, { bloque, meses }),
    [capitalInicial, opexActivos, nomina, ordenes, bloque, meses]
  );

  const chartData = useMemo(
    () =>
      proyeccion.map((p) => ({
        index: p.index,
        etiqueta: etiquetaDeLapso(bloque, p),
        saldo: Math.round(p.saldo_final),
        label: bloque === "semana"
          ? (p.index % 4 === 0 ? formatFecha(p.inicio) : "")
          : bloque === "quincena"
          ? (p.index % 2 === 0 ? formatFecha(p.inicio) : "")
          : etiquetaDeLapso(bloque, p),
      })),
    [proyeccion, bloque]
  );

  const primeraNeg = primerBloqueBajoUmbral(proyeccion, 0);
  const saldoFinal = proyeccion[proyeccion.length - 1]?.saldo_final ?? capitalInicial;
  const saldoMin = proyeccion.length ? Math.min(...proyeccion.map((p) => p.saldo_final)) : capitalInicial;
  const saldoMinBloque = proyeccion.find((p) => p.saldo_final === saldoMin);
  const nombreBloque = BLOQUES.find((b) => b.valor === bloque)?.nombre.toLowerCase() ?? bloque;
  const nombreHorizonte = HORIZONTES.find((h) => h.meses === meses)?.nombre ?? `${meses} meses`;
  const ordenesSinFecha = (ordenes ?? []).filter((o) => !o.fecha_maxima_pago).length;

  const escogerBloque = (v: Bloque) => { setBloque(v); setAbierto(null); recordar("flujo_bloque", v); };
  const escogerMeses = (m: number) => { setMeses(m); setAbierto(null); recordar("flujo_meses", m); };

  if (loadingEmpresa || loading) return <div className="text-sm text-ink-muted">Cargando…</div>;

  if (!empresa) {
    return (
      <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
        <p className="text-sm font-medium text-ink-dim mb-1">Cargando la empresa…</p>
      </div>
    );
  }

  if (!hayFuentes) {
    return (
      <div>
        <div className="flex justify-between items-baseline mb-5">
          <div>
            <h2 className="text-lg font-medium text-ink-dim">Flujo proyectado</h2>
            <p className="text-xs text-ink-muted mt-0.5">{empresa.nombre}</p>
          </div>
        </div>
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-cream flex items-center justify-center mb-3">
            <IconChartLine size={22} className="text-ink-muted" />
          </div>
          <p className="text-sm font-medium text-ink-dim mb-1">
            Todavía no hay nada planeado para proyectar
          </p>
          <p className="text-xs text-ink-muted mb-5 max-w-xs mx-auto">
            Registra tus gastos recurrentes (rentas, licencias) en OPEX, programa la nómina, o deja
            órdenes de compra pendientes con fecha de pago, y la proyección aparecerá aquí.
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            <Link
              href="/opex/nueva"
              className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 transition"
            >
              <IconPlus size={14} />
              Agregar un OPEX
            </Link>
            {!nominaCerrada && (
              <Link
                href="/nomina"
                className="inline-flex items-center gap-1.5 border border-black/10 text-ink-dim rounded-xl px-4 py-2 text-sm font-medium"
              >
                Programar la nómina
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-baseline mb-5 gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-medium text-ink-dim">Flujo proyectado</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {empresa.nombre} · por {nombreBloque} · {nombreHorizonte}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            data-bloque
            aria-label="Bloque de tiempo"
            value={bloque}
            onChange={(e) => escogerBloque(e.target.value as Bloque)}
            className="bg-white border border-black/10 rounded-xl px-3 py-1.5 text-xs focus:outline-none"
          >
            {BLOQUES.map((b) => (
              <option key={b.valor} value={b.valor}>Por {b.nombre.toLowerCase()}</option>
            ))}
          </select>
          <select
            data-horizonte
            aria-label="Horizonte"
            value={meses}
            onChange={(e) => escogerMeses(parseInt(e.target.value, 10))}
            className="bg-white border border-black/10 rounded-xl px-3 py-1.5 text-xs focus:outline-none"
          >
            {HORIZONTES.map((h) => (
              <option key={h.meses} value={h.meses}>{h.nombre}</option>
            ))}
          </select>
        </div>
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
            {formatMonto(capitalInicial, empresa.moneda, { short: true })}
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
            En {nombreHorizonte}
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
            {formatMonto(saldoFinal, empresa.moneda, { short: true })}
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
              ? `+${formatMonto(saldoFinal - capitalInicial, empresa.moneda, { short: true })}`
              : `−${formatMonto(capitalInicial - saldoFinal, empresa.moneda, { short: true })}`}
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
            {formatMonto(saldoMin, empresa.moneda, { short: true })}
          </p>
          <p
            className={`text-[11px] mt-1 opacity-75 ${
              saldoMin < 0 ? "text-mauve-label" : "text-ink-muted"
            }`}
          >
            {saldoMinBloque ? etiquetaDeLapso(bloque, saldoMinBloque) : "—"}
          </p>
        </div>
      </div>

      {/* Alerta */}
      {primeraNeg && (
        <div className="bg-mauve-50 rounded-2xl p-4 mb-4 flex items-start gap-3">
          <IconAlertTriangle size={20} className="text-mauve-900 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-mauve-900">
              Cruzas cero: {etiquetaDeLapso(bloque, primeraNeg).toLowerCase()}
            </p>
            <p className="text-xs text-mauve-label mt-0.5">
              Saldo proyectado al cerrar ese bloque:{" "}
              <strong>{formatMonto(primeraNeg.saldo_final, empresa.moneda)}</strong>.
              Ábrelo en la tabla para ver qué gastos lo cruzan.
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
                interval={0}
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
                  formatMonto(Number(value), empresa.moneda),
                  "Saldo",
                ]}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as { etiqueta: string } | undefined;
                  return p?.etiqueta ?? "";
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

      {/* Qué entra */}
      <div data-fuentes className="bg-sky-50 text-sky-900 text-[11px] px-3 py-2 rounded-xl mb-4 flex gap-2 items-start">
        <IconInfoCircle size={14} className="flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p>
            <strong>Entra:</strong> {opexActivos.length} OPEX activo{opexActivos.length === 1 ? "" : "s"}
            {programa
              ? <> · la nómina programada ({describirPrograma(programa)}, {formatMonto(programa.monto, empresa.moneda, { short: true })} cada vez)</>
              : nominaCerrada
              ? <> · la nómina no entra: no llevas la raya</>
              : <> · la nómina todavía no está programada (<Link href="/nomina" className="underline">programarla</Link>)</>}
            {borradores.length > 0 && <> · {borradores.length} corte{borradores.length === 1 ? "" : "s"} de raya abierto{borradores.length === 1 ? "" : "s"}</>}
            {ordenes === null
              ? <> · las órdenes de compra no entran: no ves el buzón</>
              : <> · {ordenes.length} orden{ordenes.length === 1 ? "" : "es"} de compra pendiente{ordenes.length === 1 ? "" : "s"}{ordenesSinFecha > 0 && <> ({ordenesSinFecha} sin fecha máxima: cae{ordenesSinFecha === 1 ? "" : "n"} en el primer bloque)</>}</>}
            .
          </p>
          <p>
            Los cobros de proyectos todavía no tienen fecha esperada: de cobros sólo entran los ingresos
            recurrentes. El primer bloque cuenta de hoy en adelante.
          </p>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
        <div className="px-4 py-2 bg-cream/50 text-xs text-ink-muted uppercase tracking-wide font-medium">
          Detalle por {nombreBloque} · abre uno para ver lo planeado
        </div>
        <div className="max-h-[32rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream/30 text-xs text-ink-muted sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-medium w-8">#</th>
                <th className="text-left px-4 py-2 font-medium">{BLOQUES.find((b) => b.valor === bloque)?.nombre}</th>
                <th className="text-right px-4 py-2 font-medium">Cobros</th>
                <th className="text-right px-4 py-2 font-medium">Gastos</th>
                <th className="text-right px-4 py-2 font-medium">Neto</th>
                <th className="text-right px-4 py-2 font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {proyeccion.map((s) => (
                <FilaBloque
                  key={s.index}
                  s={s}
                  bloque={bloque}
                  moneda={empresa.moneda}
                  abierto={abierto === s.index}
                  alternar={() => setAbierto(abierto === s.index ? null : s.index)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilaBloque({
  s, bloque, moneda, abierto, alternar,
}: {
  s: BloqueProyeccion; bloque: Bloque; moneda: string; abierto: boolean; alternar: () => void;
}) {
  const neg = s.saldo_final < 0;
  const activity = s.planeados.length > 0;
  return (
    <>
      <tr
        data-fila-bloque={s.index}
        className={`border-t border-black/5 ${neg ? "bg-mauve-50/40" : ""} ${activity ? "cursor-pointer hover:bg-cream/30" : ""}`}
        onClick={activity ? alternar : undefined}
      >
        <td className="px-4 py-2 text-xs text-ink-muted">{s.index + 1}</td>
        <td className="px-4 py-2 text-xs text-ink-dim">
          <button
            type="button"
            data-abrir-bloque
            disabled={!activity}
            className="inline-flex items-center gap-1 disabled:opacity-60"
            onClick={(e) => { e.stopPropagation(); if (activity) alternar(); }}
            aria-expanded={abierto}
          >
            {activity ? (abierto ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />) : <span className="w-[13px]" />}
            {etiquetaDeLapso(bloque, s)}
            {activity && <span className="text-ink-muted ml-1">· {s.planeados.length}</span>}
          </button>
        </td>
        <td className="text-right px-4 py-2 text-xs">
          {s.ingresos > 0 ? (
            <span className="text-mint-900">+{formatMonto(s.ingresos, moneda, { short: true })}</span>
          ) : (
            <span className="text-ink-muted opacity-40">—</span>
          )}
        </td>
        <td className="text-right px-4 py-2 text-xs">
          {s.egresos > 0 ? (
            <span className="text-mauve-900">−{formatMonto(s.egresos, moneda, { short: true })}</span>
          ) : (
            <span className="text-ink-muted opacity-40">—</span>
          )}
        </td>
        <td className="text-right px-4 py-2 text-xs">
          {activity ? (
            <span className={`font-medium ${s.neto >= 0 ? "text-mint-900" : "text-mauve-900"}`}>
              {s.neto >= 0 ? "+" : ""}
              {formatMonto(s.neto, moneda, { short: true })}
            </span>
          ) : (
            <span className="text-ink-muted opacity-40">—</span>
          )}
        </td>
        <td className={`text-right px-4 py-2 text-xs font-medium ${neg ? "text-mauve-900" : "text-ink-dim"}`}>
          {formatMonto(s.saldo_final, moneda)}
        </td>
      </tr>
      {abierto && activity && (
        <tr data-planeado-de={s.index} className="bg-cream/20">
          <td colSpan={6} className="px-4 py-2">
            <ul className="divide-y divide-black/5">
              {s.planeados.map((p) => (
                <li key={`${p.clase}:${p.id}:${p.fecha.getTime()}`} data-planeado className="flex items-center gap-3 py-1.5 text-xs">
                  <span className="text-ink-muted w-14 flex-shrink-0 tabular-nums">{formatFecha(p.fecha)}</span>
                  <span className="text-ink-dim min-w-0 flex-1 truncate">
                    {p.nombre}
                    {p.vencido && <span className="ml-1.5 text-[10px] px-1.5 py-px rounded-full bg-mauve-50 text-mauve-900">vencido</span>}
                    {p.sin_fecha && <span className="ml-1.5 text-[10px] px-1.5 py-px rounded-full bg-cream text-ink-muted">sin fecha máxima</span>}
                    {p.estimado && <span className="ml-1.5 text-[10px] px-1.5 py-px rounded-full bg-cream text-ink-muted">estimado</span>}
                  </span>
                  <span className="text-[10px] text-ink-muted flex-shrink-0 hidden sm:inline">{CLASE[p.clase]}</span>
                  <span className={`tabular-nums flex-shrink-0 ${p.tipo === "ingreso" ? "text-mint-900" : "text-mauve-900"}`}>
                    {p.tipo === "ingreso" ? "+" : "−"}{formatMonto(p.monto, moneda)}
                  </span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
