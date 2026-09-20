"use client";

/* Quién puede pagar las compras.
 *
 * «Contador» es una etiqueta, no un rol: se le pone a quien sea, y el dueño y
 * el administrador se marcan los dos si los dos pagan. No se reusó
 * `ve_dinero` a propósito —esa marca dice quién VE cifras, no quién saca
 * dinero del banco—.
 *
 * Sólo el dueño reparte la etiqueta, y eso lo revisa el servidor: si contesta
 * que no, este bloque ni se pinta. Cada cambio deja renglón en la historia de
 * órdenes: quién marcó a quién y cuándo.
 */

import { useCallback, useEffect, useState } from "react";
import { ErrorApi } from "@/lib/api/cliente";
import { listContadores, marcarContador, type Contador } from "@/lib/ordenes";
import { IconCash } from "@tabler/icons-react";

const ROL: Record<string, string> = {
  owner: "dueño", admin: "administra", socio: "socio", staff: "del equipo", personal: "de la nómina",
};

export function Contadores() {
  const [filas, setFilas] = useState<Contador[]>([]);
  const [puedo, setPuedo] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [moviendo, setMoviendo] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setFilas(await listContadores());
      setPuedo(true);
    } catch (e) {
      if (e instanceof ErrorApi && e.error === "sin_permiso") setPuedo(false);
      else setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const cambiar = async (c: Contador) => {
    setError("");
    setMoviendo(c.usuario_id);
    try {
      await marcarContador(c.usuario_id, !c.es_contador);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setMoviendo("");
    }
  };

  if (!puedo || (cargando && filas.length === 0)) return null;

  const cuantos = filas.filter((f) => f.es_contador).length;

  return (
    <section className="mb-6">
      <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">
        Quién puede pagar las compras
      </h3>

      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-2">{error}</div>
      )}

      {cuantos === 0 && (
        <div className="bg-cream text-ink-muted text-xs px-3 py-2 rounded-xl mb-2">
          Nadie está marcado todavía: las compras que se pidan se van a quedar esperando en el buzón.
        </div>
      )}

      <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
        {filas.map((c) => (
          <div
            key={c.usuario_id}
            className="flex items-center gap-3 px-4 py-3 border-b border-black/5 last:border-b-0"
          >
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
              c.es_contador ? "bg-mint-50 text-mint-900" : "bg-cream text-ink-muted"
            }`}>
              <IconCash size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-dim truncate">{c.nombre}</p>
              <p className="text-[11px] text-ink-muted truncate">
                {c.correo || "sin correo"} · {ROL[c.rol] ?? c.rol}
              </p>
            </div>
            <button
              onClick={() => void cambiar(c)}
              disabled={moviendo === c.usuario_id}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                c.es_contador
                  ? "bg-cream text-ink-dim hover:bg-black/5"
                  : "bg-ink text-cream hover:bg-ink/90"
              }`}
            >
              {moviendo === c.usuario_id ? "…" : c.es_contador ? "Quitarle el permiso" : "Dejarlo pagar"}
            </button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink-muted mt-2">
        Quitarle la marca a alguien surte efecto al momento, aunque tenga el buzón abierto.
      </p>
    </section>
  );
}
