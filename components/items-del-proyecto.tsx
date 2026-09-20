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
import { IconArrowUp, IconArrowDown, IconCheck, IconX, IconArrowsSort, IconLayersSubtract, IconThumbUp, IconBan, IconChevronDown, IconChevronRight, IconArrowsSplit, IconEdit, IconPlus, IconMinus } from "@tabler/icons-react";
import {
  acomodar, agrupables, agrupar, aprobarItem, asignarProducto, cancelarItem, productosDelProyecto,
  separarItem, separarProducto,
  type GrupoDeItems, type ItemUnico, type Producto,
} from "@/lib/items-grupo";
import { fueraDeAlcance } from "@/lib/api/leer";
import type { ItemFuera } from "@/lib/api/leer";
import { formatDateShort, formatMonto } from "@/lib/format";
import type { ItemProyecto, Proyecto } from "@/types/schema";
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
/** En el gestor de ítems: escribir un producto nuevo en vez de entrar a uno. */
const NUEVO = "__nuevo__";

/** Las dos listas del dropdown que pidió Mike: los productos que ya se usan
 *  en la obra, y los ítems que todavía son su propio producto único. */
type Opciones = { productos: Producto[]; unicos: ItemUnico[] };
/** Un renglón de la tabla: un producto con sus piezas, o un ítem suelto. */
type Bloque = { producto: Producto | null; filas: Fila[] };
/** El dinero de la API viaja en CENTAVOS; el de `proyecto.items` ya viene en
 *  pesos. Esta es la única conversión de esta pantalla, y es de ida. */
const pesos = (centavos: number) => formatMonto(Math.round(centavos) / 100, "MXN");

type Fila = ItemProyecto & { partida: string; orden: number };

export function ItemsDelProyecto({ proyecto, alCambiar, alEditarLista }: {
  proyecto: Proyecto;
  alCambiar: () => void;
  /** Abre el formulario en la parte de los ítems. Mike, 20-sep, con la
   *  pantalla enfrente: «el botón de editar de arriba debería ser para la
   *  info del proyecto. Abajo en la sección de la lista de ítems debería
   *  haber otro botón de editar para editar la lista». Va aquí, junto a
   *  acomodar y agrupar, que es donde se trabaja la lista. */
  alEditarLista?: () => void;
}) {
  const items: ItemProyecto[] = useMemo(() => proyecto.items ?? [], [proyecto.items]);
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
  useEffect(() => { void traerFuera(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [proyecto.id, proyecto.items]);

  /* Las opciones del dropdown y qué productos hay en la obra. Se vuelven a
   * pedir cuando cambia la lista: agrupar escribe un producto nuevo, y
   * sacar la última pieza de uno lo deja sin usarse. */
  const traerOpciones = async () => {
    try { setOpciones(await productosDelProyecto(proyecto.id!)); }
    catch { setOpciones({ productos: [], unicos: [] }); }
  };
  useEffect(() => { void traerOpciones(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [proyecto.id, proyecto.items]);

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

  /** Separar: sacar del grupo, y devolver los renglones que la fusión vieja
   *  borró. Mike, 20-sep: «sepárame todos los ítems de puertas otra vez».
   *
   *  `que` es o un producto entero —sus piezas salen todas— o un renglón
   *  fusionado, que se parte de vuelta en los que se tragó. */
  const separar = async (que: { producto: string } | { item: string }) => {
    const id = "producto" in que ? que.producto : que.item;
    setMoviendo(id); setError(""); setHecho("");
    try {
      const r = "producto" in que
        ? await separarProducto(proyecto.id!, que.producto)
        : await separarItem(que.item);
      const delta = (r.venta_despues - r.venta_antes) / 100;
      const partes = [
        r.separados ? `${r.separados} ${r.separados === 1 ? "ítem salió" : "ítems salieron"} del grupo` : "",
        r.reconstruidos ? `volvieron ${r.reconstruidos} ${r.reconstruidos === 1 ? "renglón" : "renglones"} que la versión anterior había borrado` : "",
        r.piezas_repartidas ? `y ${r.piezas_repartidas} ${r.piezas_repartidas === 1 ? "pieza del plano se fue" : "piezas del plano se fueron"} con el suyo` : "",
      ].filter(Boolean);
      setHecho(
        `${partes.join(", ")}. ` +
        (delta === 0
          ? "El precio de venta del proyecto no se movió."
          : `OJO: el precio de venta ${delta > 0 ? "subió" : "bajó"} ${formatMonto(Math.abs(delta), "MXN")}.`),
      );
      await traerOpciones();
      alCambiar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo separar.");
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
    const puestas = items.map((p, i) => ({
      ...p, partida: (p.partida ?? "").trim(), orden: Number(p.orden ?? 0) || 0, _i: i,
    }));
    return puestas
      .sort((a, b) => a.partida.localeCompare(b.partida, "es") || a.orden - b.orden || a._i - b._i)
      .map(({ _i, ...f }) => { void _i; return f; });
  }, [items]);

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
        <div className="bg-white border border-black/5 rounded-2xl p-6 text-center">
          <p className="text-xs text-ink-muted">
            Sin ítems todavía. Son los que el cliente ve en su portal.
          </p>
          {/* El botón va TAMBIÉN aquí, y es el caso donde más falta hace: sin
              ítems no se dibuja la tabla, y con ella se iba el único camino
              para capturar el primero. Lo cachó la puerta de despliegue el
              20-sep, no un usuario. */}
          {alEditarLista && (
            <button
              type="button"
              onClick={alEditarLista}
              className="mt-3 text-xs px-3 py-1.5 rounded-xl border border-black/10 bg-white text-ink-dim inline-flex items-center gap-1 hover:border-black/25"
            >
              <IconEdit size={13} /> Editar la lista
            </button>
          )}
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

      <div className="flex gap-2 mb-2 flex-wrap">
        {alEditarLista && (
          <button
            type="button"
            onClick={alEditarLista}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-black/10 bg-white text-ink-dim inline-flex items-center gap-1"
          >
            <IconEdit size={13} /> Editar la lista
          </button>
        )}
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
          <IconLayersSubtract size={13} /> {modo === "juntar" ? "Cerrar" : "Agrupar en productos"}
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
        <Juntador
          proyectoId={proyecto.id!}
          filas={visibles}
          opciones={opciones}
          alJuntar={() => { setModo("ver"); alCambiar(); }}
        />
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
                    alSeparar={separar}
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
                      alSeparar={separar}
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
  fila, opciones, pestana, moviendo, alMover, alCambiarProducto, alSeparar, sangrada = false,
}: {
  fila: Fila;
  opciones: Opciones;
  pestana: string;
  moviendo: string;
  alMover: (id: string, que: "aprobar" | "cancelar", motivo?: string) => void;
  alCambiarProducto: (id: string, escogido: string) => void;
  alSeparar: (que: { producto: string } | { item: string }) => void;
  sangrada?: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const pct = fila.monto > 0 ? Math.min(100, (fila.pagado / fila.monto) * 100) : 0;
  const fe = fila.fecha_entrega as Timestamp | null | undefined;
  const fusionados = fila.fusionados ?? 0;
  return (
    <>
      <tr className="border-t border-black/5">
        <td className={`py-3 ${sangrada ? "pl-10 pr-4" : "px-4"}`}>
          <div className="flex items-start gap-2">
            {/* El «+». Mike, 20-sep: «oculta la descripción en la lista, sólo
                que se abra con un signo de más para desplegar más info». Es
                un botón de verdad y no un div: así se llega con el teclado y
                el lector de pantalla dice si está abierto o cerrado. */}
            <button
              type="button"
              onClick={() => setAbierta((v) => !v)}
              aria-expanded={abierta}
              aria-label={abierta ? `Ocultar el detalle de ${fila.nombre}` : `Ver el detalle de ${fila.nombre}`}
              className="mt-0.5 shrink-0 w-5 h-5 rounded-md border border-black/10 bg-white text-ink-muted inline-flex items-center justify-center hover:border-black/25"
            >
              {abierta ? <IconMinus size={11} /> : <IconPlus size={11} />}
            </button>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-dim">
                {fila.clave && <span className="text-ink-muted font-normal">{fila.clave} · </span>}
                {fila.nombre}
              </p>
              {pestana === "" && fila.partida && (
                <p className="text-[10px] text-ink-muted uppercase tracking-wide mt-0.5">{fila.partida}</p>
              )}
            </div>
          </div>
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
        <td className="px-2 py-3 text-right">
          <Cancelador id={fila.id} nombre={fila.nombre} ocupado={moviendo === fila.id} alCancelar={alMover} />
        </td>
      </tr>

      {/* Lo que estaba estorbando en la lista: la descripción, lo cobrado y
          el selector de producto. Mike los pidió aquí, detrás del «+». */}
      {abierta && (
        <tr className="border-t border-black/5 bg-cream/20">
          <td colSpan={5} className={`py-3 ${sangrada ? "pl-16 pr-4" : "px-4"}`}>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1">Descripción</p>
                <p className="text-xs text-ink-dim">{fila.descripcion || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1">Cobrado</p>
                <p className="text-sm text-ink-dim">{formatMonto(fila.pagado ?? 0, "MXN")}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="flex-1 max-w-[6rem] h-1 bg-white rounded-full overflow-hidden">
                    <div className="h-full bg-mint-900" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] text-ink-muted">{pct.toFixed(0)}%</span>
                </div>
              </div>
              <div className="sm:col-span-3">
                <p className="text-[10px] text-ink-muted uppercase tracking-wide mb-1">De qué producto es</p>
                <SelectorDeProducto
                  fila={fila}
                  opciones={opciones}
                  ocupado={moviendo === fila.id}
                  alEscoger={alCambiarProducto}
                />
                {fusionados > 0 && (
                  <div className="mt-2 text-[11px] text-mauve-900">
                    <p>Este renglón se tragó {fusionados} más cuando juntar borraba renglones.</p>
                    <button
                      type="button"
                      onClick={() => alSeparar({ item: fila.id })}
                      disabled={moviendo === fila.id}
                      className="mt-1 inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl border border-mauve-900/30 bg-white text-mauve-900 disabled:opacity-40"
                    >
                      <IconArrowsSplit size={13} />
                      {moviendo === fila.id ? "Separando…" : `Separar en ${fusionados + 1} renglones`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
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
  producto, piezas, abierto, alAbrir, opciones, pestana, moviendo, alMover, alCambiarProducto, alSeparar,
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
  alSeparar: (que: { producto: string } | { item: string }) => void;
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
                {" · "}{formatMonto(pagado, "MXN")} cobrado
                {abierto ? "" : " · toca para ver cada pieza y cambiarla de producto"}
              </span>
            </span>
          </button>
        </td>
        <td className="text-right px-4 py-3 text-sm text-ink-dim tabular-nums">{cuantas}</td>
        <td className="px-4 py-3" />
        <td className="text-right px-4 py-3 text-sm font-medium text-ink-dim">
          {formatMonto(monto, "MXN")}
          <span className="flex items-center gap-1.5 justify-end mt-1">
            <span className="w-16 h-1 bg-white rounded-full overflow-hidden block">
              <span className="h-full bg-mint-900 block" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-[10px] text-ink-muted w-7 text-right">{pct.toFixed(0)}%</span>
          </span>
        </td>
        <td className="px-2 py-3 text-right">
          {/* Sacar las piezas del grupo de un golpe. Mike, 20-sep:
              «sepárame todos los ítems de puertas otra vez». De una en una
              son 29 clics, y ése era justo el problema. No se pierde nada:
              cada pieza se queda con su precio y vuelve a ser su propio
              producto único. */}
          <button
            type="button"
            onClick={() => alSeparar({ producto: producto.id })}
            disabled={moviendo === producto.id}
            title={`Sacar las ${piezas.length} piezas de «${producto.nombre}»`}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-black/10 bg-white text-ink-dim disabled:opacity-40"
          >
            <IconArrowsSplit size={12} />
            {moviendo === producto.id ? "Separando…" : "Separar"}
          </button>
        </td>
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
            alSeparar={alSeparar}
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

/* ─────────────── gestionar los ítems: a qué producto va cada uno ───────────────
 *
 * Mike, 20-sep: «la lista debe ser de TODOS los ítems, sean o no similares.
 * Todo está en gestionar los ítems ya existentes». Y: «donde dice nombre del
 * modelo debería poderse hacer uno nuevo, o seleccionar agregar a alguno ya
 * existente. Al asignarlo a un producto existente, adopta en automático el
 * precio del producto al que se agrupa».
 *
 * ANTES esto enseñaba sólo los montones que el parecido adivinaba, y si tus
 * puertas no caían en uno, no había manera de tocarlas desde aquí. Ahora
 * enseña la lista completa y quien decide marca; el parecido se queda, pero
 * como ATAJO —un botón que marca un montón de un golpe—, no como la
 * estructura de la pantalla.
 *
 * Lo que más cuidado necesita es el dinero: meter 25 puertas de $0 a un
 * modelo de $2,850 sube el precio de venta de la obra en $71,250. Está bien
 * que suba —es lo que se está pidiendo— y por eso el renglón de consecuencia
 * lo dice con el número antes de aplicar, no después.
 */
function Juntador({
  proyectoId, filas, opciones, alJuntar,
}: {
  proyectoId: string;
  filas: Fila[];
  opciones: Opciones;
  alJuntar: () => void;
}) {
  const [sugerencias, setSugerencias] = useState<GrupoDeItems[]>([]);
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  /** `NUEVO` o el id de un producto que ya existe. */
  const [destino, setDestino] = useState<string>(NUEVO);
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    agrupables(proyectoId)
      .then((g) => { if (vivo) setSugerencias(g); })
      .catch(() => { if (vivo) setSugerencias([]); });
    return () => { vivo = false; };
  }, [proyectoId]);

  const escogidos = filas.filter((f) => marcados[f.id]);
  const piezas = escogidos.reduce((s, f) => s + (f.cantidad ?? 1), 0);
  const montoHoy = escogidos.reduce((s, f) => s + f.monto, 0);

  /* El precio por pieza que van a tener. Si el destino es un producto que ya
   * existe, es el suyo y no se discute. Si es nuevo y no se teclea nada, la
   * API se queda con el más caro del montón: un promedio inventaría un
   * número que nadie cotizó. En PESOS aquí; a centavos al mandar. */
  const productoDestino = opciones.productos.find((p) => p.id === destino);
  const tecleado = precio.trim();
  const porPiezaPesos = productoDestino
    ? productoDestino.precio / 100
    : tecleado !== ""
      ? Number(tecleado)
      : Math.max(0, ...escogidos.map((f) => f.monto / (f.cantidad ?? 1)));
  const montoNuevo = Number.isFinite(porPiezaPesos) ? porPiezaPesos * piezas : montoHoy;
  const delta = montoNuevo - montoHoy;

  const aplicar = async () => {
    if (escogidos.length < 2 && !productoDestino) return;
    if (!escogidos.length) return;
    setGuardando(true); setError("");
    try {
      await agrupar(proyectoId, {
        items: escogidos.map((f) => f.id),
        ...(productoDestino
          ? { producto_id: productoDestino.id }
          : { nombre: nombre.trim() || undefined, precio: tecleado === "" ? undefined : Math.round(Number(tecleado) * 100) }),
      });
      setMarcados({});
      alJuntar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron agrupar.");
    } finally {
      setGuardando(false);
    }
  };

  if (!filas.length) {
    return <p className="text-xs text-ink-muted bg-white border border-black/5 rounded-2xl p-4">No hay ítems en esta vista.</p>;
  }

  return (
    <div className="bg-white border border-black/5 rounded-2xl p-3 space-y-3">
      {/* El parecido, como atajo. Marca un montón de un golpe; lo que se
          agrupa sigue siendo lo que quede marcado abajo. */}
      {sugerencias.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-baseline">
          <span className="text-[11px] text-ink-muted">Se parecen:</span>
          {sugerencias.map((g) => (
            <button
              key={g.items[0].id}
              type="button"
              onClick={() => setMarcados(Object.fromEntries(g.items.map((i) => [i.id, true])))}
              className="text-[11px] px-2 py-1 rounded-lg border border-black/10 bg-cream/40 text-ink-dim hover:border-black/25"
            >
              {g.renglones} × «{g.nombre}» a {pesos(g.precio_pieza)}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 text-[11px]">
        <button type="button" onClick={() => setMarcados(Object.fromEntries(filas.map((f) => [f.id, true])))}
          className="text-ink-dim hover:underline">Marcar todos</button>
        <button type="button" onClick={() => setMarcados({})} className="text-ink-dim hover:underline">Ninguno</button>
      </div>

      {/* TODOS los ítems de la vista, se parezcan o no. */}
      <ul className="max-h-80 overflow-y-auto divide-y divide-black/5 border-y border-black/5">
        {filas.map((f) => {
          const suyo = opciones.productos.find((p) => p.id === f.producto_id);
          return (
            <li key={f.id} className="flex items-center gap-2 py-1.5 text-xs text-ink-dim">
              <input
                type="checkbox"
                checked={!!marcados[f.id]}
                onChange={() => setMarcados((p) => ({ ...p, [f.id]: !p[f.id] }))}
                aria-label={`Agrupar ${f.clave ?? ""} ${f.nombre}`}
              />
              <span className="flex-1 min-w-0 truncate">
                {f.clave && <span className="text-ink-muted">{f.clave} · </span>}
                {f.nombre}
                {(f.cantidad ?? 1) > 1 && <span className="text-ink-muted"> · {f.cantidad} piezas</span>}
              </span>
              <span className="text-[10px] text-ink-muted shrink-0">
                {suyo ? suyo.nombre : "suelto"}
              </span>
              <span className="text-ink-muted tabular-nums shrink-0">
                {formatMonto(f.monto / (f.cantidad ?? 1), "MXN")}
              </span>
            </li>
          );
        })}
      </ul>

      {/* A qué producto van: uno nuevo, o uno que ya existe. */}
      <div className="space-y-2">
        <label className="block">
          <span className="text-[11px] text-ink-muted">A qué producto van</span>
          <select
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            className="w-full mt-1 bg-white border border-black/10 rounded-lg px-2 py-1.5 text-xs text-ink-dim focus:outline-none focus:border-ink/40"
          >
            <option value={NUEVO}>Un producto nuevo</option>
            {opciones.productos.length > 0 && (
              <optgroup label="Agregar a uno que ya existe">
                {opciones.productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · {p.items ?? 0} ítems · {formatMonto(p.precio / 100, "MXN")} c/u
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>

        {productoDestino ? (
          <p className="text-[11px] text-ink-muted">
            Toman el precio de «{productoDestino.nombre}»: {formatMonto(productoDestino.precio / 100, "MXN")} la
            pieza. El nombre y el precio del modelo no se tocan desde aquí.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del modelo" aria-label="Nombre del producto nuevo"
              className="bg-white border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-ink/40"
            />
            <input
              type="number" inputMode="decimal" min={0} step="0.01"
              value={precio} onChange={(e) => setPrecio(e.target.value)}
              placeholder="Precio por pieza" aria-label="Precio por pieza del producto nuevo"
              className="bg-white border border-black/10 rounded-lg px-2 py-1.5 text-xs tabular-nums focus:outline-none focus:border-ink/40"
            />
          </div>
        )}
      </div>

      {escogidos.length > 0 && (
        <p className="text-[11px] text-ink-muted">
          <b>{escogidos.length} ítems</b>, {piezas} pieza{piezas === 1 ? "" : "s"}, quedan en{" "}
          {productoDestino ? `«${productoDestino.nombre}»` : "un modelo nuevo"} por {formatMonto(montoNuevo, "MXN")}.
          Cada pieza sigue siendo la suya, con su código de obra y su seguimiento en el plano, y se puede sacar
          del grupo cuando quieras.
          {delta === 0
            ? " El precio de venta del proyecto no se mueve."
            : ` OJO: el precio de venta ${delta > 0 ? "sube" : "baja"} ${formatMonto(Math.abs(delta), "MXN")}.`}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={aplicar}
          disabled={guardando || escogidos.length === 0 || (!productoDestino && escogidos.length < 2)}
          className="bg-ink text-white text-xs px-3 py-2 rounded-xl inline-flex items-center gap-1 disabled:opacity-40"
        >
          <IconCheck size={13} />
          {guardando ? "Agrupando…" : `Agrupar ${escogidos.length}`}
        </button>
        {!productoDestino && escogidos.length === 1 && (
          <span className="text-[11px] text-ink-muted inline-flex items-center gap-1">
            <IconX size={12} /> Para un modelo nuevo hacen falta dos; con uno solo, escoge un producto que ya exista.
          </span>
        )}
      </div>
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
