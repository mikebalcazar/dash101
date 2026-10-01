"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { EmpresaProvider } from "@/lib/empresa-context";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { VersionNueva } from "@/components/version-nueva";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-muted">
        Cargando…
      </div>
    );
  }

  return (
    <EmpresaProvider>
      {/* En el teléfono el marco no se puede dar el lujo de márgenes: 16 de
          página + 24 de main + 64 de menú dejaban 246 px para el contenido a
          390 de ancho, y todo salía apretado y en letra chica (Mike, 30-sep:
          «Dashboard es inutilizable por el tamaño de la letra y los
          renglones»). Sin margen exterior, menú de 56 y main de 12. */}
      <div className="min-h-screen p-0 sm:p-4">
        <div className="max-w-6xl mx-auto bg-bg border-0 sm:border border-black/5 rounded-none sm:rounded-2xl overflow-hidden grid grid-cols-[56px_1fr] sm:grid-cols-[13rem_1fr] min-h-screen sm:min-h-[calc(100vh-2rem)]">
          <Sidebar />
          <main className="p-3 sm:p-6 min-w-0">
            <Topbar />
            {children}
          </main>
          <VersionNueva />
        </div>
      </div>
    </EmpresaProvider>
  );
}
