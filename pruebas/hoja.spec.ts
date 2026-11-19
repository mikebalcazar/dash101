/* La hoja del presupuesto, sin navegador ni red (lib/hoja.ts).
 *
 * Mike, 18-nov-2026, con botones: «Hoja dentro de dash», con Tab y Enter y
 * pegar un rango copiado de Sheets o Excel. Lo que más se rompe en una hoja
 * no es la pantalla: es leer «$1,250.50», un rango con una celda vacía en
 * medio, o un salto de línea al final que Excel pone y nadie ve.
 */
import { describe, expect, it } from 'vitest';
import { esRango, filaVacia, huella, importeDe, leerPegado, numeroDeHoja, pegarRango, revisar, type FilaDeHoja } from '@/lib/hoja';

const fila = (descripcion: string, cantidad: string, precio: string, id: string | null = null): FilaDeHoja =>
  ({ ...filaVacia(), id, descripcion, cantidad, precio });

describe('los números como los escribe la gente', () => {
  it('con signo de pesos, comas de miles y espacios', () => {
    expect(numeroDeHoja('$1,250.50')).toBe(1250.5);
    expect(numeroDeHoja(' 180,000 ')).toBe(180000);
    expect(numeroDeHoja('3.5')).toBe(3.5);
    expect(numeroDeHoja('.5')).toBe(0.5);
    expect(numeroDeHoja('MXN 2,000.00')).toBe(2000);
  });
  it('negativos: con menos o entre paréntesis, como los pinta Excel', () => {
    expect(numeroDeHoja('-500')).toBe(-500);
    expect(numeroDeHoja('($1,000.00)')).toBe(-1000);
  });
  it('lo que no es número no se adivina', () => {
    expect(numeroDeHoja('')).toBeNull();
    expect(numeroDeHoja('dos')).toBeNull();
    expect(numeroDeHoja('1.2.3')).toBeNull();
    expect(numeroDeHoja('12 m²')).toBeNull();
  });
  it('el importe se redondea al centavo como en la API', () => {
    expect(importeDe('3', '1,500')).toBe(4500);
    expect(importeDe('2.5', '8,000.00')).toBe(20000);
    expect(importeDe('1.333', '0.10')).toBe(0.13);
    expect(importeDe('', '100')).toBeNull();
  });
});

describe('lo que se pega de Sheets o Excel', () => {
  it('renglones por salto, celdas por tabulador, y el salto del final no cuenta', () => {
    expect(leerPegado('Cocina\t1\t$180,000.00\r\nPuertas\t6\t7,500\r\n')).toEqual([
      ['Cocina', '1', '$180,000.00'], ['Puertas', '6', '7,500'],
    ]);
  });
  it('una celda de varias líneas llega entre comillas y es una sola celda', () => {
    expect(leerPegado('"Cocina\nintegral"\t1\t100')).toEqual([['Cocina integral', '1', '100']]);
  });
  it('un texto suelto no es un rango: ése lo pega el navegador', () => {
    expect(esRango('Cocina integral')).toBe(false);
    expect(esRango('Cocina integral\n')).toBe(false);
    expect(esRango('Cocina\t1')).toBe(true);
    expect(esRango('Cocina\nPuertas')).toBe(true);
  });
  it('pegar desde la primera columna llena concepto, cantidad y precio, y nacen renglones', () => {
    const hoja = [fila('Ya estaba', '1', '100.00'), filaVacia()];
    const r = pegarRango(hoja, 1, 'descripcion', leerPegado('Cocina\t1\t$180,000.00\t$180,000.00\nPuertas\t6\t7,500\n\t\t\nCubierta\t3.5\t9000\n'));
    expect(r.map((f) => [f.descripcion, f.cantidad, f.precio])).toEqual([
      ['Ya estaba', '1', '100.00'], ['Cocina', '1', '180000'], ['Puertas', '6', '7500'], ['Cubierta', '3.5', '9000'],
    ]);
    expect(hoja[1].descripcion, 'la hoja de antes no se toca').toBe('');
  });
  it('pegar una sola columna de precios cae en esa columna, hacia abajo', () => {
    const hoja = [fila('A', '1', ''), fila('B', '2', '')];
    const r = pegarRango(hoja, 0, 'precio', leerPegado('100\n200\n'));
    expect(r.map((f) => f.precio)).toEqual(['100', '200']);
  });
  it('lo que no es número se deja como vino, para que se vea al revisar', () => {
    const r = pegarRango([filaVacia()], 0, 'descripcion', [['Cocina', 'uno', '100']]);
    expect(r[0].cantidad).toBe('uno');
    expect(revisar(r)).toMatchObject({ ok: false, fila: 1, columna: 'cantidad' });
  });
});

/* 0.108.0 · Mike, 18-nov-2026: «Separar el producto de la descripción». */
describe('el producto, aparte de la descripción', () => {
  it('pegar desde la columna del producto llena producto, descripción, cantidad y precio', () => {
    const r = pegarRango([filaVacia()], 0, 'nombre', leerPegado('CAR-02\tGradas con estructura PTR\t1\t$161,250.00\t$161,250.00\nAuditorio\t\t1\t52200\n'));
    expect(r.map((f) => [f.nombre, f.descripcion, f.cantidad, f.precio])).toEqual([
      ['CAR-02', 'Gradas con estructura PTR', '1', '161250'], ['Auditorio', '', '1', '52200'],
    ]);
  });
  it('con el producto o con la descripción basta; se mandan los dos', () => {
    const conProducto = { ...filaVacia(), nombre: 'Lactancia', cantidad: '1', precio: '51400' };
    expect(revisar([conProducto])).toEqual({ ok: true, renglones: [{ id: null, nombre: 'Lactancia', descripcion: '', cantidad: 1, precio_unitario: 51400 }] });
  });
  it('cambiar sólo el producto cambia la huella', () => {
    const a = { ...fila('Gradas', '1', '100', 'c1'), nombre: 'CAR-02' };
    expect(huella([a])).not.toBe(huella([{ ...a, nombre: 'CAR-03' }]));
  });
});

describe('lo que se manda a guardar', () => {
  it('el renglón en blanco del final no se guarda; los demás sí, en pesos', () => {
    expect(revisar([fila('Cocina', '1', '180,000.00', 'c1'), fila('Puertas', '6', '7500'), filaVacia()])).toEqual({
      ok: true,
      renglones: [
        { id: 'c1', nombre: '', descripcion: 'Cocina', cantidad: 1, precio_unitario: 180000 },
        { id: null, nombre: '', descripcion: 'Puertas', cantidad: 6, precio_unitario: 7500 },
      ],
    });
  });
  it('el primero que no cuadra, con su número contando desde 1', () => {
    expect(revisar([fila('Bien', '1', '1'), fila('', '1', '100')])).toMatchObject({ ok: false, fila: 2, columna: 'nombre' });
    expect(revisar([fila('Cero', '0', '100')])).toMatchObject({ ok: false, fila: 1, columna: 'cantidad' });
    expect(revisar([fila('Sin precio', '1', '')])).toMatchObject({ ok: false, fila: 1, columna: 'precio' });
  });
  it('un concepto guardado que se dejó en blanco no se pierde callado: se marca', () => {
    expect(revisar([fila('', '1', '', 'c1')])).toMatchObject({ ok: false, fila: 1 });
  });
  it('un descuento es un precio negativo y vale', () => {
    expect(revisar([fila('Descuento', '1', '-5,000')])).toMatchObject({ ok: true, renglones: [{ precio_unitario: -5000 }] });
  });
  it('la huella no cambia por el formato del precio ni por el renglón en blanco', () => {
    expect(huella([fila('Cocina', '1', '180000', 'c1')])).toBe(huella([fila('Cocina', '1', '180,000.00', 'c1'), filaVacia()]));
    expect(huella([fila('Cocina', '1', '180000', 'c1')])).not.toBe(huella([fila('Cocina', '2', '180000', 'c1')]));
  });
});
