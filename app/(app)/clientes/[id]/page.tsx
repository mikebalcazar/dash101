"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getCliente, updateCliente, deleteCliente } from "@/lib/clientes";
import { estadoDeCuenta, ligaDelExcelDelCliente, type EstadoDeCuenta } from "@/lib/estado-cuenta";
import type { Cliente } from "@/types/schema";
import { IconArrowLeft, IconTrash, IconPrinter, IconFileSpreadsheet, IconPencil } from "@tabler/icons-react";
import { AccesoPortal } from "@/components/acceso-portal";
import { FusionarCliente } from "@/components/fusionar-cliente";
import { DocumentoEstadoDeCuenta } from "@/components/estado-de-cuenta-cliente";
import { useNegocioActivo } from "@/lib/negocio-activo-context";

/* LA PANTALLA DEL CLIENTE ES SU ESTADO DE CUENTA, no el formulario.
 *
 * Mike, 1-oct-2026: «Cuando entro a la pantalla de un cliente, no debo poder
 * editar luego luego sus datos, sino ver su estado de cuenta completo (todos
 * los movimientos de ese cliente de todos sus proyectos) y aparte poder ver
 * por proyecto sus movimientos. Y debo poder exportar su estado de cuenta
 * general y por proyecto».
 *
 * Abre con el documento: cada renglón de proyecto lleva a la hoja de ese
 * proyecto (con su PDF y su Excel), y arriba están el PDF y el Excel del
 * general. Los datos se editan sólo al picar «Editar datos»: el formulario,
 * el acceso al portal, la fusión y la zona peligrosa se despliegan abajo. */

export default function ClienteDetallePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { activo } = useNegocioActivo();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [nombre, setNombre] = useState("");
  const [rfc, setRfc] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [estado, setEstado] = useState<EstadoDeCuenta | null>(null);
  const [errorEstado, setErrorEstado] = useState("");
  const [editar, setEditar] = useState(false);

  const cargarEstado = () =>
    estadoDeCuenta(id)
      .then((d) => { setEstado(d); setErrorEstado(""); })
      .catch((e) => setErrorEstado(e instanceof Error ? e.message : "No se pudo abrir el estado de cuenta."));

  const recargar = () =>
    getCliente(id).then((c) => {
      if (c) setCliente(c);
      void cargarEstado();
    });

  useEffect(() => {
    if (!id) return;
    void cargarEstado();
    getCliente(id)
      .then((c) => {
        if (!c) {
          setError("Cliente no encontrado");
          return;
        }
        setCliente(c);
        setNombre(c.nombre);
        setRfc(c.rfc ?? "");
        setEmail(c.email ?? "");
        setTelefono(c.telefono ?? "");
        setNotas(c.notas ?? "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await updateCliente(id, {
        nombre: nombre.trim(),
        rfc: rfc.trim() || undefined,
        email: email.trim() || undefined,
        telefono: telefono.trim() || undefined,
        notas: notas.trim() || undefined,
      });
      setNotice("Cambios guardados");
      setTimeout(() => setNotice(""), 2000);
      void cargarEstado();
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
      await deleteCliente(id);
      router.push("/clientes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar");
      setDeleting(false);
    }
  };

  if (loading) return <div className="text-sm text-ink-muted">Cargando…</div>;
  if (!cliente && error)
    return (
      <div>
        <Link href="/clientes" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
      </div>
    );

  return (
    <div className="max-w-4xl">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 mb-4">
        <Link
          href="/clientes"
          className="text-xs text-ink-muted inline-flex items-center gap-1 hover:text-ink-dim transition"
        >
          <IconArrowLeft size={13} />
          Volver a clientes
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-ink text-cream rounded-xl px-3 py-2 text-sm font-medium inline-flex items-center gap-1.5"
          >
            <IconPrinter size={15} /> Guardar como PDF
          </button>
          <a
            href={ligaDelExcelDelCliente(id)}
            data-excel-cliente
            className="text-sm text-ink-dim inline-flex items-center gap-1.5 bg-white border border-black/10 rounded-xl px-3 py-2 hover:border-black/20 transition"
          >
            <IconFileSpreadsheet size={15} /> Excel
          </a>
          <button
            type="button"
            onClick={() => setEditar((v) => !v)}
            aria-expanded={editar}
            data-editar
            className="text-sm text-ink-dim inline-flex items-center gap-1.5 bg-white border border-black/10 rounded-xl px-3 py-2 hover:border-black/20 transition"
          >
            <IconPencil size={15} /> {editar ? "Cerrar la edición" : "Editar datos"}
          </button>
        </div>
      </div>

      <section data-seccion="estado">
        {estado ? (
          <DocumentoEstadoDeCuenta d={estado} />
        ) : (
          <p className="text-sm text-ink-muted">{errorEstado || "Cargando el estado de cuenta…"}</p>
        )}
      </section>

      {editar && (
      <section data-seccion="editar" className="print:hidden max-w-lg mt-10 pt-6 border-t border-black/10">
      <h2 className="text-lg font-medium text-ink-dim">Datos del cliente</h2>

      <form onSubmit={handleSave} className="space-y-4 mt-6">
        <div>
          <label htmlFor="cliente-nombre" className="text-xs font-medium text-ink-dim block mb-1.5">
            Nombre o razón social <span className="text-mauve-900">*</span>
          </label>
          <input
            id="cliente-nombre"
            type="text"
            required
            maxLength={100}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
        </div>

        <div>
          <label htmlFor="cliente-rfc" className="text-xs font-medium text-ink-dim block mb-1.5">RFC</label>
          <input
            id="cliente-rfc"
            type="text"
            maxLength={13}
            value={rfc}
            onChange={(e) => setRfc(e.target.value.toUpperCase())}
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 uppercase transition"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cliente-email" className="text-xs font-medium text-ink-dim block mb-1.5">Email</label>
            <input
              id="cliente-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>
          <div>
            <label htmlFor="cliente-telefono" className="text-xs font-medium text-ink-dim block mb-1.5">Teléfono</label>
            <input
              id="cliente-telefono"
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
            />
          </div>
        </div>

        <div>
          <label htmlFor="cliente-notas" className="text-xs font-medium text-ink-dim block mb-1.5">Notas</label>
          <textarea
            id="cliente-notas"
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
          <button
            type="button"
            onClick={() => setEditar(false)}
            className="bg-transparent border border-black/15 rounded-xl px-4 py-2 text-sm text-ink-dim hover:bg-white transition"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !nombre.trim()}
            className="bg-ink text-cream rounded-xl px-5 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>

      {cliente && <AccesoPortal cliente={cliente} emailSugerido={email} onChange={recargar} />}

      {/* Juntar dos que son el mismo (contrato 0.23.0). */}
      {cliente && activo?.id && (
        <FusionarCliente cliente={cliente} negocioId={activo.id} onFusionado={recargar} />
      )}

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
            Eliminar cliente
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
      </section>
      )}
    </div>
  );
}
