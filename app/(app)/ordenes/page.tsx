"use client";

/* Compras y reembolsos: lo que hay por pagar arriba, lo pagado abajo.
 *
 * Mike, 1-oct-2026: «Quiero ver en la pantalla de compras un historial
 * completo de las órdenes de compra ya pagadas» y «elimina ese buzón y de
 * entrada despliega hasta arriba todas las órdenes que hay pendientes de
 * pago y después todas las que ya están pagadas».
 *
 * Quién ve qué lo decide el servidor, no esta pantalla:
 *
 *   · quien PAGA ve el buzón entero del negocio (todas las pendientes, lo
 *     que vence primero arriba) y el historial de todo lo pagado; abajo,
 *     si hay, lo suyo que fue devuelto o rechazado;
 *   · quien sólo PIDE ve lo suyo, con el mismo orden: por pagar, pagadas,
 *     rechazadas. Las devueltas van hasta arriba con su motivo, porque son
 *     las únicas que le piden algo.
 *
 * Los reembolsos van en la misma lista, con su marca: son el mismo papel
 * con otro folio (RE-). El buzón por pestañas (/ordenes/buzon) sigue
 * existiendo para la tarjeta del inicio, pero ya no hay que entrar a él
 * para ver qué hay por pagar. */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBuzon, listMisOrdenes, listOrdenesPagadas, type Buzon, type Orden } from "@/lib/ordenes";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { ErrorApi } from "@/lib/api/cliente";
import { formatMontoExact } from "@/lib/format";
import { AQuien, Dinero, Estado, FilasBuzon, Tipo, Vence } from "@/components/ordenes-ui";
import { IconPlus, IconReceiptRefund, IconShoppingCart } from "@tabler/icons-react";

/** Las devueltas primero; dentro de cada grupo, la más nueva arriba. */
const ORDEN_DE_LA_LISTA: Record<Orden["estado"], number> = {
  devuelta: 0, en_buzon: 1, pagada: 2, rechazada: 3,
};

const masNueva = (a: Orden, b: Orden) => ORDEN_DE_LA_LISTA[a.estado] - ORDEN_DE_LA_LISTA[b.estado] || b.creado_at.localeCompare(a.creado_at);

/** Lo mío, renglón por renglón, con el motivo si me la devolvieron. */
function FilasMias({ filas }: { filas: Orden[] }) {
  return (
    <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
      {filas.map((o) => (
        <Link
          key={o.id}
          href={`/ordenes/${o.id}`}
          data-orden={o.id}
          className="flex items-start gap-3 px-4 py-3 border-b border-black/5 last:border-b-0 hover:bg-cream/50 transition"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink-dim line-clamp-2">{o.concepto}</p>
            <p className="text-[11px] text-ink-muted truncate">
              {o.folio} · <AQuien orden={o} /> · <Vence orden={o} />
            </p>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <Estado orden={o} />
              <Tipo orden={o} />
              {o.estado === "devuelta" && o.nota_contador && (
                <span className="text-[11px] text-mauve-900">«{o.nota_contador}»</span>
              )}
            </div>
          </div>
          <Dinero orden={o} />
        </Link>
      ))}
    </div>
  );
}

function Seccion({ id, titulo, cuantas, total, moneda, vacio, children }: {
  id: string; titulo: string; cuantas: number; total?: number; moneda: string; vacio: string; children: React.ReactNode;
}) {
  return (
    <section className="mb-5" data-seccion={id} data-cuantas={cuantas}>
      <div className="flex justify-between items-baseline mb-2 gap-3">
        <h3 className="text-sm font-medium text-ink-dim">
          {titulo} <span className="text-ink-muted font-normal tabular-nums">{cuantas}</span>
        </h3>
        {total !== undefined && cuantas > 0 && (
          <p className="text-sm font-medium text-ink-dim tabular-nums" data-total={id}>{formatMontoExact(total, moneda)}</p>
        )}
      </div>
      {cuantas === 0 ? <p className="text-xs text-ink-muted">{vacio}</p> : children}
    </section>
  );
}

export default function OrdenesPage() {
  const { activo, loading: cargandoNegocio } = useNegocioActivo();
  const [mias, setMias] = useState<Orden[]>([]);
  const [puedoPagar, setPuedoPagar] = useState(false);
  const [buzon, setBuzon] = useState<Buzon | null>(null);
  const [pagadas, setPagadas] = useState<{ filas: Orden[]; total: number }>({ filas: [], total: 0 });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const moneda = activo?.moneda ?? "MXN";

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setMias(await listMisOrdenes(activo?.id));
      // Si el buzón contesta, esta persona paga. No hay una ruta «¿soy
      // contador?»: la respuesta del buzón ES la respuesta, y trae todo lo
      // pendiente del negocio; el historial de lo pagado es la otra mitad.
      try {
        const b = await getBuzon(activo?.id);
        setPuedoPagar(true);
        setBuzon(b);
        setPagadas(await listOrdenesPagadas(activo?.id));
      } catch (e) {
        if (!(e instanceof ErrorApi && e.error === "sin_permiso")) throw e;
        setPuedoPagar(false);
        setBuzon(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, [activo]);

  useEffect(() => {
    if (cargandoNegocio) return;
    void cargar();
  }, [cargandoNegocio, cargar]);

  const ordenadas = [...mias].sort(masNueva);
  const miasPorPagar = ordenadas.filter((o) => o.estado === "devuelta" || o.estado === "en_buzon");
  const miasPagadas = ordenadas.filter((o) => o.estado === "pagada");
  const miasRechazadas = ordenadas.filter((o) => o.estado === "rechazada");
  const miasDevueltas = ordenadas.filter((o) => o.estado === "devuelta" || o.estado === "rechazada");
  const suma = (filas: Orden[]) => filas.reduce((s, o) => s + o.monto, 0);

  return (
    <div>
      <div className="flex justify-between items-baseline mb-5 gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">Compras y reembolsos</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {puedoPagar ? "Lo que hay por pagar, y todo lo que ya se pagó." : "Lo que tú pediste, y en qué va cada una."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-5">
        <Link
          href="/ordenes/nueva"
          className="flex items-center justify-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3.5 py-2.5 text-sm font-medium transition"
        >
          <IconPlus size={14} />
          Pedir una compra
        </Link>
        <Link
          href="/ordenes/nueva?tipo=reembolso"
          className="flex items-center justify-center gap-1.5 bg-white border border-black/10 hover:border-ink/30 text-ink-dim rounded-xl px-3.5 py-2.5 text-sm font-medium transition"
        >
          <IconReceiptRefund size={14} />
          Pedir un reembolso
        </Link>
      </div>

      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">{error}</div>
      )}

      {cargando ? (
        <div className="text-sm text-ink-muted">Cargando…</div>
      ) : puedoPagar && buzon ? (
        <>
          <Seccion id="por-pagar" titulo="Por pagar" cuantas={buzon.filas.length} total={buzon.total} moneda={moneda} vacio="Nada por pagar.">
            <FilasBuzon filas={buzon.filas} />
          </Seccion>
          {miasDevueltas.length > 0 && (
            <Seccion id="devueltas" titulo="Lo mío que volvió" cuantas={miasDevueltas.length} moneda={moneda} vacio="">
              <FilasMias filas={miasDevueltas} />
            </Seccion>
          )}
          <Seccion id="pagadas" titulo="Pagadas" cuantas={pagadas.filas.length} total={pagadas.total} moneda={moneda} vacio="Todavía no se ha pagado ninguna.">
            <FilasBuzon filas={pagadas.filas} />
          </Seccion>
        </>
      ) : mias.length === 0 ? (
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <IconShoppingCart size={22} className="text-ink-muted mx-auto mb-2" />
          <p className="text-sm font-medium text-ink-dim mb-1">Todavía no pides nada</p>
          <p className="text-xs text-ink-muted">
            Pide una compra o un reembolso y le llega directo a quien paga. No hace falta que nadie lo autorice antes.
          </p>
        </div>
      ) : (
        <>
          <Seccion id="por-pagar" titulo="Por pagar" cuantas={miasPorPagar.length} total={suma(miasPorPagar)} moneda={moneda} vacio="Nada tuyo por pagar.">
            <FilasMias filas={miasPorPagar} />
          </Seccion>
          <Seccion id="pagadas" titulo="Pagadas" cuantas={miasPagadas.length} total={suma(miasPagadas)} moneda={moneda} vacio="Todavía no te han pagado ninguna.">
            <FilasMias filas={miasPagadas} />
          </Seccion>
          {miasRechazadas.length > 0 && (
            <Seccion id="rechazadas" titulo="Rechazadas" cuantas={miasRechazadas.length} moneda={moneda} vacio="">
              <FilasMias filas={miasRechazadas} />
            </Seccion>
          )}
        </>
      )}
    </div>
  );
}
