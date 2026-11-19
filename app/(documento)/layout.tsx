"use client";

/* El papel: sin menú ni marco de la app, para que el estado de cuenta salga
 * a sangre como documento (Mike, 19-nov-2026). Pide sesión como todo dash. */

import "./documento.css";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { EmpresaProvider } from "@/lib/empresa-context";

export default function DocumentoLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);
  if (loading || !user) return <div className="min-h-screen flex items-center justify-center text-ink-muted">Cargando…</div>;
  return <EmpresaProvider>{children}</EmpresaProvider>;
}
