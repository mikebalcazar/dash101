"use client";

import { useAuth } from "@/lib/auth-context";
import { IconChevronDown, IconPlus } from "@tabler/icons-react";

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
  const { user } = useAuth();
  const firstName = (user?.displayName || user?.email?.split("@")[0] || "").split(" ")[0];

  return (
    <div className="flex justify-between items-center mb-6 gap-3">
      <div>
        <h1 className="text-xl font-medium tracking-tight text-ink-dim">
          {getGreeting()}{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="text-xs text-ink-muted mt-0.5 capitalize">{formatDate()}</p>
      </div>
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-2 bg-white border border-black/10 rounded-xl px-3 py-1.5 text-sm font-medium hover:border-black/20 transition">
          <span className="w-1.5 h-1.5 rounded-full bg-ink" />
          Todos los negocios
          <IconChevronDown size={13} className="text-ink-muted" />
        </button>
        <button className="flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3.5 py-2 text-sm font-medium transition">
          <IconPlus size={14} />
          Movimiento
        </button>
      </div>
    </div>
  );
}
