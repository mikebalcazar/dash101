"use client";

/* Un préstamo sin ronda: alguien presta, se acuerda cómo se paga, y listo.
 * Viene de patron101 (`admin.js`, `A.prestamoNuevo`). */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { B, B_PRI, CAJA, LIGA, Cab, Campo, Err, Tarjeta, Vista, useAvisa, useCarga, useHacer } from "@/components/fiscal/ui";
import { Cerrado, Condiciones, INICIO, Volver, usePatron } from "@/components/patron/piezas";
import { condDe, inv, leerCond, type Fila } from "@/lib/patron";

function Forma({ dir, ajustes, hoy }: { dir: Fila[]; ajustes: Fila; hoy: string }) {
  const router = useRouter();
  const previo = useSearchParams().get("de") || "";
  const avisa = useAvisa();
  const { hacer, ocupado } = useHacer();
  const [quien, setQuien] = useState(dir.some((f) => f.id === previo) ? previo : "");
  const [cond, setCond] = useState(condDe({ tipo_tasa: "mensual", esquema: "parcialidades", frecuencia: "mensual", fecha_inicio: hoy }));
  const [instrucciones, setInstrucciones] = useState<string>(ajustes.instrucciones || "");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState("");
  const crear = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const cuerpo: Fila = { inversionista_id: quien, instrucciones: instrucciones.trim(), notas: notas.trim(), ...leerCond(cond) };
    cuerpo.monto = cuerpo.monto ?? 0;
    const r = await hacer("crear", () => inv("/prestamos", { body: cuerpo }), setError);
    if (r) { avisa(`Préstamo ${r.folio} creado.`); router.push(`/inversion/prestamos/${r.id}`); }
  };
  return (
    <Tarjeta>
      <form onSubmit={crear} noValidate className="space-y-3" data-form-prestamo>
        <Campo e="Quién presta" chico={<>¿No está? <Link href="/inversion/inversionistas" className={LIGA}>Dalo de alta</Link> primero.</>}>
          <select name="inversionista_id" value={quien} onChange={(e) => setQuien(e.target.value)} className={CAJA}>
            <option value="">Escoge…</option>
            {dir.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
        </Campo>
        <Condiciones c={cond} cambia={setCond} />
        <Campo e="A dónde deposita"><textarea name="instrucciones" value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} maxLength={2000} rows={3} className={CAJA} /></Campo>
        <Campo e={<>Notas internas <small className="font-normal">(quien presta no las ve)</small></>}><textarea name="notas" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={2000} rows={2} className={CAJA} /></Campo>
        <Err>{error}</Err>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Link href="/inversion/prestamos" className={B}>Cancelar</Link>
          <button className={B_PRI} disabled={ocupado === "crear"} data-crear-prestamo>Crear el préstamo</button>
        </div>
      </form>
    </Tarjeta>
  );
}

export default function PrestamoNuevoPage() {
  const { cerrado, hoy } = usePatron();
  const carga = useCarga<{ dir: Fila[]; ajustes: Fila }>(async () => {
    const [dir, ajustes] = await Promise.all([inv("/inversionistas"), inv("/ajustes")]);
    return { dir: (dir.filas as Fila[]).filter((f) => f.activo), ajustes };
  }, "prestamo-nuevo");
  if (cerrado) return <Cerrado por={cerrado} />;
  return (
    <Vista carga={carga} inicio={INICIO}>
      <Volver href="/inversion/prestamos">Préstamos</Volver>
      <Cab titulo="Préstamo directo" sub="Sin ronda: alguien presta, se acuerda cómo se paga, y listo." />
      {carga.d && <Suspense fallback={null}><Forma dir={carga.d.dir} ajustes={carga.d.ajustes} hoy={hoy} /></Suspense>}
    </Vista>
  );
}
