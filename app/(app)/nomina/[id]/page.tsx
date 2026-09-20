"use client";

/* Un corte de raya: quién cobra, cuánto, y el recibo de cada quien.
 *
 * Pagar es lo que mueve dinero, y aquí eso se dice antes de que pase: un
 * egreso POR PERSONA, de la cuenta que se escoja, y no se puede deshacer
 * desde esta pantalla. Si después hay que corregirle a alguien, se corrige
 * SU MOVIMIENTO en la lista de movimientos —cancelar el corte no le
 * regresaría el dinero a la cuenta—.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconCash, IconPrinter, IconX } from "@tabler/icons-react";
import { listCuentas } from "@/lib/cuentas";
import type { Cuenta } from "@/types/schema";
import { cancelarRaya, getRaya, marcarRecibido, pagarRaya, type PagoDeRaya, type Raya } from "@/lib/nomina";
import { formatMonto } from "@/lib/format";

export default function RayaPage() {
  const { id } = useParams<{ id: string }>();
  const [raya, setRaya] = useState<Raya | null>(null);
  const [pagos, setPagos] = useState<PagoDeRaya[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cuentaId, setCuentaId] = useState("");
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [confirmar, setConfirmar] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    try {
      const r = await getRaya(id);
      setRaya(r.raya);
      setPagos(r.pagos);
      const cs = await listCuentas(r.raya.negocio_id);
      setCuentas(cs);
      if (!cuentaId && cs[0]?.id) setCuentaId(cs[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el corte.");
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { void cargar(); }, [cargar]);

  const pagar = async () => {
    if (!cuentaId) return;
    setTrabajando(true); setError("");
    try {
      const r = await pagarRaya(id, cuentaId);
      setRaya(r.raya); setPagos(r.pagos); setConfirmar(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo pagar.");
    } finally {
      setTrabajando(false);
    }
  };

  const cancelar = async () => {
    setTrabajando(true); setError("");
    try { setRaya(await cancelarRaya(id)); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo cancelar."); }
    finally { setTrabajando(false); }
  };

  const recibido = async (pago: PagoDeRaya) => {
    setError("");
    try {
      const p = await marcarRecibido(pago.id, !pago.recibido_at);
      setPagos((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar.");
    }
  };

  if (cargando) return <p className="text-sm text-ink-muted">Cargando…</p>;
  if (!raya) return <p className="text-sm text-mauve-900">{error || "Ese corte ya no existe."}</p>;

  const enBorrador = raya.estado === "borrador";

  return (
    <div className="max-w-3xl">
      <Link href="/nomina" className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim print:hidden">
        <IconArrowLeft size={13} /> Volver
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-medium text-ink">Raya del {raya.periodo_inicio} al {raya.periodo_fin}</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            {pagos.length} persona{pagos.length === 1 ? "" : "s"} · {formatMonto(raya.total, "MXN")}
            {raya.estado === "pagada" && raya.cuenta_nombre ? ` · salió de ${raya.cuenta_nombre}` : ""}
            {raya.nota ? ` · ${raya.nota}` : ""}
          </p>
        </div>
        <button type="button" onClick={() => window.print()}
          className="bg-white border border-black/10 text-ink-dim text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1.5 print:hidden">
          <IconPrinter size={14} /> Imprimir los recibos
        </button>
      </div>

      <div className="bg-white border border-black/5 rounded-2xl overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead className="bg-cream/50 text-xs text-ink-muted uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Quién</th>
              <th className="text-right px-4 py-2 font-medium hidden sm:table-cell">Sueldo</th>
              <th className="text-right px-4 py-2 font-medium hidden sm:table-cell">Extras</th>
              <th className="text-right px-4 py-2 font-medium hidden sm:table-cell">Descuentos</th>
              <th className="text-right px-4 py-2 font-medium">Neto</th>
              <th className="text-left px-4 py-2 font-medium">Recibí</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((p) => (
              <tr key={p.id} className="border-t border-black/5">
                <td className="px-4 py-2 text-ink-dim">
                  {p.nombre}
                  <span className="text-ink-muted text-xs block">{p.concepto}</span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-muted hidden sm:table-cell">{formatMonto(p.sueldo, "MXN")}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-muted hidden sm:table-cell">{formatMonto(p.extras, "MXN")}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-muted hidden sm:table-cell">{formatMonto(p.descuentos, "MXN")}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">{formatMonto(p.neto, "MXN")}</td>
                <td className="px-4 py-2">
                  {/* La firma se marca cuando de verdad la hay, y se puede
                      quitar: se palomea por error más seguido de lo que uno
                      cree, y un recibo «firmado» que nadie firmó es justo lo
                      que no sirve en una aclaración. */}
                  <label className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                    <input type="checkbox" checked={!!p.recibido_at} onChange={() => recibido(p)}
                      aria-label={`Recibido por ${p.nombre}`} />
                    <span className="print:hidden">{p.recibido_at ? "firmado" : "falta"}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl mb-3">{error}</p>}

      {enBorrador ? (
        <div className="bg-white border border-black/5 rounded-2xl p-4 print:hidden">
          <h2 className="text-sm font-medium text-ink-dim mb-1">Pagar el corte</h2>
          <p className="text-xs text-ink-muted mb-3">
            Deja <b>un movimiento de egreso por cada persona</b>, con su nombre, para que el
            estado de cuenta diga a quién se le pagó. <b>No se puede deshacer desde aquí</b>: si
            después hay que corregirle a alguien, se corrige su movimiento en Movimientos.
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <select aria-label="Cuenta de donde sale" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}
              className="flex-1 min-w-[12rem] bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40">
              <option value="">— De qué cuenta sale —</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} · {formatMonto(c.saldo_actual, c.moneda)}</option>
              ))}
            </select>
            {confirmar ? (
              <>
                <button type="button" onClick={pagar} disabled={trabajando || !cuentaId}
                  className="bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50">
                  <IconCash size={15} /> {trabajando ? "Pagando…" : `Sí, pagar ${formatMonto(raya.total, "MXN")}`}
                </button>
                <button type="button" onClick={() => setConfirmar(false)} className="text-xs text-ink-muted px-2">
                  Mejor no
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmar(true)} disabled={!cuentaId || pagos.length === 0}
                className="bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-40">
                <IconCash size={15} /> Pagar
              </button>
            )}
            <button type="button" onClick={cancelar} disabled={trabajando}
              className="text-xs text-ink-muted hover:text-mauve-900 inline-flex items-center gap-1 px-2 disabled:opacity-50">
              <IconX size={13} /> Cancelar el corte
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-muted print:hidden">
          {raya.estado === "pagada"
            ? "Este corte ya se pagó. Para corregirle a alguien, busca su movimiento en Movimientos: cancelar el corte no le regresaría el dinero a la cuenta."
            : "Este corte está cancelado. No movió dinero."}
        </p>
      )}
    </div>
  );
}
