"use client";

/* LA EMPRESA ES UNA, y aquí se lee una sola vez para todas las pantallas.
 *
 * Mike, 1-oct-2026: «Ya no existe la opción de negocios en dash. Sólo es una
 * empresa/negocio todo». La API contesta la empresa por su ruta (/empresa) y
 * la bautiza la primera vez. Ningún formulario la pide, no se escoge, no se
 * guarda en el navegador: lo que una pantalla necesita de ella —el nombre,
 * la moneda, el día de conciliación— lo toma de `useEmpresa()`. */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { getEmpresa, type Empresa } from "./empresa";

type EmpresaContextValue = {
  /** null sólo mientras carga o si la API no contestó. */
  empresa: Empresa | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const EmpresaContext = createContext<EmpresaContextValue | undefined>(undefined);

export function EmpresaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setEmpresa(await getEmpresa());
    } catch (e) {
      console.error("No se pudo leer la empresa:", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setEmpresa(null);
      setLoading(false);
      return;
    }
    refresh();
  }, [user, refresh]);

  return (
    <EmpresaContext.Provider value={{ empresa, loading, refresh }}>
      {children}
    </EmpresaContext.Provider>
  );
}

export function useEmpresa() {
  const ctx = useContext(EmpresaContext);
  if (!ctx) throw new Error("useEmpresa must be used within EmpresaProvider");
  return ctx;
}
