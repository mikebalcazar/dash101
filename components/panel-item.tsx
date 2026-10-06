"use client";

/* El panel lateral del ítem: lo que se ve en quell, desde dash101 (6-oct-2026).
 *
 * Mike: «me abra la barra lateral de detalle de los ítems cuando doy click
 * sobre uno o sobre el ícono de info. No importa en dónde esté viendo el ítem
 * en lista (…) dentro de la barra lateral de detalles del ítem, debe haber un
 * hiperlink al ítem en quell».
 *
 * `PanelItemHost` se monta una vez en el marco de la app y escucha el evento
 * `dash101:abrir-item`; `BotonVerItem` y `NombreDeItem` son lo que cada lista
 * pone en sus renglones. Sólo lectura: para escribir está quell101, y la liga
 * de arriba abre ESA pieza allá. */
import { useEffect, useState, type ReactNode } from "react";
import { IconExternalLink, IconInfoCircle, IconX } from "@tabler/icons-react";
import { formatMonto } from "@/lib/format";
import { EVENTO_ABRIR_ITEM, abrirItem, abrirPieza, archivoDeQuell, pieza, piezaDeItem, piezaDocs, urlPiezaEnQuell, type DetalleDePieza, type DocsDePieza, type PiezaDeItem } from "@/lib/pieza";

/** El ⓘ que va junto a cada ítem en cualquier lista. */
export function BotonVerItem({ id, className = "" }: { id: string; className?: string }) {
  return (
    <button
      type="button"
      data-ver-item={id}
      title="Ver el ítem en la obra: fotos, bitácora, pendientes y archivos"
      aria-label="Ver el ítem en la obra"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirItem(id); }}
      className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-mint-900 hover:bg-mint-50 shrink-0 align-middle ${className}`}
    >
      <IconInfoCircle size={15} />
    </button>
  );
}

/** El nombre del ítem como botón: picarlo también abre el panel. */
export function NombreDeItem({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      data-abrir-item={id}
      title="Ver el ítem en la obra"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirItem(id); }}
      className={`text-left hover:underline underline-offset-2 decoration-mint-900/40 ${className}`}
    >
      {children}
    </button>
  );
}

/** Lo mismo para una PIEZA del plano que todavía no es ítem (6-oct). */
export function BotonVerPieza({ element_id, obra, className = "" }: { element_id: string; obra?: { id: string; nombre?: string }; className?: string }) {
  return (
    <button
      type="button"
      data-ver-pieza={element_id}
      title="Ver la pieza en la obra: fotos, bitácora, pendientes y archivos"
      aria-label="Ver la pieza en la obra"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); abrirPieza(element_id, obra); }}
      className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-mint-900 hover:bg-mint-50 shrink-0 align-middle ${className}`}
    >
      <IconInfoCircle size={15} />
    </button>
  );
}

/** Qué se abre: un ítem (se busca su pieza) o una pieza directo. */
type Abierto = { item_id: string } | { element_id: string; obra_id?: string; obra_nombre?: string };

export function PanelItemHost() {
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const itemId = abierto ? ("item_id" in abierto ? abierto.item_id : `pieza:${abierto.element_id}`) : null;
  const setItemId = (v: null) => setAbierto(v);
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ item_id?: string; element_id?: string; obra_id?: string; obra_nombre?: string }>).detail ?? {};
      setAbierto(d.item_id ? { item_id: d.item_id } : d.element_id ? { element_id: d.element_id, obra_id: d.obra_id, obra_nombre: d.obra_nombre } : null);
    };
    window.addEventListener(EVENTO_ABRIR_ITEM, f);
    return () => window.removeEventListener(EVENTO_ABRIR_ITEM, f);
  }, []);
  useEffect(() => {
    if (!itemId) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setItemId(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [itemId]);
  if (!abierto || !itemId) return null;
  return <PanelItem key={itemId} abierto={abierto} onClose={() => setItemId(null)} />;
}

const FASE_OBRA: Record<string, string> = { produccion: "Producción", punchlist: "Punchlist" };
const fechaObra = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "");
const fechaDia = (d?: string | null) => (d ? new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "");

type Estado = { cargando: true } | { error: string } | { pieza: PiezaDeItem; det: DetalleDePieza; docs: DocsDePieza | null };

function PanelItem({ abierto, onClose }: { abierto: Abierto; onClose: () => void }) {
  const [d, setD] = useState<Estado>({ cargando: true });
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        let pz: PiezaDeItem;
        let det: DetalleDePieza;
        let docs: DocsDePieza | null;
        if ("item_id" in abierto) {
          pz = await piezaDeItem(abierto.item_id);
          [det, docs] = await Promise.all([pieza(pz.element_id), piezaDocs(pz.element_id).catch(() => null)]);
        } else {
          /* Una pieza sin ítem: su detalle trae casi todo; la obra la manda
           * quien la abre, para la liga a quell101. */
          [det, docs] = await Promise.all([pieza(abierto.element_id), piezaDocs(abierto.element_id).catch(() => null)]);
          const e = det.element as typeof det.element & { project_id?: string; plan_id?: string; padre_id?: string | null };
          pz = {
            element_id: abierto.element_id, project_id: abierto.obra_id || e.project_id || "", project_name: abierto.obra_nombre || "",
            plan_id: e.plan_id || "", plan_name: e.plan_name || "", code: e.code || "", name: e.name || "", type: e.type || "",
            fase: e.fase || "", padre_id: e.padre_id ?? null,
          };
        }
        if (vivo) setD({ pieza: pz, det, docs });
      } catch (e) {
        if (vivo) setD({ error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { vivo = false; };
  }, [abierto]);

  const Seccion = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
    <section className="mt-4">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-muted mb-1.5">{titulo}</h3>
      <div className="text-sm text-ink-dim space-y-1">{children}</div>
    </section>
  );
  const Fotos = ({ fotos }: { fotos?: Array<{ id?: string; r2_key: string; file_name?: string }> }) =>
    fotos && fotos.length ? (
      <div className="flex flex-wrap gap-1.5 mt-1">
        {fotos.map((f) => (
          <a key={f.id ?? f.r2_key} href={archivoDeQuell(f.r2_key)} target="_blank" rel="noreferrer">
            <img src={archivoDeQuell(f.r2_key)} alt={f.file_name ?? "foto"} loading="lazy" className="w-14 h-14 object-cover rounded-md border border-black/10" />
          </a>
        ))}
      </div>
    ) : null;

  let cuerpo: ReactNode;
  if ("cargando" in d) cuerpo = <p className="text-sm text-ink-muted">Preguntando a la obra…</p>;
  else if ("error" in d) cuerpo = <p className="text-sm text-mauve-900">{d.error}</p>;
  else {
    const e = d.det.element;
    const { log = [], punch = [], contratistas = [] } = d.det;
    const abiertos = punch.filter((k) => k.status !== "ok");
    const docs = d.docs ?? {};
    const soporte = docs.soporte ?? [];
    cuerpo = (
      <>
        {/* La liga que pidió Mike: abre ESA pieza en quell101. */}
        <a
          href={urlPiezaEnQuell(d.pieza.project_id, d.pieza.element_id)}
          target="_blank"
          rel="noreferrer"
          data-abrir-en-quell
          className="inline-flex items-center gap-1.5 text-sm font-medium text-mint-900 bg-mint-50 border border-mint-900/20 rounded-lg px-3 py-1.5 hover:border-mint-900/50"
        >
          <IconExternalLink size={15} /> Abrir en quell101
        </a>
        <p className="text-[11px] text-ink-muted mt-3">{e.type || "Ítem"} · <b className="text-mint-900">{e.code || "sin código"}</b></p>
        <h2 className="text-lg font-medium text-ink-dim leading-tight" data-pieza-nombre={e.id}>{e.name || "Sin nombre"}</h2>
        <p className="text-xs text-ink-muted">{d.pieza.project_name}{d.pieza.plan_name ? ` · ${d.pieza.plan_name}` : ""}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {e.fase && <span className="text-[11px] px-2 py-0.5 rounded-md bg-black/5 text-ink-dim">{FASE_OBRA[e.fase] ?? e.fase}</span>}
          {e.alcance && <span className="text-[11px] px-2 py-0.5 rounded-md bg-black/5 text-ink-dim">{e.alcance === "fuera" ? "Fuera de alcance" : "En alcance"}</span>}
          {e.type === "Requerimiento" && <span className="text-[11px] px-2 py-0.5 rounded-md bg-black/5 text-ink-dim">Falta cotizarlo</span>}
        </div>
        {e.item_descripcion && <Seccion titulo="Descripción"><p className="whitespace-pre-wrap">{e.item_descripcion}</p></Seccion>}
        <Seccion titulo="En la obra">
          <p>Contratistas: {contratistas.length ? contratistas.map((c) => c.name + (c.company ? ` (${c.company})` : "")).join(", ") : "nadie todavía"}</p>
          <p>{e.item_fecha_entrega ? `Entrega: ${fechaDia(e.item_fecha_entrega)}${e.item_entrega_falta?.dice ? ` · ${e.item_entrega_falta.dice}` : ""}` : "Sin fecha de entrega"}</p>
          {e.item_monto != null && <p>Precio del ítem: {formatMonto(Number(e.item_monto) / 100, "MXN")}{(Number(e.item_cantidad) || 1) > 1 ? ` · ${e.item_cantidad} piezas` : ""}</p>}
          {/* Los dos candados del cronograma (0.70.0). */}
          <p>Diseño: {e.diseno_definido ? `definido el ${fechaDia(e.diseno_definido)}` : "sin definir (se fecha en quell101)"}</p>
          <p>Anticipo: {e.anticipo_fecha ? `${fechaDia(e.anticipo_fecha)}${e.anticipo_monto ? ` · ${formatMonto(Number(e.anticipo_monto) / 100, "MXN")}` : ""}` : "sin anticipo (se reparte al registrar el pago)"}</p>
        </Seccion>
        <Seccion titulo={`Archivos del ítem${docs.principal || soporte.length ? "" : " · ninguno"}`}>
          {docs.principal && <a className="block text-mint-900 hover:underline" href={archivoDeQuell(docs.principal.r2_key)} target="_blank" rel="noreferrer">Plano: {docs.principal.nombre || "principal"}</a>}
          {soporte.map((x) => <a key={x.id} className="block text-mint-900 hover:underline" href={archivoDeQuell(x.r2_key)} target="_blank" rel="noreferrer">{x.nombre || "archivo"}</a>)}
        </Seccion>
        <Seccion titulo={`Punchlist · ${abiertos.length}/${punch.length}`}>
          {!punch.length && <p className="text-ink-muted">Sin pendientes.</p>}
          {punch.map((k) => (
            <div key={k.id} className="border-l-2 border-black/10 pl-2" data-estado={k.status}>
              <b className="font-medium">{k.title || "Pendiente"}</b>{k.description ? ` · ${k.description}` : ""}
              <p className="text-xs text-ink-muted">{(k.status === "ok" ? "Cerrado" : k.status === "proc" ? "En proceso" : "Pendiente") + (k.assignee_name ? ` · ${k.assignee_name}` : k.resp ? ` · ${k.resp}` : "") + (k.due_date ? ` · para el ${fechaDia(k.due_date)}` : "")}</p>
              <Fotos fotos={k.photos} />
            </div>
          ))}
        </Seccion>
        <Seccion titulo={`Bitácora · ${log.length}`}>
          {!log.length && <p className="text-ink-muted">Sin registros.</p>}
          {[...log].reverse().map((l) => (
            <div key={l.id} className="border-l-2 border-black/10 pl-2" data-bitacora={l.id}>
              <p className="text-xs text-ink-muted">{(l.user_name || "Suite 101") + " · " + fechaObra(l.created_at)}</p>
              {l.text && <p className="whitespace-pre-wrap">{l.text}</p>}
              <Fotos fotos={l.photos} />
            </div>
          ))}
        </Seccion>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/30" data-panel-item={"item_id" in abierto ? abierto.item_id : abierto.element_id} onClick={(ev) => ev.target === ev.currentTarget && onClose()}>
      <aside role="dialog" aria-label="El ítem en la obra" className="absolute right-0 top-0 h-full w-full sm:w-[420px] max-w-full bg-white shadow-2xl overflow-y-auto p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] text-ink-muted">El ítem en la obra · sólo lectura</span>
          <button type="button" onClick={onClose} title="Cerrar" aria-label="Cerrar" className="w-7 h-7 rounded-md hover:bg-black/5 inline-flex items-center justify-center text-ink-dim"><IconX size={16} /></button>
        </div>
        {cuerpo}
      </aside>
    </div>
  );
}
