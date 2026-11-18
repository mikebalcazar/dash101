/* La hoja del presupuesto, sin pantalla: lo que se pega de Sheets o Excel, los
 * números como los escribe la gente, y qué se manda a guardar.
 *
 * Mike, 18-nov-2026, con botones: «Hoja dentro de dash»: una cuadrícula como
 * Sheets, con Tab y Enter, donde se puede pegar un rango copiado de Sheets o
 * Excel, y el total es el precio del proyecto.
 *
 * Vive aparte del componente para poder medirlo sin navegador
 * (pruebas/hoja.spec.ts): lo que más se rompe en una hoja no es la pantalla,
 * es leer «$1,250.50» o un rango con una celda vacía en medio.
 */

export type Columna = 'descripcion' | 'cantidad' | 'precio';
export const COLUMNAS: Columna[] = ['descripcion', 'cantidad', 'precio'];

export interface FilaDeHoja {
  /** Para React: estable aunque no tenga id todavía. */
  clave: string;
  /** El concepto que ya existe; null si es nuevo. */
  id: string | null;
  descripcion: string;
  cantidad: string;
  /** En pesos, como se escribe. */
  precio: string;
  /** De qué cotización de quote101 vino, para decirlo en el renglón. */
  cotizacion_id: string | null;
  cotizacion_nombre: string | null;
  cotizacion_folio: string | null;
}

let n = 0;
export const claveNueva = () => `n${Date.now().toString(36)}${(n++).toString(36)}`;

export const filaVacia = (): FilaDeHoja => ({
  clave: claveNueva(), id: null, descripcion: '', cantidad: '1', precio: '',
  cotizacion_id: null, cotizacion_nombre: null, cotizacion_folio: null,
});

/** Un número como lo escribe la gente o lo copia de una hoja: «$1,250.50»,
 *  «1250.5», « 3 », «-500», «(500)» (negativo, como lo pinta Excel). Las
 *  comas son de miles: así las pone Sheets en México. null si no es número. */
export function numeroDeHoja(texto: string): number | null {
  let t = String(texto ?? '').trim();
  if (!t) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) { negativo = true; t = t.slice(1, -1); }
  t = t.replace(/[\s$,]/g, '').replace(/^MXN/i, '');
  if (t.startsWith('-')) { negativo = !negativo; t = t.slice(1); }
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const v = Number(t);
  if (!Number.isFinite(v)) return null;
  return negativo ? -v : v;
}

/** El importe del renglón en pesos, redondeado al centavo como lo hace la
 *  API (cantidad × precio en centavos, redondeado). null si falta algo. */
export function importeDe(cantidad: string, precio: string): number | null {
  const c = numeroDeHoja(cantidad);
  const p = numeroDeHoja(precio);
  if (c === null || p === null) return null;
  return Math.round(c * Math.round(p * 100)) / 100;
}

/** Lo que se pega: un rango de Sheets o Excel llega como renglones separados
 *  por salto de línea y celdas por tabulador. Un salto al final (Excel lo
 *  pone) no es un renglón. Una celda entre comillas con saltos adentro se
 *  respeta, que es como Sheets copia una celda de varias líneas. */
export function leerPegado(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let entreComillas = false;
  const t = texto.replace(/\r\n?/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (entreComillas) {
      if (ch === '"' && t[i + 1] === '"') { celda += '"'; i++; }
      else if (ch === '"') entreComillas = false;
      else celda += ch;
    } else if (ch === '"' && celda === '') entreComillas = true;
    else if (ch === '\t') { fila.push(celda); celda = ''; }
    else if (ch === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; }
    else celda += ch;
  }
  if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.map((f) => f.map((c) => c.replace(/\s+/g, ' ').trim()));
}

/** ¿Lo pegado es un rango, o sólo un texto para la celda? Un texto sin
 *  tabuladores ni saltos se deja al navegador. */
export const esRango = (texto: string) => /[\t\n]/.test(texto.replace(/\n+$/, ''));

/** Pega un rango sobre la hoja a partir de (fila, columna), como Sheets:
 *  cada celda cae en su lugar y, si no caben, nacen renglones nuevos. Las
 *  columnas de más (el importe que trae la hoja de origen, por ejemplo) se
 *  ignoran: el importe aquí siempre se calcula. Un renglón pegado que viene
 *  todo vacío se salta. */
export function pegarRango(filas: FilaDeHoja[], desde: number, columna: Columna, rango: string[][]): FilaDeHoja[] {
  const salida = filas.map((f) => ({ ...f }));
  const c0 = COLUMNAS.indexOf(columna);
  let i = desde;
  for (const celdas of rango) {
    if (celdas.every((c) => c === '')) continue;
    if (i >= salida.length) salida.push(filaVacia());
    const f = salida[i];
    celdas.forEach((valor, k) => {
      const col = COLUMNAS[c0 + k];
      if (!col) return;
      if (col === 'descripcion') f.descripcion = valor;
      else {
        const num = numeroDeHoja(valor);
        // Un número se escribe limpio («1250.5»); lo que no es número se deja
        // como vino para que la validación lo marque y se vea.
        f[col] = num === null ? valor : String(num);
      }
    });
    i++;
  }
  return salida;
}

/** ¿El renglón está vacío del todo? Esos no se guardan: es la fila en blanco
 *  que siempre queda al final para seguir escribiendo. */
export const vacia = (f: FilaDeHoja) => !f.descripcion.trim() && !f.precio.trim() && (f.cantidad.trim() === '' || f.cantidad.trim() === '1');

export type Revision =
  | { ok: true; renglones: Array<{ id: string | null; descripcion: string; cantidad: number; precio_unitario: number }> }
  | { ok: false; fila: number; columna: Columna; motivo: string };

/** Lo que se manda a guardar, o el primer renglón que no cuadra con su
 *  número (contando desde 1, como lo lee una persona). */
export function revisar(filas: FilaDeHoja[]): Revision {
  const renglones: Array<{ id: string | null; descripcion: string; cantidad: number; precio_unitario: number }> = [];
  for (const [i, f] of filas.entries()) {
    if (vacia(f) && !f.id) continue;
    const fila = i + 1;
    if (!f.descripcion.trim()) return { ok: false, fila, columna: 'descripcion', motivo: 'escribe qué se cobra' };
    const cantidad = numeroDeHoja(f.cantidad);
    if (cantidad === null || cantidad <= 0) return { ok: false, fila, columna: 'cantidad', motivo: 'la cantidad tiene que ser un número mayor que cero' };
    const precio = numeroDeHoja(f.precio);
    if (precio === null) return { ok: false, fila, columna: 'precio', motivo: 'el precio unitario tiene que ser un número, en pesos' };
    renglones.push({ id: f.id, descripcion: f.descripcion.trim(), cantidad, precio_unitario: precio });
  }
  return { ok: true, renglones };
}

/** Lo mismo que se guardaría, para saber si la hoja cambió. */
export const huella = (filas: FilaDeHoja[]) => JSON.stringify(
  filas.filter((f) => !(vacia(f) && !f.id)).map((f) => [f.id, f.descripcion.trim(), numeroDeHoja(f.cantidad), numeroDeHoja(f.precio)]),
);
