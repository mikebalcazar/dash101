"use client";

/* Fiscal: lo que era bill101, dentro de dash101.
 *
 * Mike, 19-nov-2026: «vamos a fusionar bill101 con dash101. bill101 va a
 * entrar en el menú "Fiscal" de dash101». Las secciones de bill101 son las
 * fichas de arriba; «Falta la factura» es la que dash101 ya tenía (los
 * cobros y pagos que esperan su factura). */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiscalProvider } from "@/components/fiscal/contexto";
import { Avisos } from "@/components/fiscal/ui";

const FICHAS: { href: string; label: string; tambien?: string[] }[] = [
  { href: "/fiscal", label: "Inicio" },
  { href: "/fiscal/facturas", label: "Facturas", tambien: ["/fiscal/nueva", "/fiscal/emisiones", "/fiscal/prefacturas"] },
  { href: "/fiscal/ligar", label: "Por ligar" },
  { href: "/fiscal/pendientes", label: "Falta la factura" },
  { href: "/fiscal/impuestos", label: "Impuestos", tambien: ["/fiscal/estado"] },
  { href: "/fiscal/sat", label: "SAT" },
  { href: "/fiscal/ajustes", label: "Ajustes" },
];

export default function FiscalLayout({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const activa = (f: (typeof FICHAS)[number]) =>
    f.href === "/fiscal" ? ruta === "/fiscal" : [f.href, ...(f.tambien ?? [])].some((p) => ruta === p || ruta.startsWith(p + "/"));
  return (
    <FiscalProvider>
      <Avisos>
        <nav className="flex gap-1 mb-5 overflow-x-auto print:hidden" aria-label="Secciones de Fiscal" data-fichas-fiscal>
          {FICHAS.map((f) => (
            <Link key={f.href} href={f.href} aria-current={activa(f) ? "page" : undefined}
              className={`rounded-xl px-3 py-1.5 text-sm whitespace-nowrap transition ${activa(f) ? "bg-ink text-cream" : "bg-white border border-black/5 text-ink-muted hover:text-ink-dim"}`}>
              {f.label}
            </Link>
          ))}
        </nav>
        {children}
      </Avisos>
    </FiscalProvider>
  );
}
