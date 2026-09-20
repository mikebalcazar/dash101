"use client";

/* Juntar dos clientes que son el mismo · contrato 0.23.0 de la suite.
 *
 * Mike, 20-sep: «Si por cualquier cosa se crean en 2 apps diferentes con un
 * nombre diferente, debería haber manera de ligarlo y fusionar los 2 clientes
 * en uno mismo para mejor control.»
 *
 * El que se queda es el que está abierto en pantalla; el que se escoge aquí
 * desaparece y le deja todo. Se dice qué se va a mover ANTES, se pide
 * confirmar, y al terminar se dice qué se movió: es una operación que no se
 * deshace, y quien la hace tiene derecho a saber qué pasó con su información.
 */

import { useEffect, useState } from "react";
import { IconArrowMerge, IconAlertTriangle } from "@tabler/icons-react";
import { fusionarClientes, listClientes } from "@/lib/clientes";
import type { Cliente } from "@/types/schema";

export function FusionarCliente({
  cliente,
  negocioId,
  onFusionado,
}: {
  cliente: Cliente;
  negocioId: string;
  onFusionado: () => void;
}) {
  const [otros, setOtros] = useState<Cliente[]>([]);
  const [seVa, setSeVa] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState("");

  useEffect(() => {
    let vivo = true;
    listClientes(negocioId)
      .then((cs) => { if (vivo) setOtros(cs.filter((c) => c.id !== cliente.id)); })
      .catch(() => { if (vivo) setOtros([]); });
    return () => { vivo = false; };
  }, [negocioId, cliente.id]);

  if (otros.length === 0) return null;

  const elegido = otros.find((c) => c.id === seVa);

  const fusionar = async () => {
    if (!seVa) return;
    setError(""); setTrabajando(true);
    try {
      const movidos = await fusionarClientes(cliente.id!, seVa);
      const partes = Object.entries(movidos)
        .filter(([, n]) => n > 0)
        .map(([que, n]) => `${n} ${que}`);
      setHecho(
        partes.length
          ? `Listo: se movieron ${partes.join(", ")} a ${cliente.nombre}.`
          : `Listo: «${elegido?.nombre}» no tenía nada colgando y desapareció.`,
      );
      setSeVa(""); setConfirmar(false);
      setOtros((prev) => prev.filter((c) => c.id !== seVa));
      onFusionado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo fusionar.");
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div className="mt-8 pt-6 border-t border-black/5">
      <h3 className="text-xs font-medium text-ink-dim uppercase tracking-wide mb-2">
        ¿Está repetido?
      </h3>
      <p className="text-xs text-ink-muted mb-3">
        Si el mismo cliente se capturó dos veces —una en dash101 y otra en quote101, por
        ejemplo—, júntalos. El que escojas desaparece y le deja a <strong>{cliente.nombre}</strong>{" "}
        sus proyectos, sus ítems, sus cotizaciones y sus pagos.
      </p>

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Cliente repetido"
          value={seVa}
          onChange={(e) => { setSeVa(e.target.value); setConfirmar(false); setHecho(""); }}
          className="flex-1 min-w-[12rem] bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
        >
          <option value="">— El mismo cliente, capturado aparte —</option>
          {otros.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        {!confirmar ? (
          <button
            type="button"
            onClick={() => setConfirmar(true)}
            disabled={!seVa}
            className="border border-black/15 rounded-xl px-3 py-2 text-sm text-ink-dim inline-flex items-center gap-1.5 disabled:opacity-40 hover:bg-white transition"
          >
            <IconArrowMerge size={14} />
            Juntarlos
          </button>
        ) : (
          <button
            type="button"
            onClick={fusionar}
            disabled={trabajando}
            className="bg-ink text-cream rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-40 transition"
          >
            {trabajando ? "Juntando…" : "Sí, juntarlos"}
          </button>
        )}
      </div>

      {confirmar && elegido && (
        <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl mt-2 inline-flex items-start gap-1.5">
          <IconAlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            «{elegido.nombre}» va a desaparecer y todo lo suyo va a quedar en «{cliente.nombre}».
            Esto no se deshace.
          </span>
        </p>
      )}

      {hecho && <p className="text-xs text-mint-900 bg-mint-50 px-3 py-2 rounded-xl mt-2">{hecho}</p>}
      {error && <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl mt-2">{error}</p>}
    </div>
  );
}
