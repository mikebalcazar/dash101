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
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Cliente } from "@/types/schema";

export interface ClienteInput {
  nombre: string;
  rfc?: string;
  email?: string;
  telefono?: string;
  notas?: string;
  negocio_id: string;
}

export async function listClientes(negocioId: string): Promise<Cliente[]> {
  const q = query(
    collection(db, "clientes"),
    where("negocio_id", "==", negocioId),
    orderBy("creado_at", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Cliente));
}

export async function getCliente(id: string): Promise<Cliente | null> {
  const snap = await getDoc(doc(db, "clientes", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Cliente;
}

export async function createCliente(uid: string, data: ClienteInput): Promise<string> {
  const payload = {
    nombre: data.nombre,
    rfc: data.rfc ?? "",
    email: data.email ?? "",
    telefono: data.telefono ?? "",
    notas: data.notas ?? "",
    negocio_id: data.negocio_id,
    creado_at: serverTimestamp(),
    creado_por: uid,
  };
  const ref = await addDoc(collection(db, "clientes"), payload);
  return ref.id;
}

export async function updateCliente(
  id: string,
  data: Partial<Omit<ClienteInput, "negocio_id">>
): Promise<void> {
  await updateDoc(doc(db, "clientes", id), data);
}

export async function deleteCliente(id: string): Promise<void> {
  await deleteDoc(doc(db, "clientes", id));
}

/** uid del portal del cliente (null si no tiene acceso). */
export async function getClienteUid(clienteId: string): Promise<string | null> {
  if (!clienteId) return null;
  const snap = await getDoc(doc(db, "clientes", clienteId));
  if (!snap.exists()) return null;
  const c = snap.data() as Cliente;
  return c.portal_activo && c.uid ? c.uid : null;
}

export async function setAccesoPortal(
  clienteId: string,
  data: { uid: string | null; portal_email: string | null; portal_activo: boolean }
): Promise<void> {
  await updateDoc(doc(db, "clientes", clienteId), data);
}
