"use client";

/* Subir facturas: XML sueltos o un .zip con varios. El botón sirve en
 * cualquier pantalla de Fiscal; al terminar entrega los resultados para que
 * la pantalla enseñe el resumen donde quiera. */

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MOTIVO, subirFacturas, type ResultadoDeSubida } from "@/lib/bill";
import { Aviso, B, Lista, Nota, Ren, RenSub, RenTitulo, Tarjeta, LIGA, useAvisa } from "./ui";

export function BotonSubir({ texto = "Subir facturas", clase = B, alTerminar }: { texto?: string; clase?: string; alTerminar: (res: ResultadoDeSubida[]) => void | Promise<void> }) {
  const avisa = useAvisa();
  const router = useRouter();
  const [letrero, setLetrero] = useState("");
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <label className={`${clase} cursor-pointer`} data-subir>
      {letrero || texto}
      <input ref={entrada} type="file" accept=".xml,.zip,text/xml,application/xml,application/zip" multiple hidden
        onChange={async (ev) => {
          const archivos = [...(ev.target.files || [])];
          if (!archivos.length) return;
          setLetrero("Subiendo…");
          try {
            const res = await subirFacturas(archivos, (a, b) => setLetrero(`Subiendo ${a} de ${b}…`));
            await alTerminar(res);
          } catch (e) {
            const cual = (e as { cual?: string })?.cual;
            avisa(cual === "falta_rfc_empresa" ? "Falta el RFC de la empresa. Ponlo en Ajustes." : (e as Error).message, true);
            if (cual === "falta_rfc_empresa") router.push("/fiscal/ajustes");
          } finally {
            setLetrero("");
            if (entrada.current) entrada.current.value = "";
          }
        }} />
    </label>
  );
}

const s = (n: number, uno = "", varios = "s") => (n === 1 ? uno : varios);

export function ResumenDeSubida({ res }: { res: ResultadoDeSubida[] | null }) {
  if (!res) return null;
  const n = (q: string) => res.filter((x) => x.resultado === q).length;
  const malas = res.filter((x) => x.resultado === "rechazada");
  const ligadas = res.filter((x) => (x.ligada_a || []).length).length;
  const partes: string[] = [];
  if (n("nueva")) partes.push(`${n("nueva")} nueva${s(n("nueva"))}`);
  if (n("actualizada")) partes.push(`${n("actualizada")} que estaba${s(n("actualizada"), "", "n")} a mano y ya trae${s(n("actualizada"), "", "n")} su XML`);
  if (n("repetida")) partes.push(`${n("repetida")} que ya estaba${s(n("repetida"), "", "n")}`);
  return (
    <Tarjeta titulo="Lo que se subió" realce={!malas.length} id="resultado-subida" data-resultado-subida>
      <p className="text-sm text-ink-dim">
        {partes.join(" · ") || "Ninguna factura entró."}
        {ligadas ? ` · ${ligadas} se ligó sola con un movimiento que ya traía su folio fiscal` : ""}
      </p>
      {malas.length > 0 && (
        <>
          <Aviso tono="ojo" className="mt-3 !mb-1">{malas.length} no {malas.length === 1 ? "entró" : "entraron"}:</Aviso>
          <Lista>
            {malas.map((x, i) => (
              <Ren key={i} p={<><RenTitulo>{x.nombre || x.uuid || "archivo"}</RenTitulo><RenSub>{MOTIVO[x.motivo || ""] || x.motivo}</RenSub></>} />
            ))}
          </Lista>
        </>
      )}
      {n("nueva") > 0 && <Nota><Link href="/fiscal/ligar" className={LIGA}>Ver qué movimientos se les parecen</Link></Nota>}
    </Tarjeta>
  );
}
