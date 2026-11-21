"use client";

/* La pantalla del proveedor es su estado de cuenta, como la del cliente
 * (Mike, 21-nov-2026: «el layout debería ser prácticamente igual que la de
 * clientes y proyectos, solo que aquí es de proveedores y proyectos y los
 * conceptos son cuentas por pagar en vez de conceptos por cobrar»).
 *
 * Arriba el saldo por pagar, grande. Luego un bloque por proyecto: sus
 * cuentas por pagar (lo acordado), los pagos que se le han hecho y el saldo.
 * Desde cada bloque se agrega una cuenta por pagar o se registra un pago, y
 * al guardar el pago se regresa aquí. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { formatMonto } from "@/lib/format";
import { listProyectos } from "@/lib/proyectos";
import {
  agregarCuentaPorPagar, borrarCuentaPorPagar, estadoProveedor,
  type EstadoProveedor, type PagoProveedor, type ProyectoDelProveedor,
} from "@/lib/proveedor-cuenta";
import type { Proyecto } from "@/types/schema";

const m = (n: number) => formatMonto(n, "MXN");
const dia = (f: string | null) => (f ? new Date(`${f.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—");

export function EstadoDelProveedor({ proveedorId, proveedorNombre }: { proveedorId: string; proveedorNombre: string }) {
  const [estado, setEstado] = useState<EstadoProveedor | null>(null);
  const [error, setError] = useState("");
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [nueva, setNueva] = useState<string | null>(null); // proyecto_id donde se agrega, "" = escoger proyecto

  const cargar = () =>
    estadoProveedor(proveedorId)
      .then((d) => { setEstado(d); setError(""); })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo abrir el estado de cuenta."));

  useEffect(() => {
    void cargar();
    listProyectos().then((ps) => setProyectos(ps.filter((p) => p.estado !== "cerrado"))).catch(() => setProyectos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedorId]);

  if (error) return <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>;
  if (!estado) return <p className="text-sm text-ink-muted">Cargando el estado de cuenta…</p>;

  const t = estado.totales;
  const volver = encodeURIComponent(`/proveedores/${proveedorId}`);
  const pagar = (proyectoId?: string) =>
    `/movimientos/nuevo?tipo=egreso&contraparte=${proveedorId}${proyectoId ? `&proyecto=${proyectoId}` : ""}&volver=${volver}`;

  return (
    <div className="space-y-3" data-estado-proveedor>
      <div className="bg-cream rounded-3xl p-6" data-saldo-por-pagar>
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div>
            <p className="text-xs text-ink-muted mb-1 font-medium">Saldo por pagar</p>
            <p className="text-4xl font-medium tracking-tight text-ink-dim leading-none tabular-nums">{m(Math.max(0, t.saldo))}</p>
            <p className="text-xs text-ink-muted mt-2">
              {m(t.acordado)} por pagar acordado − {m(t.pagado)} pagado · {t.proyectos} {t.proyectos === 1 ? "proyecto" : "proyectos"}
            </p>
            {t.saldo < 0 && <p className="text-xs text-mauve-900 mt-1">Se le ha pagado {m(-t.saldo)} más de lo acordado.</p>}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setNueva(nueva === "" ? null : "")}
              data-agregar-cuenta
              className="text-xs bg-white border border-black/10 rounded-xl px-3 py-1.5 hover:border-black/20 transition flex items-center gap-1"
            >
              <IconPlus size={13} /> Cuenta por pagar
            </button>
            <Link
              href={pagar()}
              data-registrar-pago
              className="text-xs bg-ink text-cream rounded-xl px-3 py-1.5 hover:bg-ink/90 transition flex items-center gap-1"
            >
              <IconPlus size={13} /> Registrar pago
            </Link>
          </div>
        </div>
        {nueva === "" && (
          <FormaCuenta proveedorId={proveedorId} proveedorNombre={proveedorNombre} proyectos={proyectos} onListo={() => { setNueva(null); void cargar(); }} onCancelar={() => setNueva(null)} />
        )}
      </div>

      {estado.proyectos.length === 0 && (
        <div className="bg-white border border-black/5 rounded-2xl p-6 text-center">
          <p className="text-sm font-medium text-ink-dim mb-1">Sin cuentas por pagar</p>
          <p className="text-xs text-ink-muted">Agrega lo que se le va a pagar en cada proyecto con «Cuenta por pagar».</p>
        </div>
      )}

      {estado.proyectos.map((p) => (
        <BloqueProyecto
          key={p.proyecto_id}
          p={p}
          pagarHref={pagar(p.proyecto_id)}
          abierta={nueva === p.proyecto_id}
          onAgregar={() => setNueva(nueva === p.proyecto_id ? null : p.proyecto_id)}
          forma={<FormaCuenta proveedorId={proveedorId} proveedorNombre={proveedorNombre} proyectos={proyectos} fijo={p.proyecto_id} onListo={() => { setNueva(null); void cargar(); }} onCancelar={() => setNueva(null)} />}
          onCambio={() => void cargar()}
        />
      ))}

      {estado.sin_proyecto.pagos.length > 0 && (
        <section className="bg-white border border-black/5 rounded-2xl p-4" data-pagos-sin-proyecto>
          <div className="flex justify-between items-baseline mb-2">
            <p className="text-sm font-medium text-ink-dim">Pagos sin proyecto</p>
            <p className="text-sm tabular-nums text-mauve-900">{m(estado.sin_proyecto.total)}</p>
          </div>
          <p className="text-[11px] text-ink-muted mb-2">A su nombre, sin proyecto: no restan de ninguna cuenta por pagar.</p>
          <TablaPagos pagos={estado.sin_proyecto.pagos} />
        </section>
      )}
    </div>
  );
}

function BloqueProyecto({ p, pagarHref, abierta, onAgregar, forma, onCambio }: {
  p: ProyectoDelProveedor; pagarHref: string; abierta: boolean; onAgregar: () => void; forma: React.ReactNode; onCambio: () => void;
}) {
  const [borrando, setBorrando] = useState("");
  /* Primer clic pregunta, el segundo borra: en el teléfono un dedazo no
   * debe llevarse una cuenta por pagar. */
  const [porQuitar, setPorQuitar] = useState("");
  const [aviso, setAviso] = useState("");
  const pct = p.acordado > 0 ? Math.min(100, (p.pagado / p.acordado) * 100) : 0;
  const borrar = async (id: string) => {
    setBorrando(id); setAviso(""); setPorQuitar("");
    try { await borrarCuentaPorPagar(id); onCambio(); }
    catch (e) { setAviso(e instanceof Error ? e.message : "No se pudo borrar"); }
    finally { setBorrando(""); }
  };
  return (
    <section className="bg-white border border-black/5 rounded-2xl p-4" data-proyecto-del-proveedor={p.proyecto_id}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <Link href={`/proyectos/${p.proyecto_id}`} className="text-sm font-medium text-ink-dim hover:underline">{p.nombre}</Link>
          <p className="text-[11px] text-ink-muted truncate">{p.cliente_nombre ?? "—"}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-ink-muted uppercase tracking-wide">Saldo por pagar</p>
          <p className="text-xl font-medium text-mauve-900 tabular-nums leading-tight">{m(p.saldo)}</p>
        </div>
      </div>
      <div className="h-1 bg-cream rounded-full overflow-hidden mb-3">
        <div className="h-full bg-mauve-900" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex justify-between items-baseline mb-1">
        <p className="text-xs font-medium text-ink-dim">Cuentas por pagar</p>
        <p className="text-xs tabular-nums text-ink-dim">{m(p.acordado)}</p>
      </div>
      {p.partidas.length === 0 ? (
        <p className="text-[11px] text-ink-muted mb-2">Sin cuentas por pagar en este proyecto.</p>
      ) : (
        <div className="overflow-x-auto mb-2">
          <table className="w-full text-xs">
            <tbody>
              {p.partidas.map((c) => (
                <tr key={c.id} className="border-t border-black/5" data-cuenta-por-pagar={c.id}>
                  <td className="py-1.5 pr-2">{c.concepto || "—"}{c.del_cronograma && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-900">del cronograma</span>}</td>
                  <td className="py-1.5 pr-2 text-ink-muted whitespace-nowrap">{dia(c.fecha_esperada)}</td>
                  <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{m(c.monto_acordado)}</td>
                  <td className="py-1.5 pl-2 w-6 text-right">
                    {!c.del_cronograma && (porQuitar === c.id ? (
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <button onClick={() => void borrar(c.id)} disabled={borrando === c.id} data-confirmar-quitar className="text-[11px] font-medium text-mauve-900 hover:underline disabled:opacity-40">Quitar</button>
                        <button onClick={() => setPorQuitar("")} className="text-[11px] text-ink-muted hover:underline">No</button>
                      </span>
                    ) : (
                      <button onClick={() => setPorQuitar(c.id)} title="Quitar esta cuenta por pagar" className="text-ink-muted hover:text-mauve-900">
                        <IconTrash size={13} />
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between items-baseline mb-1 mt-3">
        <p className="text-xs font-medium text-ink-dim">Pagos</p>
        <p className="text-xs tabular-nums text-mauve-900">{m(p.pagado)}</p>
      </div>
      {p.pagos.length === 0 ? <p className="text-[11px] text-ink-muted">Todavía no se le ha pagado nada en este proyecto.</p> : <TablaPagos pagos={p.pagos} />}

      {aviso && <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl mt-2">{aviso}</p>}
      <div className="flex gap-2 mt-3 flex-wrap">
        <button onClick={onAgregar} className="text-xs bg-white border border-black/10 rounded-xl px-3 py-1.5 hover:border-black/20 transition flex items-center gap-1">
          <IconPlus size={13} /> Cuenta por pagar
        </button>
        <Link href={pagarHref} className="text-xs bg-ink text-cream rounded-xl px-3 py-1.5 hover:bg-ink/90 transition flex items-center gap-1" data-registrar-pago-proyecto={p.proyecto_id}>
          <IconPlus size={13} /> Registrar pago
        </Link>
      </div>
      {abierta && forma}
    </section>
  );
}

function TablaPagos({ pagos }: { pagos: PagoProveedor[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <tbody>
          {pagos.map((x) => (
            <tr key={x.id} className="border-t border-black/5" data-pago-proveedor={x.id}>
              <td className="py-1.5 pr-2 text-ink-muted whitespace-nowrap">{dia(x.fecha)}</td>
              <td className="py-1.5 pr-2"><Link href={`/movimientos/${x.id}`} className="hover:underline">{x.descripcion || "Pago"}</Link></td>
              <td className="py-1.5 pr-2 text-ink-muted whitespace-nowrap">{x.cuenta ?? ""}</td>
              <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{m(x.monto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormaCuenta({ proveedorId, proveedorNombre, proyectos, fijo, onListo, onCancelar }: {
  proveedorId: string; proveedorNombre: string; proyectos: Proyecto[]; fijo?: string; onListo: () => void; onCancelar: () => void;
}) {
  const [proyecto, setProyecto] = useState(fijo ?? "");
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const valor = Number(monto.replace(/[^0-9.]/g, ""));
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!proyecto) return setError("Escoge el proyecto.");
    if (!concepto.trim()) return setError("Escribe qué se le va a pagar.");
    if (!(valor > 0)) return setError("El monto debe ser mayor que cero.");
    setGuardando(true);
    try {
      await agregarCuentaPorPagar({ proyecto_id: proyecto, proveedor_id: proveedorId, proveedor_nombre: proveedorNombre, concepto, monto: valor });
      onListo();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };
  const campo = "w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition";
  return (
    <form onSubmit={guardar} className="mt-3 bg-white border border-black/10 rounded-2xl p-3 space-y-2" data-forma-cuenta>
      {!fijo && (
        <select value={proyecto} onChange={(e) => setProyecto(e.target.value)} className={campo} aria-label="Proyecto">
          <option value="">— Proyecto —</option>
          {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.cliente_nombre ? ` · ${p.cliente_nombre}` : ""}</option>)}
        </select>
      )}
      <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Qué se le va a pagar (concepto)" maxLength={200} className={campo} aria-label="Concepto" />
      <input value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Monto" inputMode="decimal" className={campo} aria-label="Monto" />
      {error && <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className="text-xs border border-black/15 rounded-xl px-3 py-1.5">Cancelar</button>
        <button type="submit" disabled={guardando} className="text-xs bg-ink text-cream rounded-xl px-3 py-1.5 disabled:opacity-50">{guardando ? "Guardando…" : "Agregar cuenta por pagar"}</button>
      </div>
    </form>
  );
}
