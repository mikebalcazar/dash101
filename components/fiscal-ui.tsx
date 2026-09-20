"use client";

/* Lo que comparten las tres pantallas fiscales: la barra para moverse entre
 * ellas, el selector de mes y el aviso que Mike pidió ver en pantalla.
 *
 * El aviso no es decorado: dice que esto ordena la información fiscal y que
 * no presenta declaraciones ni sustituye al contador. Va en las tres, con el
 * mismo texto, porque a cualquiera de las tres se puede llegar directo. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AVISO_FISCAL, nombreDelMes, ultimosMeses } from "@/lib/fiscal";
import { IconInfoCircle } from "@tabler/icons-react";

const TABS = [
  { href: "/fiscal", label: "IVA del mes" },
  { href: "/fiscal/pendientes", label: "Falta la factura" },
  { href: "/fiscal/cfdi", label: "Facturas" },
];

export function TabsFiscal() {
  const ruta = usePathname();
  return (
    <div className="flex gap-1 mb-4 overflow-x-auto">
      {TABS.map((t) => {
        const activa = ruta === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-xl px-3 py-1.5 text-sm whitespace-nowrap transition ${
              activa ? "bg-ink text-cream" : "bg-white border border-black/5 text-ink-muted hover:text-ink-dim"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

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
