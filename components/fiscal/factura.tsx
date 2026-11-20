"use client";

/* Lo que comparten las pantallas que enseñan facturas: sus etiquetas, su
 * renglón en una lista y los movimientos que se le parecen.
 *
 * Mike, 8-oct-2026: «importar y actualizar las facturas recibidas (…) Ligar a
 * gastos de dash si es posible y coinciden». Con botones: la liga se PROPONE
 * y alguien confirma. Por eso aquí ningún botón liga solo: «Es éste» es una
 * persona diciendo que sí. */

import { TIPO, TRATO, dia, estaCubierta, fis, folio, pesos, signo, type Fila } from "@/lib/bill";
import { B_PRI, CHICO, Et, Lista, Ren, RenMonto, RenSub, RenTitulo, Vacio, useAvisa, useHacer } from "./ui";

const tc = (f: Fila) => f.tipo_comprobante || "I";

/** Lo que hay que saber de una factura de un vistazo. */
export function EtiquetasDeFactura({ f }: { f: Fila }) {
  const e: React.ReactNode[] = [];
  if (tc(f) !== "I") e.push(<Et key="tipo" tono="azul">{TIPO[tc(f)] || tc(f)}</Et>);
  if (f.estado === "cancelada") e.push(<Et key="can" tono="mal">Cancelada</Et>);
  if (f.pruebas === true || f.pruebas === 1) e.push(<Et key="pru" tono="ojo">Prueba</Et>);
  else {
    if (f.estado_sat === "no_encontrado") e.push(<Et key="sat" tono="ojo">El SAT no la encuentra</Et>);
    if (f.cancelacion === "pendiente") e.push(<Et key="pen" tono="ojo">Cancelación pendiente</Et>);
    if (String(f.metodo_pago || "").toUpperCase() === "PPD" && tc(f) === "I") e.push(<Et key="ppd">A crédito</Et>);
    if (tc(f) === "I" && Number(f.total) > 0) e.push(estaCubierta(f) ? <Et key="lig" tono="bien">Ligada</Et> : <Et key="lig" tono="ojo">Sin ligar</Et>);
    if ((f.trato || "normal") !== "normal") e.push(<Et key="tra">{TRATO[f.trato]?.[0] || f.trato}</Et>);
    if ((f.origen || "manual") === "manual") e.push(<Et key="man">A mano</Et>);
  }
  return <span className="flex flex-wrap gap-1 pt-0.5">{e}</span>;
}

export function RenglonDeFactura({ f }: { f: Fila }) {
  return (
    <Ren href={`/fiscal/facturas/${encodeURIComponent(f.id)}`}
      p={<><RenTitulo>{f.razon_social || f.rfc || "Sin nombre"}</RenTitulo><RenSub>{folio(f)} · {dia(f.fecha)}</RenSub><EtiquetasDeFactura f={f} /></>}
      m={<><RenMonto>{pesos(signo(f) * Number(f.total))}</RenMonto><RenSub>IVA {pesos(signo(f) * Number(f.iva))}</RenSub></>} />
  );
}

/** Los movimientos de dash101 que se le parecen a una factura (mismo monto y
 *  fecha cercana), cada uno con su «Es éste». */
export function Candidatos({ s, alLigar }: { s: Fila | null; alLigar: () => void }) {
  const avisa = useAvisa();
  const { hacer, ocupado } = useHacer();
  if (!s || !s.candidatos?.length) {
    return <Vacio>Ningún movimiento se le parece todavía (mismo monto y fecha cercana). Cuando se capture el pago en Movimientos, aparecerá aquí.</Vacio>;
  }
  return (
    <Lista>
      {s.candidatos.map((k: Fila) => {
        const m = k.movimiento;
        const porque = [k.dias === 0 ? "mismo día" : `a ${k.dias} día${k.dias === 1 ? "" : "s"}`];
        if (k.mismo_rfc) porque.push("mismo RFC"); else if (k.coincide_nombre) porque.push("coincide el nombre");
        if (k.diferencia) porque.push(`${pesos(Math.abs(k.diferencia))} de diferencia`);
        return (
          <Ren key={m.id}
            p={<>
              <RenTitulo>{m.contraparte_nombre || m.descripcion || "Movimiento"} {k.confianza === "alta" ? <Et tono="bien">Muy parecido</Et> : <Et tono="ojo">Parecido</Et>}</RenTitulo>
              <RenSub>{dia(m.fecha)} · {porque.join(" · ")}</RenSub>
              {m.descripcion && m.contraparte_nombre ? <RenSub>{m.descripcion}</RenSub> : null}
            </>}
            m={<RenMonto>{pesos(m.monto)}</RenMonto>}
            acc={<button type="button" className={`${B_PRI} ${CHICO}`} data-ligar={m.id} disabled={ocupado === m.id}
              onClick={async () => {
                const r = await hacer(m.id, () => fis(`/cfdi/${encodeURIComponent(s.cfdi.id)}/ligar`, { body: { movimiento_id: m.id } }));
                if (r) { avisa("Ligada: ese movimiento ya cuenta como facturado."); alLigar(); }
              }}>Es éste</button>} />
        );
      })}
    </Lista>
  );
}
