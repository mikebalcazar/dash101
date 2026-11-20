"use client";

/* Fiscal · Lo intentado: cada vez que se mandó a timbrar una factura, con su
 * folio y en qué quedó. */

import Link from "next/link";
import { fis, momento, pesos, type Fila } from "@/lib/bill";
import { useFiscal } from "@/components/fiscal/contexto";
import { B, CHICO, Cab, Et, Lista, Migas, Nota, Ren, RenMonto, RenSub, RenTitulo, Tarjeta, Vacio, Vista, useCarga, type Tono } from "@/components/fiscal/ui";

const ESTADO_EM: Record<string, [string, Tono]> = { timbrando: ["En camino", "ojo"], timbrada: ["Timbrada", "bien"], fallida: ["No se timbró", "mal"] };

export default function EmisionesPage() {
  const { administra } = useFiscal();
  const carga = useCarga(async () => (await fis("/emisiones")).filas as Fila[], "emisiones");
  const filas = carga.d;
  return (
    <div>
      <Migas href="/fiscal/facturas?lado=emitidas">Facturas emitidas</Migas>
      <Cab titulo="Lo intentado" sub="Cada vez que se mandó a timbrar una factura, con su folio y en qué quedó. Un folio que no se timbró no se vuelve a usar. «Nueva igual» arma otra con los mismos datos y la fecha de hoy.">
        <Link className={B} href="/fiscal/prefacturas">Prefacturas</Link>
      </Cab>
      <Vista carga={carga}>
        {filas && (
          <Tarjeta>
            {filas.length ? (
              <Lista>
                {filas.map((e) => {
                  const [t, c] = ESTADO_EM[e.estado] || [e.estado, ""];
                  return (
                    <Ren key={e.id} href={e.cfdi_id ? `/fiscal/facturas/${encodeURIComponent(e.cfdi_id)}` : undefined}
                      p={<><RenTitulo>{e.serie}-{e.folio} · {e.razon_social || e.rfc}</RenTitulo><RenSub>{momento(e.creada_at)}{e.error ? ` · ${String(e.error).slice(0, 160)}` : ""}</RenSub></>}
                      m={<>{e.total != null ? <RenMonto>{pesos(e.total)}</RenMonto> : null}<Et tono={c}>{t}</Et></>}
                      acc={e.estado === "timbrada" && administra ? <Link className={`${B} ${CHICO}`} href={`/fiscal/nueva?de=${encodeURIComponent(e.id)}`} title="Armar una nueva igual a ésta, con la fecha de hoy">Nueva igual</Link> : undefined} />
                  );
                })}
              </Lista>
            ) : <Vacio>Todavía no se ha timbrado nada desde aquí.</Vacio>}
            <Nota>«En camino» que lleve más de unos minutos: Facturama no contestó a tiempo y no se sabe si se timbró. Antes de volver a intentar, revísalo en el portal de Facturama por su folio.</Nota>
          </Tarjeta>
        )}
      </Vista>
    </div>
  );
}
