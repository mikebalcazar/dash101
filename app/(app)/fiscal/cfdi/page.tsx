"use client";

/* Las facturas del mes: emitidas y recibidas, capturar una nueva y cancelar.
 *
 * Una factura cancelada NO se borra: sale del IVA del mes y se queda a la
 * vista, marcada. Borrarla dejaría un hueco que nadie sabe explicar tres
 * meses después.
 */

import { useCallback, useEffect, useState } from "react";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import {
  cancelarCfdi, crearCfdi, listCfdi, mesDeHoy, nombreDelMes,
  type Cfdi, type EstadoCfdi, type TipoCfdi,
} from "@/lib/fiscal";
import { formatMontoExact } from "@/lib/format";
import { AvisoFiscal, SelectorDeMes, TabsFiscal, bajarCsv } from "@/components/fiscal-ui";
import { BOTON, CAJA, CAJA_NUM, ETIQUETA } from "@/components/ordenes-ui";
import { IconDownload, IconPlus } from "@tabler/icons-react";

export default function CfdiPage() {
  const { activo } = useNegocioActivo();
  const [mes, setMes] = useState(mesDeHoy());
  const [tipo, setTipo] = useState<"" | TipoCfdi>("");
  const [estado, setEstado] = useState<"" | EstadoCfdi>("");
  const [filas, setFilas] = useState<Cfdi[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [capturando, setCapturando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setFilas(await listCfdi({ mes }, { tipo: tipo || undefined, estado: estado || undefined }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, [mes, tipo, estado]);

  useEffect(() => { void cargar(); }, [cargar]);

  const cancelar = async (c: Cfdi) => {
    if (!confirm(`¿Marcar cancelada la factura ${c.uuid}? Sale del IVA del mes y se queda a la vista.`)) return;
    try {
      await cancelarCfdi(c.id);
      setAviso("Quedó cancelada. Ya no cuenta en el IVA del mes.");
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  return (
    <div>
      <div className="flex justify-between items-baseline mb-4 gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">Facturas</h2>
          <p className="text-xs text-ink-muted mt-0.5">{nombreDelMes(mes)}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <SelectorDeMes mes={mes} alCambiar={setMes} />
          <button
            onClick={() => bajarCsv(`facturas-${mes}.csv`, [
              ["UUID", "Tipo", "RFC", "Razón social", "Fecha", "Subtotal", "IVA", "Retenciones", "Total", "Estado"],
              ...filas.map((f) => [f.uuid, f.tipo, f.rfc ?? "", f.razon_social ?? "", f.fecha,
                f.subtotal, f.iva, f.retenciones, f.total, f.estado]),
            ])}
            disabled={filas.length === 0}
            title="Bajar las facturas del mes en CSV"
            className="bg-white border border-black/5 rounded-xl px-3 text-ink-muted hover:text-ink-dim transition disabled:opacity-40"
          >
            <IconDownload size={16} />
          </button>
          <button
            onClick={() => setCapturando((v) => !v)}
            className="flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3 py-2 text-sm font-medium transition"
          >
            <IconPlus size={14} /> Capturar
          </button>
        </div>
      </div>

      <TabsFiscal />

      {error && <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">{error}</div>}
      {aviso && <div className="bg-mint-50 text-mint-900 text-xs px-3 py-2 rounded-xl mb-4">{aviso}</div>}

      {capturando && (
        <NuevaFactura
          negocioId={activo?.id ?? ""}
          alTerminar={async (m) => { setCapturando(false); setAviso(m); await cargar(); }}
        />
      )}

      <div className="flex gap-2 mb-3">
        <select
          className="bg-white border border-black/10 rounded-xl px-3 py-2 text-sm" value={tipo}
          onChange={(e) => setTipo(e.target.value as "" | TipoCfdi)} aria-label="Tipo"
        >
          <option value="">Emitidas y recibidas</option>
          <option value="ingreso">Emitidas (a clientes)</option>
          <option value="egreso">Recibidas (de proveedores)</option>
        </select>
        <select
          className="bg-white border border-black/10 rounded-xl px-3 py-2 text-sm" value={estado}
          onChange={(e) => setEstado(e.target.value as "" | EstadoCfdi)} aria-label="Estado"
        >
          <option value="">Vigentes y canceladas</option>
          <option value="vigente">Sólo vigentes</option>
          <option value="cancelada">Sólo canceladas</option>
        </select>
      </div>

      {cargando ? (
        <div className="text-sm text-ink-muted">Cargando…</div>
      ) : filas.length === 0 ? (
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-ink-dim mb-1">Sin facturas capturadas este mes</p>
          <p className="text-xs text-ink-muted">
            Las de los pagos que ya se hicieron se capturan más rápido desde «Falta la factura».
          </p>
        </div>
      ) : (
        <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
          {filas.map((f) => (
            <div key={f.id} className="flex items-start gap-3 px-4 py-3 border-b border-black/5 last:border-b-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-dim truncate">
                  {f.razon_social || f.rfc || "sin RFC"}
                </p>
                <p className="text-[11px] text-ink-muted truncate">
                  {f.uuid} · {f.fecha} · {f.tipo === "ingreso" ? "emitida" : "recibida"}
                </p>
                {f.estado === "cancelada" && (
                  <span className="inline-block rounded-lg px-2 py-0.5 text-[11px] font-medium bg-cream text-ink-muted mt-1">
                    Cancelada · no cuenta en el IVA
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-ink-dim tabular-nums">{formatMontoExact(f.total)}</p>
                <p className="text-[11px] text-ink-muted tabular-nums">IVA {formatMontoExact(f.iva)}</p>
                {f.estado === "vigente" && (
                  <button className="text-[11px] text-ink-muted underline" onClick={() => void cancelar(f)}>
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AvisoFiscal />
    </div>
  );
}

function NuevaFactura({
  negocioId, alTerminar,
}: { negocioId: string; alTerminar: (aviso: string) => Promise<void> }) {
  const [tipo, setTipo] = useState<TipoCfdi>("egreso");
  const [uuid, setUuid] = useState("");
  const [rfc, setRfc] = useState("");
  const [razon, setRazon] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
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
        negocio_id: negocioId, uuid, tipo, rfc: rfc || null, razon_social: razon || null,
        subtotal, iva, retenciones: retenciones || 0, total, fecha,
      });
      await alTerminar("Factura capturada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setGuardando(false);
    }
  };

  return (
    <div className="bg-white border border-black/5 rounded-2xl p-4 mb-4 space-y-3">
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
      <button className={`${BOTON} w-full`} disabled={!uuid.trim() || !negocioId || guardando} onClick={() => void guardar()}>
        {guardando ? "Guardando…" : "Guardar la factura"}
      </button>
    </div>
  );
}
