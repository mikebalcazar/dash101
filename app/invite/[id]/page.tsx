"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getInvitacion, aceptarInvitacion } from "@/lib/invitaciones";
import { useNegocioActivo } from "@/lib/negocio-activo-context";
import type { Invitacion } from "@/types/schema";
import { ROL_LABELS } from "@/types/schema";
import { Timestamp } from "firebase/firestore";
import { formatDateShort } from "@/lib/format";
import {
  IconMail,
  IconBrandGoogle,
  IconAlertTriangle,
  IconCheck,
  IconLeaf,
} from "@tabler/icons-react";

export default function AceptarInvitacionPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { user, loading: authLoading, signInGoogle } = useAuth();

  // Solo usar el context de negocio activo si el usuario está logueado
  // (evita error si el provider no está)
  const [inv, setInv] = useState<Invitacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState<{ nombre: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    getInvitacion(id)
      .then((i) => {
        if (!i) {
          setError("Esta invitación no existe o fue eliminada.");
          return;
        }
        setInv(i);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleGoogle = async () => {
    setError("");
    try {
      await signInGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al iniciar sesión");
    }
  };

  const handleAccept = async () => {
    if (!user || !inv) return;
    setError("");
    setAccepting(true);
    try {
      const res = await aceptarInvitacion(inv.id!, user.uid, user.email ?? "");
      setAccepted({ nombre: res.negocio_nombre });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al aceptar");
      setAccepting(false);
    }
  };

  const goToApp = () => {
    router.push("/dashboard");
  };

  const emailLoggedIn = (user?.email ?? "").toLowerCase();
  const emailInv = (inv?.email ?? "").toLowerCase();
  const emailMatch = user && inv && emailLoggedIn === emailInv;

  const expira = inv?.expira_at as Timestamp | undefined;
  const expiraDate =
    expira && typeof expira.toDate === "function" ? expira.toDate() : null;
  const expirado = expiraDate ? expiraDate < new Date() : false;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-ink text-cream flex items-center justify-center">
            <IconLeaf size={20} />
          </div>
          <h1 className="text-xl font-medium">Conta Master</h1>
        </div>

        <div className="bg-white border border-black/5 rounded-3xl p-7">
          {loading || authLoading ? (
            <p className="text-sm text-ink-muted text-center py-8">Cargando invitación…</p>
          ) : accepted ? (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-mint-50 flex items-center justify-center mb-3">
                <IconCheck size={22} className="text-mint-900" />
              </div>
              <h2 className="text-base font-medium text-ink-dim mb-1">¡Bienvenido!</h2>
              <p className="text-xs text-ink-muted mb-5">
                Ya tienes acceso a <strong>{accepted.nombre}</strong>
              </p>
              <button
                onClick={goToApp}
                className="w-full bg-ink text-cream rounded-xl py-2.5 text-sm font-medium hover:bg-ink/90 transition"
              >
                Ir al panel
              </button>
            </div>
          ) : error && !inv ? (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-mauve-50 flex items-center justify-center mb-3">
                <IconAlertTriangle size={22} className="text-mauve-900" />
              </div>
              <p className="text-sm text-ink-dim mb-4">{error}</p>
              <Link
                href="/login"
                className="text-xs text-ink hover:underline"
              >
                Ir al login →
              </Link>
            </div>
          ) : inv?.estado !== "pendiente" ? (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-cream flex items-center justify-center mb-3">
                <IconMail size={22} className="text-ink-muted" />
              </div>
              <p className="text-sm font-medium text-ink-dim mb-1">
                Invitación {inv?.estado}
              </p>
              <p className="text-xs text-ink-muted mb-4">
                {inv?.estado === "aceptada"
                  ? "Esta invitación ya fue aceptada."
                  : inv?.estado === "revocada"
                  ? "El propietario del negocio revocó esta invitación."
                  : "Esta invitación expiró."}
              </p>
              <Link href="/login" className="text-xs text-ink hover:underline">
                Ir al login →
              </Link>
            </div>
          ) : expirado ? (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-mauve-50 flex items-center justify-center mb-3">
                <IconAlertTriangle size={22} className="text-mauve-900" />
              </div>
              <p className="text-sm font-medium text-ink-dim mb-1">Invitación expirada</p>
              <p className="text-xs text-ink-muted mb-4">
                Pide al propietario del negocio que te mande una nueva.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-base font-medium text-ink-dim mb-1">
                Invitación a {inv!.negocio_nombre}
              </h2>
              <p className="text-xs text-ink-muted mb-4">
                <strong>{inv!.invited_by_nombre}</strong> te invitó a colaborar
              </p>

              <div className="bg-cream rounded-xl p-3 text-xs space-y-1.5 mb-5">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Email invitado</span>
                  <span className="font-medium text-ink-dim">{inv!.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Rol</span>
                  <span className="font-medium text-ink-dim">{ROL_LABELS[inv!.rol]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">Acceso</span>
                  <span className="font-medium text-ink-dim">
                    {inv!.scope === "all"
                      ? "Todo el negocio"
                      : `${inv!.proyectos_ids?.length ?? 0} proyecto${(inv!.proyectos_ids?.length ?? 0) === 1 ? "" : "s"}`}
                  </span>
                </div>
                {expiraDate && (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Expira</span>
                    <span className="font-medium text-ink-dim">
                      {formatDateShort(expiraDate)}
                    </span>
                  </div>
                )}
              </div>

              {inv!.scope === "proyectos" && (inv!.proyectos_labels?.length ?? 0) > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] text-ink-muted mb-1">Proyectos con acceso:</p>
                  <div className="bg-cream/60 rounded-lg p-2 text-xs text-ink-dim space-y-0.5 max-h-24 overflow-y-auto">
                    {inv!.proyectos_labels?.map((l, i) => (
                      <p key={i} className="truncate">
                        • {l}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {!user ? (
                <>
                  <p className="text-xs text-ink-muted mb-3 text-center">
                    Inicia sesión con <strong>{inv!.email}</strong> para aceptar
                  </p>
                  <button
                    onClick={handleGoogle}
                    className="w-full flex items-center justify-center gap-2 bg-cream hover:bg-cream/80 transition rounded-xl py-2.5 text-sm font-medium"
                  >
                    <IconBrandGoogle size={16} />
                    Continuar con Google
                  </button>
                </>
              ) : !emailMatch ? (
                <div className="bg-mauve-50 text-mauve-900 text-xs px-3 py-2 rounded-xl">
                  Estás logueado como <strong>{user.email}</strong> pero esta invitación es
                  para <strong>{inv!.email}</strong>. Cierra sesión y vuelve a iniciar con
                  la cuenta correcta.
                </div>
              ) : (
                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full bg-ink text-cream rounded-xl py-2.5 text-sm font-medium hover:bg-ink/90 disabled:opacity-50 transition"
                >
                  {accepting ? "Aceptando…" : "Aceptar invitación"}
                </button>
              )}

              {error && (
                <p className="mt-3 text-xs text-mauve-900 bg-mauve-50 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
