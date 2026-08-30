"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import {
  listInvitacionesByNegocio,
  revocarInvitacion,
} from "@/lib/invitaciones";
import { removeMiembro, listMiembrosDeNegocio } from "@/lib/negocios";
import { getUserDoc, getMembership } from "@/lib/users";
import type { Invitacion, Usuario, MembershipInfo } from "@/types/schema";
import { ROL_LABELS } from "@/types/schema";
import { Timestamp } from "firebase/firestore";
import { formatDateShort } from "@/lib/format";
import {
  IconUsers,
  IconPlus,
  IconMail,
  IconCopy,
  IconTrash,
  IconCrown,
  IconEye,
} from "@tabler/icons-react";

interface MiembroData {
  uid: string;
  user: Usuario | null;
  membership: MembershipInfo | null;
  isOwner: boolean;
}

const ROL_ICON = {
  owner: IconCrown,
  socio: IconUsers,
  viewer: IconEye,
} as const;

const ROL_COLOR = {
  owner: "bg-mint-50 text-mint-900",
  socio: "bg-sky-50 text-sky-900",
  viewer: "bg-cream text-ink-muted",
} as const;

export default function EquipoPage() {
  const { user } = useAuth();
  const { activo, loading: loadingNegocio } = useNegocioActivo();
  const [miembros, setMiembros] = useState<MiembroData[]>([]);
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async () => {
    if (!activo?.id) {
      setMiembros([]);
      setInvitaciones([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [uids, invs] = await Promise.all([
        listMiembrosDeNegocio(activo.id),
        listInvitacionesByNegocio(activo.id),
      ]);
      const usuarios = await Promise.all(
        uids.map(async (uid) => {
          const u = await getUserDoc(uid);
          const m = getMembership(u, activo.id!);
          return {
            uid,
            user: u,
            membership: m,
            isOwner: uid === activo.owner_uid || m?.rol === "owner",
          } as MiembroData;
        })
      );
      setMiembros(usuarios);
      setInvitaciones(invs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loadingNegocio) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, loadingNegocio]);

  const soyOwner = user && activo && activo.owner_uid === user.uid;

  const handleCopyLink = (id: string) => {
    const url = `${window.location.origin}/invite/${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevocar = async (id: string) => {
    if (!confirm("¿Revocar esta invitación? El link dejará de funcionar.")) return;
    try {
      await revocarInvitacion(id);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    }
  };

  const handleRemove = async (uid: string, nombre: string) => {
    if (!confirm(`¿Remover a ${nombre} de este negocio? Perderá acceso inmediatamente.`))
      return;
    try {
      await removeMiembro(activo!.id!, uid);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    }
  };

  if (loadingNegocio || loading) return <div className="text-sm text-ink-muted">Cargando…</div>;

  if (!activo) {
    return (
      <div className="bg-white border border-black/5 rounded-2xl p-10 text-center">
        <p className="text-sm font-medium text-ink-dim mb-1">Sin negocio activo</p>
      </div>
    );
  }

  const pendientes = invitaciones.filter((i) => i.estado === "pendiente");
  const historial = invitaciones.filter((i) => i.estado !== "pendiente");

  return (
    <div>
      <div className="flex justify-between items-baseline mb-5">
        <div>
          <h2 className="text-lg font-medium text-ink-dim">Equipo</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {activo.nombre} · {miembros.length}{" "}
            {miembros.length === 1 ? "miembro" : "miembros"}
            {pendientes.length > 0 && ` · ${pendientes.length} invitación${pendientes.length === 1 ? "" : "es"} pendiente${pendientes.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {soyOwner && (
          <Link
            href="/equipo/invitar"
            className="flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-cream rounded-xl px-3.5 py-2 text-sm font-medium transition"
          >
            <IconPlus size={14} />
            Invitar
          </Link>
        )}
      </div>

      {error && (
        <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl mb-4">
          {error}
        </div>
      )}

      {!soyOwner && (
        <div className="bg-cream text-ink-muted text-xs px-3 py-2 rounded-xl mb-4">
          Solo el propietario puede invitar o remover miembros.
        </div>
      )}

      {/* Miembros */}
      <section className="mb-6">
        <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">
          Miembros
        </h3>
        <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
          {miembros.map((m) => {
            const rol = m.membership?.rol ?? (m.isOwner ? "owner" : "viewer");
            const Icon = ROL_ICON[rol];
            const isMe = m.uid === user?.uid;
            const canRemove = soyOwner && !m.isOwner && !isMe;
            return (
              <div
                key={m.uid}
                className="flex items-center gap-3 px-4 py-3 border-b border-black/5 last:border-b-0"
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${ROL_COLOR[rol]}`}>
                  <Icon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-dim truncate">
                    {m.user?.nombre ?? m.uid}
                    {isMe && <span className="text-ink-muted font-normal"> (tú)</span>}
                  </p>
                  <p className="text-[11px] text-ink-muted truncate">
                    {m.user?.email ?? "—"}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full ${ROL_COLOR[rol]}`}
                  >
                    {ROL_LABELS[rol]}
                  </span>
                  {m.membership?.scope === "proyectos" && (
                    <p className="text-[10px] text-ink-muted mt-1">
                      {m.membership.proyectos_acceso?.length ?? 0}{" "}
                      {(m.membership.proyectos_acceso?.length ?? 0) === 1
                        ? "proyecto"
                        : "proyectos"}
                    </p>
                  )}
                </div>
                {canRemove && (
                  <button
                    onClick={() => handleRemove(m.uid, m.user?.nombre ?? m.uid)}
                    className="text-ink-muted hover:text-mauve-900 p-1"
                    title="Remover"
                  >
                    <IconTrash size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Invitaciones pendientes */}
      {pendientes.length > 0 && (
        <section className="mb-6">
          <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">
            Invitaciones pendientes
          </h3>
          <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
            {pendientes.map((inv) => {
              const expira = inv.expira_at as Timestamp;
              const expiraDate =
                expira && typeof expira.toDate === "function" ? expira.toDate() : null;
              const expirado = expiraDate ? expiraDate < new Date() : false;
              return (
                <div
                  key={inv.id}
                  className="flex items-center gap-3 px-4 py-3 border-b border-black/5 last:border-b-0"
                >
                  <div className="w-9 h-9 rounded-full bg-sky-50 text-sky-900 flex items-center justify-center">
                    <IconMail size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-dim truncate">{inv.email}</p>
                    <p className="text-[11px] text-ink-muted truncate">
                      {ROL_LABELS[inv.rol]}
                      {inv.scope === "proyectos" &&
                        ` · ${inv.proyectos_ids?.length ?? 0} proyecto${(inv.proyectos_ids?.length ?? 0) === 1 ? "" : "s"}`}
                      {expiraDate && (
                        <>
                          {" · "}
                          {expirado
                            ? "Expirada"
                            : `Expira ${formatDateShort(expiraDate)}`}
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopyLink(inv.id!)}
                    className="text-xs bg-cream hover:bg-cream/60 text-ink-dim rounded-lg px-2.5 py-1.5 flex items-center gap-1 transition"
                    title="Copiar link"
                  >
                    <IconCopy size={12} />
                    {copiedId === inv.id ? "¡Copiado!" : "Copiar link"}
                  </button>
                  {soyOwner && (
                    <button
                      onClick={() => handleRevocar(inv.id!)}
                      className="text-ink-muted hover:text-mauve-900 p-1"
                      title="Revocar"
                    >
                      <IconTrash size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Historial */}
      {historial.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">
            Historial
          </h3>
          <div className="bg-white border border-black/5 rounded-2xl overflow-hidden">
            {historial.slice(0, 10).map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-black/5 last:border-b-0 text-xs"
              >
                <div className="w-6 h-6 rounded-full bg-cream text-ink-muted flex items-center justify-center flex-shrink-0">
                  <IconMail size={11} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-ink-dim truncate">{inv.email}</p>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    inv.estado === "aceptada"
                      ? "bg-mint-50 text-mint-900"
                      : "bg-cream text-ink-muted"
                  }`}
                >
                  {inv.estado}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {miembros.length === 1 && pendientes.length === 0 && soyOwner && (
        <div className="bg-cream/60 rounded-2xl p-6 text-center mt-6">
          <div className="w-12 h-12 mx-auto rounded-full bg-white flex items-center justify-center mb-3">
            <IconUsers size={20} className="text-ink-muted" />
          </div>
          <p className="text-sm font-medium text-ink-dim mb-1">Estás solo</p>
          <p className="text-xs text-ink-muted mb-4 max-w-xs mx-auto">
            Invita a socios o ayudantes con acceso restringido a proyectos específicos.
          </p>
          <Link
            href="/equipo/invitar"
            className="inline-flex items-center gap-1.5 bg-ink text-cream rounded-xl px-4 py-2 text-sm font-medium hover:bg-ink/90 transition"
          >
            <IconPlus size={14} />
            Invitar a alguien
          </Link>
        </div>
      )}
    </div>
  );
}
