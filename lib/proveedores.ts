import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { fuente, noEscribeTodavia } from "./fuente";
import * as leer from "./api/leer";
import type { Proveedor } from "@/types/schema";

export interface ProveedorInput {
  nombre: string;
  rfc?: string;
  categoria?: string;
  email?: string;
  telefono?: string;
  terminos_pago_default?: string;
  notas?: string;
}

export async function listProveedores(): Promise<Proveedor[]> {
  if (fuente() === 'api') return leer.listProveedores();
  const q = query(collection(db, "proveedores"), orderBy("creado_at", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Proveedor));
}

export async function getProveedor(id: string): Promise<Proveedor | null> {
  if (fuente() === 'api') return leer.getProveedor(id);
  const snap = await getDoc(doc(db, "proveedores", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Proveedor;
}

export async function createProveedor(uid: string, data: ProveedorInput): Promise<string> {
  if (fuente() === 'api') throw noEscribeTodavia('proveedores');
  const payload = {
    nombre: data.nombre,
    rfc: data.rfc ?? "",
    categoria: data.categoria ?? "",
    email: data.email ?? "",
    telefono: data.telefono ?? "",
    terminos_pago_default: data.terminos_pago_default ?? "",
    notas: data.notas ?? "",
    creado_at: serverTimestamp(),
    creado_por: uid,
  };
  const ref = await addDoc(collection(db, "proveedores"), payload);
  return ref.id;
}

export async function updateProveedor(id: string, data: Partial<ProveedorInput>): Promise<void> {
  if (fuente() === 'api') throw noEscribeTodavia('proveedores');
  await updateDoc(doc(db, "proveedores", id), data);
}

export async function deleteProveedor(id: string): Promise<void> {
  if (fuente() === 'api') throw noEscribeTodavia('proveedores');
  await deleteDoc(doc(db, "proveedores", id));
}
