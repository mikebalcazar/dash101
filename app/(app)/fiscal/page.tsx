"use client";

/* El IVA del mes, y lo facturado contra lo real.
 *
 * NO HAY DOS CONTABILIDADES: estos números salen de la misma lista de
 * movimientos que el resto de dash101, filtrada por «facturado». Por eso lo
 * facturado nunca puede ser mayor que lo real, y por eso la diferencia se
 * puede perseguir: son los mismos renglones.
 */

import { useCallback, useEffect, useState } from "react";
import { getCuadre, getIva, mesDeHoy, nombreDelMes, type Cuadre, type IvaDelMes } from "@/lib/fiscal";
import { formatMontoExact } from "@/lib/format";
import { AvisoFiscal, SelectorDeMes, TabsFiscal, bajarCsv } from "@/components/fiscal-ui";
import { IconDownload } from "@tabler/icons-react";

export default function FiscalPage() {
  const [mes, setMes] = useState(mesDeHoy());
  const [iva, setIva] = useState<IvaDelMes | null>(null);
  const [cuadre, setCuadre] = useState<Cuadre | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [i, c] = await Promise.all([getIva({ mes }), getCuadre({ mes })]);
      setIva(i);
      setCuadre(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, [mes]);

  useEffect(() => { void cargar(); }, [cargar]);

  const exportar = () => {
    if (!iva || !cuadre) return;
    bajarCsv(`fiscal-${mes}.csv`, [
      ["Reporte fiscal", nombreDelMes(mes)],
      [],
      ["IVA"],
      ["IVA que cobraste (trasladado)", iva.trasladado],
      ["IVA que pagaste (acreditable)", iva.acreditable],
      ["Retenciones", iva.retenciones],
      ["Diferencia a enterar", iva.a_enterar],
      [],
      ["Facturas del mes"],
      ["Emitidas", iva.facturas.emitidas],
      ["Recibidas", iva.facturas.recibidas],
      ["Canceladas", iva.facturas.canceladas],
      [],
      ["Lo facturado contra lo real"],
      ["", "Total", "Facturado", "Fuera"],
      ["Ingresos", cuadre.ingresos.total, cuadre.ingresos.facturado, cuadre.ingresos.fuera],
      ["Egresos", cuadre.egresos.total, cuadre.egresos.facturado, cuadre.egresos.fuera],
    ]);
  };

  const aFavor = (iva?.a_enterar ?? 0) < 0;

  return (
    <div>
      <div className="flex justify-between items-baseline mb-4 gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">Fiscal</h2>
          <p className="text-xs text-ink-muted mt-0.5">{nombreDelMes(mes)}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <SelectorDeMes mes={mes} alCambiar={setMes} />
          <button
            onClick={exportar}
            disabled={!iva}
            title="Bajar el mes en CSV"
            className="bg-white border border-black/5 rounded-xl px-3 text-ink-muted hover:text-ink-dim transition disabled:opacity-40"
          >
            <IconDownload size={16} />
          </button>
        </div>
      </div>

      <TabsFiscal />

      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">{error}</div>
      )}

      {cargando ? (
        <div className="text-sm text-ink-muted">Cargando…</div>
      ) : (
        <>
          <section className="bg-white border border-black/5 rounded-2xl p-4 mb-4">
            <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-3">
              El IVA del mes
            </h3>
            <dl className="space-y-2">
              <Renglon que="IVA que le cobraste a clientes" cuanto={iva?.trasladado ?? 0} />
              <Renglon que="IVA que les pagaste a proveedores" cuanto={iva?.acreditable ?? 0} />
              {(iva?.retenciones ?? 0) !== 0 && (
                <Renglon que="Retenciones" cuanto={iva?.retenciones ?? 0} />
              )}
              <div className="flex justify-between items-baseline border-t border-black/5 pt-2">
                <dt className="text-sm font-medium text-ink-dim">
                  {aFavor ? "Te queda a favor" : "Diferencia por enterar"}
                </dt>
                <dd className="text-lg font-medium text-ink-dim tabular-nums">
                  {formatMontoExact(Math.abs(iva?.a_enterar ?? 0))}
                </dd>
              </div>
            </dl>
            <p className="text-[11px] text-ink-muted mt-2">
              {iva?.facturas.emitidas ?? 0} emitidas · {iva?.facturas.recibidas ?? 0} recibidas
              {(iva?.facturas.canceladas ?? 0) > 0 && ` · ${iva?.facturas.canceladas} canceladas, que no cuentan`}
            </p>
          </section>

          <section className="bg-white border border-black/5 rounded-2xl p-4">
            <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
              Lo facturado contra lo real
            </h3>
            <p className="text-[11px] text-ink-muted mb-3">
              Lo de fuera no está mal por sí solo: es lo que no tiene factura y hay que saber que existe.
            </p>
            <Lado titulo="Lo que cobraste" lado={cuadre?.ingresos} />
            <div className="h-3" />
            <Lado titulo="Lo que pagaste" lado={cuadre?.egresos} />
          </section>

          <AvisoFiscal />
        </>
      )}
    </div>
  );
}

function Renglon({ que, cuanto }: { que: string; cuanto: number }) {
  return (
    <div className="flex justify-between items-baseline">
      <dt className="text-sm text-ink-muted">{que}</dt>
      <dd className="text-sm text-ink-dim tabular-nums">{formatMontoExact(cuanto)}</dd>
    </div>
  );
}

function Lado({ titulo, lado }: { titulo: string; lado?: { total: number; facturado: number; fuera: number } }) {
  const total = lado?.total ?? 0;
  const facturado = lado?.facturado ?? 0;
  const parte = total === 0 ? 0 : Math.min(100, Math.round((facturado / total) * 100));
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <p className="text-sm text-ink-dim">{titulo}</p>
        <p className="text-sm text-ink-dim tabular-nums">{formatMontoExact(total)}</p>
      </div>
      <div className="h-2 bg-cream rounded-full overflow-hidden">
        <div className="h-full bg-ink/70" style={{ width: `${parte}%` }} />
      </div>
      <p className="text-[11px] text-ink-muted mt-1 tabular-nums">
        {formatMontoExact(facturado)} facturado ({parte} %) · {formatMontoExact(lado?.fuera ?? 0)} fuera
      </p>
    </div>
  );
}
