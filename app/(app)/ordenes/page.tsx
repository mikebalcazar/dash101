"use client";

/* Mis órdenes de compra.
 *
 * Un miembro ve SÓLO las suyas, y eso no lo decide esta pantalla: lo filtra
 * el servidor. Aquí sólo se ordenan las devueltas arriba, con su motivo a la
 * vista, porque son las únicas que piden algo de quien las pidió. */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBuzon, listMisOrdenes, type Orden } from "@/lib/ordenes";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { ErrorApi } from "@/lib/api/cliente";
import { Dinero, Estado, Vence } from "@/components/ordenes-ui";
import { IconInbox, IconPlus, IconShoppingCart } from "@tabler/icons-react";

/** Las devueltas primero; dentro de cada grupo, la más nueva arriba. */
const ORDEN_DE_LA_LISTA: Record<Orden["estado"], number> = {
  devuelta: 0, en_buzon: 1, pagada: 2, rechazada: 3,
};

export default function MisOrdenesPage() {
  const { activo, loading: cargandoNegocio } = useNegocioActivo();
  const [filas, setFilas] = useState<Orden[]>([]);
  const [puedoPagar, setPuedoPagar] = useState(false);
  const [porPagar, setPorPagar] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setFilas(await listMisOrdenes(activo?.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
    // Si el buzón contesta, esta persona paga. No hay una ruta «¿soy
    // contador?»: la respuesta del buzón ES la respuesta, y de paso trae
    // cuántas hay esperando.
    try {
      const b = await getBuzon(activo?.id);
      setPuedoPagar(true);
      setPorPagar(b.filas.length);
    } catch (e) {
      if (!(e instanceof ErrorApi && e.error === "sin_permiso")) throw e;
      setPuedoPagar(false);
    }
  }, [activo]);

  useEffect(() => {
    if (cargandoNegocio) return;
    void cargar();
  }, [cargandoNegocio, cargar]);

  const lista = [...filas].sort(
    (a, b) => ORDEN_DE_LA_LISTA[a.estado] - ORDEN_DE_LA_LISTA[b.estado] || b.creado_at.localeCompare(a.creado_at),
  );

  return (
    <div>
      <div className="flex justify-between items-baseline mb-5 gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">Mis compras</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Lo que tú pediste, y en qué va cada una.
          </p>
        </div>
        <Link
          href="/ordenes/nueva"
          className="flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3.5 py-2 text-sm font-medium transition shrink-0"
        >
          <IconPlus size={14} />
          Pedir una compra
        </Link>
      </div>

      {puedoPagar && (
        <Link
          href="/ordenes/buzon"
          className="flex items-center gap-2 bg-white border border-black/5 rounded-2xl px-4 py-3 mb-4 hover:border-ink/20 transition"
        >
          <IconInbox size={18} className="text-ink-muted" />
          <span className="text-sm text-ink-dim flex-1">El buzón de lo que hay por pagar</span>
          <span className="text-sm font-medium text-ink-dim tabular-nums">{porPagar}</span>
        </Link>
      )}

      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">{error}</div>
      )}

      {cargando ? (
        <div className="text-sm text-ink-muted">Cargando…</div>
      ) : lista.length === 0 ? (
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <IconShoppingCart size={22} className="text-ink-muted mx-auto mb-2" />
          <p className="text-sm font-medium text-ink-dim mb-1">Todavía no pides nada</p>
          <p className="text-xs text-ink-muted">
            Pide una compra y le llega directo a quien paga. No hace falta que nadie la autorice antes.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
          {lista.map((o) => (
            <Link
              key={o.id}
              href={`/ordenes/${o.id}`}
              className="flex items-start gap-3 px-4 py-3 border-b border-black/5 last:border-b-0 hover:bg-cream/50 transition"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-dim line-clamp-2">
                  {o.concepto}
                </p>
                <p className="text-[11px] text-ink-muted truncate">
                  {o.folio} · {o.proveedor_nombre || "sin proveedor"} · <Vence orden={o} />
                </p>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <Estado orden={o} />
                  {o.estado === "devuelta" && o.nota_contador && (
                    <span className="text-[11px] text-mauve-900">«{o.nota_contador}»</span>
                  )}
                </div>
              </div>
              <Dinero orden={o} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
