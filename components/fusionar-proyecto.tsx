"use client";

/* Juntar dos proyectos que son el mismo · contrato 0.52.0 de la suite.
 *
 * Mike, 29-sep-2026: «No puedo fusionar el proyecto, solo el cliente. Y quiero
 * fusionar proyectos.» Le pasó con «Sanje CC37»: capturado dos veces, con 11
 * movimientos en uno, y con dinero no se borra.
 *
 * Misma forma que juntar clientes: el que se queda es el que está abierto en
 * pantalla; el que se escoge aquí desaparece y le deja todo. Antes de
 * confirmar se le pide a la API la cuenta en seco —cuántos ítems, pagos,
 * órdenes, cotizaciones y archivos se van a mover— y se enseña: es una
 * operación que no se deshace, y quien la hace tiene derecho a saber qué va a
 * pasar con su información antes de decir que sí.
 */

import { useEffect, useState } from "react";
import { IconArrowMerge, IconAlertTriangle } from "@tabler/icons-react";
import { fusionarProyectos, listProyectos } from "@/lib/proyectos";
import type { FusionDeProyectos } from "@/lib/api/escribir";
import type { Proyecto } from "@/types/schema";

const NOMBRES: Record<string, [string, string]> = {
  items: ["ítem", "ítems"],
  partidas: ["compromiso con proveedor", "compromisos con proveedor"],
  movimientos: ["movimiento de dinero", "movimientos de dinero"],
  ordenes: ["orden de compra", "órdenes de compra"],
  cotizaciones: ["cotización", "cotizaciones"],
  archivos: ["archivo", "archivos"],
  obras: ["obra de quell", "obras de quell"],
};
const enPalabras = (movidos: Record<string, number>) =>
  Object.entries(movidos)
    .filter(([, n]) => n > 0)
    .map(([que, n]) => `${n} ${(NOMBRES[que] ?? [que, que])[n === 1 ? 0 : 1]}`);

export function FusionarProyecto({
  proyecto,
  onFusionado,
}: {
  proyecto: Proyecto;
  onFusionado: () => void;
}) {
  const [otros, setOtros] = useState<Proyecto[]>([]);
  const [seVa, setSeVa] = useState("");
  const [ensayo, setEnsayo] = useState<FusionDeProyectos | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState("");

  useEffect(() => {
    let vivo = true;
    listProyectos()
      .then((ps) => { if (vivo) setOtros(ps.filter((p) => p.id !== proyecto.id)); })
      .catch(() => { if (vivo) setOtros([]); });
    return () => { vivo = false; };
  }, [proyecto.id]);

  if (otros.length === 0) return null;

  const elegido = otros.find((p) => p.id === seVa);

  const ensayar = async () => {
    if (!seVa) return;
    setError(""); setHecho(""); setTrabajando(true);
    try { setEnsayo(await fusionarProyectos(proyecto.id!, seVa, true)); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo revisar."); }
    finally { setTrabajando(false); }
  };

  const fusionar = async () => {
    if (!seVa) return;
    setError(""); setTrabajando(true);
    try {
      const r = await fusionarProyectos(proyecto.id!, seVa, false);
      const partes = enPalabras(r.movidos);
      setHecho(
        (partes.length
          ? `Listo: se movieron ${partes.join(", ")} a «${proyecto.nombre}».`
          : `Listo: «${elegido?.nombre}» no tenía nada colgando y desapareció.`)
        + (r.obra_suelta ? ` La obra de quell de «${elegido?.nombre}» quedó suelta, porque este proyecto ya tenía la suya.` : ""),
      );
      setSeVa(""); setEnsayo(null);
      setOtros((prev) => prev.filter((p) => p.id !== seVa));
      onFusionado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo fusionar.");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="mt-8 pt-6 border-t border-black/5" data-fusionar-proyecto>
      <h3 className="text-xs font-medium text-ink-dim uppercase tracking-wide mb-2">
        ¿Está repetido?
      </h3>
      <p className="text-xs text-ink-muted mb-3">
        Si el mismo proyecto se capturó dos veces —una en quote101 y otra aquí, por ejemplo—,
        júntalos. El que escojas desaparece y le deja a <strong>{proyecto.nombre}</strong> sus
        ítems, sus pagos, sus órdenes, sus cotizaciones, sus archivos y su obra de quell.
      </p>

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Proyecto repetido"
          value={seVa}
          onChange={(e) => { setSeVa(e.target.value); setEnsayo(null); setHecho(""); }}
          className="flex-1 min-w-[12rem] bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
        >
          <option value="">— El mismo proyecto, capturado aparte —</option>
          {otros.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}{p.cliente_nombre ? ` · ${p.cliente_nombre}` : ""}</option>
          ))}
        </select>
        {!ensayo ? (
          <button
            type="button"
            onClick={() => void ensayar()}
            disabled={!seVa || trabajando}
            data-ensayar-fusion-proyecto
            className="border border-black/15 rounded-xl px-3 py-2 text-sm text-ink-dim inline-flex items-center gap-1.5 disabled:opacity-40 hover:bg-white transition"
          >
            <IconArrowMerge size={14} />
            {trabajando ? "Revisando…" : "Juntarlos"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void fusionar()}
            disabled={trabajando}
            data-fusionar-proyecto-si
            className="bg-ink text-cream rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-40 transition"
          >
            {trabajando ? "Juntando…" : "Sí, juntarlos"}
          </button>
        )}
      </div>

      {ensayo && elegido && (
        <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl mt-2 inline-flex items-start gap-1.5" data-ensayo-fusion-proyecto>
          <IconAlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            «{elegido.nombre}» va a desaparecer.{" "}
            {enPalabras(ensayo.movidos).length
              ? `Se van a mover ${enPalabras(ensayo.movidos).join(", ")} a «${proyecto.nombre}».`
              : "No tiene nada colgando."}
            {ensayo.obra_suelta ? " Su obra de quell va a quedar suelta, porque este proyecto ya tiene la suya." : ""}{" "}
            Esto no se deshace.
          </span>
        </p>
      )}

      {hecho && <p className="text-xs text-mint-900 bg-mint-50 px-3 py-2 rounded-xl mt-2" data-fusion-proyecto-hecha>{hecho}</p>}
      {error && <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl mt-2">{error}</p>}
    </div>
  );
}
