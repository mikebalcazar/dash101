"use client";

/* La raya: los cortes de este negocio.
 *
 * Mike, 20-sep: «pon en la fila un administrador de nóminas», con el alcance
 * que él escogió —pagos de raya y recibos, no nómina calculada— y aquí
 * dentro, con permiso aparte.
 *
 * El permiso NO lo decide esta pantalla. Se pide la lista y, si la API
 * contesta 403, esta persona no lleva la raya: la respuesta de la API ES la
 * respuesta. Esconder el menú sería adornar; lo que cierra es el servidor.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconPlus, IconCash, IconLock } from "@tabler/icons-react";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { ErrorApi } from "@/lib/api/cliente";
import { listRayas, type Raya } from "@/lib/nomina";
import { formatMonto } from "@/lib/format";

const COLOR: Record<Raya["estado"], string> = {
  borrador: "bg-cream text-ink-dim",
  pagada: "bg-mint-50 text-mint-900",
  cancelada: "bg-mauve-50 text-mauve-900",
};

export default function NominaPage() {
  const { activo, loading: cargandoNegocio } = useNegocioActivo();
  const [filas, setFilas] = useState<Raya[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    if (!activo?.id) return;
    setCargando(true); setError(""); setSinPermiso(false);
    try {
      setFilas(await listRayas(activo.id));
    } catch (e) {
      if (e instanceof ErrorApi && e.error === "sin_permiso") setSinPermiso(true);
      else setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, [activo]);

  useEffect(() => { if (!cargandoNegocio) void cargar(); }, [cargandoNegocio, cargar]);

  if (sinPermiso) {
    return (
      <div className="max-w-lg">
        <h1 className="text-xl font-medium text-ink mb-3">Raya</h1>
        <div className="bg-white border border-black/5 rounded-2xl p-5">
          <p className="text-sm font-medium text-ink-dim mb-1.5 inline-flex items-center gap-1.5">
            <IconLock size={15} /> Esto lo lleva alguien más
          </p>
          <p className="text-xs text-ink-muted">
            Lo que gana cada quien no lo ve cualquiera. El permiso de raya lo reparte el dueño
            de la empresa, uno por uno, en «Quién lleva la raya».
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h1 className="text-xl font-medium text-ink">Raya</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Lo que se le paga a la gente, y su recibo. No calcula IMSS ni ISR: eso lo lleva tu
            contador.
          </p>
        </div>
        <Link
          href="/nomina/nueva"
          className="bg-ink text-cream rounded-xl px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5 flex-shrink-0"
        >
          <IconPlus size={15} />
          Nuevo corte
        </Link>
      </div>

      {error && <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl mb-3">{error}</p>}

      {cargando ? (
        <p className="text-sm text-ink-muted">Cargando…</p>
      ) : filas.length === 0 ? (
        <div className="bg-white border border-black/5 rounded-2xl p-8 text-center">
          <IconCash size={22} className="text-ink-muted mx-auto mb-2" />
          <p className="text-sm text-ink-dim">Todavía no hay ningún corte.</p>
          <p className="text-xs text-ink-muted mt-1">
            Un corte es una semana (o la quincena) con su gente y lo que se le paga a cada quien.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream/50 text-xs text-ink-muted uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Periodo</th>
                <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Gente</th>
                <th className="text-right px-4 py-2 font-medium">Total</th>
                <th className="text-left px-4 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.id} className="border-t border-black/5 hover:bg-cream/30">
                  <td className="px-4 py-2">
                    <Link href={`/nomina/${r.id}`} className="text-ink-dim hover:underline">
                      {r.periodo_inicio} a {r.periodo_fin}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-ink-muted hidden sm:table-cell">{r.personas ?? 0}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{formatMonto(r.total, "MXN")}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${COLOR[r.estado]}`}>{r.estado}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
