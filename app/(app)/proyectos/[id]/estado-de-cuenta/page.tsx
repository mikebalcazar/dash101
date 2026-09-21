"use client";

/* El estado de cuenta de una obra, listo para mandarse.
 *
 * Mike, 21-sep: «necesito poder exportar un estado de cuenta en pdf y un
 * excel con lo siguiente de cada proyecto: saldo general, lista de productos
 * en proyecto, subtotal, IVA y total de proyecto completo, movimientos de
 * proyecto (pagos), fecha del día que se genera el status. Creo que esto es
 * lo mismo que el cliente podría descargar desde peek101».
 *
 * EL PDF LO HACE EL NAVEGADOR: Imprimir → Guardar como PDF, igual que el
 * estado de cuenta del cliente, y por la misma razón: una librería de PDF
 * pesa en cada arranque del Worker, el navegador ya sabe hacerlo, y de paso
 * deja escoger hoja y márgenes.
 *
 * EL EXCEL LO ARMA LA API. Empezó armándose aquí y se mudó el mismo día,
 * antes de publicarse: en cuanto el cliente también tenía que poder bajarlo
 * desde peek101, dos armadores del mismo archivo se volvieron dos maneras de
 * que un día no dijeran lo mismo. Aquí queda una liga a
 * `/proyectos/:id/estado.xlsx`.
 *
 * AQUÍ NO SE SUMA NADA. Todos los totales llegan resueltos de la API, que es
 * la MISMA ruta que abre peek101. Es lo que garantiza que el papel que manda
 * la empresa y el que baja el cliente digan lo mismo.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconPrinter, IconTableExport } from "@tabler/icons-react";
import { estadoDelProyecto, ligaDelExcel, type EstadoDelProyecto } from "@/lib/estado-proyecto";
/* `formatMontoExact` y no `formatMonto`: éste último redondea a pesos
 * enteros, y en un papel que se le manda a un cliente eso rompe la cuenta.
 * Con «IVA incluido» el subtotal casi nunca es redondo —de $111,250 salen
 * $95,905.17 y $15,344.83—, y enseñado sin centavos se lee «95,905 +
 * 15,345 = 111,250», que no cuadra. El que suma la columna es quien va a
 * pagar. */
import { formatMontoExact } from "@/lib/format";

/** El día que se genera, en palabras. Sale de `generado_at`, que lo pone el
 *  SERVIDOR: un estado de cuenta con la fecha de la laptop mal puesta es un
 *  documento con la fecha mal puesta. */
const enPalabras = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });

/** Para el nombre del archivo: 2026-09-21, que ordena solo en una carpeta. */
const enDigitos = (iso: string) => new Date(iso).toISOString().slice(0, 10);

const limpio = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function EstadoDelProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<EstadoDelProyecto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    try { setD(await estadoDelProyecto(id)); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo abrir el estado de cuenta."); }
    finally { setCargando(false); }
  }, [id]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando) return <p className="text-sm text-ink-muted">Cargando…</p>;
  if (!d) return <p className="text-sm text-mauve-900">{error || "Ese proyecto ya no existe."}</p>;

  const t = d.totales;

  return (
    <div className="max-w-4xl">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 mb-4">
        <Link href={`/proyectos/${id}`} className="text-xs text-ink-muted inline-flex items-center gap-1 hover:text-ink-dim">
          <IconArrowLeft size={13} /> Volver al proyecto
        </Link>
        <span className="flex gap-2">
          {/* Una liga y no un botón: el archivo lo arma la API y el
              navegador lo baja solo, sin que esta pantalla toque los
              números otra vez. */}
          <a
            href={ligaDelExcel(id)}
            className="border border-black/10 text-ink-dim rounded-xl px-3 py-2 text-sm inline-flex items-center gap-1.5"
          >
            <IconTableExport size={15} /> Bajar Excel
          </a>
          <button
            type="button" onClick={() => window.print()}
            className="bg-ink text-cream rounded-xl px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5"
          >
            <IconPrinter size={15} /> Guardar como PDF
          </button>
        </span>
      </div>

      <p className="print:hidden text-xs text-ink-muted mb-4">
        El PDF lo hace tu navegador: al picarle se abre la ventana de imprimir y ahí escoges{" "}
        <b>«Guardar como PDF»</b>. El Excel trae dos hojas, los ítems y los pagos, con los
        mismos números. Es el mismo documento que tu cliente puede bajar desde su portal.
      </p>

      {/* ─── el documento ─── */}
      <article className="bg-white border border-black/5 rounded-2xl p-6 print:border-0 print:p-0 print:rounded-none">
        <header className="flex flex-wrap justify-between gap-4 pb-4 border-b border-black/10">
          <div>
            <h1 className="text-lg font-medium text-ink">Estado de cuenta</h1>
            <p className="text-sm text-ink-dim mt-1">{d.proyecto.nombre}</p>
            <p className="text-xs text-ink-muted">
              {d.cliente?.nombre ?? "Sin cliente"}
              {d.cliente?.rfc ? ` · ${d.cliente.rfc}` : ""}
            </p>
          </div>
          <div className="text-right text-xs text-ink-muted">
            {d.negocio && <p className="text-ink-dim">{d.negocio.nombre}</p>}
            {d.negocio?.rfc && <p>{d.negocio.rfc}</p>}
            <p className="mt-1">Generado el {enPalabras(d.generado_at)}</p>
          </div>
        </header>

        {/* El saldo general. Es lo primero que se busca al abrir el papel. */}
        <div className="grid grid-cols-3 gap-3 my-5 no-partir">
          {[
            { que: "Total del proyecto", cuanto: t.total, tono: "text-ink-dim" },
            { que: "Pagado", cuanto: t.cobrado, tono: "text-mint-900" },
            { que: "Saldo", cuanto: t.saldo, tono: t.saldo > 0 ? "text-mauve-900" : "text-ink-dim" },
          ].map((k) => (
            <div key={k.que} className="bg-cream/60 rounded-xl p-3 print:bg-transparent print:border print:border-black/15">
              <p className="text-[11px] text-ink-muted">{k.que}</p>
              <p className={`text-lg font-medium tabular ${k.tono}`}>{formatMontoExact(k.cuanto, "MXN")}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-ink-muted -mt-3 mb-5">
          El saldo es contra el <b>total con IVA</b>, que es lo que se va a pagar. En las otras
          pantallas de dash101 el saldo del proyecto se enseña sin IVA, porque ahí la pregunta es
          cuánto se vendió; aquí es cuánto se debe.
        </p>

        <h2 className="text-sm font-medium text-ink-dim mb-2">Lo que lleva la obra</h2>
        {d.items.length === 0 ? (
          <p className="text-sm text-ink-muted mb-5">Todavía no hay ítems vendidos en este proyecto.</p>
        ) : (
          <table className="w-full text-sm mb-5">
            <thead className="text-xs text-ink-muted uppercase tracking-wide border-b border-black/10">
              <tr>
                <th className="text-left py-1.5 font-medium">Concepto</th>
                <th className="text-right py-1.5 font-medium">Cant.</th>
                <th className="text-right py-1.5 font-medium">P. unitario</th>
                <th className="text-right py-1.5 font-medium">Importe</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((i) => (
                <tr key={i.id} className="border-b border-black/5 no-partir">
                  <td className="py-1.5 text-ink-dim">
                    {i.clave ? <span className="text-ink-muted">{i.clave} · </span> : null}
                    {i.nombre}
                    {i.producto_nombre && i.producto_nombre !== i.nombre && (
                      <span className="block text-[11px] text-ink-muted">{i.producto_nombre}</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular">{i.cantidad}</td>
                  <td className="py-1.5 text-right tabular">{formatMontoExact(i.precio_unitario, "MXN")}</td>
                  <td className="py-1.5 text-right tabular">{formatMontoExact(i.importe, "MXN")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} />
                <td className="py-1.5 text-right text-ink-muted">Subtotal</td>
                <td className="py-1.5 text-right tabular">{formatMontoExact(t.subtotal, "MXN")}</td>
              </tr>
              <tr>
                <td colSpan={2} />
                <td className="py-1.5 text-right text-ink-muted">IVA {t.tasa_iva / 100}%</td>
                <td className="py-1.5 text-right tabular">{formatMontoExact(t.iva, "MXN")}</td>
              </tr>
              <tr className="border-t-2 border-black/20 font-medium">
                <td colSpan={2} />
                <td className="py-2 text-right">Total</td>
                <td className="py-2 text-right tabular">{formatMontoExact(t.total, "MXN")}</td>
              </tr>
            </tfoot>
          </table>
        )}

        <h2 className="text-sm font-medium text-ink-dim mb-2">Los pagos</h2>
        {d.movimientos.length === 0 ? (
          <p className="text-sm text-ink-muted">Todavía no hay pagos de este proyecto.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-ink-muted uppercase tracking-wide border-b border-black/10">
              <tr>
                <th className="text-left py-1.5 font-medium">Fecha</th>
                <th className="text-left py-1.5 font-medium">Concepto</th>
                <th className="text-right py-1.5 font-medium">Monto</th>
              </tr>
            </thead>
            <tbody>
              {d.movimientos.map((m) => (
                <tr key={m.id} className="border-b border-black/5 no-partir">
                  <td className="py-1.5 text-ink-dim tabular">{m.fecha}</td>
                  <td className="py-1.5 text-ink-dim">
                    {m.descripcion || "Pago"}
                    {m.cuenta_nombre && <span className="text-ink-muted text-xs"> · {m.cuenta_nombre}</span>}
                  </td>
                  <td className="py-1.5 text-right tabular text-mint-900">{formatMontoExact(m.monto, "MXN")}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black/20 font-medium">
                <td colSpan={2} className="py-2">Pagado</td>
                <td className="py-2 text-right tabular">{formatMontoExact(t.cobrado, "MXN")}</td>
              </tr>
              <tr className="font-medium">
                <td colSpan={2} className="py-1">Saldo</td>
                <td className="py-1 text-right tabular">{formatMontoExact(t.saldo, "MXN")}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </article>
    </div>
  );
}
