"use client";

import { useParams } from "next/navigation";
import { Vista, useCarga } from "@/components/fiscal/ui";
import { Cerrado, INICIO, usePatron } from "@/components/patron/piezas";
import { RondaForm } from "@/components/patron/ronda-form";
import { inv, type Fila } from "@/lib/patron";

export default function RondaEditarPage() {
  const { id } = useParams<{ id: string }>();
  const { cerrado, hoy } = usePatron();
  const carga = useCarga<Fila>(() => inv(`/rondas/${id}`), `ronda:${id}`);
  if (cerrado) return <Cerrado por={cerrado} />;
  return <Vista carga={carga} inicio={INICIO}>{carga.d && <RondaForm ronda={carga.d} ajustes={null} hoy={hoy} />}</Vista>;
}
