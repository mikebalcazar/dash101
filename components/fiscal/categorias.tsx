"use client";

/* Buscar la clave del SAT por categorías: división → clase → producto. */

import { useEffect, useState } from "react";
import { catalogo, norm, type CatalogoSat, type ClaveSat } from "@/lib/catalogo-sat";
import { B, CAJA, CHICO, Dialogo, Nota } from "./ui";

export function Categorias({ alEscoger, alCerrar }: { alEscoger: (x: ClaveSat) => void; alCerrar: () => void }) {
  const [cat, setCat] = useState<CatalogoSat | null>(null);
  const [error, setError] = useState("");
  const [div, setDiv] = useState<string | null>(null);
  const [clase, setClase] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  useEffect(() => { catalogo("prodserv").then(setCat, (e) => setError(e.message)); }, []);

  const usar = (k: string) => { const x = cat?.filas.find((c) => c.k === k); if (x) { alEscoger(x); alCerrar(); } };
  const f = norm(filtro);
  const divisiones = cat ? Object.entries(cat.divisiones).sort(([a], [b]) => a.localeCompare(b)).filter(([k, t]) => !f || norm(`${k} ${t}`).includes(f)) : [];
  const lista = !cat ? [] : clase ? cat.filas.filter((x) => x.k.startsWith(clase.slice(0, 6)) && !x.k.endsWith("00"))
    : div ? cat.filas.filter((x) => x.k.startsWith(div) && x.k.endsWith("00")) : [];
  const vis = lista.filter((x) => !f || x.n.includes(f));
  const ren = "flex items-center gap-3 w-full text-left py-2 px-1 hover:bg-black/10 rounded-lg";

  return (
    <Dialogo alCerrar={alCerrar} ancho="max-w-2xl" data-dialogo-categorias>
        <div className="flex justify-between items-start gap-3 mb-3">
          <div className="min-w-0">
            <h3 className="text-base font-medium text-ink-dim">Clave del SAT por categorías</h3>
            <p className="text-xs text-ink-muted">
              {div ? <><button type="button" className="underline" onClick={() => { setDiv(null); setClase(null); setFiltro(""); }}>Todas las divisiones</button> › <b>{div} {cat?.divisiones[div] || ""}</b></> : "División › clase › producto o servicio."}
              {clase ? <> › <button type="button" className="underline" onClick={() => { setClase(null); setFiltro(""); }}>{clase}</button></> : null}
            </p>
          </div>
          <button type="button" className={`${B} ${CHICO}`} onClick={alCerrar}>Cerrar</button>
        </div>
        {error ? <p className="text-xs text-mauve-900">{error}</p> : !cat ? <Nota>Bajando el catálogo del SAT…</Nota> : (
          <>
            <input className={`${CAJA} mb-2`} placeholder="Filtrar en este nivel…" value={filtro} onChange={(e) => setFiltro(e.target.value)} autoFocus />
            <ul className="overflow-y-auto divide-y divide-black/5 flex-1">
              {!div ? divisiones.map(([k, t]) => (
                <li key={k}><button type="button" className={ren} data-div={k} onClick={() => { setDiv(k); setFiltro(""); }}>
                  <span className="flex-1 text-sm text-ink-dim"><b>{k}</b> · {t}</span><span className="text-ink-muted">›</span></button></li>
              )) : vis.slice(0, 500).map((x) => (
                <li key={x.k} className="flex items-center gap-2">
                  <button type="button" className={ren} data-k={x.k} onClick={() => { if (!clase) { setClase(x.k); setFiltro(""); } else usar(x.k); }}>
                    <span className="flex-1 min-w-0"><span className="block text-sm text-ink-dim"><b>{x.k}</b> · {x.t}</span>{x.x ? <span className="block text-[11px] text-ink-muted">{x.x}</span> : null}</span>
                    <span className="text-ink-muted text-xs">{clase ? "Usar" : "›"}</span>
                  </button>
                  {/* Doble camino: abrir la clase, o usarla tal cual. */}
                  {!clase && <button type="button" className={`${B} ${CHICO}`} data-usar={x.k} onClick={() => usar(x.k)}>Usar</button>}
                </li>
              ))}
              {div && vis.length > 500 ? <li><Nota>Hay más: filtra.</Nota></li> : null}
            </ul>
            {div && !clase ? <Nota>Una clase (termina en 00) también sirve como clave; abrirla muestra sus productos.</Nota> : null}
          </>
        )}
    </Dialogo>
  );
}
