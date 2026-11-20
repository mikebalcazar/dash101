"use client";

/* La vista previa de una factura que todavía no se timbra. «Nueva factura»
 * deja el borrador en sessionStorage y abre esta página; aquí se le pide el
 * PDF a la API y se enseña. Así la pestaña nueva es una página de verdad (no
 * un blob mandado desde otra ventana, que algunos navegadores no abren). */

import { useEffect, useState } from "react";
import { apiBase } from "@/lib/fuente";

export default function FacturaPreviaPage() {
  const [liga, setLiga] = useState("");
  const [texto, setTexto] = useState("Armando el PDF…");
  const [mal, setMal] = useState(false);
  useEffect(() => {
    let url = "";
    (async () => {
      let d: { org?: string; borrador?: unknown } | null = null;
      try { d = JSON.parse(sessionStorage.getItem("dash-fiscal-previa") || "null"); } catch { /* nada */ }
      if (!d || !d.org || !d.borrador) { setMal(true); setTexto("No hay borrador que enseñar. Cierra esta pestaña y vuelve a pedir la vista previa."); return; }
      try {
        const r = await fetch(`${apiBase()}/orgs/${encodeURIComponent(d.org)}/fiscal/emitir/vista-previa`, {
          method: "POST", headers: { "Content-Type": "application/json", "X-App": "dash101" }, body: JSON.stringify({ borrador: d.borrador }), credentials: "include",
        });
        if (!r.ok) { const j = await r.json().catch(() => null); throw new Error(j?.detalle?.motivo || j?.error || `no se pudo armar (${r.status})`); }
        url = URL.createObjectURL(await r.blob());
        setLiga(url);
        setTexto("Así queda la factura. Todavía no está timbrada: sin folio fiscal no vale.");
      } catch (e) { setMal(true); setTexto(e instanceof Error ? e.message : "No se pudo armar la vista previa."); }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, []);
  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: "rgb(var(--c-bg))" }} data-lista={liga || mal ? "1" : undefined}>
      <div className="flex items-center gap-3 px-4 py-2.5 text-sm border-b border-black/10">
        <b className="text-ink-dim">Vista previa</b>
        <span className={mal ? "text-mauve-900" : "text-ink-muted"}>{texto}</span>
        {liga && <a href={liga} download="vista-previa.pdf" className="text-marca hover:underline ml-auto">Bajar</a>}
      </div>
      {liga && <embed type="application/pdf" src={liga} className="flex-1 w-full" />}
    </div>
  );
}
