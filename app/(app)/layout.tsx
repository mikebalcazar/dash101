"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { EmpresaProvider } from "@/lib/empresa-context";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { VersionNueva } from "@/components/version-nueva";
import { PanelItemHost } from "@/components/panel-item";

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
      {/* 20-nov-2026 · Material Design 3: ya no hay un marco flotando sobre
          un fondo. La app ocupa la ventana: a la izquierda el cajón de
          navegación (un riel de íconos en el teléfono), que se queda en su
          lugar mientras el contenido corre, y el contenido a un ancho que
          se pueda leer. */}
      <div className="min-h-screen grid grid-cols-[56px_1fr] sm:grid-cols-[14rem_1fr]">
        <Sidebar />
        <main className="p-3 sm:px-8 sm:py-6 min-w-0">
          <div className="max-w-6xl mx-auto">
            <Topbar />
            {children}
          </div>
        </main>
        <VersionNueva />
        {/* El panel del ítem (lo que se ve en quell), desde cualquier lista. */}
        <PanelItemHost />
      </div>
    </EmpresaProvider>
  );
}
