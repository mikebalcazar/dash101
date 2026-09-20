"use client";

/* Los ítems del proyecto que todavía no tienen precio · contrato 0.26.0.
 *
 * Son las piezas que se trajeron del plano de la obra. Nacen COTIZADAS y en
 * cero, porque una pieza del plano no trae cuánto cuesta: si nacieran
 * vendidas en cero, el monto de venta del proyecto diría una cifra que nadie
 * tecleó.
 *
 * Pero cotizadas quedaban INVISIBLES en dash101, porque la lista de ítems del
 * proyecto sólo enseña los vendidos. La pieza existía y no había dónde
 * tocarla; eso no es una entrega a medias, es un hueco. Aquí se ven, con su
 * aviso de que no cuentan para el monto de venta hasta que alguien las pase.
 */

import { useEffect, useState } from "react";
import { IconRuler } from "@tabler/icons-react";
import { itemsSinPrecio } from "@/lib/proyectos";

type SinPrecio = Awaited<ReturnType<typeof itemsSinPrecio>>[number];

export function ItemsSinPrecio({ proyectoId, recargar }: { proyectoId: string; recargar?: number }) {
  const [filas, setFilas] = useState<SinPrecio[]>([]);

  useEffect(() => {
    let vivo = true;
    itemsSinPrecio(proyectoId)
      .then((f) => { if (vivo) setFilas(f); })
      .catch(() => { if (vivo) setFilas([]); });
    return () => { vivo = false; };
  }, [proyectoId, recargar]);

  if (filas.length === 0) return null;

  return (
    <div className="bg-white border border-black/5 rounded-2xl p-4 mb-4">
      <h3 className="text-sm font-medium text-ink-dim mb-1 inline-flex items-center gap-1.5">
        <IconRuler size={15} className="text-ink-muted" />
        Traídos del plano, sin precio
      </h3>
      <p className="text-xs text-ink-muted mb-2">
        Estas piezas están en el plano de la obra y todavía nadie les pone precio.{" "}
        <b>No cuentan para el monto de venta</b> hasta que las agregues como ítem con su
        importe, en «Editar proyecto».
      </p>
      <ul className="text-xs text-ink-dim space-y-0.5">
        {filas.map((f) => (
          <li key={f.id}>
            {f.clave ? `${f.clave} · ` : ""}{f.nombre}
            {f.tipo ? <span className="text-ink-muted"> · {f.tipo}</span> : null}
            {f.cantidad > 1 ? <span className="text-ink-muted"> · {f.cantidad} piezas</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
