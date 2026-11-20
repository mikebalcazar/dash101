"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import { useEmpresa } from "@/lib/empresa-context";
import { getResumenOrdenes } from "@/lib/ordenes";
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
  IconUsersGroup,
  IconScale,
  IconShoppingCart,
  IconReceiptTax,
  IconCash,
  IconCoins,
  IconBuildingBank,
  IconCashBanknote,
} from "@tabler/icons-react";

/* El menú lleva el nombre al lado del ícono desde el 20-sep (lo pidió Mike):
 * un ícono sin texto se adivina, y adivinar cuesta. En el teléfono el texto se
 * esconde y queda sólo la tira de íconos: a 390 puntos, un menú de 208 se come
 * más de la mitad de la pantalla y deja las tablas sin lugar. */
type NavItem = { href: string; icon: typeof IconHome; label: string };

const items: NavItem[] = [
  { href: "/dashboard", icon: IconHome, label: "Inicio" },
  { href: "/proyectos", icon: IconFolder, label: "Proyectos" },
  { href: "/cuentas", icon: IconWallet, label: "Cuentas" },
  { href: "/movimientos", icon: IconArrowsExchange, label: "Movimientos" },
  { href: "/clientes", icon: IconUsers, label: "Clientes" },
  { href: "/proveedores", icon: IconTruck, label: "Proveedores" },
  { href: "/opex", icon: IconReceipt, label: "OPEX" },
  // «Compras» a secas (Mike, 30-sep-2026): los reembolsos viven adentro.
  { href: "/ordenes", icon: IconShoppingCart, label: "Compras" },
  // Mike, 18-nov-2026: «poner en dash los pagos pendientes de cada proyecto a
  // cada contratista» (contrato 0.105.0).
  { href: "/pagos-pendientes", icon: IconCashBanknote, label: "Por pagar" },
  // «Nómina», no «Raya» (Mike, 1-oct-2026).
  { href: "/nomina", icon: IconCash, label: "Nómina" },
  // Mike, 30-sep-2026: «un módulo de accionistas donde se registren pagos a
  // los accionistas como retiro de utilidades».
  { href: "/accionistas", icon: IconCoins, label: "Accionistas" },
  // Mike, 8-oct-2026: lo que se le debe a quienes le prestaron (investor101).
  // Aquí se confirman los depósitos y se registran los pagos.
  { href: "/inversion", icon: IconBuildingBank, label: "Préstamos" },
  { href: "/fiscal", icon: IconReceiptTax, label: "Fiscal" },
  { href: "/conciliacion", icon: IconScale, label: "Conciliación" },
  { href: "/flujo", icon: IconChartLine, label: "Flujo" },
  { href: "/equipo", icon: IconUsersGroup, label: "Equipo" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { empresa } = useEmpresa();
  /* El circulito de Compras (Mike, 30-sep-2026: «un circulito con la
   * cantidad de órdenes sin pagar, como de mensajes sin leer»): compras y
   * reembolsos en el buzón de la empresa. Se vuelve a pedir al cambiar
   * de pantalla, que es cuando algo se pudo haber pagado; quien no ve dinero
   * no recibe el número y no ve el circulito. */
  const [porPagar, setPorPagar] = useState(0);
  useEffect(() => {
    if (!empresa) { setPorPagar(0); return; }
    let vivo = true;
    getResumenOrdenes()
      .then((r) => { if (vivo) setPorPagar(r.compras.cuantas + r.reembolsos.cuantas); })
      .catch(() => { if (vivo) setPorPagar(0); });
    return () => { vivo = false; };
  }, [empresa, pathname]);

  const initials = (user?.displayName || user?.email || "U")
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    /* 20-nov-2026 · el cajón de navegación de Material 3: superficie un tono
     * abajo del fondo, sin raya; lo escogido es una píldora en el contenedor
     * primario, no un bloque de tinta. Se queda fijo y, si no cabe, corre
     * por dentro. */
    <aside className="md-cajon sticky top-0 h-screen overflow-y-auto w-14 sm:w-56 flex flex-col items-center sm:items-stretch py-4 px-0 sm:px-3 gap-0.5">
      {/* El logotipo oficial, el mismo del escaparate
        * (`descargas/sitio/marca/dash101.svg`). En el teléfono no cabe la
        * palabra, así que va el aro con el «101», recortado del mismo
        * archivo. Antes decía «CM», de cuando la app se llamaba Conta
        * Master. */}
      <div className="flex items-center mb-4 sm:px-4 h-9 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/dash101.svg" alt="dash101" className="hidden sm:block h-6" />
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
            aria-current={active ? "page" : undefined}
            className={`h-10 w-10 sm:w-full shrink-0 rounded-full flex items-center justify-center sm:justify-start gap-3 sm:px-4 transition ${
              active
                ? "bg-sky-50 text-sky-900 font-semibold"
                : "text-ink-muted hover:bg-black/5 hover:text-ink-dim"
            }`}
          >
            <span className="relative shrink-0 flex">
              <Icon size={19} className="shrink-0" />
              {item.href === "/ordenes" && porPagar > 0 && (
                <span
                  data-pendientes={porPagar}
                  title={`${porPagar} sin pagar`}
                  className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-mauve-900 text-cream text-[10px] font-medium leading-none flex items-center justify-center tabular-nums"
                >
                  {porPagar > 99 ? "99+" : porPagar}
                </span>
              )}
            </span>
            <span className="hidden sm:block text-sm">{item.label}</span>
          </button>
        );
      })}

      <div className="flex-1 min-h-3" />

      <button
        onClick={() => router.push("/settings")}
        title="Configuración"
        aria-current={pathname.startsWith("/settings") ? "page" : undefined}
        className={`h-10 w-10 sm:w-full shrink-0 rounded-full flex items-center justify-center sm:justify-start gap-3 sm:px-4 transition ${
          pathname.startsWith("/settings")
            ? "bg-sky-50 text-sky-900 font-semibold"
            : "text-ink-muted hover:bg-black/5 hover:text-ink-dim"
        }`}
      >
        <IconSettings size={19} className="shrink-0" />
        <span className="hidden sm:block text-sm">Configuración</span>
      </button>

      <button
        onClick={signOut}
        title="Cerrar sesión"
        className="h-10 w-10 sm:w-full shrink-0 rounded-full flex items-center justify-center sm:justify-start gap-3 sm:px-4 text-ink-muted hover:bg-black/5 hover:text-ink-dim transition"
      >
        <IconLogout size={19} className="shrink-0" />
        <span className="hidden sm:block text-sm">Cerrar sesión</span>
      </button>

      <div className="flex items-center gap-2 mt-2 sm:px-2 min-w-0 shrink-0">
        <div
          title={user?.email || ""}
          className="w-9 h-9 rounded-full bg-ink text-cream flex items-center justify-center text-xs font-medium shrink-0"
        >
          {initials}
        </div>
        <span className="hidden sm:block text-[11px] text-ink-muted truncate">{user?.email}</span>
      </div>
    </aside>
  );
}
