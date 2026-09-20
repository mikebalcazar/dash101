"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  IconHome,
  IconFolder,
  IconWallet,
  IconArrowsExchange,
  IconUsers,
  IconTruck,
  IconReceipt,
  IconChartLine,
  IconSettings,
  IconLogout,
  IconBuildingSkyscraper,
  IconUsersGroup,
  IconScale,
  IconShoppingCart,
  IconReceiptTax,
} from "@tabler/icons-react";

type NavItem = { href: string; icon: typeof IconHome; label: string };

const items: NavItem[] = [
  { href: "/dashboard", icon: IconHome, label: "Inicio" },
  { href: "/negocios", icon: IconBuildingSkyscraper, label: "Negocios" },
  { href: "/proyectos", icon: IconFolder, label: "Proyectos" },
  { href: "/cuentas", icon: IconWallet, label: "Cuentas" },
  { href: "/movimientos", icon: IconArrowsExchange, label: "Movimientos" },
  { href: "/clientes", icon: IconUsers, label: "Clientes" },
  { href: "/proveedores", icon: IconTruck, label: "Proveedores" },
  { href: "/opex", icon: IconReceipt, label: "OPEX" },
  { href: "/ordenes", icon: IconShoppingCart, label: "Compras" },
  { href: "/fiscal", icon: IconReceiptTax, label: "Fiscal" },
  { href: "/conciliacion", icon: IconScale, label: "Conciliación" },
  { href: "/flujo", icon: IconChartLine, label: "Flujo" },
  { href: "/equipo", icon: IconUsersGroup, label: "Equipo" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();

  const initials = (user?.displayName || user?.email || "U")
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <aside className="w-16 bg-cream flex flex-col items-center py-4 gap-1">
      <div className="w-9 h-9 rounded-xl bg-ink text-cream flex items-center justify-center text-sm font-medium mb-4">
        CM
      </div>

      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            title={item.label}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
              active
                ? "bg-ink text-cream"
                : "text-ink-muted hover:bg-black/5 hover:text-ink-dim"
            }`}
          >
            <Icon size={19} />
          </button>
        );
      })}

      <div className="flex-1" />

      <button
        onClick={() => router.push("/settings")}
        title="Configuración"
        className="w-10 h-10 rounded-xl flex items-center justify-center text-ink-muted hover:bg-black/5 hover:text-ink-dim transition"
      >
        <IconSettings size={19} />
      </button>

      <button
        onClick={signOut}
        title="Cerrar sesión"
        className="w-10 h-10 rounded-xl flex items-center justify-center text-ink-muted hover:bg-black/5 hover:text-ink-dim transition"
      >
        <IconLogout size={19} />
      </button>

      <div
        title={user?.email || ""}
        className="w-9 h-9 rounded-full bg-mint-50 text-mint-900 flex items-center justify-center text-xs font-medium mt-1"
      >
        {initials}
      </div>
    </aside>
  );
}
