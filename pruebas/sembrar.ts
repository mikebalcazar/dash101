/* Sembrar ítems en las pruebas COMO LO HACEN quell101 y quote101: directo en
 * la API, vendidos y en su proyecto.
 *
 * Mike, 2-oct-2026 (con botones): «dash sólo lee». Desde entonces
 * `createProyecto` y `updateProyecto` de dash101 no fabrican ítems, así que
 * las pruebas que necesitan un proyecto con ítems los siembran por aquí, que
 * es la misma puerta por la que entran en la vida real.
 */

import { pedir } from "@/lib/api/cliente";

export interface Semilla {
  nombre: string;
  /** En PESOS, como lo tecleaba la pantalla; aquí se pasa a centavos. */
  monto: number;
  cantidad?: number;
  partida?: string;
  descripcion?: string;
  estado?: "vendido" | "cotizado";
}

/** Siembra los ítems y devuelve sus ids, en el mismo orden. */
export async function sembrarItems(org: string, proyecto_id: string, cliente_id: string, semillas: Semilla[]): Promise<string[]> {
  const ids: string[] = [];
  for (const s of semillas) {
    const r = await pedir<{ id: string }>(`/orgs/${org}/items`, {
      method: "POST",
      body: {
        cliente_id, proyecto_id,
        nombre: s.nombre, monto: Math.round(s.monto * 100), cantidad: s.cantidad ?? 1,
        estado: s.estado ?? "vendido",
        ...(s.partida !== undefined ? { partida: s.partida } : {}),
        ...(s.descripcion !== undefined ? { descripcion: s.descripcion } : {}),
      },
    });
    ids.push(r.id);
  }
  return ids;
}
