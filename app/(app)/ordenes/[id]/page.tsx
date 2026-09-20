"use client";

/* Una orden, con toda su historia.
 *
 * La misma pantalla la abren dos personas distintas y ven cosas distintas:
 * quien la pidió puede corregirla si se la devolvieron; quien paga tiene los
 * tres botones. Quién es quién lo decide el servidor —esta pantalla sólo
 * pregunta si el buzón le contesta—, porque esto mueve dinero de verdad y un
 * botón escondido no es un permiso.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { listCuentas } from "@/lib/cuentas";
import { ErrorApi } from "@/lib/api/cliente";
import {
  corregirOrden, desglosar, devolverOrden, getBuzon, pagarOrden, rechazarOrden,
  subirArchivo, urlArchivo, verOrden,
  type ArchivoOrden, type EventoOrden, type Orden,
} from "@/lib/ordenes";
import { formatMontoExact } from "@/lib/format";
import { BOTON, CAJA, CAJA_NUM, Dinero, ETIQUETA, Estado, Vence } from "@/components/ordenes-ui";
import type { Cuenta } from "@/types/schema";
import { IconArrowLeft, IconFileText, IconPaperclip } from "@tabler/icons-react";

const QUE: Record<EventoOrden["que"], string> = {
  creada: "La pidió",
  devuelta: "La devolvió para corregir",
  corregida: "La corrigió y la volvió a mandar",
  pagada: "La pagó",
  rechazada: "La rechazó",
  contador: "Cambió quién puede pagar",
};

export default function OrdenPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const { activo } = useNegocioActivo();

  const [orden, setOrden] = useState<Orden | null>(null);
  const [eventos, setEventos] = useState<EventoOrden[]>([]);
  const [archivos, setArchivos] = useState<ArchivoOrden[]>([]);
  const [puedoPagar, setPuedoPagar] = useState(false);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState(params.get("aviso") ?? "");

  // lo que se está haciendo
  const [accion, setAccion] = useState<"" | "pagar" | "devolver" | "rechazar" | "corregir">("");
  const [cuentaId, setCuentaId] = useState("");
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [nota, setNota] = useState("");
  const [montoNuevo, setMontoNuevo] = useState("");
  const [conceptoNuevo, setConceptoNuevo] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await verOrden(id);
      setOrden(r.orden);
      setEventos(r.eventos);
      setArchivos(r.archivos);
      setMontoNuevo(String(r.orden.monto));
      setConceptoNuevo(r.orden.concepto);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
    try {
      await getBuzon();
      setPuedoPagar(true);
    } catch (e) {
      if (!(e instanceof ErrorApi && e.error === "sin_permiso")) throw e;
      setPuedoPagar(false);
    }
  }, [id]);

  useEffect(() => { void cargar(); }, [cargar]);

  useEffect(() => {
    if (!puedoPagar || !activo?.id) return;
    void (async () => {
      try { setCuentas(await listCuentas(activo.id!)); } catch { setCuentas([]); }
    })();
  }, [puedoPagar, activo]);

  const mia = !!orden && !!user && orden.solicitante_usuario_id === user.uid;
  const enBuzon = orden?.estado === "en_buzon";
  const desglosePropuesto = useMemo(() => desglosar(montoNuevo || 0), [montoNuevo]);

  const correr = async (fn: () => Promise<unknown>, despues?: string) => {
    setError("");
    setTrabajando(true);
    try {
      await fn();
      setAccion("");
      setNota("");
      setComprobante(null);
      if (despues) setAviso(despues);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setTrabajando(false);
    }
  };

  const pagar = () => correr(async () => {
    const r = await pagarOrden(id, { cuenta_id: cuentaId });
    if (comprobante) await subirArchivo("movimientos", r.movimiento.id, comprobante);
    setAviso(
      r.correo.enviado
        ? `Pagada. Se le avisó por correo a ${r.correo.para}.`
        : `Pagada. El correo no salió (${r.correo.motivo ?? "fuera de producción"}), que es lo normal fuera de producción.`,
    );
  });

  if (cargando) return <div className="text-sm text-ink-muted">Cargando…</div>;
  if (!orden) {
    return (
      <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
        <p className="text-sm font-medium text-ink-dim mb-1">No se encontró esta compra</p>
        {error && <p className="text-xs text-ink-muted">{error}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink-dim mb-3 transition"
      >
        <IconArrowLeft size={14} /> Volver
      </button>

      {aviso && (
        <div className="bg-mint-50 text-mint-900 text-xs px-3 py-2 rounded-xl mb-4">{aviso}</div>
      )}
      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">{error}</div>
      )}

      <div className="bg-white border border-black/5 rounded-2xl p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-medium text-ink-dim">{orden.concepto}</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              {orden.folio} · {orden.proveedor_nombre || "sin proveedor"}
            </p>
            <p className="text-xs mt-0.5"><Vence orden={orden} /></p>
          </div>
          <Dinero orden={orden} />
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Estado orden={orden} />
          {orden.urgente && (
            <span className="inline-block rounded-lg px-2 py-0.5 text-[11px] font-medium bg-mauve-50 text-mauve-900">
              Urgente
            </span>
          )}
          <span className="text-[11px] text-ink-muted">
            La pidió {orden.solicitante_nombre || orden.solicitante_correo || "alguien"}
          </span>
        </div>

        {orden.nota_contador && (
          <p className="mt-3 text-xs text-ink-dim bg-cream rounded-xl px-3 py-2">
            <span className="text-ink-muted">Nota de quien paga: </span>«{orden.nota_contador}»
          </p>
        )}
      </div>

      {archivos.length > 0 && (
        <div className="bg-white border border-black/5 rounded-2xl p-4 mb-4">
          <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">
            Cotización y comprobantes
          </h3>
          <div className="space-y-2">
            {archivos.map((a) => (
              <a
                key={a.id} href={urlArchivo(a.id)} target="_blank" rel="noreferrer"
                className="block"
              >
                {a.mime?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urlArchivo(a.id)} alt={a.nombre}
                    className="w-full rounded-xl border border-black/5"
                  />
                ) : (
                  <span className="flex items-center gap-2 text-sm text-ink-dim hover:underline">
                    <IconFileText size={16} /> {a.nombre}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Quien paga: los tres botones */}
      {puedoPagar && enBuzon && (
        <div className="bg-white border border-black/5 rounded-2xl p-4 mb-4">
          {accion === "" && (
            <div className="grid grid-cols-3 gap-2">
              <button className={BOTON} onClick={() => setAccion("pagar")}>Pagar</button>
              <button
                className="bg-cream hover:bg-black/5 text-ink-dim rounded-xl px-4 py-2.5 text-sm font-medium transition"
                onClick={() => setAccion("devolver")}
              >
                Devolver
              </button>
              <button
                className="bg-cream hover:bg-black/5 text-ink-dim rounded-xl px-4 py-2.5 text-sm font-medium transition"
                onClick={() => setAccion("rechazar")}
              >
                Rechazar
              </button>
            </div>
          )}

          {accion === "pagar" && (
            <div className="space-y-3">
              <div>
                <label className={ETIQUETA} htmlFor="cuenta">De qué cuenta sale</label>
                <select id="cuenta" className={CAJA} value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
                  <option value="">Escoge la cuenta</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} · {formatMontoExact(c.saldo_actual ?? 0, c.moneda)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={ETIQUETA} htmlFor="comprobante">Comprobante del pago</label>
                <label className="flex items-center gap-2 border border-dashed border-black/15 rounded-xl px-3 py-3 text-sm text-ink-muted cursor-pointer">
                  <IconPaperclip size={16} />
                  <span className="flex-1 truncate">{comprobante ? comprobante.name : "Foto o PDF (opcional)"}</span>
                  <input
                    id="comprobante" type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <p className="text-[11px] text-ink-muted">
                Al pagar se registra el egreso por {formatMontoExact(orden.monto, orden.moneda)} y se le avisa por
                correo a quien la pidió. No hay que capturar el movimiento aparte.
              </p>
              <div className="flex gap-2">
                <button className={`${BOTON} flex-1`} disabled={!cuentaId || trabajando} onClick={() => void pagar()}>
                  {trabajando ? "Pagando…" : "Registrar el pago"}
                </button>
                <button className="text-sm text-ink-muted px-3" onClick={() => setAccion("")}>Cancelar</button>
              </div>
            </div>
          )}

          {(accion === "devolver" || accion === "rechazar") && (
            <div className="space-y-3">
              <div>
                <label className={ETIQUETA} htmlFor="nota">
                  {accion === "devolver" ? "Qué hay que corregir" : "Por qué se rechaza"}
                </label>
                <textarea
                  id="nota" className={CAJA} rows={3} value={nota} onChange={(e) => setNota(e.target.value)}
                  placeholder={accion === "devolver" ? "Falta la cotización firmada" : "Ya se compró por otro lado"}
                />
                <p className="text-[11px] text-ink-muted mt-1">
                  Es obligatorio: una orden que vuelve sin decir por qué se vuelve a mandar igual.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className={`${BOTON} flex-1`} disabled={!nota.trim() || trabajando}
                  onClick={() => void correr(
                    () => (accion === "devolver" ? devolverOrden(id, nota) : rechazarOrden(id, nota)),
                    accion === "devolver" ? "Devuelta para corregir." : "Rechazada.",
                  )}
                >
                  {trabajando ? "Guardando…" : accion === "devolver" ? "Devolver" : "Rechazar"}
                </button>
                <button className="text-sm text-ink-muted px-3" onClick={() => setAccion("")}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quien la pidió: corregirla si se la devolvieron */}
      {mia && orden.estado === "devuelta" && (
        <div className="bg-white border border-black/5 rounded-2xl p-4 mb-4">
          {accion !== "corregir" ? (
            <button className={`${BOTON} w-full`} onClick={() => setAccion("corregir")}>
              Corregirla y volver a mandarla
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-ink-muted">
                Conserva el mismo folio y toda su historia: una orden corregida no es otra orden.
              </p>
              <div>
                <label className={ETIQUETA} htmlFor="concepto2">Qué se compra</label>
                <input
                  id="concepto2" className={CAJA} value={conceptoNuevo}
                  onChange={(e) => setConceptoNuevo(e.target.value)}
                />
              </div>
              <div>
                <label className={ETIQUETA} htmlFor="monto2">Cuánto es (total)</label>
                <input
                  id="monto2" className={CAJA_NUM} inputMode="decimal" value={montoNuevo}
                  onChange={(e) => setMontoNuevo(e.target.value)}
                />
                {orden.con_factura && (
                  <p className="text-[11px] text-ink-muted mt-1 tabular-nums">
                    Queda como {formatMontoExact(desglosePropuesto.subtotal)} + IVA{" "}
                    {formatMontoExact(desglosePropuesto.iva)}.
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  className={`${BOTON} flex-1`} disabled={trabajando || !conceptoNuevo.trim()}
                  onClick={() => void correr(
                    () => corregirOrden(id, { concepto: conceptoNuevo.trim(), monto: montoNuevo }),
                    "Corregida. Volvió al buzón con el mismo folio.",
                  )}
                >
                  {trabajando ? "Mandando…" : "Volver a mandarla"}
                </button>
                <button className="text-sm text-ink-muted px-3" onClick={() => setAccion("")}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}

      {orden.movimiento_id && (
        <div className="bg-white border border-black/5 rounded-2xl px-4 py-3 mb-4">
          <Link href="/movimientos" className="text-sm text-ink-dim hover:underline">
            El egreso quedó registrado en movimientos
          </Link>
        </div>
      )}

      <div className="bg-white border border-black/5 rounded-2xl p-4">
        <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">Su historia</h3>
        <ol className="space-y-2">
          {eventos.map((e) => (
            <li key={e.id} className="text-xs">
              <span className="text-ink-dim font-medium">{QUE[e.que] ?? e.que}</span>
              <span className="text-ink-muted"> · {e.quien_nombre || "alguien"} · {e.ts.slice(0, 16).replace("T", " ")}</span>
              {e.nota && <p className="text-ink-muted">«{e.nota}»</p>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
