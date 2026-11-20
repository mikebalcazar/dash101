"use client";

/* El formulario de una ronda: nueva (`ronda` nulo) o existente. Viene de
 * patron101 (`admin.js`, `A.rondaForm`). */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { B, B_PRI, CAJA, Cab, Campo, ConSigno, Err, Nota, Tarjeta, useAvisa, useHacer } from "@/components/fiscal/ui";
import { Condiciones, Volver } from "@/components/patron/piezas";
import { aCentavos, condDe, enPesos, inv, leerCond, sumarDias, type Fila } from "@/lib/patron";

export function RondaForm({ ronda, ajustes, hoy }: { ronda: Fila | null; ajustes: Fila | null; hoy: string }) {
  const router = useRouter();
  const avisa = useAvisa();
  const { hacer, ocupado } = useHacer();
  const v: Fila = ronda || { tipo_tasa: "mensual", esquema: "unico", fecha_inicio: sumarDias(hoy, 3), fecha_vencimiento: sumarDias(hoy, 33), instrucciones: ajustes?.instrucciones ?? "" };
  const [nombre, setNombre] = useState<string>(v.nombre || "");
  const [descripcion, setDescripcion] = useState<string>(v.descripcion || "");
  const [meta, setMeta] = useState(enPesos(v.monto_meta));
  const [minimo, setMinimo] = useState(enPesos(v.monto_minimo));
  const [limite, setLimite] = useState<string>(v.fecha_limite || "");
  const [instrucciones, setInstrucciones] = useState<string>(v.instrucciones || "");
  const [cond, setCond] = useState(condDe(v));
  const [error, setError] = useState("");
  const atras = ronda ? `/inversion/rondas/${ronda.id}` : "/inversion/rondas";

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const min = minimo.trim() ? aCentavos(minimo) : null;
    if (minimo.trim() && min === null) { setError("El mínimo no se entiende como una cantidad."); return; }
    const cuerpo = {
      nombre: nombre.trim(), descripcion: descripcion.trim(), monto_meta: aCentavos(meta) ?? 0, monto_minimo: min,
      fecha_limite: limite || null, instrucciones: instrucciones.trim(), ...leerCond(cond, false),
    };
    const r = await hacer("guardar", () => (ronda ? inv(`/rondas/${ronda.id}`, { method: "PATCH", body: cuerpo }) : inv("/rondas", { body: cuerpo })), setError);
    if (r) { avisa("Ronda guardada."); router.push(`/inversion/rondas/${r.id}`); }
  };

  return (
    <>
      <Volver href={atras}>{ronda ? ronda.nombre : "Rondas"}</Volver>
      <Cab titulo={ronda ? "Editar la ronda" : "Nueva ronda"} />
      <Tarjeta>
        <form onSubmit={guardar} noValidate className="space-y-3" data-form-ronda>
          <Campo e="Nombre"><input name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} placeholder="Puente de octubre" className={CAJA} /></Campo>
          <Campo e={<>Para qué es <small className="font-normal">(lo lee quien invierte)</small></>}>
            <textarea name="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={2000} rows={3} placeholder="Tres semanas de nómina y materiales mientras se cobra la obra…" className={CAJA} />
          </Campo>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Campo e="Cuánto se quiere juntar"><ConSigno><input name="meta" inputMode="decimal" autoComplete="off" value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="90,000" className={CAJA} /></ConSigno></Campo>
            <Campo e={<>Mínimo para entrar <small className="font-normal">(opcional)</small></>}><ConSigno><input name="minimo" inputMode="decimal" autoComplete="off" value={minimo} onChange={(e) => setMinimo(e.target.value)} className={CAJA} /></ConSigno></Campo>
            <Campo e={<>Se puede entrar hasta <small className="font-normal">(opcional)</small></>}><input type="date" name="fecha_limite" value={limite} onChange={(e) => setLimite(e.target.value)} className={CAJA} /></Campo>
          </div>
          <div>
            <h3 className="text-sm font-medium text-ink-dim mt-2">Lo que se ofrece</h3>
            <Nota className="!mt-0.5 mb-2">Es la oferta de la ronda. Al aceptar a cada quien puedes darle condiciones distintas.</Nota>
            <Condiciones c={cond} cambia={setCond} sinMonto monto={1000000} ejemplo="por cada $10,000" />
          </div>
          <Campo e={<>A dónde depositar <small className="font-normal">(se le enseña a quien se le acepta la oferta)</small></>}>
            <textarea name="instrucciones" value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} maxLength={2000} rows={3} placeholder="Banco · CLABE · A nombre de…" className={CAJA} />
          </Campo>
          <Err>{error}</Err>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Link href={atras} className={B}>Cancelar</Link>
            <button className={B_PRI} disabled={ocupado === "guardar"} data-guardar-ronda>{ronda ? "Guardar" : "Guardar borrador"}</button>
          </div>
        </form>
      </Tarjeta>
    </>
  );
}
