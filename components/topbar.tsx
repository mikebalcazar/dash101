"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
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
  const { activo, loading } = useNegocioActivo();
  const firstName = (user?.displayName || user?.email?.split("@")[0] || "").split(" ")[0];

  /* UN SOLO NEGOCIO (Mike, 29-sep): «borres de dash (y de todas las
   * plataformas) la opción de agregar diferentes negocios (…) Todo es para
   * un negocio nada más». Aquí había un desplegable para cambiar de negocio
   * y crear otro; ahora sólo se dice cuál es. */
  return (
    <div className="flex justify-between items-center mb-4 sm:mb-6 gap-3">
      <div>
        <h1 className="text-lg sm:text-xl font-medium tracking-tight text-ink-dim">
          {getGreeting()}{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="text-xs text-ink-muted mt-0.5 capitalize">{formatDate()}</p>
      </div>
      <div className="flex items-center gap-2">
        <span
          data-empresa={activo?.id ?? ""}
          className="flex items-center gap-2 bg-white border border-black/10 rounded-xl px-3 py-1.5 text-sm font-medium"
        >
          <IconBuildingSkyscraper size={13} className="text-ink-muted" />
          <span className="max-w-[110px] sm:max-w-[180px] truncate">
            {loading ? "Cargando…" : activo?.nombre ?? "…"}
          </span>
        </span>
        <button
          onClick={() => router.push("/movimientos/nuevo")}
          disabled={!activo}
          className="flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:opacity-50"
        >
          <IconPlus size={14} />
          Movimiento
        </button>
      </div>
    </div>
  );
}
