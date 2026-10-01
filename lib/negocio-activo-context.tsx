"use client";

/* LA EMPRESA ES UNA: no hay «negocio» que escoger.
 *
 * Mike, 1-oct-2026: «Ya no existe la opción de negocios en dash. Sólo es una
 * empresa/negocio todo. Elimina todas las lógicas que involucran el concepto
 * de negocio». Por dentro la suite todavía cuelga cuentas, proyectos,
 * movimientos y clientes de un `negocio_id` (la API lo sigue pidiendo hasta
 * que se quite de ahí también), así que aquí se resuelve UNA vez y nadie más
 * lo ve: el primero que la API devuelva es el de la empresa, y si no hay
 * ninguno se crea con el nombre de la empresa. Ningún formulario lo pide,
 * ninguna pantalla lo enseña, no se guarda en el navegador. */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { createNegocio, listNegocios } from "./negocios";
import { yo } from "./api/cliente";
import { org } from "./fuente";
import type { Negocio } from "@/types/schema";

type NegocioActivoContextValue = {
  /** Lo que la API tiene; en una empresa sana es una sola. */
  negocios: Negocio[];
  /** El de la empresa. null sólo mientras carga o si la API no contestó. */
  activo: Negocio | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const NegocioActivoContext = createContext<NegocioActivoContextValue | undefined>(undefined);

/** El nombre de la empresa, para bautizar el registro la primera vez. */
async function nombreDeLaEmpresa(): Promise<string> {
  try {
    const s = await yo();
    const mia = s?.orgs.find((o) => o.id === org());
    return mia?.nombre?.trim() || "Mi empresa";
  } catch {
    return "Mi empresa";
  }
}

export function NegocioActivoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [activo, setActivo] = useState<Negocio | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      let list = await listNegocios(user.uid);
      if (list.length === 0) {
        await createNegocio(user.uid, { nombre: await nombreDeLaEmpresa(), moneda: "MXN" });
        list = await listNegocios(user.uid);
      }
      setNegocios(list);
      setActivo(list[0] ?? null);
    } catch (e) {
      console.error("No se pudo leer la empresa:", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNegocios([]);
      setActivo(null);
      setLoading(false);
      return;
    }
    refresh();
  }, [user, refresh]);

  return (
    <NegocioActivoContext.Provider value={{ negocios, activo, loading, refresh }}>
      {children}
    </NegocioActivoContext.Provider>
  );
}

export function useNegocioActivo() {
  const ctx = useContext(NegocioActivoContext);
  if (!ctx) throw new Error("useNegocioActivo must be used within NegocioActivoProvider");
  return ctx;
}
