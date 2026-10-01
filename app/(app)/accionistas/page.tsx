"use client";

/* Accionistas: quiénes son y cuánto se les ha retirado de utilidades.
 *
 * Mike, 30-sep-2026: «El dash, necesito un módulo de accionistas donde se
 * registren pagos a los accionistas como retiro de utilidades».
 *
 * Una sola pantalla, y primero para el teléfono (Mike, el mismo día: «en
 * móvil, Dashboard es inutilizable»): tarjetas, no tabla; el alta y el retiro
 * se abren aquí mismo, sin cambiar de página. El retiro es un egreso de la
 * cuenta que se escoja, a nombre del accionista, con la categoría
 * `retiro_utilidades`: baja el saldo de esa cuenta y sale en Movimientos como
 * cualquier otro dinero que se fue.
 *
 * El permiso no lo decide esta pantalla: los accionistas son tabla de dinero
 * en la API; si contesta 403, quien entró no ve dinero. */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconCoins, IconLock, IconPlus, IconUserOff, IconUserCheck } from "@tabler/icons-react";
import { useAuth } from "@/lib/auth-context";
import { useEmpresa } from "@/lib/empresa-context";
import { ErrorApi } from "@/lib/api/cliente";
import { listCuentas } from "@/lib/cuentas";
import {
  createAccionista, darDeBaja, listAccionistas, listRetiros, personasDeRoster, registrarRetiro, retiradoPor, type PersonaDeRoster, type Retiro,
} from "@/lib/accionistas";
import { formatMontoExact } from "@/lib/format";
import type { Accionista, Cuenta } from "@/types/schema";

const CAMPO = "w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition";
const ETIQUETA = "text-xs font-medium text-ink-dim block mb-1.5";

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const diaLocal = (aaaammdd: string) => {
  const [a, m, d] = aaaammdd.split("-").map(Number);
  return new Date(a, m - 1, d, 12);
};
const fechaCorta = (aaaammdd: string) =>
  diaLocal(aaaammdd).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

export default function AccionistasPage() {
  const { user } = useAuth();
  const { empresa, loading: cargandoEmpresa } = useEmpresa();
  const [accionistas, setAccionistas] = useState<Accionista[]>([]);
  const [retiros, setRetiros] = useState<Retiro[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [error, setError] = useState("");

  const [altaAbierta, setAltaAbierta] = useState(false);
  /* Los expedientes de roster101, para jalar de ahí al accionista (Mike,
   * 1-oct-2026). Si la lista no abre, el alta a mano sigue igual. */
  const [deRoster, setDeRoster] = useState<PersonaDeRoster[]>([]);
  const [escogido, setEscogido] = useState("");
  const [alta, setAlta] = useState({ nombre: "", porcentaje: "", rfc: "", correo: "", telefono: "", notas: "" });
  const [retiroDe, setRetiroDe] = useState<Accionista | null>(null);
  const [retiro, setRetiro] = useState({ monto: "", fecha: hoy(), cuenta_id: "", descripcion: "" });
  const [guardando, setGuardando] = useState(false);
  const [verBajas, setVerBajas] = useState(false);

  const moneda = empresa?.moneda ?? "MXN";

  const cargar = useCallback(async () => {
    if (!empresa?.id) return;
    setCargando(true); setError(""); setSinPermiso(false);
    try {
      const [a, r, c] = await Promise.all([listAccionistas(), listRetiros(), listCuentas()]);
      setAccionistas(a); setRetiros(r); setCuentas(c);
      setRetiro((x) => ({ ...x, cuenta_id: x.cuenta_id || c[0]?.id || "" }));
    } catch (e) {
      if (e instanceof ErrorApi && e.error === "sin_permiso") setSinPermiso(true);
      else setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, [empresa]);

  useEffect(() => { if (!cargandoEmpresa) void cargar(); }, [cargandoEmpresa, cargar]);
  useEffect(() => { personasDeRoster().then(setDeRoster).catch(() => setDeRoster([])); }, []);

  const jalarDeRoster = (id: string) => {
    setEscogido(id);
    const p = deRoster.find((x) => x.id === id);
    if (!p) return;
    setAlta((a) => ({ ...a, nombre: p.nombre, rfc: p.rfc || a.rfc, correo: p.correo || a.correo }));
  };

  const { por, total } = useMemo(() => retiradoPor(retiros), [retiros]);
  const activos = accionistas.filter((a) => a.activo);
  const bajas = accionistas.filter((a) => !a.activo);
  const nombreDe = (id: string | null) => accionistas.find((a) => a.id === id)?.nombre;

  const guardarAlta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresa?.id) return;
    setGuardando(true); setError("");
    try {
      await createAccionista({
        nombre: alta.nombre, rfc: alta.rfc, correo: alta.correo, telefono: alta.telefono, notas: alta.notas,
        porcentaje: alta.porcentaje.trim() === "" ? "" : Number(alta.porcentaje),
      });
      setAlta({ nombre: "", porcentaje: "", rfc: "", correo: "", telefono: "", notas: "" });
      setEscogido("");
      setAltaAbierta(false);
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo dar de alta.");
    } finally {
      setGuardando(false);
    }
  };

  const guardarRetiro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresa?.id || !user || !retiroDe) return;
    const cuenta = cuentas.find((c) => c.id === retiro.cuenta_id);
    if (!cuenta) { setError("Escoge de qué cuenta sale el retiro."); return; }
    setGuardando(true); setError("");
    try {
      await registrarRetiro(user.uid, {
        accionista: retiroDe, cuenta_id: cuenta.id!, cuenta_nombre: cuenta.nombre,
        monto: Number(retiro.monto), fecha: diaLocal(retiro.fecha), descripcion: retiro.descripcion,
      });
      setRetiroDe(null);
      setRetiro((x) => ({ ...x, monto: "", descripcion: "", fecha: hoy() }));
      await cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el retiro.");
    } finally {
      setGuardando(false);
    }
  };

  const cambiarBaja = async (a: Accionista) => {
    setGuardando(true); setError("");
    try { await darDeBaja(a.id, !a.activo); await cargar(); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo."); }
    finally { setGuardando(false); }
  };

  if (sinPermiso) {
    return (
      <div className="max-w-lg">
        <h1 className="text-xl font-medium text-ink mb-3">Accionistas</h1>
        <div className="bg-white border border-black/5 rounded-2xl p-5">
          <p className="text-sm font-medium text-ink-dim mb-1.5 inline-flex items-center gap-1.5">
            <IconLock size={15} /> Esto lo ve quien ve dinero
          </p>
          <p className="text-xs text-ink-muted">Los retiros de utilidades son dinero de la empresa. Quien reparte ese permiso es el dueño de la empresa.</p>
        </div>
      </div>
    );
  }

  if (cargandoEmpresa || (cargando && accionistas.length === 0 && !error)) return <div className="text-sm text-ink-muted">Cargando…</div>;
  if (!empresa) return <div className="text-sm text-ink-muted">Cargando…</div>;

  return (
    <div className="max-w-3xl" data-accionistas={activos.length} data-total-retirado={total}>
      <div className="flex flex-wrap justify-between items-baseline gap-2 mb-4">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">Accionistas</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {activos.length === 0 ? "Ninguno todavía" : `${activos.length} ${activos.length === 1 ? "accionista" : "accionistas"}`}
            {" · retirado en total "}
            <span className="tabular-nums">{formatMontoExact(total, moneda)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setAltaAbierta((v) => !v); setRetiroDe(null); }}
          className="flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3.5 py-2 text-sm font-medium transition"
        >
          <IconPlus size={14} /> Nuevo accionista
        </button>
      </div>

      {error && <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4" role="alert">{error}</div>}

      {altaAbierta && (
        <form onSubmit={guardarAlta} className="bg-white border border-black/5 rounded-2xl p-4 mb-4 space-y-3" data-forma="alta">
          <p className="text-sm font-medium text-ink-dim">Nuevo accionista</p>
          {deRoster.length > 0 && (
            <div>
              <label htmlFor="alta-roster" className={ETIQUETA}>Jalarlo de roster101</label>
              <select id="alta-roster" value={escogido} onChange={(e) => jalarDeRoster(e.target.value)} className={CAMPO} data-de-roster={deRoster.length}>
                <option value="">— Escoger de los expedientes, o capturar abajo —</option>
                {deRoster.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}{p.puesto ? ` · ${p.puesto}` : ""}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor="alta-nombre" className={ETIQUETA}>Nombre <span className="text-mauve-900">*</span></label>
            <input id="alta-nombre" required maxLength={100} value={alta.nombre} onChange={(e) => setAlta({ ...alta, nombre: e.target.value })} className={CAMPO} placeholder="Nombre completo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="alta-porcentaje" className={ETIQUETA}>Participación %</label>
              <input id="alta-porcentaje" type="number" inputMode="decimal" min={0} max={100} step="0.01" value={alta.porcentaje} onChange={(e) => setAlta({ ...alta, porcentaje: e.target.value })} className={CAMPO} placeholder="opcional" />
            </div>
            <div>
              <label htmlFor="alta-rfc" className={ETIQUETA}>RFC</label>
              <input id="alta-rfc" maxLength={13} value={alta.rfc} onChange={(e) => setAlta({ ...alta, rfc: e.target.value.toUpperCase() })} className={`${CAMPO} uppercase`} placeholder="opcional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="alta-correo" className={ETIQUETA}>Correo</label>
              <input id="alta-correo" type="email" value={alta.correo} onChange={(e) => setAlta({ ...alta, correo: e.target.value })} className={CAMPO} />
            </div>
            <div>
              <label htmlFor="alta-telefono" className={ETIQUETA}>Teléfono</label>
              <input id="alta-telefono" type="tel" value={alta.telefono} onChange={(e) => setAlta({ ...alta, telefono: e.target.value })} className={CAMPO} />
            </div>
          </div>
          <div>
            <label htmlFor="alta-notas" className={ETIQUETA}>Notas</label>
            <input id="alta-notas" maxLength={200} value={alta.notas} onChange={(e) => setAlta({ ...alta, notas: e.target.value })} className={CAMPO} placeholder="opcional" />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setAltaAbierta(false)} className="text-sm px-3 py-2 rounded-xl text-ink-muted hover:text-ink-dim">Cancelar</button>
            <button type="submit" disabled={guardando} className="bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition">
              {guardando ? "Guardando…" : "Dar de alta"}
            </button>
          </div>
        </form>
      )}

      {activos.length === 0 && !altaAbierta ? (
        <div className="bg-white border border-black/5 rounded-2xl p-8 text-center mb-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-cream flex items-center justify-center mb-3"><IconCoins size={22} className="text-ink-muted" /></div>
          <p className="text-sm font-medium text-ink-dim mb-1">Sin accionistas</p>
          <p className="text-xs text-ink-muted max-w-xs mx-auto">Da de alta a quienes reparten utilidades de la empresa y registra aquí cada retiro.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {activos.map((a) => (
            <div key={a.id} data-accionista={a.nombre} className="bg-white border border-black/5 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-dim truncate">{a.nombre}</p>
                  <p className="text-[11px] text-ink-muted truncate">
                    {a.porcentaje !== null ? `${a.porcentaje}% de participación` : "sin participación capturada"}
                    {a.rfc ? ` · ${a.rfc}` : ""}
                  </p>
                </div>
                <button type="button" title="Dar de baja" aria-label={`Dar de baja a ${a.nombre}`} disabled={guardando} onClick={() => void cambiarBaja(a)} className="text-ink-muted hover:text-mauve-900 p-1 -m-1 transition">
                  <IconUserOff size={15} />
                </button>
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] text-ink-muted">Retirado</p>
                  <p className="text-base font-medium text-ink tabular-nums" data-retirado={por.get(a.id) ?? 0}>{formatMontoExact(por.get(a.id) ?? 0, moneda)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setRetiroDe(retiroDe?.id === a.id ? null : a); setAltaAbierta(false); }}
                  className="text-xs font-medium bg-cream hover:bg-black/5 text-ink-dim rounded-xl px-3 py-1.5 transition"
                >
                  Registrar retiro
                </button>
              </div>
              {retiroDe?.id === a.id && (
                <form onSubmit={guardarRetiro} className="mt-3 pt-3 border-t border-black/5 space-y-3" data-forma="retiro">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="retiro-monto" className={ETIQUETA}>Monto <span className="text-mauve-900">*</span></label>
                      <input id="retiro-monto" type="number" inputMode="decimal" required min={0.01} step="0.01" value={retiro.monto} onChange={(e) => setRetiro({ ...retiro, monto: e.target.value })} className={CAMPO} placeholder="0.00" />
                    </div>
                    <div>
                      <label htmlFor="retiro-fecha" className={ETIQUETA}>Fecha</label>
                      <input id="retiro-fecha" type="date" required value={retiro.fecha} onChange={(e) => setRetiro({ ...retiro, fecha: e.target.value })} className={CAMPO} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="retiro-cuenta" className={ETIQUETA}>De qué cuenta sale <span className="text-mauve-900">*</span></label>
                    <select id="retiro-cuenta" required value={retiro.cuenta_id} onChange={(e) => setRetiro({ ...retiro, cuenta_id: e.target.value })} className={CAMPO}>
                      <option value="">Escoge una cuenta</option>
                      {cuentas.map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre} · {formatMontoExact(c.saldo_actual ?? 0, c.moneda)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="retiro-concepto" className={ETIQUETA}>Concepto</label>
                    <input id="retiro-concepto" maxLength={200} value={retiro.descripcion} onChange={(e) => setRetiro({ ...retiro, descripcion: e.target.value })} className={CAMPO} placeholder={`Retiro de utilidades · ${a.nombre}`} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setRetiroDe(null)} className="text-sm px-3 py-2 rounded-xl text-ink-muted hover:text-ink-dim">Cancelar</button>
                    <button type="submit" disabled={guardando} className="bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition">
                      {guardando ? "Registrando…" : "Registrar el retiro"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      {bajas.length > 0 && (
        <div className="mb-6">
          <button type="button" onClick={() => setVerBajas((v) => !v)} className="text-xs text-ink-muted hover:text-ink-dim">
            {verBajas ? "Ocultar" : "Ver"} {bajas.length} {bajas.length === 1 ? "dado de baja" : "dados de baja"}
          </button>
          {verBajas && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {bajas.map((a) => (
                <div key={a.id} data-accionista={a.nombre} data-baja className="bg-white/60 border border-dashed border-black/10 rounded-2xl p-4 text-ink-muted">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm truncate">{a.nombre}</p>
                    <button type="button" title="Volver a dar de alta" aria-label={`Volver a dar de alta a ${a.nombre}`} disabled={guardando} onClick={() => void cambiarBaja(a)} className="hover:text-ink-dim p-1 -m-1 transition">
                      <IconUserCheck size={15} />
                    </button>
                  </div>
                  <p className="text-xs mt-1 tabular-nums">Retirado {formatMontoExact(por.get(a.id) ?? 0, moneda)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="flex justify-between items-baseline mb-2">
          <h3 className="text-sm font-medium text-ink-dim">Retiros de utilidades</h3>
          <Link href="/movimientos" className="text-xs text-ink-muted hover:text-ink-dim">Ver en Movimientos →</Link>
        </div>
        {retiros.length === 0 ? (
          <p className="text-xs text-ink-muted">Todavía no hay retiros registrados.</p>
        ) : (
          <div className="bg-white border border-black/5 rounded-2xl divide-y divide-black/5" data-retiros={retiros.length}>
            {retiros.map((r) => (
              <div key={r.id} data-retiro={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-ink-dim truncate">{nombreDe(r.accionista_id) ?? r.accionista_nombre}</p>
                  <p className="text-[11px] text-ink-muted truncate">{fechaCorta(r.fecha)} · {r.cuenta_nombre}{r.descripcion ? ` · ${r.descripcion}` : ""}</p>
                </div>
                <p className="text-sm font-medium text-ink tabular-nums whitespace-nowrap">−{formatMontoExact(r.monto, moneda)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
