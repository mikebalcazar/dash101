import { IconFileInvoice } from "@tabler/icons-react";
import type { Movimiento } from "@/types/schema";

/* La marca de un movimiento fiscalizado, y de si su factura ya se expidió.
 *
 * Encargo de Mike del 20-sep: «en la lista de movimientos, en todas las
 * listas que se desplieguen de movimientos, agrega un iconito que indique
 * que es un movimiento fiscalizado».
 *
 * Y el 21-sep, que es lo que la cambió: «los que sí van fiscalizados
 * deberían tener un iconito en su renglón. Sugiero que el ícono sea el
 * mismo, pero en ROJO cuando aún no se expide la factura, y VERDE cuando ya
 * esté facturada».
 *
 * Antes sólo salía cuando la factura ya estaba, así que un movimiento fiscal
 * sin factura se veía idéntico a uno que no lleva factura: los dos sin
 * marca. Y son cosas distintas —uno debe una factura, el otro no debe nada—,
 * que es justo lo que la lista no dejaba ver.
 *
 * MISMO ícono, distinto color, porque lo que cambia es el estado y no la
 * naturaleza: los dos son movimientos fiscales.
 *
 * El color no va solo. Un rojo y un verde son el mismo gris para quien no
 * los distingue —y en una pantalla al sol, para cualquiera—, así que el
 * `title` y el `aria-label` dicen la palabra completa.
 *
 * Vive en un solo lugar a propósito. «Todas las listas» hoy son dos —la de
 * Movimientos y los últimos del Inicio—, pero van a ser más, y una marca
 * copiada y pegada se queda atrás en la lista que nadie se acordó de tocar.
 *
 * Es el MISMO dato de lo fiscal, no uno paralelo: `requiere_factura` lo pone
 * el primer paso del formulario y `facturado` lo pone la captura del CFDI.
 * Si un día deja de cuadrar con la pantalla de Fiscal, hay un solo lugar
 * donde buscar.
 */
/** Qué marca le toca a un movimiento, como dato y no como pintura.
 *
 *  Está aparte del componente para poder medirla sin montar React: la regla
 *  —quién lleva marca y de qué color— es lo que importa, y una prueba que
 *  tenga que renderizar para leerla mide el andamio y no la regla. */
export function marcaDe(
  mov: Pick<Movimiento, "facturado" | "requiere_factura">,
): { color: "verde" | "rojo"; etiqueta: string; dice: string } | null {
  // No es fiscal: no debe factura y no lleva marca.
  if (!mov.requiere_factura) return null;
  return mov.facturado
    ? { color: "verde", etiqueta: "Facturado", dice: "Facturado: este movimiento ya tiene su factura" }
    : { color: "rojo", etiqueta: "Falta facturar", dice: "Fiscal: falta expedir la factura" };
}

export function MarcaFiscal({
  mov, size = 11,
}: {
  mov: Pick<Movimiento, "facturado" | "requiere_factura">;
  size?: number;
}) {
  const m = marcaDe(mov);
  if (!m) return null;
  return (
    <IconFileInvoice
      size={size}
      className={`inline-block ml-1 align-[-1px] ${m.color === "verde" ? "text-mint-900" : "text-mauve-900"}`}
      aria-label={m.etiqueta}
      title={m.dice}
    />
  );
}
