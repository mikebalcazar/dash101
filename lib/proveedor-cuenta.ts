/* El estado de cuenta del proveedor (API 0.116.0).
 *
 * Mike, 21-nov-2026: «en la sección de proveedores, necesito que sea similar a
 * la de proyectos, donde cada proveedor tiene un proyecto y conceptos que se le
 * van a pagar y los pagos que se le van haciendo». Lo que se le va a pagar son
 * sus cuentas por pagar (las partidas del proyecto a su nombre); lo pagado, los
 * egresos de esas partidas o a su nombre. La API devuelve centavos; aquí se
 * pasan a pesos, como en el resto de dash. */
import { pedir } from './api/cliente';
import { org } from './fuente';

const p = (centavos: unknown) => Math.round(Number(centavos ?? 0)) / 100;

export interface PagoProveedor { id: string; fecha: string; monto: number; descripcion: string; cuenta: string | null; facturado: boolean; partida_id?: string | null }
export interface CuentaPorPagar { id: string; concepto: string; monto_acordado: number; monto_pagado: number; estado: string; fecha_esperada: string | null; del_cronograma: boolean }
export interface ProyectoDelProveedor {
  proyecto_id: string; nombre: string; estado: string; cliente_nombre: string | null;
  acordado: number; pagado: number; saldo: number;
  partidas: CuentaPorPagar[]; pagos: PagoProveedor[];
}
export interface EstadoProveedor {
  proveedor: Record<string, unknown>;
  proyectos: ProyectoDelProveedor[];
  sin_proyecto: { total: number; pagos: PagoProveedor[] };
  totales: { acordado: number; pagado: number; saldo: number; sin_proyecto: number; proyectos: number };
}
export interface SaldoProveedor { proveedor_id: string; acordado: number; pagado: number; saldo: number; proyectos: number }

const pago = (x: Record<string, unknown>): PagoProveedor => ({
  id: String(x.id), fecha: String(x.fecha ?? ''), monto: p(x.monto), descripcion: String(x.descripcion ?? ''),
  cuenta: x.cuenta == null ? null : String(x.cuenta), facturado: !!x.facturado, partida_id: x.partida_id == null ? null : String(x.partida_id),
});

export async function estadoProveedor(id: string): Promise<EstadoProveedor> {
  const r = await pedir<{ proveedor: Record<string, unknown>; proyectos: Array<Record<string, any>>; sin_proyecto: { total: number; pagos: Array<Record<string, unknown>> }; totales: Record<string, number> }>(
    `/orgs/${org()}/proveedores/${encodeURIComponent(id)}/estado-de-cuenta`);
  return {
    proveedor: r.proveedor,
    proyectos: r.proyectos.map((x) => ({
      proyecto_id: String(x.proyecto_id), nombre: String(x.nombre ?? ''), estado: String(x.estado ?? ''), cliente_nombre: x.cliente_nombre ?? null,
      acordado: p(x.acordado), pagado: p(x.pagado), saldo: p(x.saldo),
      partidas: (x.partidas ?? []).map((y: Record<string, unknown>) => ({
        id: String(y.id), concepto: String(y.concepto ?? ''), monto_acordado: p(y.monto_acordado), monto_pagado: p(y.monto_pagado),
        estado: String(y.estado ?? 'pendiente'), fecha_esperada: (y.fecha_esperada as string | null) ?? null, del_cronograma: !!y.del_cronograma,
      })),
      pagos: (x.pagos ?? []).map(pago),
    })),
    sin_proyecto: { total: p(r.sin_proyecto.total), pagos: r.sin_proyecto.pagos.map(pago) },
    totales: {
      acordado: p(r.totales.acordado), pagado: p(r.totales.pagado), saldo: p(r.totales.saldo),
      sin_proyecto: p(r.totales.sin_proyecto), proyectos: Number(r.totales.proyectos ?? 0),
    },
  };
}

export async function saldosProveedores(): Promise<Map<string, SaldoProveedor>> {
  const r = await pedir<{ saldos: Array<Record<string, number | string>> }>(`/orgs/${org()}/proveedores/saldos`);
  return new Map(r.saldos.map((s) => [String(s.proveedor_id), {
    proveedor_id: String(s.proveedor_id), acordado: p(s.acordado), pagado: p(s.pagado), saldo: p(s.saldo), proyectos: Number(s.proyectos ?? 0),
  }]));
}

/** Una cuenta por pagar nueva: una partida del proyecto a nombre del proveedor. */
export async function agregarCuentaPorPagar(d: { proyecto_id: string; proveedor_id: string; proveedor_nombre: string; concepto: string; monto: number }): Promise<void> {
  await pedir(`/orgs/${org()}/partidas`, {
    method: 'POST',
    body: {
      proyecto_id: d.proyecto_id, proveedor_id: d.proveedor_id, proveedor_nombre: d.proveedor_nombre, concepto: d.concepto.trim(),
      monto_acordado: Math.round(d.monto * 100),
    },
  });
}

/** Lo que no es del cronograma se borra desde aquí; lo del cronograma, en quell. */
export async function borrarCuentaPorPagar(id: string): Promise<void> {
  await pedir(`/orgs/${org()}/partidas/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
