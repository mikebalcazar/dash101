"use client";

import { useState } from "react";
import type { Cliente } from "@/types/schema";
import {
  activarAccesoPortal,
  desactivarAccesoPortal,
  enviarCambioPin,
  validarPin,
  PORTAL_URL,
} from "@/lib/portal";
import { IconKey, IconExternalLink, IconMailForward, IconUserOff } from "@tabler/icons-react";

const inputCls =
  "w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition";

/**
 * Sección «Portal del cliente» en la ficha del cliente.
 * Activa el acceso (correo + PIN), manda liga para cambiar PIN, desactiva.
 */
export function AccesoPortal({
  cliente,
  emailSugerido,
  onChange,
}: {
  cliente: Cliente;
  emailSugerido: string;
  onChange: () => Promise<void> | void;
}) {
  const [correo, setCorreo] = useState(cliente.portal_email || emailSugerido || "");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmOff, setConfirmOff] = useState(false);

  const activo = !!cliente.portal_activo && !!cliente.uid;
  const reactivable = !activo && !!cliente.uid && cliente.portal_email === correo.trim().toLowerCase();

  const run = async (fn: () => Promise<string>) => {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const msg = await fn();
      setNotice(msg);
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const activar = () =>
    run(async () => {
      const r = await activarAccesoPortal(cliente, correo, pin);
      setPin("");
      return r.reactivado
        ? `Acceso reactivado · ${r.proyectos} proyectos, ${r.movimientos} ingresos visibles`
        : `Acceso creado · ${r.proyectos} proyectos, ${r.movimientos} ingresos visibles. Entrega al cliente su correo y PIN.`;
    });

  const desactivar = () =>
    run(async () => {
      await desactivarAccesoPortal(cliente);
      setConfirmOff(false);
      return "Acceso desactivado. El cliente ya no ve nada.";
    });

  const cambiarPin = () =>
    run(async () => {
      await enviarCambioPin(cliente.portal_email!);
      return `Liga enviada a ${cliente.portal_email}`;
    });

  const pinErr = pin ? validarPin(pin) : null;

  return (
    <div className="mt-10 pt-6 border-t border-black/5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-medium text-ink-dim uppercase tracking-wide flex items-center gap-1.5">
          <IconKey size={13} />
          Portal del cliente
        </h3>
        <a
          href={PORTAL_URL}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-ink-muted hover:text-ink-dim inline-flex items-center gap-1"
        >
          {PORTAL_URL.replace(/^https?:\/\//, "")}
          <IconExternalLink size={11} />
        </a>
      </div>
      <p className="text-xs text-ink-muted mb-3">
        El cliente entra con su correo y un PIN de 6 dígitos. Solo ve sus proyectos, productos e
        ingresos. Nada de proveedores ni márgenes.
      </p>

      {activo ? (
        <div className="bg-mint-50 rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-center gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-mint-label font-medium">
                Acceso activo
              </p>
              <p className="text-sm text-mint-900 font-medium truncate">{cliente.portal_email}</p>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 text-mint-900">
              activo
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={cambiarPin}
              disabled={busy}
              className="inline-flex items-center gap-1.5 bg-white border border-black/10 rounded-xl px-3 py-1.5 text-xs hover:border-black/20 disabled:opacity-50 transition"
            >
              <IconMailForward size={13} />
              Enviar liga para cambiar PIN
            </button>
            {!confirmOff ? (
              <button
                type="button"
                onClick={() => setConfirmOff(true)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-xs text-mauve-900 px-3 py-1.5 hover:underline disabled:opacity-50"
              >
                <IconUserOff size={13} />
                Desactivar
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 text-xs">
                <span className="text-mauve-900">¿Quitar acceso?</span>
                <button type="button" onClick={() => setConfirmOff(false)} className="underline">
                  No
                </button>
                <button
                  type="button"
                  onClick={desactivar}
                  disabled={busy}
                  className="bg-mauve-900 text-cream rounded-lg px-2.5 py-1 font-medium disabled:opacity-40"
                >
                  Sí, quitar
                </button>
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-black/5 rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div>
              <label className="text-xs font-medium text-ink-dim block mb-1.5">
                Correo de acceso
              </label>
              <input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="cliente@correo.com"
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-dim block mb-1.5">PIN</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6 dígitos"
                disabled={reactivable}
                className={`${inputCls} text-center tracking-[0.3em] font-medium disabled:opacity-40`}
              />
            </div>
          </div>
          {reactivable ? (
            <p className="text-[11px] text-ink-muted">
              Este correo ya tiene usuario. Se reactiva con el PIN que ya tenía.
            </p>
          ) : pinErr ? (
            <p className="text-[11px] text-mauve-900">{pinErr}</p>
          ) : (
            <p className="text-[11px] text-ink-muted">
              El PIN no se puede consultar después. Anótalo y entrégaselo al cliente.
            </p>
          )}
          <button
            type="button"
            onClick={activar}
            disabled={busy || !correo.trim() || (!reactivable && (pin.length !== 6 || !!pinErr))}
            className="bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
          >
            {busy ? "Activando…" : reactivable ? "Reactivar acceso" : "Activar acceso"}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
      )}
      {notice && (
        <p className="mt-3 text-xs text-mint-900 bg-mint-50 px-3 py-2 rounded-xl">{notice}</p>
      )}
    </div>
  );
}
