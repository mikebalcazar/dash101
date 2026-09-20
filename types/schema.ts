import type { Timestamp, FieldValue } from "firebase/firestore";

export type Moneda = "MXN" | "USD";
export type RolMiembro = "owner" | "socio" | "viewer";
export type ScopeMiembro = "all" | "proyectos";
export type TipoCuenta = "banco" | "caja" | "credito" | "otro";
/** `finiquito` lo pone la API sola cuando todos los ítems vendidos llegan a la etapa 7. */
export type EstadoProyecto = "planeando" | "activo" | "pausado" | "finiquito" | "cerrado";
export type EstadoPartida = "pendiente" | "parcial" | "pagado";
export type TipoMovimiento = "ingreso" | "egreso";
/** `personal` y `otro` son de la suite; `cuenta`, `opex` y `ajuste` son de Firestore (la API los importa como `otro`). */
export type TipoContraparte = "cliente" | "proveedor" | "cuenta" | "opex" | "ajuste" | "personal" | "otro";
export type EstadoInvitacion = "pendiente" | "aceptada" | "revocada" | "expirada";

export type FrecuenciaOpex = "semanal" | "mensual" | "anual";
export type TipoOpex = "egreso" | "ingreso";

export interface MembershipInfo {
  rol: RolMiembro;
  scope: ScopeMiembro;
  proyectos_acceso?: string[];
  invited_by_uid?: string;
  invited_at?: Timestamp | FieldValue;
}

export interface Usuario {
  email: string;
  nombre: string;
  negocios_acceso: string[]; // IDs para query fácil
  memberships: Record<string, MembershipInfo>; // negocio_id -> detalles
  creado_at: Timestamp | FieldValue;
}

export interface Negocio {
  id?: string;
  nombre: string;
  descripcion?: string;
  rfc?: string;
  moneda: Moneda;
  /** Día en que toca conciliar: 0 domingo … 6 sábado. Por omisión, lunes. */
  dia_conciliacion?: number;
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
  /** Acceso al portal de estados de cuenta (Firebase Auth uid del cliente) */
  uid?: string | null;
  portal_email?: string | null;
  portal_activo?: boolean;
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

/**
 * Producto/ítem que el cliente compra dentro del proyecto (lo que ve en su
 * estado de cuenta). Distinto de PartidaProyecto, que es compromiso con proveedor.
 * La etapa de fabricación NO vive aquí: viene de quell101 (quell_id la liga).
 */
export interface ProductoProyecto {
  id: string;
  nombre: string;
  descripcion?: string;
  /** El importe de LA LÍNEA: las 20 puertas juntas, no una. `precio_venta`
   *  es la suma de estos. El precio por pieza es `monto / cantidad`. */
  monto: number;
  /** Cuántas piezas iguales son (contrato 0.24.0). Por omisión 1. */
  cantidad: number;
  /** Σ ingresos con producto_id == id — calculado por recalcularProyecto() */
  pagado: number;
  fecha_entrega?: Timestamp | null;
  quell_id?: string | null;
}

export interface Proyecto {
  id?: string;
  nombre: string;
  descripcion?: string;
  cliente_id: string;
  cliente_nombre: string;
  /** uid del portal del cliente, denormalizado para rules de lectura */
  cliente_uid?: string | null;
  productos?: ProductoProyecto[];
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
  /** Cuando 2 movs son parte de una transferencia entre cuentas, comparten transfer_id */
  transfer_id?: string | null;
  /** @deprecated usar transfer_id + dos movs ligados */
  cuenta_destino_id?: string | null;
  /** @deprecated */
  cuenta_destino_nombre?: string | null;
  contraparte_id?: string | null;
  contraparte_tipo: TipoContraparte;
  contraparte_nombre: string;
  /** Ingreso de cliente asignado a un producto del proyecto (portal) */
  producto_id?: string | null;
  producto_nombre?: string | null;
  /** uid del portal del cliente, denormalizado para rules de lectura */
  cliente_uid?: string | null;
  negocio_id: string;
  descripcion?: string;
  categoria?: string;
  /** Lo fiscal. `facturado` dice que la factura ya llegó; `requiere_factura`,
   *  que se espera. La pantalla de corregir los necesita: el monto de un
   *  movimiento ya facturado no se toca sin quitar antes la marca. */
  facturado?: boolean;
  requiere_factura?: boolean;
  creado_por: string;
  creado_at: Timestamp | FieldValue;
}

/** La categoría con la que la API marca el ajuste de una conciliación. En los
 *  reportes sale aparte: es dinero que se movió sin que nadie lo registrara. */
export const CATEGORIA_AJUSTE = "ajuste_conciliacion";

/** Una conciliación: la foto de un corte. No se edita nunca. */
export interface Conciliacion {
  id: string;
  negocio_id: string;
  corte_at: Timestamp;
  hecha_por: string;
  cuentas: ConciliacionCuenta[];
  /** Σ diferencias del corte, en pesos. Positiva: se escapó dinero. */
  diferencia_total: number;
}

export interface ConciliacionCuenta {
  id: string;
  cuenta_id: string;
  cuenta_nombre?: string;
  /** pesos */
  saldo_registrado: number;
  /** pesos */
  saldo_real: number;
  /** registrado − real, en pesos. Positiva: salidas que nadie registró. */
  diferencia: number;
  /** El ajuste que dejó la cuenta igual al real; null si cuadró. */
  movimiento_id: string | null;
}

/** Lo que se escapó: por corte, por cuenta y el acumulado. Todo en pesos. */
export interface EstadisticaConciliacion {
  cortes: Array<{ id: string; corte_at: Timestamp; cuentas: number; diferencia_total: number; faltante: number; sobrante: number }>;
  por_cuenta: Array<{ cuenta_id: string; nombre: string; cortes: number; diferencia_total: number }>;
  acumulado: { cortes: number; diferencia_total: number; faltante: number; sobrante: number };
}

export interface Invitacion {
  id?: string;
  email: string; // lowercase
  negocio_id: string;
  negocio_nombre: string;
  invited_by_uid: string;
  invited_by_nombre: string;
  invited_by_email: string;
  rol: RolMiembro;
  scope: ScopeMiembro;
  proyectos_ids?: string[];
  proyectos_labels?: string[]; // display "nombre — cliente"
  estado: EstadoInvitacion;
  creado_at: Timestamp | FieldValue;
  expira_at: Timestamp;
  aceptada_at?: Timestamp | FieldValue;
  aceptada_por_uid?: string;
}

export interface Opex {
  id?: string;
  nombre: string;
  tipo: TipoOpex;
  monto: number;
  moneda: Moneda;
  frecuencia: FrecuenciaOpex;
  dia_semana?: number | null; // 0-6 (0=domingo) para frecuencia=semanal
  dia_del_mes?: number | null; // 1-31 para frecuencia=mensual; auto-ajusta si mes tiene menos días
  fecha_inicio: Timestamp | FieldValue;
  fecha_fin?: Timestamp | null;
  cuenta_id?: string | null;
  cuenta_nombre?: string | null;
  categoria?: string;
  activo: boolean;
  negocio_id: string;
  descripcion?: string;
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
  INVITACIONES: "invitaciones",
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
  finiquito: "Finiquito",
  cerrado: "Cerrado",
};

export const TIPO_MOVIMIENTO_LABELS: Record<TipoMovimiento, string> = {
  ingreso: "Ingreso",
  egreso: "Egreso",
};

export const ROL_LABELS: Record<RolMiembro, string> = {
  owner: "Propietario",
  socio: "Socio (lectura + escritura)",
  viewer: "Solo lectura",
};

export const ROL_DESCRIPCION: Record<RolMiembro, string> = {
  owner: "Control total. Puede invitar y eliminar.",
  socio: "Puede crear/editar/borrar dentro de su scope. No invita.",
  viewer: "Solo puede ver. No crea ni edita.",
};

export const FRECUENCIA_LABELS: Record<FrecuenciaOpex, string> = {
  semanal: "Cada semana",
  mensual: "Cada mes",
  anual: "Cada año",
};

export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
