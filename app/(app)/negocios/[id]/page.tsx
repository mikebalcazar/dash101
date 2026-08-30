"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { getNegocio, updateNegocio, deleteNegocio } from "@/lib/negocios";
import type { Negocio, Moneda } from "@/types/schema";
import { IconArrowLeft, IconTrash } from "@tabler/icons-react";

export default function NegocioDetallePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { user } = useAuth();
  const { refresh } = useNegocioActivo();

  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [rfc, setRfc] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("MXN");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!id) return;
    getNegocio(id)
      .then((n) => {
        if (!n) {
          setError("Negocio no encontrado");
          return;
        }
        setNegocio(n);
        setNombre(n.nombre);
        setDescripcion(n.descripcion ?? "");
        setRfc(n.rfc ?? "");
        setMoneda(n.moneda);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error al cargar"))
      .finally(() => setLoading(false));
  }, [id]);

  const isOwner = user && negocio && negocio.owner_uid === user.uid;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await updateNegocio(id, {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        rfc: rfc.trim() || undefined,
        moneda,
      });
      await refresh();
      setNotice("Cambios guardados");
      setTimeout(() => setNotice(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    setError("");
    setDeleting(true);
    try {
      await deleteNegocio(id, user.uid);
      await refresh();
      router.push("/negocios");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
      setDeleting(false);
    }
  };

  if (loading) return <div className="text-sm text-ink-muted">Cargando…</div>;
  if (!negocio && error)
    return (
      <div>
        <Link href="/negocios" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
      </div>
    );

  return (
    <div className="max-w-lg">
      <Link
        href="/negocios"
        className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition"
      >
        <IconArrowLeft size={13} />
        Volver a negocios
      </Link>

      <h2 className="text-lg font-medium text-ink-dim">Editar negocio</h2>
      <p className="text-xs text-ink-muted mt-0.5 mb-6">
        {isOwner ? "Eres el propietario" : "Solo lectura — no eres propietario"}
      </p>

      <form onSubmit={handleSave} className="space-y-4">
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

        {error && (
          <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
        )}
        {notice && (
          <p className="text-xs text-mint-900 bg-mint-50 px-3 py-2 rounded-xl">{notice}</p>
        )}

        {isOwner && (
          <div className="flex gap-2 pt-2">
            <Link
              href="/negocios"
              className="bg-transparent border border-black/15 rounded-xl px-4 py-2 text-sm text-ink-dim hover:bg-white transition"
            >
              Cancelar
            </Link>
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

      {isOwner && (
        <div className="mt-10 pt-6 border-t border-mauve-50">
          <h3 className="text-xs font-medium text-mauve-900 uppercase tracking-wide mb-2">
            Zona peligrosa
          </h3>
          <p className="text-xs text-ink-muted mb-3">
            Eliminar este negocio también eliminará el acceso desde tu perfil. Cuentas,
            clientes y proyectos asociados <strong>no</strong> se borran (huerfanean).
          </p>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 border border-mauve-50 text-mauve-900 rounded-xl px-3 py-2 text-sm hover:bg-mauve-50 transition"
            >
              <IconTrash size={14} />
              Eliminar negocio
            </button>
          ) : (
            <div className="bg-mauve-50 rounded-xl p-3 space-y-2">
              <p className="text-xs text-mauve-900">
                ¿Seguro? Escribe <strong>{negocio!.nombre}</strong> para confirmar.
              </p>
              <ConfirmDeleteInput
                expected={negocio!.nombre}
                onConfirm={handleDelete}
                onCancel={() => setConfirmDelete(false)}
                loading={deleting}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConfirmDeleteInput({
  expected,
  onConfirm,
  onCancel,
  loading,
}: {
  expected: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [text, setText] = useState("");
  const match = text.trim() === expected;
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={expected}
        className="flex-1 bg-white border border-mauve-50 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
        autoFocus
      />
      <button
        onClick={onCancel}
        disabled={loading}
        className="text-xs text-mauve-900 px-2 py-1.5 hover:underline"
      >
        Cancelar
      </button>
      <button
        onClick={onConfirm}
        disabled={!match || loading}
        className="bg-mauve-900 text-cream rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40 transition"
      >
        {loading ? "Eliminando…" : "Confirmar"}
      </button>
    </div>
  );
}
