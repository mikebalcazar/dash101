"use client";

/* Juntar los ítems del proyecto con las piezas del plano · contrato 0.26.0.
 *
 * Mike, 20-sep: los ítems de la obra y los del proyecto son la misma lista de
 * piezas capturada dos veces, y nadie sabe cuál manda.
 *
 * Esta pantalla NO junta sola. Enseña lo que la API propone y espera un sí.
 * Emparejar por parecido acierta casi siempre; la vez que falla le cuelga el
 * dinero de una pieza a otra, y eso se arregla a mano, renglón por renglón,
 * cuando alguien lo note. Por eso cada pareja dice POR QUÉ se emparejó —por
 * código o por nombre— y cada una se puede quitar antes de aplicar.
 */

import { useEffect, useState } from "react";
import { IconExternalLink, IconCheck, IconPlus } from "@tabler/icons-react";
import {
  fusionarItemsDeLaObra, itemsDeLaObra, urlObra,
  type Obra, type PropuestaDeItems,
} from "@/lib/obras";
import { formatMonto } from "@/lib/format";

/** El dinero llega en CENTAVOS de la API; aquí se pinta en pesos, una vez. */
const pesos = (centavos: number) => formatMonto(Math.round(centavos) / 100, "MXN");

export function JuntarItemsDeLaObra({ obra, alTerminar }: { obra: Obra; alTerminar: () => void }) {
  const [prop, setProp] = useState<PropuestaDeItems | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState("");
  /* Lo que sigue aceptado. Arranca con TODO palomeado porque la propuesta
   * casi siempre está bien; lo que hay que poder hacer rápido es quitar la
   * que no. */
  const [ligar, setLigar] = useState<Set<string>>(new Set());
  const [crear, setCrear] = useState<Set<string>>(new Set());

  const traer = async () => {
    setCargando(true); setError("");
    try {
      const p = await itemsDeLaObra(obra.id);
      setProp(p);
      setLigar(new Set(p.parejas.map((x) => x.element_id)));
      setCrear(new Set(p.nuevos.map((x) => x.element_id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la propuesta.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void traer(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [obra.id]);

  const alterna = (set: Set<string>, poner: (s: Set<string>) => void, id: string) => {
    const copia = new Set(set);
    if (copia.has(id)) copia.delete(id); else copia.add(id);
    poner(copia);
  };

  const aplicar = async () => {
    if (!prop) return;
    setGuardando(true); setError(""); setHecho("");
    try {
      const r = await fusionarItemsDeLaObra(obra.id, {
        ligar: prop.parejas.filter((p) => ligar.has(p.element_id)).map((p) => ({ element_id: p.element_id, item_id: p.item_id })),
        crear: prop.nuevos.filter((n) => crear.has(n.element_id)).map((n) => n.element_id),
      });
      setHecho(
        `Quedaron ${r.ligados} pieza${r.ligados === 1 ? "" : "s"} colgada${r.ligados === 1 ? "" : "s"} de su ítem` +
        (r.creados ? ` y ${r.creados} ítem${r.creados === 1 ? "" : "s"} nuevo${r.creados === 1 ? "" : "s"}, sin precio todavía.` : "."),
      );
      await traer();
      alTerminar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar.");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <p className="text-xs text-ink-muted mt-2">Viendo qué se parece a qué…</p>;
  if (error && !prop) return <p className="text-xs text-mauve-900 mt-2">{error}</p>;
  if (!prop) return null;

  const nadaQueHacer = prop.parejas.length === 0 && prop.nuevos.length === 0;

  return (
    <div className="mt-3 border-t border-black/5 pt-3">
      {nadaQueHacer ? (
        <p className="text-xs text-ink-muted">
          Todas las piezas del plano ya están colgadas de su ítem.
          {prop.sueltos.length > 0 && (
            <> Quedan {prop.sueltos.length} ítem{prop.sueltos.length === 1 ? "" : "es"} sin ubicar en el plano; eso se hace en quell101, poniendo el punto en el dibujo.</>
          )}
        </p>
      ) : (
        <>
          <p className="text-xs text-ink-muted mb-2">
            Esto es una propuesta: nada se guarda hasta que le piques a aplicar. Quita la
            palomita de lo que no cuadre.
          </p>

          {prop.parejas.length > 0 && (
            <>
              <h4 className="text-xs font-medium text-ink-dim mb-1">Se parecen — se colgarían del mismo ítem</h4>
              <ul className="mb-3 space-y-1">
                {prop.parejas.map((p) => (
                  <li key={p.element_id} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      aria-label={`Juntar ${p.pieza} con ${p.item_nombre}`}
                      checked={ligar.has(p.element_id)}
                      onChange={() => alterna(ligar, setLigar, p.element_id)}
                      className="mt-0.5"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="text-ink-dim">{p.codigo ? `${p.codigo} · ` : ""}{p.pieza}</span>
                      <span className="text-ink-muted"> → </span>
                      <span className="text-ink-dim">{p.item_nombre}</span>
                      <span className="text-ink-muted"> · {pesos(p.monto)}</span>
                      <span className="text-ink-muted"> · se parecen por {p.por === "codigo" ? "código" : "nombre"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {prop.nuevos.length > 0 && (
            <>
              <h4 className="text-xs font-medium text-ink-dim mb-1">Están en el plano y no en el proyecto</h4>
              <p className="text-[11px] text-ink-muted mb-1">
                Se les crea su ítem, <b>sin precio</b>: una pieza del plano no trae cuánto cuesta. Salen
                como cotizados y no mueven el monto de venta hasta que les pongas precio.
              </p>
              <ul className="mb-3 space-y-1">
                {prop.nuevos.map((n) => (
                  <li key={n.element_id} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      aria-label={`Crear ítem para ${n.pieza}`}
                      checked={crear.has(n.element_id)}
                      onChange={() => alterna(crear, setCrear, n.element_id)}
                      className="mt-0.5"
                    />
                    <span className="flex-1 min-w-0 text-ink-dim">
                      {n.codigo ? `${n.codigo} · ` : ""}{n.pieza}
                      <span className="text-ink-muted"> · {n.tipo}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <button
            type="button"
            onClick={aplicar}
            disabled={guardando || (ligar.size === 0 && crear.size === 0)}
            className="bg-ink text-white text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40"
          >
            {crear.size > 0 ? <IconPlus size={13} /> : <IconCheck size={13} />}
            {guardando ? "Juntando…" : `Aplicar (${ligar.size + crear.size})`}
          </button>
        </>
      )}

      {prop.sueltos.length > 0 && !nadaQueHacer && (
        <p className="text-[11px] text-ink-muted mt-2">
          Y {prop.sueltos.length} ítem{prop.sueltos.length === 1 ? "" : "es"} del proyecto todavía no
          está{prop.sueltos.length === 1 ? "" : "n"} en el plano.{" "}
          <a href={urlObra(obra)} target="_blank" rel="noreferrer" className="text-marca hover:underline inline-flex items-center gap-0.5">
            Ubicarlos en quell101 <IconExternalLink size={11} />
          </a>
        </p>
      )}

      {hecho && <p className="text-xs text-mint-900 mt-2">{hecho}</p>}
      {error && <p className="text-xs text-mauve-900 mt-2">{error}</p>}
    </div>
  );
}
