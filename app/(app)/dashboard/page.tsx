"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { listCuentas } from "@/lib/cuentas";
import { listMovimientos } from "@/lib/movimientos";
import { listProyectos } from "@/lib/proyectos";
import type { Cuenta, Movimiento, Proyecto } from "@/types/schema";
import { formatMonto, formatDateShort } from "@/lib/format";
import { Timestamp } from "firebase/firestore";
import {
  IconLeaf,
  IconArrowDownLeft,
  IconArrowUpRight,
  IconBuildingBank,
  IconCoin,
  IconCreditCard,
  IconCircleDashed,
  IconPlus,
  IconFolder,
} from "@tabler/icons-react";

function iconoCuenta(tipo: string) {
  switch (tipo) {
    case "banco":
      return IconBuildingBank;
    case "caja":
      return IconCoin;
    case "credito":
      return IconCreditCard;
    default:
      return IconCircleDashed;
  }
}

const MV_META = {
  ingreso: {
    icon: IconArrowDownLeft,
    color: "bg-mint-50 text-mint-900",
    montoColor: "text-mint-900",
    prefix: "+",
  },
  egreso: {
    icon: IconArrowUpRight,
    color: "bg-mauve-50 text-mauve-900",
    montoColor: "text-mauve-900",
    prefix: "−",
  },
} as const;

export default function DashboardPage() {
  const { activo, loading: loadingNegocio } = useNegocioActivo();
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (loadingNegocio) return;
    if (!activo?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      listCuentas(activo.id),
      listMovimientos(activo.id, { max: 5 }),
      listProyectos(activo.id),
    ])
      .then(([cs, ms, ps]) => {
        setCuentas(cs);
        setMovimientos(ms);
        setProyectos(ps);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [activo, loadingNegocio]);

  if (loadingNegocio || loading) {
    return <div className="text-sm text-ink-muted">Cargando…</div>;
  }

  if (!activo) {
    return (
      <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
        <p className="text-sm font-medium text-ink-dim mb-1">Bienvenido</p>
        <p className="text-xs text-ink-muted mb-5 max-w-xs mx-auto">
          Para empezar, crea tu primer negocio.
        </p>
        <Link
          href="/negocios/nuevo"
          className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 transition"
        >
          <IconPlus size={14} />
          Crear primer negocio
        </Link>
      </div>
    );
  }

  /* Los cuatro números del inicio, y de dónde sale cada uno. Se escriben
   * también en la pantalla, debajo de cada cifra: un tablero que no dice qué
   * suma y qué resta obliga a creerle, y nadie le cree dos veces a un número
   * que no cuadra con el banco.
   *
   *   líquido    = lo que hay en las cuentas, hoy
   *   por cobrar = lo vendido que el cliente todavía no paga
   *   por pagar  = lo comprometido con proveedores que todavía no sale
   *   total      = líquido + por cobrar − por pagar
   *
   * El total NO suma las cuentas por pagar: son una deuda. Sumarlas daría un
   * número más grande y más falso. */
  const liquido = cuentas.reduce((s, c) => s + (c.saldo_actual ?? 0), 0);
  const proyectosActivos = proyectos.filter((p) => p.estado !== "cerrado");

  /** Por proyecto, el mismo corte que el de arriba. Nunca en negativo: un
   *  proyecto cobrado de más no es dinero «por cobrar» en contra. */
  const balance = (p: Proyecto) => {
    const porCobrar = Math.max(0, (p.precio_venta ?? 0) - (p.cobrado ?? 0));
    const porPagar = Math.max(0, (p.compromiso_total ?? 0) - (p.pagado ?? 0));
    const liq = (p.cobrado ?? 0) - (p.pagado ?? 0);
    return { porCobrar, porPagar, liquido: liq, total: liq + porCobrar - porPagar };
  };
  const balances = proyectosActivos.map((p) => ({ proyecto: p, ...balance(p) }));
  const porCobrar = balances.reduce((s, b) => s + b.porCobrar, 0);
  const porPagar = balances.reduce((s, b) => s + b.porPagar, 0);
  const capitalTotal = liquido + porCobrar - porPagar;
  const sumaProyectos = balances.reduce(
    (a, b) => ({
      liquido: a.liquido + b.liquido,
      porCobrar: a.porCobrar + b.porCobrar,
      porPagar: a.porPagar + b.porPagar,
      total: a.total + b.total,
    }),
    { liquido: 0, porCobrar: 0, porPagar: 0, total: 0 },
  );

  return (
    <div className="space-y-3">
      <section className="bg-cream rounded-3xl p-6">
        <div className="flex justify-between items-start gap-4">
          <div>
            <p className="text-xs text-ink-muted mb-2 font-medium">
              Capital total de {activo.nombre}
            </p>
            <p className="text-4xl font-medium tracking-tight text-ink-dim leading-none">
              {formatMonto(capitalTotal, activo.moneda)}
            </p>
            <p className="text-xs text-ink-muted mt-2">
              Líquido + por cobrar − por pagar
            </p>
          </div>
          <div className="w-20 h-20 rounded-full bg-sky-50 flex items-center justify-center text-ink shrink-0">
            <IconLeaf size={32} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-white border border-black/5 rounded-2xl p-4">
          <p className="text-xs text-ink-muted font-medium">Capital líquido</p>
          <p className="text-xl font-medium text-ink-dim mt-1 tabular-nums">
            {formatMonto(liquido, activo.moneda)}
          </p>
          <p className="text-[11px] text-ink-muted mt-1">
            Lo que hay hoy en {cuentas.length} {cuentas.length === 1 ? "cuenta" : "cuentas"}
          </p>
        </div>
        <div className="bg-mint-50 rounded-2xl p-4">
          <p className="text-xs text-mint-label font-medium">Cuentas por cobrar</p>
          <p className="text-xl font-medium text-mint-900 mt-1 tabular-nums">
            {formatMonto(porCobrar, activo.moneda)}
          </p>
          <p className="text-[11px] text-mint-label mt-1 opacity-75">
            Vendido que el cliente no ha pagado
          </p>
        </div>
        <div className="bg-mauve-50 rounded-2xl p-4">
          <p className="text-xs text-mauve-label font-medium">Cuentas por pagar</p>
          <p className="text-xl font-medium text-mauve-900 mt-1 tabular-nums">
            {formatMonto(porPagar, activo.moneda)}
          </p>
          <p className="text-[11px] text-mauve-label mt-1 opacity-75">
            Comprometido con proveedores que no ha salido
          </p>
        </div>
      </div>

      {/* El mismo corte, proyecto por proyecto. */}
      <section className="pt-2">
        <div className="flex justify-between items-baseline mb-3">
          <h2 className="text-sm font-medium text-ink-dim">Balance por proyecto</h2>
          <Link href="/proyectos" className="text-xs text-ink-muted hover:text-ink-dim">
            Ver todos →
          </Link>
        </div>
        {balances.length === 0 ? (
          <div className="bg-white border border-black/5 rounded-2xl p-6 text-center">
            <IconFolder size={20} className="text-ink-muted mx-auto mb-2" />
            <p className="text-sm text-ink-dim">Todavía no hay proyectos abiertos</p>
          </div>
        ) : (
          <div className="bg-white border border-black/5 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-ink-muted uppercase tracking-wide">
                  <th className="text-left font-medium px-4 py-2">Proyecto</th>
                  <th className="text-right font-medium px-3 py-2">Líquido</th>
                  <th className="text-right font-medium px-3 py-2">Por cobrar</th>
                  <th className="text-right font-medium px-3 py-2">Por pagar</th>
                  <th className="text-right font-medium px-4 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.proyecto.id} className="border-t border-black/5">
                    <td className="px-4 py-2.5 min-w-0">
                      <Link href={`/proyectos/${b.proyecto.id}`} className="text-ink-dim hover:underline">
                        {b.proyecto.nombre}
                      </Link>
                      <p className="text-[11px] text-ink-muted truncate">{b.proyecto.cliente_nombre}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-dim">
                      {formatMonto(b.liquido, activo.moneda)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-mint-900">
                      {formatMonto(b.porCobrar, activo.moneda)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-mauve-900">
                      {formatMonto(b.porPagar, activo.moneda)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-ink-dim">
                      {formatMonto(b.total, activo.moneda)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-black/10 bg-cream/50">
                  <td className="px-4 py-2.5 text-xs text-ink-muted">
                    {balances.length} {balances.length === 1 ? "proyecto abierto" : "proyectos abiertos"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-dim">
                    {formatMonto(sumaProyectos.liquido, activo.moneda)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-dim">
                    {formatMonto(sumaProyectos.porCobrar, activo.moneda)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-dim">
                    {formatMonto(sumaProyectos.porPagar, activo.moneda)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium text-ink-dim">
                    {formatMonto(sumaProyectos.total, activo.moneda)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-ink-muted mt-2">
          El líquido del proyecto es lo cobrado menos lo pagado a proveedores; no es dinero
          apartado en el banco. El capital líquido de arriba sale de las cuentas.
        </p>
      </section>

      <section className="pt-2">
        <div className="flex justify-between items-baseline mb-3">
          <h2 className="text-sm font-medium text-ink-dim">Cuentas</h2>
          <Link href="/cuentas" className="text-xs text-ink-muted hover:text-ink-dim">
            Ver todas →
          </Link>
        </div>
        {cuentas.length === 0 ? (
          <div className="bg-white border border-black/5 rounded-2xl p-6 text-center">
            <p className="text-xs text-ink-muted mb-3">Aún no tienes cuentas registradas.</p>
            <Link
              href="/cuentas/nueva"
              className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-3.5 py-2 text-xs font-medium hover:bg-ink/90 transition"
            >
              <IconPlus size={12} />
              Crear cuenta
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {cuentas.slice(0, 4).map((c) => {
              const Icon = iconoCuenta(c.tipo);
              return (
                <Link
                  key={c.id}
                  href={`/cuentas/${c.id}`}
                  className="bg-white border border-black/5 rounded-2xl p-3 hover:border-black/20 hover:-translate-y-px transition"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-7 h-7 rounded-full bg-sky-50 text-sky-900 flex items-center justify-center flex-shrink-0">
                      <Icon size={13} />
                    </div>
                    <p className="text-xs font-medium text-ink-dim truncate flex-1">{c.nombre}</p>
                  </div>
                  <p className="text-base font-medium text-ink-dim">
                    {formatMonto(c.saldo_actual, c.moneda)}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {proyectosActivos.length > 0 && (
        <section className="pt-2">
          <div className="flex justify-between items-baseline mb-3">
            <h2 className="text-sm font-medium text-ink-dim">Proyectos activos</h2>
            <Link href="/proyectos" className="text-xs text-ink-muted hover:text-ink-dim">
              Ver todos →
            </Link>
          </div>
          <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
            {proyectosActivos.slice(0, 3).map((p) => (
              <Link
                key={p.id}
                href={`/proyectos/${p.id}`}
                className="flex items-center gap-3 px-4 py-3 border-b border-black/5 last:border-b-0 hover:bg-cream/30 transition"
              >
                <div className="w-8 h-8 rounded-full bg-cream text-ink-muted flex items-center justify-center flex-shrink-0">
                  <IconFolder size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-dim truncate">{p.nombre}</p>
                  <p className="text-[11px] text-ink-muted truncate">{p.cliente_nombre}</p>
                </div>
                <p className="text-sm font-medium text-ink-dim whitespace-nowrap">
                  {formatMonto(p.disponible ?? 0, "MXN")}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="pt-2">
        <div className="flex justify-between items-baseline mb-3">
          <h2 className="text-sm font-medium text-ink-dim">Actividad reciente</h2>
          <Link href="/movimientos" className="text-xs text-ink-muted hover:text-ink-dim">
            Ver todos →
          </Link>
        </div>
        {movimientos.length === 0 ? (
          <div className="bg-white border border-black/5 rounded-2xl p-6 text-center">
            <p className="text-xs text-ink-muted mb-3">Aún no hay movimientos.</p>
            <Link
              href="/movimientos/nuevo"
              className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-3.5 py-2 text-xs font-medium hover:bg-ink/90 transition"
            >
              <IconPlus size={12} />
              Registrar primer movimiento
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
            {movimientos
              .filter((m) => m.tipo === "ingreso" || m.tipo === "egreso")
              .map((m) => {
              const meta = MV_META[m.tipo as "ingreso" | "egreso"];
              const Icon = meta.icon;
              const fecha = m.fecha as Timestamp | undefined;
              const dateStr =
                fecha && typeof fecha.toDate === "function"
                  ? formatDateShort(fecha.toDate())
                  : "—";
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-4 py-3 border-b border-black/5 last:border-b-0"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${meta.color}`}
                  >
                    <Icon size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-dim truncate">
                      {m.descripcion || m.contraparte_nombre}
                    </p>
                    <p className="text-[11px] text-ink-muted truncate">
                      {dateStr} · {m.cuenta_nombre}
                      {m.proyecto_nombre && ` · ${m.proyecto_nombre}`}
                    </p>
                  </div>
                  <p className={`text-sm font-medium whitespace-nowrap ${meta.montoColor}`}>
                    {meta.prefix}
                    {formatMonto(m.monto, activo.moneda)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
