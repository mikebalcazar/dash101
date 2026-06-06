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
} from "firebase/firestore";
import { db } from "./firebase";
import type { Negocio, Moneda } from "@/types/schema";

export interface NegocioInput {
  nombre: string;
  descripcion?: string;
  rfc?: string;
  moneda: Moneda;
}

export async function listNegocios(uid: string): Promise<Negocio[]> {
  const q = query(
    collection(db, "negocios"),
    where("miembros_uids", "array-contains", uid),
    orderBy("creado_at", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Negocio));
}

export async function getNegocio(id: string): Promise<Negocio | null> {
  const snap = await getDoc(doc(db, "negocios", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Negocio;
}

export async function createNegocio(uid: string, data: NegocioInput): Promise<string> {
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

  // Vincular este negocio al usuario
  await updateDoc(doc(db, "usuarios", uid), {
    negocios_acceso: arrayUnion(ref.id),
  });

  return ref.id;
}

export async function updateNegocio(id: string, data: Partial<NegocioInput>): Promise<void> {
  await updateDoc(doc(db, "negocios", id), data);
}

export async function deleteNegocio(id: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, "negocios", id));
  await updateDoc(doc(db, "usuarios", uid), {
    negocios_acceso: arrayRemove(id),
  });
}
