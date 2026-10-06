"use client";

/* Programar la nómina: cada cuánto se paga, qué día y cuánto suele ser.
 *
 * Mike, 6-oct-2026: «hay que ver en nómina el programar la nómina para que
 * también se considere en los gastos para proyectar los flujos».
 *
 * No es un corte: no tiene gente ni mueve dinero. Es lo que «Flujo
 * proyectado» pone como gasto en cada fecha de pago futura. Cuando ya hay un
 * corte abierto para una fecha, la proyección usa el total del corte y no
 * esta estimación. Se guarda entera, con el permiso de la raya.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconCalendarRepeat } from "@tabler/icons-react";
import {
  DIAS_DE_LA_SEMANA, describirPrograma, getProgramaNomina, ponerProgramaNomina,
  type FrecuenciaDeNomina, type ProgramaDeNomina,
} from "@/lib/nomina";
import { formatMonto } from "@/lib/format";

const FRECUENCIAS: Array<{ valor: FrecuenciaDeNomina; nombre: string }> = [
  { valor: "semanal", nombre: "Cada semana" },
  { valor: "quincenal", nombre: "Cada quincena (el 15 y el último del mes)" },
  { valor: "mensual", nombre: "Cada mes" },
];

export function NominaProgramada() {
  const [programa, setPrograma] = useState<ProgramaDeNomina | null>(null);
  const [ultimo, setUltimo] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [activo, setActivo] = useState(true);
  const [frecuencia, setFrecuencia] = useState<FrecuenciaDeNomina>("semanal");
  const [diaSemana, setDiaSemana] = useState(6);
  const [diaDelMes, setDiaDelMes] = useState(1);
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    getProgramaNomina()
      .then((r) => {
        setPrograma(r.programa);
        setUltimo(r.ultimo_total);
        if (r.programa) {
          setActivo(r.programa.activo);
          setFrecuencia(r.programa.frecuencia);
          setDiaSemana(r.programa.dia_semana ?? 6);
          setDiaDelMes(r.programa.dia_del_mes ?? 1);
          setMonto(String(r.programa.monto));
          setNota(r.programa.nota);
        } else {
          setEditando(true);
        }
      })
      .catch(() => { /* sin permiso: la lista de arriba ya lo dijo */ })
      .finally(() => setCargando(false));
  }, []);

  const guardar = async () => {
    setError(""); setAviso("");
    const m = parseFloat(monto);
    if (!Number.isFinite(m) || m < 0) { setError("Di cuánto suele ser cada pago, en pesos."); return; }
    setGuardando(true);
    try {
      const p = await ponerProgramaNomina({
        activo, frecuencia, monto: m, nota,
        dia_semana: frecuencia === "semanal" ? diaSemana : null,
        dia_del_mes: frecuencia === "mensual" ? diaDelMes : null,
      });
      setPrograma(p);
      setEditando(false);
      setAviso("Guardada. Ya entra en Flujo proyectado como gasto.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return null;

  return (
    <div data-nomina-programada className="bg-white border border-black/5 rounded-2xl p-4 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-dim inline-flex items-center gap-1.5">
            <IconCalendarRepeat size={15} /> Nómina programada
          </p>
          {programa && !editando ? (
            <p className="text-xs text-ink-muted mt-1" data-programa-dice>
              {programa.activo ? "Se paga " : "Apagada · se pagaba "}
              {describirPrograma(programa)}, {formatMonto(programa.monto, "MXN")} cada vez.
              {programa.activo && <> Entra en <Link href="/flujo" className="underline">Flujo proyectado</Link> como gasto.</>}
            </p>
          ) : (
            <p className="text-xs text-ink-muted mt-1">
              Cada cuánto se paga la raya y cuánto suele ser. No es un corte ni mueve dinero: es lo
              que <Link href="/flujo" className="underline">Flujo proyectado</Link> descuenta en cada fecha de pago.
            </p>
          )}
        </div>
        {!editando && (
          <button
            type="button"
            data-editar-programa
            onClick={() => { setEditando(true); setAviso(""); }}
            className="text-xs border border-black/10 rounded-xl px-3 py-1.5 text-ink-dim flex-shrink-0"
          >
            {programa ? "Cambiar" : "Programar"}
          </button>
        )}
      </div>

      {aviso && <p className="text-xs text-mint-900 bg-mint-50 px-3 py-2 rounded-xl mt-3" data-programa-aviso>{aviso}</p>}

      {editando && (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => { e.preventDefault(); void guardar(); }}
        >
          <label className="text-xs text-ink-muted">
            Cada cuánto
            <select
              data-programa-frecuencia
              value={frecuencia}
              onChange={(e) => setFrecuencia(e.target.value as FrecuenciaDeNomina)}
              className="mt-1 block w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm text-ink"
            >
              {FRECUENCIAS.map((f) => <option key={f.valor} value={f.valor}>{f.nombre}</option>)}
            </select>
          </label>
          {frecuencia === "semanal" && (
            <label className="text-xs text-ink-muted">
              Qué día
              <select
                data-programa-dia
                value={diaSemana}
                onChange={(e) => setDiaSemana(parseInt(e.target.value, 10))}
                className="mt-1 block w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm text-ink"
              >
                {DIAS_DE_LA_SEMANA.map((d, i) => <option key={d} value={i}>{d[0].toUpperCase() + d.slice(1)}</option>)}
              </select>
            </label>
          )}
          {frecuencia === "mensual" && (
            <label className="text-xs text-ink-muted">
              Qué día del mes
              <input
                data-programa-dia
                type="number" min={1} max={31} value={diaDelMes}
                onChange={(e) => setDiaDelMes(Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                className="mt-1 block w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm text-ink"
              />
            </label>
          )}
          {frecuencia === "quincenal" && (
            <p className="text-xs text-ink-muted self-end pb-2">El 15 y el último día de cada mes.</p>
          )}
          <label className="text-xs text-ink-muted">
            Cuánto suele ser cada pago (pesos)
            <input
              data-programa-monto
              type="number" min={0} step="0.01" value={monto} placeholder="0.00"
              onChange={(e) => setMonto(e.target.value)}
              className="mt-1 block w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm text-ink"
            />
            {ultimo !== null && (
              <span className="block mt-1">
                Último corte pagado: {formatMonto(ultimo, "MXN")}.{" "}
                <button type="button" data-usar-ultimo className="underline" onClick={() => setMonto(String(ultimo))}>Usar</button>
              </span>
            )}
          </label>
          <label className="text-xs text-ink-muted">
            Nota
            <input
              type="text" value={nota} maxLength={200}
              onChange={(e) => setNota(e.target.value)}
              className="mt-1 block w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="text-xs text-ink-dim inline-flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" data-programa-activo checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Entra en la proyección
          </label>
          {error && <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl sm:col-span-2">{error}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              data-guardar-programa
              disabled={guardando}
              className="bg-ink text-cream rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            {programa && (
              <button
                type="button"
                onClick={() => { setEditando(false); setError(""); }}
                className="border border-black/10 rounded-xl px-3 py-2 text-sm text-ink-dim"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
