import { IconFileInvoice } from "@tabler/icons-react";
import type { Movimiento } from "@/types/schema";

/* La marca de que un movimiento está fiscalizado: tiene factura.
 *
 * Encargo de Mike del 20-sep: «en la lista de movimientos, en todas las
 * listas que se desplieguen de movimientos, agrega un iconito que indique
 * que es un movimiento fiscalizado (o sea que tiene factura, ya sea ingreso
 * o egreso)».
 *
 * Vive en un solo lugar a propósito. «Todas las listas» hoy son dos —la de
 * Movimientos y los últimos del Inicio—, pero van a ser más, y una marca
 * copiada y pegada se queda atrás en la lista que nadie se acordó de tocar.
 * Cualquier lista nueva pone este componente y ya.
 *
 * Es el MISMO dato de lo fiscal, no uno paralelo: `facturado` lo pone la
 * captura del CFDI y lo quita cancelarlo. Si un día deja de cuadrar con la
 * pantalla de Fiscal, es que hay un solo lugar donde buscar. */
export function MarcaFacturado({ mov, size = 11 }: { mov: Pick<Movimiento, "facturado">; size?: number }) {
  if (!mov.facturado) return null;
  return (
    <IconFileInvoice
      size={size}
      className="inline-block ml-1 text-mint-900 align-[-1px]"
      aria-label="Facturado"
      title="Facturado: este movimiento ya tiene su factura"
    />
  );
}
