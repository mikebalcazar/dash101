import type { Timestamp, FieldValue } from "firebase/firestore";

export type Moneda = "MXN" | "USD";
export type RolUsuario = "owner" | "socio" | "viewer";
export type TipoCuenta = "banco" | "caja" | "credito" | "otro";

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
