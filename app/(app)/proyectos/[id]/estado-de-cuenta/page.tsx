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
 * 0.107.0 · SIN IVA (Mike, 18-nov-2026): «En los estados de cuenta de los
 * proyectos, siempre haz las cuentas sin IVA y desglosa por aparte el IVA
 * que se haya pagado o cobrado.» Y cada pago se abre con un clic: su detalle,
 * sus facturas y las que se le pueden ligar («NECESITO PODER LIGAR LOS PAGOS
 * CARGADOS NUEVOS CON LAS FACTURAS EXISTENTES»).
 *
 * AQUÍ NO SE SUMA NADA. Todos los totales llegan resueltos de la API, que es
 * la MISMA ruta que abre peek101. Es lo que garantiza que el papel que manda
 * la empresa y el que baja el cliente digan lo mismo.
 */

import { Fragment, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconChevronRight, IconPrinter, IconTableExport } from "@tabler/icons-react";
import { estadoDelProyecto, ligaDelExcel, nombreDeFactura, tituloDelGrupo, type EstadoDelProyecto, type PagoDelEstado } from "@/lib/estado-proyecto";
import { PagoYFacturas } from "@/components/pago-y-facturas";
/* `formatMontoExact` y no `formatMonto`: éste último redondea a pesos
 * enteros, y en un papel que se le manda a un cliente eso rompe la cuenta.
 * Con «IVA incluido» el subtotal casi nunca es redondo —de $111,250 salen
 * $95,905.17 y $15,344.83—, y enseñado sin centavos se lee «95,905 +
 * 15,345 = 111,250», que no cuadra. El que suma la columna es quien va a
 * pagar. */
import { formatMontoExact } from "@/lib/format";
import { aDia } from "@/lib/api/adaptar";

/** El día que se genera, en palabras. Sale de `generado_at`, que lo pone el
 *  SERVIDOR: un estado de cuenta con la fecha de la laptop mal puesta es un
 *  documento con la fecha mal puesta. */
const enPalabras = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });

/** Para el nombre del archivo: 2026-09-21, que ordena solo en una carpeta. */
const enDigitos = (iso: string) => aDia(new Date(iso));

/** 0.109.0 · Lo que suma la sección que empieza en el concepto k. */
const sumaDeSeccion = (conceptos: Array<{ seccion: string; importe: number }>, k: number) => {
  let t = 0;
  for (let j = k; j < conceptos.length && conceptos[j].seccion === conceptos[k].seccion; j++) t += conceptos[j].importe;
  return Math.round(t * 100) / 100;
};

/** La raya de cada celda: separa las columnas (Mike, 18-nov-2026). */
const RAYA = "border border-black/10";
const limpio = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function EstadoDelProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<EstadoDelProyecto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState<PagoDelEstado | null>(null);

  const cargar = useCallback(async (callado = false) => {
    if (!callado) setCargando(true);
    setError("");
    try { setD(await estadoDelProyecto(id)); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo abrir el estado de cuenta."); }
    finally { setCargando(false); }
  }, [id]);

  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando) return <p className="text-sm text-ink-muted">Cargando…</p>;
  if (!d) return <p className="text-sm text-mauve-900">{error || "Ese proyecto ya no existe."}</p>;

  const t = d.totales;
  /* 0.105.0 · sin conceptos de cobro el precio está por cargar: el papel lo
   * dice con letras y no inventa un saldo. */
  const saldoDice = t.precio_por_cargar || t.saldo === null ? "Precio por cargar" : formatMontoExact(t.saldo, "MXN");

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
        Pica un pago para ver su detalle y ligarle una factura. El PDF lo hace tu navegador: al picarle se abre la ventana de imprimir y ahí escoges{" "}
        <b>«Guardar como PDF»</b>. El Excel trae dos hojas, los conceptos y los pagos, con los
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
            {d.empresa && <p className="text-ink-dim">{d.empresa.nombre}</p>}
            {d.empresa?.rfc && <p>{d.empresa.rfc}</p>}
            <p className="mt-1">Generado el {enPalabras(d.generado_at)}</p>
          </div>
        </header>

        {/* El saldo general. Es lo primero que se busca al abrir el papel. */}
        <div className="grid grid-cols-3 gap-3 my-5 no-partir">
          {[
            { que: "Precio, sin IVA", dice: t.precio_por_cargar ? "Por cargar" : formatMontoExact(t.total, "MXN"), tono: "text-ink-dim" },
            { que: "Pagado, sin IVA", dice: formatMontoExact(t.cobrado, "MXN"), tono: "text-mint-900" },
            { que: "Saldo, sin IVA", dice: t.precio_por_cargar || t.saldo === null ? "—" : formatMontoExact(t.saldo, "MXN"), tono: (t.saldo ?? 0) > 0 ? "text-mauve-900" : "text-ink-dim" },
          ].map((k) => (
            <div key={k.que} data-kpi={k.que} className="bg-cream/60 rounded-xl p-3 print:bg-transparent print:border print:border-black/15">
              <p className="text-[11px] text-ink-muted">{k.que}</p>
              <p className={`text-lg font-medium tabular ${k.tono}`}>{k.dice}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-ink-muted -mt-3 mb-5" data-iva-aparte>
          Todo va <b>sin IVA</b>: el precio son los conceptos y lo pagado es el subtotal de cada pago.
          El IVA que se cobró va aparte: <span className="tabular">{formatMontoExact(t.iva_cobrado, "MXN")}</span>.
        </p>

        {/* 0.105.0 · Lo que se cobra: los conceptos, agrupados por cotización
            —«Cotización 2 · COT-000014 · Planta alta»— y lo escrito a mano al
            final. Mike, 18-nov: «se debe ver que es una segunda cotización
            pero suma». */}
        <h2 className="text-sm font-medium text-ink-dim mb-2">Lo que se cobra</h2>
        {d.grupos.length === 0 ? (
          <p className="text-sm text-ink-muted mb-5" data-por-cargar>
            Precio por cargar: este proyecto todavía no tiene conceptos de cobro.
          </p>
        ) : (
          /* 0.108.0 · Las columnas del PDF: el producto aparte de la
             descripción, y cada celda con su raya (Mike, 18-nov-2026). */
          <div className="overflow-x-auto mb-5">
          <table className="w-full min-w-[40rem] text-sm border-collapse" data-tabla-conceptos>
            <thead className="text-xs text-ink-muted uppercase tracking-wide">
              <tr>
                <th className={`${RAYA} text-left py-1.5 px-2 font-medium w-40`}>Producto</th>
                <th className={`${RAYA} text-left py-1.5 px-2 font-medium`}>Descripción</th>
                <th className={`${RAYA} text-right py-1.5 px-2 font-medium w-14`}>Cant.</th>
                <th className={`${RAYA} text-right py-1.5 px-2 font-medium`}>P. unitario</th>
                <th className={`${RAYA} text-right py-1.5 px-2 font-medium`}>Importe</th>
              </tr>
            </thead>
            {d.grupos.map((g) => (
              <tbody key={g.cotizacion_id ?? "a-mano"} data-grupo={g.cotizacion_id ?? "a-mano"}>
                {(d.grupos.length > 1 || g.cotizacion_id) && (
                  <tr className="no-partir">
                    <td colSpan={5} className="pt-3 pb-1 px-2 text-xs font-medium text-ink-dim">{tituloDelGrupo(g)}</td>
                  </tr>
                )}
                {g.conceptos.map((c, k) => (
                  <Fragment key={c.id}>
                  {/* 0.109.0 · Cada sección (N01, MEZZANINE…) con su subtítulo. */}
                  {c.seccion && c.seccion !== (g.conceptos[k - 1]?.seccion ?? "") && (
                    <tr className="no-partir" data-seccion={c.seccion}>
                      <td colSpan={4} className={`${RAYA} pt-2 pb-1 px-2 text-[11px] font-medium text-ink-dim uppercase tracking-wide`}>{c.seccion}</td>
                      <td className={`${RAYA} pt-2 pb-1 px-2 text-right tabular text-[11px] text-ink-muted whitespace-nowrap`}>
                        {formatMontoExact(sumaDeSeccion(g.conceptos, k), "MXN")}
                      </td>
                    </tr>
                  )}
                  <tr className="no-partir align-top" data-concepto={c.id}>
                    <td className={`${RAYA} py-1.5 px-2 text-ink font-medium`} data-concepto-producto>{c.nombre}</td>
                    <td className={`${RAYA} py-1.5 px-2 text-ink-dim`} data-concepto-descripcion>{c.descripcion}</td>
                    <td className={`${RAYA} py-1.5 px-2 text-right tabular`}>{c.cantidad}</td>
                    <td className={`${RAYA} py-1.5 px-2 text-right tabular whitespace-nowrap`}>{formatMontoExact(c.precio_unitario, "MXN")}</td>
                    <td className={`${RAYA} py-1.5 px-2 text-right tabular whitespace-nowrap`}>{formatMontoExact(c.importe, "MXN")}</td>
                  </tr>
                  </Fragment>
                ))}
                {d.grupos.length > 1 && (
                  <tr className="no-partir">
                    <td colSpan={4} className="py-1 px-2 text-right text-[11px] text-ink-muted">
                      Suma {g.cotizacion_id ? `de la cotización ${g.numero}` : "de otros conceptos"}
                    </td>
                    <td className="py-1 px-2 text-right tabular text-[11px] text-ink-muted">{formatMontoExact(g.importe, "MXN")}</td>
                  </tr>
                )}
              </tbody>
            ))}
            <tfoot>
              <tr className="font-medium">
                <td colSpan={3} />
                <td className="py-2 px-2 text-right whitespace-nowrap">Precio, sin IVA</td>
                <td className="py-2 px-2 text-right tabular whitespace-nowrap" data-precio-sin-iva>{formatMontoExact(t.total, "MXN")}</td>
              </tr>
            </tfoot>
          </table>
          </div>
        )}

        <h2 className="text-sm font-medium text-ink-dim mb-2">Los pagos</h2>
        {d.movimientos.length === 0 ? (
          <p className="text-sm text-ink-muted">Todavía no hay pagos de este proyecto.</p>
        ) : (
          <table className="w-full text-sm" data-pagos>
            <thead className="text-xs text-ink-muted uppercase tracking-wide border-b border-black/10">
              <tr>
                <th className="text-left py-1.5 font-medium">Fecha</th>
                <th className="text-left py-1.5 font-medium">Concepto</th>
                <th className="text-left py-1.5 font-medium hidden sm:table-cell">Factura</th>
                <th className="text-right py-1.5 font-medium">Sin IVA</th>
                <th className="text-right py-1.5 font-medium">IVA</th>
                <th className="w-5 print:hidden" />
              </tr>
            </thead>
            <tbody>
              {/* Cada pago se abre con un clic (o Enter): su detalle, sus
                  facturas y las que se le pueden ligar. En el papel impreso
                  no hay nada que picar. */}
              {d.movimientos.map((m) => (
                <tr key={m.id} data-pago={m.id} tabIndex={0} role="button" aria-label={`Abrir el pago del ${m.fecha}`}
                  onClick={() => setAbierto(m)} onKeyDown={(e) => { if (e.key === "Enter") setAbierto(m); }}
                  className="border-b border-black/5 no-partir cursor-pointer hover:bg-cream/50 focus:outline-none focus:bg-cream/50 print:cursor-auto">
                  <td className="py-1.5 text-ink-dim tabular">{m.fecha}</td>
                  <td className="py-1.5 text-ink-dim">
                    {m.descripcion || "Pago"}
                    {m.cuenta_nombre && <span className="text-ink-muted text-xs"> · {m.cuenta_nombre}</span>}
                  </td>
                  <td className="py-1.5 text-xs hidden sm:table-cell" data-pago-factura>
                    {m.facturas.length
                      ? <span className="text-ink-dim">{m.facturas.map(nombreDeFactura).join(", ")}</span>
                      : <span className="text-ink-muted print:hidden">Sin factura · ligar</span>}
                  </td>
                  <td className="py-1.5 text-right tabular text-mint-900">{formatMontoExact(m.sin_iva, "MXN")}</td>
                  <td className="py-1.5 text-right tabular text-ink-muted">{m.iva ? formatMontoExact(m.iva, "MXN") : "—"}</td>
                  <td className="py-1.5 text-right text-ink-muted print:hidden"><IconChevronRight size={14} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black/20 font-medium">
                <td colSpan={2} className="py-2">Pagado</td>
                <td className="hidden sm:table-cell" />
                <td className="py-2 text-right tabular" data-pagado-sin-iva>{formatMontoExact(t.cobrado, "MXN")}</td>
                <td className="py-2 text-right tabular text-ink-muted" data-iva-cobrado>{formatMontoExact(t.iva_cobrado, "MXN")}</td>
                <td className="print:hidden" />
              </tr>
              <tr className="font-medium">
                <td colSpan={2} className="py-1">Saldo, sin IVA</td>
                <td className="hidden sm:table-cell" />
                <td className="py-1 text-right tabular" data-saldo>{saldoDice}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </article>

      {abierto && (
        <PagoYFacturas pago={abierto} alCerrar={() => setAbierto(null)} alCambiar={() => { void cargar(true); }} />
      )}
    </div>
  );
}
