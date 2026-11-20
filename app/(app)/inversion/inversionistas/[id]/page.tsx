"use client";

/* Una persona del directorio: lo que tiene prestado, sus préstamos y sus
 * datos. Viene de patron101 (`admin.js`, `A.inversionista`). */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { B, B_MAL, B_PRI, Cab, Cifra, Cifras, Err, Et, Lista, Nota, Tarjeta, Vacio, Vista, useAvisa, useCarga, useHacer } from "@/components/fiscal/ui";
import { Cerrado, INICIO, RenPrestamo, Volver, usePatron } from "@/components/patron/piezas";
import { CamposPersona, leerPersona, personaDe, type Persona } from "@/components/patron/persona";
import { hostDePatron } from "@/lib/inversion";
import { dia, inv, pesosCorto, type Fila } from "@/lib/patron";

export default function InversionistaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { cerrado } = usePatron();
  const avisa = useAvisa();
  const { hacer, ocupado } = useHacer();
  const carga = useCarga<Fila>(() => inv(`/inversionistas/${id}`), `inversionista:${id}`);
  const [editada, setEditada] = useState<Persona | null>(null);
  const [activo, setActivo] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  if (cerrado) return <Cerrado por={cerrado} />;
  const d = carga.d;
  return (
    <Vista carga={carga} inicio={INICIO}>
      {d && (() => {
        const f = d.inversionista, r = d.resumen;
        const p = editada ?? personaDe(f);
        const vivo = activo ?? !!f.activo;
        // Quien presta entra por patron101, no por dash101.
        const casa = typeof window === "undefined" ? "patron.suite101.app" : hostDePatron(window.location.host);
        return (
          <div data-inversionista={f.id}>
            <Volver href="/inversion/inversionistas">Inversionistas</Volver>
            <Cab titulo={<>{f.nombre} {f.activo ? null : <Et tono="mal">Inactivo</Et>}</>} sub={[f.correo, f.telefono].filter(Boolean).join(" · ") || "Sin contacto"}>
              <Link href={`/inversion/prestamos/nuevo?de=${f.id}`} className={B}>Préstamo directo</Link>
            </Cab>
            <Cifras>
              <Cifra principal e="Tiene prestado" v={pesosCorto(r.invertido)} d={`${r.prestamos_activos} activo${r.prestamos_activos === 1 ? "" : "s"}`} />
              <Cifra e="Se le va a pagar" v={pesosCorto(r.por_recibir)} d="capital más interés" />
              <Cifra e="Interés ya pagado" v={pesosCorto(r.interes_ganado)} />
              <Cifra e="Próximo pago" v={r.proximo ? pesosCorto(r.proximo.total) : "—"} d={r.proximo ? dia(r.proximo.fecha) : undefined} />
            </Cifras>
            <Tarjeta titulo="Sus préstamos">
              {d.prestamos.length
                ? <Lista>{d.prestamos.map((x: Fila) => <RenPrestamo key={x.id} p={x} nombre={x.ronda_nombre || "Préstamo directo"} />)}</Lista>
                : <Vacio>Todavía no ha prestado: es prospecto.</Vacio>}
            </Tarjeta>
            <Tarjeta titulo="Sus datos">
              <form
                className="space-y-3" data-form-persona
                onSubmit={async (ev) => {
                  ev.preventDefault();
                  const res = await hacer("guardar", () => inv(`/inversionistas/${id}`, { method: "PATCH", body: { ...leerPersona(p), activo: vivo } }), setError);
                  if (res) { avisa("Datos guardados."); setEditada(null); setActivo(null); await carga.otra(); }
                }}
              >
                <CamposPersona p={p} cambia={setEditada} />
                <label className="flex items-center gap-2 text-sm text-ink-dim">
                  <input type="checkbox" name="activo" checked={vivo} onChange={(e) => setActivo(e.target.checked)} className="w-4 h-4" /> Activo <small className="text-ink-muted">(si se apaga, ya no entra ni recibe avisos)</small>
                </label>
                <Nota>{f.correo ? `Entra en ${casa} con ${f.correo}. La primera vez escoge «No tengo contraseña o la olvidé» y le llega un código.` : "Sin correo no puede entrar a ver su estado de cuenta."}</Nota>
                <Err>{error}</Err>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button" className={B_MAL} disabled={!!ocupado} data-borrar
                    onClick={async () => {
                      if (!window.confirm(`¿Borrar a ${f.nombre} del directorio?`)) return;
                      const res = await hacer("borrar", () => inv(`/inversionistas/${id}`, { method: "DELETE" }), setError);
                      if (res !== undefined) router.push("/inversion/inversionistas");
                    }}
                  >Borrar</button>
                  <button className={B_PRI} disabled={ocupado === "guardar"}>Guardar</button>
                </div>
              </form>
            </Tarjeta>
          </div>
        );
      })()}
    </Vista>
  );
}
