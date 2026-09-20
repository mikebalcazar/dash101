"use client";

/* La obra de quell101 de este proyecto · contrato 0.22.0 de la suite.
 *
 * Mike, 20-sep: «si ya se crearon de los 2 lados, se deberían poder ligar
 * para que el sistema los tome como el mismo proyecto».
 *
 * Éste es ese lugar. Con obra ligada enseña cuál es y abre el plano en
 * quell101; sin ella, ofrece las obras sueltas para ligarla aquí mismo. Si la
 * empresa no usa quell101 —no hay obras— el bloque no aparece: una pantalla
 * que enseña un desplegable vacío hace pensar que algo falta.
 */

import { useEffect, useState } from "react";
import { IconExternalLink, IconLink, IconUnlink } from "@tabler/icons-react";
import { desligarObra, ligarObra, listObras, obraDeProyecto, urlObra, type Obra } from "@/lib/obras";

export function ObraDelProyecto({ proyectoId }: { proyectoId: string }) {
  const [obra, setObra] = useState<Obra | null>(null);
  const [sueltas, setSueltas] = useState<Obra[]>([]);
  const [escogida, setEscogida] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const refrescar = async () => {
    const [mia, libres] = await Promise.all([obraDeProyecto(proyectoId), listObras(true)]);
    setObra(mia);
    setSueltas(libres);
  };

  useEffect(() => {
    let vivo = true;
    // El `catch` vacío es a propósito: una empresa sin quell101 prendido
    // contesta 403 aquí, y eso no es un error que reportarle a nadie.
    Promise.all([obraDeProyecto(proyectoId), listObras(true)])
      .then(([mia, libres]) => { if (vivo) { setObra(mia); setSueltas(libres); } })
      .catch(() => { if (vivo) { setObra(null); setSueltas([]); } })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [proyectoId]);

  const ligar = async () => {
    if (!escogida) return;
    setError(""); setGuardando(true);
    try {
      await ligarObra(escogida, proyectoId);
      setEscogida("");
      await refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo ligar.");
    } finally {
      setGuardando(false);
    }
  };

  const desligar = async () => {
    if (!obra) return;
    setError(""); setGuardando(true);
    try {
      await desligarObra(obra.id);
      await refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar la liga.");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return null;
  if (!obra && sueltas.length === 0) return null;

  return (
    <div className="bg-white border border-black/5 rounded-2xl p-4 mb-4">
      <h3 className="text-sm font-medium text-ink-dim mb-2">Obra en quell101</h3>

      {obra ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-ink-dim">
            <a
              href={urlObra(obra)}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-marca hover:underline inline-flex items-center gap-1"
            >
              {obra.nombre}
              <IconExternalLink size={13} />
            </a>
            <p className="text-ink-muted mt-0.5">
              {obra.planos} plano{obra.planos === 1 ? "" : "s"} · {obra.ubicados} ítem
              {obra.ubicados === 1 ? "" : "s"} ubicado{obra.ubicados === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={desligar}
            disabled={guardando}
            className="text-xs text-ink-muted hover:text-mauve-900 inline-flex items-center gap-1 disabled:opacity-50"
          >
            <IconUnlink size={13} />
            Quitar la liga
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-ink-muted mb-2">
            Este proyecto todavía no está ligado con ninguna obra. Si la casa ya se abrió en
            quell101, lígala y las dos apps la toman como la misma.
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Obra de quell101"
              value={escogida}
              onChange={(e) => setEscogida(e.target.value)}
              className="flex-1 min-w-[12rem] bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            >
              <option value="">— Escoge la obra —</option>
              {sueltas.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                  {o.cliente ? ` — ${o.cliente}` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={ligar}
              disabled={!escogida || guardando}
              className="bg-ink text-white text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40"
            >
              <IconLink size={13} />
              {guardando ? "Ligando…" : "Ligar"}
            </button>
          </div>
        </>
      )}

      {error && <p className="text-xs text-mauve-900 mt-2">{error}</p>}
    </div>
  );
}
