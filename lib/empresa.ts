/* LA EMPRESA, por su ruta (contrato 0.62.0).
 *
 * Mike, 1-oct-2026: «Sólo es una empresa/negocio todo». `GET /orgs/:o/empresa`
 * trae nombre, RFC, moneda y día de conciliación; `PATCH` los cambia (quien
 * dirige). Es lo que dash101 lee y edita en vez de `negocios`: por dentro la
 * API todavía lo guarda ahí hasta la fase D, y las pantallas no lo notan. */
import { pedir } from './api/cliente';
import { org } from './fuente';
import type { Moneda } from '@/types/schema';

export interface Empresa {
  id: string;
  nombre: string;
  rfc: string | null;
  moneda: Moneda;
  /** 0 domingo … 6 sábado. */
  dia_conciliacion: number;
}

export const getEmpresa = (): Promise<Empresa> => pedir<Empresa>(`/orgs/${org()}/empresa`);

export const updateEmpresa = (d: Partial<Omit<Empresa, 'id'>>): Promise<Empresa> =>
  pedir<Empresa>(`/orgs/${org()}/empresa`, { method: 'PATCH', body: d });
