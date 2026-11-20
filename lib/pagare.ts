/* El pagaré en PDF de un préstamo (viene de patron101, `public/js/pagare.js`).
 *
 * Mike, con botones (8-oct-2026): «PDF automático: la plataforma genera el
 * pagaré con monto, tasa, fechas y tabla de pagos. Se firma fuera (a mano) y
 * se sube firmado. El texto base lo valida tu abogado».
 *
 * Se arma en el navegador con jsPDF (`public/vendor/jspdf.js`, del propio
 * origen, y sólo se descarga al pedir el PDF): la API ya dio el préstamo y
 * su tabla, aquí nada más se acomoda en una hoja. NINGUNA cifra se calcula
 * aquí.
 *
 * EL TEXTO ES UNA BASE, no asesoría legal: los elementos de un pagaré
 * (artículo 170 de la Ley General de Títulos y Operaciones de Crédito) y una
 * tabla de pagos anexa. Antes de usarlo de verdad lo revisa un abogado; la
 * pantalla lo dice junto al botón.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { diaLargo, momento, pesos, tasa, type Fila } from './patron';

/* ─────────────── el monto con letra ─────────────── */

const UNIDADES = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
  'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const CIENTOS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

/** 0–999, en la forma que va antes de «mil», «millones» o «pesos»
 *  («veintiún mil», «un millón», «treinta y un pesos»). */
function hastaMil(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100), r = n % 100;
  let t = '';
  if (r < 30) t = UNIDADES[r];
  else t = DECENAS[Math.floor(r / 10)] + (r % 10 ? ` y ${UNIDADES[r % 10]}` : '');
  return [CIENTOS[c], t].filter(Boolean).join(' ');
}

function enteroConLetra(n: number): string {
  if (n === 0) return 'cero';
  const millones = Math.floor(n / 1_000_000), miles = Math.floor((n % 1_000_000) / 1000), resto = n % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? 'un millón' : `${enteroConLetra(millones)} millones`);
  if (miles) partes.push(miles === 1 ? 'mil' : `${hastaMil(miles)} mil`);
  if (resto) partes.push(hastaMil(resto));
  return partes.join(' ');
}

/** 5000050 → «CINCUENTA MIL PESOS 50/100 M.N.» */
export const montoConLetra = (centavos: unknown): string => {
  const n = Math.round(Number(centavos) || 0);
  const pesos = Math.floor(n / 100), cent = n % 100;
  const letra = enteroConLetra(pesos);
  // «un millón DE pesos», «dos millones DE pesos»: cuando termina en millón.
  const de = pesos >= 1_000_000 && pesos % 1_000_000 === 0 ? ' de' : '';
  return `${letra}${de} ${pesos === 1 ? 'peso' : 'pesos'} ${String(cent).padStart(2, '0')}/100 M.N.`.toUpperCase();
};

/* ─────────────── el PDF ─────────────── */

let cargando: Promise<any> | null = null;
const traerJsPDF = (): Promise<any> => {
  const w = window as any;
  if (w.jspdf?.jsPDF) return Promise.resolve(w.jspdf.jsPDF);
  if (!cargando) {
    cargando = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = '/vendor/jspdf.js';
      s.onload = () => (w.jspdf?.jsPDF ? ok(w.jspdf.jsPDF) : mal(new Error('No se pudo preparar el PDF.')));
      s.onerror = () => { cargando = null; mal(new Error('No se pudo preparar el PDF. Revisa tu señal.')); };
      document.head.appendChild(s);
    });
  }
  return cargando;
};

type Rgb = [number, number, number];
const AZUL: Rgb = [0, 128, 193], TINTA: Rgb = [10, 24, 40], TENUE: Rgb = [91, 107, 122], LINEA: Rgb = [217, 225, 232];

/** Arma el documento. Se exporta aparte de la descarga para poder medirlo
 *  (páginas, texto) sin que el navegador guarde nada. */
export async function armarPagare(p: Fila): Promise<any> {
  const JsPDF = await traerJsPDF();
  const doc = new JsPDF({ unit: 'pt', format: 'letter' });
  const ANCHO = doc.internal.pageSize.getWidth(), ALTO = doc.internal.pageSize.getHeight();
  const M = 54, UTIL = ANCHO - M * 2;
  const borrador = p.estado === 'por_depositar';
  const empresa = p.empresa?.nombre || 'La empresa';
  const lugar = p.ajustes?.lugar || '';
  const representante = p.ajustes?.representante || '';
  const pagos: Fila[] = p.pagos || [];
  const ultima = pagos.length ? pagos[pagos.length - 1].fecha : p.fecha_vencimiento;
  const total = pagos.reduce((s: number, g: Fila) => s + Number(g.capital) + Number(g.interes), 0);
  const interes = pagos.reduce((s: number, g: Fila) => s + Number(g.interes), 0);
  let y = M;

  const pie = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...TENUE);
      doc.text(`Pagaré ${p.folio} · ${empresa} · página ${i} de ${n}`, M, ALTO - 30);
      if (borrador) {
        doc.setFont('helvetica', 'bold').setFontSize(46).setTextColor(235, 238, 241);
        doc.text('BORRADOR', ANCHO / 2, ALTO / 2, { align: 'center', angle: 35 });
      }
    }
  };
  const cabe = (alto: number) => { if (y + alto > ALTO - 56) { doc.addPage(); y = M; } };
  const parrafo = (texto: string, o: { negrita?: boolean; tam?: number; color?: Rgb; justo?: boolean; despues?: number } = {}) => {
    doc.setFont('helvetica', o.negrita ? 'bold' : 'normal').setFontSize(o.tam || 10.5).setTextColor(...(o.color || TINTA));
    const lineas = doc.splitTextToSize(texto, UTIL);
    const alto = lineas.length * (o.tam || 10.5) * 1.45;
    cabe(alto);
    doc.text(lineas, M, y + (o.tam || 10.5), { align: o.justo ? 'justify' : 'left', maxWidth: UTIL, lineHeightFactor: 1.45 });
    y += alto + (o.despues ?? 10);
  };

  /* — encabezado — */
  doc.setFillColor(...AZUL).rect(0, 0, ANCHO, 8, 'F');
  y = 46;
  doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(...TINTA).text('PAGARÉ', M, y + 16);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...TENUE).text(`Folio ${p.folio}`, M, y + 32);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...TENUE).text('BUENO POR', ANCHO - M, y + 4, { align: 'right' });
  doc.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...TINTA).text(pesos(p.monto), ANCHO - M, y + 24, { align: 'right' });
  y += 52;
  doc.setDrawColor(...LINEA).setLineWidth(0.8).line(M, y, ANCHO - M, y);
  y += 16;

  /* — el cuerpo — */
  const donde = lugar ? `En ${lugar}, a ${diaLargo(p.fecha_inicio)}.` : `A ${diaLargo(p.fecha_inicio)}.`;
  parrafo(donde, { despues: 8 });
  parrafo(
    `Por este pagaré, ${empresa}${p.empresa?.rfc ? ` (RFC ${p.empresa.rfc})` : ''}, en adelante «el suscriptor», promete incondicionalmente pagar a la orden de `
    + `${p.inversionista.nombre}, en adelante «el beneficiario», la cantidad de ${pesos(p.monto)} (${montoConLetra(p.monto)}), `
    + 'que el suscriptor recibió a su entera satisfacción en calidad de préstamo.',
    { justo: true },
  );
  const comoPaga = p.esquema === 'unico'
    ? `en una sola exhibición el ${diaLargo(ultima)}`
    : `en ${pagos.length} pagos conforme a la tabla de pagos que forma parte de este documento, el último de ellos el ${diaLargo(ultima)}`;
  parrafo(`La suma principal se pagará ${comoPaga}${lugar ? `, en ${lugar}` : ''}, mediante transferencia a la cuenta que el beneficiario indique.`, { justo: true });
  const comoCausa = p.tipo_tasa === 'fija'
    ? `una tasa fija de ${tasa('fija', p.tasa_pb).replace(' por todo el plazo', '')} sobre la suma principal por todo el plazo`
    : p.tipo_tasa === 'mensual'
      ? `una tasa de ${tasa('mensual', p.tasa_pb)} sobre saldos insolutos, calculada por meses completos y, por los días restantes, a razón de treinta días por mes`
      : `una tasa de ${tasa('anual', p.tasa_pb)} sobre saldos insolutos, calculada por los días efectivamente transcurridos sobre la base de un año de 365 días`;
  parrafo(
    Number(p.tasa_pb) > 0
      ? `La suma principal causará intereses ordinarios a ${comoCausa}, a partir del ${diaLargo(p.fecha_inicio)}. Los intereses de todo el plazo ascienden a ${pesos(interes)}, por lo que el total a pagar es de ${pesos(total)} (${montoConLetra(total)}).`
      : `La suma principal no causará intereses ordinarios. El total a pagar es de ${pesos(total)} (${montoConLetra(total)}).`,
    { justo: true },
  );
  parrafo('El suscriptor podrá pagar anticipadamente, total o parcialmente, sin penalización. Cualquier cambio a la tabla de pagos deberá constar por escrito y ser aceptado por ambas partes.', { justo: true, despues: 16 });

  /* — la tabla de pagos — */
  cabe(60);
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...TINTA).text('Tabla de pagos', M, y + 10);
  y += 22;
  const col = [M, M + 44, M + 190, M + 300, M + 410];
  const der = [0, 0, M + 290, M + 400, ANCHO - M];
  const encabezado = () => {
    doc.setFillColor(245, 247, 249).rect(M, y, UTIL, 20, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...TENUE);
    doc.text('N.º', col[0] + 6, y + 13); doc.text('FECHA', col[1], y + 13);
    doc.text('CAPITAL', der[2], y + 13, { align: 'right' }); doc.text('INTERÉS', der[3], y + 13, { align: 'right' }); doc.text('PAGO', der[4] - 6, y + 13, { align: 'right' });
    y += 20;
  };
  encabezado();
  doc.setFontSize(10);
  for (const g of pagos) {
    if (y + 20 > ALTO - 56) { doc.addPage(); y = M; encabezado(); doc.setFontSize(10); }
    doc.setFont('helvetica', 'normal').setTextColor(...TINTA);
    doc.text(String(g.numero), col[0] + 6, y + 14);
    doc.text(diaLargo(g.fecha), col[1], y + 14);
    doc.text(pesos(g.capital), der[2], y + 14, { align: 'right' });
    doc.text(pesos(g.interes), der[3], y + 14, { align: 'right' });
    doc.setFont('helvetica', 'bold').text(pesos(Number(g.capital) + Number(g.interes)), der[4] - 6, y + 14, { align: 'right' });
    doc.setDrawColor(...LINEA).setLineWidth(0.5).line(M, y + 20, ANCHO - M, y + 20);
    y += 20;
  }
  cabe(26);
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...TINTA);
  doc.text('Total', col[1], y + 15);
  doc.text(pesos(Number(p.monto)), der[2], y + 15, { align: 'right' });
  doc.text(pesos(interes), der[3], y + 15, { align: 'right' });
  doc.text(pesos(total), der[4] - 6, y + 15, { align: 'right' });
  y += 34;

  /* — los riesgos (0.2.0) —
   * Mike, 8-oct-2026: «un disclaimer de los riesgos de la inversión, sobre
   * todo riesgos de no pago del cliente». Van ANTES de las firmas, para que
   * firmar el pagaré sea también aceptarlos: es la única aceptación que hay
   * cuando el préstamo no nació de una oferta hecha en pantalla. */
  if (p.riesgos?.texto) {
    const lineasDeRiesgo = String(p.riesgos.texto).split('\n').map((x: string) => x.trim()).filter(Boolean);
    const cierre = p.riesgos.aceptados_at
      ? `El beneficiario leyó y aceptó estos riesgos en patron101 el ${momento(p.riesgos.aceptados_at)}, y lo ratifica con su firma.`
      : 'Con su firma, el beneficiario declara que leyó y acepta estos riesgos.';
    /* LAS FIRMAS NO SE QUEDAN SOLAS EN UNA HOJA. Una hoja que sólo trae dos
     * rayas y dos nombres se puede engrapar a cualquier cosa. Si los riesgos
     * y las firmas no caben juntos en lo que queda de esta página, los dos
     * pasan a la siguiente: lo que se firma queda encima de la firma. */
    doc.setFont('helvetica', 'normal').setFontSize(9);
    const altoDe = (texto: string, despues: number) => doc.splitTextToSize(texto, UTIL).length * 9 * 1.45 + despues;
    const altoRiesgos = 10 + (9.5 * 1.45 + 6) + lineasDeRiesgo.reduce((s: number, l: string) => s + altoDe(l, 4), 0) + altoDe(cierre, 10) + 12;
    const ALTO_FIRMAS = 54 + 60;
    if (altoRiesgos + ALTO_FIRMAS <= ALTO - 56 - M) cabe(altoRiesgos + ALTO_FIRMAS);
    y += 10;
    cabe(60);
    parrafo('RIESGOS QUE EL BENEFICIARIO DECLARA CONOCER', { negrita: true, tam: 9.5, despues: 6 });
    for (const linea of lineasDeRiesgo) parrafo(linea, { tam: 9, despues: 4 });
    parrafo(cierre, { tam: 9, negrita: true, despues: 10 });
  }

  /* — las firmas — */
  cabe(54 + 60);
  y += 54;
  const mitad = UTIL / 2 - 14;
  doc.setDrawColor(...TINTA).setLineWidth(0.8);
  doc.line(M, y, M + mitad, y); doc.line(ANCHO - M - mitad, y, ANCHO - M, y);
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...TINTA);
  doc.text(doc.splitTextToSize(empresa, mitad), M, y + 14);
  doc.text(doc.splitTextToSize(p.inversionista.nombre, mitad), ANCHO - M - mitad, y + 14);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...TENUE);
  doc.text(`El suscriptor${representante ? ` · representado por ${representante}` : ''}`, M, y + 40, { maxWidth: mitad });
  doc.text('El beneficiario', ANCHO - M - mitad, y + 40);

  pie();
  return doc;
};

export async function descargarPagare(prestamo: Fila): Promise<void> {
  const doc = await armarPagare(prestamo);
  doc.save(`Pagaré ${prestamo.folio}${prestamo.estado === 'por_depositar' ? ' (borrador)' : ''}.pdf`);
}
