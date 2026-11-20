"use client";

/* Quién está viendo lo fiscal y qué día es. Se pregunta una vez al entrar a
 * la sección y lo usan todas sus pantallas.
 *
 * Qué puede cambiar cada quien lo decide la API en cada ruta: aquí sólo se
 * apagan los botones que de todos modos contestarían 403 (igual que hacía
 * bill101). `dirige`: dueño o administración de la empresa. `administra`:
 * además, quien lleva la contabilidad. */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { emp, quienSoy } from "@/lib/bill";
import { org } from "@/lib/fuente";

export interface SesionFiscal {
  /** El día de hoy en el centro de México (el del SAT), AAAA-MM-DD. */
  hoy: string;
  dirige: boolean;
  administra: boolean;
  lista: boolean;
}

/** El día en México, no el del reloj del teléfono en otra zona. */
export function hoyMx(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const Ctx = createContext<SesionFiscal>({ hoy: hoyMx(), dirige: false, administra: false, lista: false });
export const useFiscal = () => useContext(Ctx);

export function FiscalProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<SesionFiscal>({ hoy: hoyMx(), dirige: false, administra: false, lista: false });
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [yo, permisos] = await Promise.all([
        quienSoy().catch(() => null),
        emp("/ordenes/permisos").catch(() => null),
      ]);
      if (!vivo) return;
      const mia = (yo?.orgs || []).find((o: { id: string }) => o.id === org());
      const dirige = !!yo?.superadmin || mia?.rol === "owner" || mia?.rol === "admin";
      setS({ hoy: hoyMx(), dirige, administra: dirige || !!permisos?.puede_pagar, lista: true });
    })();
    return () => { vivo = false; };
  }, []);
  return <Ctx.Provider value={s}>{children}</Ctx.Provider>;
}
