"use client";

/* Fiscal · Por ligar: las facturas que todavía no están ligadas a un
 * movimiento, con los que se les parecen. Nada se liga solo. */

import Link from "next/link";
import { dia, fis, pesos, type Fila } from "@/lib/bill";
import { Candidatos } from "@/components/fiscal/factura";
import { Cab, LIGA, Tarjeta, Vacio, Vista, useCarga } from "@/components/fiscal/ui";

export default function PorLigarPage() {
  const carga = useCarga(async () => (await fis("/sugerencias")).filas as Fila[], "ligar");
  const filas = carga.d;
  return (
    <div>
      <Cab titulo="Por ligar" sub="Facturas que todavía no están ligadas a un movimiento, con los que se les parecen: mismo monto y fecha cercana. Nada se liga solo: tú dices cuál es." />
      <Vista carga={carga}>
        {filas && (filas.length ? filas.map((s) => (
          <Tarjeta key={s.cfdi.id} data-sugerencia={s.cfdi.id}
            titulo={<Link href={`/fiscal/facturas/${encodeURIComponent(s.cfdi.id)}`} className={`${LIGA} normal-case tracking-normal text-sm`}>{s.cfdi.razon_social || s.cfdi.rfc || "Sin nombre"}</Link>}
            der={`${s.cfdi.lado === "emitida" ? "emitida" : "recibida"} · ${dia(s.cfdi.fecha)} · ${pesos(s.restante)}`}>
            <Candidatos s={s} alLigar={() => void carga.otra()} />
          </Tarjeta>
        )) : (
          <Tarjeta>
            <Vacio>No hay nada por ligar: ninguna factura pendiente tiene un movimiento que se le parezca. Las que sigan «Sin ligar» en la lista de facturas están esperando a que se capture su pago o su cobro.</Vacio>
          </Tarjeta>
        ))}
      </Vista>
    </div>
  );
}
