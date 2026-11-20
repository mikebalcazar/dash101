"use client";

/* El directorio: quien ya prestó y quien podría. A todos les llega el aviso
 * de una ronda nueva. Viene de patron101 (`admin.js`, `A.inversionistas`). */

import { useState } from "react";
import { B, B_PRI, CAJA, Aviso, Cab, Campo, Err, Et, Lista, Ren, RenMonto, RenSub, RenTitulo, Tarjeta, Vacio, Vista, useAvisa, useCarga, useHacer } from "@/components/fiscal/ui";
import { Cerrado, INICIO, usePatron } from "@/components/patron/piezas";
import { CamposPersona, leerPersona, personaDe } from "@/components/patron/persona";
import { inv, mensajeDe, pesosCorto, type Fila } from "@/lib/patron";

export default function InversionistasPage() {
  const { cerrado } = usePatron();
  const carga = useCarga<{ filas: Fila[] }>(() => inv("/inversionistas"), "inversionistas");
  const [alta, setAlta] = useState<"" | "uno" | "varios">("");
  if (cerrado) return <Cerrado por={cerrado} />;
  const filas = carga.d?.filas ?? [];
  const listo = async () => { setAlta(""); await carga.otra(); };
  return (
    <Vista carga={carga} inicio={INICIO}>
      <Cab titulo="Inversionistas" sub="Quien ya prestó y quien podría. A todos les llega el aviso de una ronda nueva.">
        <button className={B} onClick={() => setAlta(alta === "varios" ? "" : "varios")} data-ver="varios">Pegar una lista</button>
        <button className={B_PRI} onClick={() => setAlta(alta === "uno" ? "" : "uno")} data-ver="uno">Dar de alta</button>
      </Cab>
      {alta === "uno" && <AltaDeUno listo={listo} />}
      {alta === "varios" && <AltaDeVarios listo={listo} alTerminar={carga.otra} />}
      <Tarjeta>
        {filas.length ? (
          <Lista data-directorio>
            {filas.map((f) => (
              <Ren
                key={f.id} href={`/inversion/inversionistas/${f.id}`}
                p={<>
                  <RenTitulo>{f.nombre} {f.activo ? (f.es_prospecto ? <Et>Prospecto</Et> : <Et tono="bien">Inversionista</Et>) : <Et tono="mal">Inactivo</Et>}</RenTitulo>
                  <RenSub>{[f.correo, f.telefono].filter(Boolean).join(" · ") || "Sin contacto"}</RenSub>
                </>}
                m={f.capital_vigente || f.prestamos ? <>
                  {f.capital_vigente ? <RenMonto>{pesosCorto(f.capital_vigente)}</RenMonto> : null}
                  {f.prestamos ? <RenSub>{f.prestamos} préstamo{f.prestamos > 1 ? "s" : ""}</RenSub> : null}
                </> : undefined}
              />
            ))}
          </Lista>
        ) : <Vacio>El directorio está vacío. Da de alta a la primera persona, o pega una lista de nombres, correos y teléfonos.</Vacio>}
      </Tarjeta>
    </Vista>
  );
}

function AltaDeUno({ listo }: { listo: () => void }) {
  const avisa = useAvisa();
  const { hacer, ocupado } = useHacer();
  const [p, setP] = useState(personaDe());
  const [error, setError] = useState("");
  return (
    <Tarjeta titulo="Dar de alta" data-alta="uno">
      <form
        className="space-y-3"
        onSubmit={async (ev) => {
          ev.preventDefault();
          const r = await hacer("alta", () => inv("/inversionistas", { body: leerPersona(p) }), setError);
          if (r) { avisa(`${r.nombre} quedó en el directorio.`); listo(); }
        }}
      >
        <CamposPersona p={p} cambia={setP} />
        <Err>{error}</Err>
        <div className="flex justify-end"><button className={B_PRI} disabled={ocupado === "alta"} data-guardar-persona>Guardar</button></div>
      </form>
    </Tarjeta>
  );
}

/** Una persona por renglón: nombre, correo, teléfono. Se puede pegar directo
 *  de una hoja de cálculo. Lo que no entra se queda en la caja, con su por
 *  qué, para corregirlo y volver a intentar. */
function AltaDeVarios({ listo, alTerminar }: { listo: () => void; alTerminar: () => void }) {
  const avisa = useAvisa();
  const [lista, setLista] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<{ buenos: number; malos: string[] } | null>(null);
  const subir = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const renglones = lista.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!renglones.length) { setError("Pega al menos un renglón."); return; }
    setError(""); setOcupado(true);
    const malos: string[] = [];
    let buenos = 0;
    for (const l of renglones) {
      // El nombre va primero. De lo demás, lo que parece teléfono es el
      // teléfono y lo otro se manda como correo: si no lo es, la API lo
      // dice, en vez de que aquí se tire un dato en silencio.
      const [nombre = "", ...resto] = l.split(/\t|,|;/).map((x) => x.trim()).filter(Boolean);
      const esTelefono = (x: string) => !/[a-záéíóúñ@]/i.test(x) && x.replace(/\D/g, "").length >= 7;
      const telefono = resto.find(esTelefono) || "";
      const correo = resto.find((x) => !esTelefono(x)) || "";
      try { await inv("/inversionistas", { body: { nombre, correo, telefono } }); buenos += 1; } catch (e) { malos.push(`${l} → ${mensajeDe(e)}`); }
    }
    setOcupado(false);
    if (!malos.length) { avisa(`${buenos} persona${buenos === 1 ? "" : "s"} en el directorio.`); listo(); return; }
    setResultado({ buenos, malos });
    setLista(malos.map((m) => m.split(" → ")[0]).join("\n"));
    alTerminar();
  };
  return (
    <Tarjeta titulo="Pegar una lista" data-alta="varios">
      <form className="space-y-3" onSubmit={subir}>
        <Campo e="Una persona por renglón: nombre, correo, teléfono" chico="Separados por coma o tabulador (se puede pegar directo de una hoja de cálculo). El correo y el teléfono son opcionales.">
          <textarea name="lista" value={lista} onChange={(e) => setLista(e.target.value)} rows={6} placeholder={"Ana Robles, ana@correo.com, 55 1234 5678\nBeto Cruz, beto@correo.com"} className={CAJA} />
        </Campo>
        <Err>{error}</Err>
        {resultado && (
          <div data-resultado>
            <Aviso tono="ojo" className="!mb-2">Entraron {resultado.buenos}. Estos {resultado.malos.length} no:</Aviso>
            <p className="text-xs text-ink-dim whitespace-pre-wrap">{resultado.malos.join("\n")}</p>
          </div>
        )}
        <div className="flex justify-end"><button className={B_PRI} disabled={ocupado}>{ocupado ? "Dando de alta…" : "Dar de alta a todos"}</button></div>
      </form>
    </Tarjeta>
  );
}
