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
 * Paga de una cuenta de pruebas del registro de la empresa, para no mover las
 * cifras de Taller Demo, de donde salen las capturas del escaparate.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const URL = (process.env.URL_SUPPLY || 'http://127.0.0.1:8798').replace(/\/$/, '');
const API = process.env.API_ORIGEN || 'https://suite101-api-staging.mike-929.workers.dev';
const ORG = 'demo';
const CORREO = process.env.CORREO_PRUEBAS || 'prueba.admin@ejemplo.mx';
/* La cuenta de la que se paga. supply101 NO puede abrir cuentas (eso es de
 * dash101: la API contesta 403 sin_permiso), así que se usa la que ya exista
 * en el registro de la empresa: la propia de supply101 si está, y si no la de
 * las pruebas de dash101, que vive en el mismo registro. Hasta que la org demo
 * junte sus registros (API 0.63.0), «Caja de supply101» puede estar en otro. */
const CUENTAS = ['Caja de supply101', 'Caja de pruebas'];
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

async function cuentaDePruebas() {
  const cuentas = filas(await api(`/orgs/${ORG}/cuentas`));
  for (const nombre of CUENTAS) {
    const c = cuentas.find((x) => x.nombre === nombre);
    if (c) return c;
  }
  assert.fail(`no hay cuenta de pruebas en el registro de la empresa: hace falta «${CUENTAS[0]}» o «${CUENTAS[1]}» (se abren desde dash101)`);
}

test('se entra con la cuenta de la suite', async () => {
  await pag.goto(`${URL}/`, { waitUntil: 'load' });
  await pag.getByPlaceholder('tu@correo.mx').fill(CORREO);
  await pag.getByRole('button', { name: 'Continuar' }).click();
  await pag.getByPlaceholder('contraseña', { exact: true }).waitFor({ timeout: 15000 });
  await pag.getByRole('button', { name: 'No tengo contraseña o la olvidé' }).click();
  const llego = await pag.getByText('Ambiente de pruebas: el código se rellenó solo')
    .waitFor({ timeout: 15000 }).then(() => true, () => false);
  if (!llego) {
    /* La API pide esperar unos 45 s entre un código y otro, y eso pasa
     * seguido en el corredor: esta prueba corre justo después de la de
     * dash101, con la misma cuenta. Se espera y se vuelve a pedir DESDE LA
     * PANTALLA DEL CÓDIGO, que es donde está el botón de reenviar: al picar
     * «Olvidé mi contraseña» la pantalla anterior ya se fue, y buscar ahí ese
     * botón otra vez fue lo que dejó el flujo en rojo el 20-sep. */
    await pag.waitForTimeout(46000);
    await pag.getByRole('button', { name: 'Volver a mandar el código' }).click();
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
  /* La cuenta de pruebas tiene que existir en la empresa, que es de la que
   * la API cuelga cada orden (contrato 0.63.0). Aquí sólo se comprueba; de
   * ella se paga en la prueba que sigue. */
  await cuentaDePruebas();
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
  // Y sube achicada (publico/imagen.js, 29-sep): la app la convierte a JPEG
  // antes de mandarla, así que el archivo que cuelga se llama .jpg aunque
  // se haya escogido un .png.
  await pag.locator('img[alt="cotizacion.jpg"]').waitFor({ timeout: 15000 });
  assert.equal(await pag.locator('img[alt="cotizacion.jpg"]').count(), 1, 'la cotización se ve, ya achicada');
});

test('cuando la pagan, la app enseña el comprobante', async () => {
  const id = await pag.evaluate(() => location.hash.replace('#/orden/', ''));
  const cuenta = await cuentaDePruebas();

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

/* 0.47.0 · Un reembolso desde el mismo formulario. Mike, 28-sep: «podría ser
 * el mismo portal de supply, pero poner una opción en el tipo de orden si es
 * reembolso o compra». Se mide que salga con folio RE-, marcado como
 * reembolso, y que la lista lo enseñe junto a las compras. Esta cuenta SÍ
 * tiene la llave de compras; el caso de quien no la tiene («tu usuario no
 * está autorizado para compras») se mide en la API, que es donde se decide. */
test('se pide un reembolso desde el mismo formulario, y sale con folio RE-', async () => {
  await pag.goto(`${URL}/#/`, { waitUntil: 'load' });
  await pag.getByRole('button', { name: 'Pedir un reembolso' }).click();
  await pag.waitForFunction(() => location.hash === '#/reembolso');
  assert.equal(await pag.locator('#tipo .opcion[data-tipo="reembolso"]').getAttribute('aria-checked'), 'true', 'la opción reembolso queda marcada');
  assert.match(await pag.locator('#pedir-t').innerText(), /Pedir un reembolso/);

  await pag.getByLabel('Cuánto pagaste').fill('850');
  await pag.getByLabel('Qué compraste').fill('Gasolina de supply101');
  await pag.locator('#con-factura').uncheck();
  // 0.92.0 · La cuenta a la que se me regresa: se pide la primera vez; si
  // esta cuenta ya la dio en otra corrida, la tarjeta sale y la forma no.
  assert.ok(await pag.locator('#bloque-cuenta').isVisible(), 'en reembolso sale «A qué cuenta te lo regresamos»');
  if (await pag.locator('#cuenta-forma').isVisible()) {
    await pag.locator('#rc-clabe').fill('012 180 01562178859 4');
    await pag.locator('#rc-banco').fill('BBVA');
  } else {
    assert.ok(await pag.locator('#cuenta-guardada').isVisible(), 'o la cuenta guardada');
  }
  await pag.getByRole('button', { name: 'Pedir el reembolso' }).click();
  await pag.waitForFunction(() => location.hash.startsWith('#/orden/'), { timeout: 30000 });
  await pag.waitForTimeout(1200);

  const dice = await pag.evaluate(() => document.body.innerText);
  assert.match(dice, /RE-\d+/, 'trae folio de reembolso, no de compra');
  assert.match(dice, /Reembolso/, 'y dice que es reembolso');
  assert.match(dice, /\$850\.00/, 'en pesos');
  assert.match(dice, /Esperando pago/, 'cae al buzón de quien paga, como una compra');
  assert.match(dice, /A qué cuenta[\s\S]*012 180 01562178859 4/, 'y dice a qué cuenta se le regresa (0.92.0)');

  // Y la opción se cambia en el mismo formulario: abrir «pedir» y picar
  // Reembolso deja el mismo estado que la liga directa.
  await pag.goto(`${URL}/#/pedir`, { waitUntil: 'load' });
  await pag.locator('#tipo .opcion[data-tipo="reembolso"]').click();
  assert.match(await pag.locator('#b-pedir').innerText(), /Pedir el reembolso/);
  await pag.locator('#tipo .opcion[data-tipo="compra"]').click();
  assert.match(await pag.locator('#b-pedir').innerText(), /Pedir la compra/);
});

/* 0.86.0 · Cancelar una compra que ya no se necesita. Mike, 9-oct: «en
 * supply, hay que poner un botón para cancelar una orden que ya no se
 * necesita». Contra la API de verdad: el botón, la confirmación en su lugar,
 * «Cancelada» después, y que la API la tenga cancelada con el porqué. */
test('una compra que ya no se necesita se cancela, con confirmación y su porqué', async () => {
  await pag.goto(`${URL}/#/pedir`, { waitUntil: 'load' });
  await pag.getByLabel('Cuánto es').fill('99');
  await pag.getByLabel('Qué se compra').fill('Compra de supply101 que se cancela');
  await pag.locator('#con-factura').uncheck();
  await pag.getByRole('button', { name: 'Pedir la compra' }).click();
  await pag.waitForFunction(() => location.hash.startsWith('#/orden/'), { timeout: 30000 });
  await pag.getByRole('button', { name: 'Cancelar orden' }).waitFor({ timeout: 15000 });
  const id = await pag.evaluate(() => location.hash.replace('#/orden/', ''));
  const suFolio = (await pag.locator('#detalle .sub').first().innerText()).match(/OC-\d+/)[0];

  await pag.getByRole('button', { name: 'Cancelar orden' }).click();
  assert.match(await pag.locator('#confirma-cancelar').innerText(), new RegExp(`¿Cancelar ${suFolio}\\? Ya no se va a pagar\\.`));
  await pag.getByLabel('Por qué (opcional)').fill('Ya no hace falta (prueba de supply101)');
  await pag.getByRole('button', { name: 'Sí, cancelarla' }).click();
  await pag.locator('#detalle .marca.apagada', { hasText: 'Cancelada' }).waitFor({ timeout: 15000 });
  assert.equal(await pag.getByRole('button', { name: 'Cancelar orden' }).count(), 0, 'ya no se ofrece cancelarla');

  const r = await api(`/orgs/${ORG}/ordenes/${id}`);
  assert.equal(r.orden.estado, 'cancelada', 'la API la tiene cancelada');
  assert.equal(r.eventos.at(-1).que, 'cancelada');
  assert.equal(r.eventos.at(-1).nota, 'Ya no hace falta (prueba de supply101)');

  await pag.goto(`${URL}/#/`, { waitUntil: 'load' });
  const renglon = pag.locator('#lista .renglon', { hasText: suFolio });
  await renglon.waitFor({ timeout: 20000 });
  assert.match(await renglon.innerText(), /Cancelada/, '«Mis compras» dice Cancelada');
});

test('la compra sale en mis compras, y a 390 no hay barrido ni errores', async () => {
  await pag.goto(`${URL}/#/`, { waitUntil: 'load' });
  // Dentro de la lista, no en cualquier parte: el detalle sigue en el DOM,
  // escondido, y también trae el folio.
  await pag.locator('#lista').getByText(folio).first().waitFor({ timeout: 20000 });
  const dice = await pag.locator('#v-lista').innerText();
  assert.match(dice, /Pagada/);
  assert.ok(!/116000/.test(dice), 'el dinero, en pesos');

  for (const h of ['#/', '#/pedir', '#/reembolso']) {
    await pag.goto(`${URL}/${h}`, { waitUntil: 'load' });
    await pag.waitForTimeout(1200);
    const m = await pag.evaluate(() => ({ ancho: document.documentElement.scrollWidth, ventana: window.innerWidth }));
    assert.ok(m.ancho <= m.ventana + 1, `${h}: cero barrido horizontal (${m.ancho} vs ${m.ventana})`);
  }
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  console.log(`    ${folio} pedida, pagada y con comprobante a la vista, a 390×844`);
});
