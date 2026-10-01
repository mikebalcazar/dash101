"use client";

/* Configuración.
 *
 * Mike, 29-sep-2026, con la pantalla enfrente: «ya puedes quitar ese menú
 * [Negocio] y pasarlo a configuración». El menú tenía «Configuración»
 * apuntando a /settings desde el principio, y /settings no existía. Ahora
 * existe y trae el negocio de la empresa: nombre, descripción, RFC y
 * moneda. Un solo negocio (contrato 0.50.0): si por lo que sea todavía hay
 * varios, de aquí se va a juntarlos; si no hay ninguno, a dar de alta el
 * primero.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { updateNegocio } from "@/lib/negocios";
import type { Moneda } from "@/types/schema";
import { IconBuildingStore, IconArrowsJoin, IconPlus } from "@tabler/icons-react";

export default function ConfiguracionPage() {
  const { user } = useAuth();
  const { negocios, loading, refresh } = useNegocioActivo();
  const negocio = negocios.length === 1 ? negocios[0] : null;

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [rfc, setRfc] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("MXN");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!negocio) return;
    setNombre(negocio.nombre);
    setDescripcion(negocio.descripcion ?? "");
    setRfc(negocio.rfc ?? "");
    setMoneda(negocio.moneda);
  }, [negocio]);

  const isOwner = !!(user && negocio && (!negocio.owner_uid || negocio.owner_uid === user.uid));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!negocio?.id) return;
    setError(""); setNotice(""); setSaving(true);
    try {
      await updateNegocio(negocio.id, {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        rfc: rfc.trim() || undefined,
        moneda,
      });
      await refresh();
      setNotice("Cambios guardados");
      setTimeout(() => setNotice(""), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-medium text-ink-dim">Configuración</h2>
      <p className="text-xs text-ink-muted mt-0.5 mb-6">Lo de la empresa que se ajusta una vez y se queda.</p>

      <section className="bg-white border border-black/5 rounded-2xl p-4" data-configuracion-empresa>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-full bg-mint-50 text-mint-900 flex items-center justify-center flex-shrink-0">
            <IconBuildingStore size={16} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-ink-dim">Empresa</h3>
            <p className="text-[11px] text-ink-muted">Su nombre, su RFC y su moneda.</p>
          </div>
        </div>

        {loading || !negocio ? (
          <p className="text-xs text-ink-muted">Cargando…</p>
        ) : (
          <form onSubmit={guardar} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-ink-dim block mb-1.5">
                Nombre <span className="text-mauve-900">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={80}
                value={nombre}
                disabled={!isOwner}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition disabled:opacity-60"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-dim block mb-1.5">Descripción</label>
              <textarea
                maxLength={200}
                value={descripcion}
                disabled={!isOwner}
                onChange={(e) => setDescripcion(e.target.value)}
                rows={2}
                className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 resize-none transition disabled:opacity-60"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-ink-dim block mb-1.5">RFC</label>
                <input
                  type="text"
                  maxLength={13}
                  value={rfc}
                  disabled={!isOwner}
                  onChange={(e) => setRfc(e.target.value.toUpperCase())}
                  className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 uppercase transition disabled:opacity-60"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-dim block mb-1.5">Moneda</label>
                <select
                  value={moneda}
                  disabled={!isOwner}
                  onChange={(e) => setMoneda(e.target.value as Moneda)}
                  className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition disabled:opacity-60"
                >
                  <option value="MXN">MXN — Peso mexicano</option>
                  <option value="USD">USD — Dólar</option>
                </select>
              </div>
            </div>
            {error && <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>}
            {notice && <p className="text-xs text-mint-900 bg-mint-50 px-3 py-2 rounded-xl">{notice}</p>}
            {isOwner && (
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={saving || !nombre.trim()}
                  className="bg-ink text-cream rounded-xl px-5 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
                >
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
