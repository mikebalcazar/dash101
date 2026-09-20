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
  IconCash,} from "@tabler/icons-react";

/* El menú lleva el nombre al lado del ícono desde el 20-sep (lo pidió Mike):
 * un ícono sin texto se adivina, y adivinar cuesta. En el teléfono el texto se
 * esconde y queda sólo la tira de íconos: a 390 puntos, un menú de 208 se come
 * más de la mitad de la pantalla y deja las tablas sin lugar. */
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
  { href: "/nomina", icon: IconCash, label: "Raya" },
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
    <aside className="w-16 sm:w-52 bg-cream flex flex-col items-center sm:items-stretch py-4 px-0 sm:px-3 gap-1">
      {/* El logotipo oficial, el mismo del escaparate
        * (`descargas/sitio/marca/dash101.svg`). En el teléfono no cabe la
        * palabra, así que va el aro con el «101», recortado del mismo
        * archivo. Antes decía «CM», de cuando la app se llamaba Conta
        * Master. */}
      <div className="flex items-center mb-4 sm:px-1 h-9">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/dash101.svg" alt="dash101" className="hidden sm:block h-5" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/dash101-aro.svg" alt="dash101" className="sm:hidden h-7 mx-auto" />
      </div>

      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            title={item.label}
            className={`h-10 w-10 sm:w-full rounded-xl flex items-center justify-center sm:justify-start gap-2.5 sm:px-3 transition ${
              active
                ? "bg-ink text-cream"
                : "text-ink-muted hover:bg-black/5 hover:text-ink-dim"
            }`}
          >
            <Icon size={19} className="shrink-0" />
            <span className="hidden sm:block text-sm">{item.label}</span>
          </button>
        );
      })}

      <div className="flex-1" />

      <button
        onClick={() => router.push("/settings")}
        title="Configuración"
        className="h-10 w-10 sm:w-full rounded-xl flex items-center justify-center sm:justify-start gap-2.5 sm:px-3 text-ink-muted hover:bg-black/5 hover:text-ink-dim transition"
      >
        <IconSettings size={19} className="shrink-0" />
        <span className="hidden sm:block text-sm">Configuración</span>
      </button>

      <button
        onClick={signOut}
        title="Cerrar sesión"
        className="h-10 w-10 sm:w-full rounded-xl flex items-center justify-center sm:justify-start gap-2.5 sm:px-3 text-ink-muted hover:bg-black/5 hover:text-ink-dim transition"
      >
        <IconLogout size={19} className="shrink-0" />
        <span className="hidden sm:block text-sm">Cerrar sesión</span>
      </button>

      <div className="flex items-center gap-2 mt-1 sm:px-1 min-w-0">
        <div
          title={user?.email || ""}
          className="w-9 h-9 rounded-full bg-mint-50 text-mint-900 flex items-center justify-center text-xs font-medium shrink-0"
        >
          {initials}
        </div>
        <span className="hidden sm:block text-[11px] text-ink-muted truncate">{user?.email}</span>
      </div>
    </aside>
  );
}
