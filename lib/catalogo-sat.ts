/* El catálogo del SAT, en el navegador.
 *
 * Mike, 9-oct-2026: «para el código del SAT, hay que hacerlo predictivo y
 * también buscar por categorías; hay que ver de dónde se alimenta la lista».
 * Se alimenta del catálogo oficial c_ClaveProdServ del SAT (52 mil claves) y
 * c_ClaveUnidad (2 mil), que viven en /datos/*.json (los armó bill101 desde
 * phpcfdi/resources-sat-catalogs; `scripts/catalogo-sat.mjs` en ese repo).
 * Se bajan una vez, cuando hace falta, y se busca aquí mismo: nada de esto
 * pasa por la API. */

export interface ClaveSat { k: string; t: string; x: string; n: string }
export interface CatalogoSat { divisiones: Record<string, string>; filas: ClaveSat[] }

export const norm = (t: unknown): string => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const catalogos: Record<string, Promise<CatalogoSat> | undefined> = {};
export function catalogo(cual: "prodserv" | "unidades"): Promise<CatalogoSat> {
  if (!catalogos[cual]) {
    catalogos[cual] = fetch(`/datos/${cual}.json`, { credentials: "same-origin" })
      .then((r) => { if (!r.ok) throw new Error("no se pudo bajar el catálogo del SAT"); return r.json(); })
      .then((d: { divisiones?: Record<string, string>; filas: [string, string, string?][] }) => ({
        divisiones: d.divisiones || {},
        filas: d.filas.map(([k, t, x]) => ({ k, t, x: x || "", n: `${k} ${norm(t)} ${norm(x)}` })),
      }))
      .catch((e) => { delete catalogos[cual]; throw e; });
  }
  return catalogos[cual]!;
}

/** Las claves que contengan todas las palabras; primero la clave exacta y
 *  las que empiezan con lo escrito. */
export function buscarEn(filas: ClaveSat[], q: string, tope = 30): ClaveSat[] {
  const palabras = norm(q).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const out: ClaveSat[] = [];
  for (const f of filas) {
    if (palabras.every((w) => f.n.includes(w))) { out.push(f); if (out.length >= 400) break; }
  }
  const exacta = norm(q);
  out.sort((a, b) => Number(b.k === exacta) - Number(a.k === exacta) || Number(b.k.startsWith(exacta)) - Number(a.k.startsWith(exacta)) || a.k.localeCompare(b.k));
  return out.slice(0, tope);
}

/** Qué significa la clave: división › clase › producto (informativo; no va
 *  en el PDF). */
export function significado(cat: CatalogoSat, x: ClaveSat): string {
  const div = cat.divisiones?.[x.k.slice(0, 2)] || "";
  const clase = x.k.endsWith("00") ? null : cat.filas.find((c) => c.k === `${x.k.slice(0, 6)}00`);
  return [div && `${x.k.slice(0, 2)} ${div}`, clase && `${clase.k} ${clase.t}`, `${x.k} ${x.t}`].filter(Boolean).join(" › ");
}
