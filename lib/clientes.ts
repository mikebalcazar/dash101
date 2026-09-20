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
import { fuente } from "./fuente";
import * as leer from "./api/leer";
import * as escribir from "./api/escribir";
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
  if (fuente() === 'api') return leer.listClientes(negocioId);
  const q = query(
    collection(db, "clientes"),
    where("negocio_id", "==", negocioId),
    orderBy("creado_at", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Cliente));
}

export async function getCliente(id: string): Promise<Cliente | null> {
  if (fuente() === 'api') return leer.getCliente(id);
  const snap = await getDoc(doc(db, "clientes", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Cliente;
}

export async function createCliente(uid: string, data: ClienteInput): Promise<string> {
  if (fuente() === 'api') return escribir.createCliente(uid, data);
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
  if (fuente() === 'api') return escribir.updateCliente(id, data);
  await updateDoc(doc(db, "clientes", id), data);
}

export async function deleteCliente(id: string): Promise<void> {
  if (fuente() === 'api') return escribir.deleteCliente(id);
  await deleteDoc(doc(db, "clientes", id));
}

/** uid del portal del cliente (null si no tiene acceso). */
export async function getClienteUid(clienteId: string): Promise<string | null> {
  if (fuente() === 'api') return leer.getClienteUid(clienteId);
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
  // Con la API el acceso se prende y se apaga en lib/portal.ts (POST/DELETE …/acceso); esto es de Firestore.
  if (fuente() === 'api') throw new Error('Con FUENTE=api el acceso al portal se maneja en lib/portal.ts.');
  await updateDoc(doc(db, "clientes", clienteId), data);
}

/* ─────────────── parecidos ───────────────
 * Para no terminar con «Familia Ramírez», «familia ramirez» y «Flia Ramirez»
 * como tres clientes distintos, que después nadie sabe cuál es cuál.
 *
 * La regla de normalizar es la MISMA que la de la suite (`normalizar` en
 * `src/lib.ts`, que es lo que guarda en `clientes.nombre_norm`): sin acentos,
 * en minúsculas y con los espacios apretados. Si aquí fuera distinta, la
 * pantalla diría que no hay parecido y la base diría que sí. */

export function normalizarNombre(txt: string): string {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Los clientes que se parecen a ese nombre: el mismo ya normalizado, o uno
 *  que contiene al otro («Ramírez» contra «Familia Ramírez»). No se inventa
 *  distancia de edición: con esto se atrapa lo que de verdad pasa al capturar
 *  dos veces, y no se molesta a nadie con falsos parecidos. */
export function clientesParecidos(nombre: string, clientes: Cliente[]): Cliente[] {
  const n = normalizarNombre(nombre);
  if (n.length < 3) return [];
  return clientes.filter((c) => {
    const o = normalizarNombre(c.nombre);
    return o === n || (o.length >= 3 && (o.includes(n) || n.includes(o)));
  });
}
