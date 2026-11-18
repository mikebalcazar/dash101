"use client";

/* Un pago del estado de cuenta, abierto: su detalle, sus facturas y las que se
 * le pueden ligar · contrato 0.107.0.
 *
 * Mike, 18-nov-2026: «NECESITO PODER LIGAR LOS PAGOS CARGADOS NUEVOS CON LAS
 * FACTURAS EXISTENTES. Así poder ver la factura o el movimiento en detalle si
 * doy clic sobre él. Esto dentro del estado de cuenta de un proyecto.»
 *
 * Las que se proponen las ordena la API: primero las del RFC del cliente del
 * proyecto, luego por cercanía de fecha. Ligar aplica lo que la API dice en
 * `aplica` —lo que le falta a la factura o al pago, lo que sea menos— y la
 * API le reparte al pago SU PARTE del IVA de la factura, a prorrata. Aquí no
 * se suma nada.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IconExternalLink, IconFileDownload, IconLink, IconUnlink, IconX } from "@tabler/icons-react";
import { desligarCfdi, facturasDelPago, ligaDelXml, ligarCfdi, type FacturaDeUnPago, type FacturaPosible, type FacturasDelPago } from "@/lib/fiscal";
import { nombreDeFactura, type PagoDelEstado } from "@/lib/estado-proyecto";
import { formatMontoExact } from "@/lib/format";

const fecha = (iso: string) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : "—");

function DatosDeFactura({ f }: { f: FacturaDeUnPago | FacturaPosible }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-ink-dim">
        <span className="font-medium">{nombreDeFactura(f)}</span>
        <span className="text-ink-muted"> · {fecha(f.fecha)}</span>
      </p>
      <p className="text-[11px] text-ink-muted truncate">{f.razon_social || "Sin razón social"}{f.rfc ? ` · ${f.rfc}` : ""}</p>
      <p className="text-[11px] text-ink-muted tabular-nums">
        {formatMontoExact(f.subtotal, "MXN")} + IVA {formatMontoExact(f.iva, "MXN")} = {formatMontoExact(f.total, "MXN")}
      </p>
      <p className="text-[10px] text-ink-muted font-mono break-all">{f.uuid}</p>
    </div>
  );
}

export function PagoYFacturas({ pago, alCambiar, alCerrar }: { pago: PagoDelEstado; alCambiar: () => void; alCerrar: () => void }) {
  const [d, setD] = useState<FacturasDelPago | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [quitar, setQuitar] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try { setD(await facturasDelPago(pago.id)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudieron leer las facturas."); }
  }, [pago.id]);

  useEffect(() => { void cargar(); }, [cargar]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") alCerrar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [alCerrar]);

  const ligar = async (f: FacturaPosible) => {
    setOcupado(f.id); setError("");
    try { await ligarCfdi(f.id, pago.id, f.aplica); await cargar(); alCambiar(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo ligar."); }
    finally { setOcupado(null); }
  };

  const desligar = async (f: FacturaDeUnPago) => {
    setOcupado(f.id); setError("");
    try { await desligarCfdi(f.id, pago.id); setQuitar(null); await cargar(); alCambiar(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo quitar la liga."); }
    finally { setOcupado(null); }
  };

  const m = d?.movimiento;

  return (
    <div className="fixed inset-0 z-40 print:hidden" role="dialog" aria-modal="true" aria-label="El pago y sus facturas">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/30" onClick={alCerrar} />
      <aside data-panel-pago={pago.id}
        className="absolute right-0 top-0 h-full w-full max-w-md bg-white overflow-y-auto shadow-xl p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ink-muted">{fecha(pago.fecha)}{pago.cuenta_nombre ? ` · ${pago.cuenta_nombre}` : ""}</p>
            <h2 className="text-base font-medium text-ink-dim">{pago.descripcion || "Pago"}</h2>
          </div>
          <button type="button" aria-label="Cerrar" onClick={alCerrar} className="text-ink-muted hover:text-ink-dim p-1"><IconX size={16} /></button>
        </div>

        {/* El dinero del pago: lo que cuenta en el estado de cuenta (sin IVA)
            y lo que tocó el banco. */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { que: "Sin IVA", cuanto: m?.subtotal ?? pago.sin_iva, dato: "sin-iva" },
            { que: "IVA", cuanto: m?.iva ?? pago.iva, dato: "iva" },
            { que: "En el banco", cuanto: m?.monto ?? pago.monto, dato: "banco" },
          ].map((k) => (
            <div key={k.que} className="bg-cream/60 rounded-xl p-2">
              <p className="text-[10px] text-ink-muted">{k.que}</p>
              <p className="text-sm font-medium tabular-nums text-ink-dim" data-pago-cifra={k.dato}>{formatMontoExact(k.cuanto, "MXN")}</p>
            </div>
          ))}
        </div>
        <Link href={`/movimientos/${pago.id}/editar`} data-abrir-movimiento
          className="text-xs text-ink-dim inline-flex items-center gap-1 hover:underline self-start">
          <IconExternalLink size={13} /> Abrir el movimiento
        </Link>

        <section>
          <h3 className="text-xs font-medium text-ink-dim mb-1.5">Sus facturas</h3>
          {!d ? <p className="text-xs text-ink-muted">Cargando…</p>
            : d.ligadas.length === 0
              ? <p className="text-xs text-ink-muted" data-sin-factura>Este pago todavía no tiene factura.</p>
              : (
                <ul className="divide-y divide-black/5">
                  {d.ligadas.map((f) => (
                    <li key={f.id} data-factura-ligada={f.id} className="py-2 flex flex-col gap-1.5">
                      <DatosDeFactura f={f} />
                      <p className="text-[11px] text-mint-900 tabular-nums">Cubre {formatMontoExact(f.monto_aplicado, "MXN")} de este pago</p>
                      <span className="flex gap-1.5 flex-wrap">
                        {f.tiene_xml && (
                          <a href={ligaDelXml(f.id)} className="border border-black/10 rounded-xl px-2.5 py-1 text-xs text-ink-dim inline-flex items-center gap-1">
                            <IconFileDownload size={13} /> XML
                          </a>
                        )}
                        {quitar === f.id
                          ? <>
                              <button type="button" data-quitar-liga-si disabled={ocupado !== null} onClick={() => void desligar(f)}
                                className="bg-mauve-900 text-cream rounded-xl px-2.5 py-1 text-xs font-medium disabled:opacity-50">
                                {ocupado === f.id ? "Quitando…" : "Sí, quitar la liga"}
                              </button>
                              <button type="button" onClick={() => setQuitar(null)} className="border border-black/10 rounded-xl px-2.5 py-1 text-xs text-ink-dim">No</button>
                            </>
                          : <button type="button" data-quitar-liga={f.id} onClick={() => setQuitar(f.id)}
                              className="border border-black/10 rounded-xl px-2.5 py-1 text-xs text-ink-dim inline-flex items-center gap-1">
                              <IconUnlink size={13} /> Quitar la liga
                            </button>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
        </section>

        {d && (d.movimiento.falta > 0.009 || d.ligadas.length === 0) && (
          <section>
            <h3 className="text-xs font-medium text-ink-dim mb-0.5">Ligar a una factura que ya existe</h3>
            <p className="text-[11px] text-ink-muted mb-1.5">
              Primero las de este cliente, luego por fecha. Al ligarla, el pago se lleva su parte del IVA de la factura.
            </p>
            {d.posibles.length === 0
              ? <p className="text-xs text-ink-muted" data-sin-posibles>No hay facturas con saldo por ligar. Cárgala en Fiscal y vuelve aquí.</p>
              : (
                <ul className="divide-y divide-black/5">
                  {d.posibles.map((f) => (
                    <li key={f.id} data-factura-posible={f.id} className="py-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <DatosDeFactura f={f} />
                        <p className="text-[11px] text-ink-muted tabular-nums">
                          {f.mismo_rfc && <span className="text-mint-900">Del cliente · </span>}
                          Le faltan {formatMontoExact(f.restante, "MXN")} por ligar
                        </p>
                      </div>
                      <button type="button" data-ligar-factura={f.id} disabled={ocupado !== null || f.aplica <= 0} onClick={() => void ligar(f)}
                        className="bg-ink text-cream rounded-xl px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1 flex-shrink-0 disabled:opacity-50">
                        <IconLink size={13} /> {ocupado === f.id ? "Ligando…" : `Ligar ${formatMontoExact(f.aplica, "MXN")}`}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        )}

        {error && <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>}
      </aside>
    </div>
  );
}
