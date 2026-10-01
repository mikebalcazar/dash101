"use client";

/* El estado de cuenta de un cliente, listo para mandarse.
 *
 * Mike, 20-sep: «necesito poder ver por cliente su estado de cuenta general.
 * Saldo global, y por proyecto, y poder exportarlo en un PDF para enviar
 * reportes».
 *
 * EL PDF LO HACE EL NAVEGADOR: Imprimir → Guardar como PDF. No se arma en el
 * servidor, y es a propósito. Una librería de PDF dentro del Worker es una
 * dependencia más que mantener, pesa en cada arranque, y el día que un
 * cliente tenga cien renglones hay que preocuparse por la memoria. El
 * navegador ya sabe hacerlo, sale igual en cualquier máquina, y de paso deja
 * escoger tamaño de hoja y márgenes.
 *
 * Lo que sí es trabajo de aquí es que la hoja se vea como un documento: los
 * estilos de `@media print` en globals.css quitan el menú y los botones, y
 * evitan que un renglón se parta entre dos hojas.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconPrinter } from "@tabler/icons-react";
import { DocumentoEstadoDeCuenta } from "@/components/estado-de-cuenta-cliente";
import { estadoDeCuenta, type EstadoDeCuenta } from "@/lib/estado-cuenta";

export default function EstadoDeCuentaPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<EstadoDeCuenta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    try { setD(await estadoDeCuenta(id)); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo abrir el estado de cuenta."); }
    finally { setCargando(false); }
  }, [id]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando) return <p className="text-sm text-ink-muted">Cargando…</p>;
  if (!d) return <p className="text-sm text-mauve-900">{error || "Ese cliente ya no existe."}</p>;

  return (
    <div className="max-w-4xl">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 mb-4">
        <Link href={`/clientes/${id}`} className="text-xs text-ink-muted inline-flex items-center gap-1 hover:text-ink-dim">
          <IconArrowLeft size={13} /> Volver al cliente
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="bg-ink text-cream rounded-xl px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5"
        >
          <IconPrinter size={15} /> Guardar como PDF
        </button>
      </div>

      <p className="print:hidden text-xs text-ink-muted mb-4">
        Al picarle se abre la ventana de imprimir de tu navegador: ahí escoges{" "}
        <b>«Guardar como PDF»</b> y te queda el archivo para mandarlo.
      </p>

      <DocumentoEstadoDeCuenta d={d} />

      {error && <p className="print:hidden text-xs text-mauve-900 mt-3">{error}</p>}
    </div>
  );
}
