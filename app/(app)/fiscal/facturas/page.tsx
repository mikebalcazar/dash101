"use client";

/* Fiscal · Facturas: las que la empresa emite y las que recibe, mes por mes.
 * Se suben (XML o .zip), se revisan en el SAT, y cada una abre su detalle. */

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { fis, mes as nombreMes, mesMas, mensajeDe, pesos, verificarEnSat, type Fila, type ResultadoDeSubida } from "@/lib/bill";
import { useFiscal } from "@/components/fiscal/contexto";
import { CapturaAMano } from "@/components/fiscal/captura-a-mano";
import { RenglonDeFactura } from "@/components/fiscal/factura";
import { BotonSubir, ResumenDeSubida } from "@/components/fiscal/subir";
import { B, B_PRI, Cab, Cifra, Fichas, LIGA, Lista, Mesero, Nota, Tarjeta, Vacio, Vista, useAvisa, useCarga } from "@/components/fiscal/ui";

export default function FacturasPage() {
  const q = useSearchParams();
  const { hoy, administra } = useFiscal();
  const avisa = useAvisa();
  const lado = q.get("lado") === "emitidas" ? "emitidas" : "recibidas";
  const mes = /^\d{4}-\d{2}$/.test(q.get("mes") || "") ? q.get("mes")! : hoy.slice(0, 7);
  const tipo = lado === "emitidas" ? "ingreso" : "egreso";
  const [subida, setSubida] = useState<ResultadoDeSubida[] | null>(null);
  const [capturando, setCapturando] = useState(false);
  const [sat, setSat] = useState("");
  const carga = useCarga(async () => {
    const [lista, edo] = await Promise.all([fis(`/cfdi?mes=${mes}&tipo=${tipo}`), fis(`/estado-de-cuenta?mes=${mes}`)]);
    return { filas: lista.filas as Fila[], tot: (lado === "emitidas" ? edo.ingresos : edo.egresos) as Fila };
  }, `${mes}:${tipo}`);
  const con = (c: { lado?: string; mes?: string }) => `/fiscal/facturas?lado=${c.lado ?? lado}&mes=${c.mes ?? mes}`;

  const revisar = async () => {
    setSat("Preguntándole al SAT…");
    try {
      const r = await verificarEnSat(null, (n) => setSat(n ? `Revisando… ${n}` : "Preguntándole al SAT…"));
      if (r.sin && !r.revisadas) avisa("El SAT no contestó. No se anotó nada; vuelve a intentar en un rato.", true);
      else avisa(`${r.revisadas} revisada${r.revisadas === 1 ? "" : "s"} en el SAT${r.canceladas ? ` · ${r.canceladas} cancelada${r.canceladas === 1 ? "" : "s"}` : ""}${r.sin ? " · el SAT dejó de contestar" : ""}.`, r.canceladas > 0);
      if (r.revisadas) await carga.otra();
    } catch (e) { avisa(mensajeDe(e), true); } finally { setSat(""); }
  };

  const x = carga.d;
  return (
    <div>
      <Cab titulo="Facturas" sub="Las que la empresa emite y las que recibe.">
        {lado === "emitidas" && administra && <Link href="/fiscal/nueva" className={B_PRI}>Nueva factura</Link>}
        <BotonSubir alTerminar={async (res) => { setSubida(res); await carga.otra(); }} />
        <button type="button" className={B} id="b-sat" disabled={!!sat} onClick={() => void revisar()}>{sat || "Revisar en el SAT"}</button>
        <button type="button" className={B} onClick={() => setCapturando((v) => !v)} data-capturar>Capturar a mano</button>
      </Cab>
      <ResumenDeSubida res={subida} />
      {capturando && <CapturaAMano alTerminar={async (m) => { setCapturando(false); avisa(m); await carga.otra(); }} />}
      <Fichas opciones={[
        { href: con({ lado: "recibidas" }), texto: "Recibidas", activa: lado === "recibidas" },
        { href: con({ lado: "emitidas" }), texto: "Emitidas", activa: lado === "emitidas" },
      ]} />
      <Mesero antes={con({ mes: mesMas(mes, -1) })} despues={con({ mes: mesMas(mes, 1) })}>{nombreMes(mes)}</Mesero>
      <Vista carga={carga}>
        {x && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Cifra e={lado === "emitidas" ? "Facturado" : "Gastado con factura"} v={pesos(x.tot.subtotal)} d={`sin IVA · ${x.tot.facturas} vigente${x.tot.facturas === 1 ? "" : "s"}`} />
              <Cifra e="IVA" v={pesos(x.tot.iva)} d={`${lado === "emitidas" ? "que cobraste" : "que pagaste"}, por fecha de factura`} />
            </div>
            <Tarjeta>
              {x.filas.length
                ? <Lista id="lista-facturas">{x.filas.map((f) => <RenglonDeFactura key={f.id} f={f} />)}</Lista>
                : <Vacio>No hay facturas {lado} en {nombreMes(mes)}. {lado === "emitidas" ? "Se hacen con «Nueva factura», o sube" : "Sube"} los XML —o un .zip con varios— con el botón de arriba.</Vacio>}
              {lado === "emitidas" && (
                <Nota>
                  <Link href="/fiscal/emisiones" className={LIGA}>Lo intentado</Link>: cada vez que se mandó a timbrar, con su folio y «nueva igual».{" "}
                  <Link href="/fiscal/prefacturas" className={LIGA}>Prefacturas</Link>: las muestras guardadas.
                </Nota>
              )}
            </Tarjeta>
          </>
        )}
      </Vista>
    </div>
  );
}
