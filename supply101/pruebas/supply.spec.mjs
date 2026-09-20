/* supply101 con un navegador de verdad, a 390 × 844, contra la API de
 * STAGING y la org `demo`. Nunca contra `forespot`.
 *
 * Lo que mide, que es lo que la app promete:
 *
 *   1. Se entra con la cuenta de la suite, sin PIN y sin clave tecleada de
 *      licencia: correo → contraseña, y «olvidé» manda código.
 *   2. Se pide una compra desde el teléfono, con foto, y el desglose que
 *      propone la pantalla es el que se guarda.
 *   3. La compra aparece en «mis compras» con su folio y su estado, y el
 *      dinero se pinta en PESOS: $1,160.00, nunca 116000.
 *   4. Cuando se paga —eso pasa en dash101, aquí sólo se mira—, la app dice
 *      «Pagada» y ENSEÑA EL COMPROBANTE, que es para lo que existe.
 *   5. Ni barrido horizontal ni errores de JavaScript.
 *
 * Escribe en un negocio propio, «Pruebas de supply101», para no mover las
 * cifras de Taller Demo, de donde salen las capturas del escaparate.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const URL = (process.env.URL_SUPPLY || 'http://127.0.0.1:8798').replace(/\/$/, '');
const API = process.env.API_ORIGEN || 'https://suite101-api-staging.mike-929.workers.dev';
const ORG = 'demo';
const CORREO = process.env.CORREO_PRUEBAS || 'prueba.admin@ejemplo.mx';
const NEGOCIO = 'Pruebas de supply101';
const CUENTA = 'Caja de supply101';
const CLAVE = `supply-${process.env.GITHUB_RUN_ID || Date.now()}-nopal`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

let nav, ctx, pag;
const errores = [];
let folio = '';

before(async () => {
  nav = await chromium.launch();
  ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-MX' });
  pag = await ctx.newPage();
  pag.on('pageerror', (e) => errores.push(String(e).slice(0, 200)));
});
after(async () => { await nav?.close(); });

/** La API desde dentro de la página, con la galleta que ya tiene el
 *  navegador. Sirve para preparar y para comprobar por el otro lado. */
async function api(ruta, { method = 'GET', body } = {}) {
  const { status, cuerpo } = await pag.evaluate(async ([ruta, method, body]) => {
    const r = await fetch(`/s101${ruta}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), credentials: 'include',
    });
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch { /* no vino JSON */ }
    return { status: r.status, cuerpo };
  }, [ruta, method, body]);
  assert.ok(cuerpo?.ok, `${method} ${ruta} → ${status} ${cuerpo?.error ?? ''}`);
  return cuerpo.data;
}

const filas = (x) => (Array.isArray(x) ? x : x?.filas ?? []);

test('se entra con la cuenta de la suite', async () => {
  await pag.goto(`${URL}/`, { waitUntil: 'load' });
  await pag.getByPlaceholder('tu@correo.mx').fill(CORREO);
  await pag.getByRole('button', { name: 'Continuar' }).click();
  await pag.getByPlaceholder('contraseña', { exact: true }).waitFor({ timeout: 15000 });
  await pag.getByRole('button', { name: 'Olvidé mi contraseña' }).click();
  const llego = await pag.getByText('Ambiente de pruebas: el código se rellenó solo')
    .waitFor({ timeout: 15000 }).then(() => true, () => false);
  if (!llego) {
    // La API pide esperar para reenviar (45 s). Se espera y se vuelve a pedir.
    await pag.waitForTimeout(46000);
    await pag.getByRole('button', { name: 'Olvidé mi contraseña' }).click();
    await pag.getByText('Ambiente de pruebas: el código se rellenó solo').waitFor({ timeout: 15000 });
  }
  await pag.getByRole('button', { name: 'Continuar' }).click();
  const pide = await pag.getByPlaceholder('contraseña nueva').waitFor({ timeout: 8000 }).then(() => true, () => false);
  if (pide) {
    await pag.getByPlaceholder('contraseña nueva').fill(CLAVE);
    await pag.getByPlaceholder('otra vez, de memoria').fill(CLAVE);
    await pag.getByRole('button', { name: 'Guardar y entrar' }).click();
  }
  await pag.getByRole('button', { name: 'Pedir una compra' }).waitFor({ timeout: 30000 });
  assert.match(await pag.evaluate(() => document.body.innerText), /Mis compras/);
});

test('se pide una compra desde el teléfono, con foto y con su desglose', async () => {
  // El negocio propio de esta prueba, para no mover Taller Demo.
  let neg = filas(await api(`/orgs/${ORG}/negocios`)).find((n) => n.nombre === NEGOCIO);
  if (!neg) neg = await api(`/orgs/${ORG}/negocios`, { method: 'POST', body: { nombre: NEGOCIO, moneda: 'MXN' } });
  let cuenta = filas(await api(`/orgs/${ORG}/cuentas?negocio_id=${neg.id}`)).find((c) => c.nombre === CUENTA);
  if (!cuenta) {
    cuenta = await api(`/orgs/${ORG}/cuentas`, { method: 'POST', body: { nombre: CUENTA, tipo: 'caja', saldo_inicial: 5000000, negocio_id: neg.id, moneda: 'MXN' } });
  }
  /* Escoger el negocio se guarda en `localStorage`, pero la página que ya
   * está abierta no lo relee: hay que recargarla, como haría quien lo escoge
   * en el selector. Sin la recarga, la compra se creaba en Taller Demo y la
   * lista —filtrada por el negocio de pruebas— salía vacía. */
  await pag.evaluate((id) => localStorage.setItem('supply101:negocio', id), neg.id);
  await pag.reload({ waitUntil: 'load' });
  await pag.getByRole('button', { name: 'Pedir una compra' }).waitFor({ timeout: 30000 });

  await pag.goto(`${URL}/#/pedir`, { waitUntil: 'load' });
  await pag.getByLabel('Cuánto es').fill('1160');
  await pag.getByLabel('Qué se compra').fill('Triplay de supply101');
  await pag.getByPlaceholder('Nombre del proveedor').fill('Maderas de supply101');
  await pag.setInputFiles('#archivo', { name: 'cotizacion.png', mimeType: 'image/png', buffer: PNG });

  assert.equal(await pag.locator('#subtotal').inputValue(), '1000.00', 'el subtotal propuesto');
  assert.equal(await pag.locator('#iva').inputValue(), '160.00', 'y el IVA');

  await pag.getByRole('button', { name: 'Pedir la compra' }).click();
  await pag.waitForFunction(() => location.hash.startsWith('#/orden/'), { timeout: 30000 });
  await pag.waitForTimeout(1500);

  const dice = await pag.evaluate(() => document.body.innerText);
  assert.match(dice, /OC-\d+/, 'trae folio');
  assert.match(dice, /\$1,160\.00/, 'el total en PESOS');
  assert.ok(!/116000/.test(dice), 'y sin centavos crudos a la vista');
  assert.match(dice, /Esperando pago/, 'cae directa al buzón de quien paga');
  folio = dice.match(/OC-\d+/)[0];
  // La foto se sube DESPUÉS de crear la orden —hasta entonces no hay id del
  // que colgarla—, así que se espera a que aparezca en vez de contarla ya.
  await pag.locator('img[alt="cotizacion.png"]').waitFor({ timeout: 15000 });
  assert.equal(await pag.locator('img[alt="cotizacion.png"]').count(), 1, 'la cotización se ve');
});

test('cuando la pagan, la app enseña el comprobante', async () => {
  const id = await pag.evaluate(() => location.hash.replace('#/orden/', ''));
  const cuenta = filas(await api(`/orgs/${ORG}/cuentas`)).find((c) => c.nombre === CUENTA);

  // El pago NO se hace desde supply101 —aquí no hay con qué—: se hace por la
  // API, como lo haría quien paga desde dash101.
  const pago = await api(`/orgs/${ORG}/ordenes/${id}/pagar`, { method: 'POST', body: { cuenta_id: cuenta.id } });
  const forma = await pag.evaluateHandle(() => new FormData());
  await pag.evaluate(async ([org, mov]) => {
    const f = new FormData();
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    f.set('archivo', new File([bytes], 'comprobante.png', { type: 'image/png' }));
    f.set('de_tabla', 'movimientos');
    f.set('de_id', mov);
    const r = await fetch(`/s101/orgs/${org}/archivos`, { method: 'POST', body: f, credentials: 'include' });
    if (!r.ok) throw new Error('no subió el comprobante: ' + r.status);
  }, [ORG, pago.movimiento.id]);
  await forma.dispose();

  await pag.reload({ waitUntil: 'load' });
  await pag.locator('img[alt="comprobante.png"]').waitFor({ timeout: 20000 });
  const dice = await pag.evaluate(() => document.body.innerText);
  assert.match(dice, /Pagada/, 'dice que ya se pagó');
  assert.match(dice, /El comprobante del pago/, 'y enseña el comprobante');
  assert.equal(await pag.locator('img[alt="comprobante.png"]').count(), 1, 'el comprobante se ve');
});

test('la compra sale en mis compras, y a 390 no hay barrido ni errores', async () => {
  await pag.goto(`${URL}/#/`, { waitUntil: 'load' });
  // Dentro de la lista, no en cualquier parte: el detalle sigue en el DOM,
  // escondido, y también trae el folio.
  await pag.locator('#lista').getByText(folio).first().waitFor({ timeout: 20000 });
  const dice = await pag.locator('#v-lista').innerText();
  assert.match(dice, /Pagada/);
  assert.ok(!/116000/.test(dice), 'el dinero, en pesos');

  for (const h of ['#/', '#/pedir']) {
    await pag.goto(`${URL}/${h}`, { waitUntil: 'load' });
    await pag.waitForTimeout(1200);
    const m = await pag.evaluate(() => ({ ancho: document.documentElement.scrollWidth, ventana: window.innerWidth }));
    assert.ok(m.ancho <= m.ventana + 1, `${h}: cero barrido horizontal (${m.ancho} vs ${m.ventana})`);
  }
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  console.log(`    ${folio} pedida, pagada y con comprobante a la vista, a 390×844`);
});
