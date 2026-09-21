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
import { fuente } from "./fuente";
import * as leer from "./api/leer";
import * as escribir from "./api/escribir";
import type {
  Proyecto,
  PartidaProyecto,
  ItemProyecto,
  EstadoProyecto,
} from "@/types/schema";
import { getClienteUid } from "./clientes";

export interface ProyectoInput {
  nombre: string;
  descripcion?: string;
  cliente_id: string;
  cliente_nombre: string;
  negocio_id: string;
  negocio_nombre: string;
  precio_venta: number;
  partidas: PartidaProyectoInput[];
  items?: ItemProyectoInput[];
  estado: EstadoProyecto;
  fecha_inicio: Date;
  fecha_fin_estimada?: Date | null;
}

export interface ItemProyectoInput {
  id?: string; // vacío → se genera
  nombre: string;
  descripcion?: string;
  /** El importe de la línea. La pantalla lo calcula: cantidad × precio pieza. */
  monto: number;
  /** Cuántas piezas iguales. Sin decir nada, 1. */
  cantidad?: number;
  fecha_entrega?: Date | null;
  quell_id?: string | null;
}

function nuevoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Normaliza los ítems del form; preserva `pagado` de los que ya existían (por id). */
function armarItems(
  input: ItemProyectoInput[],
  previos: ItemProyecto[] = []
): ItemProyecto[] {
  const prevById = new Map(previos.map((p) => [p.id, p]));
  return input.map((p) => {
    const id = p.id || nuevoId();
    return {
      id,
      nombre: p.nombre,
      descripcion: p.descripcion ?? "",
      monto: p.monto,
      cantidad: p.cantidad && p.cantidad > 0 ? Math.trunc(p.cantidad) : 1,
      pagado: prevById.get(id)?.pagado ?? 0,
      fecha_entrega: p.fecha_entrega ? Timestamp.fromDate(p.fecha_entrega) : null,
      quell_id: p.quell_id ?? null,
    };
  });
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

/** Un documento de Firestore, visto como Proyecto.
 *
 *  EL CAMPO DE FIRESTORE SIGUE SIENDO `productos`. Los renglones del proyecto
 *  se renombraron a `items` el 20-sep-2026 —para no chocar con los productos
 *  de catálogo del contrato 0.35.0—, pero eso es del lado de la pantalla: los
 *  documentos que ya viven en `contamaster-fs` no se migran (y
 *  `scripts/cuadre-firestore.py` los cuenta por ese nombre). Se traduce aquí,
 *  que es la única puerta por la que entran. */
function desdeFirestore(id: string, data: Record<string, unknown>): Proyecto {
  const { productos, ...resto } = data as { productos?: ItemProyecto[] };
  return { id, ...resto, items: productos ?? [] } as Proyecto;
}

export async function listProyectos(negocioId: string): Promise<Proyecto[]> {
  if (fuente() === 'api') return leer.listProyectos(negocioId);
  const q = query(
    collection(db, "proyectos"),
    where("negocio_id", "==", negocioId),
    orderBy("creado_at", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => desdeFirestore(d.id, d.data()));
}

export async function getProyecto(id: string): Promise<Proyecto | null> {
  if (fuente() === 'api') return leer.getProyecto(id);
  const snap = await getDoc(doc(db, "proyectos", id));
  if (!snap.exists()) return null;
  return desdeFirestore(snap.id, snap.data());
}

/** Los ítems del proyecto que todavía no se venden: cotizados, sin precio.
 *
 *  Hoy son las piezas que se trajeron del plano de la obra. Van APARTE de
 *  `items` porque el guardado del proyecto marca vendido todo lo que le
 *  llega, y una cotización que nadie cerró no es una venta. */
export async function itemsSinPrecio(proyecto_id: string) {
  if (fuente() !== 'api') return [];
  return leer.itemsSinPrecio(proyecto_id);
}

export async function createProyecto(uid: string, data: ProyectoInput): Promise<string> {
  if (fuente() === 'api') return escribir.createProyecto(uid, data);
  const compromiso = calcCompromiso(data.partidas);
  const partidasFull: PartidaProyecto[] = data.partidas.map((p) => ({
    ...p,
    concepto: p.concepto ?? "",
    monto_pagado: 0,
    estado: "pendiente",
  }));

  const cliente_uid = await getClienteUid(data.cliente_id);
  const payload = {
    nombre: data.nombre,
    descripcion: data.descripcion ?? "",
    cliente_id: data.cliente_id,
    cliente_nombre: data.cliente_nombre,
    cliente_uid,
    productos: armarItems(data.items ?? []), // campo de Firestore, ver desdeFirestore()
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
    items?: ItemProyectoInput[];
    estado?: EstadoProyecto;
    fecha_inicio?: Date;
    fecha_fin_estimada?: Date | null;
    /** Contrato 0.39.0: cómo lleva el IVA esta obra en su estado de cuenta.
     *  Sólo existe del lado de la API; en Firestore no había dónde. */
    tasa_iva?: number;
    iva_incluido?: boolean;
  }
): Promise<void> {
  if (fuente() === 'api') return escribir.updateProyecto(id, data);
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

    if (data.items !== undefined) {
      // `productos`, no `items`: es el nombre del campo en el documento de
      // Firestore, que no se migra (ver desdeFirestore).
      updates.productos = armarItems(data.items, current.items ?? []);
    }

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

/**
 * Propaga el uid del portal del cliente a sus proyectos y a los ingresos
 * de esos proyectos. Se llama al activar/desactivar el acceso del cliente.
 */
export async function propagarClienteUid(
  clienteId: string,
  clienteUid: string | null,
  negocioId: string
): Promise<{ proyectos: number; movimientos: number }> {
  // Con la API no hay nada que propagar: el portal lee por `clientes.usuario_id`.
  if (fuente() === 'api') return { proyectos: 0, movimientos: 0 };
  const etiqueta = (t: string, e: unknown) => {
    const err = e as { code?: string; message?: string };
    return new Error(`[${t}] ${err.code ?? ""} ${err.message ?? String(e)}`.trim());
  };

  let proySnap;
  try {
    proySnap = await getDocs(
      query(
        collection(db, "proyectos"),
        where("negocio_id", "==", negocioId),
        where("cliente_id", "==", clienteId)
      )
    );
  } catch (e) {
    throw etiqueta("2a leer proyectos del cliente", e);
  }

  let nMovs = 0;
  for (const p of proySnap.docs) {
    try {
      await updateDoc(p.ref, { cliente_uid: clienteUid });
    } catch (e) {
      throw etiqueta(`2b escribir proyecto ${p.id}`, e);
    }

    let movSnap;
    try {
      movSnap = await getDocs(
        query(
          collection(db, "movimientos"),
          where("negocio_id", "==", negocioId),
          where("proyecto_id", "==", p.id)
        )
      );
    } catch (e) {
      throw etiqueta(`2c leer movimientos del proyecto ${p.id}`, e);
    }

    for (const m of movSnap.docs) {
      if (m.data().tipo !== "ingreso") continue;
      try {
        await updateDoc(m.ref, { cliente_uid: clienteUid });
      } catch (e) {
        throw etiqueta(`2d escribir movimiento ${m.id}`, e);
      }
      nMovs++;
    }
  }
  return { proyectos: proySnap.size, movimientos: nMovs };
}

export async function deleteProyecto(id: string): Promise<void> {
  if (fuente() === 'api') return escribir.deleteProyecto(id);
  await deleteDoc(doc(db, "proyectos", id));
}

/**
 * Recalcula cobrado/pagado/disponible + monto_pagado por partida.
 * Se llama después de crear/editar/borrar un movimiento.
 * Usa transacción para lectura+escritura atómica.
 */
export async function recalcularProyecto(proyectoId: string): Promise<void> {
  // Con la API los cachés los recalcula ella después de cada movimiento.
  if (fuente() === 'api') return;
  const proyectoRef = doc(db, "proyectos", proyectoId);
  const movimientosQ = query(
    collection(db, "movimientos"),
    where("proyecto_id", "==", proyectoId)
  );
  const movsSnap = await getDocs(movimientosQ);

  let cobrado = 0;
  let pagado = 0;
  const pagosPorProveedor = new Map<string, number>();
  const cobrosPorProducto = new Map<string, number>();

  movsSnap.forEach((d) => {
    const m = d.data();
    if (m.tipo === "ingreso") {
      cobrado += m.monto ?? 0;
      if (m.producto_id) {
        cobrosPorProducto.set(
          m.producto_id,
          (cobrosPorProducto.get(m.producto_id) ?? 0) + (m.monto ?? 0)
        );
      }
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
    const data = desdeFirestore(proyectoId, snap.data());

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

    const productos: ItemProyecto[] = (data.items ?? []).map((p) => ({
      ...p,
      pagado: cobrosPorProducto.get(p.id) ?? 0,
    }));

    tx.update(proyectoRef, {
      cobrado,
      pagado,
      disponible: cobrado - pagado,
      partidas,
      productos, // campo de Firestore, ver desdeFirestore()
      actualizado_at: serverTimestamp(),
    });
  });
}
