"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "./auth-context";
import { listNegocios } from "./negocios";
import type { Negocio } from "@/types/schema";

const STORAGE_KEY = "conta-master:negocio-activo-id";

type NegocioActivoContextValue = {
  negocios: Negocio[];
  activo: Negocio | null;
  setActivo: (n: Negocio | null) => void;
  loading: boolean;
  refresh: () => Promise<void>;
};

const NegocioActivoContext = createContext<NegocioActivoContextValue | undefined>(undefined);

export function NegocioActivoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [activo, setActivoState] = useState<Negocio | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const list = await listNegocios(user.uid);
      setNegocios(list);

      const savedId =
        typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const found = savedId ? list.find((n) => n.id === savedId) : null;
      const next = found ?? list[0] ?? null;
      setActivoState(next);
      if (next && typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, next.id!);
      }
    } catch (e) {
      console.error("Failed to load negocios:", e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNegocios([]);
      setActivoState(null);
      setLoading(false);
      return;
    }
    refresh();
  }, [user, refresh]);

  const setActivo = (n: Negocio | null) => {
    setActivoState(n);
    if (typeof window !== "undefined") {
      if (n?.id) localStorage.setItem(STORAGE_KEY, n.id);
      else localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <NegocioActivoContext.Provider value={{ negocios, activo, setActivo, loading, refresh }}>
      {children}
    </NegocioActivoContext.Provider>
  );
}

export function useNegocioActivo() {
  const ctx = useContext(NegocioActivoContext);
  if (!ctx) throw new Error("useNegocioActivo must be used within NegocioActivoProvider");
  return ctx;
}
