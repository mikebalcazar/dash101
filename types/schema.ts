import type { Timestamp, FieldValue } from "firebase/firestore";

export type Moneda = "MXN" | "USD";
export type RolMiembro = "owner" | "socio" | "viewer";
export type ScopeMiembro = "all" | "proyectos";
export type TipoCuenta = "banco" | "caja" | "credito" | "otro";
/** Qué es el proveedor (contrato 0.68.0, Mike 5-oct-2026): surte materiales, o
 *  da un servicio (un contratista). Es el mismo campo en todas las apps. */
export type TipoProveedor = "materiales" | "servicios";
/** `finiquito` lo pone la API sola cuando todos los ítems vendidos llegan a la etapa 7. */
export type EstadoProyecto = "planeando" | "activo" | "pausado" | "finiquito" | "cerrado";
export type EstadoPartida = "pendiente" | "parcial" | "pagado";
export type TipoMovimiento = "ingreso" | "egreso";
/** `personal` y `otro` son de la suite; `cuenta`, `opex` y `ajuste` son de Firestore (la API los importa como `otro`). */
/** `accionista` desde el contrato 0.57.0: un retiro de utilidades. */
export type TipoContraparte = "cliente" | "proveedor" | "cuenta" | "opex" | "ajuste" | "personal" | "accionista" | "otro";
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
  /** Lo que puede hacer en la empresa; null si no es miembro. */
  membership: MembershipInfo | null;
  creado_at: Timestamp | FieldValue;
}

/** LA EMPRESA, una sola (contrato 0.63.0). Mike, 1-oct-2026: «Sólo es una
 *  empresa/negocio todo». Es lo que `GET /orgs/:o/empresa` contesta y lo que
 *  cada pantalla toma de `useEmpresa()`. */
export interface Empresa {
  /** Siempre 'empresa'. */
  id: string;
  nombre: string;
  rfc: string | null;
  moneda: Moneda;
  /** Día en que toca conciliar: 0 domingo … 6 sábado. Por omisión, lunes. */
  dia_conciliacion: number;
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
  tipo?: TipoProveedor;
  categoria?: string;
  email?: string;
  telefono?: string;
  terminos_pago_default?: string;
  notas?: string;
  creado_at: Timestamp | FieldValue;
  creado_por: string;
}

/** Un accionista de la empresa (contrato 0.57.0). Mike, 30-sep-2026: «un
 *  módulo de accionistas donde se registren pagos a los accionistas como
 *  retiro de utilidades». El retiro no es una tabla: es un egreso con
 *  categoría CATEGORIA_RETIRO_UTILIDADES y contraparte `accionista`. */
export interface Accionista {
  id: string;
  nombre: string;
  rfc: string;
  correo: string;
  telefono: string;
  /** Participación, 0 a 100; null si no se capturó. */
  porcentaje: number | null;
  notas: string;
  activo: boolean;
}

/** La categoría del egreso que es un retiro de utilidades (0.57.0). */
export const CATEGORIA_RETIRO_UTILIDADES = "retiro_utilidades";

export interface PartidaProyecto {
  id?: string;
  proveedor_id: string;
  proveedor_nombre: string;
  concepto?: string;
  monto_acordado: number;
  monto_pagado: number;
  estado: EstadoPartida;
  /** 0.73.0 · Si nace de una fase del cronograma de quell101 (Mike, 6-oct):
   *  el costo, el responsable y la fecha se cambian allá; aquí se lee. */
  tarea_id?: string | null;
  /** AAAA-MM-DD: cuándo se espera pagarla (el material al arrancar la fase,
   *  lo demás al terminarla). Es lo que el flujo proyectado usa. */
  fecha_esperada?: string | null;
}

/**
 * Un ítem del proyecto: la pieza física que el cliente compra (lo que ve en su
 * estado de cuenta). Distinto de PartidaProyecto, que es compromiso con proveedor.
 * Y distinto del PRODUCTO de catálogo, que es el modelo al que pertenece y al
 * que apunta `producto_id` (contrato 0.35.0): varios ítems pueden ser del mismo.
 * La etapa de fabricación NO vive aquí: viene de quell101 (quell_id la liga).
 */
export interface ItemProyecto {
  id: string;
  nombre: string;
  descripcion?: string;
  /** El importe de LA LÍNEA: las 20 puertas juntas, no una. `precio_venta`
   *  es la suma de estos. El precio por pieza es `monto / cantidad`. */
  monto: number;
  /** Cuántas piezas iguales son (contrato 0.24.0). Por omisión 1. */
  cantidad: number;
  /** mueble, puerta, acabado, servicio… Pinta la raya de color del renglón
   *  en la lista, con los colores de quell101 (6-oct). */
  tipo?: string;
  /** Σ ingresos con producto_id == id — calculado por recalcularProyecto() */
  pagado: number;
  /** Lo que de los pagos se le ha repartido como anticipo (contrato 0.70.0).
   *  Es uno de los dos candados del cronograma de quell101. */
  anticipo: number;
  fecha_entrega?: Timestamp | null;
  quell_id?: string | null;
  /** El capítulo bajo el que va el ítem —Cocina, Recámaras— (contrato
   *  0.30.0). Vacío es «sin partida». OJO: no es `partidas`, que en esta
   *  app son los compromisos con proveedores. */
  partida?: string;
  /** Su lugar dentro de la partida. Con todos en cero manda el orden en que
   *  se capturaron. */
  orden?: number;
  /** A qué modelo del catálogo pertenece esta pieza (contrato 0.35.0).
   *  Vacío o nulo = el ítem es su propio producto único, que es como nacen
   *  todos.
   *
   *  Éste es el único «producto» de este tipo, y es el del catálogo. Los
   *  renglones del proyecto se llamaron `productos` hasta el 20-sep-2026, de
   *  la época de Firestore; ese día Mike separó las dos cosas —«una cosa es
   *  el código de ítem (pieza física en obra) y otra diferente el código de
   *  producto de catálogo»— y los renglones pasaron a llamarse ítems. */
  producto_id?: string | null;
  /** El código de catálogo que le toca por su producto, o el suyo si todavía
   *  no es de ninguno. */
  clave?: string | null;
  /** Cuántos renglones se tragó este cuando «juntar los iguales» FUSIONABA
   *  (contrato 0.30.0). Cero es lo normal. Más que cero quiere decir que
   *  este renglón se puede partir de vuelta: la fusión dejó anotado qué
   *  borró, y `separarItem` lo devuelve. */
  fusionados?: number;
}

export interface Proyecto {
  id?: string;
  nombre: string;
  descripcion?: string;
  cliente_id: string;
  cliente_nombre: string;
  /** uid del portal del cliente, denormalizado para rules de lectura */
  cliente_uid?: string | null;
  items?: ItemProyecto[];
  precio_venta: number;
  compromiso_total: number;
  cobrado: number;
  pagado: number;
  disponible: number;
  margen_proyectado: number;
  partidas: PartidaProyecto[];
  /** Puntos base: 1600 = 16 %. Lo lleva cada obra (contrato 0.39.0). */
  tasa_iva?: number;
  /** false = el precio capturado es el SUBTOTAL y el IVA se suma encima,
   *  que es como nacen todas; true = ya viene dentro y el estado de cuenta
   *  lo desglosa hacia atrás. Decisión de Mike del 21-sep. */
  iva_incluido?: boolean;
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
/** Un egreso que no es de ningún proyecto: renta, máquinas, herramienta,
 *  licencias de software (contrato 0.60.0). Mike, 1-oct-2026: «debe haber
 *  un concepto de gastos generales en el tipo de egreso». */
export const CATEGORIA_GASTO_GENERAL = "gasto_general";

/** Una conciliación: la foto de un corte. No se edita nunca. */
export interface Conciliacion {
  id: string;
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
  empresa_nombre: string;
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
  descripcion?: string;
  creado_at: Timestamp | FieldValue;
  creado_por: string;
}

export const COLLECTIONS = {
  USUARIOS: "usuarios",
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
