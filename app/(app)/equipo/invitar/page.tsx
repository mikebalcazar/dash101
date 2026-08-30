"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import { createInvitacion } from "@/lib/invitaciones";
import { listProyectos } from "@/lib/proyectos";
import type { Proyecto, RolMiembro, ScopeMiembro } from "@/types/schema";
import { ROL_LABELS, ROL_DESCRIPCION } from "@/types/schema";
import { IconArrowLeft, IconCopy, IconCheck } from "@tabler/icons-react";

export default function InvitarPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { activo } = useNegocioActivo();

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loadingProy, setLoadingProy] = useState(true);

  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<RolMiembro>("socio");
  const [scope, setScope] = useState<ScopeMiembro>("all");
  const [proyectosSeleccionados, setProyectosSeleccionados] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!activo?.id) return;
    listProyectos(activo.id)
      .then(setProyectos)
      .finally(() => setLoadingProy(false));
  }, [activo]);

  if (!activo) {
    return (
      <div>
        <Link href="/equipo" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-ink-muted">Selecciona un negocio primero.</p>
      </div>
    );
  }

  const esOwner = user && activo.owner_uid === user.uid;
  if (!esOwner) {
    return (
      <div>
        <Link href="/equipo" className="text-xs text-ink-muted hover:text-ink-dim">
          ← Volver
        </Link>
        <p className="mt-4 text-sm text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">
          Solo el propietario del negocio puede invitar miembros.
        </p>
      </div>
    );
  }

  const toggleProyecto = (id: string) => {
    setProyectosSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError("");

    const emailLc = email.trim().toLowerCase();
    if (!emailLc.includes("@")) {
      setError("Email inválido");
      return;
    }
    if (emailLc === user.email?.toLowerCase()) {
      setError("No puedes invitarte a ti mismo");
      return;
    }
    if (scope === "proyectos" && proyectosSeleccionados.length === 0) {
      setError("Selecciona al menos un proyecto");
      return;
    }

    const proyectosLabels = proyectosSeleccionados.map((id) => {
      const p = proyectos.find((pr) => pr.id === id);
      return p ? `${p.nombre} — ${p.cliente_nombre}` : id;
    });

    setSubmitting(true);
    try {
      const id = await createInvitacion({
        email: emailLc,
        negocio_id: activo.id!,
        negocio_nombre: activo.nombre,
        invited_by_uid: user.uid,
        invited_by_nombre: user.displayName ?? user.email ?? "",
        invited_by_email: user.email ?? "",
        rol,
        scope,
        proyectos_ids: scope === "proyectos" ? proyectosSeleccionados : undefined,
        proyectos_labels: scope === "proyectos" ? proyectosLabels : undefined,
      });
      const url = `${window.location.origin}/invite/${id}`;
      setInviteLink(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear invitación");
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (inviteLink) {
    return (
      <div className="max-w-lg">
        <div className="bg-mint-50 rounded-2xl p-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-white flex items-center justify-center mb-3">
            <IconCheck size={22} className="text-mint-900" />
          </div>
          <p className="text-sm font-medium text-mint-900 mb-1">Invitación creada</p>
          <p className="text-xs text-mint-label mb-5">
            Copia este link y mándaselo a <strong>{email}</strong> por WhatsApp, email o
            cualquier medio. Expira en 7 días.
          </p>
          <div className="bg-white rounded-xl p-3 flex gap-2 items-center mb-4">
            <code className="text-[11px] text-ink-dim flex-1 text-left truncate">
              {inviteLink}
            </code>
            <button
              onClick={copyLink}
              className="bg-ink text-cream rounded-lg px-3 py-1.5 text-xs font-medium flex items-center gap-1 hover:bg-ink/90 transition"
            >
              <IconCopy size={12} />
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <button
            onClick={() => router.push("/equipo")}
            className="text-xs text-mint-900 hover:underline"
          >
            Volver a equipo →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg">
      <Link
        href="/equipo"
        className="text-xs text-ink-muted inline-flex items-center gap-1 mb-4 hover:text-ink-dim transition"
      >
        <IconArrowLeft size={13} />
        Volver a equipo
      </Link>

      <h2 className="text-lg font-medium text-ink-dim">Invitar a alguien</h2>
      <p className="text-xs text-ink-muted mt-0.5 mb-6">
        Al aceptar, tendrá acceso a <strong>{activo.nombre}</strong>
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">
            Email <span className="text-mauve-900">*</span>
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ejemplo@correo.com"
            className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-ink/40 transition"
          />
          <p className="text-[11px] text-ink-muted mt-1">
            La persona debe iniciar sesión con este email exacto para aceptar.
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Rol</label>
          <div className="space-y-2">
            {(["socio", "viewer"] as RolMiembro[]).map((r) => (
              <label
                key={r}
                className={`flex items-start gap-2.5 p-3 rounded-xl cursor-pointer border transition ${
                  rol === r
                    ? "border-ink bg-cream"
                    : "border-black/10 bg-white hover:border-black/20"
                }`}
              >
                <input
                  type="radio"
                  checked={rol === r}
                  onChange={() => setRol(r)}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium text-ink-dim">{ROL_LABELS[r]}</p>
                  <p className="text-[11px] text-ink-muted">{ROL_DESCRIPCION[r]}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-ink-dim block mb-1.5">Alcance</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`p-3 rounded-xl border text-left transition ${
                scope === "all"
                  ? "border-ink bg-cream"
                  : "border-black/10 bg-white hover:border-black/20"
              }`}
            >
              <p className="text-sm font-medium text-ink-dim">Todo el negocio</p>
              <p className="text-[11px] text-ink-muted">Todos los proyectos, cuentas, etc.</p>
            </button>
            <button
              type="button"
              onClick={() => setScope("proyectos")}
              className={`p-3 rounded-xl border text-left transition ${
                scope === "proyectos"
                  ? "border-ink bg-cream"
                  : "border-black/10 bg-white hover:border-black/20"
              }`}
            >
              <p className="text-sm font-medium text-ink-dim">Solo proyectos</p>
              <p className="text-[11px] text-ink-muted">Los que elijas abajo</p>
            </button>
          </div>
        </div>

        {scope === "proyectos" && (
          <div>
            <label className="text-xs font-medium text-ink-dim block mb-1.5">
              Proyectos con acceso <span className="text-mauve-900">*</span>
            </label>
            {loadingProy ? (
              <p className="text-xs text-ink-muted">Cargando proyectos…</p>
            ) : proyectos.length === 0 ? (
              <div className="bg-cream/60 rounded-xl p-4 text-center text-xs text-ink-muted">
                Este negocio no tiene proyectos aún.{" "}
                <Link href="/proyectos/nuevo" className="underline">
                  Crear proyecto
                </Link>
              </div>
            ) : (
              <div className="bg-white border border-black/10 rounded-xl divide-y divide-black/5 max-h-56 overflow-y-auto">
                {proyectos.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-cream/30"
                  >
                    <input
                      type="checkbox"
                      checked={proyectosSeleccionados.includes(p.id!)}
                      onChange={() => toggleProyecto(p.id!)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-dim truncate">{p.nombre}</p>
                      <p className="text-[11px] text-ink-muted truncate">{p.cliente_nombre}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="bg-sky-50 text-sky-900 text-[11px] px-3 py-2 rounded-xl">
          <strong>Nota:</strong> Cualquier miembro (incluso solo con acceso a proyectos)
          puede leer el catálogo de proveedores y clientes, y crear nuevos.
        </div>

        {error && (
          <p className="text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-xl">{error}</p>
        )}

        <div className="flex gap-2 pt-2">
          <Link
            href="/equipo"
            className="bg-transparent border border-black/15 rounded-xl px-4 py-2 text-sm text-ink-dim hover:bg-white transition"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={submitting || !email.trim()}
            className="bg-ink text-cream rounded-xl px-5 py-2 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
          >
            {submitting ? "Creando…" : "Generar link de invitación"}
          </button>
        </div>
      </form>
    </div>
  );
}
