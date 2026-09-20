"use client";

/* El buzón de quien paga.
 *
 * Lo que vence primero, arriba —eso lo ordena el servidor—, y hasta arriba de
 * todo los dos números que se necesitan para decidir el día: cuánto hay por
 * pagar y cuánto vence esta semana.
 *
 * Quién abre este buzón lo decide el servidor: si la persona no está marcada
 * como contadora, la API contesta que no y aquí se dice, sin inventar una
 * lista vacía que parezca que no hay nada pendiente.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBuzon, vencida, type Buzon } from "@/lib/ordenes";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { ErrorApi } from "@/lib/api/cliente";
import { formatMontoExact } from "@/lib/format";
import { Dinero, Estado, Vence } from "@/components/ordenes-ui";
import { IconInbox, IconAlertTriangle } from "@tabler/icons-react";

export default function BuzonPage() {
  const { activo, loading: cargandoNegocio } = useNegocioActivo();
  const [buzon, setBuzon] = useState<Buzon | null>(null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setBuzon(await getBuzon(activo?.id));
      setSinPermiso(false);
    } catch (e) {
      if (e instanceof ErrorApi && e.error === "sin_permiso") setSinPermiso(true);
      else setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, [activo]);

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
      <div className="mb-5">
        <h2 className="text-lg font-medium text-ink-dim">Por pagar</h2>
        <p className="text-xs text-ink-muted mt-0.5">
          Lo que se pidió en {activo?.nombre ?? "este negocio"} y todavía no se paga.
        </p>
      </div>

      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white border border-black/5 rounded-2xl px-4 py-3">
          <p className="text-[11px] text-ink-muted">Hay por pagar</p>
          <p className="text-lg font-medium text-ink-dim tabular-nums">
            {formatMontoExact(buzon?.total ?? 0)}
          </p>
          <p className="text-[11px] text-ink-muted">
            {buzon?.filas.length ?? 0} {(buzon?.filas.length ?? 0) === 1 ? "compra" : "compras"}
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
          <p className="text-sm font-medium text-ink-dim mb-1">El buzón está vacío</p>
          <p className="text-xs text-ink-muted">No hay nada esperando pago.</p>
        </div>
      ) : (
        <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
          {buzon!.filas.map((o) => (
            <Link
              key={o.id}
              href={`/ordenes/${o.id}`}
              className={`flex items-start gap-3 px-4 py-3 border-b border-black/5 last:border-b-0 hover:bg-cream/50 transition ${
                vencida(o) ? "bg-mauve-50/40" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-dim line-clamp-2">{o.concepto}</p>
                <p className="text-[11px] text-ink-muted truncate">
                  {o.folio} · {o.proveedor_nombre || "sin proveedor"} ·{" "}
                  {o.solicitante_nombre || o.solicitante_correo || "alguien"}
                </p>
                <p className="text-[11px] mt-0.5 flex items-center gap-2 flex-wrap">
                  <Vence orden={o} />
                  {o.urgente && (
                    <span className="inline-block rounded-lg px-2 py-0.5 text-[11px] font-medium bg-mauve-50 text-mauve-900">
                      Urgente
                    </span>
                  )}
                  {!o.con_factura && <span className="text-ink-muted">sin factura</span>}
                </p>
              </div>
              <div className="text-right">
                <Dinero orden={o} />
                <div className="mt-1"><Estado orden={o} /></div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
