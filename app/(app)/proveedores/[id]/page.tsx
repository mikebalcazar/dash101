"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getProveedor, updateProveedor, deleteProveedor } from "@/lib/proveedores";
import type { Proveedor } from "@/types/schema";
import { IconArrowLeft, IconTrash } from "@tabler/icons-react";

export default function ProveedorDetallePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [rfc, setRfc] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [terminosPago, setTerminosPago] = useState("");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!id) return;
    getProveedor(id)
      .then((p) => {
        if (!p) {
          setError("Proveedor no encontrado");
          return;
        }
        setProveedor(p);
        setNombre(p.nombre);
        setCategoria(p.categoria ?? "");
        setRfc(p.rfc ?? "");
        setEmail(p.email ?? "");
        setTelefono(p.telefono ?? "");
        setTerminosPago(p.terminos_pago_default ?? "");
        setNotas(p.notas ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await updateProveedor(id, {
        nombre: nombre.trim(),
        categoria: categoria.trim() || undefined,
        rfc: rfc.trim() || undefined,
        email: email.trim() || undefined,
        telefono: telefono.trim() || undefined,
        terminos_pago_default: terminosPago.trim() || undefined,
        notas: notas.trim() || undefined,
      });
      setNotice("Cambios guardados");
      setTimeout(() => setNotice(""), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setError("");
    setDeleting(true);
    try {
      await deleteProveedor(id);
      router.push("/proveedores");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
      setDeleting(false);
    }
  };

  if (loading) return <div className="text-sm text-ink-muted">Cargando…</div>;
  if (!proveedor && error)
    return (
      <div>
        <Link href="/proveedores" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
      </div>
    );

  return (
    <div className="max-w-lg">
      <Link
        href="/proveedores"
        className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition"
      >
        <IconArrowLeft size={13} />
        Volver a proveedores
      </Link>

      <h2 className="text-lg font-medium text-ink-dim">Editar proveedor</h2>

      <form onSubmit={handleSave} className="space-y-4 mt-6">
        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">
            Nombre <span className="text-mauve-900">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={100}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Categoría</label>
            <input
              type="text"
              maxLength={40}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">RFC</label>
            <input
              type="text"
              maxLength={13}
              value={rfc}
              onChange={(e) => setRfc(e.target.value.toUpperCase())}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 uppercase transition"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">Teléfono</label>
            <input
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">
            Términos de pago (default)
          </label>
          <input
            type="text"
            maxLength={80}
            value={terminosPago}
            onChange={(e) => setTerminosPago(e.target.value)}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Notas</label>
          <textarea
            maxLength={500}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 resize-none transition"
          />
        </div>

        {error && (
          <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
        )}
        {notice && (
          <p className="text-xs text-mint-900 bg-mint-50 px-3 py-2 rounded-xl">{notice}</p>
        )}

        <div className="flex gap-2 pt-2">
          <Link
            href="/proveedores"
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
      </form>

      <div className="mt-10 pt-6 border-t border-mauve-50">
        <h3 className="text-xs font-medium text-mauve-900 uppercase tracking-wide mb-2">
          Zona peligrosa
        </h3>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="inline-flex items-center gap-1.5 border border-mauve-50 text-mauve-900 rounded-xl px-3 py-2 text-sm hover:bg-mauve-50 transition"
          >
            <IconTrash size={14} />
            Eliminar proveedor
          </button>
        ) : (
          <div className="bg-mauve-50 rounded-xl p-3 flex gap-2 items-center">
            <span className="text-xs text-mauve-900 flex-1">¿Confirmar eliminación?</span>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="text-xs text-mauve-900 px-2 py-1.5 hover:underline"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-mauve-900 text-cream rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40 transition"
            >
              {deleting ? "Eliminando…" : "Sí, eliminar"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
