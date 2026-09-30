"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
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
  { href: "/nomina", icon: IconCash, label: "Raya" },
  // Mike, 30-sep-2026: «un módulo de accionistas donde se registren pagos a
  // los accionistas como retiro de utilidades».
  { href: "/accionistas", icon: IconCoins, label: "Accionistas" },
  { href: "/fiscal", icon: IconReceiptTax, label: "Fiscal" },
  { href: "/conciliacion", icon: IconScale, label: "Conciliación" },
  { href: "/flujo", icon: IconChartLine, label: "Flujo" },
  { href: "/equipo", icon: IconUsersGroup, label: "Equipo" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { activo } = useNegocioActivo();
  /* El circulito de Compras (Mike, 30-sep-2026: «un circulito con la
   * cantidad de órdenes sin pagar, como de mensajes sin leer»): compras y
   * reembolsos en el buzón, del negocio activo. Se vuelve a pedir al cambiar
   * de pantalla, que es cuando algo se pudo haber pagado; quien no ve dinero
   * no recibe el número y no ve el circulito. */
  const [porPagar, setPorPagar] = useState(0);
  const negocioId = activo?.id ?? null;
  useEffect(() => {
    /* Sin negocio activo no se pide nada: sin `negocio_id` la API cuenta las
     * órdenes de TODOS los negocios de la empresa, y ése no es el número de
     * la pantalla que se está viendo (corrida 36775033289: 22 contra 7). */
    if (!negocioId) { setPorPagar(0); return; }
    let vivo = true;
    getResumenOrdenes(negocioId)
      .then((r) => { if (vivo) setPorPagar(r.compras.cuantas + r.reembolsos.cuantas); })
      .catch(() => { if (vivo) setPorPagar(0); });
    return () => { vivo = false; };
  }, [negocioId, pathname]);

  const initials = (user?.displayName || user?.email || "U")
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <aside className="w-14 sm:w-52 bg-cream flex flex-col items-center sm:items-stretch py-4 px-0 sm:px-3 gap-1">
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
