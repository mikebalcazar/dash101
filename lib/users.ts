import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";
import type { Usuario, MembershipInfo } from "@/types/schema";

/**
 * Asegura que exista el doc del usuario. Si no, lo crea vacío.
 * Además, si el usuario es owner de negocios existentes sin membership,
 * los agrega (migración perezosa para usuarios anteriores al sistema de roles).
 */
export async function ensureUserDoc(user: User): Promise<Usuario> {
  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);

  let userData: Usuario;

  if (!snap.exists()) {
    userData = {
      email: (user.email ?? "").toLowerCase(),
      nombre: user.displayName ?? user.email?.split("@")[0] ?? "Usuario",
      negocios_acceso: [],
      memberships: {},
      creado_at: serverTimestamp(),
    };
    await setDoc(ref, userData);
  } else {
    userData = snap.data() as Usuario;
    // Backfill memberships map si no existe (usuarios anteriores)
    if (!userData.memberships) {
      userData.memberships = {};
      await updateDoc(ref, { memberships: {} });
    }
  }

  // Migración perezosa: buscar negocios donde soy owner y no tengo membership
  try {
    const negociosQ = query(
      collection(db, "negocios"),
      where("owner_uid", "==", user.uid)
    );
    const negociosSnap = await getDocs(negociosQ);
    const misNegocios = negociosSnap.docs;

    const negociosSinMembership = misNegocios.filter(
      (d) => !userData.memberships?.[d.id]
    );

    if (negociosSinMembership.length > 0) {
      const membershipsPatch: Record<string, MembershipInfo> = {};
      const accesoNuevos: string[] = [];
      negociosSinMembership.forEach((d) => {
        membershipsPatch[`memberships.${d.id}`] = {
          rol: "owner",
          scope: "all",
        } as MembershipInfo;
        if (!userData.negocios_acceso?.includes(d.id)) {
          accesoNuevos.push(d.id);
        }
      });
      const updates: Record<string, unknown> = { ...membershipsPatch };
      if (accesoNuevos.length > 0) {
        updates.negocios_acceso = arrayUnion(...accesoNuevos);
      }
      await updateDoc(ref, updates);
      // reload
      const snap2 = await getDoc(ref);
      userData = snap2.data() as Usuario;
    }
  } catch (e) {
    console.warn("Migración de memberships falló (no bloqueante):", e);
  }

  return userData;
}

export async function getUserDoc(uid: string): Promise<Usuario | null> {
  const snap = await getDoc(doc(db, "usuarios", uid));
  if (!snap.exists()) return null;
  return snap.data() as Usuario;
}

export function getMembership(user: Usuario | null, negocioId: string): MembershipInfo | null {
  if (!user?.memberships) return null;
  return user.memberships[negocioId] ?? null;
}

export function canWriteInNegocio(user: Usuario | null, negocioId: string): boolean {
  const m = getMembership(user, negocioId);
  if (!m) return false;
  return m.rol === "owner" || m.rol === "socio";
}

export function isOwnerOfNegocio(user: Usuario | null, negocioId: string): boolean {
  return getMembership(user, negocioId)?.rol === "owner";
}

export function hasProyectoAccess(
  user: Usuario | null,
  negocioId: string,
  proyectoId: string
): boolean {
  const m = getMembership(user, negocioId);
  if (!m) return false;
  if (m.scope === "all") return true;
  return (m.proyectos_acceso ?? []).includes(proyectoId);
}
