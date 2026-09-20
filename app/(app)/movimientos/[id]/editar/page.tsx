"use client";

/* Corregir un movimiento que se capturó mal.
 *
 * Mike, 20-sep: «no hay manera de editar un movimiento, no puedo. necesito
 * corregir un movimiento». Antes había que borrarlo y volverlo a capturar,
 * que funciona pero pierde la fecha de captura y obliga a teclear todo otra
 * vez por un dígito.
 *
 * Es el MISMO formulario que el de capturar, con el movimiento cargado. Dos
 * pantallas separadas se parecerían el día que se escriben y dejarían de
 * parecerse a los tres meses. */

import { use } from "react";
import { FormMovimiento } from "@/components/form-movimiento";

export default function EditarMovimientoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <FormMovimiento movimientoId={id} />;
}
