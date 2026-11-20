"use client";

/* Las piezas con que se arman las pantallas fiscales (lo que era bill101,
 * 19-nov-2026). Son las mismas formas de bill101 —cabecera, tarjeta, cifras,
 * lista de renglones, etiquetas— dichas con los tonos y la letra de dash101,
 * para que lo fiscal no parezca otra app pegada adentro. */

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { mensajeDe } from "@/lib/bill";

/* ─────────────── botones y cajas ─────────────── */

export const B = "inline-flex items-center justify-center gap-1.5 bg-white border border-black/10 hover:border-ink/40 text-ink-dim rounded-xl px-3 py-2 text-sm transition disabled:opacity-40 whitespace-nowrap";
export const B_PRI = "inline-flex items-center justify-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3 py-2 text-sm font-medium transition disabled:opacity-40 whitespace-nowrap";
export const B_MAL = "inline-flex items-center justify-center gap-1.5 bg-mauve-50 hover:bg-mauve-50/80 text-mauve-900 rounded-xl px-3 py-2 text-sm transition disabled:opacity-40 whitespace-nowrap";
export const CHICO = "!px-2.5 !py-1 !text-xs !rounded-lg";
export const CAJA = "w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition disabled:opacity-60";
export const LIGA = "text-marca hover:underline";

/* ─────────────── lo que flota: diálogos y listas ───────────────
 * Lo que flota ENCIMA de una tarjeta va en una superficie un tono más alta
 * (en Material 3 la profundidad la da el tono), con su sombra. */
export const SOLIDO: React.CSSProperties = { background: "rgb(var(--c-cream))" };

/** Un diálogo sobre toda la pantalla. Va colgado de <body>, para que
 *  ninguna tarjeta lo recorte. */
export function Dialogo({ alCerrar, ancho = "max-w-md", children, ...resto }: { alCerrar: () => void; ancho?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    setMontado(true);
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") alCerrar(); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [alCerrar]);
  if (!montado) return null;
  return createPortal(
    <div {...resto} className="fixed inset-0 z-[80] bg-black/30 flex items-center justify-center p-4 print:hidden" role="dialog" aria-modal="true"
      onMouseDown={(ev) => { if (ev.target === ev.currentTarget) alCerrar(); }}>
      <div className={`rounded-[28px] p-6 w-full ${ancho} max-h-[88vh] flex flex-col shadow-2xl text-ink-dim`} style={SOLIDO}>{children}</div>
    </div>,
    document.body,
  );
}

/* ─────────────── cabecera ─────────────── */

export function Cab({ titulo, sub, sobre, children }: { titulo: ReactNode; sub?: ReactNode; sobre?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
      <div className="min-w-0">
        {sobre && <p className="text-[11px] text-ink-muted uppercase tracking-wide mb-0.5">{sobre}</p>}
        <h2 className="text-lg font-medium text-ink-dim">{titulo}</h2>
        {sub && <p className="text-xs text-ink-muted mt-0.5">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Migas({ href, children }: { href: string; children: ReactNode }) {
  return <p className="text-xs mb-2"><Link href={href} className="text-ink-muted hover:text-ink-dim">‹ {children}</Link></p>;
}

/* ─────────────── tarjeta ─────────────── */

/** Una tarjeta. `focus-within:z-20`: la lista de sugerencias de un campo
 *  tiene que quedar encima de la tarjeta que sigue. */
export function Tarjeta({ titulo, der, children, realce, ...resto }: { titulo?: ReactNode; der?: ReactNode; children: ReactNode; realce?: boolean } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section {...resto} className={`relative focus-within:z-20 bg-white border rounded-2xl p-4 mb-4 ${realce ? "border-marca/50" : "border-black/5"} ${resto.className ?? ""}`}>
      {titulo && (
        <h3 className="flex flex-wrap justify-between items-baseline gap-2 text-xs font-medium text-ink-muted uppercase tracking-wide mb-3">
          <span>{titulo}</span>
          {der && <span className="normal-case tracking-normal font-normal">{der}</span>}
        </h3>
      )}
      {children}
    </section>
  );
}

/* ─────────────── etiquetas ─────────────── */

export type Tono = "bien" | "ojo" | "mal" | "azul" | "";
const TONO: Record<Tono, string> = {
  bien: "bg-mint-50 text-mint-900",
  mal: "bg-mauve-50 text-mauve-900",
  ojo: "bg-amber-100 text-amber-900",
  azul: "bg-sky-50 text-sky-900",
  "": "bg-cream text-ink-muted border border-black/10",
};
export function Et({ children, tono = "" }: { children: ReactNode; tono?: Tono }) {
  return <span className={`inline-block rounded-lg px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONO[tono]}`}>{children}</span>;
}

export function Aviso({ children, tono = "azul", ...resto }: { children: ReactNode; tono?: Tono } & React.HTMLAttributes<HTMLParagraphElement>) {
  return <p {...resto} className={`text-xs px-3 py-2 rounded-xl mb-4 ${TONO[tono]} ${resto.className ?? ""}`}>{children}</p>;
}

export function Nota({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11px] text-ink-muted mt-2 ${className}`}>{children}</p>;
}
export function Vacio({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-muted py-2">{children}</p>;
}
export function Err({ children }: { children: ReactNode }) {
  return children ? <p className="text-xs text-mauve-900 mt-2" role="alert">{children}</p> : null;
}

/* ─────────────── cifras ─────────────── */

export function Cifras({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">{children}</div>;
}
export function Cifra({ e, v, d, principal }: { e: ReactNode; v: ReactNode; d?: ReactNode; principal?: boolean }) {
  return (
    <div className={`bg-white border rounded-2xl p-3 min-w-0 ${principal ? "border-marca/50" : "border-black/5"}`}>
      <div className="text-[11px] text-ink-muted uppercase tracking-wide">{e}</div>
      <div className={`font-medium text-ink-dim tabular-nums truncate ${principal ? "text-xl" : "text-lg"}`}>{v}</div>
      {d && <div className="text-[11px] text-ink-muted truncate">{d}</div>}
    </div>
  );
}

/* ─────────────── lista de renglones ─────────────── */

export function Lista({ children, ...resto }: { children: ReactNode } & React.HTMLAttributes<HTMLUListElement>) {
  return <ul {...resto} className={`divide-y divide-black/5 ${resto.className ?? ""}`}>{children}</ul>;
}
/** Un renglón: lo principal a la izquierda (título, renglones chicos), el
 *  dinero a la derecha, y los botones al final. Con `href` todo es liga. */
export function Ren({ href, p, m, acc }: { href?: string; p: ReactNode; m?: ReactNode; acc?: ReactNode }) {
  const adentro = (
    <>
      <div className="min-w-0 flex-1 space-y-0.5">{p}</div>
      {m && <div className="text-right shrink-0 space-y-0.5">{m}</div>}
    </>
  );
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      {href ? <Link href={href} className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80 transition">{adentro}</Link> : <div className="flex items-center gap-3 min-w-0 flex-1">{adentro}</div>}
      {acc && <div className="flex gap-2 shrink-0">{acc}</div>}
    </li>
  );
}
export const RenTitulo = ({ children }: { children: ReactNode }) => <p className="text-sm font-medium text-ink-dim break-words">{children}</p>;
export const RenSub = ({ children }: { children: ReactNode }) => <p className="text-[11px] text-ink-muted break-words">{children}</p>;
export const RenMonto = ({ children }: { children: ReactNode }) => <p className="text-sm font-medium text-ink-dim tabular-nums">{children}</p>;

/* ─────────────── datos (dt/dd) ─────────────── */

export function Datos({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">{children}</dl>;
}
export function Dato({ e, children }: { e: ReactNode; children: ReactNode }) {
  if (children === null || children === undefined || children === "" || children === false) return null;
  return <div className="min-w-0"><dt className="text-[11px] text-ink-muted uppercase tracking-wide">{e}</dt><dd className="text-sm text-ink-dim break-words">{children}</dd></div>;
}

/* ─────────────── moverse de mes o de año ─────────────── */

export function Mesero({ antes, despues, children, ...resto }: { antes: string; despues: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...resto} className="flex items-center gap-3 mb-4">
      <Link href={antes} className={`${B} ${CHICO}`} aria-label="Anterior">‹</Link>
      <b className="text-sm text-ink-dim min-w-[8rem] text-center" data-periodo>{children}</b>
      <Link href={despues} className={`${B} ${CHICO}`} aria-label="Siguiente">›</Link>
    </div>
  );
}

/** Fichas para escoger una de varias vistas (recibidas / emitidas, los meses). */
export function Fichas({ opciones, chicas }: { opciones: { href: string; texto: ReactNode; activa: boolean }[]; chicas?: boolean }) {
  return (
    <div className="flex gap-1 mb-4 overflow-x-auto" role="tablist">
      {opciones.map((o) => (
        <Link key={o.href} href={o.href} role="tab" aria-current={o.activa ? "page" : undefined}
          className={`rounded-xl whitespace-nowrap transition ${chicas ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${o.activa ? "bg-ink text-cream" : "bg-white border border-black/5 text-ink-muted hover:text-ink-dim"}`}>
          {o.texto}
        </Link>
      ))}
    </div>
  );
}

/* ─────────────── campos de formulario ─────────────── */

export function Campo({ e, children, chico, className = "" }: { e: ReactNode; children: ReactNode; chico?: ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="block text-xs font-medium text-ink-muted mb-1">{e}</span>
      {children}
      {chico && <small className="block text-[11px] text-ink-muted mt-1">{chico}</small>}
    </label>
  );
}
/** Una caja de dinero, con su signo de pesos delante. */
export function ConSigno({ children }: { children: ReactNode }) {
  return <div className="relative"><i className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted not-italic pointer-events-none">$</i><div className="[&>input]:pl-6">{children}</div></div>;
}

/* ─────────────── tablas ─────────────── */

export function Tabla({ children, ...resto }: { children: ReactNode } & React.TableHTMLAttributes<HTMLTableElement>) {
  return <div className="overflow-x-auto"><table {...resto} className="w-full text-sm [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:text-ink-muted [&_th]:pb-2 [&_td]:py-1.5 [&_td]:pr-3 [&_th]:pr-3 [&_td]:align-top [&_.n]:text-right [&_.n]:tabular-nums [&_.n]:whitespace-nowrap [&_tbody_tr]:border-t [&_tbody_tr]:border-black/5 [&_tfoot_tr]:border-t [&_tfoot_tr]:border-black/10 [&_tfoot_td]:font-medium">{children}</table></div>;
}

/* ─────────────── avisos que flotan ─────────────── */

type Avisar = (texto: string, mal?: boolean) => void;
const AvisosCtx = createContext<Avisar>(() => {});
export const useAvisa = () => useContext(AvisosCtx);

export function Avisos({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<{ id: number; texto: string; mal: boolean }[]>([]);
  const n = useRef(0);
  const avisa = useCallback<Avisar>((texto, mal = false) => {
    const id = ++n.current;
    setLista((l) => [...l, { id, texto, mal }]);
    setTimeout(() => setLista((l) => l.filter((x) => x.id !== id)), mal ? 6500 : 3200);
  }, []);
  return (
    <AvisosCtx.Provider value={avisa}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none px-3 w-full max-w-md" aria-live="polite" data-avisos>
        {lista.map((a) => (
          <div key={a.id} className={`rounded-[4px] px-4 py-2.5 text-sm shadow-lg text-center ${a.mal ? "bg-mauve-900 text-white" : "bg-[#2d3135] text-[#eef1f6]"}`}>{a.texto}</div>
        ))}
      </div>
    </AvisosCtx.Provider>
  );
}

/* ─────────────── cargar algo de la API ─────────────── */

/** Pide algo al montar y cada vez que cambie `llave`. `otra()` lo vuelve a
 *  pedir sin borrar lo que se ve (para refrescar después de una acción). */
export function useCarga<T>(fn: () => Promise<T>, llave: string): { d: T | null; error: string; cual: string; cargando: boolean; otra: () => Promise<void> } {
  const [d, setD] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [cual, setCual] = useState("");
  const [cargando, setCargando] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const turno = useRef(0);
  const pedir = useCallback(async (limpio: boolean) => {
    const mio = ++turno.current;
    if (limpio) { setCargando(true); setD(null); }
    setError(""); setCual("");
    try {
      const r = await fnRef.current();
      if (mio === turno.current) setD(r);
    } catch (e) {
      if (mio !== turno.current) return;
      setError(mensajeDe(e));
      setCual((e as { cual?: string })?.cual ?? "");
    } finally {
      if (mio === turno.current) setCargando(false);
    }
  }, []);
  useEffect(() => { void pedir(true); }, [llave, pedir]);
  const otra = useCallback(() => pedir(false), [pedir]);
  return { d, error, cual, cargando, otra };
}

/** Lo que se ve mientras llega, o si no llegó. `data-lista` avisa a las
 *  pruebas que la vista ya terminó de pintarse. */
export function Vista({ carga, children, inicio = { href: "/fiscal", texto: "Ir a Fiscal" } }: { carga: { d: unknown; error: string; cual?: string; cargando: boolean }; children: ReactNode; inicio?: { href: string; texto: string } }) {
  if (carga.cargando && !carga.d) return <div className="text-sm text-ink-muted">Cargando…</div>;
  if (carga.error && !carga.d) {
    const noEsta = carga.cual === "no_encontrado" || carga.cual === "cfdi_desconocido";
    return (
      <Tarjeta titulo={noEsta ? "Eso no está aquí" : "No se pudo abrir"} data-lista="1">
        <p className="text-sm text-ink-dim mb-3">{noEsta ? "Puede que la liga sea de otra empresa, o que ya no exista." : carga.error}</p>
        <Link href={inicio.href} className={B}>{inicio.texto}</Link>
      </Tarjeta>
    );
  }
  return <div data-lista="1">{children}</div>;
}

/** Corre algo que habla con la API desde un botón: avisa `ocupado` mientras,
 *  y si truena lo dice (en `alError` si lo dan; si no, en un aviso flotante).
 *  Devuelve lo que devolvió, o `undefined` si falló. */
export function useHacer() {
  const avisa = useAvisa();
  const [ocupado, setOcupado] = useState("");
  const hacer = useCallback(async <T,>(cual: string, fn: () => Promise<T>, alError?: (m: string) => void): Promise<T | undefined> => {
    setOcupado(cual);
    alError?.("");
    try { return await fn(); } catch (e) {
      if (alError) alError(mensajeDe(e)); else avisa(mensajeDe(e), true);
      return undefined;
    } finally { setOcupado(""); }
  }, [avisa]);
  return { hacer, ocupado };
}
