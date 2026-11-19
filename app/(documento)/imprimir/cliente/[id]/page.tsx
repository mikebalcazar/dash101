"use client";

/* El estado de cuenta del cliente para mandar: portada con el saldo de cada
 * proyecto y el total, y una hoja por proyecto con su desglose y sus pagos
 * (Mike, 19-nov-2026). Sólo obras en proceso con saldo por cobrar («solo debe
 * incluir obras en proceso donde haya aún saldo por cobrar»); las demás, sólo
 * si se pide «Incluir obras cerradas». El PDF lo hace el navegador: «Guardar como PDF». */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { estadoDeCuenta, porCobrar, type EstadoDeCuenta } from "@/lib/estado-cuenta";
import { estadoDelProyecto, type EstadoDelProyecto } from "@/lib/estado-proyecto";
import { HojaDeProyecto, Portada, ResumenContinuacion, renglonDe } from "@/components/documento/estado-editorial";

export default function ImprimirCliente() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<EstadoDeCuenta | null>(null);
  const [hojas, setHojas] = useState<EstadoDelProyecto[]>([]);
  const [cerradas, setCerradas] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true); setError("");
      try {
        const d = await estadoDeCuenta(id);
        if (!vivo) return;
        setC(d);
        const ids = d.proyectos.filter((p) => cerradas || porCobrar(p)).map((p) => p.id);
        const es = await Promise.all(ids.map((pid) => estadoDelProyecto(pid)));
        if (vivo) setHojas(es);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudo armar el estado de cuenta.");
      } finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; };
  }, [id, cerradas]);

  const portada = useMemo(() => {
    if (!c) return null;
    const porAplicar = c.otros_pagos.reduce((t, p) => t + (p.sin_iva ?? p.monto), 0);
    return {
      titulo: c.cliente.nombre,
      subtitulo: [c.cliente.rfc && `RFC ${c.cliente.rfc}`, "Estado de cuenta por proyecto"].filter(Boolean).join(" · "),
      generado_at: hojas[0]?.generado_at ?? new Date().toISOString(),
      empresa: hojas.find((h) => h.empresa)?.empresa ?? null,
      renglones: hojas.map(renglonDe),
      por_aplicar: porAplicar > 0 ? porAplicar : 0,
      iva_cobrado: hojas.reduce((t, h) => t + h.totales.iva_cobrado, 0),
    };
  }, [c, hojas]);

  return (
    <div className="doc doc-mesa">
      <div className="doc-mandos">
        <a href={`/clientes/${id}/estado-de-cuenta`}>← Volver</a>
        <label><input type="checkbox" checked={cerradas} onChange={(e) => setCerradas(e.target.checked)} data-incluir-cerradas /> Incluir obras cerradas</label>
        <button type="button" className="doc-boton" onClick={() => window.print()} disabled={cargando}>Guardar como PDF</button>
      </div>
      {cargando && <p style={{ textAlign: "center", color: "#5b6b76" }}>Armando el estado de cuenta…</p>}
      {error && <p style={{ textAlign: "center", color: "#a0472c" }}>{error}</p>}
      {!cargando && portada && (
        <>
          <Portada d={portada} />
          <ResumenContinuacion d={portada} />
          {hojas.map((e, i) => <HojaDeProyecto key={e.proyecto.id} e={e} numero={i} />)}
        </>
      )}
    </div>
  );
}
