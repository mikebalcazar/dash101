import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
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
import { fuente } from "./fuente";
import * as leer from "./api/leer";
import * as escribir from "./api/escribir";
import type { Movimiento, TipoMovimiento, TipoContraparte } from "@/types/schema";
import { recalcularProyecto } from "./proyectos";
import { getClienteUid } from "./clientes";

export interface MovimientoInput {
  tipo: TipoMovimiento; // ingreso | egreso
  monto: number;
  fecha: Date;
  cuenta_id: string;
  cuenta_nombre: string;
  proyecto_id?: string | null;
  proyecto_nombre?: string | null;
  contraparte_id?: string | null;
  contraparte_tipo: TipoContraparte;
  contraparte_nombre: string;
  /** Ingreso de cliente asignado a un producto del proyecto */
  producto_id?: string | null;
  producto_nombre?: string | null;
  negocio_id: string;
  descripcion?: string;
  categoria?: string;
  /** Si es parte de una transferencia, ambos movs (egreso+ingreso) comparten este id */
  transfer_id?: string | null;
  /** Que se ESPERA factura por este movimiento. No es lo mismo que decir que
   *  ya llegó (`facturado`, que se marca aparte): esto es la decisión de quien
   *  captura, y es lo que hace que el movimiento salga en «pendientes de
   *  facturar» hasta que la factura exista. */
  requiere_factura?: boolean;
}

export async function listMovimientos(
  negocioId: string,
  opts?: { max?: number }
): Promise<Movimiento[]> {
  if (fuente() === 'api') return leer.listMovimientos(negocioId, opts);
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
  if (fuente() === 'api') return leer.listMovimientosByProyecto(proyectoId);
  const q = query(
    collection(db, "movimientos"),
    where("proyecto_id", "==", proyectoId),
    orderBy("fecha", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Movimiento));
}

export async function getMovimiento(id: string): Promise<Movimiento | null> {
  if (fuente() === 'api') return leer.getMovimiento(id);
  const snap = await getDoc(doc(db, "movimientos", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Movimiento;
}

export async function createMovimiento(uid: string, data: MovimientoInput): Promise<string> {
  if (fuente() === 'api') return escribir.createMovimiento(uid, data);
  // Ingreso de un cliente con portal → se denormaliza su uid para que lo pueda leer
  const cliente_uid =
    data.tipo === "ingreso" && data.contraparte_tipo === "cliente" && data.contraparte_id
      ? await getClienteUid(data.contraparte_id)
      : null;
  const payload = {
    tipo: data.tipo,
    monto: data.monto,
    fecha: Timestamp.fromDate(data.fecha),
    cuenta_id: data.cuenta_id,
    cuenta_nombre: data.cuenta_nombre,
    transfer_id: data.transfer_id ?? null,
    proyecto_id: data.proyecto_id ?? null,
    proyecto_nombre: data.proyecto_nombre ?? null,
    contraparte_id: data.contraparte_id ?? null,
    contraparte_tipo: data.contraparte_tipo,
    contraparte_nombre: data.contraparte_nombre,
    producto_id: data.producto_id ?? null,
    producto_nombre: data.producto_nombre ?? null,
    cliente_uid,
    negocio_id: data.negocio_id,
    descripcion: data.descripcion ?? "",
    categoria: data.categoria ?? "",
    creado_at: serverTimestamp(),
    creado_por: uid,
  };

  const ref = await addDoc(collection(db, "movimientos"), payload);

  try {
    await Promise.all([
      recalcularCuenta(data.cuenta_id),
      data.proyecto_id ? recalcularProyecto(data.proyecto_id) : Promise.resolve(),
    ]);
  } catch (e) {
    // El movimiento se creó bien, solo los agregados fallaron. No abortar.
    console.warn(
      "[recalcular fallo, mov creado ok]",
      e instanceof Error ? e.message : e
    );
  }

  return ref.id;
}

/**
 * Crea una transferencia como 2 movimientos ligados por transfer_id.
 * Egreso en cuenta origen + ingreso en cuenta destino.
 * (Aún no expuesto en UI; base preparada para siguiente iteración.)
 */
export async function createTransferencia(
  uid: string,
  args: {
    monto: number;
    fecha: Date;
    cuenta_origen: { id: string; nombre: string };
    cuenta_destino: { id: string; nombre: string };
    negocio_id: string;
    descripcion?: string;
  }
): Promise<{ id_egreso: string; id_ingreso: string; transfer_id: string }> {
  const transfer_id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `t_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const [id_egreso, id_ingreso] = await Promise.all([
    createMovimiento(uid, {
      tipo: "egreso",
      monto: args.monto,
      fecha: args.fecha,
      cuenta_id: args.cuenta_origen.id,
      cuenta_nombre: args.cuenta_origen.nombre,
      contraparte_id: args.cuenta_destino.id,
      contraparte_tipo: "cuenta",
      contraparte_nombre: args.cuenta_destino.nombre,
      negocio_id: args.negocio_id,
      descripcion:
        `Transferencia → ${args.cuenta_destino.nombre}` +
        (args.descripcion ? ` · ${args.descripcion}` : ""),
      transfer_id,
    }),
    createMovimiento(uid, {
      tipo: "ingreso",
      monto: args.monto,
      fecha: args.fecha,
      cuenta_id: args.cuenta_destino.id,
      cuenta_nombre: args.cuenta_destino.nombre,
      contraparte_id: args.cuenta_origen.id,
      contraparte_tipo: "cuenta",
      contraparte_nombre: args.cuenta_origen.nombre,
      negocio_id: args.negocio_id,
      descripcion:
        `Transferencia ← ${args.cuenta_origen.nombre}` +
        (args.descripcion ? ` · ${args.descripcion}` : ""),
      transfer_id,
    }),
  ]);
  return { id_egreso, id_ingreso, transfer_id };
}

/**
 * Borra un movimiento. Si es parte de una transferencia (transfer_id no null),
 * también borra el par.
 */
/** Corregir un movimiento. Sólo por la API: la fuente vieja de Firestore no
 *  recalcula saldos al editar, y un saldo que no cuadra es peor que no poder
 *  corregir. */
export async function updateMovimiento(id: string, data: Partial<MovimientoInput>): Promise<void> {
  if (fuente() !== 'api') throw new Error('Corregir un movimiento sólo está disponible con la suite.');
  return escribir.updateMovimiento(id, data);
}

export async function deleteMovimiento(id: string): Promise<void> {
  if (fuente() === 'api') return escribir.deleteMovimiento(id);
  const snap = await getDoc(doc(db, "movimientos", id));
  if (!snap.exists()) return;
  const m = snap.data() as Movimiento;

  if (m.transfer_id) {
    // Borrar todos los movs con este transfer_id
    const parQ = query(
      collection(db, "movimientos"),
      where("transfer_id", "==", m.transfer_id)
    );
    const parSnap = await getDocs(parQ);
    const cuentasAfectadas = new Set<string>();
    const proyectosAfectados = new Set<string>();
    for (const d of parSnap.docs) {
      const data = d.data() as Movimiento;
      cuentasAfectadas.add(data.cuenta_id);
      if (data.proyecto_id) proyectosAfectados.add(data.proyecto_id);
    }
    await Promise.all(parSnap.docs.map((d) => deleteDoc(doc(db, "movimientos", d.id))));
    await Promise.all([
      ...Array.from(cuentasAfectadas).map(recalcularCuenta),
      ...Array.from(proyectosAfectados).map(recalcularProyecto),
    ]);
  } else {
    await deleteDoc(doc(db, "movimientos", id));
    await Promise.all([
      recalcularCuenta(m.cuenta_id),
      m.proyecto_id ? recalcularProyecto(m.proyecto_id) : Promise.resolve(),
    ]);
  }
}

/**
 * Recalcula saldo_actual de una cuenta.
 * saldo = saldo_inicial + Σ ingresos - Σ egresos
 * (Movs con tipo="transferencia" del formato viejo se ignoran silenciosamente.)
 */
export async function recalcularCuenta(cuentaId: string): Promise<void> {
  // Con la API el saldo se suma al leer la cuenta; no hay caché que refrescar.
  if (fuente() === 'api') return;
  const cuentaRef = doc(db, "cuentas", cuentaId);

  const q = query(collection(db, "movimientos"), where("cuenta_id", "==", cuentaId));
  const snap = await getDocs(q);

  let delta = 0;
  snap.forEach((d) => {
    const m = d.data();
    if (m.tipo === "ingreso") delta += m.monto ?? 0;
    else if (m.tipo === "egreso") delta -= m.monto ?? 0;
    // "transferencia" (legacy) → ignora
  });

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(cuentaRef);
    if (!snap.exists()) return;
    const saldoInicial = snap.data().saldo_inicial ?? 0;
    tx.update(cuentaRef, { saldo_actual: saldoInicial + delta });
  });
}
