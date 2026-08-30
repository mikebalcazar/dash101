"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { IconChevronDown, IconPlus, IconCheck, IconBuildingSkyscraper } from "@tabler/icons-react";

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
  const { negocios, activo, setActivo, loading } = useNegocioActivo();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const firstName = (user?.displayName || user?.email?.split("@")[0] || "").split(" ")[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="flex justify-between items-center mb-6 gap-3">
      <div>
        <h1 className="text-xl font-medium tracking-tight text-ink-dim">
          {getGreeting()}{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="text-xs text-ink-muted mt-0.5 capitalize">{formatDate()}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            disabled={loading}
            className="flex items-center gap-2 bg-white border border-black/10 rounded-xl px-3 py-1.5 text-sm font-medium hover:border-black/20 transition disabled:opacity-50"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-ink" />
            <span className="max-w-[180px] truncate">
              {loading ? "Cargando…" : activo?.nombre ?? "Sin negocios"}
            </span>
            <IconChevronDown size={13} className="text-ink-muted" />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-black/10 rounded-2xl shadow-lg z-20 overflow-hidden">
              {negocios.length === 0 ? (
                <div className="px-3 py-4 text-xs text-ink-muted text-center">
                  Aún no tienes negocios
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto py-1">
                  {negocios.map((n) => {
                    const isActive = activo?.id === n.id;
                    return (
                      <button
                        key={n.id}
                        onClick={() => {
                          setActivo(n);
                          setOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-cream transition ${
                          isActive ? "bg-cream/60" : ""
                        }`}
                      >
                        <div className="w-6 h-6 rounded-md bg-mint-50 text-mint-900 flex items-center justify-center flex-shrink-0">
                          <IconBuildingSkyscraper size={12} />
                        </div>
                        <span className="flex-1 truncate">{n.nombre}</span>
                        {isActive && <IconCheck size={14} className="text-ink" />}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="border-t border-black/5">
                <Link
                  href="/negocios/nuevo"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-cream transition"
                >
                  <IconPlus size={14} className="text-ink-muted" />
                  Crear nuevo negocio
                </Link>
                <Link
                  href="/negocios"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2.5 text-xs text-ink-muted hover:bg-cream transition border-t border-black/5"
                >
                  Administrar negocios →
                </Link>
              </div>
            </div>
          )}
        </div>
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
