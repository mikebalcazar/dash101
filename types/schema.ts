import type { Timestamp, FieldValue } from "firebase/firestore";

export type Moneda = "MXN" | "USD";
export type RolUsuario = "owner" | "socio" | "viewer";

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
