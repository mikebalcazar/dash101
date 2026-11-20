"use client";

/* Los datos de una persona del directorio: los mismos campos al darla de
 * alta y al editarla. Viene de patron101 (`admin.js`, `camposPersona`). */

import { CAJA, Campo } from "@/components/fiscal/ui";
import type { Fila } from "@/lib/patron";

export interface Persona { nombre: string; correo: string; telefono: string; banco: string; clabe: string; beneficiario: string; notas: string; recibe_avisos: boolean }

export const personaDe = (v: Fila = {}): Persona => ({
  nombre: v.nombre || "", correo: v.correo || "", telefono: v.telefono || "", banco: v.banco || "",
  clabe: v.clabe || "", beneficiario: v.beneficiario || "", notas: v.notas || "", recibe_avisos: v.recibe_avisos !== false,
});
/** Lo tecleado, como lo espera la API. */
export const leerPersona = (p: Persona): Fila => ({
  nombre: p.nombre.trim(), correo: p.correo.trim(), telefono: p.telefono.trim(), banco: p.banco.trim(),
  clabe: p.clabe.trim(), beneficiario: p.beneficiario.trim(), notas: p.notas.trim(), recibe_avisos: p.recibe_avisos,
});

const chico = (t: string) => <small className="font-normal">({t})</small>;

export function CamposPersona({ p, cambia }: { p: Persona; cambia: (p: Persona) => void }) {
  const pon = (k: keyof Persona) => (ev: { target: { value: string } }) => cambia({ ...p, [k]: ev.target.value });
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo e="Nombre"><input name="nombre" value={p.nombre} onChange={pon("nombre")} maxLength={120} autoComplete="off" className={CAJA} /></Campo>
        <Campo e={<>Correo {chico("con él entra y le llegan los avisos")}</>}><input name="correo" type="email" value={p.correo} onChange={pon("correo")} autoComplete="off" autoCapitalize="off" inputMode="email" className={CAJA} /></Campo>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo e={<>Teléfono {chico("para WhatsApp")}</>}><input name="telefono" value={p.telefono} onChange={pon("telefono")} inputMode="tel" autoComplete="off" className={CAJA} /></Campo>
        <Campo e="Banco"><input name="banco" value={p.banco} onChange={pon("banco")} maxLength={120} autoComplete="off" className={CAJA} /></Campo>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo e={<>CLABE {chico("a dónde se le paga")}</>}><input name="clabe" value={p.clabe} onChange={pon("clabe")} inputMode="numeric" autoComplete="off" className={CAJA} /></Campo>
        <Campo e="A nombre de"><input name="beneficiario" value={p.beneficiario} onChange={pon("beneficiario")} maxLength={120} autoComplete="off" className={CAJA} /></Campo>
      </div>
      <Campo e="Notas internas"><textarea name="notas" value={p.notas} onChange={pon("notas")} maxLength={2000} rows={2} className={CAJA} /></Campo>
      <label className="flex items-center gap-2 text-sm text-ink-dim"><input type="checkbox" name="recibe_avisos" checked={p.recibe_avisos} onChange={(e) => cambia({ ...p, recibe_avisos: e.target.checked })} className="w-4 h-4" /> Avisarle cuando se abra una ronda</label>
    </>
  );
}
