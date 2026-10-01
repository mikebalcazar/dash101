/* LA EMPRESA, por su ruta (contrato 0.62.0; desde 0.63.0 es la única tabla).
 *
 * Mike, 1-oct-2026: «Sólo es una empresa/negocio todo». `GET /orgs/:o/empresa`
 * trae nombre, RFC, moneda y día de conciliación; `PATCH` los cambia (quien
 * dirige). Es lo que dash101 lee y edita; cuentas, clientes, proyectos y
 * movimientos cuelgan de ella solos, sin que la pantalla diga de cuál. */
import { pedir } from './api/cliente';
import { org } from './fuente';
import type { Empresa } from '@/types/schema';

export type { Empresa };

export const getEmpresa = (): Promise<Empresa> => pedir<Empresa>(`/orgs/${org()}/empresa`);

export const updateEmpresa = (d: Partial<Omit<Empresa, 'id'>>): Promise<Empresa> =>
  pedir<Empresa>(`/orgs/${org()}/empresa`, { method: 'PATCH', body: d });
