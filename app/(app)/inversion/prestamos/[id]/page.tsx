"use client";

/* Un préstamo: lo que se debe, su tabla de pagos, sus papeles y su historia.
 * Viene de patron101 (`admin.js`, `A.prestamo`).
 *
 * Los PAGOS se registran en «Inicio» de Préstamos, donde sale el dinero
 * (decisión de Mike con botones, 8-oct-2026: «un solo lugar de captura»);
 * aquí se ven. Lo que sí se hace aquí: marcar el depósito recibido, cambiar
 * lo acordado antes de que arranque, editar la tabla a mano y guardar los
 * papeles. */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { B, B_MAL, B_PRI, CAJA, CHICO, LIGA, Aviso, Cab, Campo, Cifra, Cifras, Dato, Err, Et, Nota, Tabla, Tarjeta, Vista, useAvisa, useCarga, useHacer } from "@/components/fiscal/ui";
import { Bitacora, BotonSubir, Cerrado, Condiciones, Estado, INICIO, Papeles, TablaDePagos, Volver, usePatron } from "@/components/patron/piezas";
import { descargarPagare } from "@/lib/pagare";
import { ESTADO_PRESTAMO, aCentavos, comoSePaga, condDe, cuentasDeLaEmpresa, dia, enPesos, falta, inv, leerCond, ligaArchivo, pesos, pesosCorto, tasa, type Fila } from "@/lib/patron";

export default function PrestamoPage() {
  const { id } = useParams<{ id: string }>();
  const { cerrado, hoy, otra: refrescarResumen } = usePatron();
  const avisa = useAvisa();
  const { hacer, ocupado } = useHacer();
  const carga = useCarga<Fila>(() => inv(`/prestamos/${id}`), `prestamo:${id}`);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"" | "recibido" | "condiciones" | "cancelar">("");
  const [editando, setEditando] = useState(false);
  const [notas, setNotas] = useState<string | null>(null);
  if (cerrado) return <Cerrado por={cerrado} />;
  const p = carga.d;
  const otraVez = async () => { setPanel(""); setEditando(false); await carga.otra(); refrescarResumen(); };

  return (
    <Vista carga={carga} inicio={INICIO}>
      {p && (() => {
        const s = p.resumen;
        const quien = p.inversionista;
        const porDepositar = p.estado === "por_depositar";
        const vivo = porDepositar || p.estado === "activo";
        const comprobante = (p.archivos || []).find((a: Fila) => a.clase === "comprobante_deposito");
        return (
          <div data-prestamo={p.id} data-estado={p.estado}>
            <p className="text-xs mb-2 text-ink-muted">
              <Link href="/inversion/prestamos" className="hover:text-ink-dim">‹ Préstamos</Link>
              {p.ronda && <> · <Link href={`/inversion/rondas/${p.ronda.id}`} className="hover:text-ink-dim">{p.ronda.nombre}</Link></>}
            </p>
            <Cab
              sobre={p.folio}
              titulo={<>{pesosCorto(p.monto)} · <Link href={`/inversion/inversionistas/${quien.id}`} className={LIGA}>{quien.nombre}</Link> <Estado mapa={ESTADO_PRESTAMO} v={p.estado} /></>}
              sub={<>{tasa(p.tipo_tasa, p.tasa_pb)} · {comoSePaga({ ...p, num_pagos: s.pagos_total })}{p.tabla_editada ? <> · <Et tono="ojo">Tabla editada a mano</Et></> : null}</>}
            >
              <button className={B} disabled={ocupado === "pagare"} onClick={() => hacer("pagare", () => descargarPagare(p), setError)} data-pagare>Pagaré en PDF</button>
            </Cab>
            <Err>{error}</Err>

            {porDepositar && (
              <Tarjeta titulo="Esperando el depósito" realce data-por-depositar>
                <p className="text-sm text-ink-dim mb-3">
                  {comprobante
                    ? <>{quien.nombre} ya subió su comprobante: <a href={ligaArchivo(comprobante.id)} target="_blank" rel="noopener" className={LIGA}>verlo</a>. Revisa que el dinero esté en la cuenta y márcalo.</>
                    : "Cuando el dinero esté en la cuenta, márcalo recibido: ese día arranca el préstamo y sus intereses, y entra el ingreso a la cuenta."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button className={B_PRI} onClick={() => setPanel(panel === "recibido" ? "" : "recibido")} data-panel="recibido">Marcar recibido</button>
                  <button className={B} onClick={() => setPanel(panel === "condiciones" ? "" : "condiciones")} data-panel="condiciones">Cambiar condiciones</button>
                  <button className={B_MAL} onClick={() => setPanel(panel === "cancelar" ? "" : "cancelar")} data-panel="cancelar">Cancelar el préstamo</button>
                </div>
                {panel === "recibido" && <Recibido p={p} hoy={hoy} listo={async () => { avisa("Depósito recibido. El préstamo ya arrancó."); await otraVez(); }} />}
                {panel === "condiciones" && <CambiarCondiciones p={p} listo={async () => { avisa("Condiciones guardadas."); await otraVez(); }} />}
                {panel === "cancelar" && <Cancelar p={p} listo={otraVez} />}
              </Tarjeta>
            )}

            {p.estado !== "cancelado" && (
              <Cifras>
                <Cifra principal e="Capital que se debe" v={pesosCorto(s.capital_pendiente)} d={`de ${pesosCorto(p.monto)}`} />
                <Cifra e="Interés por pagar" v={pesosCorto(s.interes_pendiente)} d={`de ${pesosCorto(s.interes_total)}`} />
                <Cifra e="Ya pagado" v={pesosCorto(s.capital_pagado + s.interes_pagado)} d={`${s.pagos_hechos} de ${s.pagos_total} pagos`} />
                <Cifra e="Próximo pago" v={s.proximo ? pesosCorto(s.proximo.total) : "—"} d={s.proximo ? `${dia(s.proximo.fecha)}${p.estado === "activo" ? ` · ${falta(s.proximo.fecha, hoy)}` : ""}` : undefined} />
              </Cifras>
            )}

            <Tarjeta titulo="Tabla de pagos" der={vivo ? <button className={`${B} ${CHICO}`} onClick={() => setEditando(!editando)} data-editar-tabla>{editando ? "Cerrar" : "Editar la tabla"}</button> : undefined}>
              {editando
                ? <EditorDeTabla p={p} alCerrar={() => setEditando(false)} listo={async () => { avisa("Tabla guardada."); await otraVez(); }} />
                : <TablaDePagos prestamo={p} hoy={hoy} accion={(g) => (g.estado === "pagado" ? <BotonSubir chico texto="+ Comprobante" datos={{ prestamo_id: p.id, pago_id: g.id, clase: "comprobante_pago" }} listo={otraVez} /> : null)} />}
              {p.estado === "activo" && <Nota>Los pagos se registran en <Link href="/inversion" className={LIGA}>Inicio</Link>, donde sale el dinero. Aquí se reflejan solos.</Nota>}
              {porDepositar && <Nota>Las fechas son estimadas: se ajustan solas al día en que marques el depósito recibido.</Nota>}
            </Tarjeta>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-4">
              <Tarjeta titulo="Papeles">
                <Papeles prestamo={p} listo={otraVez} />
                <div className="flex flex-wrap gap-2 mt-3">
                  <BotonSubir texto="Subir pagaré firmado" datos={{ prestamo_id: p.id, clase: "contrato_firmado" }} listo={otraVez} />
                  <BotonSubir texto="Subir comprobante del depósito" datos={{ prestamo_id: p.id, clase: "comprobante_deposito" }} listo={otraVez} />
                </div>
                <Nota>El pagaré en PDF es un texto base: que lo revise tu abogado antes de usarlo. Se firma a mano y se sube aquí.</Nota>
              </Tarjeta>
              <Tarjeta titulo="Para pagarle">
                <dl className="space-y-2">
                  <Dato e="Banco">{quien.banco || "—"}</Dato>
                  <Dato e="CLABE">
                    {quien.clabe ? String(quien.clabe).replace(/^(\d{3})(\d{3})(\d{11})(\d)$/, "$1 $2 $3 $4") : "—"}
                    {quien.clabe && <> <button className={LIGA} data-copiar-clabe onClick={async () => { try { await navigator.clipboard.writeText(quien.clabe); avisa("CLABE copiada."); } catch { avisa("El navegador no dejó copiar.", true); } }}>Copiar</button></>}
                  </Dato>
                  <Dato e="A nombre de">{quien.beneficiario || quien.nombre}</Dato>
                  <Dato e="Contacto">{[quien.correo, quien.telefono].filter(Boolean).join(" · ") || "—"}</Dato>
                </dl>
                <Nota><Link href={`/inversion/inversionistas/${quien.id}`} className={LIGA}>Editar sus datos</Link></Nota>
              </Tarjeta>
            </div>

            <Tarjeta titulo="Notas internas">
              <form
                className="space-y-2" data-form-notas
                onSubmit={async (ev) => {
                  ev.preventDefault();
                  const r = await hacer("notas", () => inv(`/prestamos/${id}`, { method: "PATCH", body: { notas: (notas ?? p.notas ?? "").trim() } }));
                  if (r) avisa("Notas guardadas.");
                }}
              >
                <textarea name="notas" value={notas ?? p.notas ?? ""} onChange={(e) => setNotas(e.target.value)} maxLength={2000} rows={3} placeholder="Sólo las ve quien dirige." className={CAJA} />
                <div className="flex justify-end"><button className={`${B} ${CHICO}`} disabled={ocupado === "notas"}>Guardar notas</button></div>
              </form>
            </Tarjeta>
            <Tarjeta titulo="Historia"><Bitacora eventos={p.eventos} /></Tarjeta>
          </div>
        );
      })()}
    </Vista>
  );
}

/* ─────────────── los tres paneles de «por depositar» ─────────────── */

const PANEL = "rounded-xl bg-cream/60 p-3 mt-3 space-y-3";

function Recibido({ p, hoy, listo }: { p: Fila; hoy: string; listo: () => void }) {
  const { hacer, ocupado } = useHacer();
  const carga = useCarga<{ filas: Fila[] }>(() => cuentasDeLaEmpresa(), "cuentas");
  const [cuenta, setCuenta] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoy);
  const [error, setError] = useState("");
  const cuentas = carga.d?.filas ?? [];
  // Con una sola cuenta no hay nada que escoger.
  const escogida = cuenta ?? (cuentas.length === 1 ? cuentas[0].id : "");
  if (carga.cargando && !carga.d) return <p className="text-sm text-ink-muted mt-3">Cargando…</p>;
  return (
    <form
      className={PANEL} data-panel-recibido
      onSubmit={async (ev) => {
        ev.preventDefault();
        const r = await hacer("recibido", () => inv(`/prestamos/${p.id}/recibido`, { body: { cuenta_id: escogida, fecha } }), setError);
        if (r) listo();
      }}
    >
      <p className="text-sm font-medium text-ink-dim">El depósito de {pesos(p.monto)} llegó</p>
      {cuentas.length ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo e="A qué cuenta">
              <select name="cuenta_id" value={escogida} onChange={(e) => setCuenta(e.target.value)} className={CAJA}>
                {cuentas.length > 1 && <option value="">Escoge…</option>}
                {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
            <Campo e="Qué día"><input type="date" name="fecha" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={CAJA} /></Campo>
          </div>
          <Nota className="!mt-0">Con esto nace el ingreso en la cuenta, el interés empieza a correr ese día y la tabla se rehace con la fecha de verdad.</Nota>
          <Err>{error}</Err>
          <div className="flex justify-end"><button className={B_PRI} disabled={ocupado === "recibido"} data-confirmar-recibido>Confirmar que llegó</button></div>
        </>
      ) : (
        <Aviso tono="ojo" className="!mb-0">La empresa no tiene cuentas dadas de alta. Créala en <Link href="/cuentas" className="underline">Cuentas</Link> y vuelve.</Aviso>
      )}
      <Err>{carga.error}</Err>
    </form>
  );
}

function CambiarCondiciones({ p, listo }: { p: Fila; listo: () => void }) {
  const { hacer, ocupado } = useHacer();
  const [cond, setCond] = useState(condDe(p));
  const [error, setError] = useState("");
  return (
    <form
      className={PANEL} data-panel-condiciones
      onSubmit={async (ev) => {
        ev.preventDefault();
        const cuerpo = leerCond(cond);
        cuerpo.monto = cuerpo.monto ?? 0;
        const r = await hacer("condiciones", () => inv(`/prestamos/${p.id}`, { method: "PATCH", body: cuerpo }), setError);
        if (r) listo();
      }}
    >
      <p className="text-sm font-medium text-ink-dim">Cambiar lo acordado</p>
      <Condiciones c={cond} cambia={setCond} />
      <Err>{error}</Err>
      <div className="flex justify-end"><button className={B_PRI} disabled={ocupado === "condiciones"}>Guardar y rehacer la tabla</button></div>
    </form>
  );
}

function Cancelar({ p, listo }: { p: Fila; listo: () => void }) {
  const { hacer, ocupado } = useHacer();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className={PANEL} data-panel-cancelar
      onSubmit={async (ev) => {
        ev.preventDefault();
        const r = await hacer("cancelar", () => inv(`/prestamos/${p.id}/cancelar`, { body: { motivo: motivo.trim() } }), setError);
        if (r) listo();
      }}
    >
      <p className="text-sm font-medium text-ink-dim">Cancelar el préstamo</p>
      <Campo e="Por qué"><textarea name="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={2} className={CAJA} /></Campo>
      <Err>{error}</Err>
      <div className="flex justify-end"><button className={B_MAL} disabled={ocupado === "cancelar"}>Cancelar el préstamo</button></div>
    </form>
  );
}

/* ─────────────── editar la tabla a mano ───────────────
 * Lo ya pagado no se toca. El capital de lo pendiente tiene que seguir
 * sumando lo que se debe; el interés lo decide quien dirige. Quien presta ve
 * la tabla nueva, el motivo y cómo estaba antes. */

type FilaEd = { n: number; fecha: string; capital: string; interes: string };

function EditorDeTabla({ p, alCerrar, listo }: { p: Fila; alCerrar: () => void; listo: () => void }) {
  const { hacer, ocupado } = useHacer();
  const debe = Number(p.resumen.capital_pendiente);
  const [filas, setFilas] = useState<FilaEd[]>(() => (p.pagos as Fila[]).filter((g) => g.estado === "pendiente").map((g, i) => ({ n: i, fecha: g.fecha || "", capital: enPesos(g.capital), interes: enPesos(g.interes) })));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const leidas = filas.map((f) => ({ fecha: f.fecha, capital: aCentavos(f.capital || "0"), interes: aCentavos(f.interes || "0") }));
  const cap = leidas.reduce((t, f) => t + (f.capital || 0), 0), int = leidas.reduce((t, f) => t + (f.interes || 0), 0);
  const dif = debe - cap;
  const pon = (n: number, k: "fecha" | "capital" | "interes", v: string) => setFilas((l) => l.map((f) => (f.n === n ? { ...f, [k]: v } : f)));
  return (
    <form
      className="space-y-3" data-editor-tabla
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (leidas.some((f) => f.capital === null || f.interes === null)) { setError("Hay una cantidad que no se entiende."); return; }
        const r = await hacer("tabla", () => inv(`/prestamos/${p.id}/tabla`, { method: "PUT", body: { pagos: leidas, motivo: motivo.trim() } }), setError);
        if (r) listo();
      }}
    >
      <p className="text-sm font-medium text-ink-dim">Editar lo que falta por pagar</p>
      <Nota className="!mt-0">Lo ya pagado no se toca. El capital tiene que seguir sumando <b>{pesos(debe)}</b>; el interés lo decides tú. {p.inversionista.nombre} verá la tabla nueva, el motivo y cómo estaba antes.</Nota>
      <Tabla>
        <thead><tr><th>Fecha</th><th>Capital</th><th>Interés</th><th></th></tr></thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.n}>
              <td><input type="date" name="fecha" value={f.fecha} onChange={(e) => pon(f.n, "fecha", e.target.value)} aria-label="Fecha" className={CAJA} /></td>
              <td><input name="capital" inputMode="decimal" value={f.capital} onChange={(e) => pon(f.n, "capital", e.target.value)} aria-label="Capital" className={`${CAJA} min-w-[104px]`} /></td>
              <td><input name="interes" inputMode="decimal" value={f.interes} onChange={(e) => pon(f.n, "interes", e.target.value)} aria-label="Interés" className={`${CAJA} min-w-[104px]`} /></td>
              <td><button type="button" className={`${B_MAL} ${CHICO}`} aria-label="Quitar este pago" onClick={() => setFilas((l) => l.filter((x) => x.n !== f.n))}>×</button></td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      <p className="text-xs text-ink-muted" data-suma>
        Capital: <b className="text-ink-dim">{pesos(cap)}</b> {dif === 0 ? <Et tono="bien">cuadra</Et> : <Et tono="mal">{dif > 0 ? `faltan ${pesos(dif)}` : `sobran ${pesos(-dif)}`}</Et>} · Interés: <b className="text-ink-dim">{pesos(int)}</b> · Total: <b className="text-ink-dim">{pesos(cap + int)}</b>
      </p>
      <div><button type="button" className={`${B} ${CHICO}`} onClick={() => setFilas((l) => [...l, { n: (l.at(-1)?.n ?? -1) + 1, fecha: "", capital: "", interes: "" }])}>+ Agregar un pago</button></div>
      <Campo e="Motivo del cambio"><textarea name="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={2} placeholder="Se recorrió el cobro de la obra dos semanas." className={CAJA} /></Campo>
      <Err>{error}</Err>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={B} onClick={alCerrar}>Cancelar</button>
        <button className={B_PRI} disabled={ocupado === "tabla"} data-guardar-tabla>Guardar la tabla nueva</button>
      </div>
    </form>
  );
}
