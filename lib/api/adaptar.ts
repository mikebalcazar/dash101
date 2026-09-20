/* De las filas de la API a los tipos que las pantallas ya conocen.
 *
 * Dos traducciones que no se negocian, y por qué:
 *
 *   1. **Dinero.** La API guarda centavos enteros (`15000000`); la app siempre
 *      trabajó en pesos con decimales (`150000`). Las pantallas formatean
 *      pesos, así que aquí se divide entre 100 al leer y se multiplica al
 *      escribir —sin `* 100` a secas, que pierde centavos (`1.005 * 100` es
 *      `100.49999…`)—.
 *   2. **Fechas.** La API manda texto ISO 8601; la app lee `Timestamp` de
 *      Firestore por todos lados (`.toDate()`, catorce veces). Mientras las
 *      pantallas no cambien, se les da un `Timestamp`. Un día de la forma
 *      `AAAA-MM-DD` se toma como día local, no UTC: `new Date('2026-08-18')`
 *      es medianoche en Londres y todavía el 17 en la Ciudad de México.
 *
 * Lo demás son nombres: `correo` ↔ `email`, `usuario_id` ↔ `uid`, los
 * `productos` de Firestore son los `items` de la suite, y las partidas ya son
 * tabla propia desde el contrato 0.3.0. */

import { Timestamp } from 'firebase/firestore';
import type {
  Cliente, Conciliacion, ConciliacionCuenta, Cuenta, EstadisticaConciliacion, Movimiento, Negocio, Opex,
  PartidaProyecto, ProductoProyecto, Proveedor, Proyecto, RolMiembro, TipoContraparte, Usuario,
} from '@/types/schema';

/* ─────────────── dinero ─────────────── */

export const aPesos = (centavos: number | null | undefined): number => Number(centavos ?? 0) / 100;

/** Pesos → centavos enteros, leyendo el número como texto para no perder el
 *  medio centavo en la aritmética de flotantes. Medio centavo sube. */
export function aCentavos(pesos: number | string | null | undefined): number {
  if (pesos === null || pesos === undefined || pesos === '') return 0;
  const texto = String(pesos).replace(/[\s$,]/g, '');
  const negativo = texto.startsWith('-');
  const [entero = '0', decimales = ''] = texto.replace(/^[+-]/, '').split('.');
  const dos = (decimales + '00').slice(0, 2);
  let c = Number(entero || '0') * 100 + Number(dos);
  if (decimales.length > 2 && decimales[2] >= '5') c += 1;
  return negativo ? -c : c;
}

/* ─────────────── fechas ─────────────── */

export function aTimestamp(iso: string | null | undefined): Timestamp | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d);
}

const ts = (iso: string | null | undefined): Timestamp => aTimestamp(iso) ?? Timestamp.fromMillis(0);

/** Día local → `AAAA-MM-DD`, que es lo que la API guarda en `fecha`. */
export function aDia(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ─────────────── las filas de la API, con sus nombres ─────────────── */

export interface FilaNegocio { id: string; nombre: string; rfc: string | null; moneda: 'MXN' | 'USD'; dia_conciliacion: number; creado_at: string }
export interface FilaCuenta { id: string; negocio_id: string; nombre: string; tipo: string; banco: string | null; moneda: 'MXN' | 'USD'; saldo_inicial: number; creado_at: string }
export interface FilaCliente { id: string; negocio_id: string; nombre: string; correo: string | null; telefono: string | null; rfc: string | null; notas: string | null; usuario_id: string | null; portal_activo: boolean; creado_at: string }
export interface FilaProveedor { id: string; nombre: string; rfc: string | null; categoria: string | null; correo: string | null; telefono: string | null; terminos_pago: string | null; notas: string | null; creado_at: string }
export interface FilaProyecto {
  id: string; negocio_id: string; cliente_id: string; nombre: string; descripcion: string | null;
  estado: 'planeando' | 'activo' | 'pausado' | 'finiquito' | 'cerrado';
  fecha_inicio: string | null; fecha_fin_estimada: string | null; fecha_cierre: string | null;
  precio_venta: number; cobrado: number; pagado_prov: number; compromiso: number; avance: number;
  creado_at: string; actualizado_at: string | null;
}
export interface FilaItem { id: string; proyecto_id: string | null; nombre: string; descripcion: string | null; monto: number; cantidad: number; estado: string; etapa: number; clave: string | null; fecha_entrega: string | null; origen: { quell_id?: string } | null }
export interface FilaPartida { id: string; proyecto_id: string; item_id: string | null; proveedor_id: string | null; proveedor_nombre: string | null; concepto: string | null; monto_acordado: number; monto_pagado: number; estado: 'pendiente' | 'parcial' | 'pagado' }
export interface FilaMovimiento {
  id: string; negocio_id: string; tipo: 'ingreso' | 'egreso'; monto: number; fecha: string; cuenta_id: string;
  proyecto_id: string | null; item_id: string | null; contraparte_tipo: string; contraparte_id: string | null;
  contraparte_nombre: string | null; transfer_id: string | null; descripcion: string | null; categoria: string | null;
  creado_por: string; creado_at: string;
}
export interface FilaOpex {
  id: string; negocio_id: string; nombre: string; tipo: string; monto: number; moneda: 'MXN' | 'USD'; frecuencia: string;
  dia_semana: number | null; dia_del_mes: number | null; fecha_inicio: string; fecha_fin: string | null;
  cuenta_id: string | null; categoria: string | null; activo: boolean; creado_at: string;
}

/* ─────────────── negocios, cuentas, clientes, proveedores ─────────────── */

export function negocio(f: FilaNegocio, uid: string): Negocio {
  return {
    id: f.id, nombre: f.nombre, descripcion: '', rfc: f.rfc ?? '', moneda: f.moneda,
    // 1 es lunes, que es lo que la API pone por omisión.
    dia_conciliacion: f.dia_conciliacion ?? 1,
    // La suite lleva la membresía en el D1, por empresa, no por negocio: aquí
    // quien pregunta es miembro, y con eso basta para leer.
    owner_uid: uid, miembros_uids: [uid], creado_at: ts(f.creado_at), creado_por: '',
  };
}

/** `saldo_actual` era caché en Firestore; la API no lo guarda. Se suma aquí
 *  de los movimientos de la cuenta: saldo_inicial + ingresos − egresos. */
export function cuenta(f: FilaCuenta, movimientos: FilaMovimiento[]): Cuenta {
  let delta = 0;
  for (const m of movimientos) {
    if (m.cuenta_id !== f.id) continue;
    delta += m.tipo === 'ingreso' ? m.monto : -m.monto;
  }
  return {
    id: f.id, nombre: f.nombre, tipo: (f.tipo as Cuenta['tipo']) ?? 'otro', banco: f.banco ?? '', numero: '',
    moneda: f.moneda, saldo_inicial: aPesos(f.saldo_inicial), saldo_actual: aPesos(f.saldo_inicial + delta),
    negocio_id: f.negocio_id, creado_at: ts(f.creado_at), creado_por: '',
  };
}

export function cliente(f: FilaCliente): Cliente {
  return {
    id: f.id, nombre: f.nombre, rfc: f.rfc ?? '', email: f.correo ?? '', telefono: f.telefono ?? '', notas: f.notas ?? '',
    negocio_id: f.negocio_id, uid: f.usuario_id, portal_email: f.portal_activo ? f.correo : null,
    portal_activo: !!f.portal_activo, creado_at: ts(f.creado_at), creado_por: '',
  };
}

export function proveedor(f: FilaProveedor): Proveedor {
  return {
    id: f.id, nombre: f.nombre, rfc: f.rfc ?? '', categoria: f.categoria ?? '', email: f.correo ?? '',
    telefono: f.telefono ?? '', terminos_pago_default: f.terminos_pago ?? '', notas: f.notas ?? '',
    creado_at: ts(f.creado_at), creado_por: '',
  };
}

/* ─────────────── proyectos: cachés, partidas y productos ─────────────── */

export function partida(f: FilaPartida): PartidaProyecto {
  return {
    proveedor_id: f.proveedor_id ?? '', proveedor_nombre: f.proveedor_nombre ?? '', concepto: f.concepto ?? '',
    monto_acordado: aPesos(f.monto_acordado), monto_pagado: aPesos(f.monto_pagado), estado: f.estado,
  };
}

/** Un ítem de la suite, visto como el «producto» que la app ya enseña.
 *  `pagado` es Σ ingresos con ese `item_id`, que es lo que Firestore guardaba. */
export function producto(f: FilaItem, movimientos: FilaMovimiento[]): ProductoProyecto {
  let pagado = 0;
  for (const m of movimientos) if (m.item_id === f.id && m.tipo === 'ingreso') pagado += m.monto;
  return {
    id: f.id, nombre: f.nombre, descripcion: f.descripcion ?? '', monto: aPesos(f.monto),
    // Una API vieja no manda `cantidad`; uno es lo que siempre quiso decir.
    cantidad: Number(f.cantidad ?? 1) || 1, pagado: aPesos(pagado),
    fecha_entrega: aTimestamp(f.fecha_entrega), quell_id: f.origen?.quell_id ?? null,
  };
}

export function proyecto(
  f: FilaProyecto,
  partes: { partidas: FilaPartida[]; items: FilaItem[]; movimientos: FilaMovimiento[]; clientes: Map<string, FilaCliente>; negocios: Map<string, FilaNegocio> },
): Proyecto {
  const cli = partes.clientes.get(f.cliente_id);
  const compromiso = aPesos(f.compromiso);
  const cobrado = aPesos(f.cobrado);
  const pagado = aPesos(f.pagado_prov);
  return {
    id: f.id, nombre: f.nombre, descripcion: f.descripcion ?? '', cliente_id: f.cliente_id,
    cliente_nombre: cli?.nombre ?? '', cliente_uid: cli?.portal_activo ? cli.usuario_id : null,
    productos: partes.items.filter((i) => i.proyecto_id === f.id && i.estado !== 'cancelado').map((i) => producto(i, partes.movimientos)),
    negocio_id: f.negocio_id, negocio_nombre: partes.negocios.get(f.negocio_id)?.nombre ?? '',
    precio_venta: aPesos(f.precio_venta), compromiso_total: compromiso, cobrado, pagado,
    // Las mismas fórmulas que recalcularProyecto() tenía en Firestore.
    disponible: cobrado - pagado, margen_proyectado: aPesos(f.precio_venta) - compromiso,
    partidas: partes.partidas.filter((p) => p.proyecto_id === f.id).map(partida),
    estado: f.estado, fecha_inicio: ts(f.fecha_inicio ?? f.creado_at),
    fecha_fin_estimada: aTimestamp(f.fecha_fin_estimada), fecha_cierre: aTimestamp(f.fecha_cierre),
    creado_at: ts(f.creado_at), creado_por: '', actualizado_at: aTimestamp(f.actualizado_at) ?? undefined,
  };
}

/* ─────────────── movimientos y opex ─────────────── */

const CONTRAPARTES: Record<string, TipoContraparte> = { cliente: 'cliente', proveedor: 'proveedor', personal: 'personal', otro: 'otro', cuenta: 'cuenta', opex: 'opex', ajuste: 'ajuste' };

export function movimiento(
  f: FilaMovimiento,
  nombres: { cuentas: Map<string, FilaCuenta>; proyectos: Map<string, FilaProyecto>; items: Map<string, FilaItem>; clientes: Map<string, FilaCliente> },
): Movimiento {
  const proy = f.proyecto_id ? nombres.proyectos.get(f.proyecto_id) : undefined;
  const cli = proy ? nombres.clientes.get(proy.cliente_id) : undefined;
  return {
    id: f.id, tipo: f.tipo, monto: aPesos(f.monto), fecha: ts(f.fecha),
    proyecto_id: f.proyecto_id, proyecto_nombre: proy?.nombre ?? null,
    cuenta_id: f.cuenta_id, cuenta_nombre: nombres.cuentas.get(f.cuenta_id)?.nombre ?? '',
    transfer_id: f.transfer_id, contraparte_id: f.contraparte_id,
    contraparte_tipo: CONTRAPARTES[f.contraparte_tipo] ?? 'otro', contraparte_nombre: f.contraparte_nombre ?? '',
    producto_id: f.item_id, producto_nombre: f.item_id ? nombres.items.get(f.item_id)?.nombre ?? null : null,
    cliente_uid: f.tipo === 'ingreso' && cli?.portal_activo ? cli.usuario_id : null,
    negocio_id: f.negocio_id, descripcion: f.descripcion ?? '', categoria: f.categoria ?? '',
    creado_por: f.creado_por, creado_at: ts(f.creado_at),
  };
}

export function opex(f: FilaOpex, cuentas: Map<string, FilaCuenta>): Opex {
  return {
    id: f.id, nombre: f.nombre, tipo: (f.tipo as Opex['tipo']) ?? 'egreso', monto: aPesos(f.monto), moneda: f.moneda,
    frecuencia: (f.frecuencia as Opex['frecuencia']) ?? 'mensual', dia_semana: f.dia_semana, dia_del_mes: f.dia_del_mes,
    fecha_inicio: ts(f.fecha_inicio), fecha_fin: aTimestamp(f.fecha_fin),
    cuenta_id: f.cuenta_id, cuenta_nombre: f.cuenta_id ? cuentas.get(f.cuenta_id)?.nombre ?? null : null,
    categoria: f.categoria ?? '', activo: !!f.activo, negocio_id: f.negocio_id, descripcion: '',
    creado_at: ts(f.creado_at), creado_por: '',
  };
}

/* ─────────────── la conciliación semanal ─────────────── */

export interface FilaConciliacion { id: string; negocio_id: string; corte_at: string; hecha_por: string; creado_at: string }
export interface FilaConciliacionCuenta {
  id: string; conciliacion_id: string; cuenta_id: string; saldo_registrado: number; saldo_real: number;
  diferencia: number; movimiento_id: string | null; creado_at: string;
}

export function conciliacionCuenta(f: FilaConciliacionCuenta, nombres?: Map<string, string>): ConciliacionCuenta {
  return {
    id: f.id, cuenta_id: f.cuenta_id, cuenta_nombre: nombres?.get(f.cuenta_id),
    saldo_registrado: aPesos(f.saldo_registrado), saldo_real: aPesos(f.saldo_real),
    diferencia: aPesos(f.diferencia), movimiento_id: f.movimiento_id,
  };
}

export function conciliacion(f: FilaConciliacion, cuentas: FilaConciliacionCuenta[], nombres?: Map<string, string>): Conciliacion {
  const mias = cuentas.filter((c) => c.conciliacion_id === f.id);
  return {
    id: f.id, negocio_id: f.negocio_id, corte_at: ts(f.corte_at), hecha_por: f.hecha_por,
    cuentas: mias.map((c) => conciliacionCuenta(c, nombres)),
    diferencia_total: aPesos(mias.reduce((t, c) => t + c.diferencia, 0)),
  };
}

/** La estadística viene de la API en centavos; aquí sale en pesos. */
export function estadistica(
  d: {
    cortes: Array<{ id: string; corte_at: string; cuentas: number; diferencia_total: number; faltante: number; sobrante: number }>;
    por_cuenta: Array<{ cuenta_id: string; nombre: string | null; cortes: number; diferencia_total: number }>;
    acumulado: { cortes: number; diferencia_total: number; faltante: number; sobrante: number };
  },
): EstadisticaConciliacion {
  return {
    cortes: d.cortes.map((c) => ({
      id: c.id, corte_at: ts(c.corte_at), cuentas: Number(c.cuentas ?? 0),
      diferencia_total: aPesos(c.diferencia_total), faltante: aPesos(c.faltante), sobrante: aPesos(c.sobrante),
    })),
    por_cuenta: d.por_cuenta.map((c) => ({
      cuenta_id: c.cuenta_id, nombre: c.nombre ?? '(cuenta borrada)', cortes: Number(c.cortes ?? 0),
      diferencia_total: aPesos(c.diferencia_total),
    })),
    acumulado: {
      cortes: d.acumulado.cortes, diferencia_total: aPesos(d.acumulado.diferencia_total),
      faltante: aPesos(d.acumulado.faltante), sobrante: aPesos(d.acumulado.sobrante),
    },
  };
}

/* ─────────────── el usuario, desde /yo ─────────────── */

/** La suite tiene cuatro roles y la app tres. admin manda como owner; staff sólo mira. */
const ROLES: Record<string, RolMiembro> = { owner: 'owner', admin: 'owner', socio: 'socio', staff: 'viewer' };

export function usuario(
  yo: { usuario: { correo: string; nombre: string | null; creado_at: string }; superadmin: boolean; orgs: Array<{ id: string; rol: string; negocios: string[] }> },
  orgId: string,
  todosLosNegocios: string[],
): Usuario {
  // El superadmin manda en todas las empresas sin ser miembro de ninguna; la
  // API lo trata como owner (rutas/orgs.ts) y aquí igual.
  const mia = yo.orgs.find((o) => o.id === orgId) ?? (yo.superadmin ? { id: orgId, rol: 'owner', negocios: [] } : undefined);
  // En la suite, `negocios: []` en la membresía quiere decir «todos».
  const acceso = mia ? (mia.negocios.length ? mia.negocios : todosLosNegocios) : [];
  const memberships: Usuario['memberships'] = {};
  for (const n of acceso) memberships[n] = { rol: ROLES[mia?.rol ?? 'staff'] ?? 'viewer', scope: 'all' };
  return {
    email: yo.usuario.correo, nombre: yo.usuario.nombre ?? yo.usuario.correo.split('@')[0],
    negocios_acceso: acceso, memberships, creado_at: ts(yo.usuario.creado_at),
  };
}
