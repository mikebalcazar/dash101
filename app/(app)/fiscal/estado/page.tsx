"use client";

/* Fiscal · Estado de cuenta fiscal: sólo lo facturado.
 *
 * Mike, 8-oct-2026: «un estado de cuenta de movimientos exclusivamente
 * fiscales (solo facturados, ingresos y egresos) para llevar un control
 * fiscal de los impuestos y estimaciones». El saldo corrido y los totales
 * los calcula la API. */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TIPO, dia, fis, folio, mes as nombreMes, mesCorto, pesos, type Fila } from "@/lib/bill";
import { useFiscal } from "@/components/fiscal/contexto";
import { Aviso, Cab, Cifra, Cifras, Et, Fichas, LIGA, Lista, Migas, Nota, Ren, RenMonto, RenSub, RenTitulo, Tabla, Tarjeta, Vacio, Vista, useCarga } from "@/components/fiscal/ui";

export default function EstadoFiscalPage() {
  const q = useSearchParams();
  const { hoy } = useFiscal();
  const qMes = q.get("mes") || "";
  const porMes = /^\d{4}-\d{2}$/.test(qMes);
  const anio = /^\d{4}$/.test(q.get("anio") || "") ? q.get("anio")! : (porMes ? qMes.slice(0, 4) : hoy.slice(0, 4));
  const carga = useCarga<Fila>(() => fis(`/estado-de-cuenta?${porMes ? `mes=${qMes}` : `anio=${anio}`}`), porMes ? qMes : anio);
  const meses = Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`);
  const e = carga.d;
  const s = e?.marcados_sin_factura;
  return (
    <div>
      <Migas href={`/fiscal/impuestos?anio=${anio}`}>Impuestos</Migas>
      <Cab titulo="Estado de cuenta fiscal" sub={`Sólo lo facturado: lo que la empresa emitió y lo que recibió, vigente. ${porMes ? nombreMes(qMes) : `Año ${anio}`}.`} />
      <Fichas chicas opciones={[
        { href: `/fiscal/estado?anio=${anio}`, texto: `Todo ${anio}`, activa: !porMes },
        ...meses.map((m) => ({ href: `/fiscal/estado?mes=${m}`, texto: mesCorto(m), activa: qMes === m })),
      ]} />
      <Vista carga={carga}>
        {e && s && (
          <>
            <Cifras>
              <Cifra e="Ingresos facturados" v={pesos(e.ingresos.subtotal)} d={`+ IVA ${pesos(e.ingresos.iva)} · ${e.ingresos.facturas} factura${e.ingresos.facturas === 1 ? "" : "s"}`} />
              <Cifra e="Egresos facturados" v={pesos(e.egresos.subtotal)} d={`+ IVA ${pesos(e.egresos.iva)} · ${e.egresos.facturas} factura${e.egresos.facturas === 1 ? "" : "s"}`} />
              <Cifra principal e="Diferencia, sin IVA" v={pesos(e.neto.subtotal)} d="ingresos − egresos" />
              <Cifra e="IVA, por fecha de factura" v={pesos(e.neto.iva)} d="cobrado − pagado" />
            </Cifras>
            <Tarjeta>
              {e.renglones.length ? (
                <Tabla id="tabla-estado">
                  <thead><tr><th>Fecha</th><th>Quién</th><th className="hidden md:table-cell">Folio</th><th className="n hidden md:table-cell">Subtotal</th><th className="n hidden md:table-cell">IVA</th><th className="n">Ingreso</th><th className="n">Egreso</th><th className="n">Saldo</th></tr></thead>
                  <tbody>
                    {e.renglones.map((r: Fila) => (
                      <tr key={r.id} data-factura={r.id}>
                        <td className="whitespace-nowrap">{dia(r.fecha)}</td>
                        <td className="whitespace-normal"><Link className={LIGA} href={`/fiscal/facturas/${encodeURIComponent(r.id)}`}>{r.razon_social || r.rfc || "Sin nombre"}</Link>
                          <small className="block md:hidden text-[11px] text-ink-muted">{folio(r)}{r.tipo_comprobante !== "I" ? ` · ${TIPO[r.tipo_comprobante]}` : ""}</small></td>
                        <td className="hidden md:table-cell">{folio(r)} {r.tipo_comprobante !== "I" ? <Et tono="azul">{TIPO[r.tipo_comprobante]}</Et> : null}</td>
                        <td className="n hidden md:table-cell">{pesos(r.subtotal)}</td><td className="n hidden md:table-cell">{pesos(r.iva)}</td>
                        <td className={`n ${r.tipo === "ingreso" ? "text-mint-900" : ""}`}>{r.tipo === "ingreso" ? pesos(r.total) : ""}</td>
                        <td className={`n ${r.tipo === "egreso" ? "text-mauve-900" : ""}`}>{r.tipo === "egreso" ? pesos(r.total) : ""}</td>
                        <td className="n">{pesos(r.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td colSpan={2}>Total</td><td className="hidden md:table-cell" /><td className="n hidden md:table-cell">{pesos(e.neto.subtotal)}</td><td className="n hidden md:table-cell">{pesos(e.neto.iva)}</td><td className="n">{pesos(e.ingresos.total)}</td><td className="n">{pesos(e.egresos.total)}</td><td className="n">{pesos(e.neto.total)}</td></tr></tfoot>
                </Tabla>
              ) : <Vacio>Sin facturas vigentes en este periodo.</Vacio>}
              <Nota>
                {e.complementos_de_pago ? `${e.complementos_de_pago} complemento${e.complementos_de_pago === 1 ? "" : "s"} de pago no aparece${e.complementos_de_pago === 1 ? "" : "n"} como renglón: no son ingreso ni gasto. ` : ""}
                {e.canceladas ? `${e.canceladas} cancelada${e.canceladas === 1 ? "" : "s"} no cuenta${e.canceladas === 1 ? "" : "n"}.` : ""}
              </Nota>
            </Tarjeta>
            {s.movimientos ? (
              <Tarjeta id="sin-factura" titulo="Marcados «facturado» sin factura cargada" der={`${s.movimientos} · ${pesos(s.total)}`}>
                <Aviso tono="ojo">Estos movimientos dicen que tienen factura, pero su XML no está aquí. No suman en este estado de cuenta ni en los impuestos. Sube su XML y se ligan.</Aviso>
                <Lista>
                  {s.filas.map((m: Fila) => (
                    <Ren key={m.id} href={`/movimientos/${encodeURIComponent(m.id)}/editar`}
                      p={<><RenTitulo>{m.contraparte_nombre || m.descripcion || "Movimiento"}</RenTitulo><RenSub>{dia(m.fecha)} · {m.tipo === "ingreso" ? "ingreso" : "egreso"}</RenSub></>}
                      m={<RenMonto>{pesos(m.monto)}</RenMonto>} />
                  ))}
                </Lista>
              </Tarjeta>
            ) : null}
          </>
        )}
      </Vista>
    </div>
  );
}
