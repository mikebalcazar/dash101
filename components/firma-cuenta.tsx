"use client";

/* La firma de la cuenta de reembolso (0.99.0).
 *
 * Mike, 14-oct-2026: «ahí mismo ingresa los datos de la cuenta, el
 * beneficiario, y queda como pendiente que suba la carátula bancaria, pero
 * sí firma de que son sus datos y su cuenta bancaria». Se firma con el dedo
 * o el ratón sobre el recuadro, como en supply101 y en roster, y de ahí sale
 * la hoja que queda en el expediente como «Datos bancarios firmados»: los
 * datos arriba, la declaración y la firma abajo, en un PNG. Es la MISMA hoja
 * que arma supply101 (`hojaFirmada` en supply101/publico/app.js).
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { clabeLegible } from "@/lib/ordenes";

type Punto = { x: number; y: number };

export interface DatosDeLaHoja {
  quien: string; empresa: string; clabe: string; banco: string; beneficiario: string;
}

export interface FirmaCuenta {
  /** Hay firma de verdad, no un toque suelto. */
  hay: () => boolean;
  borrar: () => void;
  hoja: (d: DatosDeLaHoja) => Promise<Blob>;
}

export const LienzoFirma = forwardRef<FirmaCuenta, { onFirma?: () => void }>(function LienzoFirma({ onFirma }, ref) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const trazos = useRef<Punto[][]>([]);
  const actual = useRef<Punto[] | null>(null);

  const pintar = useCallback(() => {
    const lz = lienzo.current;
    if (!lz) return;
    const r = lz.getBoundingClientRect();
    const k = window.devicePixelRatio || 1;
    if (r.width && lz.width !== Math.round(r.width * k)) { lz.width = Math.round(r.width * k); lz.height = Math.round(r.height * k); }
    const g = lz.getContext("2d");
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, lz.width, lz.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    g.strokeStyle = "#12324a"; g.lineWidth = 2.4; g.lineCap = "round"; g.lineJoin = "round";
    for (const t of trazos.current) {
      if (t.length < 2) continue;
      g.beginPath(); g.moveTo(t[0].x, t[0].y);
      for (const q of t.slice(1)) g.lineTo(q.x, q.y);
      g.stroke();
    }
  }, []);

  useEffect(() => { pintar(); }, [pintar]);

  const puntoDe = (ev: React.PointerEvent<HTMLCanvasElement>): Punto => {
    const r = ev.currentTarget.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  useImperativeHandle(ref, () => ({
    hay: () => trazos.current.reduce((n, t) => n + t.length, 0) >= 12,
    borrar: () => { trazos.current = []; pintar(); },
    hoja: async (d) => {
      const W = 720, H = 560;
      const lz = document.createElement("canvas"); lz.width = W; lz.height = H;
      const g = lz.getContext("2d")!;
      g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
      g.fillStyle = "#12324a"; g.font = "700 20px Raleway, sans-serif";
      g.fillText("Datos bancarios para reembolsos", 32, 44);
      const filas: [string, string][] = [
        ["NOMBRE", d.quien], ["BANCO", d.banco], ["CLABE", clabeLegible(d.clabe)], ["A NOMBRE DE", d.beneficiario],
      ];
      let y = 84;
      for (const [etq, val] of filas) {
        g.fillStyle = "#6b7a85"; g.font = "600 12px Raleway, sans-serif"; g.fillText(etq, 32, y);
        g.fillStyle = "#12324a"; g.font = "700 17px Raleway, sans-serif"; g.fillText(String(val || "").slice(0, 60), 32, y + 21);
        y += 50;
      }
      g.fillStyle = "#4a5563"; g.font = "500 14px Raleway, sans-serif";
      g.fillText("Declaro que estos datos y esta cuenta bancaria son míos.", 32, y + 10);
      // La firma, escalada y centrada en su recuadro, con su línea y el pie.
      const caja = { x: 180, y: y + 30, w: 360, h: 130 };
      const r = lienzo.current?.getBoundingClientRect();
      const k = Math.min(caja.w / (r?.width || 1), caja.h / (r?.height || 1));
      const dx = caja.x + (caja.w - (r?.width || 0) * k) / 2;
      g.strokeStyle = "#12324a"; g.lineWidth = 2.2; g.lineCap = "round"; g.lineJoin = "round";
      for (const t of trazos.current) {
        if (t.length < 2) continue;
        g.beginPath(); g.moveTo(dx + t[0].x * k, caja.y + t[0].y * k);
        for (const q of t.slice(1)) g.lineTo(dx + q.x * k, caja.y + q.y * k);
        g.stroke();
      }
      const base = caja.y + caja.h + 10;
      g.strokeStyle = "#9aa8b2"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(caja.x, base); g.lineTo(caja.x + caja.w, base); g.stroke();
      const fecha = new Date().toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
      g.fillStyle = "#4a5563"; g.font = "500 13px Raleway, sans-serif"; g.textAlign = "center";
      g.fillText("Firma", W / 2, base + 20);
      g.fillStyle = "#6b7a85"; g.font = "500 12px Raleway, sans-serif";
      g.fillText(`${d.empresa} · ${fecha}`, W / 2, base + 40);
      return await new Promise<Blob>((res, rej) => lz.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo armar la hoja firmada"))), "image/png"));
    },
  }), [pintar]);

  return (
    <div>
      <canvas
        ref={lienzo} data-firma
        aria-label="Firma aquí con el dedo o el ratón"
        className="block w-full h-32 bg-white border border-dashed border-ink/25 rounded-xl touch-none cursor-crosshair"
        onPointerDown={(ev) => {
          ev.preventDefault();
          pintar();
          actual.current = [puntoDe(ev)];
          trazos.current.push(actual.current);
          try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* sin captura, igual se dibuja */ }
        }}
        onPointerMove={(ev) => {
          if (!actual.current) return;
          actual.current.push(puntoDe(ev));
          pintar();
        }}
        onPointerUp={() => { actual.current = null; onFirma?.(); }}
        onPointerCancel={() => { actual.current = null; onFirma?.(); }}
      />
      <button
        type="button" className="text-xs text-ink-muted hover:text-ink-dim mt-1" data-borrar-firma
        onClick={() => { trazos.current = []; pintar(); onFirma?.(); }}
      >
        Borrar la firma
      </button>
    </div>
  );
});
