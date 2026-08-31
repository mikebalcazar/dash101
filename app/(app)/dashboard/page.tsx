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

  const capitalTotal = cuentas.reduce((s, c) => s + (c.saldo_actual ?? 0), 0);
  const proyectosActivos = proyectos.filter((p) => p.estado !== "cerrado");
  const totalDisponibleProyectos = proyectosActivos.reduce(
    (s, p) => s + (p.disponible ?? 0),
    0
  );

  const now = new Date();
  const mesActual = now.getMonth();
  const anoActual = now.getFullYear();
  const totalesMes = movimientos.reduce(
    (acc, m) => {
      const f = m.fecha as Timestamp | undefined;
      if (!f || typeof f.toDate !== "function") return acc;
      const d = f.toDate();
      if (d.getMonth() !== mesActual || d.getFullYear() !== anoActual) return acc;
      if (m.tipo === "ingreso") acc.ingresos += m.monto;
      else if (m.tipo === "egreso") acc.egresos += m.monto;
      return acc;
    },
    { ingresos: 0, egresos: 0 }
  );

  return (
    <div className="space-y-3">
      <section className="bg-cream rounded-3xl p-6 flex justify-between items-center gap-4">
        <div>
          <p className="text-xs text-ink-muted mb-2 font-medium">
            Capital en cuentas de {activo.nombre}
          </p>
          <p className="text-4xl font-medium tracking-tight text-ink-dim leading-none">
            {formatMonto(capitalTotal, activo.moneda)}
          </p>
          <p className="text-xs text-ink-muted mt-2">
            {cuentas.length === 0
              ? "Sin cuentas registradas"
              : `Suma de ${cuentas.length} ${cuentas.length === 1 ? "cuenta" : "cuentas"}`}
          </p>
        </div>
        <div className="w-20 h-20 rounded-full bg-sky-50 flex items-center justify-center text-ink shrink-0">
          <IconLeaf size={32} />
        </div>
      </section>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-mint-50 rounded-2xl p-4">
          <p className="text-xs text-mint-label font-medium">Cobrado mes</p>
          <p className="text-xl font-medium text-mint-900 mt-1">
            {formatMonto(totalesMes.ingresos, activo.moneda, { short: true })}
          </p>
          <p className="text-[11px] text-mint-label mt-1 opacity-75">
            {new Intl.DateTimeFormat("es-MX", { month: "long" }).format(now)}
          </p>
        </div>
        <div className="bg-mauve-50 rounded-2xl p-4">
          <p className="text-xs text-mauve-label font-medium">Pagado mes</p>
          <p className="text-xl font-medium text-mauve-900 mt-1">
            {formatMonto(totalesMes.egresos, activo.moneda, { short: true })}
          </p>
          <p className="text-[11px] text-mauve-label mt-1 opacity-75">
            {new Intl.DateTimeFormat("es-MX", { month: "long" }).format(now)}
          </p>
        </div>
        <div className="bg-sky-50 rounded-2xl p-4">
          <p className="text-xs text-sky-label font-medium">Disponible proyectos</p>
          <p className="text-xl font-medium text-sky-900 mt-1">
            {formatMonto(totalDisponibleProyectos, activo.moneda, { short: true })}
          </p>
          <p className="text-[11px] text-sky-label mt-1 opacity-75">
            {proyectosActivos.length} activos
          </p>
        </div>
      </div>

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
