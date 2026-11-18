"use client";

/* La liga a la obra de quell101, junto al nombre del proyecto.
 *
 * Mike, 18-nov-2026, con la pantalla enfrente: «Mueve la liga al nombre del
 * proyecto y quita esa sección. Y ya quita la sección de los elementos de
 * obra que lee de quell. Ya no vamos a importar de quell en tiempo real.»
 * Hasta ese día aquí vivía el bloque «Obra en quell101» —ligar, quitar la
 * liga y juntar las piezas del plano con los ítems—. Queda sólo el ↗: si el
 * proyecto tiene obra, abre su plano en quell101; si no, no se pinta nada.
 */

import { useEffect, useState } from "react";
import { IconExternalLink } from "@tabler/icons-react";
import { obraDeProyecto, urlObra, type Obra } from "@/lib/obras";

export function LigaDeLaObra({ proyectoId }: { proyectoId: string }) {
  const [obra, setObra] = useState<Obra | null>(null);

  useEffect(() => {
    let vivo = true;
    // Una empresa sin quell101 prendido contesta 403: no hay liga que poner.
    obraDeProyecto(proyectoId)
      .then((o) => { if (vivo) setObra(o); })
      .catch(() => { if (vivo) setObra(null); });
    return () => { vivo = false; };
  }, [proyectoId]);

  if (!obra) return null;
  return (
    <a
      data-liga-obra
      href={urlObra(obra)}
      target="_blank"
      rel="noreferrer"
      title={`Abrir «${obra.nombre}» en quell101`}
      aria-label={`Abrir la obra en quell101`}
      className="text-marca hover:opacity-75 inline-flex"
    >
      <IconExternalLink size={16} />
    </a>
  );
}
