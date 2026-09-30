"use client";

/* ¿Hay una versión nueva? (30-sep-2026)
 *
 * Mike: «Me gusta el letrero que aparece en quote cuando actualizas la
 * versión y estás usándolo, que te dice que guardes tu trabajo y refresques
 * la página. Haz eso para todas las webapps».
 *
 * Al publicar, el flujo deja `public/huella.txt` con el commit (público y
 * sin datos). Se compara con la huella que había al abrir; si cambió, se
 * avisa y la persona decide cuándo recargar. Cada 2 minutos y cuando la
 * pestaña vuelve a verse; no con el `focus` de la ventana. */

import { useEffect, useState } from "react";

export function VersionNueva({ app = "dash101" }: { app?: string }) {
  const [hay, setHay] = useState(false);
  useEffect(() => {
    let base: string | null = null;
    let vivo = true;
    const revisar = async () => {
      try {
        const r = await fetch("/huella.txt", { cache: "no-store" });
        if (!r.ok) return;
        const h = (await r.text()).trim();
        if (!h || h.length > 80 || /[<>\s]/.test(h)) return;
        if (base === null) base = h;
        else if (h !== base && vivo) setHay(true);
      } catch {
        /* sin red: se vuelve a intentar */
      }
    };
    void revisar();
    const cada = setInterval(revisar, 120000);
    const alVolver = () => { if (document.visibilityState === "visible") void revisar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { vivo = false; clearInterval(cada); document.removeEventListener("visibilitychange", alVolver); };
  }, []);
  if (!hay) return null;
  return (
    <div
      id="aviso-version"
      data-version-nueva=""
      role="status"
      className="fixed left-1/2 bottom-4 -translate-x-1/2 z-[5000] flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-[#1d1f20] text-white text-[13px] leading-snug shadow-2xl max-w-[calc(100vw-32px)]"
    >
      <span>Hay una versión nueva de {app}. Termina lo que estés haciendo, guarda, y recarga.</span>
      <button
        type="button"
        onClick={() => location.reload()}
        className="border-0 rounded px-3 py-1.5 bg-[#C6FF3D] text-[#1d1f20] font-bold whitespace-nowrap"
      >
        Recargar
      </button>
    </div>
  );
}
