"use client";

/* El buzón de quien paga: compras y reembolsos, en dos pestañas (0.47.0).
 *
 * Lo que vence primero, arriba —eso lo ordena el servidor—, y hasta arriba de
 * todo los dos números que se necesitan para decidir el día: cuánto hay por
 * pagar y cuánto vence esta semana. Cada pestaña trae los SUYOS: el servidor
 * filtra por tipo y suma sólo eso, así que la cifra de arriba siempre es la
 * suma de los renglones de abajo.
 *
 * Mike, 28-sep-2026: «en el buzón de dash de las órdenes de compra pendientes,
 * poner una pestaña en el mismo módulo de reembolsos pendientes. Pero que
 * funcione igual». Y funciona igual: pagar, devolver y rechazar son los
 * mismos botones en la misma pantalla de la orden.
 *
 * Quién abre este buzón lo decide el servidor: si la persona no está marcada
 * como contadora, la API contesta que no y aquí se dice, sin inventar una
 * lista vacía que parezca que no hay nada pendiente.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getBuzon, vencida, type Buzon, type TipoOrden } from "@/lib/ordenes";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { ErrorApi } from "@/lib/api/cliente";
import { formatMontoExact } from "@/lib/format";
import { FilasBuzon } from "@/components/ordenes-ui";
import { IconInbox, IconAlertTriangle } from "@tabler/icons-react";

const PESTANAS: Array<{ tipo: TipoOrden; titulo: string; una: string; varias: string }> = [
  { tipo: "compra", titulo: "Compras", una: "compra", varias: "compras" },
  { tipo: "reembolso", titulo: "Reembolsos", una: "reembolso", varias: "reembolsos" },
];

export default function BuzonPage() {
  const { activo, loading: cargandoNegocio } = useNegocioActivo();
  const params = useSearchParams();
  // `?tipo=reembolso` abre en esa pestaña: es la liga del inicio.
  const [pestana, setPestana] = useState<TipoOrden>(params.get("tipo") === "reembolso" ? "reembolso" : "compra");
  const [buzones, setBuzones] = useState<Record<TipoOrden, Buzon> | null>(null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      // Las dos pestañas de una vez: el conteo de la otra se ve en su
      // solapa sin tener que abrirla, y cambiar de pestaña no espera red.
      const [compra, reembolso] = await Promise.all([getBuzon(activo?.id, "compra"), getBuzon(activo?.id, "reembolso")]);
      setBuzones({ compra, reembolso });
      setSinPermiso(false);
    } catch (e) {
      if (e instanceof ErrorApi && e.error === "sin_permiso") setSinPermiso(true);
      else setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, [activo]);

  const buzon = buzones?.[pestana] ?? null;
  const p = PESTANAS.find((x) => x.tipo === pestana)!;

  useEffect(() => {
    if (cargandoNegocio) return;
    void cargar();
  }, [cargandoNegocio, cargar]);

  if (cargando) return <div className="text-sm text-ink-muted">Cargando…</div>;

  if (sinPermiso) {
    return (
      <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
        <IconInbox size={22} className="text-ink-muted mx-auto mb-2" />
        <p className="text-sm font-medium text-ink-dim mb-1">Este buzón no es tuyo</p>
        <p className="text-xs text-ink-muted">
          Lo abre quien está marcado para pagar. Quien manda en la empresa reparte esa marca desde Equipo.
        </p>
        <Link href="/ordenes" className="text-xs text-ink-dim underline mt-3 inline-block">
          Ver mis compras
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-medium text-ink-dim">Por pagar</h2>
        <p className="text-xs text-ink-muted mt-0.5">
          Lo que se pidió en la empresa y todavía no se paga.
        </p>
      </div>

      <div className="flex gap-1 bg-white border border-black/5 rounded-2xl p-1 mb-4" role="tablist">
        {PESTANAS.map((t) => {
          const n = buzones?.[t.tipo].filas.length ?? 0;
          const activa = pestana === t.tipo;
          return (
            <button
              key={t.tipo} role="tab" aria-selected={activa} data-pestana={t.tipo}
              onClick={() => setPestana(t.tipo)}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                activa ? "bg-ink text-cream" : "text-ink-dim hover:bg-cream"
              }`}
            >
              {t.titulo}
              <span className={`ml-1.5 tabular-nums ${activa ? "text-cream/70" : "text-ink-muted"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-black/5 rounded-2xl px-4 py-3">
          <p className="text-[11px] text-ink-muted">Hay por pagar</p>
          <p className="text-lg font-medium text-ink-dim tabular-nums" data-total={pestana}>
            {formatMontoExact(buzon?.total ?? 0)}
          </p>
          <p className="text-[11px] text-ink-muted">
            {buzon?.filas.length ?? 0} {(buzon?.filas.length ?? 0) === 1 ? p.una : p.varias}
          </p>
        </div>
        <div className="bg-white border border-black/5 rounded-2xl px-4 py-3">
          <p className="text-[11px] text-ink-muted">Vence esta semana</p>
          <p className="text-lg font-medium text-ink-dim tabular-nums">
            {formatMontoExact(buzon?.vence_esta_semana ?? 0)}
          </p>
          {(buzon?.vencidas ?? 0) > 0 && (
            <p className="text-[11px] text-mauve-900 flex items-center gap-1">
              <IconAlertTriangle size={12} /> {buzon?.vencidas} ya vencida{buzon?.vencidas === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </div>

      {(buzon?.filas.length ?? 0) === 0 ? (
        <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
          <p className="text-sm font-medium text-ink-dim mb-1">
            {pestana === "reembolso" ? "No hay reembolsos pendientes" : "No hay compras pendientes"}
          </p>
          <p className="text-xs text-ink-muted">Nada de esto está esperando pago.</p>
        </div>
      ) : (
        <FilasBuzon filas={buzon!.filas} />
      )}
    </div>
  );
}
