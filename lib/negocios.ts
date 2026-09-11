import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { fuente, noEscribeTodavia } from "./fuente";
import * as leer from "./api/leer";
import type { Negocio, Moneda } from "@/types/schema";

export interface NegocioInput {
  nombre: string;
  descripcion?: string;
  rfc?: string;
  moneda: Moneda;
}

export async function listNegocios(uid: string): Promise<Negocio[]> {
  if (fuente() === 'api') return leer.listNegocios(uid);
  const q = query(
    collection(db, "negocios"),
    where("miembros_uids", "array-contains", uid),
    orderBy("creado_at", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Negocio));
}

export async function getNegocio(id: string): Promise<Negocio | null> {
  if (fuente() === 'api') return leer.getNegocio(id);
  const snap = await getDoc(doc(db, "negocios", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Negocio;
}

export async function createNegocio(uid: string, data: NegocioInput): Promise<string> {
  if (fuente() === 'api') throw noEscribeTodavia('negocios');
  const payload = {
    nombre: data.nombre,
    descripcion: data.descripcion ?? "",
    rfc: data.rfc ?? "",
    moneda: data.moneda,
    owner_uid: uid,
    miembros_uids: [uid],
    creado_at: serverTimestamp(),
    creado_por: uid,
  };

  const ref = await addDoc(collection(db, "negocios"), payload);

  // Vincular al usuario: negocios_acceso[] + memberships[negocio_id] = owner
  await updateDoc(doc(db, "usuarios", uid), {
    negocios_acceso: arrayUnion(ref.id),
    [`memberships.${ref.id}`]: {
      rol: "owner",
      scope: "all",
    },
  });

  return ref.id;
}

export async function updateNegocio(id: string, data: Partial<NegocioInput>): Promise<void> {
  if (fuente() === 'api') throw noEscribeTodavia('negocios');
  await updateDoc(doc(db, "negocios", id), data);
}

export async function deleteNegocio(id: string, uid: string): Promise<void> {
  if (fuente() === 'api') throw noEscribeTodavia('negocios');
  await deleteDoc(doc(db, "negocios", id));
  // Limpia el acceso del owner (los otros miembros mantienen datos huerfanos hasta que la app los limpie)
  await updateDoc(doc(db, "usuarios", uid), {
    negocios_acceso: arrayRemove(id),
    [`memberships.${id}`]: null,
  });
}

/**
 * Remueve a un miembro del negocio.
 * Elimina el uid de miembros_uids y limpia memberships/negocios_acceso del usuario.
 */
export async function removeMiembro(negocioId: string, uidToRemove: string): Promise<void> {
  if (fuente() === 'api') throw noEscribeTodavia('la membresía (en la suite vive en el D1, por empresa)');
  const batch = writeBatch(db);
  batch.update(doc(db, "negocios", negocioId), {
    miembros_uids: arrayRemove(uidToRemove),
  });
  batch.update(doc(db, "usuarios", uidToRemove), {
    negocios_acceso: arrayRemove(negocioId),
    [`memberships.${negocioId}`]: null,
  });
  await batch.commit();
}

/**
 * Lista todos los uids que son miembros de un negocio.
 */
export async function listMiembrosDeNegocio(negocioId: string): Promise<string[]> {
  // En la suite la membresía es por empresa y vive en el D1; por negocio no
  // hay lista. Se contesta vacío, no se inventa.
  if (fuente() === 'api') return [];
  const snap = await getDoc(doc(db, "negocios", negocioId));
  if (!snap.exists()) return [];
  return (snap.data().miembros_uids as string[]) ?? [];
}
