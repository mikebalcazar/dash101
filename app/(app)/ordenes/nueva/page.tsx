"use client";

/* Pedir una compra.
 *
 * Pensada para el teléfono: una columna, campos grandes, y el total primero
 * —que es lo único que la persona trae en la cabeza cuando abre esto parada
 * en una ferretería—.
 *
 * El desglose se propone con la MISMA fórmula que la suite (se parte del
 * total hacia atrás), y sólo se manda si se tocó. Si no se toca, lo calcula
 * el servidor: así hay una sola fórmula en la plataforma y la pantalla nunca
 * guarda un subtotal que no cuadre con el total.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { listProveedores } from "@/lib/proveedores";
import { listProyectos } from "@/lib/proyectos";
import { SoltarArchivo } from "@/components/soltar-archivo";
import { crearOrden, desglosar, listPartidasDe, subirArchivo, type PartidaDeProyecto } from "@/lib/ordenes";
import { formatMontoExact } from "@/lib/format";
import { BOTON, CAJA, CAJA_NUM, ETIQUETA } from "@/components/ordenes-ui";
import type { Proveedor, Proyecto } from "@/types/schema";

const hoy = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function NuevaOrdenPage() {
  const router = useRouter();
  const { activo, loading: cargandoNegocio } = useNegocioActivo();

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [partidas, setPartidas] = useState<PartidaDeProyecto[]>([]);

  const [monto, setMonto] = useState("");
  const [proveedorId, setProveedorId] = useState("");
  const [proveedorNuevo, setProveedorNuevo] = useState("");
  const [concepto, setConcepto] = useState("");
  const [proyectoId, setProyectoId] = useState("");
  const [partidaId, setPartidaId] = useState("");
  const [fecha, setFecha] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [conFactura, setConFactura] = useState(true);
  const [subtotal, setSubtotal] = useState("");
  const [iva, setIva] = useState("");
  const [tocado, setTocado] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (cargandoNegocio || !activo?.id) return;
    void (async () => {
      try {
        const [pv, py] = await Promise.all([listProveedores(), listProyectos(activo.id!)]);
        setProveedores(pv);
        setProyectos(py);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    })();
  }, [activo, cargandoNegocio]);

  // Las partidas del proyecto escogido: a cuál de los compromisos que ya
  // existen va esta compra. Si a ninguno, se crea una nueva.
  useEffect(() => {
    setPartidaId("");
    if (!proyectoId) { setPartidas([]); return; }
    void (async () => {
      try { setPartidas(await listPartidasDe(proyectoId)); } catch { setPartidas([]); }
    })();
  }, [proyectoId]);

  // El desglose propuesto, que se recalcula mientras no se haya editado.
  const propuesto = useMemo(() => desglosar(monto || 0), [monto]);
  useEffect(() => {
    if (tocado) return;
    setSubtotal(propuesto.subtotal ? String(propuesto.subtotal) : "");
    setIva(propuesto.iva ? String(propuesto.iva) : "");
  }, [propuesto, tocado]);

  const cuadra = useMemo(() => {
    if (!conFactura || !tocado) return true;
    const s = Number(String(subtotal).replace(/[\s$,]/g, ""));
    const i = Number(String(iva).replace(/[\s$,]/g, ""));
    const t = Number(String(monto).replace(/[\s$,]/g, ""));
    if (!Number.isFinite(s) || !Number.isFinite(i) || !Number.isFinite(t)) return false;
    return Math.abs(s + i - t) < 0.005;
  }, [conFactura, tocado, subtotal, iva, monto]);

  const nombreProveedor = proveedorId
    ? proveedores.find((p) => p.id === proveedorId)?.nombre ?? ""
    : proveedorNuevo.trim();

  const listo = !!activo?.id && Number(String(monto).replace(/[\s$,]/g, "")) > 0
    && concepto.trim().length > 0 && cuadra && !guardando;

  const guardar = async () => {
    if (!activo?.id) return;
    setError("");
    setGuardando(true);
    try {
      const o = await crearOrden({
        negocio_id: activo.id,
        proveedor_id: proveedorId || null,
        proveedor_nombre: nombreProveedor || null,
        proyecto_id: proyectoId || null,
        partida_id: partidaId || null,
        concepto: concepto.trim(),
        monto,
        con_factura: conFactura,
        fecha_maxima_pago: fecha || null,
        urgente,
        ...(conFactura && tocado ? { subtotal, iva } : {}),
      });
      // La cotización se sube DESPUÉS: el archivo cuelga de la orden y hasta
      // aquí no había id del que colgarlo. Si la subida falla, la orden ya
      // está pedida —que es lo que importa— y se dice qué pasó.
      if (archivo) {
        try {
          await subirArchivo("ordenes", o.id, archivo);
        } catch (e) {
          router.push(`/ordenes/${o.id}?aviso=${encodeURIComponent(
            `La compra quedó pedida, pero la cotización no se subió: ${e instanceof Error ? e.message : "error"}`,
          )}`);
          return;
        }
      }
      router.push(`/ordenes/${o.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setGuardando(false);
    }
  };

  if (cargandoNegocio) return <div className="text-sm text-ink-muted">Cargando…</div>;
  if (!activo) {
    return (
      <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
        <p className="text-sm font-medium text-ink-dim mb-1">Sin negocio activo</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <div className="mb-5">
        <h2 className="text-lg font-medium text-ink-dim">Pedir una compra</h2>
        <p className="text-xs text-ink-muted mt-0.5">
          Le llega directo a quien paga. No hace falta que nadie la autorice antes.
        </p>
      </div>

      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">{error}</div>
      )}

      <div className="bg-white border border-black/5 rounded-2xl p-4 space-y-4">
        <div>
          <label className={ETIQUETA} htmlFor="monto">Cuánto es (total, con IVA si lleva)</label>
          <input
            id="monto" className={`${CAJA_NUM} text-lg`} inputMode="decimal" placeholder="0.00"
            value={monto} onChange={(e) => setMonto(e.target.value)}
          />
        </div>

        <div>
          <label className={ETIQUETA} htmlFor="concepto">Qué se compra</label>
          <input
            id="concepto" className={CAJA} placeholder="Triplay de 18 mm, 12 hojas"
            value={concepto} onChange={(e) => setConcepto(e.target.value)}
          />
        </div>

        <div>
          <label className={ETIQUETA} htmlFor="proveedor">A quién se le compra</label>
          <select id="proveedor" className={CAJA} value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
            <option value="">Otro (lo escribo)</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
          {!proveedorId && (
            <input
              className={`${CAJA} mt-2`} placeholder="Nombre del proveedor"
              value={proveedorNuevo} onChange={(e) => setProveedorNuevo(e.target.value)}
            />
          )}
        </div>

        <div>
          <label className={ETIQUETA} htmlFor="proyecto">Para qué proyecto (si es de uno)</label>
          <select id="proyecto" className={CAJA} value={proyectoId} onChange={(e) => setProyectoId(e.target.value)}>
            <option value="">Gasto general, no es de un proyecto</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>

        {proyectoId && (
          <div>
            <label className={ETIQUETA} htmlFor="partida">A qué compromiso del proyecto va</label>
            <select id="partida" className={CAJA} value={partidaId} onChange={(e) => setPartidaId(e.target.value)}>
              <option value="">Es una partida nueva</option>
              {partidas.filter((p) => p.estado !== "pagado").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.proveedor_nombre || "sin proveedor"} · {p.concepto || "sin concepto"} ·{" "}
                  {formatMontoExact(p.monto_acordado)} ({formatMontoExact(p.monto_pagado)} pagado)
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-muted mt-1">
              Si va a una partida que ya existe, el compromiso del proyecto no sube: ya estaba contado.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ETIQUETA} htmlFor="fecha">Cuándo se tiene que pagar</label>
            <input
              id="fecha" type="date" className={CAJA} min={hoy()}
              value={fecha} onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-ink-dim">
              <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} />
              Es urgente
            </label>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-ink-dim">
            <input type="checkbox" checked={conFactura} onChange={(e) => setConFactura(e.target.checked)} />
            Con factura
          </label>

          {conFactura && (
            <div className="mt-2 bg-cream rounded-xl p-3">
              <p className="text-[11px] text-ink-muted mb-2">
                Así queda separado. Se puede corregir si la factura trae otra tasa, retención o exento.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={ETIQUETA} htmlFor="subtotal">Subtotal</label>
                  <input
                    id="subtotal" className={CAJA_NUM} inputMode="decimal" value={subtotal}
                    onChange={(e) => { setTocado(true); setSubtotal(e.target.value); }}
                  />
                </div>
                <div>
                  <label className={ETIQUETA} htmlFor="iva">IVA</label>
                  <input
                    id="iva" className={CAJA_NUM} inputMode="decimal" value={iva}
                    onChange={(e) => { setTocado(true); setIva(e.target.value); }}
                  />
                </div>
              </div>
              {!cuadra && (
                <p className="text-[11px] text-mauve-900 mt-2">
                  El subtotal más el IVA tiene que dar el total exacto.
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          {/* El mismo control que en facturar: arrastrar, pegar o escoger,
              y ver la foto antes de mandarla. En el celular sigue abriendo
              la cámara, que es de donde sale casi siempre. */}
          <SoltarArchivo
            id="archivo"
            etiqueta="Foto o PDF de la cotización"
            acepta="image/*,application/pdf"
            archivo={archivo}
            alEscoger={setArchivo}
          />
        </div>

        <button className={`${BOTON} w-full`} disabled={!listo} onClick={() => void guardar()}>
          {guardando ? "Pidiendo…" : "Pedir la compra"}
        </button>
      </div>
    </div>
  );
}
