"use client";

/* LA EMPRESA ES UNA: no hay «negocio» que escoger.
 *
 * Mike, 1-oct-2026: «Ya no existe la opción de negocios en dash. Sólo es una
 * empresa/negocio todo. Elimina todas las lógicas que involucran el concepto
 * de negocio». Por dentro la suite todavía cuelga cuentas, proyectos,
 * movimientos y clientes de un `negocio_id` (la API lo sigue pidiendo hasta
 * que se quite de ahí también), así que aquí se resuelve UNA vez y nadie más
 * lo ve: la API contesta la empresa por su ruta (/empresa, contrato 0.62.0)
 * y la bautiza la primera vez. Ningún formulario lo pide, ninguna pantalla
 * lo enseña, no se guarda en el navegador. */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { getEmpresa } from "./empresa";
import { Timestamp } from "firebase/firestore";
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

export function NegocioActivoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [activo, setActivo] = useState<Negocio | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      /* La API contesta la empresa (y la bautiza la primera vez, contrato
       * 0.62.0). Se envuelve con la forma de `Negocio` para que las pantallas
       * que todavía leen `activo.id`, `activo.moneda` o `activo.nombre` no
       * cambien hoy; la limpieza de esa forma es de la fase D. */
      const e = await getEmpresa();
      const una: Negocio = {
        id: e.id, nombre: e.nombre, descripcion: "", rfc: e.rfc ?? "", moneda: e.moneda,
        dia_conciliacion: e.dia_conciliacion, owner_uid: user.uid, miembros_uids: [user.uid],
        creado_at: Timestamp.now(), creado_por: "",
      };
      setNegocios([una]);
      setActivo(una);
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
