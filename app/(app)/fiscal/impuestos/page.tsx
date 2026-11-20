"use client";

/* Fiscal · Impuestos: IVA e ISR provisional mes por mes, y el ISR anual.
 *
 * TODO LO QUE AQUÍ ES UN NÚMERO LO CALCULÓ LA API (`/fiscal/impuestos`). Y
 * todo es una ESTIMACIÓN con lo facturado: va dicho arriba, no en letra
 * chica al final. Aquí sólo se registra lo que ya se pagó, para que el
 * provisional de los meses siguientes lo reste. */

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { NOTA_ESTIMACION, aCentavos, dia, enCoeficiente, enPesos, enPorciento, fis, mes as nombreMes, mesMas, mensajeDe, pesos, type Fila } from "@/lib/bill";
import { useFiscal } from "@/components/fiscal/contexto";
import { Aviso, B, B_MAL, B_PRI, CAJA, CHICO, Cab, Campo, ConSigno, Err, Et, LIGA, Lista, Mesero, Nota, Ren, RenMonto, RenSub, RenTitulo, Tarjeta, Vacio, Vista, useAvisa, useCarga, useHacer } from "@/components/fiscal/ui";

function Linea({ e, v, fuerte, hecho }: { e: ReactNode; v: ReactNode; fuerte?: boolean; hecho?: boolean }) {
  return (
    <tr className={hecho ? "text-mint-900" : ""}>
      <td className={`py-1 pr-3 text-sm ${fuerte ? "font-medium text-ink-dim" : hecho ? "" : "text-ink-muted"}`}>{e}</td>
      <td className={`py-1 text-sm text-right tabular-nums whitespace-nowrap ${fuerte ? "font-medium text-ink-dim" : hecho ? "" : "text-ink-dim"}`}>{v}</td>
    </tr>
  );
}

function FormaPago({ impuesto, periodo, sugerido, hoy, despues }: { impuesto: string; periodo: string; sugerido: number; hoy: string; despues: () => void }) {
  const avisa = useAvisa();
  const [monto, setMonto] = useState(sugerido ? enPesos(sugerido) : "");
  const [fecha, setFecha] = useState(hoy);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  return (
    <form className="mt-3 pt-3 border-t border-black/5 grid grid-cols-2 gap-2 items-end" data-pago={impuesto} data-periodo={periodo}
      onSubmit={async (ev) => {
        ev.preventDefault();
        const c = aCentavos(monto);
        if (!c) { setError("Escribe cuánto se pagó."); return; }
        setOcupado(true); setError("");
        try {
          await fis("/pagos", { body: { impuesto, periodo, monto: c, fecha } });
          avisa("Pago registrado."); despues();
        } catch (e) { setError(mensajeDe(e)); } finally { setOcupado(false); }
      }}>
      <Campo e="Registrar lo que se pagó"><ConSigno><input className={CAJA} name="monto" inputMode="decimal" autoComplete="off" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" /></ConSigno></Campo>
      <Campo e="El día"><input className={CAJA} type="date" name="fecha" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
      <div className="col-span-2 flex items-center justify-between gap-2">
        <Err>{error}</Err>
        <button className={`${B_PRI} ${CHICO} ml-auto`} disabled={ocupado}>Registrar pago</button>
      </div>
    </form>
  );
}

function MesDetalle({ m, hoy, admin, despues }: { m: Fila; hoy: string; admin: boolean; despues: () => void }) {
  const i = m.iva, r = m.isr;
  const pasado = m.mes < hoy.slice(0, 7);
  return (
    <details className="border-t border-black/5 first:border-t-0 group" data-mes={m.mes} open={m.mes === mesMas(hoy.slice(0, 7), -1)}>
      <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="text-ink-muted text-xs transition group-open:rotate-90">›</span>
        <b className="text-sm text-ink-dim capitalize">{nombreMes(m.mes)}</b>
        <span className="text-xs text-ink-muted tabular-nums ml-auto">
          {i.a_pagar ? `IVA ${pesos(i.a_pagar)}` : i.a_favor ? `IVA a favor ${pesos(i.a_favor)}` : "IVA $0.00"} · ISR {r.falta_coeficiente ? "—" : pesos(r.del_mes)}
        </span>
        {pasado && (i.pagado || r.pagado) ? <Et tono="bien">Pago registrado</Et> : null}
      </summary>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-4 pt-1">
        <div>
          <h4 className="text-sm font-medium text-ink-dim mb-1">IVA <small className="text-[11px] font-normal text-ink-muted">vence {dia(i.vence)}</small></h4>
          <table className="w-full"><tbody>
            <Linea e="IVA que cobraste" v={pesos(i.trasladado)} />
            <Linea e="− IVA que pagaste (acreditable)" v={pesos(i.acreditable)} />
            {i.retenido_a_la_empresa ? <Linea e="− IVA que te retuvieron" v={pesos(i.retenido_a_la_empresa)} /> : null}
            <Linea e="= Resultado del mes" v={pesos(i.resultado)} />
            {i.favor_anterior ? <Linea e="− Saldo a favor que venía" v={pesos(i.favor_anterior)} /> : null}
            <Linea fuerte e="A pagar" v={pesos(i.a_pagar)} />
            {i.a_favor ? <Linea e="Queda a favor para el mes siguiente" v={pesos(i.a_favor)} /> : null}
            {i.pagado ? <Linea hecho e="Pagado (registrado)" v={pesos(i.pagado)} /> : null}
          </tbody></table>
          {i.retenido_a_terceros ? <Nota>Además retuviste {pesos(i.retenido_a_terceros)} de IVA a proveedores: se entera aparte y no está en esta cuenta.</Nota> : null}
          {admin && <FormaPago impuesto="iva" periodo={m.mes} sugerido={i.a_pagar} hoy={hoy} despues={despues} />}
        </div>
        <div>
          <h4 className="text-sm font-medium text-ink-dim mb-1">ISR provisional <small className="text-[11px] font-normal text-ink-muted">vence {dia(r.vence)}</small></h4>
          {r.falta_coeficiente && <Aviso tono="ojo">Falta el coeficiente de utilidad. <Link className="underline" href={`/fiscal/ajustes?anio=${m.mes.slice(0, 4)}`}>Ponerlo</Link></Aviso>}
          <table className="w-full"><tbody>
            <Linea e="Facturado en el mes" v={pesos(r.ingresos_del_mes)} />
            <Linea e="Facturado en el año, hasta este mes" v={pesos(r.ingresos_acumulados)} />
            {!r.falta_coeficiente && (
              <>
                <Linea e={`× coeficiente ${enCoeficiente(r.coeficiente)} = utilidad estimada`} v={pesos(r.utilidad_estimada)} />
                {r.perdidas ? <Linea e="− Pérdidas de años anteriores" v={pesos(r.perdidas)} /> : null}
                <Linea e="ISR acumulado del año" v={pesos(r.isr_acumulado)} />
                {r.retenciones ? <Linea e="− ISR que te retuvieron" v={pesos(r.retenciones)} /> : null}
                <Linea fuerte e="Le toca a este mes" v={pesos(r.del_mes)} />
                {r.pagos_anteriores ? <Linea e="Provisionales registrados de meses anteriores" v={pesos(r.pagos_anteriores)} /> : null}
                <Linea e="Falta por pagar del año, con lo registrado" v={pesos(r.a_pagar)} />
                {r.pagado ? <Linea hecho e="Pagado de este mes (registrado)" v={pesos(r.pagado)} /> : null}
              </>
            )}
          </tbody></table>
          {!r.falta_coeficiente && admin && <FormaPago impuesto="isr_provisional" periodo={m.mes} sugerido={r.del_mes} hoy={hoy} despues={despues} />}
        </div>
      </div>
    </details>
  );
}

const IMPUESTO: Record<string, string> = { iva: "IVA", isr_provisional: "ISR provisional", isr_anual: "ISR anual" };

export default function ImpuestosPage() {
  const q = useSearchParams();
  const { hoy, administra: admin } = useFiscal();
  const { hacer, ocupado } = useHacer();
  const anio = /^\d{4}$/.test(q.get("anio") || "") ? Number(q.get("anio")) : Number(hoy.slice(0, 4));
  const carga = useCarga<Fila>(() => fis(`/impuestos?anio=${anio}`), String(anio));
  const otra = () => void carga.otra();
  const d = carga.d;
  const a = d?.anual, pend = d?.iva_pendiente;
  return (
    <div>
      <Cab titulo="Impuestos" sub={NOTA_ESTIMACION}>
        <Link className={B} href={`/fiscal/estado?anio=${anio}`}>Estado de cuenta fiscal</Link>
      </Cab>
      <Mesero antes={`/fiscal/impuestos?anio=${anio - 1}`} despues={`/fiscal/impuestos?anio=${anio + 1}`}>{anio}</Mesero>
      <Vista carga={carga}>
        {d && a && (
          <>
            {d.avisos.falta_coeficiente && <Aviso tono="ojo">Falta el coeficiente de utilidad de {anio}: el ISR provisional sale en blanco. <Link className="underline" href={`/fiscal/ajustes?anio=${anio}`}>Ponerlo en Ajustes</Link></Aviso>}
            {(pend.por_cobrar || pend.por_pagar) ? <Aviso>Hay IVA de facturas a crédito que todavía no cuenta en ningún mes porque no tienen pago registrado: {pesos(pend.por_cobrar)} por cobrar y {pesos(pend.por_pagar)} por pagar. Entra cuando se suba su complemento de pago o se ligue su movimiento.</Aviso> : null}

            <Tarjeta titulo="Mes por mes" id="meses">
              {d.meses.map((m: Fila) => <MesDetalle key={m.mes} m={m} hoy={hoy} admin={admin} despues={otra} />)}
            </Tarjeta>

            <Tarjeta titulo="ISR anual, estimado" der={`vence ${dia(a.vence)}`} id="anual">
              <table className="w-full"><tbody>
                <Linea e="Facturado" v={pesos(a.ingresos_facturados)} />
                {a.notas_de_credito_emitidas ? <Linea e="− Notas de crédito que emitiste" v={pesos(a.notas_de_credito_emitidas)} /> : null}
                {a.ajuste_ingresos ? <Linea e="+ Ingresos sin factura (ajuste del contador)" v={pesos(a.ajuste_ingresos)} /> : null}
                <Linea fuerte e="Ingresos" v={pesos(a.ingresos)} />
                <Linea e="Compras y gastos con factura" v={pesos(a.compras)} />
                {a.notas_de_credito_recibidas ? <Linea e="− Notas de crédito que recibiste" v={pesos(a.notas_de_credito_recibidas)} /> : null}
                {a.nomina ? <Linea e="+ Nómina timbrada" v={pesos(a.nomina)} /> : null}
                {a.ajuste_deducciones ? <Linea e="+ Deducciones sin factura (ajuste del contador)" v={pesos(a.ajuste_deducciones)} /> : null}
                <Linea fuerte e="Deducciones" v={pesos(a.deducciones)} />
                <Linea e="Utilidad" v={pesos(a.utilidad)} />
                {a.perdidas ? <Linea e="− Pérdidas de años anteriores" v={pesos(a.perdidas)} /> : null}
                <Linea e={`ISR del año (${enPorciento(a.tasa_isr)})`} v={pesos(a.isr)} />
                <Linea e="− Provisionales registrados" v={pesos(a.provisionales_pagados)} />
                {a.retenciones ? <Linea e="− ISR que te retuvieron" v={pesos(a.retenciones)} /> : null}
                <Linea fuerte e={a.a_favor ? "A favor" : "A pagar"} v={pesos(a.a_favor || a.a_pagar)} />
              </tbody></table>
              {(a.fuera.inversion.facturas || a.fuera.no_deducible.facturas) ? <Nota>Quedaron fuera de las deducciones: {a.fuera.inversion.facturas} de inversión ({pesos(a.fuera.inversion.subtotal)}) y {a.fuera.no_deducible.facturas} no deducible{a.fuera.no_deducible.facturas === 1 ? "" : "s"} ({pesos(a.fuera.no_deducible.subtotal)}).</Nota> : null}
              <Nota>No trae lo que no está en una factura: depreciación, nómina sin timbrar, PTU. Eso lo da tu contador y se captura en <Link className={LIGA} href={`/fiscal/ajustes?anio=${anio}`}>Ajustes</Link>.</Nota>
            </Tarjeta>

            <Tarjeta titulo="Pagos de impuestos registrados" id="pagos">
              {d.pagos.length ? (
                <Lista>
                  {d.pagos.map((p: Fila) => (
                    <Ren key={p.id}
                      p={<><RenTitulo>{IMPUESTO[p.impuesto]} · {p.periodo.length === 4 ? p.periodo : nombreMes(p.periodo)}</RenTitulo><RenSub>pagado el {dia(p.fecha)}{p.nota ? ` · ${p.nota}` : ""}</RenSub></>}
                      m={<RenMonto>{pesos(p.monto)}</RenMonto>}
                      acc={admin ? <button type="button" className={`${B_MAL} ${CHICO}`} data-borrar-pago={p.id} disabled={ocupado === p.id}
                        onClick={async () => {
                          if (!confirm("¿Quitar este pago registrado?")) return;
                          const r = await hacer(p.id, () => fis(`/pagos/${encodeURIComponent(p.id)}`, { method: "DELETE" }));
                          if (r) otra();
                        }}>Quitar</button> : undefined} />
                  ))}
                </Lista>
              ) : <Vacio>Ninguno. Cuando pagues un mes, regístralo en ese mes: el provisional de los siguientes lo necesita para restar.</Vacio>}
            </Tarjeta>
          </>
        )}
      </Vista>
    </div>
  );
}
