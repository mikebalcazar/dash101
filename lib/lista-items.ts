/* La lista de ítems de dash101 con el estilo de la de quell101 (6-oct-2026).
 *
 * Mike, con la lista de quell101 enfrente: «en dash quiero que la lista de
 * ítems tenga el mismo estilo. Hoy en dash es muy cansado a la vista como
 * está». La de quell es un renglón por ítem: una raya del color de su tipo,
 * el código en negritas y el nombre, abajo en gris de qué es; a la derecha
 * los tramos de las etapas cumplidas, el porcentaje y en qué etapa va; y
 * arriba un recuadro por etapa con cuántos la llevan.
 *
 * Aquí viven las cuentas, sin React, para medirlas sin navegador. El avance
 * viene de la obra (`GET /orgs/:o/quell/avance-items`, contrato 0.76.0): un
 * ítem de cantidad 20 son 20 piezas, y la etapa en la que va el ítem es la
 * de su pieza más atrasada.
 */

export interface EtapaDeObra { clave: string; nombre: string; abre_punchlist: boolean }
export interface AvanceDeItem { piezas: number; hechas: number; menor: number; en_punchlist: number; n_pend: number; n_proc: number; n_total: number }
export interface AvanceDeItems { etapas: EtapaDeObra[]; items: Record<string, AvanceDeItem> }

/** Los colores de quell101 (web/src/api.js, TIPOS), para que una puerta sea
 *  del mismo color en las dos apps. En dash101 el tipo viene en minúsculas. */
const COLORES: Record<string, string> = {
  mueble: "#2C5AA0",
  puerta: "#B4622A",
  acabado: "#4B7F52",
  servicio: "#6B4E9B",
  requerimiento: "#8A929C",
};
export const colorDeTipo = (tipo?: string | null): string => COLORES[String(tipo ?? "").toLowerCase()] ?? "#1C3557";

/** «mueble» → «Mueble». Sin tipo, «Ítem». */
export const nombreDeTipo = (tipo?: string | null): string => {
  const t = String(tipo ?? "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : "Ítem";
};

/** Lo que pinta el renglón de un ítem en la obra: cuántos tramos llenos,
 *  el porcentaje y en qué etapa va. Sin piezas en ningún plano, `null`. */
export function avanceDe(a: AvanceDeItem | undefined, etapas: EtapaDeObra[]): { llenos: number; pct: number; etapa: string } | null {
  if (!a || !a.piezas || !etapas.length) return null;
  const total = etapas.length;
  const llenos = Math.max(0, Math.min(total, a.menor));
  const pct = Math.round((Math.min(a.hechas, a.piezas * total) / (a.piezas * total)) * 100);
  const etapa = llenos >= total ? "Entregado" : etapas[llenos].nombre;
  return { llenos, pct, etapa };
}

/** El avance de VARIOS ítems juntos (las piezas de un producto): se suman
 *  piezas y etapas, y manda la pieza más atrasada. */
export function sumarAvances(lista: (AvanceDeItem | undefined)[]): AvanceDeItem | undefined {
  const con = lista.filter((a): a is AvanceDeItem => !!a && a.piezas > 0);
  if (!con.length) return undefined;
  return con.reduce((s, a) => ({
    piezas: s.piezas + a.piezas, hechas: s.hechas + a.hechas, menor: Math.min(s.menor, a.menor),
    en_punchlist: s.en_punchlist + a.en_punchlist, n_pend: s.n_pend + a.n_pend, n_proc: s.n_proc + a.n_proc, n_total: s.n_total + a.n_total,
  }));
}

/** Los recuadros de arriba: por etapa, cuántos ítems la llevan cumplida
 *  (todas sus piezas), y el total de ítems. Como en quell101. */
export function embudo(ids: string[], avance: AvanceDeItems | null): { clave: string; nombre: string; bisagra: boolean; n: number }[] {
  if (!avance || !avance.etapas.length) return [];
  // Sin ninguna pieza en un plano, cinco ceros sólo estorban: no se pintan.
  if (!ids.some((id) => (avance.items[id]?.piezas ?? 0) > 0)) return [];
  return avance.etapas.map((x, i) => ({
    clave: x.clave, nombre: x.nombre, bisagra: x.abre_punchlist,
    n: ids.filter((id) => { const a = avance.items[id]; return !!a && a.piezas > 0 && a.menor > i; }).length,
  }));
}

/** El estado del cobro del ítem, en una pastilla: lo que en quell es «En
 *  producción» o «Todo resuelto», en dash101 es el dinero. Montos en pesos. */
export function estadoDeCobro(monto: number, pagado: number): { texto: string; tono: "ok" | "parcial" | "nada" } {
  if (monto > 0 && pagado >= monto - 0.5) return { texto: "Cobrado", tono: "ok" };
  if (pagado > 0.5) return { texto: `Cobrado ${Math.min(99, Math.floor((pagado / Math.max(monto, 1)) * 100))}%`, tono: "parcial" };
  return { texto: "Sin cobro", tono: "nada" };
}
