"use client";

/* Juntar los ítems del proyecto con las piezas del plano · contrato 0.34.0.
 *
 * Mike, 20-sep: los ítems de la obra y los del proyecto son la misma lista de
 * piezas capturada dos veces. Y después, al ver la primera versión:
 * «necesito una opción de hacer match de los que ya existen. Que pueda
 * escoger de la lista qué ítem corresponde al de quell».
 *
 * Por eso esta pantalla NO es aceptar o rechazar. Es UNA FILA POR PIEZA del
 * plano, con un desplegable de todos los ítems que todavía caben. El
 * parecido llega preseleccionado —acierta casi siempre— y se cambia con un
 * clic cuando no.
 *
 * Y los dos CÓDIGOS son dos cosas, no una. Mike lo ordenó el 20-sep: «una
 * cosa es el código de ítem (pieza física en obra) y otra diferente el
 * código de producto de catálogo». El de la pieza vive en el plano y es
 * único en la obra; el del producto es el del modelo en el catálogo, y
 * veintinueve puertas iguales son veintinueve piezas y un producto. Por eso
 * esta pantalla ya no pregunta cuál gana: ninguno, cada uno se queda con el
 * suyo.
 *
 * Y desde aquí se cierra el renglón, que fue lo siguiente que pidió:
 * «debería poder de ahí mismo agregar un ítem nuevo con precio y
 * descripción para que ya se sume. Y puede ser crear un concepto nuevo o
 * agregarlo al conteo de un concepto ya existente (ej. una puerta más a las
 * 14 ya existentes del mismo modelo)».
 *
 * Las dos cosas mueven dinero, y por eso las dos lo dicen antes: el ítem
 * nuevo con precio nace vendido, y sumar una pieza al concepto enseña
 * cuánto sube la venta ANTES de aplicar.
 */

import { useEffect, useMemo, useState } from "react";
import { IconExternalLink, IconCheck, IconAlertTriangle } from "@tabler/icons-react";
import {
  fusionarItemsDeLaObra, itemsDeLaObra, urlObra,
  type AltaDeItem, type LigaDeItem, type Obra, type PropuestaDeItems,
} from "@/lib/obras";
import { aCentavos } from "@/lib/api/adaptar";
import { formatMonto } from "@/lib/format";

/** El dinero llega en CENTAVOS de la API; aquí se pinta en pesos, una vez. */
const pesos = (centavos: number) => formatMonto(Math.round(centavos) / 100, "MXN");

/** Lo que se decidió para una pieza. `item` vacío = no hacer nada con ella;
 *  `nuevo` = crearle su propio ítem. */
type Decision = {
  item: string;
  nombre?: "quell" | "dash";
  /** Sólo cuando `item === NUEVO`. En PESOS tal como se teclean; la
   *  conversión a centavos se hace una sola vez, al mandar. */
  precio?: string;
  descripcion?: string;
  nombreNuevo?: string;
};
const NUEVO = "__nuevo__";

export function JuntarItemsDeLaObra({ obra, alTerminar }: { obra: Obra; alTerminar: () => void }) {
  const [prop, setProp] = useState<PropuestaDeItems | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState("");
  const [decidido, setDecidido] = useState<Record<string, Decision>>({});
  /** A qué conceptos se les dijo que sí pueden crecer. Va por ítem y no por
   *  pieza: quien decide piensa «el modelo A ahora son 15», no «esta puerta
   *  en concreto es la que sobra». */
  const [creceN, setCreceN] = useState<Record<string, boolean>>({});

  const traer = async () => {
    setCargando(true); setError("");
    try {
      const p = await itemsDeLaObra(obra.id);
      setProp(p);
      /* Se arranca con lo que el parecido propuso, ya escogido: acierta casi
       * siempre y lo que hay que poder hacer rápido es cambiar la que no.
       * Las piezas sin parecido arrancan en «crearle su ítem». */
      const d: Record<string, Decision> = {};
      for (const par of p.parejas) d[par.element_id] = { item: par.item_id };
      for (const n of p.nuevos) d[n.element_id] = { item: NUEVO };
      setDecidido(d);
      setCreceN({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la propuesta.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { void traer(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [obra.id]);

  /** Todas las piezas sueltas, en una sola lista: las que el parecido
   *  emparejó y las que no. Partirlas en dos montones obligaba a buscar en
   *  cuál está la que uno quiere cambiar. */
  const piezas = useMemo(() => {
    if (!prop) return [];
    return [
      ...prop.parejas.map((p) => ({ element_id: p.element_id, codigo: p.codigo, pieza: p.pieza, tipo: p.tipo, sugerido: p.item_id, por: p.por })),
      ...prop.nuevos.map((n) => ({ element_id: n.element_id, codigo: n.codigo, pieza: n.pieza, tipo: n.tipo, sugerido: "", por: "" as const })),
    ];
  }, [prop]);

  /** Cuántas veces se escogió cada ítem, para no pasarse del cupo antes de
   *  mandar. La API lo rechaza igual; es mejor no llegar hasta allá. */
  const usos = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of Object.values(decidido)) if (d.item && d.item !== NUEVO) m[d.item] = (m[d.item] ?? 0) + 1;
    return m;
  }, [decidido]);

  const porId = useMemo(
    () => Object.fromEntries((prop?.candidatos ?? []).map((c) => [c.id, c])),
    [prop],
  );

  const excedidos = (prop?.candidatos ?? []).filter((c) => (usos[c.id] ?? 0) > c.cupo);

  const cambiar = (eid: string, patch: Partial<Decision>) =>
    setDecidido((p) => ({ ...p, [eid]: { ...(p[eid] ?? { item: "" }), ...patch } }));

  const aplicar = async () => {
    if (!prop) return;
    setGuardando(true); setError(""); setHecho("");
    try {
      const ligar: LigaDeItem[] = [];
      const crear: AltaDeItem[] = [];
      /* La cuenta del cupo se lleva aquí también, y en el mismo orden en que
       * se manda: la pieza que se pasa es la que lleva `sumar`, no todas las
       * del concepto. Así el servidor hace exactamente lo que dice la
       * pantalla. */
      const llevadas: Record<string, number> = {};
      let conPrecio = 0;
      for (const pz of piezas) {
        const d = decidido[pz.element_id];
        if (!d || !d.item) continue;
        if (d.item === NUEVO) {
          const centavos = d.precio?.trim() ? aCentavos(d.precio) : 0;
          if (centavos > 0) conPrecio++;
          crear.push({
            element_id: pz.element_id,
            monto: centavos > 0 ? centavos : undefined,
            nombre: d.nombreNuevo?.trim() || undefined,
            descripcion: d.descripcion?.trim() || undefined,
          });
          continue;
        }
        const cupo = porId[d.item]?.cupo ?? 0;
        const van = (llevadas[d.item] ?? 0) + 1;
        llevadas[d.item] = van;
        ligar.push({
          element_id: pz.element_id, item_id: d.item, nombre: d.nombre,
          sumar: van > cupo ? true : undefined,
        });
      }
      const r = await fusionarItemsDeLaObra(obra.id, { ligar, crear });
      const sinPrecio = r.creados - conPrecio;
      const partes = [
        `${r.ligados} pieza${r.ligados === 1 ? "" : "s"} quedó${r.ligados === 1 ? "" : "aron"} con su ítem`,
        conPrecio ? `${conPrecio} ítem${conPrecio === 1 ? "" : "s"} nuevo${conPrecio === 1 ? "" : "s"} con precio, ya sumado${conPrecio === 1 ? "" : "s"} al proyecto` : "",
        sinPrecio > 0 ? `${sinPrecio} ítem${sinPrecio === 1 ? "" : "s"} nuevo${sinPrecio === 1 ? "" : "s"}, sin precio todavía` : "",
        r.sumados ? `${r.sumados} pieza${r.sumados === 1 ? "" : "s"} más al conteo de su concepto` : "",
        r.renombrados ? `${r.renombrados} nombre${r.renombrados === 1 ? "" : "s"} igualado${r.renombrados === 1 ? "" : "s"} en los dos lados` : "",
      ].filter(Boolean);
      setHecho(`${partes.join(" · ")}.`);
      await traer();
      alTerminar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar.");
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <p className="text-xs text-ink-muted mt-2">Viendo qué se parece a qué…</p>;
  if (error && !prop) return <p className="text-xs text-mauve-900 mt-2">{error}</p>;
  if (!prop) return null;

  if (piezas.length === 0) {
    return (
      <div className="mt-3 border-t border-black/5 pt-3">
        <p className="text-xs text-ink-muted">
          Todas las piezas del plano ya están colgadas de su ítem.
          {prop.sueltos.length > 0 && (
            <> Quedan {prop.sueltos.length} ítem{prop.sueltos.length === 1 ? "" : "es"} sin ubicar en el plano; eso se hace en quell101, poniendo el punto en el dibujo.</>
          )}
        </p>
      </div>
    );
  }

  const cuantas = Object.values(decidido).filter((d) => d.item).length;

  return (
    <div className="mt-3 border-t border-black/5 pt-3">
      <h4 className="text-xs font-medium text-ink-dim mb-1">Juntar las piezas del plano con los ítems</h4>
      <p className="text-xs text-ink-muted mb-3">
        Nada se guarda hasta que le piques a aplicar. Lo que ves escogido es lo que el sistema
        cree; cámbialo cuando no cuadre. Lo que dejes en <b>«no hacer nada»</b> se queda como está.
      </p>

      <div className="space-y-3">
        {piezas.map((pz) => {
          const d = decidido[pz.element_id] ?? { item: "" };
          const item = d.item && d.item !== NUEVO ? porId[d.item] : null;
          const claveItem = (item?.clave ?? "").trim();
          const clavePieza = (pz.codigo ?? "").trim();
          const chocanClaves = Boolean(claveItem && clavePieza && claveItem !== clavePieza);
          const difierenNombres = Boolean(item && item.nombre !== pz.pieza);

          return (
            <div key={pz.element_id} className="bg-cream/40 rounded-xl p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-ink-dim flex-1 min-w-[10rem]">
                  <b>{pz.codigo ? `${pz.codigo} · ` : ""}{pz.pieza}</b>
                  <span className="text-ink-muted"> · {pz.tipo}</span>
                </span>
                <select
                  aria-label={`Ítem para ${pz.pieza}`}
                  value={d.item}
                  onChange={(e) => cambiar(pz.element_id, { item: e.target.value, nombre: undefined })}
                  className="flex-1 min-w-[12rem] bg-white border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-ink/40"
                >
                  <option value="">— No hacer nada con ésta —</option>
                  <option value={NUEVO}>Crearle su ítem aquí mismo</option>
                  {(prop.candidatos ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.clave ? `${c.clave} · ` : ""}{c.nombre} · {pesos(c.monto)}
                      {c.cantidad > 1 ? ` · caben ${c.cupo} de ${c.cantidad}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {pz.sugerido && d.item === pz.sugerido && (
                <p className="text-[11px] text-ink-muted mt-1">
                  Se parecen por {pz.por === "codigo" ? "código" : "nombre"}.
                </p>
              )}

              {/* El ítem nuevo, con su precio y su descripción. Con precio
                  nace vendido y ya se suma; sin precio queda cotizado, para
                  ponérselo después. Se dice ahí mismo, porque la diferencia
                  es que el proyecto valga más o no. */}
              {d.item === NUEVO && (
                <div className="mt-2 grid gap-1.5 sm:grid-cols-[1fr_8rem]">
                  <input
                    type="text"
                    value={d.nombreNuevo ?? ""}
                    onChange={(e) => cambiar(pz.element_id, { nombreNuevo: e.target.value })}
                    placeholder={pz.pieza}
                    aria-label={`Nombre del ítem nuevo de ${pz.pieza}`}
                    className="bg-white border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-ink/40"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={d.precio ?? ""}
                    onChange={(e) => cambiar(pz.element_id, { precio: e.target.value })}
                    placeholder="Precio"
                    aria-label={`Precio del ítem nuevo de ${pz.pieza}`}
                    className="bg-white border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-ink/40"
                  />
                  <input
                    type="text"
                    value={d.descripcion ?? ""}
                    onChange={(e) => cambiar(pz.element_id, { descripcion: e.target.value })}
                    placeholder="Descripción (opcional)"
                    aria-label={`Descripción del ítem nuevo de ${pz.pieza}`}
                    className="sm:col-span-2 bg-white border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-ink/40"
                  />
                  <p className="sm:col-span-2 text-[11px] text-ink-muted">
                    {d.precio?.trim()
                      ? <>Con precio queda <b>vendido</b> y se suma al proyecto.</>
                      : <>Sin precio queda <b>cotizado</b>: no mueve el precio de venta hasta que se lo pongas.</>}
                  </p>
                </div>
              )}

              {/* Los dos códigos NO se mezclan, y por eso aquí ya no hay nada
                  que decidir. Mike, 20-sep: «una cosa es el código de ítem
                  (pieza física en obra) y otra diferente el código de
                  producto de catálogo». El de la pieza vive en el plano; el
                  del producto, en el catálogo. Hasta hace un rato esta
                  pantalla preguntaba cuál ganaba y copiaba uno al otro: le
                  ponía a un producto el folio de una de sus piezas. */}
              {chocanClaves && (
                <p className="mt-1.5 text-[11px] text-ink-muted">
                  La pieza trae <b>{clavePieza}</b> en el plano y el producto <b>{claveItem}</b> en el
                  catálogo. Son dos códigos distintos y cada uno se queda con el suyo.
                </p>
              )}

              {/* El nombre es otra cosa: los dos lados lo traen, y el
                  descriptivo largo vive en el detalle de cada app. Por eso
                  por omisión cada uno conserva el suyo. */}
              {difierenNombres && (
                <div className="mt-1.5 text-[11px] text-ink-dim">
                  <span className="text-ink-muted">Nombres distintos. Puedes dejar cada uno con el suyo, o igualarlos:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {(["quell", "dash"] as const).map((lado) => (
                      <button
                        key={lado}
                        type="button"
                        onClick={() => cambiar(pz.element_id, { nombre: lado })}
                        className={`px-2 py-1 rounded-lg border text-[11px] ${
                          d.nombre === lado ? "bg-ink text-cream border-ink" : "bg-white border-black/10 text-ink-dim"
                        }`}
                      >
                        «{lado === "quell" ? pz.pieza : item!.nombre}» {lado === "quell" ? "(plano)" : "(proyecto)"}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => cambiar(pz.element_id, { nombre: undefined })}
                      className={`px-2 py-1 rounded-lg border text-[11px] ${
                        !d.nombre ? "bg-ink text-cream border-ink" : "bg-white border-black/10 text-ink-dim"
                      }`}
                    >
                      Dejar cada uno con el suyo
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Se escogieron más piezas de las que el concepto dice tener. Antes
          esto era un muro: «quítale a alguna». Mike pidió la otra salida:
          «agregarlo al conteo de un concepto ya existente, una puerta más a
          las 14 del mismo modelo». Así que aquí se decide, y se dice cuánto
          sube la venta ANTES de aplicar, porque eso es lo que cambia. */}
      {excedidos.map((c) => {
        const demas = (usos[c.id] ?? 0) - c.cupo;
        const porPieza = Math.round(c.monto / Math.max(1, c.cantidad));
        return (
          <div key={c.id} className="text-xs bg-sky-50 text-sky-900 px-3 py-2 rounded-xl mt-3">
            <p>
              <b>«{c.nombre}»</b> dice ser {c.cantidad} pieza{c.cantidad === 1 ? "" : "s"} y escogiste{" "}
              {usos[c.id]}: {demas} de más.
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <button
                type="button"
                onClick={() => setCreceN((p) => ({ ...p, [c.id]: !p[c.id] }))}
                className={`px-2 py-1 rounded-lg border text-[11px] ${
                  creceN[c.id] ? "bg-ink text-cream border-ink" : "bg-white border-black/10 text-ink-dim"
                }`}
              >
                {creceN[c.id] ? "Sí: " : ""}Que el concepto pase a {c.cantidad + demas} piezas
              </button>
              <span className="text-[11px]">
                {creceN[c.id]
                  ? <>La venta sube <b>{pesos(porPieza * demas)}</b> ({pesos(porPieza)} por pieza).</>
                  : <>O quítale a {demas === 1 ? "una" : `${demas}`} y déjalo en {c.cantidad}.</>}
              </span>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button
          type="button"
          onClick={aplicar}
          disabled={guardando || cuantas === 0 || excedidos.some((c) => !creceN[c.id])}
          className="bg-ink text-white text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40"
        >
          <IconCheck size={13} />
          {guardando ? "Juntando…" : `Aplicar (${cuantas})`}
        </button>
        {prop.sueltos.length > 0 && (
          <span className="text-[11px] text-ink-muted">
            {prop.sueltos.length} ítem{prop.sueltos.length === 1 ? "" : "es"} del proyecto todavía sin pieza en el plano.{" "}
            <a href={urlObra(obra)} target="_blank" rel="noreferrer" className="text-marca hover:underline inline-flex items-center gap-0.5">
              Ubicarlos en quell101 <IconExternalLink size={11} />
            </a>
          </span>
        )}
      </div>

      {hecho && <p className="text-xs text-mint-900 mt-2">{hecho}</p>}
      {error && <p className="text-xs text-mauve-900 mt-2">{error}</p>}
    </div>
  );
}
