"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

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
    <div className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto bg-bg border border-black/5 rounded-2xl overflow-hidden grid grid-cols-[64px_1fr] min-h-[calc(100vh-2rem)]">
        <Sidebar />
        <main className="p-6 min-w-0">
          <Topbar />
          {children}
        </main>
      </div>
    </div>
  );
}
