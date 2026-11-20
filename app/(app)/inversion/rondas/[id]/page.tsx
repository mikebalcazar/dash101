"use client";

/* Una ronda: su avance, lo que ofrece, sus ofertas y los préstamos que
 * salieron de ella. Viene de patron101 (`admin.js`, `A.ronda`).
 *
 * Aquí se abre, se avisa, se captura la oferta de alguien que avisó por otro
 * lado, y se acepta o rechaza cada oferta. Aceptar una crea su préstamo. */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { B, B_MAL, B_PRI, CAJA, CHICO, Aviso, Cab, Campo, ConSigno, Dato, Datos, Err, Et, Lista, Nota, RenMonto, RenSub, RenTitulo, Tarjeta, Vacio, Vista, useAvisa, useCarga, useHacer } from "@/components/fiscal/ui";
import { Avance, Cerrado, Condiciones, Estado, INICIO, RenPrestamo, Volver, usePatron } from "@/components/patron/piezas";
import { ESTADO_OFERTA, ESTADO_RONDA, MOTIVO_CORREO, aCentavos, anual, comoSePaga, condDe, dia, enPesos, inv, leerCond, momento, pesos, tasa, type Fila } from "@/lib/patron";

const PREGUNTA: Record<string, string | null> = {
  abrir: null,
  cerrar: "¿Cerrar la ronda? Ya no entrarán ofertas nuevas; lo aceptado sigue igual.",
  cancelar: "¿Cancelar la ronda? Las ofertas por revisar se rechazan. Los préstamos ya aceptados no se tocan.",
  borrar: "¿Borrar este borrador?",
  reabrir: null,
};

export default function RondaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { cerrado, otra: refrescarResumen } = usePatron();
  const avisa = useAvisa();
  const { hacer, ocupado } = useHacer();
  const carga = useCarga<Fila>(() => inv(`/rondas/${id}`), `ronda:${id}`);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"" | "avisar" | "capturar">("");
  const [oferta, setOferta] = useState<{ id: string; que: "aprobar" | "rechazar" } | null>(null);
  if (cerrado) return <Cerrado por={cerrado} />;
  const r = carga.d;
  const otraVez = async () => { setOferta(null); await carga.otra(); refrescarResumen(); };

  const accion = async (que: string) => {
    if (PREGUNTA[que] && !window.confirm(PREGUNTA[que]!)) return;
    const hecho = await hacer(que, () => (que === "borrar" ? inv(`/rondas/${id}`, { method: "DELETE" }) : inv(`/rondas/${id}/${que}`, { method: "POST" })), setError);
    if (hecho === undefined) return;
    if (que === "borrar") { router.push("/inversion/rondas"); return; }
    await otraVez();
    if (que === "abrir") { avisa("Ronda abierta. Ahora avisa a tu gente."); setPanel("avisar"); }
  };

  return (
    <Vista carga={carga} inicio={INICIO}>
      {r && (
        <div data-ronda={r.id} data-estado={r.estado}>
          <Volver href="/inversion/rondas">Rondas</Volver>
          <Cab sobre={r.folio} titulo={<>{r.nombre} <Estado mapa={ESTADO_RONDA} v={r.estado} /></>} sub={r.descripcion}>
            {r.estado === "borrador" && <>
              <Link href={`/inversion/rondas/${id}/editar`} className={B}>Editar</Link>
              <button className={B_PRI} disabled={!!ocupado} onClick={() => accion("abrir")} data-hacer="abrir">Abrir la ronda</button>
              <button className={B_MAL} disabled={!!ocupado} onClick={() => accion("borrar")} data-hacer="borrar">Borrar</button>
            </>}
            {r.estado === "abierta" && <>
              <button className={B_PRI} onClick={() => setPanel(panel === "avisar" ? "" : "avisar")} data-abrir-panel="avisar">Avisar</button>
              <Link href={`/inversion/rondas/${id}/editar`} className={B}>Editar</Link>
              <button className={B} disabled={!!ocupado} onClick={() => accion("cerrar")} data-hacer="cerrar">Cerrar</button>
              <button className={B_MAL} disabled={!!ocupado} onClick={() => accion("cancelar")} data-hacer="cancelar">Cancelar</button>
            </>}
            {r.estado === "cerrada" && <button className={B} disabled={!!ocupado} onClick={() => accion("reabrir")} data-hacer="reabrir">Reabrir</button>}
          </Cab>

          {r.origen?.app === "dash101" && (
            <Aviso>Nació del flujo proyectado{r.origen.deficit ? `: faltaban ${pesos(r.origen.deficit)}` : ""}{r.origen.desde ? ` entre el ${dia(r.origen.desde)} y el ${dia(r.origen.hasta)}` : ""}.</Aviso>
          )}
          {r.estado === "borrador" && <Aviso tono="ojo">Es un borrador: nadie de afuera lo ve. Revisa las condiciones y ábrela para poder avisar.</Aviso>}
          <Err>{error}</Err>

          {panel === "avisar" && r.estado === "abierta" && <Avisar id={id} />}

          <Tarjeta titulo="Avance" der={`${r.avance.porcentaje} %`}>
            <Avance pct={r.avance.porcentaje} />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-muted mt-2">
              <span><b className="text-ink-dim font-medium" data-juntado>{pesos(r.avance.juntado)}</b> aceptado de {pesos(r.monto_meta)}</span>
              <span>Faltan <b className="text-ink-dim font-medium">{pesos(r.avance.falta)}</b></span>
            </div>
            <div className="mt-3"><Datos>
              <Dato e="Ya recibido en la cuenta">{pesos(r.avance.recibido)}</Dato>
              <Dato e="Ofertas por revisar">{r.avance.ofertas_pendientes} · {pesos(r.avance.por_aprobar)}</Dato>
            </Datos></div>
          </Tarjeta>

          <Tarjeta titulo="Lo que se ofrece">
            <Datos>
              <Dato e="Rendimiento">{tasa(r.tipo_tasa, r.tasa_pb)}{r.tipo_tasa === "fija" && r.ejemplo?.plazo ? <small className="text-ink-muted"> ({r.ejemplo.plazo})</small> : null}</Dato>
              {anual(r) && <div data-tasa-anual className="min-w-0"><dt className="text-[11px] text-ink-muted">Equivale a una tasa anual de</dt><dd className="text-sm text-ink-dim">{anual(r)}</dd></div>}
              <Dato e="Cómo se paga">{comoSePaga(r)}</Dato>
              <Dato e="El dinero se necesita el">{dia(r.fecha_inicio)}</Dato>
              <Dato e="Mínimo para entrar">{r.monto_minimo ? pesos(r.monto_minimo) : "Sin mínimo"}</Dato>
              <Dato e="Se puede entrar hasta">{r.fecha_limite ? dia(r.fecha_limite) : "Sin fecha límite"}</Dato>
              {r.ejemplo && <Dato e="Por cada $10,000 regresan">{pesos(r.ejemplo.totales.total)}</Dato>}
            </Datos>
            {r.instrucciones
              ? <><Nota>A dónde depositar:</Nota><p className="text-sm text-ink-dim whitespace-pre-wrap">{r.instrucciones}</p></>
              : <Nota>Falta decir a dónde depositar (Editar).</Nota>}
          </Tarjeta>

          <Tarjeta titulo="Ofertas" der={r.estado === "abierta" ? <button className={`${B} ${CHICO}`} onClick={() => setPanel(panel === "capturar" ? "" : "capturar")} data-abrir-panel="capturar">Capturar una oferta</button> : undefined}>
            {panel === "capturar" && r.estado === "abierta" && <Capturar id={id} listo={async () => { setPanel(""); await otraVez(); }} />}
            {r.ofertas.length ? (
              <Lista data-ofertas>
                {r.ofertas.map((o: Fila) => {
                  const pend = o.estado === "pendiente";
                  const abierta = oferta?.id === o.id ? oferta!.que : "";
                  return (
                    <li key={o.id} data-oferta={o.id} data-estado={o.estado} className="py-2.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <RenTitulo>{o.inversionista_nombre} <Estado mapa={ESTADO_OFERTA} v={o.estado} /></RenTitulo>
                          <RenSub>{momento(o.creado_at)}{o.nota ? ` · «${o.nota}»` : ""}{o.motivo ? ` · ${o.motivo}` : ""}</RenSub>
                          <p className="text-[11px] text-ink-muted" data-riesgos={o.riesgos_aceptados_at ? "si" : "no"}>
                            {o.riesgos_aceptados_at ? `Aceptó los riesgos · ${momento(o.riesgos_aceptados_at)}` : "La capturaste tú: no aceptó los riesgos en pantalla (van en el pagaré)"}
                          </p>
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          {o.estado === "aprobada" && o.monto_aprobado !== o.monto
                            ? <><RenMonto>{pesos(o.monto_aprobado)}</RenMonto><RenSub>ofreció {pesos(o.monto)}</RenSub></>
                            : <RenMonto>{pesos(o.monto)}</RenMonto>}
                        </div>
                        {pend ? (
                          <div className="flex gap-2 shrink-0">
                            <button className={`${B_PRI} ${CHICO}`} onClick={() => setOferta(abierta === "aprobar" ? null : { id: o.id, que: "aprobar" })} data-oferta-hacer="aprobar">Aceptar</button>
                            <button className={`${B} ${CHICO}`} onClick={() => setOferta(abierta === "rechazar" ? null : { id: o.id, que: "rechazar" })} data-oferta-hacer="rechazar">Rechazar</button>
                          </div>
                        ) : o.prestamo_id ? <Link className={`${B} ${CHICO} shrink-0`} href={`/inversion/prestamos/${o.prestamo_id}`}>Préstamo</Link> : null}
                      </div>
                      {abierta === "rechazar" && <div className="mt-3"><Rechazar oferta={o} listo={otraVez} /></div>}
                      {abierta === "aprobar" && <div className="mt-3"><Aprobar oferta={o} ronda={r} listo={otraVez} /></div>}
                    </li>
                  );
                })}
              </Lista>
            ) : <Vacio>{r.estado === "borrador" ? "Las ofertas llegan cuando la ronda esté abierta." : "Todavía nadie ha dicho que le entra."}</Vacio>}
          </Tarjeta>

          <Tarjeta titulo="Préstamos de esta ronda">
            {r.prestamos.length ? <Lista>{r.prestamos.map((p: Fila) => <RenPrestamo key={p.id} p={p} />)}</Lista> : <Vacio>Cada oferta aceptada se vuelve un préstamo.</Vacio>}
          </Tarjeta>
        </div>
      )}
    </Vista>
  );
}

/* ─────────────── avisar de la ronda ─────────────── */

function Avisar({ id }: { id: string }) {
  const avisa = useAvisa();
  const { hacer, ocupado } = useHacer();
  const carga = useCarga<{ filas: Fila[] }>(() => inv(`/rondas/${id}/aviso`), `aviso:${id}`);
  const [marcados, setMarcados] = useState<Record<string, boolean> | null>(null);
  const [resultado, setResultado] = useState<Record<string, Fila>>({});
  const [error, setError] = useState("");
  const filas = carga.d?.filas ?? [];
  // Al llegar la lista se marca a quien tiene correo, quiere avisos y no ha ofrecido.
  const marca = marcados ?? Object.fromEntries(filas.map((f) => [f.id, !!(f.correo && f.recibe_avisos && !f.ya_ofrecio)]));

  const enviar = async () => {
    const escogidos = filas.filter((f) => marca[f.id]).map((f) => f.id);
    if (!escogidos.length) { setError("Marca al menos a una persona."); return; }
    const res = await hacer("avisar", () => inv(`/rondas/${id}/avisar`, { body: { a: escogidos } }), setError);
    if (!res) return;
    setResultado(Object.fromEntries(res.filas.map((f: Fila) => [f.id, f.correo_enviado])));
    avisa(res.enviados ? `${res.enviados} correo${res.enviados > 1 ? "s" : ""} enviado${res.enviados > 1 ? "s" : ""}.` : "No salió ningún correo.", !res.enviados);
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(String(filas[0].mensaje).replace(/^Hola, [^.]+\. /, "Hola. ")); avisa("Mensaje copiado."); }
    catch { avisa("El navegador no dejó copiar.", true); }
  };

  return (
    <Tarjeta titulo="Avisar de la ronda" realce data-panel-avisar>
      {carga.cargando && !carga.d ? <Vacio>Cargando…</Vacio> : carga.error ? <Err>{carga.error}</Err> : !filas.length ? (
        <Vacio>El directorio está vacío. Da de alta a tu gente en «Inversionistas».</Vacio>
      ) : (
        <>
          <Nota className="!mt-0 mb-2">El correo sale a quien marques. WhatsApp lo mandas tú: el botón abre el mensaje ya escrito.</Nota>
          <Lista>
            {filas.map((f) => (
              <li key={f.id} className="flex items-center gap-3 py-2.5">
                <input type="checkbox" data-avisar={f.id} checked={!!marca[f.id]} disabled={!f.correo} aria-label={`Correo a ${f.nombre}`}
                  onChange={(e) => setMarcados({ ...marca, [f.id]: e.target.checked })} className="w-4 h-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <RenTitulo>{f.nombre} {f.es_prospecto ? <Et>Prospecto</Et> : null}{f.ya_ofrecio ? <> <Et tono="bien">Ya ofreció</Et></> : null}</RenTitulo>
                  <p className="text-[11px] text-ink-muted break-words" data-resultado>
                    {resultado[f.id]
                      ? (resultado[f.id].enviado ? <span className="text-mint-900 font-medium">Correo enviado</span> : `No salió: ${MOTIVO_CORREO[resultado[f.id].motivo] || resultado[f.id].motivo}`)
                      : (f.correo || "Sin correo")}
                  </p>
                </div>
                {f.whatsapp && <a className={`${B} ${CHICO}`} href={f.whatsapp} target="_blank" rel="noopener">WhatsApp</a>}
              </li>
            ))}
          </Lista>
          <Err>{error}</Err>
          <div className="flex flex-wrap justify-end gap-2 mt-3">
            <button className={B} onClick={copiar} data-copiar>Copiar el mensaje</button>
            <button className={B_PRI} onClick={enviar} disabled={ocupado === "avisar"} data-enviar-aviso>Enviar correo</button>
          </div>
        </>
      )}
    </Tarjeta>
  );
}

/* ─────────────── capturar la oferta de alguien que avisó por otro lado ─────────────── */

function Capturar({ id, listo }: { id: string; listo: () => void }) {
  const { hacer, ocupado } = useHacer();
  const carga = useCarga<{ filas: Fila[] }>(() => inv("/inversionistas"), "directorio");
  const [quien, setQuien] = useState("");
  const [monto, setMonto] = useState("");
  const [error, setError] = useState("");
  const activos = (carga.d?.filas ?? []).filter((f) => f.activo);
  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const res = await hacer("oferta", () => inv(`/rondas/${id}/ofertas`, { body: { inversionista_id: quien, monto: aCentavos(monto) ?? 0 } }), setError);
    if (res) listo();
  };
  return (
    <form onSubmit={guardar} className="rounded-xl bg-cream/60 p-3 mb-3 space-y-3" data-panel-capturar>
      <p className="text-sm font-medium text-ink-dim">Capturar una oferta</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo e="De quién">
          <select name="inversionista_id" value={quien} onChange={(e) => setQuien(e.target.value)} className={CAJA}>
            <option value="">Escoge…</option>
            {activos.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
        </Campo>
        <Campo e="Con cuánto"><ConSigno><input name="monto" inputMode="decimal" autoComplete="off" value={monto} onChange={(e) => setMonto(e.target.value)} className={CAJA} /></ConSigno></Campo>
      </div>
      <Err>{error || carga.error}</Err>
      <div className="flex flex-wrap justify-end gap-2">
        <Link href="/inversion/inversionistas" className={`${B} ${CHICO}`}>Dar de alta a alguien</Link>
        <button className={B_PRI} disabled={ocupado === "oferta"} data-guardar-oferta>Guardar la oferta</button>
      </div>
    </form>
  );
}

/* ─────────────── aceptar o rechazar una oferta ─────────────── */

function Rechazar({ oferta, listo }: { oferta: Fila; listo: () => void }) {
  const { hacer, ocupado } = useHacer();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="rounded-xl bg-cream/60 p-3 space-y-3" data-panel-oferta="rechazar"
      onSubmit={async (ev) => {
        ev.preventDefault();
        const res = await hacer("rechazar", () => inv(`/ofertas/${oferta.id}/rechazar`, { body: { motivo: motivo.trim() } }), setError);
        if (res) listo();
      }}
    >
      <p className="text-sm font-medium text-ink-dim">Rechazar la oferta de {oferta.inversionista_nombre}</p>
      <Campo e={<>Motivo <small className="font-normal">(se le manda por correo)</small></>}>
        <textarea name="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={2} placeholder="Ya se juntó lo que hacía falta." className={CAJA} />
      </Campo>
      <Err>{error}</Err>
      <div className="flex justify-end"><button className={B_MAL} disabled={ocupado === "rechazar"}>Rechazar</button></div>
    </form>
  );
}

function Aprobar({ oferta, ronda, listo }: { oferta: Fila; ronda: Fila; listo: () => void }) {
  const avisa = useAvisa();
  const { hacer, ocupado } = useHacer();
  const [monto, setMonto] = useState(enPesos(oferta.monto));
  const [otras, setOtras] = useState(false);
  const [cond, setCond] = useState(condDe(ronda));
  const [error, setError] = useState("");
  return (
    <form
      className="rounded-xl bg-cream/60 p-3 space-y-3" data-panel-oferta="aprobar"
      onSubmit={async (ev) => {
        ev.preventDefault();
        const cuerpo: Fila = { monto_aprobado: aCentavos(monto) ?? 0 };
        if (otras) cuerpo.condiciones = leerCond(cond, false);
        const res = await hacer("aprobar", () => inv(`/ofertas/${oferta.id}/aprobar`, { body: cuerpo }), setError);
        if (res) { avisa(`Aceptada. Nació el préstamo ${res.prestamo.folio}.`); listo(); }
      }}
    >
      <p className="text-sm font-medium text-ink-dim">Aceptar a {oferta.inversionista_nombre}</p>
      <Campo e="Monto que se le acepta" chico={`Ofreció ${pesos(oferta.monto)}. Faltan ${pesos(ronda.avance.falta)} para la meta.`}>
        <ConSigno><input name="monto_aprobado" inputMode="decimal" autoComplete="off" value={monto} onChange={(e) => setMonto(e.target.value)} className={CAJA} /></ConSigno>
      </Campo>
      <label className="flex items-center gap-2 text-sm text-ink-dim"><input type="checkbox" name="otras" checked={otras} onChange={(e) => setOtras(e.target.checked)} className="w-4 h-4" /> Darle condiciones distintas a las de la ronda</label>
      {/* Los campos se esconden; la tabla que resulta se queda a la vista. */}
      <Condiciones c={cond} cambia={setCond} sinMonto monto={aCentavos(monto) || 0} soloTabla={!otras} />
      <Err>{error}</Err>
      <div className="flex justify-end"><button className={B_PRI} disabled={ocupado === "aprobar"} data-aceptar-oferta>Aceptar y crear el préstamo</button></div>
    </form>
  );
}
