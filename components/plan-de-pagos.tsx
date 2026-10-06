"use client";

/* El plan de pagos del proyecto: cuándo se espera cobrar cuánto.
 *
 * Mike, 6-oct, lo escogió con botones para fechar los cobros en el flujo
 * proyectado: «plan de pagos por proyecto». Parcialidades con fecha, concepto
 * y monto (anticipo, avance, entrega). No mueve dinero: lo cobrado de verdad
 * sigue siendo lo que entra por Movimientos, y aquí se descuenta en orden de
 * fecha para decir qué parcialidad ya quedó cubierta y cuál falta.
 *
 * Lo que dice cada renglón —cobrada, parcial, pendiente— se calcula igual que
 * en el flujo (lib/proyeccion.ts, cobrosDeProyectos): si aquí dijera una cosa
 * y allá otra, nadie sabría a cuál creerle.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconCalendarDollar, IconPlus, IconTrash, IconPencil } from "@tabler/icons-react";
import type { Proyecto } from "@/types/schema";
import { borrarParcialidad, crearParcialidad, editarParcialidad, listPlanDeProyecto, type Parcialidad } from "@/lib/plan-pagos";
import { cobrosDeProyectos } from "@/lib/proyeccion";
import { formatMonto } from "@/lib/format";

type Form = { fecha: string; concepto: string; monto: string };
const vacio = (): Form => ({ fecha: "", concepto: "", monto: "" });

function fechaLegible(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, (m || 1) - 1, d || 1).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

export function PlanDePagos({ proyecto }: { proyecto: Proyecto }) {
  const [plan, setPlan] = useState<Parcialidad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Form>(vacio());
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    if (!proyecto.id) return;
    try { setPlan(await listPlanDeProyecto(proyecto.id)); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo leer el plan"); }
    finally { setCargando(false); }
  }, [proyecto.id]);

  useEffect(() => { void cargar(); }, [cargar]);

  /* El mismo cálculo que el flujo: lo cobrado cubre las parcialidades en
   * orden de fecha. */
  const estado = useMemo(() => {
    const r = cobrosDeProyectos(
      [{ id: proyecto.id!, nombre: proyecto.nombre, precio_venta: proyecto.precio_venta, cobrado: proyecto.cobrado }],
      plan,
    );
    const falta = new Map(r.cobros.map((c) => [c.id, c.monto]));
    return { falta, sin_fecha: r.sin_fecha };
  }, [plan, proyecto.id, proyecto.nombre, proyecto.precio_venta, proyecto.cobrado]);

  const planeado = plan.reduce((s, p) => s + p.monto, 0);

  const guardar = async () => {
    setError("");
    const monto = parseFloat(form.monto);
    if (!form.fecha) { setError("Di cuándo se espera el cobro."); return; }
    if (!Number.isFinite(monto) || monto <= 0) { setError("Di cuánto, en pesos, mayor que cero."); return; }
    setGuardando(true);
    try {
      if (editando) await editarParcialidad(editando, { fecha: form.fecha, concepto: form.concepto, monto });
      else await crearParcialidad({ proyecto_id: proyecto.id!, fecha: form.fecha, concepto: form.concepto, monto });
      setForm(vacio()); setEditando(null); setAbierto(false);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (p: Parcialidad) => {
    if (!confirm(`¿Quitar «${p.concepto || "la parcialidad"}» del ${fechaLegible(p.fecha)} (${formatMonto(p.monto, "MXN")})?`)) return;
    setError("");
    try { await borrarParcialidad(p.id); await cargar(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo quitar"); }
  };

  const editar = (p: Parcialidad) => {
    setEditando(p.id);
    setForm({ fecha: p.fecha, concepto: p.concepto, monto: String(p.monto) });
    setAbierto(true);
    setError("");
  };

  if (cargando) return null;

  return (
    <div data-plan-pagos className="bg-white border border-black/5 rounded-2xl p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-dim inline-flex items-center gap-1.5">
            <IconCalendarDollar size={15} /> Plan de pagos
          </p>
          <p className="text-xs text-ink-muted mt-0.5" data-plan-resumen>
            {plan.length === 0
              ? <>Cuándo se espera cobrar cuánto. Sin plan, este proyecto no entra en <Link href="/flujo" className="underline">Flujo proyectado</Link>.</>
              : <>
                  Planeado {formatMonto(planeado, "MXN")} de {formatMonto(proyecto.precio_venta, "MXN")}
                  {estado.sin_fecha > 0 && <> · <span className="text-mauve-900">{formatMonto(estado.sin_fecha, "MXN")} por cobrar sin fecha</span></>}
                  {planeado > proyecto.precio_venta && <> · <span className="text-mauve-900">el plan suma más que el precio</span></>}
                  . Entra en <Link href="/flujo" className="underline">Flujo proyectado</Link>.
                </>}
          </p>
        </div>
        {!abierto && (
          <button
            type="button"
            data-plan-agregar
            onClick={() => { setEditando(null); setForm(vacio()); setAbierto(true); setError(""); }}
            className="text-xs border border-black/10 rounded-xl px-3 py-1.5 text-ink-dim inline-flex items-center gap-1 flex-shrink-0"
          >
            <IconPlus size={13} /> Parcialidad
          </button>
        )}
      </div>

      {plan.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-[11px] text-ink-muted">
            <tr>
              <th className="text-left py-1 font-medium">Fecha</th>
              <th className="text-left py-1 font-medium">Concepto</th>
              <th className="text-right py-1 font-medium">Monto</th>
              <th className="text-left py-1 pl-3 font-medium">Estado</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {plan.map((p) => {
              const falta = estado.falta.get(p.id) ?? 0;
              const dice = falta <= 0 ? "cobrada" : falta < p.monto ? `faltan ${formatMonto(falta, "MXN")}` : "pendiente";
              const color = falta <= 0 ? "bg-mint-50 text-mint-900" : falta < p.monto ? "bg-sky-50 text-sky-900" : "bg-cream text-ink-muted";
              return (
                <tr key={p.id} data-parcialidad={p.id} className="border-t border-black/5">
                  <td className="py-1.5 text-xs text-ink-dim tabular-nums">{fechaLegible(p.fecha)}</td>
                  <td className="py-1.5 text-xs text-ink-dim">{p.concepto || <span className="text-ink-muted">Parcialidad</span>}</td>
                  <td className="py-1.5 text-xs text-ink-dim text-right tabular-nums">{formatMonto(p.monto, "MXN")}</td>
                  <td className="py-1.5 pl-3"><span data-parcialidad-estado className={`text-[10px] px-2 py-0.5 rounded-full ${color}`}>{dice}</span></td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    <button type="button" aria-label="Editar" onClick={() => editar(p)} className="text-ink-muted hover:text-ink-dim p-1"><IconPencil size={13} /></button>
                    <button type="button" aria-label="Quitar" data-plan-borrar onClick={() => void borrar(p)} className="text-ink-muted hover:text-mauve-900 p-1"><IconTrash size={13} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {abierto && (
        <form
          data-plan-form
          className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr_9rem_auto] items-end"
          onSubmit={(e) => { e.preventDefault(); void guardar(); }}
        >
          <label className="text-xs text-ink-muted">
            Fecha
            <input data-plan-fecha type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              className="mt-1 block w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm text-ink" />
          </label>
          <label className="text-xs text-ink-muted">
            Concepto
            <input data-plan-concepto type="text" maxLength={80} value={form.concepto} placeholder="Anticipo, avance, entrega…"
              onChange={(e) => setForm({ ...form, concepto: e.target.value })}
              className="mt-1 block w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm text-ink" />
          </label>
          <label className="text-xs text-ink-muted">
            Monto (pesos)
            <input data-plan-monto type="number" min={0} step="0.01" value={form.monto} placeholder="0.00"
              onChange={(e) => setForm({ ...form, monto: e.target.value })}
              className="mt-1 block w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm text-ink" />
          </label>
          <div className="flex gap-1.5">
            <button type="submit" data-plan-guardar disabled={guardando}
              className="bg-ink text-cream rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-50">
              {guardando ? "Guardando…" : editando ? "Guardar" : "Agregar"}
            </button>
            <button type="button" onClick={() => { setAbierto(false); setEditando(null); setError(""); }}
              className="border border-black/10 rounded-xl px-3 py-2 text-sm text-ink-dim">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {error && <p data-plan-error className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl mt-2">{error}</p>}
    </div>
  );
}
