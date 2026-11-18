"use client";

/* El precio del proyecto: sus conceptos de cobro · contrato 0.105.0.
 *
 * Mike, 18-nov-2026: «Vamos a separar la contabilidad. Ya no va a ir ligada
 * a los ítems. Los precios de los proyectos se harán por aparte.» Con
 * botones: «Conceptos de cobro con opción a importar de las cotizaciones del
 * proyecto de quote»; «Un concepto por renglón. Si se importa una segunda
 * cotización del mismo proyecto, se debe ver que es una segunda cotización
 * pero suma»; y «Todos a cero de una vez»: mientras un proyecto no tenga
 * conceptos, dice «Precio por cargar» y no calcula saldo.
 *
 * Aquí no se suma el precio del proyecto: lo suma la API (y el importe de
 * cada concepto también). La pantalla agrupa lo que ya viene contado.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconFileImport, IconPencil, IconPlus, IconReceipt2, IconTrash } from "@tabler/icons-react";
import type { Proyecto } from "@/types/schema";
import {
  borrarConcepto, cambiarConcepto, cotizacionesParaImportar, crearConcepto, importarCotizacion, listarConceptos,
  type Concepto, type CotizacionParaImportar,
} from "@/lib/conceptos";
import { estadoDelProyecto, tituloDelGrupo } from "@/lib/estado-proyecto";
import { ErrorApi } from "@/lib/api/cliente";
import { formatMonto } from "@/lib/format";

type Form = { descripcion: string; cantidad: string; precio: string };
const vacio = (): Form => ({ descripcion: "", cantidad: "1", precio: "" });

interface Grupo { cotizacion_id: string | null; folio: string | null; nombre: string; numero: number | null; importe: number; conceptos: Concepto[] }

/** Agrupa como agrupa el estado de cuenta: cada cotización importada en el
 *  orden en que entró, y lo escrito a mano al final. */
export function agrupar(conceptos: Concepto[]): Grupo[] {
  const grupos: Grupo[] = [];
  const porCot = new Map<string, Grupo>();
  let aMano: Grupo | null = null;
  for (const c of conceptos) {
    let g: Grupo | null | undefined = c.cotizacion_id ? porCot.get(c.cotizacion_id) : aMano;
    if (!g) {
      g = c.cotizacion_id
        ? { cotizacion_id: c.cotizacion_id, folio: c.cotizacion_folio, nombre: c.cotizacion_nombre ?? "Cotización", numero: porCot.size + 1, importe: 0, conceptos: [] }
        : { cotizacion_id: null, folio: null, nombre: "Otros conceptos", numero: null, importe: 0, conceptos: [] };
      if (c.cotizacion_id) { porCot.set(c.cotizacion_id, g); grupos.push(g); } else aMano = g;
    }
    g.conceptos.push(c);
    g.importe = Math.round((g.importe + c.importe) * 100) / 100;
  }
  if (aMano) grupos.push(aMano);
  return grupos;
}

const mensaje = (e: unknown): string => {
  if (e instanceof ErrorApi) {
    const d = e.detalle as { motivo?: string } | undefined;
    if (e.error === "sin_precios") return "Esa cotización no trae el precio de sus renglones. Ábrela en quote101 y haz cualquier cambio para que lo mande.";
    if (e.error === "ya_importada") return "Esa cotización ya está en los conceptos.";
    if (d?.motivo) return d.motivo;
  }
  return e instanceof Error ? e.message : "No se pudo";
};

export function ConceptosDeCobro({ proyecto, alCambiar }: { proyecto: Proyecto; alCambiar: () => void }) {
  const [conceptos, setConceptos] = useState<Concepto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Form>(vacio());
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [cotizaciones, setCotizaciones] = useState<CotizacionParaImportar[] | null>(null);
  const [importando, setImportando] = useState<string | null>(null);
  const [reemplazar, setReemplazar] = useState<string | null>(null);
  const [anterior, setAnterior] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    if (!proyecto.id) return;
    try { setConceptos(await listarConceptos(proyecto.id)); }
    catch (e) { setError(mensaje(e)); }
    finally { setCargando(false); }
  }, [proyecto.id]);

  useEffect(() => { void cargar(); }, [cargar]);

  /* Mientras está por cargar, lo que decía antes del 18-nov sirve de
   * referencia («Antes: $X»). Sale del respaldo que hizo la API. */
  useEffect(() => {
    if (!proyecto.id || !proyecto.precio_por_cargar) { setAnterior(null); return; }
    estadoDelProyecto(proyecto.id).then((e) => setAnterior(e.totales.precio_anterior)).catch(() => setAnterior(null));
  }, [proyecto.id, proyecto.precio_por_cargar]);

  const grupos = useMemo(() => agrupar(conceptos), [conceptos]);
  const suma = useMemo(() => Math.round(conceptos.reduce((t, c) => t + c.importe * 100, 0)) / 100, [conceptos]);

  const listo = async (texto: string) => {
    await cargar();
    alCambiar();
    setAviso(texto);
    setTimeout(() => setAviso(""), 2500);
  };

  const guardar = async () => {
    setError("");
    const cantidad = parseFloat(form.cantidad);
    const precio = parseFloat(form.precio);
    if (!form.descripcion.trim()) { setError("Escribe qué se cobra."); return; }
    if (!Number.isFinite(cantidad) || cantidad <= 0) { setError("La cantidad tiene que ser mayor que cero."); return; }
    if (!Number.isFinite(precio)) { setError("Di el precio unitario, en pesos."); return; }
    setGuardando(true);
    try {
      if (editando) await cambiarConcepto(editando, { descripcion: form.descripcion, cantidad, precio_unitario: precio });
      else await crearConcepto(proyecto.id!, { descripcion: form.descripcion, cantidad, precio_unitario: precio });
      setForm(vacio()); setEditando(null); setAbierto(false);
      await listo(editando ? "Concepto guardado" : "Concepto agregado");
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (c: Concepto) => {
    if (!confirm(`¿Quitar «${c.descripcion}» (${formatMonto(c.importe, "MXN")}) del precio del proyecto?`)) return;
    setError("");
    try { await borrarConcepto(c.id); await listo("Concepto quitado"); }
    catch (e) { setError(mensaje(e)); }
  };

  const editar = (c: Concepto) => {
    setEditando(c.id);
    setForm({ descripcion: c.descripcion, cantidad: String(c.cantidad), precio: String(c.precio_unitario) });
    setAbierto(true);
    setError("");
  };

  const abrirImportar = async () => {
    setError("");
    if (cotizaciones) { setCotizaciones(null); return; }
    try { setCotizaciones(await cotizacionesParaImportar(proyecto.id!)); }
    catch (e) { setError(mensaje(e)); }
  };

  const importar = async (c: CotizacionParaImportar, otraVez: boolean) => {
    setError("");
    setImportando(c.id);
    try {
      const r = await importarCotizacion(proyecto.id!, c.id, otraVez);
      setReemplazar(null);
      setCotizaciones(await cotizacionesParaImportar(proyecto.id!));
      await listo(`${r.conceptos} concepto${r.conceptos === 1 ? "" : "s"} de «${c.nombre}»${otraVez ? " en lugar de los de antes" : ""}`);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setImportando(null);
    }
  };

  if (cargando) return null;
  const iva = proyecto.iva_incluido ? "IVA incluido" : "más IVA";

  return (
    <div data-conceptos className="bg-white border border-black/5 rounded-2xl p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-dim inline-flex items-center gap-1.5">
            <IconReceipt2 size={15} /> Precio del proyecto
          </p>
          <p className="text-xs text-ink-muted mt-0.5" data-conceptos-resumen>
            {conceptos.length === 0
              ? <>
                  <span className="text-mauve-900 font-medium">Precio por cargar.</span> Agrega lo que se le cobra al cliente, o impórtalo de sus cotizaciones de quote101.
                  {anterior !== null && <> Antes decía <span data-conceptos-anterior className="tabular-nums">{formatMonto(anterior, "MXN")}</span>.</>}
                </>
              : <>Suma de {conceptos.length} concepto{conceptos.length === 1 ? "" : "s"}: <span data-conceptos-total className="font-medium text-ink-dim tabular-nums">{formatMonto(suma, "MXN")}</span> {iva}.</>}
          </p>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <button type="button" data-conceptos-importar onClick={() => void abrirImportar()}
            className="text-xs border border-black/10 rounded-xl px-3 py-1.5 text-ink-dim inline-flex items-center gap-1">
            <IconFileImport size={13} /> Importar de quote
          </button>
          {!abierto && (
            <button type="button" data-conceptos-agregar
              onClick={() => { setEditando(null); setForm(vacio()); setAbierto(true); setError(""); }}
              className="text-xs border border-black/10 rounded-xl px-3 py-1.5 text-ink-dim inline-flex items-center gap-1">
              <IconPlus size={13} /> Concepto
            </button>
          )}
        </div>
      </div>

      {cotizaciones && (
        <div data-conceptos-cotizaciones className="bg-cream/60 rounded-xl p-3 mb-3">
          <p className="text-xs font-medium text-ink-dim mb-1.5">Cotizaciones de este proyecto en quote101</p>
          {cotizaciones.length === 0
            ? <p className="text-xs text-ink-muted">Este proyecto no tiene cotizaciones en quote101.</p>
            : (
              <ul className="divide-y divide-black/5">
                {cotizaciones.map((c) => (
                  <li key={c.id} data-cotizacion={c.id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm text-ink-dim">{c.nombre} {c.folio && <span className="text-[11px] text-ink-muted">· {c.folio}</span>}</p>
                      <p className="text-[11px] text-ink-muted">
                        {c.fuente
                          ? <>{c.renglones} renglón{c.renglones === 1 ? "" : "es"} · {formatMonto(c.subtotal, "MXN")} sin IVA{c.fuente === "piezas" && " · del precio de sus piezas aprobadas"}</>
                          : <>No trae precios: ábrela en quote101 y haz cualquier cambio para que los mande.</>}
                        {c.importados > 0 && <> · <span className="text-mint-900">ya importada</span></>}
                      </p>
                    </div>
                    {c.fuente && (c.importados === 0
                      ? <button type="button" data-importar={c.id} disabled={importando !== null} onClick={() => void importar(c, false)}
                          className="bg-ink text-cream rounded-xl px-3 py-1.5 text-xs font-medium disabled:opacity-50">
                          {importando === c.id ? "Importando…" : "Importar"}
                        </button>
                      : reemplazar === c.id
                        ? <span className="flex gap-1.5 items-center">
                            <span className="text-[11px] text-ink-muted">Se cambian sus {c.importados} conceptos por los de hoy.</span>
                            <button type="button" data-reemplazar={c.id} disabled={importando !== null} onClick={() => void importar(c, true)}
                              className="bg-ink text-cream rounded-xl px-3 py-1.5 text-xs font-medium disabled:opacity-50">
                              {importando === c.id ? "Importando…" : "Sí, otra vez"}
                            </button>
                            <button type="button" onClick={() => setReemplazar(null)} className="border border-black/10 rounded-xl px-3 py-1.5 text-xs text-ink-dim">No</button>
                          </span>
                        : <button type="button" data-otra-vez={c.id} onClick={() => setReemplazar(c.id)}
                            className="border border-black/10 rounded-xl px-3 py-1.5 text-xs text-ink-dim">
                            Volver a importar
                          </button>)}
                  </li>
                ))}
              </ul>
            )}
        </div>
      )}

      {grupos.map((g) => (
        <div key={g.cotizacion_id ?? "a-mano"} data-grupo={g.cotizacion_id ?? "a-mano"} className="mb-2">
          <div className="flex justify-between items-baseline text-xs text-ink-muted border-b border-black/5 pb-1 mb-1">
            <span className="font-medium text-ink-dim">{tituloDelGrupo(g)}</span>
            <span className="tabular-nums">{formatMonto(g.importe, "MXN")}</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {g.conceptos.map((c) => (
                <tr key={c.id} data-concepto={c.id}>
                  <td className="py-1 text-xs text-ink-dim">{c.descripcion}</td>
                  <td className="py-1 text-[11px] text-ink-muted text-right tabular-nums whitespace-nowrap">
                    {c.cantidad} × {formatMonto(c.precio_unitario, "MXN")}
                  </td>
                  <td className="py-1 pl-3 text-xs text-ink-dim text-right tabular-nums whitespace-nowrap">{formatMonto(c.importe, "MXN")}</td>
                  <td className="py-1 text-right whitespace-nowrap w-14">
                    <button type="button" aria-label="Editar" onClick={() => editar(c)} className="text-ink-muted hover:text-ink-dim p-1"><IconPencil size={13} /></button>
                    <button type="button" aria-label="Quitar" data-concepto-borrar onClick={() => void borrar(c)} className="text-ink-muted hover:text-mauve-900 p-1"><IconTrash size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {abierto && (
        <form data-conceptos-form className="mt-3 grid gap-2 sm:grid-cols-[1fr_6rem_9rem_auto] items-end"
          onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
          <label className="text-xs text-ink-muted">
            Concepto
            <input data-concepto-descripcion type="text" maxLength={160} value={form.descripcion} placeholder="Cocina integral, anticipo de obra…"
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              className="mt-1 block w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm text-ink" />
          </label>
          <label className="text-xs text-ink-muted">
            Cantidad
            <input data-concepto-cantidad type="number" min={0} step="any" value={form.cantidad}
              onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
              className="mt-1 block w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm text-ink" />
          </label>
          <label className="text-xs text-ink-muted">
            Precio unitario
            <input data-concepto-precio type="number" step="0.01" value={form.precio} placeholder="0.00"
              onChange={(e) => setForm({ ...form, precio: e.target.value })}
              className="mt-1 block w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm text-ink" />
          </label>
          <div className="flex gap-1.5">
            <button type="submit" data-concepto-guardar disabled={guardando}
              className="bg-ink text-cream rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-50">
              {guardando ? "Guardando…" : editando ? "Guardar" : "Agregar"}
            </button>
            <button type="button" onClick={() => { setAbierto(false); setEditando(null); setError(""); }}
              className="border border-black/10 rounded-xl px-3 py-2 text-sm text-ink-dim">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {aviso && <p data-conceptos-aviso className="text-xs text-mint-900 bg-mint-50 px-3 py-2 rounded-xl mt-2">{aviso}</p>}
      {error && <p data-conceptos-error className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl mt-2">{error}</p>}
    </div>
  );
}
