"use client";

/* Capturar una factura a mano, sin su XML. Es lo que dash101 ya tenía en
 * «Facturas → Capturar»: sirve cuando sólo se tiene el folio fiscal. Si
 * después se sube su XML, se completa sola sin duplicarse. */

import { useState } from "react";
import { crearCfdi, type TipoCfdi } from "@/lib/fiscal";
import { formatMontoExact } from "@/lib/format";
import { BOTON, CAJA, CAJA_NUM, ETIQUETA } from "@/components/ordenes-ui";
import { aDia } from "@/lib/api/adaptar";

export function CapturaAMano({ alTerminar }: { alTerminar: (aviso: string) => void | Promise<void> }) {
  const [tipo, setTipo] = useState<TipoCfdi>("egreso");
  const [uuid, setUuid] = useState("");
  const [rfc, setRfc] = useState("");
  const [razon, setRazon] = useState("");
  const [fecha, setFecha] = useState(aDia(new Date()));
  const [subtotal, setSubtotal] = useState("");
  const [iva, setIva] = useState("");
  const [retenciones, setRetenciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const num = (s: string) => Number(String(s).replace(/[\s$,]/g, "")) || 0;
  const total = num(subtotal) + num(iva) - num(retenciones);

  const guardar = async () => {
    setError("");
    setGuardando(true);
    try {
      await crearCfdi({
        uuid, tipo, rfc: rfc || null, razon_social: razon || null,
        subtotal, iva, retenciones: retenciones || 0, total, fecha,
      });
      await alTerminar("Factura capturada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setGuardando(false);
    }
  };

  return (
    <div className="bg-white border border-black/5 rounded-2xl p-4 mb-4 space-y-3" data-captura-a-mano>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={ETIQUETA} htmlFor="tipo">Qué factura es</label>
          <select id="tipo" className={CAJA} value={tipo} onChange={(e) => setTipo(e.target.value as TipoCfdi)}>
            <option value="egreso">Recibida, de un proveedor</option>
            <option value="ingreso">Emitida, a un cliente</option>
          </select>
        </div>
        <div>
          <label className={ETIQUETA} htmlFor="fecha">Fecha</label>
          <input id="fecha" type="date" className={CAJA} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </div>
      <div>
        <label className={ETIQUETA} htmlFor="uuid">Folio fiscal (UUID)</label>
        <input id="uuid" className={CAJA} value={uuid} onChange={(e) => setUuid(e.target.value)} placeholder="A1B2C3D4-…" />
        <p className="text-[11px] text-ink-muted mt-1">
          No se puede repetir en la empresa: capturar dos veces la misma factura es lo que más ensucia el IVA.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={ETIQUETA} htmlFor="rfc">RFC de la contraparte</label>
          <input id="rfc" className={CAJA} value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} />
        </div>
        <div>
          <label className={ETIQUETA} htmlFor="razon">Razón social</label>
          <input id="razon" className={CAJA} value={razon} onChange={(e) => setRazon(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className={ETIQUETA} htmlFor="sub">Subtotal</label>
          <input id="sub" className={CAJA_NUM} inputMode="decimal" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
        </div>
        <div>
          <label className={ETIQUETA} htmlFor="ivac">IVA</label>
          <input id="ivac" className={CAJA_NUM} inputMode="decimal" value={iva} onChange={(e) => setIva(e.target.value)} />
        </div>
        <div>
          <label className={ETIQUETA} htmlFor="ret">Retenciones</label>
          <input id="ret" className={CAJA_NUM} inputMode="decimal" value={retenciones} onChange={(e) => setRetenciones(e.target.value)} placeholder="0" />
        </div>
      </div>
      <p className="text-sm text-ink-dim tabular-nums">Total: {formatMontoExact(total)}</p>
      {error && <p className="text-[11px] text-mauve-900">{error}</p>}
      <button className={`${BOTON} w-full`} disabled={!uuid.trim() || guardando} onClick={() => void guardar()}>
        {guardando ? "Guardando…" : "Guardar la factura"}
      </button>
    </div>
  );
}
