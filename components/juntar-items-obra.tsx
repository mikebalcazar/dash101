"use client";

/* Juntar los ítems del proyecto con las piezas del plano · contrato 0.28.0.
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
 * Y lo que de verdad los hace uno es el CÓDIGO, no el nombre. Mike lo
 * precisó: «lo que va a ser lo mismo es el código de ítem, ej. CAR-01,
 * PT-09, porque el nombre descriptivo viene en el detalle de dash y en el
 * detalle de quell». Así que el código se unifica, y el nombre sólo si
 * alguien lo escoge.
 */

import { useEffect, useMemo, useState } from "react";
import { IconExternalLink, IconCheck, IconAlertTriangle } from "@tabler/icons-react";
import {
  fusionarItemsDeLaObra, itemsDeLaObra, urlObra,
  type LigaDeItem, type Obra, type PropuestaDeItems,
} from "@/lib/obras";
import { formatMonto } from "@/lib/format";

/** El dinero llega en CENTAVOS de la API; aquí se pinta en pesos, una vez. */
const pesos = (centavos: number) => formatMonto(Math.round(centavos) / 100, "MXN");

/** Lo que se decidió para una pieza. `item` vacío = no hacer nada con ella;
 *  `nuevo` = crearle su propio ítem. */
type Decision = { item: string; clave?: "quell" | "dash"; nombre?: "quell" | "dash" };
const NUEVO = "__nuevo__";

export function JuntarItemsDeLaObra({ obra, alTerminar }: { obra: Obra; alTerminar: () => void }) {
  const [prop, setProp] = useState<PropuestaDeItems | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState("");
  const [decidido, setDecidido] = useState<Record<string, Decision>>({});

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
      const crear: string[] = [];
      for (const pz of piezas) {
        const d = decidido[pz.element_id];
        if (!d || !d.item) continue;
        if (d.item === NUEVO) crear.push(pz.element_id);
        else ligar.push({ element_id: pz.element_id, item_id: d.item, clave: d.clave, nombre: d.nombre });
      }
      const r = await fusionarItemsDeLaObra(obra.id, { ligar, crear });
      const partes = [
        `${r.ligados} pieza${r.ligados === 1 ? "" : "s"} quedó${r.ligados === 1 ? "" : "aron"} con su ítem`,
        r.creados ? `${r.creados} ítem${r.creados === 1 ? "" : "s"} nuevo${r.creados === 1 ? "" : "s"}, sin precio todavía` : "",
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
                  onChange={(e) => cambiar(pz.element_id, { item: e.target.value, clave: undefined, nombre: undefined })}
                  className="flex-1 min-w-[12rem] bg-white border border-black/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-ink/40"
                >
                  <option value="">— No hacer nada con ésta —</option>
                  <option value={NUEVO}>Crearle su ítem, sin precio</option>
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

              {/* El código es la identidad, y sólo hay que decidir cuando los
                  dos lados traen uno distinto. Cuando falta de un lado, la
                  API lo copia sin preguntar: eso es llenar un hueco. */}
              {chocanClaves && (
                <div className="mt-1.5 text-[11px] text-ink-dim">
                  <span className="inline-flex items-center gap-1 text-pend-900">
                    <IconAlertTriangle size={12} /> Dos códigos distintos. ¿Cuál queda en los dos lados?
                  </span>
                  <div className="flex gap-1.5 mt-1">
                    {(["quell", "dash"] as const).map((lado) => (
                      <button
                        key={lado}
                        type="button"
                        onClick={() => cambiar(pz.element_id, { clave: lado })}
                        className={`px-2 py-1 rounded-lg border text-[11px] ${
                          d.clave === lado ? "bg-ink text-cream border-ink" : "bg-white border-black/10 text-ink-dim"
                        }`}
                      >
                        {lado === "quell" ? `${clavePieza} (plano)` : `${claveItem} (proyecto)`}
                      </button>
                    ))}
                    {d.clave && (
                      <button type="button" onClick={() => cambiar(pz.element_id, { clave: undefined })}
                        className="px-2 py-1 text-[11px] text-ink-muted">Dejar cada uno</button>
                    )}
                  </div>
                </div>
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

      {excedidos.length > 0 && (
        <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl mt-3">
          {excedidos.map((c) => `«${c.nombre}» admite ${c.cupo} pieza${c.cupo === 1 ? "" : "s"} y escogiste ${usos[c.id]}`).join(". ")}.
          Quítale a alguna antes de aplicar.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button
          type="button"
          onClick={aplicar}
          disabled={guardando || cuantas === 0 || excedidos.length > 0}
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
