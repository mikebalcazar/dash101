/* El estado de cuenta de un cliente · contrato 0.29.0 de la suite.
 *
 * Mike, 20-sep: «necesito poder ver por cliente su estado de cuenta general.
 * Saldo global, y por proyecto, y poder exportarlo en un PDF para enviar
 * reportes».
 *
 * EL DINERO VIAJA EN CENTAVOS y se pinta en pesos. La conversión se hace
 * aquí, una sola vez: este documento se le manda a un cliente, y dividir
 * entre cien en tres lugares distintos es dividir mal en uno de los tres.
 */

import { pedir } from './api/cliente';
import { apiBase, org } from './fuente';
import type { GrupoDelEstado } from './estado-proyecto';

/** El Excel del estado de cuenta del cliente (contrato 0.60.0): la misma
 *  liga sirve para bajarlo, con la cookie de sesión. */
export const ligaDelExcelDelCliente = (cliente_id: string) =>
  `${apiBase()}/orgs/${org()}/clientes/${encodeURIComponent(cliente_id)}/estado.xlsx`;

const aPesos = (centavos: number) => Math.round(Number(centavos ?? 0)) / 100;

export interface CobroDelCliente {
  id: string;
  fecha: string;
  /** En PESOS. */
  monto: number;
  /** 0.107.0 · En PESOS: lo que cuenta en el estado de cuenta, sin IVA. */
  sin_iva: number;
  iva: number;
  proyecto_id: string | null;
  descripcion: string | null;
  facturado: boolean;
  uuid_cfdi: string | null;
  cuenta_nombre: string | null;
}

export interface ProyectoDelCliente {
  id: string;
  nombre: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_cierre: string | null;
  /** En PESOS. */
  precio_venta: number;
  /** 0.105.0 · el precio desglosado como lo lee la obra, en PESOS. */
  subtotal: number;
  iva: number;
  total: number;
  /** 0.107.0 · SIN IVA: la suma de los subtotales de sus pagos. */
  cobrado: number;
  /** 0.107.0 · el IVA que se le cobró, aparte. */
  iva_cobrado: number;
  /** 0.107.0 · SIN IVA: precio menos lo cobrado. null: por cargar. */
  saldo: number | null;
  precio_por_cargar: boolean;
  /** Lo cotizado: los conceptos de cobro, agrupados por cotización. */
  grupos: GrupoDelEstado[];
  pagos: CobroDelCliente[];
}

export interface EstadoDeCuenta {
  cliente: { id: string; nombre: string; rfc: string | null; correo: string | null; telefono: string | null };
  proyectos: ProyectoDelCliente[];
  /** Cobros que no cuelgan de ningún proyecto suyo: un anticipo, un pago
   *  suelto. Van aparte porque en la suma sí cuentan, y si no se enseñaran
   *  el total no cuadraría con la tabla. */
  otros_pagos: CobroDelCliente[];
  /** En PESOS. `total` es lo cotizado con IVA de los proyectos con precio;
   *  `por_cargar`, cuántos proyectos no lo tienen todavía. */
  totales: { vendido: number; total: number; cobrado: number; saldo: number; sin_proyecto: number; por_cargar: number;
    /** 0.107.0 · todo lo de arriba va SIN IVA; esto es el IVA cobrado, aparte. */
    iva_cobrado: number };
}

const grupo = (g: Record<string, any>): GrupoDelEstado => ({
  cotizacion_id: g.cotizacion_id ?? null, folio: g.folio ?? null, nombre: String(g.nombre ?? ''),
  numero: g.numero ?? null, importe: aPesos(g.importe),
  conceptos: ((g.conceptos ?? []) as Array<Record<string, any>>).map((c) => ({
    id: String(c.id), nombre: String(c.nombre ?? ''), seccion: String(c.seccion ?? ''), descripcion: String(c.descripcion ?? ''), cantidad: Number(c.cantidad ?? 1),
    precio_unitario: aPesos(c.precio_unitario), importe: aPesos(c.monto),
  })),
});

const cobro = (c: Record<string, unknown>): CobroDelCliente => ({
  id: String(c.id),
  fecha: String(c.fecha ?? ''),
  monto: aPesos(c.monto as number),
  sin_iva: aPesos((c.sin_iva ?? c.monto) as number),
  iva: aPesos((c.iva ?? 0) as number),
  proyecto_id: (c.proyecto_id as string) ?? null,
  descripcion: (c.descripcion as string) ?? null,
  facturado: Boolean(c.facturado),
  uuid_cfdi: (c.uuid_cfdi as string) ?? null,
  cuenta_nombre: (c.cuenta_nombre as string) ?? null,
});

export async function estadoDeCuenta(cliente_id: string): Promise<EstadoDeCuenta> {
  const r = await pedir<{
    cliente: EstadoDeCuenta['cliente'];
    proyectos: Array<Record<string, unknown>>;
    otros_pagos: Array<Record<string, unknown>>;
    totales: { vendido: number; total?: number; cobrado: number; saldo: number; sin_proyecto: number; por_cargar?: number; iva_cobrado?: number };
  }>(`/orgs/${org()}/clientes/${encodeURIComponent(cliente_id)}/estado-de-cuenta`);

  return {
    cliente: r.cliente,
    proyectos: r.proyectos.map((p) => ({
      id: String(p.id), nombre: String(p.nombre), estado: String(p.estado ?? ''),
      fecha_inicio: (p.fecha_inicio as string) ?? null, fecha_cierre: (p.fecha_cierre as string) ?? null,
      precio_venta: aPesos(p.precio_venta as number),
      // Una API anterior a 0.105.0 no desglosa: el precio era el subtotal.
      subtotal: aPesos((p.subtotal ?? p.precio_venta) as number),
      iva: aPesos((p.iva ?? 0) as number),
      total: aPesos((p.total ?? p.precio_venta) as number),
      cobrado: aPesos(p.cobrado as number),
      iva_cobrado: aPesos((p.iva_cobrado ?? 0) as number),
      saldo: p.saldo === null ? null : aPesos(p.saldo as number),
      precio_por_cargar: Boolean(p.precio_por_cargar),
      grupos: ((p.grupos as Array<Record<string, any>>) ?? []).map(grupo),
      pagos: ((p.pagos as Array<Record<string, unknown>>) ?? []).map(cobro),
    })),
    otros_pagos: r.otros_pagos.map(cobro),
    totales: {
      vendido: aPesos(r.totales.vendido), total: aPesos(r.totales.total ?? r.totales.vendido),
      cobrado: aPesos(r.totales.cobrado),
      saldo: aPesos(r.totales.saldo), sin_proyecto: aPesos(r.totales.sin_proyecto),
      por_cargar: Number(r.totales.por_cargar ?? 0),
      iva_cobrado: aPesos((r.totales.iva_cobrado ?? 0) as number),
    },
  };
}

/** 19-nov-2026 · Una obra está abierta si tiene precio, no está cerrada y le
 *  falta cobrar. Las demás —cerradas o con saldo cero— no salen en la lista
 *  de proyectos ni en el estado de cuenta para mandar (Mike: «todas las obras
 *  cerradas (saldo 0 pendiente) hay que ocultarlas ya»). */
export const abierta = (p: { precio_por_cargar: boolean; estado: string; saldo: number | null }) =>
  p.estado === "planeando" || p.estado === "cerrado"
    ? false
    /* 20-nov-2026 · Un proyecto ACTIVO sale aunque todavía no tenga conceptos
     * ni cobros (Mike: «necesito que sí aparezca cuando lo marque como
     * activo», y «así puedo agregar ya los conceptos a cobrar»). Sólo se va
     * cuando ya tiene precio y quedó cobrado. «Planeando» no sale: así quedan
     * los que no tienen ningún cobro, y el primero los activa solo. */
    : p.estado === "activo"
      ? p.precio_por_cargar || Math.abs(p.saldo ?? 0) >= 0.5
      : !p.precio_por_cargar && Math.abs(p.saldo ?? 0) >= 0.5;

/** 19-nov-2026 · Lo que va en el estado de cuenta general para mandar: obras
 *  en proceso con saldo por cobrar (Mike: «solo debe incluir obras en proceso
 *  donde haya aún saldo por cobrar»). Una obra pagada de más tampoco va. */
export const porCobrar = (p: { precio_por_cargar: boolean; estado: string; saldo: number | null }) =>
  !p.precio_por_cargar && p.estado !== "cerrado" && (p.saldo ?? 0) >= 0.5;
