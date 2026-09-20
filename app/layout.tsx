import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

/* La versión que está sirviendo, escrita en el HTML. Es el commit con el que
 * se construyó (`NEXT_PUBLIC_VERSION`, lo pone el flujo de publicación); en
 * una máquina dice `dev`. Sirve para que la medición del corredor compruebe
 * que lo que contesta el Worker es lo que acaba de construir, y no la versión
 * anterior que el borde de Cloudflare todavía no soltó: el 12-sep eso dio un
 * 500 que «se arregló solo», y un rojo falso hoy es un verde falso mañana. */
export const metadata: Metadata = {
  title: "dash101",
  description: "El dinero de la empresa: proyectos, cuentas, compras y lo fiscal.",
  other: { "dash101-version": process.env.NEXT_PUBLIC_VERSION ?? "dev" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
