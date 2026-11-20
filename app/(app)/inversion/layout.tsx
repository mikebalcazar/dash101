"use client";

/* Préstamos: lo que era patron101 para quien dirige, dentro de dash101.
 *
 * Mike, 20-nov-2026: «hay que meter patron101 a dash también. Igual que
 * bill101». Las secciones de patron101 son las fichas de arriba; «Inicio» es
 * la pantalla que dash101 ya tenía (confirmar depósitos y registrar pagos:
 * donde se mueve el dinero), con el resumen de patron101 encima.
 *
 * Lo de QUIEN PRESTA no vive aquí: esa gente no es de la empresa y entra por
 * patron.suite101.app a ver su estado de cuenta y a ofrecer en una ronda. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avisos } from "@/components/fiscal/ui";
import { Globo, PatronProvider, usePatron } from "@/components/patron/piezas";

const FICHAS: { href: string; label: string }[] = [
  { href: "/inversion", label: "Inicio" },
  { href: "/inversion/rondas", label: "Rondas" },
  { href: "/inversion/prestamos", label: "Préstamos" },
  { href: "/inversion/inversionistas", label: "Inversionistas" },
  { href: "/inversion/ajustes", label: "Ajustes" },
];

function Fichas() {
  const ruta = usePathname();
  const { resumen, cerrado } = usePatron();
  // Quien no dirige (o una empresa sin patron101) no tiene a dónde ir.
  if (cerrado) return null;
  const activa = (href: string) => (href === "/inversion" ? ruta === "/inversion" : ruta === href || ruta.startsWith(href + "/"));
  return (
    <nav className="flex gap-1 mb-5 overflow-x-auto print:hidden" aria-label="Secciones de Préstamos" data-fichas-prestamos>
      {FICHAS.map((f) => (
        <Link key={f.href} href={f.href} aria-current={activa(f.href) ? "page" : undefined}
          className={`rounded-xl px-3 py-1.5 text-sm whitespace-nowrap transition ${activa(f.href) ? "bg-ink text-cream" : "bg-white border border-black/5 text-ink-muted hover:text-ink-dim"}`}>
          {f.label}{f.href === "/inversion/rondas" && resumen?.ofertas_pendientes ? <> <Globo n={resumen.ofertas_pendientes} /></> : null}
        </Link>
      ))}
    </nav>
  );
}

export default function PrestamosLayout({ children }: { children: React.ReactNode }) {
  return (
    <PatronProvider>
      <Avisos>
        <Fichas />
        {children}
      </Avisos>
    </PatronProvider>
  );
}
