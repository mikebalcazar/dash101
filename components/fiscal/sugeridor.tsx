"use client";

/* Un campo con lista de sugerencias debajo. `traer(q)` devuelve las filas (o
 * una promesa); `alEscoger(fila)` se llama al escoger una. Flechas, Enter y
 * Escape funcionan; al salir del campo se cierra. */

import { useEffect, useRef, useState } from "react";
import { mensajeDe } from "@/lib/bill";
import { SOLIDO } from "./ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Sugerencia { k: string; t: string; x?: string; c?: any }

type Props = {
  valor: string;
  alCambiar: (v: string) => void;
  traer: (q: string) => Promise<Sugerencia[]> | Sugerencia[];
  alEscoger: (f: Sugerencia) => void;
  minimo?: number;
  alEnfocar?: boolean;
  /** Sin resultados no enseña «Nada con eso»: se queda callado. */
  callado?: boolean;
  /** La descripción: un textarea que crece con el texto. */
  multilinea?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">;

export function Sugeridor({ valor, alCambiar, traer, alEscoger, minimo = 1, alEnfocar = false, callado = false, multilinea = false, className = "", onBlur, onFocus, ...resto }: Props) {
  const [filas, setFilas] = useState<Sugerencia[]>([]);
  const [abierta, setAbierta] = useState(false);
  const [sel, setSel] = useState(-1);
  const [error, setError] = useState("");
  const turno = useRef(0);
  const quieto = useRef<ReturnType<typeof setTimeout> | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const cerrar = () => { turno.current++; setAbierta(false); setFilas([]); setSel(-1); setError(""); };
  const buscar = async (q: string) => {
    if (q.trim().length < minimo) { cerrar(); return; }
    const mio = ++turno.current;
    try {
      const r = await traer(q.trim());
      if (mio !== turno.current) return;
      setFilas(r); setSel(-1); setError("");
      setAbierta(r.length > 0 || !callado);
    } catch (e) { if (mio === turno.current) { setFilas([]); setError(mensajeDe(e)); setAbierta(true); } }
  };
  const escoger = (i: number) => { const f = filas[i]; if (!f) return; cerrar(); alEscoger(f); };

  // La descripción crece con el texto.
  useEffect(() => {
    const ta = area.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(38, ta.scrollHeight + 2)}px`;
  }, [valor]);
  useEffect(() => () => { if (quieto.current) clearTimeout(quieto.current); }, []);

  const comunes = {
    value: valor,
    autoComplete: "off",
    className,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const v = e.target.value;
      alCambiar(v);
      if (quieto.current) clearTimeout(quieto.current);
      quieto.current = setTimeout(() => void buscar(v), 150);
    },
    onFocus: (e: React.FocusEvent<any>) => { onFocus?.(e); if (alEnfocar && !abierta) void buscar(valor); },
    onBlur: (e: React.FocusEvent<any>) => { setTimeout(cerrar, 150); onBlur?.(e); },
    onKeyDown: (ev: React.KeyboardEvent) => {
      if (multilinea && ev.key === "Enter" && !ev.shiftKey && !(abierta && sel >= 0)) { ev.preventDefault(); return; }
      if (!abierta) return;
      if (ev.key === "ArrowDown") { setSel((s) => Math.min(filas.length - 1, s + 1)); ev.preventDefault(); }
      else if (ev.key === "ArrowUp") { setSel((s) => Math.max(0, s - 1)); ev.preventDefault(); }
      else if (ev.key === "Enter" && sel >= 0) { escoger(sel); ev.preventDefault(); }
      else if (ev.key === "Escape") cerrar();
    },
  };

  return (
    <div className="relative">
      {multilinea
        ? <textarea ref={area} rows={1} {...(resto as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} {...comunes} style={{ resize: "none", overflow: "hidden" }} />
        : <input {...resto} {...comunes} />}
      {abierta && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 min-w-[16rem] max-h-72 overflow-y-auto border border-black/15 rounded-xl shadow-xl" style={SOLIDO} data-sugerencias
          onMouseDown={(ev) => { const d = (ev.target as HTMLElement).closest("[data-i]") as HTMLElement | null; if (d) { ev.preventDefault(); escoger(Number(d.dataset.i)); } }}>
          {error ? <div className="px-3 py-2 text-xs text-mauve-900">{error}</div>
            : filas.length ? filas.map((f, i) => (
              <div key={`${f.k}:${i}`} data-i={i} className={`px-3 py-1.5 text-xs cursor-pointer ${i === sel ? "bg-black/10" : "hover:bg-black/10"}`}>
                <b className="text-ink-dim">{f.k}</b> <span className="text-ink-dim">{f.t}</span>
                {f.x ? <small className="block text-[11px] text-ink-muted">{f.x}</small> : null}
              </div>
            )) : <div className="px-3 py-2 text-xs text-ink-muted">Nada con eso.</div>}
        </div>
      )}
    </div>
  );
}
