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
  limit,
  Timestamp,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Movimiento, TipoMovimiento, TipoContraparte } from "@/types/schema";
import { recalcularProyecto } from "./proyectos";

export interface MovimientoInput {
  tipo: TipoMovimiento;
  monto: number;
  fecha: Date;
  cuenta_id: string;
  cuenta_nombre: string;
  cuenta_destino_id?: string | null;
  cuenta_destino_nombre?: string | null;
  proyecto_id?: string | null;
  proyecto_nombre?: string | null;
  contraparte_id?: string | null;
  contraparte_tipo: TipoContraparte;
  contraparte_nombre: string;
  negocio_id: string;
  descripcion?: string;
  categoria?: string;
}

export async function listMovimientos(
  negocioId: string,
  opts?: { max?: number }
): Promise<Movimiento[]> {
  const q = query(
    collection(db, "movimientos"),
    where("negocio_id", "==", negocioId),
    orderBy("fecha", "desc"),
    limit(opts?.max ?? 100)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Movimiento));
}

export async function listMovimientosByProyecto(proyectoId: string): Promise<Movimiento[]> {
  const q = query(
    collection(db, "movimientos"),
    where("proyecto_id", "==", proyectoId),
    orderBy("fecha", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Movimiento));
}

export async function getMovimiento(id: string): Promise<Movimiento | null> {
  const snap = await getDoc(doc(db, "movimientos", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Movimiento;
}

export async function createMovimiento(uid: string, data: MovimientoInput): Promise<string> {
  const payload = {
    tipo: data.tipo,
    monto: data.monto,
    fecha: Timestamp.fromDate(data.fecha),
    cuenta_id: data.cuenta_id,
    cuenta_nombre: data.cuenta_nombre,
    cuenta_destino_id: data.cuenta_destino_id ?? null,
    cuenta_destino_nombre: data.cuenta_destino_nombre ?? null,
    proyecto_id: data.proyecto_id ?? null,
    proyecto_nombre: data.proyecto_nombre ?? null,
    contraparte_id: data.contraparte_id ?? null,
    contraparte_tipo: data.contraparte_tipo,
    contraparte_nombre: data.contraparte_nombre,
    negocio_id: data.negocio_id,
    descripcion: data.descripcion ?? "",
    categoria: data.categoria ?? "",
    creado_at: serverTimestamp(),
    creado_por: uid,
  };
  const ref = await addDoc(collection(db, "movimientos"), payload);

  // Disparar recálculos
  await Promise.all([
    recalcularCuenta(data.cuenta_id),
    data.cuenta_destino_id ? recalcularCuenta(data.cuenta_destino_id) : Promise.resolve(),
    data.proyecto_id ? recalcularProyecto(data.proyecto_id) : Promise.resolve(),
  ]);

  return ref.id;
}

export async function deleteMovimiento(id: string): Promise<void> {
  const snap = await getDoc(doc(db, "movimientos", id));
  if (!snap.exists()) return;
  const m = snap.data() as Movimiento;

  await deleteDoc(doc(db, "movimientos", id));

  await Promise.all([
    recalcularCuenta(m.cuenta_id),
    m.cuenta_destino_id ? recalcularCuenta(m.cuenta_destino_id) : Promise.resolve(),
    m.proyecto_id ? recalcularProyecto(m.proyecto_id) : Promise.resolve(),
  ]);
}

/**
 * Recalcula saldo_actual de una cuenta.
 * saldo = saldo_inicial + ingresos + transferencias_entrantes - egresos - transferencias_salientes
 */
export async function recalcularCuenta(cuentaId: string): Promise<void> {
  const cuentaRef = doc(db, "cuentas", cuentaId);

  const salientesQ = query(collection(db, "movimientos"), where("cuenta_id", "==", cuentaId));
  const entrantesTransfQ = query(
    collection(db, "movimientos"),
    where("cuenta_destino_id", "==", cuentaId),
    where("tipo", "==", "transferencia")
  );

  const [salientesSnap, entrantesSnap] = await Promise.all([
    getDocs(salientesQ),
    getDocs(entrantesTransfQ),
  ]);

  let delta = 0;
  salientesSnap.forEach((d) => {
    const m = d.data();
    if (m.tipo === "ingreso") delta += m.monto ?? 0;
    else if (m.tipo === "egreso") delta -= m.monto ?? 0;
    else if (m.tipo === "transferencia") delta -= m.monto ?? 0;
  });
  entrantesSnap.forEach((d) => {
    delta += d.data().monto ?? 0;
  });

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(cuentaRef);
    if (!snap.exists()) return;
    const saldoInicial = snap.data().saldo_inicial ?? 0;
    tx.update(cuentaRef, { saldo_actual: saldoInicial + delta });
  });
}
