"use client";

/* Fiscal · Prefacturas: muestras guardadas para que el cliente las revise.
 * Sin folio fiscal: sólo para bajar su PDF. Cuando la acepten, se abre y se
 * timbra. */

import Link from "next/link";
import { fis, momento, pesos, type Fila } from "@/lib/bill";
import { useFiscal } from "@/components/fiscal/contexto";
import { B_PRI, Cab, Et, Lista, Migas, Ren, RenMonto, RenSub, RenTitulo, Tarjeta, Vacio, Vista, useCarga } from "@/components/fiscal/ui";

export default function PrefacturasPage() {
  const { administra } = useFiscal();
  const carga = useCarga(async () => (await fis("/prefacturas")).filas as Fila[], "prefacturas");
  const filas = carga.d;
  return (
    <div>
      <Migas href="/fiscal/facturas?lado=emitidas">Facturas emitidas</Migas>
      <Cab titulo="Prefacturas" sub="Muestras guardadas para que el cliente las revise: sin folio fiscal, sólo para bajar su PDF. Cuando la acepten, se abre y se timbra.">
        {administra && <Link className={B_PRI} href="/fiscal/nueva">Nueva factura</Link>}
      </Cab>
      <Vista carga={carga}>
        {filas && (
          <Tarjeta>
            {filas.length ? (
              <Lista>
                {filas.map((p) => (
                  <Ren key={p.id} href={p.cfdi_id ? `/fiscal/facturas/${encodeURIComponent(p.cfdi_id)}` : `/fiscal/nueva?prefactura=${encodeURIComponent(p.id)}`}
                    p={<><RenTitulo>{p.razon_social || p.rfc}</RenTitulo><RenSub>{momento(p.actualizada_at)} · {p.renglones} renglón{p.renglones === 1 ? "" : "es"}{p.cfdi_id ? ` · timbrada ${momento(p.timbrada_at)}` : ""}</RenSub></>}
                    m={<><RenMonto>{pesos(p.total)}</RenMonto>{p.cfdi_id ? <Et tono="bien">Ya timbrada</Et> : <Et tono="ojo">Prefactura</Et>}</>} />
                ))}
              </Lista>
            ) : <Vacio>No hay prefacturas. En «Nueva factura», el botón «Guardar como prefactura» deja una aquí.</Vacio>}
          </Tarjeta>
        )}
      </Vista>
    </div>
  );
}
