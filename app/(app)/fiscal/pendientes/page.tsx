"use client";

/* Lo que falta facturar, de los dos lados.
 *
 * Es la lista que hay que perseguir cada mes, y por eso trae el folio de la
 * orden y con quién fue: sin eso no se sabe a quién marcarle.
 *
 * Y es la razón entera de que no haya dos contabilidades: la factura casi
 * siempre llega DESPUÉS del movimiento, así que aquí se captura y se le
 * cuelga al que ya existe. No se crea otro.
 *
 * Desde el 20-sep también trae los COBROS que faltan facturar, que fue lo que
 * pidió Mike. Antes no podían salir: la espera de la factura se leía de la
 * orden de compra, y un cobro al cliente no tiene orden de compra.
 *
 * Los dos lados se pintan aparte a propósito. No es adorno: de un cobro sale
 * el IVA que TRASLADAS y de un pago el que ACREDITAS, y son los dos números
 * que deciden cuánto enteras. Revueltos, una equivocación al capturar se ve
 * igual que un acierto. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { crearCfdi, ligarCfdi, listPendientes, type PendienteDeFactura } from "@/lib/fiscal";
import { desglosar } from "@/lib/ordenes";
import { formatMontoExact } from "@/lib/format";
import { AvisoFiscal, TabsFiscal, bajarCsv } from "@/components/fiscal-ui";
import { CAJA, CAJA_NUM, BOTON, ETIQUETA } from "@/components/ordenes-ui";
import { IconDownload, IconCheck } from "@tabler/icons-react";

export default function PendientesPage() {
  const { activo } = useNegocioActivo();
  const [filas, setFilas] = useState<PendienteDeFactura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [abierta, setAbierta] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setFilas(await listPendientes(activo?.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, [activo]);

  useEffect(() => { void cargar(); }, [cargar]);

  const cobros = useMemo(() => filas.filter((f) => f.tipo === 'ingreso'), [filas]);
  const pagos = useMemo(() => filas.filter((f) => f.tipo !== 'ingreso'), [filas]);
  const suma = (xs: PendienteDeFactura[]) => xs.reduce((s, f) => s + f.monto, 0);

  return (
    <div>
      <div className="flex justify-between items-baseline mb-4 gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">Falta la factura</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Cobros que falta facturar y pagos cuyo CFDI no ha llegado.
          </p>
        </div>
        <button
          onClick={() => bajarCsv("pendientes-de-factura.csv", [
            ["Tipo", "Folio", "Con quién", "Fecha", "Monto"],
            ...filas.map((f) => [
              f.tipo === "ingreso" ? "Cobro" : "Pago",
              f.orden_folio ?? "",
              f.orden_proveedor ?? f.contraparte_nombre ?? "",
              f.fecha, f.monto,
            ]),
          ])}
          disabled={filas.length === 0}
          title="Bajar la lista en CSV"
          className="bg-white border border-black/5 rounded-xl px-3 py-2 text-ink-muted hover:text-ink-dim transition disabled:opacity-40 shrink-0"
        >
          <IconDownload size={16} />
        </button>
      </div>

      <TabsFiscal />

      {error && <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">{error}</div>}
      {aviso && <div className="bg-mint-50 text-mint-900 text-xs px-3 py-2 rounded-xl mb-4">{aviso}</div>}

      {cargando ? (
        <div className="text-sm text-ink-muted">Cargando…</div>
      ) : filas.length === 0 ? (
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <IconCheck size={22} className="text-mint-900 mx-auto mb-2" />
          <p className="text-sm font-medium text-ink-dim mb-1">No falta ninguna factura</p>
          <p className="text-xs text-ink-muted">Todo lo que lleva factura, de los dos lados, ya la tiene capturada.</p>
        </div>
      ) : (
        <>
          {([
            ["Cobros que falta facturar", cobros, "Tú se la debes al cliente. De aquí sale el IVA que trasladas.", "cobro", "cobros"],
            ["Pagos cuya factura no llega", pagos, "Te la deben. De aquí sale el IVA que acreditas.", "pago", "pagos"],
          ] as const).map(([titulo, grupo, pie, uno, varios]) =>
            grupo.length === 0 ? null : (
              <section key={titulo} className="mb-5">
                <div className="bg-white border border-black/5 rounded-2xl px-4 py-3 mb-3">
                  <p className="text-[11px] text-ink-muted">{titulo}</p>
                  <p className="text-lg font-medium text-ink-dim tabular-nums">{formatMontoExact(suma(grupo))}</p>
                  <p className="text-[11px] text-ink-muted">
                    {grupo.length} {grupo.length === 1 ? uno : varios} · {pie}
                  </p>
                </div>

                <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
                  {grupo.map((f) => (
                    <div key={f.id} className="px-4 py-3 border-b border-black/5 last:border-b-0">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink-dim truncate">
                            {f.orden_proveedor || f.contraparte_nombre ||
                              (f.tipo === "ingreso" ? "sin cliente" : "sin proveedor")}
                          </p>
                          <p className="text-[11px] text-ink-muted truncate">
                            {f.orden_folio ?? "sin folio"} · {f.fecha} · {f.descripcion ?? ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium text-ink-dim tabular-nums">{formatMontoExact(f.monto)}</p>
                          <button
                            className="text-[11px] text-ink-muted underline"
                            onClick={() => setAbierta(abierta === f.id ? "" : f.id)}
                          >
                            {abierta === f.id ? "Cerrar" : f.tipo === "ingreso" ? "Ya la facturé" : "Ya llegó la factura"}
                          </button>
                        </div>
                      </div>

                      {abierta === f.id && (
                        <CapturaDeFactura
                          pago={f}
                          negocioId={activo?.id ?? ""}
                          alTerminar={async (m) => { setAbierta(""); setAviso(m); await cargar(); }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ),
          )}
        </>
      )}

      <AvisoFiscal />
    </div>
  );
}

/** Capturar el CFDI que llegó tarde y colgárselo al pago que ya existía. Se
 *  propone el desglose al 16 % desde el total del pago: casi siempre es eso,
 *  y si no, se corrige antes de guardar. */
function CapturaDeFactura({
  pago, negocioId, alTerminar,
}: {
  pago: PendienteDeFactura;
  negocioId: string;
  alTerminar: (aviso: string) => Promise<void>;
}) {
  const propuesto = useMemo(() => desglosar(pago.monto), [pago.monto]);
  const [uuid, setUuid] = useState("");
  const [rfc, setRfc] = useState("");
  const [fecha, setFecha] = useState(pago.fecha);
  const [subtotal, setSubtotal] = useState(String(propuesto.subtotal));
  const [iva, setIva] = useState(String(propuesto.iva));
  const [retenciones, setRetenciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    setError("");
    setGuardando(true);
    try {
      /* El tipo sale del movimiento, NO fijo en «egreso».
       *
       * Es lo que decide de qué lado cae el IVA: el de una factura de
       * ingreso se traslada —lo cobraste— y el de una de egreso se acredita
       * —lo pagaste—. Con el tipo equivocado, el IVA del mes sale mal en las
       * dos direcciones a la vez y con cara de correcto, y es el número que
       * se entera al SAT. Quedó fijo mientras esta lista sólo podía traer
       * pagos; desde que trae cobros, tiene que seguir al movimiento. */
      const c = await crearCfdi({
        negocio_id: negocioId, uuid, tipo: pago.tipo, rfc: rfc || null,
        subtotal, iva, retenciones: retenciones || 0, total: pago.monto, fecha,
      });
      await ligarCfdi(c.id, pago.id);
      await alTerminar(
        pago.tipo === "ingreso"
          ? `La factura ${uuid.slice(0, 8)}… quedó colgada del cobro que ya existía. No se creó otro ingreso.`
          : `La factura ${uuid.slice(0, 8)}… quedó colgada del pago que ya existía. No se creó otro pago.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setGuardando(false);
    }
  };

  return (
    <div className="mt-3 bg-cream rounded-xl p-3 space-y-3">
      <div>
        <label className={ETIQUETA} htmlFor={`uuid-${pago.id}`}>Folio fiscal (UUID)</label>
        <input
          id={`uuid-${pago.id}`} className={CAJA} value={uuid} onChange={(e) => setUuid(e.target.value)}
          placeholder="A1B2C3D4-…"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={ETIQUETA} htmlFor={`rfc-${pago.id}`}>
            {pago.tipo === "ingreso" ? "RFC del cliente" : "RFC de quien factura"}
          </label>
          <input id={`rfc-${pago.id}`} className={CAJA} value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} />
        </div>
        <div>
          <label className={ETIQUETA} htmlFor={`fecha-${pago.id}`}>Fecha de la factura</label>
          <input id={`fecha-${pago.id}`} type="date" className={CAJA} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={ETIQUETA} htmlFor={`sub-${pago.id}`}>Subtotal</label>
          <input id={`sub-${pago.id}`} className={CAJA_NUM} inputMode="decimal" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
        </div>
        <div>
          <label className={ETIQUETA} htmlFor={`iva-${pago.id}`}>IVA</label>
          <input id={`iva-${pago.id}`} className={CAJA_NUM} inputMode="decimal" value={iva} onChange={(e) => setIva(e.target.value)} />
        </div>
        <div>
          <label className={ETIQUETA} htmlFor={`ret-${pago.id}`}>Retenciones</label>
          <input id={`ret-${pago.id}`} className={CAJA_NUM} inputMode="decimal" value={retenciones} onChange={(e) => setRetenciones(e.target.value)} placeholder="0" />
        </div>
      </div>
      <p className="text-[11px] text-ink-muted">
        El total de la factura se toma del {pago.tipo === "ingreso" ? "cobro" : "pago"}: {formatMontoExact(pago.monto)}.
      </p>
      {error && <p className="text-[11px] text-mauve-900">{error}</p>}
      <button className={`${BOTON} w-full`} disabled={!uuid.trim() || !negocioId || guardando} onClick={() => void guardar()}>
        {guardando ? "Guardando…" : `Guardar y colgarla del ${pago.tipo === "ingreso" ? "cobro" : "pago"}`}
      </button>
    </div>
  );
}
