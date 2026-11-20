"use client";

import { Vista, useCarga } from "@/components/fiscal/ui";
import { Cerrado, INICIO, usePatron } from "@/components/patron/piezas";
import { RondaForm } from "@/components/patron/ronda-form";
import { inv, type Fila } from "@/lib/patron";

export default function RondaNuevaPage() {
  const { cerrado, hoy } = usePatron();
  const carga = useCarga<Fila>(() => inv("/ajustes"), "ajustes");
  if (cerrado) return <Cerrado por={cerrado} />;
  return <Vista carga={carga} inicio={INICIO}>{carga.d && <RondaForm ronda={null} ajustes={carga.d} hoy={hoy} />}</Vista>;
}
