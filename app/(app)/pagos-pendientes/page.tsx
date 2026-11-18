"use client";

/* Lo que se les debe a los contratistas · contrato 0.105.0.
 *
 * Mike, 18-nov-2026: «vamos a poner en dash los pagos pendientes de cada
 * proyecto a cada contratista». Lo pendiente de un compromiso es lo acordado
 * menos lo pagado, y aquí sólo sale lo que todavía se debe; las fases del
 * cronograma de quell101 con contratista y costo entran igual que lo
 * capturado a mano. Lo arma la API (`/pagos-pendientes`): aquí no se suma.
 *
 * Arriba, a quién se le debe más, sumando todas las obras; abajo, obra por
 * obra, quién y por qué. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconCashBanknote } from "@tabler/icons-react";
import { pagosPendientes, type PagosPendientes } from "@/lib/conceptos";
import { formatMontoExact as formatMonto } from "@/lib/format";
import { formatDateShort } from "@/lib/format";
import { ErrorApi } from "@/lib/api/cliente";

export default function PagosPendientesPage() {
  const [d, setD] = useState<PagosPendientes | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    pagosPendientes()
      .then(setD)
      .catch((e) => setError(e instanceof ErrorApi && e.estado === 403
        ? "Lo que se les debe a los contratistas son costos: lo ven la dirección, la administración y los socios."
        : e instanceof Error ? e.message : "No se pudo leer"));
  }, []);

  if (error) return <p className="text-sm text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>;
  if (!d) return <p className="text-sm text-ink-muted">Cargando…</p>;

  return (
    <div className="max-w-4xl" data-pagos-pendientes>
      <div className="mb-5">
        <h2 className="text-lg font-medium text-ink-dim inline-flex items-center gap-2">
          <IconCashBanknote size={18} /> Por pagar a contratistas
        </h2>
        <p className="text-xs text-ink-muted mt-0.5">
          Lo acordado con cada contratista y proveedor en cada obra, menos lo que ya se le pagó. Sólo lo que falta.
        </p>
      </div>

      <div className="bg-cream rounded-3xl p-6 mb-4">
        <p className="text-xs text-ink-muted mb-1 font-medium">Se debe en total</p>
        <p data-total className="text-4xl font-medium tracking-tight text-ink-dim leading-none tabular-nums">{formatMonto(d.total, "MXN")}</p>
        <p className="text-xs text-ink-muted mt-2">
          {d.contratistas.length} contratista{d.contratistas.length === 1 ? "" : "s"} · {d.proyectos.length} obra{d.proyectos.length === 1 ? "" : "s"}
        </p>
      </div>

      {d.proyectos.length === 0 ? (
        <div className="bg-white border border-black/5 rounded-2xl p-8 text-center text-sm text-ink-muted">
          No se le debe nada a nadie. Los compromisos se capturan en cada proyecto, o salen de las fases del cronograma de quell101 con costo.
        </div>
      ) : (
        <>
          <h3 className="text-sm font-medium text-ink-dim mb-2">Por contratista</h3>
          <div className="bg-white border border-black/5 rounded-2xl overflow-hidden mb-5">
            <table className="w-full text-sm">
              <thead className="bg-cream/50 text-xs text-ink-muted uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Contratista</th>
                  <th className="text-right px-4 py-2 font-medium">Obras</th>
                  <th className="text-right px-4 py-2 font-medium">Se le debe</th>
                </tr>
              </thead>
              <tbody>
                {d.contratistas.map((c) => (
                  <tr key={c.clave} data-contratista={c.nombre} className="border-t border-black/5">
                    <td className="px-4 py-2.5 text-ink-dim">
                      {c.nombre}
                      {c.tipo && <span className="ml-1.5 text-[10px] px-1.5 py-px rounded-full bg-cream text-ink-muted align-middle">{c.tipo}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-ink-muted tabular-nums">{c.proyectos}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatMonto(c.pendiente, "MXN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-medium text-ink-dim mb-2">Por obra</h3>
          {d.proyectos.map((p) => (
            <div key={p.proyecto_id} data-obra={p.proyecto_id} className="bg-white border border-black/5 rounded-2xl p-4 mb-3">
              <div className="flex justify-between items-baseline gap-3 mb-2">
                <div className="min-w-0">
                  <Link href={`/proyectos/${p.proyecto_id}`} className="text-sm font-medium text-ink-dim hover:underline">{p.nombre}</Link>
                  {p.cliente_nombre && <span className="text-xs text-ink-muted"> · {p.cliente_nombre}</span>}
                </div>
                <span className="text-sm font-medium text-mauve-900 tabular-nums">{formatMonto(p.pendiente, "MXN")}</span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {p.contratistas.flatMap((c) => c.partidas.map((x, i) => (
                    <tr key={x.id} className="border-t border-black/5">
                      <td className="py-1.5 text-xs text-ink-dim">{i === 0 ? c.nombre : ""}</td>
                      <td className="py-1.5 text-xs text-ink-muted">
                        {x.concepto || "—"}
                        {x.del_cronograma && <span className="ml-1 text-[10px] px-1.5 py-px rounded-full bg-sky-50 text-sky-900">del cronograma</span>}
                      </td>
                      <td className="py-1.5 text-[11px] text-ink-muted tabular-nums hidden sm:table-cell">
                        {x.fecha_esperada ? formatDateShort(new Date(`${x.fecha_esperada}T12:00:00`)) : ""}
                      </td>
                      <td className="py-1.5 text-[11px] text-ink-muted text-right tabular-nums hidden sm:table-cell">
                        {formatMonto(x.pagado, "MXN")} de {formatMonto(x.acordado, "MXN")}
                      </td>
                      <td className="py-1.5 text-xs text-ink-dim text-right tabular-nums">{formatMonto(x.pendiente, "MXN")}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
