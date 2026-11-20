"use client";

/* Fiscal · una factura: sus cifras, con qué se cobró o se pagó, cómo cuenta
 * para los impuestos, y lo que se le puede hacer (bajar, mandar, revisar en
 * el SAT, cancelar).
 *
 * 11-oct-2026 · Mike: «esta factura me la pagaron en 2 transferencias, el
 * mismo día (…) poder seleccionar 2 o más pagos que son parte del monto de
 * la factura para ligarlos». Se escogen con casillas; la suma se ve al
 * momento, y la API los liga todos o ninguno. Arriba, si dos o tres pagos
 * suman justo lo que falta, se proponen juntos. */

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FORMA, TIPO, TRATO, dia, fis, folio, ligaPdf, ligaXml, mensajeDe, momento, motivoCorreo, pesos, signo, verificarEnSat, type Fila } from "@/lib/bill";
import { useFiscal } from "@/components/fiscal/contexto";
import { DialogoCancelar } from "@/components/fiscal/cancelar";
import { Candidatos } from "@/components/fiscal/factura";
import { Aviso, B, B_MAL, B_PRI, CHICO, Cab, Cifra, Cifras, Dato, Datos, Err, Et, LIGA, Lista, Migas, Nota, Ren, RenMonto, RenSub, RenTitulo, Tabla, Tarjeta, Vacio, Vista, useAvisa, useCarga, useHacer } from "@/components/fiscal/ui";

function Componer({ f, alLigar }: { f: Fila; alLigar: () => void }) {
  const avisa = useAvisa();
  const [p, setP] = useState<Fila | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [escogidos, setEscogidos] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState("");
  const cobro = f.lado === "emitida" ? "cobro" : "pago";

  const abrir = async () => {
    if (abierto) { setAbierto(false); return; }
    setOcupado("abrir");
    try {
      setP(await fis(`/cfdi/${encodeURIComponent(f.id)}/pagos-posibles`));
      setEscogidos([]); setError(""); setAbierto(true);
    } catch (e) { avisa(mensajeDe(e), true); } finally { setOcupado(""); }
  };
  const porId = new Map<string, Fila>((p?.movimientos || []).map((m: Fila) => [m.id, m]));
  const total = escogidos.reduce((t, x) => t + Number(porId.get(x)?.monto || 0), 0);
  const dif = Number(p?.restante || 0) - total;
  const nombre = (m: Fila) => m.contraparte_nombre || m.descripcion || "Movimiento";
  const ligar = async () => {
    setOcupado("ligar"); setError("");
    try {
      const r = await fis(`/cfdi/${encodeURIComponent(f.id)}/componer`, { body: { movimientos: escogidos } });
      avisa(`Ligados ${r.ligados.length} ${cobro}s: ya cuentan como facturados.`);
      alLigar();
    } catch (e) { setError(mensajeDe(e)); } finally { setOcupado(""); }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button type="button" className={B} id="b-componer" disabled={ocupado === "abrir"} onClick={() => void abrir()}>Componer con varios pagos</button>
        <span className="text-[11px] text-ink-muted">Si se {f.lado === "emitida" ? "cobró" : "pagó"} en dos o más partes, escoge cuáles son.</span>
      </div>
      {abierto && p && (
        <div id="componer" className="mt-3 border-t border-black/5 pt-3">
          {!p.movimientos.length ? (
            <Vacio>No hay {cobro}s libres que quepan en lo que falta ({pesos(p.restante)}), a 45 días o menos de la factura. Cuando se capturen en Movimientos, aparecerán aquí.</Vacio>
          ) : (
            <>
              {p.combinaciones.slice(0, 3).map((k: Fila, i: number) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 bg-sky-50 text-sky-900 rounded-xl px-3 py-2 mb-2 text-xs">
                  <span>{k.ids.length} {cobro}s {k.dias === 0 ? "del mismo día" : `a ${k.dias} día${k.dias === 1 ? "" : "s"} o menos`} suman justo lo que falta: {k.ids.map((x: string) => pesos(porId.get(x)?.monto)).join(" + ")}</span>
                  <button type="button" className={`${B} ${CHICO}`} data-combo={i} onClick={() => setEscogidos(k.ids)}>Escoger éstos</button>
                </div>
              ))}
              <Lista className="max-h-96 overflow-y-auto pr-1">
                {p.movimientos.map((m: Fila) => (
                  <li key={m.id}>
                    <label className="flex items-center gap-3 py-2.5 cursor-pointer">
                      <input type="checkbox" value={m.id} checked={escogidos.includes(m.id)}
                        onChange={(e) => setEscogidos((l) => (e.target.checked ? [...l, m.id] : l.filter((x) => x !== m.id)))} />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <RenTitulo>{nombre(m)}{m.coincide_nombre ? <> <Et tono="bien">Coincide el nombre</Et></> : null}</RenTitulo>
                        <RenSub>{dia(m.fecha)} · {m.dias === 0 ? "mismo día" : `a ${m.dias} día${m.dias === 1 ? "" : "s"}`}{m.descripcion && m.contraparte_nombre ? ` · ${m.descripcion}` : ""}</RenSub>
                      </div>
                      <RenMonto>{pesos(m.monto)}</RenMonto>
                    </label>
                  </li>
                ))}
              </Lista>
              <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                <span className="text-sm text-ink-dim" id="c-suma">
                  Escogidos {escogidos.length}: <b className="tabular-nums">{pesos(total)}</b> de {pesos(p.restante)} ·{" "}
                  {Math.abs(dif) <= 100 ? <Et tono="bien">Cubre la factura</Et> : dif > 0 ? `faltan ${pesos(dif)}` : <Et tono="mal">sobran {pesos(-dif)}</Et>}
                </span>
                <button type="button" className={B_PRI} id="c-ligar" disabled={escogidos.length < 2 || dif < -100 || ocupado === "ligar"} onClick={() => void ligar()}>
                  {escogidos.length >= 2 ? `Ligar los ${escogidos.length} ${cobro}s` : "Escoge dos o más"}
                </button>
              </div>
              <Err>{error}</Err>
            </>
          )}
        </div>
      )}
    </>
  );
}

export default function FacturaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const avisa = useAvisa();
  const { administra: admin } = useFiscal();
  const { hacer, ocupado } = useHacer();
  const [cancelando, setCancelando] = useState(false);
  const [sat, setSat] = useState(false);
  const carga = useCarga(async () => {
    const f: Fila = await fis(`/cfdi/${encodeURIComponent(id)}`);
    const restante = Number(f.total) - Number(f.aplicado);
    const sug: Fila | null = f.tipo_comprobante === "I" && f.estado === "vigente" && restante > 100
      ? (await fis(`/sugerencias?cfdi_id=${encodeURIComponent(id)}`)).filas[0] ?? null : null;
    return { f, sug };
  }, id);
  const otra = () => void carga.otra();
  const x = carga.d;

  const pinta = () => {
    if (!x) return null;
    const { f, sug } = x;
    const esFactura = f.tipo_comprobante === "I";
    const viva = f.estado === "vigente";
    const restante = Number(f.total) - Number(f.aplicado);
    const s = signo(f);
    const lado = f.lado === "emitida" ? "emitidas" : "recibidas";
    const etSat = f.estado_sat === "vigente" ? <Et tono="bien">Vigente en el SAT</Et> : f.estado_sat === "cancelado" ? <Et tono="mal">Cancelada en el SAT</Et>
      : f.estado_sat === "no_encontrado" ? <Et tono="ojo">El SAT no la encuentra</Et> : <Et>Sin revisar en el SAT</Et>;
    const aMano = (f.origen || "manual") === "manual";

    const revisarEnSat = async () => {
      setSat(true);
      try {
        const r = await verificarEnSat([id], () => {});
        if (r.sin && !r.revisadas) avisa("El SAT no contestó. No se anotó nada; vuelve a intentar en un rato.", true);
        else avisa(`${r.revisadas} revisada en el SAT${r.canceladas ? " · cancelada" : ""}.`, r.canceladas > 0);
        otra();
      } catch (e) { avisa(mensajeDe(e), true); } finally { setSat(false); }
    };
    const enviar = async () => {
      const a = prompt("¿A qué correos? Separados por coma. Vacío: a los correos del cliente.", "");
      if (a === null) return;
      const correos = a.split(/[,;\s]+/).map((c) => c.trim()).filter(Boolean);
      const r = await hacer("enviar", () => fis(`/cfdi/${encodeURIComponent(id)}/enviar`, { body: { correos } }));
      if (r) avisa(r.enviado ? `Mandada a ${r.a.join(", ")}.` : `No se mandó: ${motivoCorreo(r.motivo)}`, !r.enviado);
    };
    const borrarPrueba = async () => {
      if (!confirm(`¿Borrar la prueba ${folio(f)} por ${pesos(f.total)}? Se va con su XML y su PDF, y deja de contar en los impuestos. El folio ya se gastó y no se reusa.`)) return;
      const r = await hacer("borrar", () => fis(`/cfdi/${encodeURIComponent(id)}`, { method: "DELETE" }));
      if (r) { avisa(`Prueba ${r.folio || ""} borrada.`); router.push(`/fiscal/facturas?lado=${lado}`); }
    };
    /* Lo que dash101 ya tenía: una factura que NO se timbró aquí no se puede
     * cancelar ante el SAT desde aquí, pero sí marcarse cancelada para que
     * salga de los impuestos y se quede a la vista. */
    const marcarCancelada = async () => {
      if (!confirm(`¿Marcar cancelada la factura ${folio(f)}? Sale de los impuestos y se queda a la vista. Esto NO la cancela ante el SAT.`)) return;
      const r = await hacer("marcar", () => fis(`/cfdi/${encodeURIComponent(id)}/cancelar`, { method: "POST" }));
      if (r) { avisa("Quedó cancelada. Ya no cuenta en los impuestos."); otra(); }
    };

    return (
      <>
        <Migas href={`/fiscal/facturas?lado=${lado}&mes=${String(f.fecha).slice(0, 7)}`}>Facturas {lado}</Migas>
        <Cab sobre={`${TIPO[f.tipo_comprobante] || "Factura"} ${f.lado === "emitida" ? "emitida" : "recibida"} · ${folio(f)}`}
          titulo={f.razon_social || f.rfc || "Sin nombre"}
          sub={<span className="flex flex-wrap items-center gap-1.5">{dia(f.fecha)} · {!viva && <Et tono="mal">Cancelada</Et>} {etSat}</span>}>
          {f.tiene_xml && <a className={B} href={ligaXml(f.id)}>Bajar XML</a>}
          {(f.pac_id || f.tiene_xml) && <a className={B} href={ligaPdf(f.id)} target="_blank" rel="noopener">Ver PDF</a>}
          {f.pac_id && f.tiene_xml && admin && <button type="button" className={B} id="b-enviar" disabled={ocupado === "enviar"} onClick={() => void enviar()}>Mandar por correo</button>}
          {f.rfc_emisor && viva && <button type="button" className={B} id="b-sat" disabled={sat} onClick={() => void revisarEnSat()}>{sat ? "Preguntándole al SAT…" : "Revisar en el SAT"}</button>}
          {f.pac_id && viva && f.cancelacion !== "pendiente" && admin && <button type="button" className={B_MAL} id="b-cancelar" onClick={() => setCancelando(true)}>Cancelar ante el SAT</button>}
          {!f.pac_id && viva && admin && <button type="button" className={B_MAL} id="b-marcar-cancelada" disabled={ocupado === "marcar"} onClick={() => void marcarCancelada()}>Marcar cancelada</button>}
          {f.pruebas === true && admin && <button type="button" className={B_MAL} id="b-borrar-prueba" disabled={ocupado === "borrar"} onClick={() => void borrarPrueba()}>Borrar prueba</button>}
        </Cab>

        {f.pruebas === true && <Aviso tono="ojo">Se timbró con la cuenta de pruebas de Facturama: no existe ante el SAT y no vale como factura. Sólo sirve para probar; cuando ya no haga falta, se borra con «Borrar prueba» y deja de contar en los impuestos.</Aviso>}
        {!viva && <Aviso tono="mal">Esta factura está cancelada{f.motivo_cancelacion ? ` (motivo ${f.motivo_cancelacion})` : ""}: no cuenta para los impuestos, y los pagos que respaldaba volvieron a estar sin facturar.</Aviso>}
        {viva && f.cancelacion === "pendiente" && <Aviso tono="ojo">Se pidió cancelarla y el receptor tiene que aceptar. Hasta entonces sigue vigente; cuando el SAT la dé por cancelada, aquí se verá al bajar la lista del SAT.</Aviso>}
        {f.origen === "timbrado" && viva && <Aviso>Se timbró desde aquí. Si tiene un error, se cancela y se hace otra: una factura timbrada no se edita.</Aviso>}
        {f.estado_sat === "no_encontrado" && viva && <Aviso tono="ojo">El SAT no la reconoce. Si se timbró hace menos de tres días puede ser sólo que todavía no aparece; si no, pídele a quien la emitió que la revise.</Aviso>}
        {aMano && <Aviso>Se capturó a mano. Si subes su XML se completa sola, sin duplicarse.</Aviso>}

        <Cifras>
          <Cifra principal e="Total" v={pesos(s * f.total)} d={f.moneda && f.moneda !== "MXN" && f.moneda !== "XXX" ? `${f.total_original} ${f.moneda} al ${f.tipo_cambio}` : "pesos"} />
          <Cifra e="Subtotal" v={pesos(s * f.subtotal)} />
          <Cifra e="IVA" v={pesos(s * f.iva)} />
          <Cifra e="Retenciones" v={pesos(s * f.retenciones)} d={f.iva_retenido || f.isr_retenido ? `IVA ${pesos(f.iva_retenido)} · ISR ${pesos(f.isr_retenido)}` : undefined} />
        </Cifras>

        {esFactura && (
          <Tarjeta id="t-dinero" titulo={f.lado === "emitida" ? "Con qué se cobró" : "Con qué se pagó"} der={viva ? (restante <= 100 ? "cubierta" : `faltan ${pesos(restante)}`) : ""}>
            {(f.movimientos || []).length > 0 && (
              <Lista>
                {f.movimientos.map((m: Fila) => (
                  <Ren key={m.movimiento_id} href={`/movimientos/${encodeURIComponent(m.movimiento_id)}/editar`}
                    p={<><RenTitulo>{m.contraparte_nombre || m.descripcion || "Movimiento"}</RenTitulo><RenSub>{dia(m.fecha)}{m.descripcion && m.contraparte_nombre ? ` · ${m.descripcion}` : ""}</RenSub></>}
                    m={<><RenMonto>{pesos(m.monto_aplicado)}</RenMonto>{Number(m.monto_aplicado) !== Number(m.monto) ? <RenSub>de {pesos(m.monto)}</RenSub> : null}</>}
                    acc={<button type="button" className={`${B_MAL} ${CHICO}`} data-desligar={m.movimiento_id} disabled={ocupado === m.movimiento_id}
                      onClick={async () => {
                        if (!confirm("¿Desligar este movimiento? Volverá a estar sin facturar.")) return;
                        const r = await hacer(m.movimiento_id, () => fis(`/cfdi/${encodeURIComponent(id)}/desligar`, { body: { movimiento_id: m.movimiento_id } }));
                        if (r) { avisa("Desligado."); otra(); }
                      }}>Desligar</button>} />
                ))}
              </Lista>
            )}
            {viva && restante > 100 && (
              <>
                {(f.movimientos || []).length > 0 && <h4 className="text-xs font-medium text-ink-muted mt-4 mb-1">Lo que se le parece</h4>}
                <Candidatos s={sug} alLigar={otra} />
                <Componer f={f} alLigar={otra} />
              </>
            )}
            {!(f.movimientos || []).length && !(viva && restante > 100) && <Vacio>Sin movimientos ligados.</Vacio>}
          </Tarjeta>
        )}

        {(f.pagada_con || []).length > 0 && (
          <Tarjeta titulo="Complementos de pago">
            <Tabla>
              <thead><tr><th>Fecha de pago</th><th>Parcialidad</th><th className="n">Pagado</th><th /></tr></thead>
              <tbody>{f.pagada_con.map((p: Fila, i: number) => (
                <tr key={i}><td>{dia(p.fecha)}</td><td>{p.parcialidad ?? ""}</td><td className="n">{pesos(p.pagado)}</td>
                  <td>{p.estado === "cancelada" ? <Et tono="mal">Cancelado</Et> : <Link className={LIGA} href={`/fiscal/facturas/${encodeURIComponent(p.cfdi_id)}`}>ver</Link>}</td></tr>
              ))}</tbody>
            </Tabla>
            <Nota>Con estas fechas se decide en qué mes cuenta su IVA.</Nota>
          </Tarjeta>
        )}
        {(f.paga || []).length > 0 && (
          <Tarjeta titulo="Lo que paga este complemento">
            <Tabla>
              <thead><tr><th>Factura</th><th>Fecha de pago</th><th className="n">Pagado</th></tr></thead>
              <tbody>{f.paga.map((p: Fila, i: number) => (
                <tr key={i}>
                  <td>{p.cfdi_id ? <Link className={LIGA} href={`/fiscal/facturas/${encodeURIComponent(p.cfdi_id)}`}>{[p.serie, p.folio].filter(Boolean).join("-") || p.razon_social || "ver"}</Link> : <span title={p.uuid_docto}>…{String(p.uuid_docto).slice(-6)} (no está cargada)</span>}</td>
                  <td>{dia(p.fecha)}</td><td className="n">{pesos(p.pagado)}</td>
                </tr>
              ))}</tbody>
            </Tabla>
          </Tarjeta>
        )}

        {f.lado === "recibida" && esFactura && viva && (
          <Tarjeta titulo="Cómo cuenta para los impuestos">
            <div className="flex flex-wrap gap-2" id="tratos">
              {Object.entries(TRATO).map(([k, [nombre]]) => (
                <label key={k} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${(f.trato || "normal") === k ? "border-ink/50 text-ink-dim" : "border-black/10 text-ink-muted"}`}>
                  <input type="radio" name="trato" value={k} checked={(f.trato || "normal") === k} disabled={!admin}
                    onChange={async () => {
                      const r = await hacer("trato", () => fis(`/cfdi/${encodeURIComponent(id)}/trato`, { body: { trato: k } }));
                      if (r) avisa("Guardado.");
                      otra();
                    }} /> {nombre}
                </label>
              ))}
            </div>
            <Nota>{TRATO[f.trato || "normal"]?.[1] || ""}</Nota>
            {!admin && <Nota>Lo cambia quien dirige la empresa o quien lleva la contabilidad.</Nota>}
          </Tarjeta>
        )}

        <Tarjeta titulo="Datos">
          <Datos>
            <Dato e="RFC">{f.rfc}</Dato>
            <Dato e="Folio fiscal"><span className="text-xs">{f.uuid}</span></Dato>
            <Dato e="Método de pago">{f.metodo_pago ? (String(f.metodo_pago).toUpperCase() === "PPD" ? "A crédito (PPD)" : "De contado (PUE)") : ""}</Dato>
            <Dato e="Forma de pago">{f.forma_pago ? FORMA[f.forma_pago] || f.forma_pago : ""}</Dato>
            <Dato e="Uso">{f.uso}</Dato>
            <Dato e="Revisada en el SAT">{f.sat_revisado_at ? momento(f.sat_revisado_at) : ""}</Dato>
          </Datos>
        </Tarjeta>

        {(f.conceptos || []).length > 0 && (
          <Tarjeta titulo="Conceptos">
            <Tabla>
              <thead><tr><th>Descripción</th><th className="n hidden sm:table-cell">Cantidad</th><th className="n hidden sm:table-cell">Precio</th><th className="n">Importe</th></tr></thead>
              <tbody>{f.conceptos.map((k: Fila, i: number) => (
                <tr key={i}>
                  <td className="whitespace-normal">{k.descripcion}<small className="block sm:hidden text-[11px] text-ink-muted">{k.cantidad} × {pesos(k.valor_unitario)}</small></td>
                  <td className="n hidden sm:table-cell">{k.cantidad}</td><td className="n hidden sm:table-cell">{pesos(k.valor_unitario)}</td><td className="n">{pesos(k.importe)}</td>
                </tr>
              ))}</tbody>
            </Tabla>
          </Tarjeta>
        )}

        {cancelando && <DialogoCancelar f={f} alCerrar={() => setCancelando(false)} despues={otra} />}
      </>
    );
  };

  return <Vista carga={carga}>{pinta()}</Vista>;
}
