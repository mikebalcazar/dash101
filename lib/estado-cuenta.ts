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
import { org } from './fuente';

const aPesos = (centavos: number) => Math.round(Number(centavos ?? 0)) / 100;

export interface CobroDelCliente {
  id: string;
  fecha: string;
  /** En PESOS. */
  monto: number;
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
  cobrado: number;
  saldo: number;
  pagos: CobroDelCliente[];
}

export interface EstadoDeCuenta {
  cliente: { id: string; nombre: string; rfc: string | null; correo: string | null; telefono: string | null };
  proyectos: ProyectoDelCliente[];
  /** Cobros que no cuelgan de ningún proyecto suyo: un anticipo, un pago
   *  suelto. Van aparte porque en la suma sí cuentan, y si no se enseñaran
   *  el total no cuadraría con la tabla. */
  otros_pagos: CobroDelCliente[];
  totales: { vendido: number; cobrado: number; saldo: number; sin_proyecto: number };
}

const cobro = (c: Record<string, unknown>): CobroDelCliente => ({
  id: String(c.id),
  fecha: String(c.fecha ?? ''),
  monto: aPesos(c.monto as number),
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
    totales: { vendido: number; cobrado: number; saldo: number; sin_proyecto: number };
  }>(`/orgs/${org()}/clientes/${encodeURIComponent(cliente_id)}/estado-de-cuenta`);

  return {
    cliente: r.cliente,
    proyectos: r.proyectos.map((p) => ({
      id: String(p.id), nombre: String(p.nombre), estado: String(p.estado ?? ''),
      fecha_inicio: (p.fecha_inicio as string) ?? null, fecha_cierre: (p.fecha_cierre as string) ?? null,
      precio_venta: aPesos(p.precio_venta as number),
      cobrado: aPesos(p.cobrado as number),
      saldo: aPesos(p.saldo as number),
      pagos: ((p.pagos as Array<Record<string, unknown>>) ?? []).map(cobro),
    })),
    otros_pagos: r.otros_pagos.map(cobro),
    totales: {
      vendido: aPesos(r.totales.vendido), cobrado: aPesos(r.totales.cobrado),
      saldo: aPesos(r.totales.saldo), sin_proyecto: aPesos(r.totales.sin_proyecto),
    },
  };
}
