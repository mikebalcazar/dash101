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
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Proyecto, PartidaProyecto, EstadoProyecto } from "@/types/schema";

export interface ProyectoInput {
  nombre: string;
  descripcion?: string;
  cliente_id: string;
  cliente_nombre: string;
  negocio_id: string;
  negocio_nombre: string;
  precio_venta: number;
  partidas: PartidaProyectoInput[];
  estado: EstadoProyecto;
  fecha_inicio: Date;
  fecha_fin_estimada?: Date | null;
}

export interface PartidaProyectoInput {
  proveedor_id: string;
  proveedor_nombre: string;
  concepto?: string;
  monto_acordado: number;
}

function calcCompromiso(partidas: { monto_acordado: number }[]): number {
  return partidas.reduce((sum, p) => sum + (p.monto_acordado || 0), 0);
}

export async function listProyectos(negocioId: string): Promise<Proyecto[]> {
  const q = query(
    collection(db, "proyectos"),
    where("negocio_id", "==", negocioId),
    orderBy("creado_at", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Proyecto));
}

export async function getProyecto(id: string): Promise<Proyecto | null> {
  const snap = await getDoc(doc(db, "proyectos", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Proyecto;
}

export async function createProyecto(uid: string, data: ProyectoInput): Promise<string> {
  const compromiso = calcCompromiso(data.partidas);
  const partidasFull: PartidaProyecto[] = data.partidas.map((p) => ({
    ...p,
    concepto: p.concepto ?? "",
    monto_pagado: 0,
    estado: "pendiente",
  }));

  const payload = {
    nombre: data.nombre,
    descripcion: data.descripcion ?? "",
    cliente_id: data.cliente_id,
    cliente_nombre: data.cliente_nombre,
    negocio_id: data.negocio_id,
    negocio_nombre: data.negocio_nombre,
    precio_venta: data.precio_venta,
    compromiso_total: compromiso,
    cobrado: 0,
    pagado: 0,
    disponible: 0,
    margen_proyectado: data.precio_venta - compromiso,
    partidas: partidasFull,
    estado: data.estado,
    fecha_inicio: Timestamp.fromDate(data.fecha_inicio),
    fecha_fin_estimada: data.fecha_fin_estimada
      ? Timestamp.fromDate(data.fecha_fin_estimada)
      : null,
    fecha_cierre: null,
    creado_at: serverTimestamp(),
    creado_por: uid,
  };
  const ref = await addDoc(collection(db, "proyectos"), payload);
  return ref.id;
}

export async function updateProyecto(
  id: string,
  data: {
    nombre?: string;
    descripcion?: string;
    precio_venta?: number;
    partidas?: PartidaProyectoInput[];
    estado?: EstadoProyecto;
    fecha_inicio?: Date;
    fecha_fin_estimada?: Date | null;
  }
): Promise<void> {
  const ref = doc(db, "proyectos", id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Proyecto no encontrado");
    const current = snap.data() as Proyecto;

    const updates: Record<string, unknown> = { actualizado_at: serverTimestamp() };
    if (data.nombre !== undefined) updates.nombre = data.nombre;
    if (data.descripcion !== undefined) updates.descripcion = data.descripcion;
    if (data.estado !== undefined) updates.estado = data.estado;
    if (data.fecha_inicio !== undefined)
      updates.fecha_inicio = Timestamp.fromDate(data.fecha_inicio);
    if (data.fecha_fin_estimada !== undefined)
      updates.fecha_fin_estimada = data.fecha_fin_estimada
        ? Timestamp.fromDate(data.fecha_fin_estimada)
        : null;

    if (data.partidas !== undefined) {
      // preservar monto_pagado y estado de partidas existentes
      const existingByProv = new Map<string, PartidaProyecto>();
      (current.partidas ?? []).forEach((p) => existingByProv.set(p.proveedor_id, p));
      const newPartidas: PartidaProyecto[] = data.partidas.map((p) => {
        const prev = existingByProv.get(p.proveedor_id);
        const pagado = prev?.monto_pagado ?? 0;
        const estado: PartidaProyecto["estado"] =
          pagado >= p.monto_acordado && p.monto_acordado > 0
            ? "pagado"
            : pagado > 0
            ? "parcial"
            : "pendiente";
        return {
          proveedor_id: p.proveedor_id,
          proveedor_nombre: p.proveedor_nombre,
          concepto: p.concepto ?? "",
          monto_acordado: p.monto_acordado,
          monto_pagado: pagado,
          estado,
        };
      });
      updates.partidas = newPartidas;
      updates.compromiso_total = calcCompromiso(newPartidas);
    }

    const precioVenta = data.precio_venta !== undefined ? data.precio_venta : current.precio_venta;
    const compromiso =
      data.partidas !== undefined ? calcCompromiso(data.partidas) : current.compromiso_total;
    if (data.precio_venta !== undefined) updates.precio_venta = precioVenta;
    updates.margen_proyectado = precioVenta - compromiso;

    tx.update(ref, updates);
  });
}

export async function deleteProyecto(id: string): Promise<void> {
  await deleteDoc(doc(db, "proyectos", id));
}

/**
 * Recalcula cobrado/pagado/disponible + monto_pagado por partida.
 * Se llama después de crear/editar/borrar un movimiento.
 * Usa transacción para lectura+escritura atómica.
 */
export async function recalcularProyecto(proyectoId: string): Promise<void> {
  const proyectoRef = doc(db, "proyectos", proyectoId);
  const movimientosQ = query(
    collection(db, "movimientos"),
    where("proyecto_id", "==", proyectoId)
  );
  const movsSnap = await getDocs(movimientosQ);

  let cobrado = 0;
  let pagado = 0;
  const pagosPorProveedor = new Map<string, number>();

  movsSnap.forEach((d) => {
    const m = d.data();
    if (m.tipo === "ingreso") {
      cobrado += m.monto ?? 0;
    } else if (m.tipo === "egreso") {
      pagado += m.monto ?? 0;
      if (m.contraparte_tipo === "proveedor" && m.contraparte_id) {
        pagosPorProveedor.set(
          m.contraparte_id,
          (pagosPorProveedor.get(m.contraparte_id) ?? 0) + (m.monto ?? 0)
        );
      }
    }
  });

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(proyectoRef);
    if (!snap.exists()) return;
    const data = snap.data() as Proyecto;

    const partidas: PartidaProyecto[] = (data.partidas ?? []).map((p) => {
      const pagoTotal = pagosPorProveedor.get(p.proveedor_id) ?? 0;
      const estado: PartidaProyecto["estado"] =
        pagoTotal >= p.monto_acordado && p.monto_acordado > 0
          ? "pagado"
          : pagoTotal > 0
          ? "parcial"
          : "pendiente";
      return { ...p, monto_pagado: pagoTotal, estado };
    });

    tx.update(proyectoRef, {
      cobrado,
      pagado,
      disponible: cobrado - pagado,
      partidas,
      actualizado_at: serverTimestamp(),
    });
  });
}
