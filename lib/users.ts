import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";
import { fuente } from "./fuente";
import * as leer from "./api/leer";
import type { Usuario, MembershipInfo } from "@/types/schema";

/** Lo que Firestore guardaba del usuario, con la forma de hoy. Los documentos
 *  viejos traían la membresía en un mapa por registro; se toma la primera. */
function desdeFirestore(d: Record<string, unknown>): Usuario {
  const mapa = (d.memberships ?? {}) as Record<string, MembershipInfo>;
  const membership = (d.membership as MembershipInfo | undefined) ?? Object.values(mapa)[0] ?? null;
  return {
    email: String(d.email ?? ""),
    nombre: String(d.nombre ?? ""),
    membership,
    creado_at: d.creado_at as Usuario["creado_at"],
  };
}

/** Asegura que exista el doc del usuario. Si no, lo crea vacío. */
export async function ensureUserDoc(user: User): Promise<Usuario> {
  if (fuente() === 'api') {
    // En la suite el usuario ya existe: lo creó la API al entrar. Se lee, no se asegura.
    const u = await leer.getUserDoc();
    if (!u) throw new Error('No hay sesión en la API.');
    return u;
  }
  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return desdeFirestore(snap.data());
  const nuevo = {
    email: (user.email ?? "").toLowerCase(),
    nombre: user.displayName ?? user.email?.split("@")[0] ?? "Usuario",
    membership: null,
    creado_at: serverTimestamp(),
  };
  await setDoc(ref, nuevo);
  return nuevo;
}

export async function getUserDoc(uid: string): Promise<Usuario | null> {
  // La API sólo conoce al usuario en sesión: `uid` se acepta por la firma y
  // se ignora, porque otro usuario no se puede leer desde una app.
  if (fuente() === 'api') return leer.getUserDoc();
  const snap = await getDoc(doc(db, "usuarios", uid));
  if (!snap.exists()) return null;
  return desdeFirestore(snap.data());
}

export function getMembership(user: Usuario | null): MembershipInfo | null {
  return user?.membership ?? null;
}

export function canWrite(user: Usuario | null): boolean {
  const m = getMembership(user);
  if (!m) return false;
  return m.rol === "owner" || m.rol === "socio";
}

export function isOwner(user: Usuario | null): boolean {
  return getMembership(user)?.rol === "owner";
}

export function hasProyectoAccess(user: Usuario | null, proyectoId: string): boolean {
  const m = getMembership(user);
  if (!m) return false;
  if (m.scope === "all") return true;
  return (m.proyectos_acceso ?? []).includes(proyectoId);
}
