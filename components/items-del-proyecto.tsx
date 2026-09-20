"use client";

/* Los ítems del proyecto: en su orden, por partidas, y agrupados por modelo.
 *
 * Encargos de Mike del 20-sep, todos sobre esta misma lista:
 *
 *   «Necesito poder agrupar varios ítems en un solo concepto. Son varias
 *   puertas iguales en diferente ubicación —quell las ubica en plano y cada
 *   una tiene su seguimiento— pero el producto es el mismo, y no tiene caso
 *   tener 21 ítems idénticos enlistados en dash.»
 *
 *   «Quiero también poder ordenar los ítems y agrupar por partidas. Incluso
 *   podría ser por pestañas (como folders) para cambiar entre partidas.»
 *
 *   «Cuando un ítem se asigna a un grupo de ítems que son del mismo
 *   producto, el ítem adquiere en automático ese costo. También debe poder
 *   moverse de grupo de producto un ítem ya agrupado. Todos los ítems
 *   deberían tener un dropdown para seleccionar qué producto es, o nuevo si
 *   el ítem es su mismo producto único.»
 *
 * Cómo está resuelto, y por qué así:
 *
 *   · las PESTAÑAS son las partidas, más «Todas» al principio. Una partida
 *     es texto libre: no hay catálogo que dar de alta antes de poder
 *     teclear «Cocina», y renombrarla es escribir el nombre nuevo en sus
 *     ítems, que se manda de un golpe;
 *   · ACOMODAR es un modo aparte, con su botón de guardar. Mientras se
 *     mueve un renglón no se guarda nada: subir y bajar tres veces no son
 *     tres guardados, y equivocarse no cuesta;
 *   · un PRODUCTO es un renglón que se abre. La lista corta que Mike pidió
 *     es la de afuera —«Puerta modelo A · 21 piezas»—, y las 21 están
 *     adentro, cada una con su código de obra. Esto ANTES se resolvía
 *     borrando veinte renglones; ya no, porque un renglón borrado no se
 *     puede mover de grupo, que es lo que él pidió después;
 *   · el DROPDOWN del producto va debajo del nombre de cada ítem, y cada
 *     opción dice su precio: escoger cambia el costo del ítem, y una lista
 *     de nombres sin precio deja mover el precio de venta a ciegas. Después
 *     de aplicar, la pantalla dice cuánto se movió;
 *   · AGRUPAR propone y espera. Ya no es irreversible —sacar una pieza del
 *     grupo es un clic—, pero sí mueve dinero si el precio del modelo no es
 *     el que traían, así que lo dice antes.
 */

import { useEffect, useMemo, useState } from "react";
import { IconArrowUp, IconArrowDown, IconCheck, IconX, IconArrowsSort, IconLayersSubtract, IconThumbUp, IconBan, IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import {
  acomodar, agrupables, agrupar, aprobarItem, asignarProducto, cancelarItem, productosDelProyecto,
  type GrupoDeItems, type ItemUnico, type Producto,
} from "@/lib/items-grupo";
import { fueraDeAlcance } from "@/lib/api/leer";
import type { ItemFuera } from "@/lib/api/leer";
import { formatDateShort, formatMonto } from "@/lib/format";
import type { ProductoProyecto, Proyecto } from "@/types/schema";
import type { Timestamp } from "firebase/firestore";

const SIN = "__sin__";
/* Las dos pestañas que no son partidas: lo que está fuera del alcance.
 * Mike, 20-sep: «en la pestaña de partida de ítems fuera de alcance,
 * dividirlos entre "no aprobados" y "Cancelados"». Van al final y separadas
 * de las partidas porque no son un capítulo de la venta: son lo que no se
 * está cobrando. */
const NO_APROBADOS = "__no_aprobados__";
const CANCELADOS = "__cancelados__";
/** Lo que vale el dropdown cuando el ítem no es de ningún producto: es su
 *  propio producto único, que es como nacen todos. */
const SOLO = "__solo__";

/** Las dos listas del dropdown que pidió Mike: los productos que ya se usan
 *  en la obra, y los ítems que todavía son su propio producto único. */
type Opciones = { productos: Producto[]; unicos: ItemUnico[] };
/** Un renglón de la tabla: un producto con sus piezas, o un ítem suelto. */
type Bloque = { producto: Producto | null; filas: Fila[] };
/** El dinero de la API viaja en CENTAVOS; el de `productos` ya viene en
 *  pesos. Esta es la única conversión de esta pantalla, y es de ida. */
const pesos = (centavos: number) => formatMonto(Math.round(centavos) / 100, "MXN");

type Fila = ProductoProyecto & { partida: string; orden: number };

export function ItemsDelProyecto({ proyecto, alCambiar }: { proyecto: Proyecto; alCambiar: () => void }) {
  const productos: ProductoProyecto[] = useMemo(() => proyecto.productos ?? [], [proyecto.productos]);
  const [pestana, setPestana] = useState<string>("");
  const [modo, setModo] = useState<"ver" | "acomodar" | "juntar">("ver");
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState("");
  const [fuera, setFuera] = useState<{ no_aprobados: ItemFuera[]; cancelados: ItemFuera[] }>({ no_aprobados: [], cancelados: [] });
  const [moviendo, setMoviendo] = useState("");
  const [opciones, setOpciones] = useState<Opciones>({ productos: [], unicos: [] });
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  const traerFuera = async () => {
    try { setFuera(await fueraDeAlcance(proyecto.id!)); }
    catch { setFuera({ no_aprobados: [], cancelados: [] }); }
  };
  useEffect(() => { void traerFuera(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [proyecto.id, proyecto.productos]);

  /* Las opciones del dropdown y qué productos hay en la obra. Se vuelven a
   * pedir cuando cambia la lista: agrupar escribe un producto nuevo, y
   * sacar la última pieza de uno lo deja sin usarse. */
  const traerOpciones = async () => {
    try { setOpciones(await productosDelProyecto(proyecto.id!)); }
    catch { setOpciones({ productos: [], unicos: [] }); }
  };
  useEffect(() => { void traerOpciones(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [proyecto.id, proyecto.productos]);

  /** Cambiar un ítem de producto. El valor viene del `<select>`: `pr:` es un
   *  producto que ya existe, `it:` es otro ítem único —«somos el mismo
   *  modelo», y eso escribe el producto—, y `SOLO` es salirse.
   *
   *  Después se dice CUÁNTO SE MOVIÓ el precio de venta. Heredar el costo lo
   *  mueve, y enterarse por el total del mes es tarde. */
  const cambiarProducto = async (id: string, escogido: string) => {
    setMoviendo(id); setError(""); setHecho("");
    try {
      const args = escogido === SOLO ? { solo: true }
        : escogido.startsWith("pr:") ? { producto_id: escogido.slice(3) }
        : { desde_item: escogido.slice(3) };
      const r = await asignarProducto(id, args);
      const delta = (r.venta_despues - r.venta_antes) / 100;
      const donde = r.producto ? `Quedó en «${r.producto.nombre}».` : "Ya es su propio producto único.";
      setHecho(
        delta === 0
          ? `${donde} El precio de venta del proyecto no se movió.`
          : `${donde} El precio de venta ${delta > 0 ? "subió" : "bajó"} ${formatMonto(Math.abs(delta), "MXN")}.`,
      );
      await traerOpciones();
      alCambiar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar de producto.");
    } finally {
      setMoviendo("");
    }
  };

  /** Aprobar, cancelar o reactivar. Se recarga todo después: cambiar el
   *  alcance mueve el precio de venta del proyecto, y enseñar la lista nueva
   *  junto al total viejo es enseñar dos verdades. */
  const mover = async (id: string, que: "aprobar" | "cancelar", motivo?: string) => {
    setMoviendo(id); setError(""); setHecho("");
    try {
      if (que === "aprobar") { await aprobarItem(id); setHecho("Aprobado: ya cuenta en el precio de venta."); }
      else {
        const como = await cancelarItem(id, motivo);
        setHecho(como === "cancelado"
          ? "Cancelado: estaba aprobado, así que sale de la venta y queda en Cancelados."
          : "Descartado: nunca estuvo aprobado, así que no cuenta como cancelado.");
      }
      await traerFuera();
      alCambiar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo.");
    } finally {
      setMoviendo("");
    }
  };

  /** La lista con su partida y su orden resueltos, ya ordenada. El orden es
   *  partida, después `orden`, después como se capturaron: con todo en cero
   *  —que es como queda lo viejo— se ve igual que antes. */
  const filas: Fila[] = useMemo(() => {
    const puestas = productos.map((p, i) => ({
      ...p, partida: (p.partida ?? "").trim(), orden: Number(p.orden ?? 0) || 0, _i: i,
    }));
    return puestas
      .sort((a, b) => a.partida.localeCompare(b.partida, "es") || a.orden - b.orden || a._i - b._i)
      .map(({ _i, ...f }) => { void _i; return f; });
  }, [productos]);

  /** Las pestañas: «Todas» y una por partida, en el orden en que salen. */
  const partidas = useMemo(() => {
    const vistas: string[] = [];
    for (const f of filas) if (!vistas.includes(f.partida)) vistas.push(f.partida);
    return vistas;
  }, [filas]);

  const visibles = pestana === "" ? filas : filas.filter((f) => f.partida === (pestana === SIN ? "" : pestana));

  /** La lista agrupada por producto, conservando el orden: un producto ocupa
   *  el lugar de su primera pieza.
   *
   *  Es el encargo original (§98): «no tiene caso tener 21 ítems idénticos
   *  enlistados en dash». Un producto que todavía no llegó en `opciones`
   *  —la lista se pide aparte— deja sus piezas sueltas en vez de inventar un
   *  renglón con datos que no se tienen; en cuanto llega, se agrupan solas. */
  const bloques: Bloque[] = useMemo(() => {
    const out: Bloque[] = [];
    const porProducto = new Map<string, Bloque>();
    for (const f of visibles) {
      const pid = f.producto_id ?? "";
      const prod = pid ? opciones.productos.find((p) => p.id === pid) : undefined;
      if (!prod) { out.push({ producto: null, filas: [f] }); continue; }
      const ya = porProducto.get(pid);
      if (ya) { ya.filas.push(f); continue; }
      const bloque: Bloque = { producto: prod, filas: [f] };
      porProducto.set(pid, bloque);
      out.push(bloque);
    }
    return out;
  }, [visibles, opciones.productos]);

  const suma = visibles.reduce((s, f) => s + f.monto, 0);
  const sumaTodo = filas.reduce((s, f) => s + f.monto, 0);

  const hayFuera = fuera.no_aprobados.length + fuera.cancelados.length > 0;
  if (filas.length === 0 && !hayFuera) {
    return (
      <div className="mb-4">
        <h3 className="text-sm font-medium text-ink-dim mb-2">Ítems del proyecto</h3>
        <div className="bg-white border border-black/5 rounded-2xl p-6 text-center text-xs text-ink-muted">
          Sin ítems. Edita el proyecto para agregarlos: es lo que el cliente ve en su portal.
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex justify-between items-baseline mb-2 gap-2">
        <h3 className="text-sm font-medium text-ink-dim">Ítems del proyecto</h3>
        <span className="text-[11px] text-ink-muted">
          {pestana !== "" && <>{formatMonto(suma, "MXN")} de </>}
          {formatMonto(sumaTodo, "MXN")}
          {proyecto.precio_venta > 0 && Math.abs(sumaTodo - proyecto.precio_venta) > 0.5 && (
            <span className="text-mauve-900 ml-1">≠ precio venta</span>
          )}
        </span>
      </div>

      {/* Las pestañas. Se enseñan siempre que haya más de una partida: con
          una sola, una fila de pestañas es un adorno que ocupa alto. */}
      {(partidas.length > 1 || hayFuera) && (
        <div className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1" role="tablist" aria-label="Partidas">
          {[{ v: "", t: `Todas (${filas.length})` },
            ...partidas.map((pa) => ({
              v: pa === "" ? SIN : pa,
              t: `${pa === "" ? "Sin partida" : pa} (${filas.filter((f) => f.partida === pa).length})`,
            })),
            ...(fuera.no_aprobados.length ? [{ v: NO_APROBADOS, t: `No aprobados (${fuera.no_aprobados.length})` }] : []),
            ...(fuera.cancelados.length ? [{ v: CANCELADOS, t: `Cancelados (${fuera.cancelados.length})` }] : []),
          ].map((op) => (
            <button
              key={op.v}
              type="button"
              role="tab"
              aria-selected={pestana === op.v}
              onClick={() => setPestana(op.v)}
              className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-xl border ${
                pestana === op.v ? "bg-ink text-cream border-ink" : "bg-white border-black/10 text-ink-dim"
              }`}
            >
              {op.t}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => { setModo(modo === "acomodar" ? "ver" : "acomodar"); setHecho(""); setError(""); }}
          className="text-xs px-2.5 py-1.5 rounded-xl border border-black/10 bg-white text-ink-dim inline-flex items-center gap-1"
        >
          <IconArrowsSort size={13} /> {modo === "acomodar" ? "Dejar de acomodar" : "Acomodar y poner partidas"}
        </button>
        <button
          type="button"
          onClick={() => { setModo(modo === "juntar" ? "ver" : "juntar"); setHecho(""); setError(""); }}
          className="text-xs px-2.5 py-1.5 rounded-xl border border-black/10 bg-white text-ink-dim inline-flex items-center gap-1"
        >
          <IconLayersSubtract size={13} /> {modo === "juntar" ? "Cerrar" : "Juntar los iguales"}
        </button>
      </div>

      {modo === "acomodar" && (
        <Acomodador
          proyectoId={proyecto.id!}
          filas={filas}
          partidas={partidas.filter(Boolean)}
          alGuardar={() => { setModo("ver"); alCambiar(); }}
        />
      )}

      {modo === "juntar" && (
        <Juntador proyectoId={proyecto.id!} alJuntar={() => { setModo("ver"); alCambiar(); }} />
      )}

      {modo === "ver" && (pestana === NO_APROBADOS || pestana === CANCELADOS) && (
        <FueraDelAlcance
          filas={pestana === NO_APROBADOS ? fuera.no_aprobados : fuera.cancelados}
          cual={pestana === NO_APROBADOS ? "no_aprobados" : "cancelados"}
          moviendo={moviendo}
          alMover={mover}
        />
      )}

      {modo === "ver" && pestana !== NO_APROBADOS && pestana !== CANCELADOS && (
        <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream/50 text-xs text-ink-muted uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Ítem</th>
                <th className="text-right px-4 py-2 font-medium">Cant.</th>
                <th className="text-left px-4 py-2 font-medium">Entrega</th>
                <th className="text-right px-4 py-2 font-medium">Importe</th>
                <th className="text-right px-4 py-2 font-medium">Cobrado</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {bloques.map((bloque) =>
                bloque.producto ? (
                  <ProductoEnLaLista
                    key={`pr:${bloque.producto.id}`}
                    producto={bloque.producto}
                    piezas={bloque.filas}
                    abierto={!!abiertos[bloque.producto.id]}
                    alAbrir={() =>
                      setAbiertos((p) => ({ ...p, [bloque.producto!.id]: !p[bloque.producto!.id] }))
                    }
                    opciones={opciones}
                    pestana={pestana}
                    moviendo={moviendo}
                    alMover={mover}
                    alCambiarProducto={cambiarProducto}
                  />
                ) : (
                  bloque.filas.map((pr) => (
                    <FilaDeItem
                      key={pr.id}
                      fila={pr}
                      opciones={opciones}
                      pestana={pestana}
                      moviendo={moviendo}
                      alMover={mover}
                      alCambiarProducto={cambiarProducto}
                    />
                  ))
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {hecho && <p className="text-xs text-mint-900 mt-2">{hecho}</p>}
      {error && <p className="text-xs text-mauve-900 mt-2">{error}</p>}
    </div>
  );
}

/* ─────────────── un renglón de ítem, con su producto ───────────────
 *
 * Mike, 20-sep: «todos los ítems, aparte del tipo de ítem, deberían tener un
 * dropdown para seleccionar qué producto es».
 *
 * El dropdown va DEBAJO DEL NOMBRE y no en una columna propia. La tabla ya
 * trae seis columnas y esta pantalla se usa en el celular: una séptima la
 * manda a desplazarse de lado, y lo que se busca —«¿de qué modelo es esta
 * puerta?»— se lee junto al nombre, no a dos dedos de distancia.
 */
function FilaDeItem({
  fila, opciones, pestana, moviendo, alMover, alCambiarProducto, sangrada = false,
}: {
  fila: Fila;
  opciones: Opciones;
  pestana: string;
  moviendo: string;
  alMover: (id: string, que: "aprobar" | "cancelar", motivo?: string) => void;
  alCambiarProducto: (id: string, escogido: string) => void;
  sangrada?: boolean;
}) {
  const pct = fila.monto > 0 ? Math.min(100, (fila.pagado / fila.monto) * 100) : 0;
  const fe = fila.fecha_entrega as Timestamp | null | undefined;
  return (
    <tr className="border-t border-black/5">
      <td className={`py-3 ${sangrada ? "pl-10 pr-4" : "px-4"}`}>
        <p className="text-sm font-medium text-ink-dim">
          {fila.clave && <span className="text-ink-muted font-normal">{fila.clave} · </span>}
          {fila.nombre}
        </p>
        {fila.descripcion && <p className="text-[11px] text-ink-muted">{fila.descripcion}</p>}
        {pestana === "" && fila.partida && (
          <p className="text-[10px] text-ink-muted uppercase tracking-wide mt-0.5">{fila.partida}</p>
        )}
        <SelectorDeProducto fila={fila} opciones={opciones} ocupado={moviendo === fila.id} alEscoger={alCambiarProducto} />
      </td>
      <td className="text-right px-4 py-3 text-sm text-ink-dim tabular-nums">{fila.cantidad ?? 1}</td>
      <td className="px-4 py-3 text-xs text-ink-muted whitespace-nowrap">
        {fe && typeof fe.toDate === "function" ? formatDateShort(fe.toDate()) : "—"}
      </td>
      <td className="text-right px-4 py-3 text-sm text-ink-dim">
        {formatMonto(fila.monto, "MXN")}
        {(fila.cantidad ?? 1) > 1 && (
          <span className="block text-[10px] text-ink-muted">
            {formatMonto(fila.monto / (fila.cantidad ?? 1), "MXN")} c/u
          </span>
        )}
      </td>
      <td className="text-right px-4 py-3">
        <p className="text-sm text-ink-dim">{formatMonto(fila.pagado ?? 0, "MXN")}</p>
        <div className="flex items-center gap-1.5 justify-end mt-1">
          <div className="w-16 h-1 bg-cream rounded-full overflow-hidden">
            <div className="h-full bg-mint-900" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-ink-muted w-7 text-right">{pct.toFixed(0)}%</span>
        </div>
      </td>
      <td className="px-2 py-3 text-right">
        <Cancelador id={fila.id} nombre={fila.nombre} ocupado={moviendo === fila.id} alCancelar={alMover} />
      </td>
    </tr>
  );
}

/* ─────────────── el producto, como un renglón que se abre ───────────────
 *
 * El encargo original de Mike (§98) era éste: «no tiene caso tener 21 ítems
 * enlistados idénticos en dash». Aquí se cumple sin borrar nada: la lista
 * enseña UN renglón por modelo —«Puerta modelo A · 21 piezas · $178,500»— y
 * quien quiera ver las 21 lo abre.
 *
 * Se abre y no se queda abierto: la lista corta es la que él pidió, y las
 * piezas son el detalle. Adentro, cada pieza trae su código de obra y su
 * propio dropdown, que es como se saca una del grupo.
 */
function ProductoEnLaLista({
  producto, piezas, abierto, alAbrir, opciones, pestana, moviendo, alMover, alCambiarProducto,
}: {
  producto: Producto;
  piezas: Fila[];
  abierto: boolean;
  alAbrir: () => void;
  opciones: Opciones;
  pestana: string;
  moviendo: string;
  alMover: (id: string, que: "aprobar" | "cancelar", motivo?: string) => void;
  alCambiarProducto: (id: string, escogido: string) => void;
}) {
  const cuantas = piezas.reduce((s, f) => s + (f.cantidad ?? 1), 0);
  const monto = piezas.reduce((s, f) => s + f.monto, 0);
  const pagado = piezas.reduce((s, f) => s + (f.pagado ?? 0), 0);
  const pct = monto > 0 ? Math.min(100, (pagado / monto) * 100) : 0;
  return (
    <>
      <tr className="border-t border-black/5 bg-cream/30">
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={alAbrir}
            aria-expanded={abierto}
            className="text-left inline-flex items-start gap-1.5"
          >
            {abierto ? <IconChevronDown size={14} className="mt-0.5 shrink-0" /> : <IconChevronRight size={14} className="mt-0.5 shrink-0" />}
            <span>
              <span className="block text-sm font-medium text-ink-dim">
                {producto.codigo && <span className="text-ink-muted font-normal">{producto.codigo} · </span>}
                {producto.nombre}
              </span>
              <span className="block text-[11px] text-ink-muted">
                {piezas.length} ítem{piezas.length === 1 ? "" : "s"} · {formatMonto(producto.precio / 100, "MXN")} la pieza
                {abierto ? "" : " · toca para ver cuáles"}
              </span>
            </span>
          </button>
        </td>
        <td className="text-right px-4 py-3 text-sm text-ink-dim tabular-nums">{cuantas}</td>
        <td className="px-4 py-3" />
        <td className="text-right px-4 py-3 text-sm font-medium text-ink-dim">{formatMonto(monto, "MXN")}</td>
        <td className="text-right px-4 py-3">
          <p className="text-sm text-ink-dim">{formatMonto(pagado, "MXN")}</p>
          <div className="flex items-center gap-1.5 justify-end mt-1">
            <div className="w-16 h-1 bg-white rounded-full overflow-hidden">
              <div className="h-full bg-mint-900" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-ink-muted w-7 text-right">{pct.toFixed(0)}%</span>
          </div>
        </td>
        <td className="px-2 py-3" />
      </tr>
      {abierto &&
        piezas.map((f) => (
          <FilaDeItem
            key={f.id}
            fila={f}
            opciones={opciones}
            pestana={pestana}
            moviendo={moviendo}
            alMover={alMover}
            alCambiarProducto={alCambiarProducto}
            sangrada
          />
        ))}
    </>
  );
}

/* ─────────────── el dropdown del producto ───────────────
 *
 * Mike, 20-sep: «el dropdown debe tener 1) los ítems que son únicos en el
 * proyecto 2) los productos que ya tienen varios ítems agrupados en el
 * proyecto», más «nuevo si el ítem es su mismo producto único».
 *
 * Las dos listas van en dos grupos con su título, y cada opción DICE SU
 * PRECIO. Es a propósito: escoger cambia el costo del ítem —«adquiere en
 * automático ese costo», pidió él—, y una lista de nombres sin precio deja
 * que alguien mueva el precio de venta del proyecto sin haber visto un
 * número. Después de aplicar, la pantalla dice cuánto se movió.
 */
function SelectorDeProducto({
  fila, opciones, ocupado, alEscoger,
}: {
  fila: Fila;
  opciones: Opciones;
  ocupado: boolean;
  alEscoger: (id: string, escogido: string) => void;
}) {
  const otros = opciones.unicos.filter((u) => u.id !== fila.id);
  if (!opciones.productos.length && !otros.length) return null;
  const valor = fila.producto_id ? `pr:${fila.producto_id}` : SOLO;
  return (
    <label className="block mt-1.5">
      <span className="sr-only">Producto de {fila.nombre}</span>
      <select
        value={valor}
        disabled={ocupado}
        onChange={(e) => alEscoger(fila.id, e.target.value)}
        className="w-full max-w-[16rem] bg-white border border-black/10 rounded-lg px-2 py-1 text-[11px] text-ink-dim focus:outline-none focus:border-ink/40 disabled:opacity-50"
      >
        <option value={SOLO}>Es su propio producto</option>
        {opciones.productos.length > 0 && (
          <optgroup label="Productos de esta obra">
            {opciones.productos.map((p) => (
              <option key={p.id} value={`pr:${p.id}`}>
                {p.nombre} · {p.items ?? 0} ítems · {formatMonto(p.precio / 100, "MXN")} c/u
              </option>
            ))}
          </optgroup>
        )}
        {otros.length > 0 && (
          <optgroup label="El mismo modelo que…">
            {otros.map((u) => (
              <option key={u.id} value={`it:${u.id}`}>
                {u.nombre} · {formatMonto(u.precio_pieza / 100, "MXN")} c/u
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

/* ─────────────── acomodar ─────────────── */

function Acomodador({
  proyectoId, filas, partidas, alGuardar,
}: { proyectoId: string; filas: Fila[]; partidas: string[]; alGuardar: () => void }) {
  const [lista, setLista] = useState<Fila[]>(filas);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= lista.length) return;
    const copia = [...lista];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    setLista(copia);
  };
  const ponerPartida = (id: string, partida: string) =>
    setLista((p) => p.map((f) => (f.id === id ? { ...f, partida } : f)));

  const guardar = async () => {
    setGuardando(true); setError("");
    try {
      /* El orden se manda por posición dentro de su partida, empezando en 1:
       * así dos partidas no comparten numeración y mover una no toca la
       * otra. Se mandan TODOS los renglones, porque acomodar uno cambia el
       * lugar de los que quedan debajo. */
      const cuenta: Record<string, number> = {};
      const items = lista.map((f) => {
        cuenta[f.partida] = (cuenta[f.partida] ?? 0) + 1;
        return { id: f.id, partida: f.partida, orden: cuenta[f.partida] };
      });
      await acomodar(proyectoId, items);
      alGuardar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el acomodo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-white border border-black/5 rounded-2xl p-3">
      <p className="text-xs text-ink-muted mb-2">
        Súbelos y bájalos, y escribe en qué partida va cada uno. <b>Nada se guarda hasta que le
        piques a guardar</b>, y acomodar no cambia ningún precio.
      </p>
      <datalist id="partidas-del-proyecto">
        {partidas.map((pa) => <option key={pa} value={pa} />)}
      </datalist>

      <ul className="space-y-1.5">
        {lista.map((f, i) => (
          <li key={f.id} className="flex items-center gap-1.5 bg-cream/40 rounded-xl p-1.5">
            <div className="flex flex-col">
              <button type="button" aria-label={`Subir ${f.nombre}`} onClick={() => mover(i, -1)}
                disabled={i === 0}
                className="p-0.5 text-ink-muted disabled:opacity-25"><IconArrowUp size={13} /></button>
              <button type="button" aria-label={`Bajar ${f.nombre}`} onClick={() => mover(i, 1)}
                disabled={i === lista.length - 1}
                className="p-0.5 text-ink-muted disabled:opacity-25"><IconArrowDown size={13} /></button>
            </div>
            <span className="text-xs text-ink-dim flex-1 min-w-0 truncate">{f.nombre}</span>
            <input
              type="text"
              list="partidas-del-proyecto"
              value={f.partida}
              onChange={(e) => ponerPartida(f.id, e.target.value)}
              placeholder="Partida"
              aria-label={`Partida de ${f.nombre}`}
              className="w-28 bg-white border border-black/10 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-ink/40"
            />
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2 mt-3">
        <button type="button" onClick={guardar} disabled={guardando}
          className="bg-ink text-white text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40">
          <IconCheck size={13} /> {guardando ? "Guardando…" : "Guardar el acomodo"}
        </button>
        <button type="button" onClick={() => setLista(filas)} className="text-xs text-ink-muted px-2 py-2">
          Deshacer
        </button>
      </div>
      {error && <p className="text-xs text-mauve-900 mt-2">{error}</p>}
    </div>
  );
}

/* ─────────────── juntar los iguales ─────────────── */

function Juntador({ proyectoId, alJuntar }: { proyectoId: string; alJuntar: () => void }) {
  const [grupos, setGrupos] = useState<GrupoDeItems[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [fuera, setFuera] = useState<Record<string, boolean>>({});
  const [nombres, setNombres] = useState<Record<string, string>>({});
  /** El precio del modelo, en PESOS y como texto: es un campo que se teclea.
   *  Vacío quiere decir «el que traen», que es lo que propone la API. */
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [juntando, setJuntando] = useState("");

  const traer = async () => {
    setCargando(true); setError("");
    try { setGrupos(await agrupables(proyectoId)); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo ver qué se parece."); }
    finally { setCargando(false); }
  };
  useEffect(() => { void traer(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [proyectoId]);

  const juntar = async (g: GrupoDeItems) => {
    const escogidos = g.items.filter((i) => !fuera[i.id]);
    if (escogidos.length < 2) return;
    const llave = g.items[0].id;
    setJuntando(llave); setError("");
    try {
      const tecleado = (precios[llave] ?? "").trim();
      await agrupar(proyectoId, {
        items: escogidos.map((i) => i.id),
        nombre: nombres[llave]?.trim() || undefined,
        // El precio viaja en centavos, como todo el dinero de la API.
        precio: tecleado === "" ? undefined : Math.round(Number(tecleado) * 100),
      });
      alJuntar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron agrupar.");
    } finally {
      setJuntando("");
    }
  };

  if (cargando) return <p className="text-xs text-ink-muted">Viendo cuáles son el mismo producto…</p>;
  if (error && !grupos) return <p className="text-xs text-mauve-900">{error}</p>;
  if (!grupos?.length) {
    return (
      <p className="text-xs text-ink-muted bg-white border border-black/5 rounded-2xl p-4">
        No hay renglones repetidos: cada ítem se llama distinto o cuesta distinto. Dos que se
        llaman igual y cuestan distinto no se ofrecen a propósito —o no son lo mismo, o hay un
        precio mal, y juntarlos escondería el error en un promedio—.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {grupos.map((g) => {
        const llave = g.items[0].id;
        const escogidos = g.items.filter((i) => !fuera[i.id]);
        const piezas = escogidos.reduce((s, i) => s + i.cantidad, 0);
        const monto = escogidos.reduce((s, i) => s + i.monto, 0);
        /* Lo que va a costar el grupo con el precio que se teclee, y cuánto
         * mueve eso el precio de venta. Se saca aquí, antes de aplicar:
         * enterarse de que la venta bajó por el total del mes es tarde. */
        const tecleado = (precios[llave] ?? "").trim();
        const porPieza = tecleado === "" ? g.precio_pieza : Math.round(Number(tecleado) * 100);
        const nuevoTotal = Number.isFinite(porPieza) ? porPieza * piezas : monto;
        const delta = nuevoTotal - monto;
        return (
          <div key={llave} className="bg-white border border-black/5 rounded-2xl p-3">
            <p className="text-xs text-ink-dim">
              <b>{g.renglones} renglones</b> de «{g.nombre}», a {pesos(g.precio_pieza)} la pieza.
            </p>
            <ul className="mt-2 space-y-1">
              {g.items.map((i) => (
                <li key={i.id} className="flex items-center gap-2 text-xs text-ink-dim">
                  <input
                    type="checkbox"
                    checked={!fuera[i.id]}
                    onChange={() => setFuera((p) => ({ ...p, [i.id]: !p[i.id] }))}
                    aria-label={`Juntar ${i.clave ?? ""} ${i.nombre}`}
                  />
                  <span className="flex-1 min-w-0 truncate">
                    {i.clave ? `${i.clave} · ` : ""}{i.nombre}
                    {i.cantidad > 1 ? ` · ${i.cantidad} piezas` : ""}
                  </span>
                  <span className="text-ink-muted tabular-nums">{pesos(i.monto)}</span>
                  {i.ubicados > 0 && (
                    <span className="text-[10px] text-ink-muted">{i.ubicados} en plano</span>
                  )}
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <input
                type="text"
                value={nombres[llave] ?? ""}
                onChange={(e) => setNombres((p) => ({ ...p, [llave]: e.target.value }))}
                placeholder={`Nombre del modelo (hoy: ${g.nombre})`}
                aria-label="Nombre del producto"
                className="bg-white border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-ink/40"
              />
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={precios[llave] ?? ""}
                onChange={(e) => setPrecios((p) => ({ ...p, [llave]: e.target.value }))}
                placeholder={`Precio por pieza (hoy: ${(g.precio_pieza / 100).toFixed(2)})`}
                aria-label="Precio por pieza del producto"
                className="bg-white border border-black/10 rounded-lg px-2 py-1.5 text-xs tabular-nums focus:outline-none focus:border-ink/40"
              />
            </div>

            <p className="text-[11px] text-ink-muted mt-2">
              Quedan <b>{escogidos.length} renglones</b> apuntando al mismo modelo,{" "}
              {piezas} pieza{piezas === 1 ? "" : "s"} por {pesos(nuevoTotal)}.
              Cada pieza sigue siendo la suya, con su código de obra y su seguimiento en el
              plano, y se puede sacar del grupo cuando quieras.
              {delta === 0
                ? " El precio de venta del proyecto no se mueve."
                : ` El precio de venta del proyecto ${delta > 0 ? "sube" : "baja"} ${pesos(Math.abs(delta))}.`}
            </p>

            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => juntar(g)}
                disabled={escogidos.length < 2 || juntando === llave}
                className="bg-ink text-white text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40"
              >
                <IconCheck size={13} />
                {juntando === llave ? "Juntando…" : `Juntar ${escogidos.length}`}
              </button>
              {escogidos.length < 2 && (
                <span className="text-[11px] text-ink-muted inline-flex items-center gap-1">
                  <IconX size={12} /> Hacen falta dos.
                </span>
              )}
            </div>
          </div>
        );
      })}
      {error && <p className="text-xs text-mauve-900">{error}</p>}
    </div>
  );
}

/* ─────────────── fuera del alcance ───────────────
 *
 * Mike, 20-sep: «en la pestaña de partida de ítems fuera de alcance,
 * dividirlos entre "no aprobados" y "Cancelados"». Son dos listas y no una
 * con etiquetas porque significan cosas distintas: de una hay que decidir
 * —entra o no entra—, y la otra es historia, para consultarse.
 *
 * Los DESCARTADOS —lo que se quitó sin haber estado aprobado nunca— no salen
 * en «Cancelados»: nunca fueron una venta, y meterlos ahí diría que se echó
 * para atrás algo que jamás se cerró. Esa es la regla de Mike, y la contesta
 * la API.
 */
function FueraDelAlcance({
  filas, cual, moviendo, alMover,
}: {
  filas: ItemFuera[];
  cual: "no_aprobados" | "cancelados";
  moviendo: string;
  alMover: (id: string, que: "aprobar" | "cancelar", motivo?: string) => void;
}) {
  const suma = filas.reduce((s, f) => s + f.monto, 0);
  return (
    <div className="bg-white border border-black/5 rounded-2xl p-3">
      <p className="text-xs text-ink-muted mb-2">
        {cual === "no_aprobados" ? (
          <>Tienen precio y toda su información, pero <b>no cuentan</b> en el precio de venta y no
          salen en el plano de la obra hasta que los apruebes. Suman {formatMonto(suma, "MXN")} si
          entraran todos.</>
        ) : (
          <>Estuvieron aprobados y se cancelaron, así que ya no cuentan. Se quedan aquí para
          poder consultarlos; si alguno se revive, vuelve a sumar.</>
        )}
      </p>

      <ul className="divide-y divide-black/5">
        {filas.map((f) => (
          <li key={f.id} className="py-2 flex flex-wrap items-center gap-2">
            <span className="text-sm text-ink-dim flex-1 min-w-[10rem]">
              {f.clave ? <span className="text-ink-muted">{f.clave} · </span> : null}
              {f.nombre}
              {f.cantidad > 1 ? <span className="text-ink-muted"> · {f.cantidad} piezas</span> : null}
              {f.descripcion ? <span className="block text-[11px] text-ink-muted">{f.descripcion}</span> : null}
              {f.motivo ? <span className="block text-[11px] text-ink-muted">Motivo: {f.motivo}</span> : null}
            </span>
            <span className="text-sm text-ink-dim tabular-nums">{formatMonto(f.monto, "MXN")}</span>
            {cual === "no_aprobados" ? (
              <span className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => alMover(f.id, "aprobar")}
                  disabled={moviendo === f.id}
                  className="bg-ink text-white text-[11px] px-2 py-1 rounded-lg inline-flex items-center gap-1 disabled:opacity-40"
                >
                  <IconThumbUp size={12} /> Aprobar
                </button>
                <Cancelador id={f.id} nombre={f.nombre} ocupado={moviendo === f.id} alCancelar={alMover} etiqueta="Descartar" />
              </span>
            ) : (
              <button
                type="button"
                onClick={() => alMover(f.id, "aprobar")}
                disabled={moviendo === f.id}
                className="text-[11px] px-2 py-1 rounded-lg border border-black/10 text-ink-dim disabled:opacity-40"
              >
                Revivir
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Cancelar en dos pasos, con su motivo.
 *
 *  Dos pasos porque no se puede deshacer solo: cancelar saca el ítem del
 *  precio de venta. Y con motivo porque tres meses después «por qué se cayó
 *  esto» no tiene otra respuesta; se guarda en el ítem, no en la cabeza de
 *  quien lo canceló. */
function Cancelador({
  id, nombre, ocupado, alCancelar, etiqueta = "Cancelar",
}: {
  id: string;
  nombre: string;
  ocupado: boolean;
  alCancelar: (id: string, que: "aprobar" | "cancelar", motivo?: string) => void;
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={ocupado}
        aria-label={`${etiqueta} ${nombre}`}
        className="text-[11px] px-2 py-1 rounded-lg border border-black/10 text-ink-muted disabled:opacity-40 inline-flex items-center gap-1"
      >
        <IconBan size={12} /> {etiqueta}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="text"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="¿Por qué?"
        aria-label={`Motivo para ${etiqueta.toLowerCase()} ${nombre}`}
        className="w-28 bg-white border border-black/10 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:border-ink/40"
      />
      <button
        type="button"
        onClick={() => { alCancelar(id, "cancelar", motivo); setAbierto(false); setMotivo(""); }}
        disabled={ocupado}
        className="bg-mauve-900 text-white text-[11px] px-2 py-1 rounded-lg disabled:opacity-40"
      >
        {ocupado ? "…" : "Confirmar"}
      </button>
      <button type="button" onClick={() => setAbierto(false)} className="text-[11px] text-ink-muted px-1">
        <IconX size={12} />
      </button>
    </span>
  );
}
