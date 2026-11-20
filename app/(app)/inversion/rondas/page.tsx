"use client";

/* Rondas: cada una es un «necesito juntar tanto, para tal fecha, en estas
 * condiciones». Viene de patron101 (`admin.js`, `A.rondas`). */

import Link from "next/link";
import { B_PRI, Cab, Lista, Tarjeta, Vacio, Vista, useCarga } from "@/components/fiscal/ui";
import { Cerrado, INICIO, RenRonda, usePatron } from "@/components/patron/piezas";
import { inv, type Fila } from "@/lib/patron";

export default function RondasPage() {
  const { cerrado } = usePatron();
  const carga = useCarga<{ filas: Fila[] }>(() => inv("/rondas"), "rondas");
  if (cerrado) return <Cerrado por={cerrado} />;
  return (
    <Vista carga={carga} inicio={INICIO}>
      <Cab titulo="Rondas" sub="Cada ronda es un «necesito juntar tanto, para tal fecha, en estas condiciones».">
        <Link href="/inversion/rondas/nueva" className={B_PRI}>Nueva ronda</Link>
      </Cab>
      <Tarjeta>
        {carga.d?.filas.length
          ? <Lista data-rondas>{carga.d.filas.map((x) => <RenRonda key={x.id} x={x} />)}</Lista>
          : <Vacio>Todavía no hay rondas. Empieza con «Nueva ronda», o genera una desde el flujo proyectado.</Vacio>}
      </Tarjeta>
    </Vista>
  );
}
