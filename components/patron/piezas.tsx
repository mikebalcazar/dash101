"use client";

/* Las piezas de patron101 dentro de dash101: quién soy y qué día es, el
 * formulario de condiciones (con la tabla que resulta, en vivo), la tabla de
 * pagos, los papeles y la bitácora de un préstamo.
 *
 * Vienen de `investor101/public/js/piezas.js`. Aquí NO se hace ninguna cuenta
 * de intereses: la tabla que se ve mientras se teclea la calcula la API. */

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { B, B_MAL, CAJA, CHICO, Aviso, Campo, ConSigno, Et, Lista, Ren, RenMonto, RenSub, RenTitulo, Tabla, Tarjeta, Vacio, useAvisa, useHacer } from "@/components/fiscal/ui";
import { hoyMx } from "@/components/fiscal/contexto";
import {
  CLASE_DE_PAPEL, ESTADO_PRESTAMO, ESTADO_RONDA, comoSePaga, dia, falta, inv, leerCond, ligaArchivo, mensajeDe, momento, pesos, pesosCorto, subirArchivo, tasa,
  type Cond, type DatosDeArchivo, type Fila,
} from "@/lib/patron";

/* ─────────────── quién soy aquí y qué día es ─────────────── */

export interface SesionPatron {
  /** El día de hoy según la API (el del centro de México), AAAA-MM-DD. */
  hoy: string;
  empresa: Fila | null;
  /** Lo que se debe, lo que sale en 30 días, las ofertas por revisar… */
  resumen: Fila | null;
  lista: boolean;
  /** Por qué no se abre (quien no dirige, o la empresa sin patron101). */
  cerrado: string;
  /** Vuelve a pedir el resumen (el globo de ofertas por revisar). */
  otra: () => void;
}
const Ctx = createContext<SesionPatron>({ hoy: hoyMx(), empresa: null, resumen: null, lista: false, cerrado: "", otra: () => {} });
export const usePatron = () => useContext(Ctx);

export function PatronProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Omit<SesionPatron, "otra">>({ hoy: hoyMx(), empresa: null, resumen: null, lista: false, cerrado: "" });
  const pedir = useCallback(async () => {
    try {
      const d = await inv("");
      setS({ hoy: d.hoy || hoyMx(), empresa: d.empresa ?? null, resumen: d.resumen ?? null, lista: true, cerrado: d.papel === "admin" ? "" : "Los préstamos los lleva quien dirige la empresa (dueño o administración)." });
    } catch (e) {
      setS((x) => ({ ...x, lista: true, cerrado: mensajeDe(e) }));
    }
  }, []);
  useEffect(() => { void pedir(); }, [pedir]);
  return <Ctx.Provider value={{ ...s, otra: () => void pedir() }}>{children}</Ctx.Provider>;
}

/** Lo que ve quien no dirige la empresa, o una empresa sin patron101. */
export function Cerrado({ por }: { por: string }) {
  return (
    <Tarjeta data-inversion-cerrada data-lista="1">
      <p className="text-sm font-medium text-ink-dim mb-1">Los préstamos no se abren desde tu cuenta</p>
      <p className="text-xs text-ink-muted">{por}</p>
    </Tarjeta>
  );
}

/* ─────────────── etiquetas y renglones ─────────────── */

export function Estado({ mapa, v }: { mapa: Record<string, [string, "bien" | "ojo" | "mal" | "azul" | ""]>; v: string }) {
  const [nombre, tono] = mapa[v] || [v, ""];
  return <Et tono={tono}>{nombre}</Et>;
}

export function Avance({ pct }: { pct: number }) {
  return <div className="h-1.5 rounded-full bg-black/10 overflow-hidden mt-1.5"><i className="block h-full bg-ink rounded-full" style={{ width: `${Math.max(0, Math.min(100, Number(pct) || 0))}%` }} /></div>;
}

export function Globo({ n }: { n: number }) {
  return n ? <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-mauve-900 text-cream text-[10px] font-medium tabular-nums align-middle">{n}</span> : null;
}

export function RenRonda({ x }: { x: Fila }) {
  return (
    <Ren
      href={`/inversion/rondas/${x.id}`}
      p={<>
        <RenTitulo>{x.nombre} <Estado mapa={ESTADO_RONDA} v={x.estado} /> <Globo n={x.avance?.ofertas_pendientes ?? 0} /></RenTitulo>
        <RenSub>{tasa(x.tipo_tasa, x.tasa_pb)} · {comoSePaga(x)}</RenSub>
        <Avance pct={x.avance?.porcentaje ?? 0} />
      </>}
      m={<><RenMonto>{pesosCorto(x.avance?.juntado)}</RenMonto><RenSub>de {pesosCorto(x.monto_meta)}</RenSub></>}
    />
  );
}

/** `nombre`: en la ficha de una persona no se repite su nombre: va la ronda. */
export function RenPrestamo({ p, nombre }: { p: Fila; nombre?: string }) {
  const s = p.resumen || {};
  const pie = p.estado === "activo" && s.proximo ? `Próximo: ${pesos(s.proximo.total)} el ${dia(s.proximo.fecha)}`
    : p.estado === "por_depositar" ? "Esperando el depósito"
      : p.estado === "liquidado" ? `Pagó ${pesos(s.interes_pagado)} de interés` : "";
  return (
    <Ren
      href={`/inversion/prestamos/${p.id}`}
      p={<>
        <RenTitulo>
          {nombre ?? p.inversionista_nombre ?? p.inversionista?.nombre ?? ""} <Estado mapa={ESTADO_PRESTAMO} v={p.estado} />
          {s.vencidos ? <> <Et tono="mal">{s.vencidos} vencido{s.vencidos > 1 ? "s" : ""}</Et></> : null}
        </RenTitulo>
        <RenSub>{[p.folio, tasa(p.tipo_tasa, p.tasa_pb), pie].filter(Boolean).join(" · ")}</RenSub>
      </>}
      m={<><RenMonto>{pesosCorto(p.estado === "activo" ? s.capital_pendiente : p.monto)}</RenMonto>{p.estado === "activo" && <RenSub>de {pesosCorto(p.monto)}</RenSub>}</>}
    />
  );
}

/* ─────────────── las condiciones de un préstamo ───────────────
 * El mismo formulario para una ronda, un préstamo directo y «aceptar con
 * otras condiciones». La tabla de abajo la calcula la API mientras se
 * teclea. */

export function Condiciones({ c, cambia, sinMonto, monto, ejemplo, soloTabla }: {
  c: Cond;
  cambia: (c: Cond) => void;
  /** Una ronda no lleva monto: simula con `monto`. */
  sinMonto?: boolean;
  /** El monto con el que se simula cuando el formulario no lo trae, en centavos. */
  monto?: number;
  /** «por cada $10,000»: de qué es el ejemplo de la tabla. */
  ejemplo?: string;
  /** Esconde los campos y deja la tabla que resulta. */
  soloTabla?: boolean;
}) {
  const pon = <K extends keyof Cond>(k: K) => (ev: { target: { value: string } }) => cambia({ ...c, [k]: ev.target.value as Cond[K] });
  const cuerpo = leerCond(c, sinMonto ? (monto ?? 0) : undefined);
  const llave = JSON.stringify(cuerpo);
  const [sim, setSim] = useState<{ tabla: Fila[]; totales: Fila } | null>(null);
  const [aviso, setAviso] = useState("");
  const turno = useRef(0);

  useEffect(() => {
    const yo = ++turno.current;
    const cond = JSON.parse(llave) as Fila;
    // Mientras falte lo básico no se le pregunta nada a la API ni se regaña.
    if (!cond.monto || !cond.fecha_inicio || cond.tasa_pb === null || (cond.esquema === "unico" ? !cond.fecha_vencimiento : !cond.num_pagos)) { setSim(null); setAviso(""); return; }
    const reloj = setTimeout(async () => {
      try {
        const r = await inv("/simular", { body: cond });
        if (yo === turno.current) { setSim(r); setAviso(""); }
      } catch (e) {
        if (yo === turno.current) { setSim(null); setAviso(mensajeDe(e)); }
      }
    }, 350);
    return () => clearTimeout(reloj);
  }, [llave]);

  return (
    <div className="space-y-3" data-condiciones>
      {!soloTabla && (
        <div className="space-y-3" data-campos>
          {!sinMonto && (
            <Campo e="Monto"><ConSigno><input name="monto" inputMode="decimal" autoComplete="off" value={c.monto} onChange={pon("monto")} placeholder="0.00" className={CAJA} /></ConSigno></Campo>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo e="Tipo de tasa">
              <select name="tipo_tasa" value={c.tipo_tasa} onChange={pon("tipo_tasa")} className={CAJA}>
                <option value="mensual">Mensual (se prorratea por días)</option>
                <option value="anual">Anual (días reales entre 365)</option>
                <option value="fija">Fija por todo el plazo</option>
              </select>
            </Campo>
            <Campo e="Tasa">
              <div className="relative">
                <input name="tasa" inputMode="decimal" autoComplete="off" value={c.tasa} onChange={pon("tasa")} placeholder="0" className={`${CAJA} pr-7`} />
                <i className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted not-italic pointer-events-none">%</i>
              </div>
            </Campo>
          </div>
          <div>
            <span className="block text-xs font-medium text-ink-muted mb-1">Cómo se paga de regreso</span>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <label className="inline-flex items-center gap-2"><input type="radio" name="esquema" value="unico" checked={c.esquema === "unico"} onChange={pon("esquema")} /> Un solo pago</label>
              <label className="inline-flex items-center gap-2"><input type="radio" name="esquema" value="parcialidades" checked={c.esquema === "parcialidades"} onChange={pon("esquema")} /> En parcialidades</label>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo e="El dinero se recibe el" chico="Desde ese día corre el interés. Se corrige sola al marcar el depósito recibido.">
              <input type="date" name="fecha_inicio" value={c.fecha_inicio} onChange={pon("fecha_inicio")} className={CAJA} />
            </Campo>
            {c.esquema === "unico" && (
              <Campo e="Se paga todo el"><input type="date" name="fecha_vencimiento" value={c.fecha_vencimiento} onChange={pon("fecha_vencimiento")} className={CAJA} /></Campo>
            )}
          </div>
          {c.esquema === "parcialidades" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo e="Cada cuánto">
                <select name="frecuencia" value={c.frecuencia} onChange={pon("frecuencia")} className={CAJA}>
                  <option value="semanal">Cada semana</option>
                  <option value="quincenal">Cada 15 días</option>
                  <option value="mensual">Cada mes</option>
                </select>
              </Campo>
              <Campo e="Cuántos pagos"><input name="num_pagos" inputMode="numeric" autoComplete="off" value={c.num_pagos} onChange={pon("num_pagos")} placeholder="10" className={CAJA} /></Campo>
              <Campo e={<>Primer pago <small className="font-normal">(opcional)</small></>}><input type="date" name="fecha_primer_pago" value={c.fecha_primer_pago} onChange={pon("fecha_primer_pago")} className={CAJA} /></Campo>
            </div>
          )}
        </div>
      )}
      <div aria-live="polite" data-simulacion>
        {aviso && <Aviso tono="ojo" className="!mb-0">{aviso}</Aviso>}
        {sim && (
          <div className="rounded-xl bg-cream/60 p-3">
            <p className="text-xs font-medium text-ink-muted mb-2">Así queda{ejemplo ? <small className="font-normal"> ({ejemplo})</small> : null}</p>
            <TablaSimulada tabla={sim.tabla} totales={sim.totales} />
          </div>
        )}
      </div>
    </div>
  );
}

/* En el teléfono no caben cinco columnas de dinero: capital e interés se
 * esconden y van, chicos, debajo del pago. */
const ANCHO = "hidden sm:table-cell text-right tabular-nums";
const Desglose = ({ capital, interes }: { capital: unknown; interes: unknown }) =>
  <small className="block sm:hidden text-[10px] font-normal text-ink-muted">{pesos(capital)} + {pesos(interes)}</small>;

export function TablaSimulada({ tabla, totales }: { tabla: Fila[]; totales: Fila }) {
  return (
    <Tabla data-tabla-simulada>
      <thead><tr><th>#</th><th>Fecha</th><th className={ANCHO}>Capital</th><th className={ANCHO}>Interés</th><th className="!text-right">Pago</th></tr></thead>
      <tbody>
        {tabla.map((r) => (
          <tr key={r.numero}><td>{r.numero}</td><td>{dia(r.fecha)}</td><td className={ANCHO}>{pesos(r.capital)}</td><td className={ANCHO}>{pesos(r.interes)}</td>
            <td className="text-right tabular-nums">{pesos(r.total)}<Desglose capital={r.capital} interes={r.interes} /></td></tr>
        ))}
      </tbody>
      <tfoot><tr className="font-medium"><td colSpan={2}>Total</td><td className={ANCHO}>{pesos(totales.capital)}</td><td className={ANCHO}>{pesos(totales.interes)}</td>
        <td className="text-right tabular-nums" data-total-simulado>{pesos(totales.total)}<Desglose capital={totales.capital} interes={totales.interes} /></td></tr></tfoot>
    </Tabla>
  );
}

/* ─────────────── la tabla de pagos de un préstamo ─────────────── */

/** `hoy` marca lo vencido; los comprobantes cuelgan de su pago; `accion`
 *  deja a la vista poner su botón en cada renglón. */
export function TablaDePagos({ prestamo, hoy, accion }: { prestamo: Fila; hoy: string; accion?: (g: Fila) => ReactNode }) {
  const pagos: Fila[] = prestamo.pagos || [];
  if (!pagos.length) return <Vacio>Sin pagos.</Vacio>;
  const comprobantes = (id: string): Fila[] => (prestamo.archivos || []).filter((a: Fila) => a.pago_id === id && a.clase === "comprobante_pago");
  const activo = prestamo.estado === "activo";
  const suma = (k: string) => pagos.reduce((s, g) => s + Number(g[k]), 0);
  return (
    <Tabla data-tabla-de-pagos>
      <thead><tr><th>#</th><th>Fecha</th><th className={ANCHO}>Capital</th><th className={ANCHO}>Interés</th><th className="!text-right">Pago</th><th>Estado</th><th></th></tr></thead>
      <tbody>
        {pagos.map((g) => {
          const hecho = g.estado === "pagado";
          const vencido = !hecho && activo && g.fecha < hoy;
          return (
            <tr key={g.id} data-pago={g.id} className={hecho ? "text-ink-muted" : ""}>
              <td>{g.numero}</td><td className="whitespace-nowrap">{dia(g.fecha)}</td>
              <td className={ANCHO}>{pesos(g.capital)}</td><td className={ANCHO}>{pesos(g.interes)}</td>
              <td className="text-right tabular-nums"><b className="font-medium">{pesos(g.total)}</b><Desglose capital={g.capital} interes={g.interes} /></td>
              <td>{hecho ? <Et tono="bien">Pagado {dia(g.pagado_fecha)}</Et> : vencido ? <Et tono="mal">Vencido</Et> : activo ? <Et>{falta(g.fecha, hoy)}</Et> : <Et>Pendiente</Et>}</td>
              <td className="space-x-1 whitespace-nowrap">
                {comprobantes(g.id).map((a) => <a key={a.id} className={`${B} ${CHICO}`} href={ligaArchivo(a.id)} target="_blank" rel="noopener">Comprobante</a>)}
                {accion?.(g)}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot><tr className="font-medium"><td colSpan={2}>Total</td><td className={ANCHO}>{pesos(suma("capital"))}</td><td className={ANCHO}>{pesos(suma("interes"))}</td>
        <td className="text-right tabular-nums">{pesos(suma("total"))}<Desglose capital={suma("capital")} interes={suma("interes")} /></td><td colSpan={2}></td></tr></tfoot>
    </Tabla>
  );
}

/* ─────────────── papeles ─────────────── */

/** Un botón que abre el selector de archivos y sube lo escogido. */
export function BotonSubir({ texto, datos, listo, chico }: { texto: string; datos: DatosDeArchivo; listo: () => void; chico?: boolean }) {
  const avisa = useAvisa();
  const [subiendo, setSubiendo] = useState(false);
  return (
    <label className={`${B} ${chico ? CHICO : ""} cursor-pointer`} data-subir={datos.clase}>
      {subiendo ? "Subiendo…" : texto}
      <input
        type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" disabled={subiendo}
        onChange={async (ev) => {
          const entrada = ev.currentTarget;
          const archivo = entrada.files?.[0];
          if (!archivo) return;
          setSubiendo(true);
          try { await subirArchivo(archivo, datos); avisa("Archivo guardado."); listo(); }
          catch (e) { avisa(mensajeDe(e), true); }
          finally { setSubiendo(false); entrada.value = ""; }
        }}
      />
    </label>
  );
}

/** Los papeles de un préstamo que no son comprobantes de un pago. */
export function Papeles({ prestamo, listo }: { prestamo: Fila; listo: () => void }) {
  const { hacer, ocupado } = useHacer();
  const sueltos: Fila[] = (prestamo.archivos || []).filter((a: Fila) => a.clase !== "comprobante_pago");
  if (!sueltos.length) return <Vacio>Todavía no hay papeles.</Vacio>;
  return (
    <Lista data-papeles>
      {sueltos.map((a) => (
        <Ren
          key={a.id}
          p={<><RenTitulo>{CLASE_DE_PAPEL[a.clase] || a.clase}</RenTitulo><RenSub>{a.nombre} · {momento(a.creado_at)}</RenSub></>}
          acc={<>
            <a className={`${B} ${CHICO}`} href={ligaArchivo(a.id)} target="_blank" rel="noopener">Ver</a>
            <button
              className={`${B_MAL} ${CHICO}`} disabled={ocupado === a.id}
              onClick={async () => {
                if (!window.confirm("¿Quitar este archivo?")) return;
                const r = await hacer(a.id, () => inv(`/archivos/${a.id}`, { method: "DELETE" }));
                if (r !== undefined) listo();
              }}
            >Quitar</button>
          </>}
        />
      ))}
    </Lista>
  );
}

/* ─────────────── la bitácora de un préstamo ─────────────── */

const QUE: Record<string, string> = {
  prestamo_creado: "Se acordó el préstamo", oferta_aprobada: "Se aceptó la oferta", condiciones_cambiadas: "Cambiaron las condiciones", recibido: "Se recibió el depósito",
  tabla_editada: "Cambió la tabla de pagos", pago: "Se registró un pago", pago_deshecho: "Se deshizo un pago", prestamo_cancelado: "Se canceló",
};

export function Bitacora({ eventos }: { eventos?: Fila[] }) {
  if (!eventos?.length) return <Vacio>Sin movimientos.</Vacio>;
  const detalle = (e: Fila): string => {
    const d = e.datos || {};
    if (e.que === "pago") return ` · pago ${d.numero}: ${pesos(Number(d.capital) + Number(d.interes))}${d.liquidado ? " · liquidado" : ""}`;
    if (e.que === "recibido") return ` · ${pesos(d.monto)} el ${dia(d.fecha)}`;
    if (e.que === "pago_deshecho") return ` · pago ${d.numero}`;
    return "";
  };
  const linea = (l?: Fila[]) => (l || []).map((r) => `${dia(r.fecha)}: ${pesos(Number(r.capital) + Number(r.interes))}`).join(" · ");
  return (
    <ul className="space-y-3" data-bitacora>
      {[...eventos].reverse().map((e, i) => (
        <li key={i} className="text-sm text-ink-dim border-l-2 border-black/10 pl-3">
          <b className="font-medium">{QUE[e.que] || e.que}</b>{detalle(e)}
          <time className="block text-[11px] text-ink-muted">{momento(e.ts)}{e.quien_nombre ? ` · ${e.quien_nombre}` : ""}</time>
          {e.nota && <q className="block text-xs text-ink-muted">{e.nota}</q>}
          {e.que === "tabla_editada" && e.datos && <span className="block text-[11px] text-ink-muted">Antes: {linea(e.datos.antes)}<br />Ahora: {linea(e.datos.despues)}</span>}
        </li>
      ))}
    </ul>
  );
}

/** «← Rondas»: de regreso a la lista, sin salir de Préstamos. */
export function Volver({ href, children }: { href: string; children: ReactNode }) {
  return <p className="text-xs mb-2"><Link href={href} className="text-ink-muted hover:text-ink-dim">‹ {children}</Link></p>;
}

/** A dónde manda una vista que no pudo abrir. */
export const INICIO = { href: "/inversion", texto: "Ir a Préstamos" };
