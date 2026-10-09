"use client";

/* Préstamos: lo que la empresa le debe a quienes le prestaron (investor101).
 *
 * Mike, 8-oct-2026, con botones: los pagos a los inversionistas se registran
 * AQUÍ —«cada pago programado aparece en dash como pago pendiente; al pagarlo
 * ahí y subir comprobante, se refleja solo en investor101»—. Un solo lugar de
 * captura: donde sale el dinero.
 *
 * Dos listas:
 *   · DEPÓSITOS POR CONFIRMAR: ofertas ya aceptadas cuyo dinero no ha
 *     llegado. Confirmar deja el ingreso en la cuenta y arranca el préstamo
 *     (y sus intereses) ese día.
 *   · POR PAGAR: cada pago pendiente de los préstamos que ya arrancaron, por
 *     fecha. Pagar deja dos egresos —capital e interés, que no son lo mismo:
 *     devolver lo prestado no es un gasto, el interés sí— y avisa por correo
 *     a quien prestó. El comprobante se cuelga del pago y lo ve en su cuenta.
 *   · PAGOS REGISTRADOS (8-oct, encargo de patron101): los ya hechos, el más
 *     reciente arriba. Uno capturado por error se deshace con su motivo: se
 *     borran sus dos egresos, vuelve a «por pagar» y queda en la bitácora del
 *     préstamo.
 *
 * Las rondas, las ofertas y las tablas se llevan en investor101; aquí sólo
 * se mueve el dinero. Lo abre quien dirige la empresa: a los demás la API
 * contesta 403 y se dice.
 */

import { useCallback, useEffect, useState } from "react";
import { useEmpresa } from "@/lib/empresa-context";
import { listCuentas } from "@/lib/cuentas";
import { clabeLegible } from "@/lib/ordenes";
import {
  confirmarDeposito, deshacerPagoDePrestamo, getFlujoDeInversion, listPagosDePrestamos, listPagosHechos, pagarPagoDePrestamo, sinInversion,
  subirComprobanteDePago, urlInvestor, type DepositoPorRecibir, type PagoDePrestamo, type PagoRegistrado,
} from "@/lib/inversion";
import type { Cuenta } from "@/types/schema";
import { formatMontoExact } from "@/lib/format";
import { IconAlertTriangle, IconArrowBackUp, IconBuildingBank, IconExternalLink } from "@tabler/icons-react";

const hoyTexto = () => {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const fecha = (dia: string) => {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};

export default function InversionPage() {
  const { empresa, loading: cargandoEmpresa } = useEmpresa();
  const [pagos, setPagos] = useState<PagoDePrestamo[]>([]);
  const [depositos, setDepositos] = useState<DepositoPorRecibir[]>([]);
  const [hechos, setHechos] = useState<PagoRegistrado[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cerrado, setCerrado] = useState(false);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async () => {
    if (!empresa?.id) { setCargando(false); return; }
    try {
      const [p, f, c] = await Promise.all([listPagosDePrestamos(), getFlujoDeInversion(), listCuentas()]);
      setPagos(p); setDepositos(f.depositos); setCuentas(c); setCerrado(false); setError("");
      // La lista de los ya hechos es aparte: si no llega, lo demás sigue.
      setHechos(await listPagosHechos().catch(() => []));
    } catch (e) {
      if (sinInversion(e)) setCerrado(true);
      else setError(e instanceof Error ? e.message : "Error");
    } finally { setCargando(false); }
  }, [empresa]);

  useEffect(() => { if (!cargandoEmpresa) void cargar(); }, [cargandoEmpresa, cargar]);

  if (cargandoEmpresa || cargando) return <div className="text-sm text-ink-muted">Cargando…</div>;

  if (cerrado) {
    return (
      <div className="bg-white border border-black/5 rounded-2xl p-10 text-center" data-inversion-cerrada>
        <IconBuildingBank size={22} className="text-ink-muted mx-auto mb-2" />
        <p className="text-sm font-medium text-ink-dim mb-1">Los préstamos no se abren desde tu cuenta</p>
        <p className="text-xs text-ink-muted max-w-sm mx-auto">
          Lo que la empresa debe a quienes le prestaron lo lleva quien la dirige (dueño o administración), y sólo si la
          empresa tiene patron101.
        </p>
      </div>
    );
  }

  const vencidos = pagos.filter((g) => g.vencido);
  const total = pagos.reduce((s, g) => s + g.total, 0);
  const hecho = (texto: string) => { setAviso(texto); setAbierto(null); void cargar(); };

  return (
    <div>
      <div className="flex justify-between items-baseline mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">Préstamos</h2>
          <p className="text-xs text-ink-muted mt-0.5">Lo que se le debe a quienes le prestaron a {empresa?.nombre}.</p>
        </div>
        <a
          href={urlInvestor()} target="_blank" rel="noopener"
          className="inline-flex items-center gap-1.5 border border-black/10 text-ink-dim rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-cream"
        >
          Rondas y tablas en patron101 <IconExternalLink size={13} />
        </a>
      </div>

      {error && <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">{error}</div>}
      {aviso && <div className="bg-mint-50 text-mint-900 text-xs px-3 py-2 rounded-xl mb-4" data-aviso>{aviso}</div>}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-black/5 rounded-2xl px-4 py-3">
          <p className="text-[11px] text-ink-muted">Hay por pagar</p>
          <p className="text-lg font-medium text-ink-dim tabular-nums" data-total-prestamos>{formatMontoExact(total)}</p>
          <p className="text-[11px] text-ink-muted">{pagos.length} pago{pagos.length === 1 ? "" : "s"} programado{pagos.length === 1 ? "" : "s"}</p>
        </div>
        <div className="bg-white border border-black/5 rounded-2xl px-4 py-3">
          <p className="text-[11px] text-ink-muted">Por recibir</p>
          <p className="text-lg font-medium text-ink-dim tabular-nums">{formatMontoExact(depositos.reduce((s, d) => s + d.monto, 0))}</p>
          {vencidos.length > 0 ? (
            <p className="text-[11px] text-mauve-900 flex items-center gap-1">
              <IconAlertTriangle size={12} /> {vencidos.length} pago{vencidos.length === 1 ? "" : "s"} ya vencido{vencidos.length === 1 ? "" : "s"}
            </p>
          ) : (
            <p className="text-[11px] text-ink-muted">{depositos.length} depósito{depositos.length === 1 ? "" : "s"} por confirmar</p>
          )}
        </div>
      </div>

      {depositos.length > 0 && (
        <div className="bg-white border border-black/5 rounded-2xl overflow-hidden mb-4" data-depositos>
          <div className="px-4 py-2 bg-cream/50 text-xs text-ink-muted uppercase tracking-wide font-medium">Depósitos por confirmar</div>
          <ul className="divide-y divide-black/5">
            {depositos.map((d) => (
              <li key={d.id} data-deposito={d.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-dim truncate">{d.inversionista_nombre}</p>
                    <p className="text-[11px] text-ink-muted">{d.folio} · se espera el {fecha(d.fecha)}</p>
                  </div>
                  <p className="text-sm font-medium text-mint-900 tabular-nums">+{formatMontoExact(d.monto)}</p>
                  <button
                    data-confirmar onClick={() => setAbierto(abierto === d.id ? null : d.id)}
                    className="bg-ink text-cream rounded-xl px-3 py-1.5 text-xs font-medium"
                  >
                    Ya llegó
                  </button>
                </div>
                {abierto === d.id && (
                  <FormaDeDinero
                    cuentas={cuentas} boton="Confirmar que llegó" pregunta="A qué cuenta llegó"
                    nota="Con esto nace el ingreso, el interés empieza a correr ese día y la tabla de pagos se rehace con la fecha de verdad."
                    alGuardar={async ({ cuenta_id, fecha: f }) => {
                      await confirmarDeposito(d.id, { cuenta_id, fecha: f });
                      hecho(`Depósito de ${d.inversionista_nombre} confirmado: el préstamo ${d.folio} ya arrancó.`);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {pagos.length === 0 ? (
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-ink-dim mb-1">No hay pagos pendientes</p>
          <p className="text-xs text-ink-muted">Cuando un préstamo arranca, sus pagos aparecen aquí en su fecha.</p>
        </div>
      ) : (
        <div className="bg-white border border-black/5 rounded-2xl overflow-hidden" data-pagos>
          <div className="px-4 py-2 bg-cream/50 text-xs text-ink-muted uppercase tracking-wide font-medium">Por pagar</div>
          <ul className="divide-y divide-black/5">
            {pagos.map((g) => (
              <li key={g.id} data-pago={g.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-dim truncate">
                      {g.inversionista_nombre}
                      {g.vencido && <span className="ml-1.5 text-[10px] px-1.5 py-px rounded-full bg-mauve-50 text-mauve-900">vencido</span>}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      {g.folio} · pago {g.numero} de {g.de} · {fecha(g.fecha)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-ink-dim tabular-nums">{formatMontoExact(g.total)}</p>
                    <p className="text-[10px] text-ink-muted tabular-nums">{formatMontoExact(g.capital)} + {formatMontoExact(g.interes)}</p>
                  </div>
                  <button
                    data-pagar onClick={() => setAbierto(abierto === g.id ? null : g.id)}
                    className="bg-ink text-cream rounded-xl px-3 py-1.5 text-xs font-medium"
                  >
                    Pagar
                  </button>
                </div>
                {abierto === g.id && (
                  <div>
                    <div className="mt-3 bg-cream/40 rounded-xl px-3 py-2 text-xs text-ink-dim" data-para-pagarle>
                      {g.clabe ? (
                        <>
                          <span className="text-ink-muted">Para pagarle:</span> {g.banco ? `${g.banco} · ` : ""}
                          <span className="tabular-nums font-medium">{clabeLegible(g.clabe)}</span> · a nombre de {g.beneficiario || g.inversionista_nombre}
                        </>
                      ) : (
                        <>Este inversionista no tiene cuenta registrada. Se le agrega en patron101, en su ficha.</>
                      )}
                    </div>
                    <FormaDeDinero
                      cuentas={cuentas} boton={`Registrar el pago de ${formatMontoExact(g.total)}`} pregunta="De qué cuenta sale" conComprobante
                      nota="Deja dos egresos (capital e interés) y le avisa por correo. El comprobante lo ve en su estado de cuenta."
                      alGuardar={async ({ cuenta_id, fecha: f, nota, archivo }) => {
                        const r = await pagarPagoDePrestamo(g.id, { cuenta_id, fecha: f, nota });
                        let papel = "";
                        if (archivo) {
                          try { await subirComprobanteDePago(g.prestamo_id, g.id, archivo); } catch (e) {
                            papel = ` El comprobante no se pudo subir (${e instanceof Error ? e.message : "error"}): súbelo desde patron101.`;
                          }
                        }
                        hecho(`Pago ${g.numero} de ${g.de} a ${g.inversionista_nombre} registrado.${r.liquidado ? " Con éste el préstamo quedó liquidado." : ""}${papel}`);
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hechos.length > 0 && (
        <div className="bg-white border border-black/5 rounded-2xl overflow-hidden mt-4" data-hechos>
          <div className="px-4 py-2 bg-cream/50 text-xs text-ink-muted uppercase tracking-wide font-medium">Pagos registrados</div>
          <ul className="divide-y divide-black/5">
            {hechos.map((g) => (
              <li key={g.id} data-hecho={g.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-dim truncate">{g.inversionista_nombre}</p>
                    <p className="text-[11px] text-ink-muted">
                      {g.folio} · pago {g.numero} de {g.de} · pagado el {fecha(g.pagado_fecha)}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-ink-dim tabular-nums">{formatMontoExact(g.total)}</p>
                  <button
                    data-deshacer onClick={() => setAbierto(abierto === `d:${g.id}` ? null : `d:${g.id}`)}
                    className="inline-flex items-center gap-1 border border-black/10 text-ink-dim rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-cream"
                  >
                    <IconArrowBackUp size={13} /> Deshacer
                  </button>
                </div>
                {abierto === `d:${g.id}` && (
                  <Deshacer
                    alConfirmar={async (motivo) => {
                      await deshacerPagoDePrestamo(g.id, motivo);
                      hecho(`Pago ${g.numero} de ${g.de} a ${g.inversionista_nombre} deshecho: sus egresos se borraron y vuelve a estar por pagar.`);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Deshacer un pago pide por qué: queda en la bitácora del préstamo, que
 *  también ve quien prestó. */
function Deshacer({ alConfirmar }: { alConfirmar: (motivo: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState("");
  return (
    <form
      className="mt-3 bg-cream/40 rounded-xl px-3 py-3 space-y-2" data-forma-deshacer
      onSubmit={async (ev) => {
        ev.preventDefault();
        if (!motivo.trim()) { setErr("Di por qué se deshace."); return; }
        setGuardando(true); setErr("");
        try { await alConfirmar(motivo.trim()); } catch (e) { setErr(e instanceof Error ? e.message : "Error"); setGuardando(false); }
      }}
    >
      <label className="block text-xs text-ink-dim" htmlFor="deshacer-motivo">Por qué se deshace</label>
      <textarea
        id="deshacer-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={2}
        placeholder="Por ejemplo: lo capturé en la cuenta equivocada"
        className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
      />
      <p className="text-[11px] text-ink-muted">Se borran sus dos egresos (capital e interés), el pago vuelve a «por pagar» y el motivo queda en la bitácora del préstamo.</p>
      {err && <p className="text-xs text-mauve-900">{err}</p>}
      <button type="submit" disabled={guardando} className="bg-ink text-cream rounded-xl px-3 py-1.5 text-xs font-medium disabled:opacity-50">
        {guardando ? "Deshaciendo…" : "Deshacer el pago"}
      </button>
    </form>
  );
}

/** La cuenta, el día y —al pagar— la nota y el comprobante. La usan las dos
 *  listas: lo que cambia es la pregunta y el botón. */
function FormaDeDinero({
  cuentas, boton, pregunta, nota, conComprobante, alGuardar,
}: {
  cuentas: Cuenta[]; boton: string; pregunta: string; nota: string; conComprobante?: boolean;
  alGuardar: (d: { cuenta_id: string; fecha: string; nota?: string; archivo?: File | null }) => Promise<void>;
}) {
  const [cuenta, setCuenta] = useState(cuentas.length === 1 ? cuentas[0].id ?? "" : "");
  const [dia, setDia] = useState(hoyTexto());
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  if (!cuentas.length) {
    return <p className="mt-3 text-xs text-mauve-900">No hay cuentas dadas de alta. Crea una en Cuentas y vuelve.</p>;
  }
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cuenta) { setError("Escoge la cuenta."); return; }
    setGuardando(true); setError("");
    try { await alGuardar({ cuenta_id: cuenta, fecha: dia, nota: texto || undefined, archivo }); } catch (x) {
      setError(x instanceof Error ? x.message : "Error");
      setGuardando(false);
    }
  };
  const campo = "bg-white border border-black/10 rounded-xl px-3 py-2 text-sm w-full focus:outline-none";
  return (
    <form onSubmit={guardar} className="mt-3 grid gap-3 sm:grid-cols-2" data-forma-dinero>
      <label className="text-xs text-ink-muted">
        {pregunta}
        <select data-cuenta value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={`${campo} mt-1`}>
          {cuentas.length > 1 && <option value="">Escoge…</option>}
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </label>
      <label className="text-xs text-ink-muted">
        Qué día
        <input type="date" value={dia} max={hoyTexto()} onChange={(e) => setDia(e.target.value)} className={`${campo} mt-1`} />
      </label>
      {conComprobante && (
        <>
          <label className="text-xs text-ink-muted">
            Comprobante <span className="opacity-70">(PDF o foto, opcional)</span>
            <input
              data-comprobante type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className={`${campo} mt-1`}
            />
          </label>
          <label className="text-xs text-ink-muted">
            Nota <span className="opacity-70">(opcional)</span>
            <input value={texto} maxLength={500} onChange={(e) => setTexto(e.target.value)} placeholder="SPEI 123456" className={`${campo} mt-1`} />
          </label>
        </>
      )}
      <p className="text-[11px] text-ink-muted sm:col-span-2">{nota}</p>
      {error && <p className="text-xs text-mauve-900 sm:col-span-2" data-error>{error}</p>}
      <div className="sm:col-span-2 flex justify-end">
        <button disabled={guardando} className="bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50">
          {guardando ? "Guardando…" : boton}
        </button>
      </div>
    </form>
  );
}
