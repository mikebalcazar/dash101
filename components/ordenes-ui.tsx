"use client";

/* Las piezas que comparten las cuatro pantallas de órdenes. Viven aquí para
 * que el estado de una orden se pinte igual en la lista, en el buzón y en el
 * detalle: tres colores distintos para «devuelta» serían tres pantallas que
 * parecen de apps distintas. */

import { ESTADO_ORDEN, vencida, type Orden } from "@/lib/ordenes";
import { formatMontoExact } from "@/lib/format";

const COLOR: Record<Orden["estado"], string> = {
  en_buzon: "bg-sky-50 text-sky-900",
  devuelta: "bg-mauve-50 text-mauve-900",
  pagada: "bg-mint-50 text-mint-900",
  rechazada: "bg-cream text-ink-muted",
};

export function Estado({ orden }: { orden: Orden }) {
  return (
    <span className={`inline-block rounded-lg px-2 py-0.5 text-[11px] font-medium ${COLOR[orden.estado]}`}>
      {ESTADO_ORDEN[orden.estado]}
    </span>
  );
}

/** La fecha máxima de pago, y en rojo si ya se pasó. Se compara por día: una
 *  orden que vence hoy no está vencida a las nueve de la mañana. */
export function Vence({ orden }: { orden: Orden }) {
  if (!orden.fecha_maxima_pago) return <span className="text-ink-muted">sin fecha</span>;
  const tarde = vencida(orden);
  return (
    <span className={tarde ? "text-mauve-900 font-medium" : "text-ink-muted"}>
      {tarde ? "venció el " : "vence el "}
      {orden.fecha_maxima_pago}
    </span>
  );
}

/** El renglón de dinero de una orden: el total grande y, si trae factura, el
 *  desglose debajo en chico. Siempre en PESOS: `lib/ordenes.ts` ya los
 *  convirtió. */
export function Dinero({ orden }: { orden: Orden }) {
  return (
    <div className="text-right">
      <p className="text-sm font-medium text-ink-dim tabular-nums">
        {formatMontoExact(orden.monto, orden.moneda)}
      </p>
      {orden.con_factura && (
        <p className="text-[11px] text-ink-muted tabular-nums">
          {formatMontoExact(orden.subtotal, orden.moneda)} + IVA {formatMontoExact(orden.iva, orden.moneda)}
        </p>
      )}
    </div>
  );
}

export const CAJA =
  "w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition";
export const CAJA_NUM = `${CAJA} text-right tabular-nums`;
export const ETIQUETA = "block text-xs font-medium text-ink-muted mb-1";
export const BOTON =
  "bg-ink hover:bg-ink/90 text-cream rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-40";
