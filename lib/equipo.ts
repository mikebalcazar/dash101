/* El equipo: quiénes son miembros de la empresa y quitar a uno.
 *
 * En la suite la membresía vive en el D1, por empresa, y la administra la
 * API por `/admin/orgs/:o/miembros`; desde aquí todavía no se escribe. En
 * Firestore colgaba de una colección que ya no existe en la app (la de los
 * negocios, que se fueron el 1-oct-2026 por decisión de Mike), así que por
 * ese camino tampoco hay lista: se contesta vacío, no se inventa. */
import { fuente, noEscribeTodavia } from "./fuente";

/** Los uids de los miembros de la empresa. */
export async function listMiembros(): Promise<string[]> {
  void fuente();
  return [];
}

/** Quita a un miembro de la empresa. */
export async function removeMiembro(_uid: string): Promise<void> {
  throw noEscribeTodavia("la membresía (en la suite vive en el D1, por empresa)");
}
