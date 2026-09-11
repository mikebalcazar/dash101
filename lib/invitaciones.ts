import {
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  runTransaction,
  arrayUnion,
} from "firebase/firestore";
import { db } from "./firebase";
import { fuente, noEscribeTodavia } from "./fuente";
import type {
  Invitacion,
  RolMiembro,
  ScopeMiembro,
  Usuario,
  Negocio,
  MembershipInfo,
} from "@/types/schema";

export interface InvitacionInput {
  email: string;
  negocio_id: string;
  negocio_nombre: string;
  invited_by_uid: string;
  invited_by_nombre: string;
  invited_by_email: string;
  rol: RolMiembro;
  scope: ScopeMiembro;
  proyectos_ids?: string[];
  proyectos_labels?: string[];
}

const EXPIRA_DIAS = 7;

export async function createInvitacion(data: InvitacionInput): Promise<string> {
  if (fuente() === 'api') throw noEscribeTodavia('invitaciones: en la suite los miembros los da de alta la API por /admin/orgs/:o/miembros');
  const expira = new Date();
  expira.setDate(expira.getDate() + EXPIRA_DIAS);

  const payload = {
    email: data.email.trim().toLowerCase(),
    negocio_id: data.negocio_id,
    negocio_nombre: data.negocio_nombre,
    invited_by_uid: data.invited_by_uid,
    invited_by_nombre: data.invited_by_nombre,
    invited_by_email: data.invited_by_email,
    rol: data.rol,
    scope: data.scope,
    proyectos_ids: data.scope === "proyectos" ? data.proyectos_ids ?? [] : [],
    proyectos_labels: data.scope === "proyectos" ? data.proyectos_labels ?? [] : [],
    estado: "pendiente" as const,
    creado_at: serverTimestamp(),
    expira_at: Timestamp.fromDate(expira),
  };

  const ref = await addDoc(collection(db, "invitaciones"), payload);
  return ref.id;
}

export async function listInvitacionesByNegocio(negocioId: string): Promise<Invitacion[]> {
  // No existen en la suite (arranque §7: el importador no las trae). Vacío, no inventado.
  if (fuente() === 'api') return [];
  const q = query(
    collection(db, "invitaciones"),
    where("negocio_id", "==", negocioId),
    orderBy("creado_at", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invitacion));
}

export async function getInvitacion(id: string): Promise<Invitacion | null> {
  if (fuente() === 'api') return null;
  const snap = await getDoc(doc(db, "invitaciones", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Invitacion;
}

export async function revocarInvitacion(id: string): Promise<void> {
  if (fuente() === 'api') throw noEscribeTodavia('invitaciones');
  await updateDoc(doc(db, "invitaciones", id), { estado: "revocada" });
}

/**
 * Acepta una invitación:
 * - Valida email match, estado pendiente, no expirada
 * - Agrega uid a negocio.miembros_uids
 * - Setea usuario.memberships[negocio_id] con rol/scope
 * - Marca invitación como aceptada
 * Todo en transacción atómica.
 */
export async function aceptarInvitacion(
  invitacionId: string,
  uid: string,
  userEmail: string
): Promise<{ negocio_id: string; negocio_nombre: string }> {
  if (fuente() === 'api') throw noEscribeTodavia('invitaciones');
  const invRef = doc(db, "invitaciones", invitacionId);
  const userRef = doc(db, "usuarios", uid);

  return await runTransaction(db, async (tx) => {
    const invSnap = await tx.get(invRef);
    if (!invSnap.exists()) throw new Error("Invitación no encontrada");
    const inv = invSnap.data() as Invitacion;

    if (inv.estado !== "pendiente") {
      throw new Error(`Esta invitación ya fue ${inv.estado}`);
    }

    const expira = inv.expira_at as Timestamp;
    if (expira.toDate() < new Date()) {
      tx.update(invRef, { estado: "expirada" });
      throw new Error("Esta invitación expiró");
    }

    const userEmailLc = userEmail.toLowerCase().trim();
    if (inv.email !== userEmailLc) {
      throw new Error(
        `Esta invitación es para ${inv.email}. Inicia sesión con esa cuenta.`
      );
    }

    const negocioRef = doc(db, "negocios", inv.negocio_id);
    const negocioSnap = await tx.get(negocioRef);
    if (!negocioSnap.exists()) throw new Error("El negocio ya no existe");

    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) throw new Error("Usuario no encontrado");

    const membership: MembershipInfo = {
      rol: inv.rol,
      scope: inv.scope,
      proyectos_acceso: inv.scope === "proyectos" ? inv.proyectos_ids ?? [] : [],
      invited_by_uid: inv.invited_by_uid,
    };

    // negocio: agregar uid a miembros_uids
    tx.update(negocioRef, {
      miembros_uids: arrayUnion(uid),
    });

    // usuario: agregar acceso + membership
    tx.update(userRef, {
      negocios_acceso: arrayUnion(inv.negocio_id),
      [`memberships.${inv.negocio_id}`]: membership,
    });

    // invitación: marcar aceptada
    tx.update(invRef, {
      estado: "aceptada",
      aceptada_at: serverTimestamp(),
      aceptada_por_uid: uid,
    });

    return { negocio_id: inv.negocio_id, negocio_nombre: inv.negocio_nombre };
  });
}

export async function updateMembership(
  uid: string,
  negocioId: string,
  patch: Partial<MembershipInfo>
): Promise<void> {
  if (fuente() === 'api') throw noEscribeTodavia('la membresía (en la suite vive en el D1, por empresa)');
  const userRef = doc(db, "usuarios", uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error("Usuario no encontrado");
  const user = snap.data() as Usuario;
  const current = user.memberships?.[negocioId];
  if (!current) throw new Error("Este usuario no tiene acceso al negocio");
  const merged: MembershipInfo = { ...current, ...patch };
  await updateDoc(userRef, {
    [`memberships.${negocioId}`]: merged,
  });
}
