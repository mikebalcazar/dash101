/* dash101 con un navegador de verdad, contra el Worker de STAGING y la org
 * `demo`. Nunca contra `forespot`.
 *
 * Lo pidió el chat de dash101 el 12-sep-2026 (muro, 22:45), por orden de Mike,
 * como lo que tiene que quedar probado antes del corte. Cuatro cosas:
 *
 *   1. Entrar por el propio Worker y que la sesión aguante al cambiar de
 *      pantalla.
 *   2. Que el dinero se pinte en centavos correctos: 80 000 centavos se ven
 *      como $800.00, no como $80 000.
 *   3. La conciliación de punta a punta: una cuenta que cuadra no genera
 *      ajuste, una que no cuadra sí, y el saldo termina igual al real.
 *   4. Sin errores de JavaScript y sin barrido horizontal a 390 × 844.
 *
 * LO PRIMERO QUE ENCONTRÓ
 *
 * La primera vez que corrió, el 12-sep, el login de `dash101-staging` —y el de
 * `dash101` en producción— se estrellaba en el navegador: «Application error:
 * a client-side exception», por `FirebaseError: auth/invalid-api-key`.
 * `lib/firebase.ts` inicializaba Firebase al cargar aunque la fuente fuera la
 * API, y las construcciones del Worker no llevan llave. Nadie lo había visto
 * porque el corredor medía HTML y JSON, no un navegador. Para eso es esto.
 *
 * CÓMO NO MUEVE LOS DATOS DE LA DEMO
 *
 * Las capturas del escaparate salen de «Taller Demo» y sus cifras tienen que
 * cuadrar entre pantallas. Así que aquí NADA se escribe en Taller Demo: el
 * dinero se comprueba leyendo, y la conciliación —que sí escribe ajustes— se
 * hace en un negocio aparte, «Pruebas de navegador», con su propia cuenta,
 * que se crea una sola vez si no existe. Lo que esta prueba ensucia, lo
 * ensucia en su propio patio.
 *
 * LAS CIFRAS ESPERADAS NO ESTÁN ESCRITAS AQUÍ
 *
 * Se leen de la API con la misma galleta del navegador y se calculan como lo
 * hace la app (`saldo_inicial + ingresos − egresos`, en centavos). Así la
 * prueba sigue valiendo cuando dash101 vuelva a sembrar la demo para las
 * capturas, y —lo que importa— comprueba que la pantalla pinta lo que la API
 * dice, no un número que alguien copió a mano.
 *
 * LA PRUEBA SE PRUEBA EN SUS DOS SENTIDOS
 *
 * Cada cosa que se afirma tiene su contrario medido al lado: el número bien
 * está y el número ×100 no está; la cuenta que cuadra no deja ajuste y la que
 * no cuadra sí lo deja; un código bueno entra y uno malo no. Una prueba que
 * sólo sabe decir que sí no prueba nada.
 *
 * UNA SOLA ENTRADA, COMPARTIDA
 *
 * La API no reenvía un código al mismo correo antes de 45 s. Cinco pruebas
 * entrando cada una por su cuenta chocan con eso. Así que entra la primera,
 * guarda la sesión, y las demás arrancan ya adentro. La del código equivocado
 * va al final, para que su petición caiga fuera de la ventana; y si aun así
 * la API pide esperar, espera.
 *
 * DÓNDE CORRE
 *
 * En el corredor, contra `URL_DASH` = la dirección del Worker de staging. En
 * la máquina del chat el navegador no puede hacer HTTPS, así que se corre
 * contra `pruebas/relevo.mjs` (un puente en `127.0.0.1` que reenvía a staging
 * con Node) o contra una construcción local con `next start`.
 *
 *   URL_DASH=http://127.0.0.1:8797 node --test pruebas/navegador.spec.mjs
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const URL = (process.env.URL_DASH || 'http://127.0.0.1:8797').replace(/\/$/, '');
const ORG = 'demo';
const CORREO = process.env.CORREO_PRUEBAS || 'prueba.admin@ejemplo.mx';
const NEGOCIO_DEMO = 'Taller Demo';
const NEGOCIO_PRUEBAS = 'Pruebas de navegador';
const CUENTA_PRUEBAS = 'Caja de pruebas';
const LLAVE_NEGOCIO = 'conta-master:negocio-activo-id';
const AJUSTE = 'ajuste_conciliacion';

const texto = (pag) => pag.evaluate(() => document.body.innerText);
const pesos0 = (centavos) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(centavos / 100);
const pesos2 = (centavos) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(centavos / 100);
const filas = (x) => (Array.isArray(x) ? x : x?.filas ?? []);

let nav;
let estado = null; // la sesión que abre la primera prueba
before(async () => { nav = await chromium.launch(); });
after(async () => { await nav?.close(); });

/* ─────────────── el navegador ─────────────── */

async function pestana(viewport = { width: 1440, height: 900 }, conSesion = false) {
  if (conSesion) assert.ok(estado, 'la primera prueba (entrar) tiene que haber pasado para tener sesión');
  const ctx = await nav.newContext({ viewport, locale: 'es-MX', ...(conSesion ? { storageState: estado } : {}) });
  const pag = await ctx.newPage();
  const errores = [];
  pag.on('pageerror', (e) => errores.push(String(e).slice(0, 300)));
  return { ctx, pag, errores };
}

/** Pide el código y espera el formulario. Si la API pide esperar para
 *  reenviar (`demasiados_intentos`, 45 s), espera y vuelve a pedir una vez. */
async function pedirCodigoConPaciencia(pag, correo) {
  await pag.goto(`${URL}/login`, { waitUntil: 'load' });
  await pag.getByPlaceholder('tu@correo.mx').fill(correo);
  for (let intento = 1; intento <= 2; intento++) {
    await pag.getByRole('button', { name: 'Mandarme un código' }).click();
    const llego = await pag.getByText('Ambiente de pruebas: el código se rellenó solo')
      .waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    if (llego) return;
    const dice = await texto(pag);
    if (intento === 1 && /intento|espera|demasiad/i.test(dice)) {
      console.log('    (la API pidió esperar para reenviar el código: 46 s)');
      await pag.waitForTimeout(46000);
      continue;
    }
    assert.fail(`no apareció el formulario del código; la pantalla dice: ${dice.slice(0, 200)}`);
  }
}

/** Entra por el propio Worker: correo → «Mandarme un código» → en staging el
 *  código se rellena solo → «Entrar con el código» → /dashboard. */
async function entrar(pag, correo = CORREO) {
  await pedirCodigoConPaciencia(pag, correo);
  await pag.getByRole('button', { name: 'Entrar con el código' }).click();
  await pag.waitForURL(/\/dashboard/, { timeout: 30000 });
}

/** Lo mismo que hace la app: la API por `/s101`, desde DENTRO de la página.
 *
 *  No se usa `pag.request`: la galleta de la suite es `Secure`, y el cliente
 *  HTTP de Playwright no la manda por `http://127.0.0.1` aunque el navegador
 *  sí la acepte ahí. Un `fetch` dentro de la página lleva la galleta que
 *  lleva la app, y eso es lo que se quiere medir. `X-App` va porque en una
 *  construcción local el `rewrite` de Next no lo pone; el Worker lo
 *  sobrescribe de todos modos. */
async function api(pag, ruta, { method = 'GET', body } = {}) {
  const { status, cuerpo } = await pag.evaluate(async ([ruta, method, body]) => {
    const r = await fetch(`/s101${ruta}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-App': 'dash101' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
    });
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch { /* no vino JSON */ }
    return { status: r.status, cuerpo };
  }, [ruta, method, body]);
  assert.ok(cuerpo?.ok, `${method} ${ruta} → ${status} ${cuerpo?.error ?? ''} ${JSON.stringify(cuerpo?.detalle ?? '')}`);
  return cuerpo.data;
}

/** Deja activo el negocio que se pida, como lo hace la app: por localStorage. */
const elegirNegocio = (pag, id) => pag.evaluate(([k, v]) => localStorage.setItem(k, v), [LLAVE_NEGOCIO, id]);

/** `saldo_inicial + ingresos − egresos`, en centavos: la fórmula de la app. */
function saldoCentavos(cuenta, movimientos) {
  let delta = 0;
  for (const m of movimientos) if (m.cuenta_id === cuenta.id) delta += m.tipo === 'ingreso' ? m.monto : -m.monto;
  return cuenta.saldo_inicial + delta;
}

/** El negocio de pruebas con su cuenta; se crean una sola vez. */
async function negocioDePruebas(pag) {
  let neg = filas(await api(pag, `/orgs/${ORG}/negocios`)).find((n) => n.nombre === NEGOCIO_PRUEBAS);
  if (!neg) neg = await api(pag, `/orgs/${ORG}/negocios`, { method: 'POST', body: { nombre: NEGOCIO_PRUEBAS, moneda: 'MXN' } });
  let cuenta = filas(await api(pag, `/orgs/${ORG}/cuentas?negocio_id=${neg.id}`)).find((c) => c.nombre === CUENTA_PRUEBAS);
  if (!cuenta) {
    cuenta = await api(pag, `/orgs/${ORG}/cuentas`, {
      method: 'POST', body: { nombre: CUENTA_PRUEBAS, tipo: 'caja', saldo_inicial: 1000000, negocio_id: neg.id, moneda: 'MXN' },
    });
  }
  return { neg, cuenta };
}

/* ═══════════════ 1 · entrar, y que la sesión aguante ═══════════════ */

test('entra por el propio Worker y la sesión aguanta al cambiar de pantalla', async () => {
  const { ctx, pag, errores } = await pestana();
  await entrar(pag);

  const yo = await api(pag, '/yo');
  assert.equal(yo.usuario.correo, CORREO, 'la sesión es de quien entró');
  assert.ok(yo.orgs.some((o) => o.id === ORG), `y es de ${ORG}`);

  for (const ruta of ['/dashboard', '/movimientos', '/cuentas', '/conciliacion', '/flujo', '/equipo']) {
    await pag.goto(`${URL}${ruta}`, { waitUntil: 'load' });
    // El marco de la app cargó cuando la barra de arriba ya dice qué negocio
    // está activo: eso sólo pasa con sesión y con la API contestando.
    await pag.waitForFunction(
      () => /Taller Demo|Pruebas de navegador|Sin negocios/.test(document.body.innerText),
      null, { timeout: 20000 },
    );
    assert.ok(!pag.url().includes('/login'), `${ruta} no devolvió al login`);
    assert.equal((await api(pag, '/yo')).usuario.correo, CORREO, `${ruta}: la sesión sigue viva`);
  }
  assert.equal((await api(pag, '/yo')).usuario.correo, CORREO, 'la sesión aguantó seis pantallas');
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  estado = await ctx.storageState();
  await ctx.close();
});

/* ═══════════════ 2 · el dinero, en centavos correctos ═══════════════ */

test('el dinero se pinta en centavos correctos (Taller Demo, sólo lectura)', async () => {
  const { ctx, pag, errores } = await pestana({ width: 1440, height: 900 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });

  const demo = filas(await api(pag, `/orgs/${ORG}/negocios`)).find((n) => n.nombre === NEGOCIO_DEMO);
  assert.ok(demo, `existe el negocio «${NEGOCIO_DEMO}» en ${ORG}`);
  const cuentas = filas(await api(pag, `/orgs/${ORG}/cuentas?negocio_id=${demo.id}`));
  const movs = filas(await api(pag, `/orgs/${ORG}/movimientos`));
  assert.ok(cuentas.length >= 1 && movs.length >= 1, 'hay cuentas y movimientos que cuadrar');

  const banco = cuentas.find((c) => c.tipo === 'banco') ?? cuentas[0];
  const centavos = saldoCentavos(banco, movs);
  const bien = pesos0(centavos);          // lo que la app tiene que pintar
  const mal = pesos0(centavos * 100);     // lo que pintaría si olvidara dividir
  const capital = pesos0(cuentas.reduce((s, c) => s + saldoCentavos(c, movs), 0));
  console.log(`    ${banco.nombre}: ${centavos} centavos → debe verse «${bien}» y nunca «${mal}»; capital «${capital}»`);

  await elegirNegocio(pag, demo.id);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  await pag.waitForFunction((b) => document.body.innerText.includes(b), bien, { timeout: 30000 });
  const t = await texto(pag);
  assert.ok(t.includes(bien), `el tablero pinta «${bien}»`);
  assert.ok(t.includes(capital), `y el capital total «${capital}»`);
  assert.ok(!t.includes(mal), `y NO pinta «${mal}» (centavos leídos como pesos)`);

  // En la conciliación se pinta con centavos: $365,000.00 y no $365,000.
  await pag.goto(`${URL}/conciliacion`, { waitUntil: 'load' });
  const exacto = pesos2(centavos);
  await pag.waitForFunction((e) => document.body.innerText.includes(e), exacto, { timeout: 30000 });
  assert.ok((await texto(pag)).includes(exacto), `la conciliación pinta «${exacto}»`);

  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

/* ═══════════════ 3 · la conciliación, de punta a punta ═══════════════ */

test('conciliar: la que cuadra no deja ajuste, la que no cuadra sí, y el saldo termina igual al real', async () => {
  const { ctx, pag, errores } = await pestana({ width: 1440, height: 900 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  const { neg, cuenta } = await negocioDePruebas(pag);
  await elegirNegocio(pag, neg.id);

  const ajustesDe = async () =>
    filas(await api(pag, `/orgs/${ORG}/movimientos`)).filter((m) => m.cuenta_id === cuenta.id && m.categoria === AJUSTE);
  const saldoActual = async () => saldoCentavos(cuenta, filas(await api(pag, `/orgs/${ORG}/movimientos`)));
  const filaDe = (nombre) => pag.getByRole('row', { name: new RegExp(nombre) });
  const esperarEnFila = (nombre, trozo) => pag.waitForFunction(([n, x]) => {
    const r = [...document.querySelectorAll('tr')].find((f) => f.innerText.includes(n));
    return !!r && r.innerText.includes(x);
  }, [nombre, trozo], { timeout: 10000 });

  /* a · cuadra: mismo saldo → «cuadra», «Todo cuadró», cero ajustes nuevos */
  const antes = await ajustesDe();
  const registrado = await saldoActual();

  await pag.goto(`${URL}/conciliacion`, { waitUntil: 'load' });
  await filaDe(CUENTA_PRUEBAS).waitFor({ timeout: 30000 });
  assert.ok((await filaDe(CUENTA_PRUEBAS).innerText()).includes(pesos2(registrado)), `la fila enseña lo registrado: ${pesos2(registrado)}`);
  await filaDe(CUENTA_PRUEBAS).getByPlaceholder('cuánto hay').fill((registrado / 100).toFixed(2));
  await esperarEnFila(CUENTA_PRUEBAS, 'cuadra');
  await pag.getByRole('button', { name: 'Conciliar' }).click();
  await pag.getByText('Todo cuadró: no hizo falta ningún ajuste.').waitFor({ timeout: 30000 });

  assert.equal((await ajustesDe()).length, antes.length, 'cuadró: ni un ajuste nuevo');
  assert.equal(await saldoActual(), registrado, 'y el saldo no se movió');

  /* b · no cuadra: $800.00 de menos → ajuste de 80 000 centavos, saldo = real */
  const real = registrado - 80000;
  await pag.goto(`${URL}/conciliacion`, { waitUntil: 'load' });
  await filaDe(CUENTA_PRUEBAS).waitFor({ timeout: 30000 });
  await filaDe(CUENTA_PRUEBAS).getByPlaceholder('cuánto hay').fill((real / 100).toFixed(2));
  await esperarEnFila(CUENTA_PRUEBAS, pesos2(80000));
  await pag.getByRole('button', { name: 'Conciliar' }).click();
  await pag.getByText(/1 cuenta quedó ajustada a la realidad; se escaparon \$800\.00/).waitFor({ timeout: 30000 });

  const despues = await ajustesDe();
  assert.equal(despues.length, antes.length + 1, 'no cuadró: exactamente un ajuste nuevo');
  const nuevo = despues.find((m) => !antes.some((a) => a.id === m.id));
  assert.equal(nuevo.tipo, 'egreso', 'el ajuste es un egreso (faltaba dinero)');
  assert.equal(nuevo.monto, 80000, 'de 80 000 centavos: los $800.00 que faltaban');
  assert.equal(await saldoActual(), real, 'y el saldo terminó igual al real');

  console.log(`    ${CUENTA_PRUEBAS}: registrado ${pesos2(registrado)} → real ${pesos2(real)} → ajuste ${nuevo.tipo} ${nuevo.monto} centavos`);
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

/* ═══════════════ 4 · en un celular ═══════════════ */

test('a 390×844 no hay barrido horizontal ni errores de JavaScript', async () => {
  const { ctx, pag, errores } = await pestana({ width: 390, height: 844 }, true);
  for (const ruta of ['/dashboard', '/movimientos', '/cuentas', '/conciliacion']) {
    await pag.goto(`${URL}${ruta}`, { waitUntil: 'load' });
    await pag.waitForTimeout(1500);
    const m = await pag.evaluate(() => ({ ancho: document.documentElement.scrollWidth, ventana: window.innerWidth }));
    assert.ok(m.ancho <= m.ventana + 1, `${ruta}: cero barrido horizontal (${m.ancho} vs ${m.ventana})`);
  }
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

/* ═══════════════ 5 · el otro sentido de la puerta, al final ═══════════════ */

test('un código equivocado NO entra', async () => {
  const { ctx, pag } = await pestana();
  await pedirCodigoConPaciencia(pag, CORREO);
  await pag.getByPlaceholder('código de 6 dígitos').fill('000000');
  await pag.getByRole('button', { name: 'Entrar con el código' }).click();
  await pag.waitForTimeout(3000);
  assert.ok(pag.url().includes('/login'), 'sigue en el login');
  assert.ok(/c[oó]digo/i.test(await texto(pag)), 'y dice algo del código');
  await ctx.close();
});
