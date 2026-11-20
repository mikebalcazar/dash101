"use client";

/* Ajustes de los préstamos: lo que se repite en cada ronda y en cada pagaré.
 * Viene de patron101 (`admin.js`, `A.ajustes`). */

import { useState } from "react";
import { B, B_PRI, CAJA, Cab, Campo, Err, Tarjeta, Vista, useAvisa, useCarga, useHacer } from "@/components/fiscal/ui";
import { Cerrado, INICIO, usePatron } from "@/components/patron/piezas";
import { inv, type Fila } from "@/lib/patron";

function Forma({ a, otra }: { a: Fila; otra: () => Promise<void> }) {
  const avisa = useAvisa();
  const { hacer, ocupado } = useHacer();
  const [instrucciones, setInstrucciones] = useState<string>(a.instrucciones || "");
  const [representante, setRepresentante] = useState<string>(a.representante || "");
  const [lugar, setLugar] = useState<string>(a.lugar || "");
  const [riesgos, setRiesgos] = useState<string>(a.riesgos || "");
  const [error, setError] = useState("");
  return (
    <Tarjeta>
      <form
        className="space-y-3" data-form-ajustes
        onSubmit={async (ev) => {
          ev.preventDefault();
          const r = await hacer("guardar", () => inv("/ajustes", { method: "PUT", body: { instrucciones: instrucciones.trim(), representante: representante.trim(), lugar: lugar.trim(), riesgos: riesgos.trim() } }), setError);
          if (r) { avisa("Ajustes guardados."); await otra(); }
        }}
      >
        <Campo e="A dónde se deposita" chico="Se copia a cada ronda nueva. Se le enseña sólo a quien ya se le aceptó una oferta.">
          <textarea name="instrucciones" value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} maxLength={2000} rows={3} placeholder="Banco · CLABE · A nombre de…" className={CAJA} />
        </Campo>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo e="Quién firma por la empresa"><input name="representante" value={representante} onChange={(e) => setRepresentante(e.target.value)} maxLength={160} className={CAJA} /></Campo>
          <Campo e="Lugar de firma y de pago"><input name="lugar" value={lugar} onChange={(e) => setLugar(e.target.value)} maxLength={160} placeholder="Ciudad de México" className={CAJA} /></Campo>
        </div>
        <Campo
          e={<>Aviso de riesgos <small className="font-normal">{a.riesgos_propio ? "(texto de tu empresa)" : "(texto base)"}</small></>}
          chico="Quien presta lo lee en cada ronda y tiene que aceptarlo para ofrecer; queda guardado qué texto aceptó y cuándo. También va impreso en el pagaré. Pídele a tu abogado que lo revise. Cambiarlo no toca lo que ya se aceptó."
        >
          <textarea name="riesgos" value={riesgos} onChange={(e) => setRiesgos(e.target.value)} rows={13} maxLength={6000} className={CAJA} />
        </Campo>
        <Err>{error}</Err>
        <div className="flex flex-wrap justify-end gap-2">
          {a.riesgos_propio && (
            <button
              type="button" className={B} disabled={!!ocupado} data-riesgos-base
              onClick={async () => {
                if (!window.confirm("¿Volver al texto base del aviso de riesgos? Se pierde el texto de tu empresa.")) return;
                const r = await hacer("base", () => inv("/ajustes", { method: "PUT", body: { riesgos: "" } }), setError);
                if (r) { avisa("Aviso de riesgos: texto base."); await otra(); }
              }}
            >Volver al texto base</button>
          )}
          <button className={B_PRI} disabled={ocupado === "guardar"}>Guardar</button>
        </div>
      </form>
    </Tarjeta>
  );
}

export default function AjustesDePrestamosPage() {
  const { cerrado } = usePatron();
  const carga = useCarga<Fila>(() => inv("/ajustes"), "ajustes");
  if (cerrado) return <Cerrado por={cerrado} />;
  return (
    <Vista carga={carga} inicio={INICIO}>
      <Cab titulo="Ajustes" sub="Lo que se repite en cada ronda y en cada pagaré." />
      {/* La llave rehace el formulario cuando llega el texto guardado (al volver al texto base). */}
      {carga.d && <Forma key={`${carga.d.riesgos_propio}:${String(carga.d.riesgos).length}`} a={carga.d} otra={carga.otra} />}
      <Tarjeta titulo="Cómo se hace la cuenta">
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-ink-dim">
          <li><b>Mensual:</b> la tasa es por mes. Un mes entero (del 8 al 8) cuenta como uno, tenga 28 o 31 días; los días sueltos se prorratean entre 30.</li>
          <li><b>Anual:</b> días reales entre 365.</li>
          <li><b>Fija:</b> la tasa es por todo el plazo, sin importar cuántos días sean.</li>
          <li><b>Parcialidades:</b> el capital en partes iguales y el interés sobre lo que se sigue debiendo.</li>
          <li>El préstamo arranca el día que marcas el depósito recibido. El plazo no pasa de 24 meses.</li>
        </ul>
      </Tarjeta>
    </Vista>
  );
}
