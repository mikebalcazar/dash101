"use client";

/* Fiscal · SAT: la FIEL de la empresa y lo que se baja solo.
 *
 * Mike, 8-oct-2026: «revisar facturas ya recibidas y emitidas en el SAT»; y
 * con botones: la FIEL vive guardada cifrada, se sube una vez y se baja solo
 * cada noche.
 *
 * Lo que se ve aquí lo decide la API (`/fiscal/sat`): la pantalla no sabe
 * de firmas ni de paquetes. Sube tres cosas —.cer, .key y contraseña— y
 * después sólo pregunta en qué va. La contraseña sale del teléfono una vez,
 * cifrada en el camino (https), y la API la suelta en cuanto abre la llave:
 * ni se guarda ni vuelve a pedirse. */

import { useEffect, useRef, useState } from "react";
import { cuando, dia, fis, mensajeDe, type Fila } from "@/lib/bill";
import { Aviso, B, B_MAL, B_PRI, CAJA, Cab, Campo, Dato, Datos, Err, Et, Lista, Nota, Tarjeta, Vista, useAvisa, useCarga, useHacer, type Tono } from "@/components/fiscal/ui";

const ESTADO: Record<string, [string, Tono]> = {
  por_pedir: ["Por pedir", ""], pedida: ["El SAT la está preparando", "ojo"], lista: ["Bajando", "azul"], importando: ["Guardando facturas", "azul"],
  terminada: ["Terminada", "bien"], vacia: ["Sin facturas en ese periodo", ""], rechazada: ["El SAT la rechazó", "mal"], error: ["Falló", "mal"],
  vencida: ["El SAT nunca la terminó", "mal"], partida: ["Se partió en dos", ""], cancelada: ["Cancelada", ""],
};
const LADO: Record<string, string> = { emitidas: "Emitidas", recibidas: "Recibidas" };
const CLASE: Record<string, string> = { cfdi: "los XML", metadata: "la lista (vigentes y canceladas)" };
const MOTIVO: Record<string, string> = { inicial: "primera vez", noche: "de noche, sola", mano: "a mano", faltantes: "las que faltaban", partida: "una mitad" };
const fecha = (s: unknown) => (s ? dia(String(s).slice(0, 10)) : "");
const EN_CAMINO = ["por_pedir", "pedida", "lista", "importando"];

function Solicitud({ s }: { s: Fila }) {
  const [texto, tono] = ESTADO[s.estado] || [s.estado, ""];
  const cuenta: string[] = [];
  if (s.nuevas) cuenta.push(`${s.nuevas} nuevas`);
  if (s.actualizadas) cuenta.push(`${s.actualizadas} actualizadas`);
  if (s.repetidas) cuenta.push(`${s.repetidas} que ya estaban`);
  if (s.rechazadas) cuenta.push(`${s.rechazadas} que no entraron`);
  if (s.canceladas) cuenta.push(`${s.canceladas} canceladas aquí`);
  if (s.revisadas && s.clase === "metadata") cuenta.push(`${s.revisadas} revisadas`);
  if (s.faltantes) cuenta.push(`${s.faltantes} que faltan`);
  const detalle = s.estado === "rechazada" || s.estado === "error" ? (s.mensaje ? ` · ${s.mensaje}${s.codigo ? ` (${s.codigo})` : ""}` : "") : "";
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium text-ink-dim">{LADO[s.lado] || s.lado} · {CLASE[s.clase] || s.clase}</p>
        <p className="text-[11px] text-ink-muted">{fecha(s.desde)} → {fecha(s.hasta)} · {MOTIVO[s.motivo] || s.motivo}{s.cuantas != null && s.clase === "cfdi" ? ` · ${s.cuantas} en el SAT` : ""}</p>
        {(cuenta.length > 0 || detalle) && <p className="text-[11px] text-ink-muted">{cuenta.join(", ")}{detalle}</p>}
      </div>
      <div className="text-right shrink-0 space-y-0.5"><Et tono={tono}>{texto}</Et><p className="text-[11px] text-ink-muted">{cuando(s.terminada_at || s.actualizada_at)}</p></div>
    </li>
  );
}

function FormaFiel({ hayFiel, alCancelar, despues }: { hayFiel: boolean; alCancelar: () => void; despues: () => void }) {
  const avisa = useAvisa();
  const cer = useRef<HTMLInputElement>(null), key = useRef<HTMLInputElement>(null);
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  return (
    <form id="f-fiel" className="space-y-3 mt-3" onSubmit={async (ev) => {
      ev.preventDefault();
      const c = cer.current?.files?.[0], k = key.current?.files?.[0];
      if (!c || !k) { setError("Faltan los dos archivos: el .cer y el .key."); return; }
      if (c.size > 16384 || k.size > 16384) { setError("Esos archivos son demasiado grandes para ser una FIEL. ¿Escogiste los correctos?"); return; }
      if (/\.key$/i.test(c.name) || /\.cer$/i.test(k.name)) { setError("Van al revés: el .cer en «Certificado» y el .key en «Llave privada»."); return; }
      const forma = new FormData();
      forma.set("cer", c); forma.set("key", k); forma.set("clave", clave);
      setOcupado(true); setError("");
      try {
        const r = await fis("/sat/fiel", { method: "PUT", body: forma });
        avisa(`FIEL de ${r.fiel.rfc} guardada. Ya se le está pidiendo al SAT.`);
        despues();
      } catch (e) { setError(mensajeDe(e)); } finally { setClave(""); setOcupado(false); }
    }}>
      <Aviso className="!mb-0">Son tres cosas: el certificado (<b>.cer</b>), la llave privada (<b>.key</b>) y su contraseña. <b>Es la FIEL, no el sello (CSD)</b>: el sello sirve para timbrar, no para bajar del SAT. La contraseña se usa una sola vez para abrir la llave y no se guarda.</Aviso>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo e="Certificado (.cer)"><input ref={cer} className={CAJA} type="file" name="cer" accept=".cer,application/x-x509-ca-cert,application/octet-stream" required /></Campo>
        <Campo e="Llave privada (.key)"><input ref={key} className={CAJA} type="file" name="key" accept=".key,application/octet-stream" required /></Campo>
      </div>
      <Campo e="Contraseña de la llave"><input className={CAJA} type="password" name="clave" autoComplete="off" required value={clave} onChange={(e) => setClave(e.target.value)} /></Campo>
      <Err>{error}</Err>
      <div className="flex justify-end gap-2">
        {hayFiel && <button type="button" className={B} id="b-cancelar-fiel" onClick={alCancelar}>Cancelar</button>}
        <button className={B_PRI} id="b-fiel" disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar la FIEL"}</button>
      </div>
    </form>
  );
}

export default function SatPage() {
  const avisa = useAvisa();
  const { hacer, ocupado } = useHacer();
  const carga = useCarga<Fila>(() => fis("/sat"), "sat");
  const [otraFiel, setOtraFiel] = useState(false);
  const e = carga.d;
  const otra = () => { setOtraFiel(false); void carga.otra(); };
  const activas = (e?.solicitudes || []).filter((s: Fila) => EN_CAMINO.includes(s.estado));

  // Mientras hay algo en camino, la pantalla se refresca sola cada medio minuto.
  const hayActivas = activas.length > 0;
  const { otra: refrescar } = carga;
  useEffect(() => {
    if (!hayActivas) return;
    const t = setInterval(() => void refrescar(), 30_000);
    return () => clearInterval(t);
  }, [hayActivas, refrescar]);

  const f = e?.fiel;
  const vence = f ? (f.dias_para_vencer < 0 ? "ya venció" : f.dias_para_vencer < 60 ? `vence en ${f.dias_para_vencer} días` : `vence el ${fecha(f.vence)}`) : "";
  return (
    <Vista carga={carga}>
      {e && (
        <>
          <Cab titulo="El SAT" sub="Las facturas que la empresa emitió y recibió, bajadas directo del SAT con su FIEL.">
            {f && e.puede_bajar && (
              <button type="button" className={B_PRI} id="b-bajar" disabled={e.trabajando || ocupado === "bajar"} onClick={async () => {
                const r = await hacer("bajar", () => fis("/sat/bajar", { method: "POST" }));
                if (r) { avisa(r.ya_trabajando ? "Ya estaba en camino; se le dio prisa." : "Pedido al SAT. Tarda de minutos a horas."); otra(); }
              }}>{e.trabajando ? "Bajando…" : "Bajar ahora"}</button>
            )}
          </Cab>
          {e.ultimo_error && <Aviso tono="ojo" data-error-sat><b>Lo último que pasó:</b> {e.ultimo_error} <small>({cuando(e.ultimo_error_at)})</small></Aviso>}

          <Tarjeta titulo="La FIEL (e.firma) de la empresa" der={f ? vence : undefined} id="t-fiel">
            {f ? (
              <>
                <Datos>
                  <Dato e="De">{f.nombre || ""} · {f.rfc}</Dato>
                  <Dato e="Número de serie">{f.serie}</Dato>
                  <Dato e="Vale">del {fecha(f.vale_desde)} al {fecha(f.vence)}{f.dias_para_vencer < 60 ? <> <Et tono={f.dias_para_vencer < 0 ? "mal" : "ojo"}>{f.dias_para_vencer < 0 ? "Vencida" : "Por vencer"}</Et></> : null}</Dato>
                  <Dato e="Subida">{cuando(f.subida_at)}</Dato>
                </Datos>
                <Nota>Está guardada cifrada. Ni la llave ni la contraseña se pueden ver desde aquí ni desde ninguna otra parte. {f.dias_para_vencer < 60 ? "Cuando la renueves en el SAT, súbela otra vez aquí." : ""}</Nota>
                {e.puede_subir_fiel && !otraFiel && (
                  <div className="flex justify-end gap-2 mt-3">
                    <button type="button" className={B} id="b-otra" onClick={() => setOtraFiel(true)}>Subir otra</button>
                    <button type="button" className={B_MAL} id="b-quitar" disabled={ocupado === "quitar"} onClick={async () => {
                      if (!confirm("¿Quitar la FIEL? Se deja de bajar del SAT y lo que esté en camino se cancela. Las facturas que ya bajaron se quedan.")) return;
                      const r = await hacer("quitar", () => fis("/sat/fiel", { method: "DELETE" }));
                      if (r) { avisa("FIEL quitada."); otra(); }
                    }}>Quitar la FIEL</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-ink-dim mb-3">Con la FIEL se le piden al SAT las facturas de la empresa —las que emitió y las que recibió, desde el {fecha(e.desde)}— y se bajan solas, cada noche. Sin ella, las facturas entran subiendo su XML.</p>
                {!e.puede_subir_fiel && <Aviso>La FIEL la sube quien dirige la empresa.</Aviso>}
              </>
            )}
            {e.puede_subir_fiel && (!f || otraFiel) && <FormaFiel hayFiel={!!f} alCancelar={() => setOtraFiel(false)} despues={otra} />}
          </Tarjeta>

          {f && (
            <>
              <Tarjeta titulo="Cada noche">
                <label className="flex items-center gap-2.5 text-sm text-ink-dim">
                  <input type="checkbox" id="c-auto" checked={!!e.automatico} disabled={!e.puede_bajar || ocupado === "auto"}
                    onChange={async (ev) => {
                      const r = await hacer("auto", () => fis("/sat/config", { method: "PUT", body: { automatico: ev.target.checked } }));
                      if (r) otra();
                    }} />
                  <span>Bajar solo, cada noche{e.proxima_noche_at ? ` · la siguiente, ${cuando(e.proxima_noche_at)}` : ""}</span>
                </label>
                <Nota>Cada vez pide lo nuevo desde donde se quedó (menos tres días, porque el SAT tarda en enseñar lo recién timbrado) y la lista completa desde el {fecha(e.desde)}: una factura cancelada en el SAT se cancela aquí, y una que falte se pide.</Nota>
                <Nota>Cubierto hasta: emitidas {e.cubierto_hasta?.emitidas ? fecha(e.cubierto_hasta.emitidas) : "—"} · recibidas {e.cubierto_hasta?.recibidas ? fecha(e.cubierto_hasta.recibidas) : "—"} · {e.facturas_del_sat} facturas vienen del SAT.</Nota>
              </Tarjeta>

              <Tarjeta titulo="Lo pedido al SAT" der={activas.length ? `${activas.length} en camino` : undefined} id="t-solicitudes">
                {e.solicitudes?.length ? <Lista>{e.solicitudes.map((s: Fila, i: number) => <Solicitud key={s.id ?? i} s={s} />)}</Lista> : <p className="text-[11px] text-ink-muted">Todavía no se le ha pedido nada.</p>}
                <Nota>El SAT no contesta en el momento: acepta la petición y la prepara —de minutos a horas—. Aquí se vuelve a preguntar solo; no hace falta dejar esta pantalla abierta.</Nota>
              </Tarjeta>
            </>
          )}

          <Tarjeta titulo="Qué se pide y qué no">
            <ul className="text-[11px] text-ink-muted list-disc pl-4 space-y-1">
              <li>Emitidas y recibidas, desde el {fecha(e.desde)}. Vigentes como XML completo; las canceladas sólo en la lista.</li>
              <li>Una factura que ya estaba aquí (subida a mano) no se duplica: se reconoce por su folio fiscal.</li>
              <li>Cada periodo sólo se le puede pedir al SAT dos veces en la vida: nunca se repite uno.</li>
              <li>Esto no timbra ni cancela nada: sólo lee.</li>
            </ul>
          </Tarjeta>
        </>
      )}
    </Vista>
  );
}
