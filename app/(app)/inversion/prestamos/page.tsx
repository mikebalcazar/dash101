"use client";

/* Préstamos: cada oferta aceptada es un préstamo con su propia tabla de
 * pagos. Viene de patron101 (`admin.js`, `A.prestamos`). */

import Link from "next/link";
import { B, Cab, Lista, Tarjeta, Vacio, Vista, useCarga } from "@/components/fiscal/ui";
import { Cerrado, INICIO, RenPrestamo, usePatron } from "@/components/patron/piezas";
import { inv, type Fila } from "@/lib/patron";

const GRUPOS: [string, string][] = [["por_depositar", "Esperando depósito"], ["activo", "Activos"], ["liquidado", "Liquidados"], ["cancelado", "Cancelados"]];

export default function PrestamosPage() {
  const { cerrado } = usePatron();
  const carga = useCarga<{ filas: Fila[] }>(() => inv("/prestamos"), "prestamos");
  if (cerrado) return <Cerrado por={cerrado} />;
  const filas = carga.d?.filas ?? [];
  return (
    <Vista carga={carga} inicio={INICIO}>
      <Cab titulo="Préstamos" sub="Cada oferta aceptada es un préstamo con su propia tabla de pagos.">
        <Link href="/inversion/prestamos/nuevo" className={B}>Préstamo directo</Link>
      </Cab>
      {filas.length ? GRUPOS.map(([estado, titulo]) => {
        const suyos = filas.filter((p) => p.estado === estado);
        return suyos.length ? (
          <Tarjeta key={estado} titulo={titulo} der={suyos.length} data-grupo={estado}>
            <Lista>{suyos.map((p) => <RenPrestamo key={p.id} p={p} />)}</Lista>
          </Tarjeta>
        ) : null;
      }) : <Tarjeta><Vacio>Todavía no hay préstamos. Nacen al aceptar una oferta de una ronda, o como «Préstamo directo».</Vacio></Tarjeta>}
    </Vista>
  );
}
