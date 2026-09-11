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
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { fuente, noEscribeTodavia } from "./fuente";
import * as leer from "./api/leer";
import type { Opex, TipoOpex, FrecuenciaOpex, Moneda } from "@/types/schema";

export interface OpexInput {
  nombre: string;
  tipo: TipoOpex;
  monto: number;
  moneda: Moneda;
  frecuencia: FrecuenciaOpex;
  dia_semana?: number | null;
  dia_del_mes?: number | null;
  fecha_inicio: Date;
  fecha_fin?: Date | null;
  cuenta_id?: string | null;
  cuenta_nombre?: string | null;
  categoria?: string;
  activo: boolean;
  negocio_id: string;
  descripcion?: string;
}

export async function listOpex(negocioId: string): Promise<Opex[]> {
  if (fuente() === 'api') return leer.listOpex(negocioId);
  const q = query(
    collection(db, "opex"),
    where("negocio_id", "==", negocioId),
    orderBy("creado_at", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Opex));
}

export async function getOpex(id: string): Promise<Opex | null> {
  if (fuente() === 'api') return leer.getOpex(id);
  const snap = await getDoc(doc(db, "opex", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Opex;
}

export async function createOpex(uid: string, data: OpexInput): Promise<string> {
  if (fuente() === 'api') throw noEscribeTodavia('opex');
  const payload = {
    nombre: data.nombre,
    tipo: data.tipo,
    monto: data.monto,
    moneda: data.moneda,
    frecuencia: data.frecuencia,
    dia_semana: data.dia_semana ?? null,
    dia_del_mes: data.dia_del_mes ?? null,
    fecha_inicio: Timestamp.fromDate(data.fecha_inicio),
    fecha_fin: data.fecha_fin ? Timestamp.fromDate(data.fecha_fin) : null,
    cuenta_id: data.cuenta_id ?? null,
    cuenta_nombre: data.cuenta_nombre ?? null,
    categoria: data.categoria ?? "",
    activo: data.activo,
    negocio_id: data.negocio_id,
    descripcion: data.descripcion ?? "",
    creado_at: serverTimestamp(),
    creado_por: uid,
  };
  const ref = await addDoc(collection(db, "opex"), payload);
  return ref.id;
}

export async function updateOpex(
  id: string,
  data: Partial<Omit<OpexInput, "negocio_id">>
): Promise<void> {
  if (fuente() === 'api') throw noEscribeTodavia('opex');
  const patch: Record<string, unknown> = {};
  if (data.nombre !== undefined) patch.nombre = data.nombre;
  if (data.tipo !== undefined) patch.tipo = data.tipo;
  if (data.monto !== undefined) patch.monto = data.monto;
  if (data.moneda !== undefined) patch.moneda = data.moneda;
  if (data.frecuencia !== undefined) patch.frecuencia = data.frecuencia;
  if (data.dia_semana !== undefined) patch.dia_semana = data.dia_semana;
  if (data.dia_del_mes !== undefined) patch.dia_del_mes = data.dia_del_mes;
  if (data.fecha_inicio !== undefined)
    patch.fecha_inicio = Timestamp.fromDate(data.fecha_inicio);
  if (data.fecha_fin !== undefined)
    patch.fecha_fin = data.fecha_fin ? Timestamp.fromDate(data.fecha_fin) : null;
  if (data.cuenta_id !== undefined) patch.cuenta_id = data.cuenta_id;
  if (data.cuenta_nombre !== undefined) patch.cuenta_nombre = data.cuenta_nombre;
  if (data.categoria !== undefined) patch.categoria = data.categoria;
  if (data.activo !== undefined) patch.activo = data.activo;
  if (data.descripcion !== undefined) patch.descripcion = data.descripcion;
  await updateDoc(doc(db, "opex", id), patch);
}

export async function deleteOpex(id: string): Promise<void> {
  if (fuente() === 'api') throw noEscribeTodavia('opex');
  await deleteDoc(doc(db, "opex", id));
}

/**
 * Calcula el monto mensual estimado del OPEX.
 * Útil para display "Este gasto son ~$X al mes".
 */
export function estimarMensual(opex: Opex): number {
  const monto = opex.monto;
  switch (opex.frecuencia) {
    case "semanal":
      return monto * 4.333; // 52/12
    case "mensual":
      return monto;
    case "anual":
      return monto / 12;
    default:
      return 0;
  }
}
