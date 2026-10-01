"use client";

/* El estado de cuenta de un cliente, como documento: lo usa la pantalla del
 * cliente (que desde el 1-oct-2026 abre con esto, no con el formulario de
 * editar) y la hoja aparte para imprimir. Mike, 1-oct: «ver su estado de
 * cuenta completo (todos los movimientos de ese cliente de todos sus
 * proyectos) y aparte poder ver por proyecto sus movimientos. Y debo poder
 * exportar su estado de cuenta general y por proyecto».
 *
 * El general se exporta de aquí (PDF por el navegador, Excel de la API); el
 * de cada proyecto, desde su propia hoja, a la que lleva cada renglón. */

import Link from "next/link";
import { IconFileInvoice, IconFileSpreadsheet } from "@tabler/icons-react";
import type { EstadoDeCuenta } from "@/lib/estado-cuenta";
import { formatMonto } from "@/lib/format";

const hoy = () =>
  new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });

export function DocumentoEstadoDeCuenta({ d }: { d: EstadoDeCuenta }) {
  const conMovimiento = d.proyectos.filter((p) => p.precio_venta !== 0 || p.cobrado !== 0);
  return (
    <>
      {/* ─── el documento ─── */}
      <article className="bg-white border border-black/5 rounded-2xl p-6 print:border-0 print:p-0 print:rounded-none">
        <header className="flex flex-wrap justify-between gap-4 pb-4 border-b border-black/10">
          <div>
            <h1 className="text-lg font-medium text-ink">Estado de cuenta</h1>
            <p className="text-sm text-ink-dim mt-1">{d.cliente.nombre}</p>
            <p className="text-xs text-ink-muted">
              {[d.cliente.rfc, d.cliente.correo, d.cliente.telefono].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <div className="text-right text-xs text-ink-muted">
            <p>Al {hoy()}</p>
          </div>
        </header>

        {/* El saldo global. Es lo primero que se busca al abrir el papel. */}
        <div className="grid grid-cols-3 gap-3 my-5 no-partir">
          {[
            { que: "Vendido", cuanto: d.totales.vendido, tono: "text-ink-dim" },
            { que: "Cobrado", cuanto: d.totales.cobrado, tono: "text-mint-900" },
            { que: "Saldo a favor de la empresa", cuanto: d.totales.saldo, tono: d.totales.saldo > 0 ? "text-mauve-900" : "text-ink-dim" },
          ].map((k) => (
            <div key={k.que} className="bg-cream/60 rounded-xl p-3 print:bg-transparent print:border print:border-black/15">
              <p className="text-[11px] text-ink-muted">{k.que}</p>
              <p className={`text-lg font-medium tabular ${k.tono}`}>{formatMonto(k.cuanto, "MXN")}</p>
            </div>
          ))}
        </div>

        {conMovimiento.length === 0 && d.otros_pagos.length === 0 ? (
          <p className="text-sm text-ink-muted">Este cliente todavía no tiene proyectos ni cobros.</p>
        ) : (
          <>
            <h2 className="text-sm font-medium text-ink-dim mb-2">Por proyecto</h2>
            <table className="w-full text-sm mb-5">
              <thead className="text-xs text-ink-muted uppercase tracking-wide border-b border-black/10">
                <tr>
                  <th className="text-left py-1.5 font-medium">Proyecto</th>
                  <th className="text-right py-1.5 font-medium">Vendido</th>
                  <th className="text-right py-1.5 font-medium">Cobrado</th>
                  <th className="text-right py-1.5 font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {conMovimiento.map((p) => (
                  <tr key={p.id} className="border-b border-black/5">
                    <td className="py-1.5 text-ink-dim">
                      {p.nombre}
                      <span className="text-ink-muted text-xs"> · {p.estado}{p.fecha_inicio ? ` · desde ${p.fecha_inicio}` : ""}</span>
                      {/* El de cada proyecto, con su PDF y su Excel, en su hoja. */}
                      <Link href={`/proyectos/${p.id}/estado-de-cuenta`} className="print:hidden ml-2 text-xs text-ink-muted hover:text-ink-dim inline-flex items-center gap-0.5" data-estado-proyecto={p.id}>
                        <IconFileSpreadsheet size={11} /> por proyecto
                      </Link>
                    </td>
                    <td className="py-1.5 text-right tabular">{formatMonto(p.precio_venta, "MXN")}</td>
                    <td className="py-1.5 text-right tabular text-mint-900">{formatMonto(p.cobrado, "MXN")}</td>
                    <td className="py-1.5 text-right tabular font-medium">{formatMonto(p.saldo, "MXN")}</td>
                  </tr>
                ))}
                {d.totales.sin_proyecto !== 0 && (
                  <tr className="border-b border-black/5">
                    <td className="py-1.5 text-ink-dim">
                      Pagos sin proyecto
                      <span className="text-ink-muted text-xs"> · anticipos y cobros sueltos</span>
                    </td>
                    <td className="py-1.5 text-right tabular text-ink-muted">—</td>
                    <td className="py-1.5 text-right tabular text-mint-900">{formatMonto(d.totales.sin_proyecto, "MXN")}</td>
                    <td className="py-1.5 text-right tabular font-medium">{formatMonto(-d.totales.sin_proyecto, "MXN")}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black/20 font-medium">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right tabular">{formatMonto(d.totales.vendido, "MXN")}</td>
                  <td className="py-2 text-right tabular">{formatMonto(d.totales.cobrado, "MXN")}</td>
                  <td className="py-2 text-right tabular">{formatMonto(d.totales.saldo, "MXN")}</td>
                </tr>
              </tfoot>
            </table>

            <h2 className="text-sm font-medium text-ink-dim mb-2">Los cobros, uno por uno</h2>
            {[...conMovimiento.map((p) => ({ titulo: p.nombre, pagos: p.pagos })),
              ...(d.otros_pagos.length ? [{ titulo: "Sin proyecto", pagos: d.otros_pagos }] : [])]
              .filter((g) => g.pagos.length > 0)
              .map((g) => (
                <div key={g.titulo} className="mb-4 hoja-bloque">
                  <p className="text-xs font-medium text-ink-dim mb-1">{g.titulo}</p>
                  <table className="w-full text-sm">
                    <tbody>
                      {g.pagos.map((c) => (
                        <tr key={c.id} className="border-b border-black/5">
                          <td className="py-1 text-ink-muted text-xs w-24">{c.fecha}</td>
                          <td className="py-1 text-ink-dim">
                            {c.descripcion || "Cobro"}
                            {c.cuenta_nombre ? <span className="text-ink-muted text-xs"> · {c.cuenta_nombre}</span> : null}
                          </td>
                          <td className="py-1 text-xs text-ink-muted">
                            {c.facturado ? (
                              <span className="inline-flex items-center gap-1 text-mint-900">
                                <IconFileInvoice size={11} />
                                {c.uuid_cfdi ? c.uuid_cfdi.slice(0, 8) : "facturado"}
                              </span>
                            ) : "sin factura"}
                          </td>
                          <td className="py-1 text-right tabular">{formatMonto(c.monto, "MXN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </>
        )}

        <footer className="text-[11px] text-ink-muted pt-4 border-t border-black/10 mt-4">
          Cifras en pesos mexicanos. El saldo es lo vendido menos lo cobrado a la fecha de este
          documento; no incluye lo que todavía no se ha vendido ni cotizaciones sin cerrar.
        </footer>
      </article>

    </>
  );
}
