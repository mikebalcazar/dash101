"use client";

/* El precio del proyecto: la hoja de su presupuesto · contrato 0.106.0.
 *
 * Mike, 18-nov-2026: «Vamos a separar la contabilidad. Ya no va a ir ligada
 * a los ítems.» Con botones: conceptos de cobro con opción a importar de las
 * cotizaciones de quote, un concepto por renglón, y todos los precios a cero
 * de una vez: sin conceptos, el proyecto dice «Precio por cargar».
 *
 * Y el mismo día, con botones otra vez: «Hoja dentro de dash»: el
 * presupuesto se edita en una cuadrícula como Sheets —Tab, Enter, flechas,
 * y pegar un rango copiado de Sheets o Excel—, el total de abajo es el precio
 * del proyecto, y las plantillas viven aquí. «Sólo existirán los conceptos
 * que se importen desde quote (…) y los que se agreguen manualmente en la
 * tabla de dash.»
 *
 * La hoja se edita en la pantalla y se guarda de un jalón (PUT
 * /proyectos/:id/conceptos): todo o nada, y la API suma el precio. Lo que se
 * lee de lo pegado y lo que se manda vive en `lib/hoja.ts`, medido sin
 * navegador.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconDeviceFloppy, IconFileImport, IconPlus, IconReceipt2, IconTemplate, IconTrash, IconX,
} from "@tabler/icons-react";
import type { Proyecto } from "@/types/schema";
import {
  borrarPlantilla, cotizacionesParaImportar, crearPlantilla, guardarHoja, importarCotizacion, listarConceptos, listarPlantillas,
  type Concepto, type CotizacionParaImportar, type Plantilla,
} from "@/lib/conceptos";
import { estadoDelProyecto } from "@/lib/estado-proyecto";
import { ErrorApi } from "@/lib/api/cliente";
import { formatMonto } from "@/lib/format";
import {
  COLUMNAS, claveNueva, esRango, filaVacia, huella, importeDe, leerPegado, numeroDeHoja, pegarRango, revisar, vacia,
  type Columna, type FilaDeHoja,
} from "@/lib/hoja";

/** «1 renglón», «4 renglones»: el plural pierde el acento. */
const renglones = (n: number) => `${n} ${n === 1 ? "renglón" : "renglones"}`;

const pesos = (v: number) => v.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const desdeConcepto = (c: Concepto): FilaDeHoja => ({
  clave: c.id, id: c.id, nombre: c.nombre, descripcion: c.descripcion, cantidad: String(c.cantidad), precio: pesos(c.precio_unitario),
  cotizacion_id: c.cotizacion_id, cotizacion_nombre: c.cotizacion_nombre, cotizacion_folio: c.cotizacion_folio,
});

/** Siempre queda un renglón en blanco al final, para seguir escribiendo. */
const conColita = (filas: FilaDeHoja[]): FilaDeHoja[] =>
  filas.length && vacia(filas[filas.length - 1]) && !filas[filas.length - 1].id ? filas : [...filas, filaVacia()];

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
    const d = e.detalle as { motivo?: string; renglon?: number; regla?: string } | undefined;
    if (e.error === "sin_precios") return "Esa cotización no trae el precio de sus renglones. Ábrela en quote101 y haz cualquier cambio para que lo mande.";
    if (e.error === "ya_importada") return "Esa cotización ya está en la hoja.";
    if (e.error === "otro_proyecto") return "La hoja cambió en otra pantalla. Descarta y vuelve a abrirla.";
    if (d?.renglon && d.regla) return `Renglón ${d.renglon}: ${d.regla}.`;
    if (d?.motivo) return d.motivo;
  }
  return e instanceof Error ? e.message : "No se pudo";
};

export function ConceptosDeCobro({ proyecto, alCambiar }: { proyecto: Proyecto; alCambiar: () => void }) {
  const [guardadas, setGuardadas] = useState<FilaDeHoja[]>([]);
  const [filas, setFilas] = useState<FilaDeHoja[]>([filaVacia()]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [marcada, setMarcada] = useState<{ fila: number; columna: Columna } | null>(null);
  const [aviso, setAviso] = useState("");
  const [cotizaciones, setCotizaciones] = useState<CotizacionParaImportar[] | null>(null);
  const [importando, setImportando] = useState<string | null>(null);
  const [reemplazar, setReemplazar] = useState<string | null>(null);
  const [plantillas, setPlantillas] = useState<Plantilla[] | null>(null);
  const [nombrePlantilla, setNombrePlantilla] = useState("");
  const [borrarPl, setBorrarPl] = useState<string | null>(null);
  const [anterior, setAnterior] = useState<number | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const irA = useRef<{ fila: number; columna: Columna } | null>(null);

  const cargar = useCallback(async () => {
    if (!proyecto.id) return;
    try {
      const desde = (await listarConceptos(proyecto.id)).map(desdeConcepto);
      setGuardadas(desde);
      setFilas(conColita(desde));
    } catch (e) { setError(mensaje(e)); }
    finally { setCargando(false); }
  }, [proyecto.id]);

  useEffect(() => { void cargar(); }, [cargar]);

  /* Mientras está por cargar, lo que decía antes del 18-nov sirve de
   * referencia («Antes decía $X»). Sale del respaldo que hizo la API. */
  useEffect(() => {
    if (!proyecto.id || !proyecto.precio_por_cargar) { setAnterior(null); return; }
    estadoDelProyecto(proyecto.id).then((e) => setAnterior(e.totales.precio_anterior)).catch(() => setAnterior(null));
  }, [proyecto.id, proyecto.precio_por_cargar]);

  const cambiada = useMemo(() => huella(filas) !== huella(guardadas), [filas, guardadas]);

  /* Irse con la hoja a medias pierde lo escrito: el navegador lo pregunta. */
  useEffect(() => {
    if (!cambiada) return;
    const antes = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", antes);
    return () => window.removeEventListener("beforeunload", antes);
  }, [cambiada]);

  /* Después de pintar, el foco va a donde lo mandó Enter o una flecha. */
  useEffect(() => {
    const d = irA.current;
    if (!d) return;
    irA.current = null;
    caja.current?.querySelector<HTMLElement>(`[data-fila="${d.fila}"][data-col="${d.columna}"]`)?.focus();
  });

  const suma = useMemo(() => Math.round(filas.reduce((t, f) => t + (importeDe(f.cantidad, f.precio) ?? 0) * 100, 0)) / 100, [filas]);
  const conteo = useMemo(() => filas.filter((f) => !(vacia(f) && !f.id)).length, [filas]);

  /* Número de cada cotización importada, en el orden en que aparece en la
   * hoja: el mismo que usa el estado de cuenta para decir «Cotización 2». */
  const numeroDeCot = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of guardadas) if (f.cotizacion_id && !m.has(f.cotizacion_id)) m.set(f.cotizacion_id, m.size + 1);
    return m;
  }, [guardadas]);

  const cambiar = (i: number, columna: Columna, valor: string) => {
    setMarcada(null);
    setFilas((prev) => conColita(prev.map((f, k) => (k === i ? { ...f, [columna]: valor } : f))));
  };

  const quitar = (i: number) => {
    setMarcada(null);
    setFilas((prev) => conColita(prev.filter((_, k) => k !== i)));
  };

  const mover = (i: number, columna: Columna, paso: number) => {
    const destino = i + paso;
    if (destino < 0) return;
    if (destino >= filas.length) {
      if (vacia(filas[i]) && !filas[i].id) return;
      setFilas((prev) => [...prev, filaVacia()]);
    }
    irA.current = { fila: destino, columna };
    if (destino < filas.length) caja.current?.querySelector<HTMLElement>(`[data-fila="${destino}"][data-col="${columna}"]`)?.focus();
  };

  const tecla = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, i: number, columna: Columna) => {
    if (e.key === "Enter") { e.preventDefault(); mover(i, columna, e.shiftKey ? -1 : 1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); mover(i, columna, 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); mover(i, columna, -1); }
  };

  const pegar = (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>, i: number, columna: Columna) => {
    const texto = e.clipboardData.getData("text/plain");
    if (!esRango(texto)) return;
    e.preventDefault();
    const rango = leerPegado(texto);
    setMarcada(null);
    // Los precios pegados se leen con sus comas, como al salir de una celda.
    setFilas((prev) => conColita(pegarRango(prev, i, columna, rango).map((f) => {
      const v = numeroDeHoja(f.precio);
      return v === null ? f : { ...f, precio: pesos(v) };
    })));
    avisar(`Se pegaron ${rango.filter((r) => r.some((c) => c)).length} renglones. Revisa y guarda.`, 3000);
  };

  /* Un precio se lee con sus comas al salir de la celda, como en Sheets. */
  const alSalir = (i: number, columna: Columna) => {
    if (columna !== "precio") return;
    const v = numeroDeHoja(filas[i].precio);
    if (v !== null && filas[i].precio !== pesos(v)) setFilas((prev) => prev.map((f, k) => (k === i ? { ...f, precio: pesos(v) } : f)));
  };

  /* Un solo reloj para el aviso. Con uno por aviso, el de «Hoja guardada»
   * borraba el siguiente («Plantilla … guardada») si llegaba antes de sus
   * 2.5 s: lo cachó la prueba de navegador del 18-nov. */
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avisar = (texto: string, ms = 2500) => {
    if (reloj.current) clearTimeout(reloj.current);
    setAviso(texto);
    reloj.current = setTimeout(() => setAviso(""), ms);
  };

  const guardar = async () => {
    setError("");
    const r = revisar(filas);
    if (!r.ok) {
      setMarcada({ fila: r.fila - 1, columna: r.columna });
      setError(`Renglón ${r.fila}: ${r.motivo}.`);
      irA.current = { fila: r.fila - 1, columna: r.columna };
      setFilas((prev) => [...prev]);
      return;
    }
    setGuardando(true);
    try {
      const g = await guardarHoja(proyecto.id!, r.renglones);
      const desde = g.conceptos.map(desdeConcepto);
      setGuardadas(desde);
      setFilas(conColita(desde));
      alCambiar();
      avisar(`Hoja guardada · ${desde.length} concepto${desde.length === 1 ? "" : "s"}`);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };

  const descartar = () => { setError(""); setMarcada(null); setFilas(conColita(guardadas)); };

  const abrirImportar = async () => {
    setError("");
    setPlantillas(null);
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
      await cargar();
      alCambiar();
      avisar(`${r.conceptos} concepto${r.conceptos === 1 ? "" : "s"} de «${c.nombre}»${otraVez ? " en lugar de los de antes" : ""}`);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setImportando(null);
    }
  };

  const abrirPlantillas = async () => {
    setError("");
    setCotizaciones(null);
    if (plantillas) { setPlantillas(null); return; }
    try { setPlantillas(await listarPlantillas()); }
    catch (e) { setError(mensaje(e)); }
  };

  /* Usar una plantilla llena la hoja —al final de lo que ya tiene— y no
   * guarda nada: se revisa y se guarda como cualquier otro cambio. */
  const usar = (p: Plantilla) => {
    setFilas((prev) => conColita([
      ...prev.filter((f) => !(vacia(f) && !f.id)),
      ...p.renglones.map((r) => ({ ...filaVacia(), clave: claveNueva(), nombre: r.nombre, descripcion: r.descripcion, cantidad: String(r.cantidad), precio: pesos(r.precio_unitario) })),
    ]));
    setPlantillas(null);
    avisar(`«${p.nombre}» está en la hoja. Revisa y guarda.`);
  };

  const guardarComoPlantilla = async () => {
    setError("");
    if (!nombrePlantilla.trim()) { setError("Ponle nombre a la plantilla."); return; }
    const r = revisar(filas);
    if (!r.ok) { setMarcada({ fila: r.fila - 1, columna: r.columna }); setError(`Renglón ${r.fila}: ${r.motivo}.`); return; }
    if (!r.renglones.length) { setError("La hoja está vacía: no hay qué guardar como plantilla."); return; }
    try {
      const p = await crearPlantilla(nombrePlantilla, r.renglones.map(({ nombre, descripcion, cantidad, precio_unitario }) => ({ nombre, descripcion, cantidad, precio_unitario })));
      setNombrePlantilla("");
      setPlantillas(await listarPlantillas());
      avisar(`Plantilla «${p.nombre}» guardada con ${renglones(p.renglones.length)}`);
    } catch (e) { setError(mensaje(e)); }
  };

  const quitarPlantilla = async (p: Plantilla) => {
    setError("");
    try { await borrarPlantilla(p.id); setBorrarPl(null); setPlantillas(await listarPlantillas()); }
    catch (e) { setError(mensaje(e)); }
  };

  if (cargando) return null;
  /* 0.107.0 · los conceptos son antes de IVA, siempre (Mike, 18-nov-2026). */
  const iva = "sin IVA";
  /* Sin `focus:bg-white`: el tema es vidrio oscuro y esa variante no la
   * cubre globals.css, así que la celda se ponía blanca con letra clara. */
  /** La raya de cada celda: separa las columnas, como en Sheets. */
  const raya = "border border-black/10";
  const celda = "w-full bg-transparent px-2 py-1.5 text-sm text-ink focus:outline-none focus:bg-white/10 focus:ring-2 focus:ring-marca/60 rounded-md";

  return (
    <div data-conceptos data-hoja className="bg-white border border-black/5 rounded-2xl p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-dim inline-flex items-center gap-1.5">
            <IconReceipt2 size={15} /> Precio del proyecto
          </p>
          <p className="text-xs text-ink-muted mt-0.5" data-conceptos-resumen>
            {guardadas.length === 0
              ? <>
                  <span className="text-mauve-900 font-medium">Precio por cargar.</span> Escribe el presupuesto en la hoja, pégalo de Sheets o Excel, o impórtalo de quote101.
                  {anterior !== null && <> Antes decía <span data-conceptos-anterior className="tabular-nums">{formatMonto(anterior, "MXN")}</span>.</>}
                </>
              : <>Suma de {guardadas.length} concepto{guardadas.length === 1 ? "" : "s"}{cambiada && " guardados"}: <span data-conceptos-total className="font-medium text-ink-dim tabular-nums">{formatMonto(proyecto.precio_venta, "MXN")}</span> {iva}.</>}
          </p>
        </div>
        <div className="flex gap-1.5 flex-shrink-0 flex-wrap">
          <button type="button" data-conceptos-importar onClick={() => void abrirImportar()} disabled={cambiada}
            title={cambiada ? "Guarda o descarta la hoja antes de importar" : undefined}
            className="text-xs border border-black/10 rounded-xl px-3 py-1.5 text-ink-dim inline-flex items-center gap-1 disabled:opacity-40">
            <IconFileImport size={13} /> Importar de quote
          </button>
          <button type="button" data-plantillas onClick={() => void abrirPlantillas()}
            className="text-xs border border-black/10 rounded-xl px-3 py-1.5 text-ink-dim inline-flex items-center gap-1">
            <IconTemplate size={13} /> Plantillas
          </button>
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
                          ? <>{renglones(c.renglones)} · {formatMonto(c.subtotal, "MXN")} sin IVA{c.fuente === "piezas" && " · del precio de sus piezas aprobadas"}</>
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

      {plantillas && (
        <div data-plantillas-caja className="bg-cream/60 rounded-xl p-3 mb-3">
          <p className="text-xs font-medium text-ink-dim mb-1.5">Plantillas de presupuesto</p>
          {plantillas.length === 0
            ? <p className="text-xs text-ink-muted mb-2">Todavía no hay plantillas. Guarda esta hoja como la primera.</p>
            : (
              <ul className="divide-y divide-black/5 mb-2">
                {plantillas.map((p) => {
                  const total = p.renglones.reduce((t, r) => t + Math.round(r.cantidad * Math.round(r.precio_unitario * 100)), 0) / 100;
                  return (
                    <li key={p.id} data-plantilla={p.id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm text-ink-dim">{p.nombre}</p>
                        <p className="text-[11px] text-ink-muted tabular-nums">{renglones(p.renglones.length)} · {formatMonto(total, "MXN")}</p>
                      </div>
                      {borrarPl === p.id
                        ? <span className="flex gap-1.5 items-center">
                            <span className="text-[11px] text-ink-muted">¿Borrar la plantilla? La hoja no cambia.</span>
                            <button type="button" data-plantilla-borrar-si onClick={() => void quitarPlantilla(p)} className="bg-mauve-900 text-cream rounded-xl px-3 py-1.5 text-xs font-medium">Sí, borrar</button>
                            <button type="button" onClick={() => setBorrarPl(null)} className="border border-black/10 rounded-xl px-3 py-1.5 text-xs text-ink-dim">No</button>
                          </span>
                        : <span className="flex gap-1.5">
                            <button type="button" data-plantilla-usar={p.id} onClick={() => usar(p)} className="bg-ink text-cream rounded-xl px-3 py-1.5 text-xs font-medium">Usar</button>
                            <button type="button" aria-label="Borrar la plantilla" onClick={() => setBorrarPl(p.id)} className="text-ink-muted hover:text-mauve-900 p-1.5"><IconTrash size={13} /></button>
                          </span>}
                    </li>
                  );
                })}
              </ul>
            )}
          <form className="flex gap-1.5 flex-wrap" onSubmit={(e) => { e.preventDefault(); void guardarComoPlantilla(); }}>
            <input data-plantilla-nombre type="text" maxLength={120} value={nombrePlantilla} placeholder="Nombre: Cocina estándar, Baño completo…"
              onChange={(e) => setNombrePlantilla(e.target.value)}
              className="flex-1 min-w-[12rem] bg-white border border-black/10 rounded-xl px-3 py-1.5 text-sm text-ink" />
            <button type="submit" data-plantilla-guardar className="border border-black/10 bg-white rounded-xl px-3 py-1.5 text-xs text-ink-dim">
              Guardar esta hoja como plantilla
            </button>
          </form>
        </div>
      )}

      <div ref={caja} className="overflow-x-auto -mx-1">
        {/* 0.108.0 · Las columnas del PDF, con el producto aparte de la
            descripción, y cada celda con su raya (Mike, 18-nov-2026: «quiero
            celdas que separen las columnas»). */}
        <table className="w-full min-w-[40rem] text-sm border-collapse" data-hoja-tabla>
          <thead>
            <tr className="text-[11px] text-ink-muted uppercase tracking-wide">
              <th className="w-8 py-1.5 font-medium text-right pr-2">#</th>
              <th className={`${raya} text-left py-1.5 px-2 font-medium w-[22%]`}>Producto</th>
              <th className={`${raya} text-left py-1.5 px-2 font-medium`}>Descripción</th>
              <th className={`${raya} text-right py-1.5 px-2 font-medium w-16`}>Cant.</th>
              <th className={`${raya} text-right py-1.5 px-2 font-medium w-28`}>P. unitario</th>
              <th className={`${raya} text-right py-1.5 px-2 font-medium w-28`}>Importe</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const imp = importeDe(f.cantidad, f.precio);
              const blanca = vacia(f) && !f.id && i === filas.length - 1;
              const mal = (c: Columna) => marcada?.fila === i && marcada.columna === c ? " ring-2 ring-mauve-900/50 bg-mauve-50" : "";
              return (
                <tr key={f.clave} data-hoja-fila={i} data-concepto={f.id ?? undefined} className="align-top">
                  <td className="py-1.5 pr-2 text-[11px] text-ink-muted text-right tabular-nums">{blanca ? "" : i + 1}</td>
                  <td className={`${raya} py-0.5`}>
                    <textarea data-fila={i} data-col="nombre" rows={1} maxLength={200} value={f.nombre}
                      placeholder={blanca ? "Escribe o pega aquí…" : ""} aria-label={`Producto del renglón ${i + 1}`}
                      onChange={(e) => cambiar(i, "nombre", e.target.value)} onKeyDown={(e) => tecla(e, i, "nombre")}
                      onPaste={(e) => pegar(e, i, "nombre")} className={`${celda} font-medium resize-none [field-sizing:content] block${mal("nombre")}`} />
                  </td>
                  <td className={`${raya} py-0.5`}>
                    {/* La descripción puede ser larga: crece con su texto. Enter
                        sigue bajando de renglón, como en Sheets. */}
                    <textarea data-fila={i} data-col="descripcion" rows={1} maxLength={2000} value={f.descripcion}
                      aria-label={`Descripción del renglón ${i + 1}`}
                      onChange={(e) => cambiar(i, "descripcion", e.target.value)} onKeyDown={(e) => tecla(e, i, "descripcion")}
                      onPaste={(e) => pegar(e, i, "descripcion")} className={`${celda} resize-none [field-sizing:content] block${mal("descripcion")}`} />
                    {f.cotizacion_id && (
                      <span className="block px-2 -mt-0.5 mb-1 text-[10px] text-sky-900" data-de-cotizacion>
                        Cotización {numeroDeCot.get(f.cotizacion_id) ?? ""}{f.cotizacion_folio ? ` · ${f.cotizacion_folio}` : ""}{f.cotizacion_nombre ? ` · ${f.cotizacion_nombre}` : ""}
                      </span>
                    )}
                  </td>
                  {(["cantidad", "precio"] as const).map((c) => (
                    <td key={c} className={`${raya} py-0.5`}>
                      <input data-fila={i} data-col={c} type="text" inputMode="decimal" value={f[c]}
                        aria-label={`${c === "cantidad" ? "Cantidad" : "Precio unitario"} del renglón ${i + 1}`}
                        onChange={(e) => cambiar(i, c, e.target.value)} onKeyDown={(e) => tecla(e, i, c)}
                        onPaste={(e) => pegar(e, i, c)} onBlur={() => alSalir(i, c)}
                        className={`${celda} text-right tabular-nums${mal(c)}`} />
                    </td>
                  ))}
                  <td className={`${raya} py-1.5 px-2 text-right tabular-nums text-ink-dim whitespace-nowrap`} data-hoja-importe>
                    {blanca ? "" : imp === null ? <span className="text-ink-muted">—</span> : formatMonto(imp, "MXN")}
                  </td>
                  <td className="py-1 text-right">
                    {!blanca && (
                      <button type="button" aria-label={`Quitar el renglón ${i + 1}`} data-hoja-quitar onClick={() => quitar(i)}
                        className="text-ink-muted hover:text-mauve-900 p-1"><IconX size={13} /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="text-sm">
            <tr>
              <td />
              <td className="pt-2 px-2">
                <button type="button" data-hoja-agregar onClick={() => mover(filas.length - 1, COLUMNAS[0], 1)}
                  className="text-xs text-ink-muted hover:text-ink-dim inline-flex items-center gap-1">
                  <IconPlus size={12} /> Renglón
                </button>
              </td>
              <td colSpan={3} className="pt-2 px-2 text-right text-xs text-ink-muted">
                {conteo} concepto{conteo === 1 ? "" : "s"} · precio sin IVA
              </td>
              <td className="pt-2 px-2 text-right font-medium text-ink-dim tabular-nums whitespace-nowrap" data-hoja-total>{formatMonto(suma, "MXN")}</td>
              <td />
            </tr>
            <tr className="text-[11px] text-ink-muted">
              <td />
              <td colSpan={5} className="px-2 pt-0.5 text-right" data-hoja-desglose>
                Sin IVA. El IVA no se le suma al precio: el que se cobra se ve aparte, en el estado de cuenta.
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[11px] text-ink-muted mt-2">
        Tab y Enter para moverte; pega un rango de Sheets o Excel (producto, descripción, cantidad, precio) en cualquier celda.
      </p>

      {cambiada && (
        <div data-hoja-cambios className="mt-3 flex items-center justify-between gap-2 flex-wrap bg-cream/70 rounded-xl px-3 py-2">
          <span className="text-xs text-ink-dim">Cambios sin guardar · el precio pasa a <span className="font-medium tabular-nums">{formatMonto(suma, "MXN")}</span></span>
          <span className="flex gap-1.5">
            <button type="button" onClick={descartar} disabled={guardando} className="border border-black/10 rounded-xl px-3 py-1.5 text-xs text-ink-dim">Descartar</button>
            <button type="button" data-hoja-guardar onClick={() => void guardar()} disabled={guardando}
              className="bg-ink text-cream rounded-xl px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50">
              <IconDeviceFloppy size={13} /> {guardando ? "Guardando…" : "Guardar la hoja"}
            </button>
          </span>
        </div>
      )}

      {aviso && <p data-conceptos-aviso className="text-xs text-mint-900 bg-mint-50 px-3 py-2 rounded-xl mt-2">{aviso}</p>}
      {error && <p data-conceptos-error className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl mt-2">{error}</p>}
    </div>
  );
}
