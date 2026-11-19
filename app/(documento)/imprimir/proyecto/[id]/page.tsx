"use client";

/* El estado de cuenta de un proyecto para mandar: su portada y su hoja
 * (Mike, 19-nov-2026: «También poder imprimir el estado de cuenta de
 * proyecto por proyecto»). */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { estadoDelProyecto, type EstadoDelProyecto } from "@/lib/estado-proyecto";
import { HojaDeProyecto, Portada, renglonDe } from "@/components/documento/estado-editorial";

export default function ImprimirProyecto() {
  const { id } = useParams<{ id: string }>();
  const [e, setE] = useState<EstadoDelProyecto | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    estadoDelProyecto(id).then(setE).catch((x) => setError(x instanceof Error ? x.message : "No se pudo abrir el estado de cuenta."));
  }, [id]);
  return (
    <div className="doc doc-mesa">
      <div className="doc-mandos">
        <a href={`/proyectos/${id}/estado-de-cuenta`}>← Volver</a>
        <button type="button" className="doc-boton" onClick={() => window.print()} disabled={!e}>Guardar como PDF</button>
      </div>
      {!e && !error && <p style={{ textAlign: "center", color: "#5b6b76" }}>Armando el estado de cuenta…</p>}
      {error && <p style={{ textAlign: "center", color: "#a0472c" }}>{error}</p>}
      {e && (
        <>
          <Portada d={{
            titulo: e.proyecto.nombre,
            subtitulo: [e.cliente?.nombre, e.cliente?.rfc && `RFC ${e.cliente.rfc}`].filter(Boolean).join(" · "),
            generado_at: e.generado_at, empresa: e.empresa, renglones: [renglonDe(e)], iva_cobrado: e.totales.iva_cobrado,
          }} />
          <HojaDeProyecto e={e} numero={0} />
        </>
      )}
    </div>
  );
}
