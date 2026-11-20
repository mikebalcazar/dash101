"use client";

/* Lo que comparten las pantallas fiscales que dash101 ya tenía: el selector
 * de mes, bajar un CSV y el aviso que Mike pidió ver en pantalla. La barra
 * para moverse entre secciones vive ahora en `app/(app)/fiscal/layout.tsx`
 * (19-nov-2026, al entrar bill101 a «Fiscal»).
 *
 * El aviso no es decorado: dice que esto ordena la información fiscal y que
 * no presenta declaraciones ni sustituye al contador. Va en las tres, con el
 * mismo texto, porque a cualquiera de las tres se puede llegar directo. */

import { AVISO_FISCAL, nombreDelMes, ultimosMeses } from "@/lib/fiscal";
import { IconInfoCircle } from "@tabler/icons-react";

export function AvisoFiscal() {
  return (
    <p className="flex items-start gap-1.5 text-[11px] text-ink-muted bg-cream rounded-xl px-3 py-2 mt-4">
      <IconInfoCircle size={13} className="shrink-0 mt-0.5" />
      {AVISO_FISCAL}
    </p>
  );
}

export function SelectorDeMes({ mes, alCambiar }: { mes: string; alCambiar: (m: string) => void }) {
  return (
    <select
      className="bg-white border border-black/10 rounded-xl px-3 py-2 text-sm"
      value={mes}
      onChange={(e) => alCambiar(e.target.value)}
      aria-label="Mes"
    >
      {ultimosMeses().map((m) => (
        <option key={m} value={m}>{nombreDelMes(m)}</option>
      ))}
    </select>
  );
}

/** Bajar un CSV armado aquí mismo. El separador es coma y el texto va entre
 *  comillas: Excel en español lo abre igual y no parte los conceptos que
 *  traen coma. */
export function bajarCsv(nombre: string, renglones: (string | number)[][]) {
  const csv = renglones
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  // El BOM es lo que hace que Excel lea los acentos bien.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
