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
import type { Cuenta, TipoCuenta, Moneda } from "@/types/schema";

export interface CuentaInput {
  nombre: string;
  tipo: TipoCuenta;
  banco?: string;
  numero?: string;
  moneda: Moneda;
  saldo_inicial: number;
  negocio_id: string;
}

export async function listCuentas(negocioId: string): Promise<Cuenta[]> {
  if (fuente() === 'api') return leer.listCuentas(negocioId);
  const q = query(
    collection(db, "cuentas"),
    where("negocio_id", "==", negocioId),
    orderBy("creado_at", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Cuenta));
}

export async function getCuenta(id: string): Promise<Cuenta | null> {
  if (fuente() === 'api') return leer.getCuenta(id);
  const snap = await getDoc(doc(db, "cuentas", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Cuenta;
}

export async function createCuenta(uid: string, data: CuentaInput): Promise<string> {
  if (fuente() === 'api') return escribir.createCuenta(uid, data);
  const payload = {
    nombre: data.nombre,
    tipo: data.tipo,
    banco: data.banco ?? "",
    numero: data.numero ?? "",
    moneda: data.moneda,
    saldo_inicial: data.saldo_inicial,
    saldo_actual: data.saldo_inicial,
    negocio_id: data.negocio_id,
    creado_at: serverTimestamp(),
    creado_por: uid,
  };
  const ref = await addDoc(collection(db, "cuentas"), payload);
  return ref.id;
}

export async function updateCuenta(
  id: string,
  data: Partial<Omit<CuentaInput, "negocio_id">>
): Promise<void> {
  if (fuente() === 'api') return escribir.updateCuenta(id, data);
  await updateDoc(doc(db, "cuentas", id), data);
}

export async function deleteCuenta(id: string): Promise<void> {
  if (fuente() === 'api') return escribir.deleteCuenta(id);
  await deleteDoc(doc(db, "cuentas", id));
}
