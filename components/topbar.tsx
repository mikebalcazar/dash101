"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useEmpresa } from "@/lib/empresa-context";
import { IconPlus, IconBuildingSkyscraper } from "@tabler/icons-react";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function formatDate() {
  const d = new Date();
  return d.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function Topbar() {
  const router = useRouter();
  const { user } = useAuth();
  const { empresa, loading } = useEmpresa();
  const firstName = (user?.displayName || user?.email?.split("@")[0] || "").split(" ")[0];

  /* La empresa es una (Mike, 1-oct-2026): aquí sólo se dice cuál es. No hay
   * desplegable ni nada que escoger. */
  return (
    <div className="flex flex-wrap justify-between items-center mb-4 sm:mb-6 gap-x-3 gap-y-2">
      <div className="min-w-0">
        <h1 className="text-lg leading-6 sm:text-[1.75rem] sm:leading-9 text-ink-dim">
          {getGreeting()}{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="text-sm text-ink-muted mt-0.5 first-letter:uppercase">{formatDate()}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          data-empresa={empresa?.id ?? ""}
          className="flex items-center gap-2 border border-black/10 rounded-lg h-8 px-3 text-sm font-medium text-ink-muted"
        >
          <IconBuildingSkyscraper size={13} className="text-ink-muted" />
          <span className="max-w-[84px] sm:max-w-[180px] truncate">
            {loading ? "Cargando…" : empresa?.nombre ?? "…"}
          </span>
        </span>
        <button
          onClick={() => router.push("/movimientos/nuevo")}
          disabled={!empresa}
          className="flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:opacity-50"
        >
          <IconPlus size={14} />
          Movimiento
        </button>
      </div>
    </div>
  );
}
