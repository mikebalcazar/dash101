import type { Timestamp, FieldValue } from "firebase/firestore";

export type Moneda = "MXN" | "USD";
export type RolUsuario = "owner" | "socio" | "viewer";
export type TipoCuenta = "banco" | "caja" | "credito" | "otro";
export type EstadoProyecto = "planeando" | "activo" | "pausado" | "cerrado";
export type EstadoPartida = "pendiente" | "parcial" | "pagado";
export type TipoMovimiento = "ingreso" | "egreso" | "transferencia";
export type TipoContraparte = "cliente" | "proveedor" | "cuenta" | "opex" | "ajuste";

export interface Usuario {
  email: string;
  nombre: string;
  rol: RolUsuario;
  negocios_acceso: string[];
  creado_at: Timestamp | FieldValue;
}

export interface Negocio {
  id?: string;
  nombre: string;
  descripcion?: string;
  rfc?: string;
  moneda: Moneda;
  owner_uid: string;
  miembros_uids: string[];
  creado_at: Timestamp | FieldValue;
  creado_por: string;
}

export interface Cuenta {
  id?: string;
  nombre: string;
  tipo: TipoCuenta;
  banco?: string;
  numero?: string;
  moneda: Moneda;
  saldo_inicial: number;
  saldo_actual: number;
  negocio_id: string;
  creado_at: Timestamp | FieldValue;
  creado_por: string;
}

export interface Cliente {
  id?: string;
  nombre: string;
  rfc?: string;
  email?: string;
  telefono?: string;
  notas?: string;
  negocio_id: string;
  creado_at: Timestamp | FieldValue;
  creado_por: string;
}

export interface Proveedor {
  id?: string;
  nombre: string;
  rfc?: string;
  categoria?: string;
  email?: string;
  telefono?: string;
  terminos_pago_default?: string;
  notas?: string;
  creado_at: Timestamp | FieldValue;
  creado_por: string;
}

export interface PartidaProyecto {
  proveedor_id: string;
  proveedor_nombre: string;
  concepto?: string;
  monto_acordado: number;
  monto_pagado: number;
  estado: EstadoPartida;
}

export interface Proyecto {
  id?: string;
  nombre: string;
  descripcion?: string;
  cliente_id: string;
  cliente_nombre: string;
  negocio_id: string;
  negocio_nombre: string;
  precio_venta: number;
  compromiso_total: number;
  cobrado: number;
  pagado: number;
  disponible: number;
  margen_proyectado: number;
  partidas: PartidaProyecto[];
  estado: EstadoProyecto;
  fecha_inicio: Timestamp | FieldValue;
  fecha_fin_estimada?: Timestamp | null;
  fecha_cierre?: Timestamp | null;
  creado_at: Timestamp | FieldValue;
  creado_por: string;
  actualizado_at?: Timestamp | FieldValue;
}

export interface Movimiento {
  id?: string;
  tipo: TipoMovimiento;
  monto: number;
  fecha: Timestamp | FieldValue;

  proyecto_id?: string | null;
  proyecto_nombre?: string | null;

  cuenta_id: string;
  cuenta_nombre: string;

  cuenta_destino_id?: string | null;
  cuenta_destino_nombre?: string | null;

  contraparte_id?: string | null;
  contraparte_tipo: TipoContraparte;
  contraparte_nombre: string;

  negocio_id: string;

  descripcion?: string;
  categoria?: string;

  creado_por: string;
  creado_at: Timestamp | FieldValue;
}

export const COLLECTIONS = {
  USUARIOS: "usuarios",
  NEGOCIOS: "negocios",
  CUENTAS: "cuentas",
  CLIENTES: "clientes",
  PROVEEDORES: "proveedores",
  PROYECTOS: "proyectos",
  MOVIMIENTOS: "movimientos",
  OPEX: "opex",
} as const;

export const TIPO_CUENTA_LABELS: Record<TipoCuenta, string> = {
  banco: "Cuenta bancaria",
  caja: "Caja / Efectivo",
  credito: "Tarjeta de crédito",
  otro: "Otro",
};

export const ESTADO_PROYECTO_LABELS: Record<EstadoProyecto, string> = {
  planeando: "Planeando",
  activo: "Activo",
  pausado: "Pausado",
  cerrado: "Cerrado",
};

export const TIPO_MOVIMIENTO_LABELS: Record<TipoMovimiento, string> = {
  ingreso: "Ingreso",
  egreso: "Egreso",
  transferencia: "Transferencia",
};
