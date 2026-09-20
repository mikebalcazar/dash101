"use client";

/* Abrir un corte de raya: el periodo y quién entra.
 *
 * Nace en BORRADOR: nada sale de la cuenta hasta que alguien diga «pagar»,
 * en la pantalla del corte. Aquí sólo se captura.
 *
 * El neto de cada renglón se enseña mientras se teclea, pero el que vale es
 * el que calcula el servidor. Esto es una ayuda para leer, no la cuenta.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconPlus, IconTrash } from "@tabler/icons-react";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { crearGente, crearRaya, listGente, type GenteDeRaya } from "@/lib/nomina";
import { formatMonto } from "@/lib/format";

type Renglon = { personal_id: string; concepto: string; sueldo: string; extras: string; descuentos: string };

const vacio = (): Renglon => ({ personal_id: "", concepto: "Sueldo", sueldo: "", extras: "", descuentos: "" });
const num = (v: string) => parseFloat(v) || 0;
const netoDe = (r: Renglon) => num(r.sueldo) + num(r.extras) - num(r.descuentos);

/** El lunes y el domingo de la semana de hoy: es el periodo que casi siempre
 *  se captura, y tenerlo puesto ahorra el error de teclear mal una fecha. */
function semanaDeHoy(): { inicio: string; fin: string } {
  const hoy = new Date();
  const dia = (hoy.getDay() + 6) % 7; // lunes = 0
  const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - dia);
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  return { inicio: d(lunes), fin: d(domingo) };
}

export default function NuevaRayaPage() {
  const router = useRouter();
  const { activo } = useNegocioActivo();
  const semana = semanaDeHoy();

  const [inicio, setInicio] = useState(semana.inicio);
  const [fin, setFin] = useState(semana.fin);
  const [nota, setNota] = useState("");
  const [gente, setGente] = useState<GenteDeRaya[]>([]);
  const [renglones, setRenglones] = useState<Renglon[]>([vacio()]);
  const [nuevaPersona, setNuevaPersona] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { listGente().then(setGente).catch(() => setGente([])); }, []);

  const cambiar = (i: number, patch: Partial<Renglon>) =>
    setRenglones((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const agregarPersona = async () => {
    const nombre = nuevaPersona.trim();
    if (!nombre) return;
    setError("");
    try {
      const p = await crearGente(nombre);
      setGente((prev) => [...prev, p]);
      setNuevaPersona("");
      setRenglones((prev) => {
        const libre = prev.findIndex((r) => !r.personal_id);
        if (libre >= 0) return prev.map((r, i) => (i === libre ? { ...r, personal_id: p.id } : r));
        return [...prev, { ...vacio(), personal_id: p.id }];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo dar de alta.");
    }
  };

  const total = renglones.reduce((s, r) => s + (r.personal_id ? netoDe(r) : 0), 0);
  /* Quién ya está puesto, para que el desplegable no ofrezca a la misma
   * persona dos veces: la base lo rechaza, y es mejor no llegar hasta allá. */
  const yaPuestos = new Set(renglones.map((r) => r.personal_id).filter(Boolean));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activo?.id) return;
    const pagos = renglones.filter((r) => r.personal_id);
    if (pagos.length === 0) { setError("Ponle al menos una persona al corte."); return; }
    const negativo = pagos.find((r) => netoDe(r) < 0);
    if (negativo) {
      setError("Un renglón queda en negativo: los descuentos se comen el sueldo. Revísalo.");
      return;
    }
    setGuardando(true); setError("");
    try {
      const { raya } = await crearRaya({
        negocio_id: activo.id, periodo_inicio: inicio, periodo_fin: fin, nota: nota.trim() || undefined,
        pagos: pagos.map((r) => ({
          personal_id: r.personal_id, concepto: r.concepto.trim() || "Sueldo",
          sueldo: num(r.sueldo), extras: num(r.extras), descuentos: num(r.descuentos),
        })),
      });
      router.push(`/nomina/${raya.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el corte.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <Link href="/nomina" className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim">
        <IconArrowLeft size={13} /> Volver
      </Link>

      <h1 className="text-xl font-medium text-ink mb-4">Nuevo corte de raya</h1>

      <form onSubmit={guardar} className="space-y-4">
        <div className="bg-white border border-black/5 rounded-2xl p-4 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Del</label>
            <input type="date" required value={inicio} onChange={(e) => setInicio(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Al</label>
            <input type="date" required value={fin} onChange={(e) => setFin(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40" />
          </div>
        </div>

        <div className="bg-white border border-black/5 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-ink-dim">Quién entra</h2>
            <button type="button" onClick={() => setRenglones((p) => [...p, vacio()])}
              className="text-xs text-ink-dim hover:text-ink inline-flex items-center gap-1">
              <IconPlus size={13} /> Otro renglón
            </button>
          </div>

          {gente.length === 0 && (
            <p className="text-xs text-ink-muted mb-2">
              Todavía no hay gente dada de alta. Escribe un nombre abajo y agrégalo.
            </p>
          )}

          <div className="space-y-2">
            {renglones.map((r, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
                <div className="col-span-2">
                  <label className="text-[11px] text-ink-muted block mb-1">Persona</label>
                  <select
                    aria-label={`Persona ${i + 1}`}
                    value={r.personal_id}
                    onChange={(e) => cambiar(i, { personal_id: e.target.value })}
                    className="w-full bg-white border border-black/10 rounded-xl px-2 py-2 text-sm focus:outline-none focus:border-ink/40"
                  >
                    <option value="">— Escoge —</option>
                    {gente
                      .filter((g) => g.id === r.personal_id || !yaPuestos.has(g.id))
                      .map((g) => (
                        <option key={g.id} value={g.id}>{g.nombre}{g.puesto ? ` · ${g.puesto}` : ""}</option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-ink-muted block mb-1">Sueldo</label>
                  <input type="number" step="0.01" min="0" value={r.sueldo} onChange={(e) => cambiar(i, { sueldo: e.target.value })}
                    className="w-full bg-white border border-black/10 rounded-xl px-2 py-2 text-sm text-right tabular-nums focus:outline-none focus:border-ink/40" />
                </div>
                <div>
                  <label className="text-[11px] text-ink-muted block mb-1">Extras</label>
                  <input type="number" step="0.01" min="0" value={r.extras} onChange={(e) => cambiar(i, { extras: e.target.value })}
                    className="w-full bg-white border border-black/10 rounded-xl px-2 py-2 text-sm text-right tabular-nums focus:outline-none focus:border-ink/40" />
                </div>
                <div>
                  <label className="text-[11px] text-ink-muted block mb-1">Descuentos</label>
                  <input type="number" step="0.01" min="0" value={r.descuentos} onChange={(e) => cambiar(i, { descuentos: e.target.value })}
                    className="w-full bg-white border border-black/10 rounded-xl px-2 py-2 text-sm text-right tabular-nums focus:outline-none focus:border-ink/40" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm tabular-nums ${netoDe(r) < 0 ? "text-mauve-900" : "text-ink-dim"}`}>
                    {formatMonto(netoDe(r), "MXN")}
                  </span>
                  {renglones.length > 1 && (
                    <button type="button" aria-label="Quitar renglón"
                      onClick={() => setRenglones((p) => p.filter((_, idx) => idx !== i))}
                      className="text-ink-muted hover:text-mauve-900">
                      <IconTrash size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-black/5">
            <input
              value={nuevaPersona}
              onChange={(e) => setNuevaPersona(e.target.value)}
              placeholder="Dar de alta a alguien más"
              aria-label="Nombre de quien se da de alta"
              className="flex-1 min-w-[12rem] bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40"
            />
            <button type="button" onClick={agregarPersona} disabled={!nuevaPersona.trim()}
              className="bg-white border border-black/10 text-ink-dim text-xs px-3 py-2 rounded-xl disabled:opacity-40">
              Agregar
            </button>
          </div>
        </div>

        <div className="bg-white border border-black/5 rounded-2xl p-4">
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Nota (opcional)</label>
          <input value={nota} onChange={(e) => setNota(e.target.value)}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40" />
        </div>

        {error && <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>}

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-dim">
            Total del corte <b className="tabular-nums">{formatMonto(total, "MXN")}</b>
            <span className="text-xs text-ink-muted block">
              La cuenta buena la hace el servidor al guardar; esto es para leerlo.
            </span>
          </p>
          <button type="submit" disabled={guardando}
            className="bg-ink text-cream rounded-xl px-5 py-2 text-sm font-medium disabled:opacity-50">
            {guardando ? "Guardando…" : "Abrir el corte"}
          </button>
        </div>
      </form>
    </div>
  );
}
