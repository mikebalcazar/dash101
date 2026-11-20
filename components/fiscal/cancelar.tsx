"use client";

/* Cancelar ante el SAT una factura timbrada desde aquí.
 *
 * Mike, 15-oct-2026: «un dropdown para cancelar, y dar en cancelar ya
 * seleccionado» (antes era un prompt con la clave a mano). El motivo viene
 * escogido (02 por omisión); con 01 se pide el folio fiscal que la sustituye. */

import { useState } from "react";
import { fis, folio, mensajeDe, pesos, type Fila } from "@/lib/bill";
import { B, B_MAL, CAJA, Campo, Dialogo, Err, Nota, useAvisa } from "./ui";

export const MOTIVOS_CANCELACION: [string, string][] = [
  ["02", "Comprobante emitido con errores sin relación (el más común)"],
  ["01", "Con errores con relación: la sustituye otra factura (se pide su folio fiscal)"],
  ["03", "No se llevó a cabo la operación"],
  ["04", "Operación nominativa relacionada en una factura global"],
];

export function DialogoCancelar({ f, alCerrar, despues }: { f: Fila; alCerrar: () => void; despues: () => void }) {
  const avisa = useAvisa();
  const [motivo, setMotivo] = useState("02");
  const [sustituto, setSustituto] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cancelar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const uuid = motivo === "01" ? sustituto.trim().toUpperCase() : null;
    if (motivo === "01" && !/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(uuid || "")) {
      setError("Con el motivo 01 va el folio fiscal (UUID) de la factura que la sustituye."); return;
    }
    setOcupado(true); setError("");
    try {
      const r = await fis(`/cfdi/${encodeURIComponent(f.id)}/cancelar`, { body: { motivo, uuid_sustituto: uuid } });
      alCerrar();
      avisa(r.estado === "cancelada" ? "Cancelada ante el SAT." : r.estado === "pendiente" ? "Pedida: el receptor tiene que aceptar la cancelación." : `El SAT no la canceló${r.mensaje ? `: ${r.mensaje}` : ""}.`, r.estado === "vigente");
      despues();
    } catch (e) { setError(mensajeDe(e)); } finally { setOcupado(false); }
  };

  return (
    <Dialogo alCerrar={alCerrar} data-dialogo-cancelar>
      <form onSubmit={cancelar} className="space-y-3">
        <div>
          <h3 className="text-base font-medium text-ink-dim">Cancelar ante el SAT</h3>
          <p className="text-xs text-ink-muted">{folio(f)} · {pesos(f.total)} · {f.razon_social || f.rfc || ""}</p>
        </div>
        <Campo e="Motivo">
          <select className={CAJA} value={motivo} onChange={(e) => setMotivo(e.target.value)} name="motivo" autoFocus>
            {MOTIVOS_CANCELACION.map(([k, n]) => <option key={k} value={k}>{k} · {n}</option>)}
          </select>
        </Campo>
        {motivo === "01" && (
          <Campo e="Folio fiscal (UUID) de la factura que la sustituye">
            <input className={CAJA} name="uuid_sustituto" value={sustituto} onChange={(e) => setSustituto(e.target.value)} placeholder="AAAAAAAA-0000-0000-0000-000000000000" autoCapitalize="characters" spellCheck={false} />
          </Campo>
        )}
        <Nota>Si el receptor tiene que aceptarla, quedará pendiente hasta que lo haga. Una cancelada no cuenta para los impuestos.</Nota>
        <Err>{error}</Err>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={B} onClick={alCerrar}>No, dejarla</button>
          <button type="submit" className={B_MAL} disabled={ocupado} data-ok>{ocupado ? "Cancelando…" : "Cancelar ante el SAT"}</button>
        </div>
      </form>
    </Dialogo>
  );
}
