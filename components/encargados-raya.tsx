"use client";

/* Quién lleva la raya.
 *
 * Es el gemelo de `Contadores`, y son dos etiquetas distintas a propósito:
 * pagarle a un proveedor y saber cuánto gana cada quien son dos cosas, y la
 * segunda es la que nadie quiere que ande suelta en una oficina chica.
 *
 * Sólo el dueño la reparte, y eso lo revisa el servidor: si contesta que no,
 * este bloque ni se pinta. Quitarla surte efecto al momento, aunque la
 * persona tenga la pantalla abierta.
 */

import { useCallback, useEffect, useState } from "react";
import { IconUserDollar } from "@tabler/icons-react";
import { ErrorApi } from "@/lib/api/cliente";
import { listEncargados, marcarEncargado, type EncargadoDeNomina } from "@/lib/nomina";

const ROL: Record<string, string> = {
  owner: "dueño", admin: "administra", socio: "socio", staff: "del equipo", personal: "de la nómina",
};

export function EncargadosDeRaya() {
  const [filas, setFilas] = useState<EncargadoDeNomina[]>([]);
  const [puedo, setPuedo] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [moviendo, setMoviendo] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setFilas(await listEncargados());
      setPuedo(true);
    } catch (e) {
      if (e instanceof ErrorApi && e.error === "sin_permiso") setPuedo(false);
      else setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  const cambiar = async (g: EncargadoDeNomina) => {
    setError("");
    setMoviendo(g.usuario_id);
    try {
      await marcarEncargado(
        g.personal_id ? { personal_id: g.personal_id } : { usuario_id: g.usuario_id },
        !g.es_nominas,
      );
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setMoviendo("");
    }
  };

  if (!puedo || (cargando && filas.length === 0)) return null;

  return (
    <section className="mb-6">
      <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">
        Quién lleva la raya
      </h3>

      {error && <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-2">{error}</div>}

      <div className="bg-cream text-ink-muted text-xs px-3 py-2 rounded-xl mb-2">
        Quien tenga esta marca ve <b>lo que gana cada quien</b> y puede pagar la raya. Tú entras
        aunque no la tengas, por ser el dueño.
      </div>

      <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
        {filas.map((g) => (
          <div key={g.usuario_id} className="flex items-center gap-3 px-4 py-3 border-b border-black/5 last:border-b-0">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
              g.es_nominas ? "bg-mint-50 text-mint-900" : "bg-cream text-ink-muted"
            }`}>
              <IconUserDollar size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-dim truncate">{g.nombre}</p>
              <p className="text-[11px] text-ink-muted truncate">
                {g.correo || "sin correo"} · {ROL[g.rol] ?? g.rol}
              </p>
            </div>
            <button
              onClick={() => void cambiar(g)}
              disabled={moviendo === g.usuario_id}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                g.es_nominas ? "bg-cream text-ink-dim hover:bg-black/5" : "bg-ink text-cream hover:bg-ink/90"
              }`}
            >
              {moviendo === g.usuario_id ? "…" : g.es_nominas ? "Quitarle el permiso" : "Dejarlo ver la raya"}
            </button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink-muted mt-2">
        Quitarle la marca a alguien surte efecto al momento, aunque tenga la pantalla abierta.
      </p>
    </section>
  );
}
