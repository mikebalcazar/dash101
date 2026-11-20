"use client";

/* Fiscal · Inicio: lo que toca declarar, cómo va el mes y lo que hay que
 * arreglar. Era el inicio de bill101.
 *
 * Mike, 8-oct-2026: «un estado de cuenta de movimientos exclusivamente
 * fiscales (solo facturados, ingresos y egresos) para llevar un control
 * fiscal de los impuestos y estimaciones. Esta ventana debe calcular los
 * pagos de impuestos que deben hacerse mensuales y anuales».
 *
 * TODO LO QUE AQUÍ ES UN NÚMERO LO CALCULÓ LA API. Y todo es una ESTIMACIÓN
 * con lo facturado: va dicho en cada pantalla, no en letra chica al final.
 *
 * Abajo va «Lo facturado contra lo real», que dash101 ya tenía: es la única
 * cuenta que cruza lo fiscal con TODOS los movimientos, y por eso vive aquí. */

import Link from "next/link";
import { useState } from "react";
import { useEmpresa } from "@/lib/empresa-context";
import { NOTA_ESTIMACION, dia, falta, fis, mes as nombreMes, mesMas, pesos, type Fila, type ResultadoDeSubida } from "@/lib/bill";
import { getCuadre, mesDeHoy, nombreDelMes, type Cuadre } from "@/lib/fiscal";
import { formatMontoExact } from "@/lib/format";
import { useFiscal } from "@/components/fiscal/contexto";
import { BotonSubir, ResumenDeSubida } from "@/components/fiscal/subir";
import { SelectorDeMes, bajarCsv } from "@/components/fiscal-ui";
import { B, B_PRI, CHICO, Cab, Cifra, Dato, Datos, LIGA, Lista, Nota, Tarjeta, Vista, useCarga, type Tono } from "@/components/fiscal/ui";
import { IconDownload } from "@tabler/icons-react";

const PUNTO: Record<Tono, string> = { mal: "bg-mauve-900", ojo: "bg-amber-600", azul: "bg-sky-900", bien: "bg-mint-900", "": "bg-ink-muted" };

/** Lo que puede estar torciendo la cuenta, cada cosa con a dónde ir a arreglarla. */
function Pendientes({ d, rfc, porLigar }: { d: Fila; rfc: string | null; porLigar: number }) {
  const a = d.avisos, l: [Tono, string, string, string][] = [];
  const s = (n: number) => (n === 1 ? "" : "s");
  if (!rfc) l.push(["mal", "Falta el RFC de la empresa: sin él no se puede subir ninguna factura.", "/fiscal/ajustes", "Ponerlo"]);
  if (a.falta_coeficiente) l.push(["ojo", `Falta el coeficiente de utilidad de ${d.anio}: sin él no se calcula el ISR provisional.`, `/fiscal/ajustes?anio=${d.anio}`, "Ponerlo"]);
  if (porLigar) l.push(["azul", `${porLigar} factura${porLigar === 1 ? " tiene" : "s tienen"} un movimiento que se le parece.`, "/fiscal/ligar", "Revisar"]);
  if (a.credito_sin_pago) l.push(["ojo", `${a.credito_sin_pago} factura${s(a.credito_sin_pago)} a crédito sin pago registrado: su IVA todavía no cuenta en ningún mes.`, "/fiscal/impuestos", "Ver"]);
  if (a.no_encontradas_en_sat) l.push(["ojo", `El SAT no encuentra ${a.no_encontradas_en_sat} factura${s(a.no_encontradas_en_sat)}.`, "/fiscal/facturas", "Ver"]);
  if (a.sin_revisar_en_sat) l.push(["", `${a.sin_revisar_en_sat} sin revisar en el SAT: puede haber alguna cancelada.`, "/fiscal/facturas", "Revisar"]);
  if (a.capturadas_a_mano) l.push(["", `${a.capturadas_a_mano} capturada${s(a.capturadas_a_mano)} a mano, sin XML.`, "/fiscal/facturas", "Ver"]);
  if (!l.length) return null;
  return (
    <Tarjeta titulo="Pendientes" id="pendientes">
      <Lista>
        {l.map(([tono, texto, liga, boton]) => (
          <li key={texto} className="flex items-center gap-3 py-2.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${PUNTO[tono]}`} />
            <span className="text-sm text-ink-dim flex-1 min-w-0">{texto}</span>
            <Link href={liga} className={`${B} ${CHICO}`}>{boton}</Link>
          </li>
        ))}
      </Lista>
    </Tarjeta>
  );
}

function TarjetaMes({ m, titulo, hoy, realce }: { m: Fila | undefined; titulo: string; hoy: string; realce?: boolean }) {
  if (!m) return null;
  const iva = m.iva, isr = m.isr;
  return (
    <Tarjeta titulo={titulo} der={`vence ${dia(iva.vence)} · ${falta(iva.vence, hoy)}`} realce={realce} data-mes={m.mes}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Cifra principal e="A pagar, estimado" v={pesos(m.a_pagar_estimado)} d={nombreMes(m.mes)} />
        <Cifra e="IVA" v={iva.a_pagar ? pesos(iva.a_pagar) : iva.a_favor ? pesos(iva.a_favor) : pesos(0)} d={iva.a_pagar ? "a pagar" : iva.a_favor ? "a favor" : "en ceros"} />
        <Cifra e="ISR provisional" v={isr.falta_coeficiente ? "—" : pesos(isr.del_mes)} d={isr.falta_coeficiente ? "falta el coeficiente" : "de este mes"} />
      </div>
      <Nota><Link href={`/fiscal/impuestos?anio=${m.mes.slice(0, 4)}`} className={LIGA}>Ver de dónde sale</Link></Nota>
    </Tarjeta>
  );
}

/** Lo que dash101 ya tenía: de todo lo que se movió, cuánto está facturado. */
function FacturadoContraReal() {
  const [mes, setMes] = useState(mesDeHoy());
  const carga = useCarga<Cuadre>(() => getCuadre({ mes }), mes);
  const c = carga.d;
  return (
    <Tarjeta titulo="Lo facturado contra lo real" id="cuadre"
      der={<span className="flex gap-2 items-center">
        <SelectorDeMes mes={mes} alCambiar={setMes} />
        <button type="button" disabled={!c} title="Bajar el mes en CSV" className={`${B} ${CHICO}`}
          onClick={() => c && bajarCsv(`facturado-contra-real-${mes}.csv`, [
            ["Lo facturado contra lo real", nombreDelMes(mes)], [],
            ["", "Total", "Facturado", "Fuera"],
            ["Ingresos", c.ingresos.total, c.ingresos.facturado, c.ingresos.fuera],
            ["Egresos", c.egresos.total, c.egresos.facturado, c.egresos.fuera],
          ])}><IconDownload size={14} /></button>
      </span>}>
      <p className="text-[11px] text-ink-muted mb-3">
        De todos los movimientos del mes, cuánto tiene factura. Lo de fuera no está mal por sí solo: es lo que no tiene factura y hay que saber que existe.
      </p>
      {carga.error ? <p className="text-xs text-mauve-900">{carga.error}</p> : !c ? <p className="text-sm text-ink-muted">Cargando…</p> : (
        <>
          <Lado titulo="Lo que cobraste" lado={c.ingresos} />
          <div className="h-3" />
          <Lado titulo="Lo que pagaste" lado={c.egresos} />
        </>
      )}
    </Tarjeta>
  );
}

function Lado({ titulo, lado }: { titulo: string; lado: { total: number; facturado: number; fuera: number } }) {
  const parte = lado.total === 0 ? 0 : Math.min(100, Math.round((lado.facturado / lado.total) * 100));
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <p className="text-sm text-ink-dim">{titulo}</p>
        <p className="text-sm text-ink-dim tabular-nums">{formatMontoExact(lado.total)}</p>
      </div>
      <div className="h-2 bg-cream rounded-full overflow-hidden"><div className="h-full bg-ink/70" style={{ width: `${parte}%` }} /></div>
      <p className="text-[11px] text-ink-muted mt-1 tabular-nums">
        {formatMontoExact(lado.facturado)} facturado ({parte} %) · {formatMontoExact(lado.fuera)} fuera
      </p>
    </div>
  );
}

export default function FiscalInicio() {
  const { hoy, administra } = useFiscal();
  const { empresa } = useEmpresa();
  const [subida, setSubida] = useState<ResultadoDeSubida[] | null>(null);
  const anio = Number(hoy.slice(0, 4));
  /* Lo que toca declarar ahora es el mes PASADO, que vence el 17 de éste.
   * En enero, el mes pasado es diciembre del año anterior. */
  const mesPasado = mesMas(hoy.slice(0, 7), -1);
  const anioPasado = Number(mesPasado.slice(0, 4));
  const carga = useCarga(async () => {
    const [d, cfg, sug, dAntes] = await Promise.all([
      fis(`/impuestos?anio=${anio}`), fis("/config"), fis("/sugerencias"),
      anioPasado !== anio ? fis(`/impuestos?anio=${anioPasado}`) : null,
    ]);
    return { d, cfg, sug, dAntes };
  }, String(anio));
  const x = carga.d;
  const deMes = (ym: string): Fila | undefined => ((Number(ym.slice(0, 4)) === anio ? x?.d : x?.dAntes)?.meses || []).find((m: Fila) => m.mes === ym);

  return (
    <Vista carga={carga}>
      {x && (
        <>
          <Cab titulo="Fiscal" sub={<>{empresa?.nombre}{x.cfg.rfc ? ` · ${x.cfg.rfc}` : ""}</>}>
            {administra && <Link href="/fiscal/nueva" className={B_PRI}>Generar factura</Link>}
            <BotonSubir alTerminar={async (res) => { setSubida(res); await carga.otra(); }} />
          </Cab>
          <ResumenDeSubida res={subida} />
          <Pendientes d={x.d} rfc={x.cfg.rfc} porLigar={x.sug.filas.length} />
          <TarjetaMes m={deMes(mesPasado)} titulo="Lo que toca declarar" hoy={hoy} realce />
          <TarjetaMes m={deMes(hoy.slice(0, 7))} titulo="Como va este mes" hoy={hoy} />
          <Tarjeta titulo={`El año ${anio}, estimado`} id="anual">
            <Datos>
              <Dato e="Facturado">{pesos(x.d.anual.ingresos)}</Dato>
              <Dato e="Deducciones">{pesos(x.d.anual.deducciones)}</Dato>
              <Dato e="Utilidad">{pesos(x.d.anual.utilidad)}</Dato>
              <Dato e="ISR del año">{pesos(x.d.anual.isr)}</Dato>
            </Datos>
            <Nota>{NOTA_ESTIMACION}</Nota>
          </Tarjeta>
          <FacturadoContraReal />
        </>
      )}
    </Vista>
  );
}
