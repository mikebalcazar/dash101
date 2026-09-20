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

/* SI CORRES ESTO DESDE EL CONTENEDOR DE UNA SESIÓN DE CHAT, hazlo contra un
 * `next start` en 127.0.0.1 con NO_PROXY puesto, no contra el Worker: el proxy
 * de salida vuelve a codificar los paréntesis de `_next/static/chunks/app/(app)/…`,
 * Cloudflare contesta 307 a la forma sin codificar, y el navegador entra en un
 * bucle que se ve como «ChunkLoadError» en TODAS las pantallas. No es un
 * defecto de dash101: en un navegador de verdad, y en el corredor de GitHub,
 * las mismas direcciones dan 200. Se midió el 20-sep-2026, en staging y en
 * producción, contra el mismo commit que aquí pasa en verde. */
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

/* La contraseña que esta prueba le pone a la cuenta de staging si no tiene.
 * Lleva el número de la corrida para que dos corridas no se peleen. Nunca
 * corre contra producción. */
const CLAVE = `dash-${process.env.GITHUB_RUN_ID || Date.now()}-sauce`;

/** Desde el 16-sep-2026 la pantalla entra con Google o con contraseña, y el
 *  código quedó como recuperación. Esta prueba entra por ahí —«Olvidé mi
 *  contraseña»— porque es lo único que puede hacer sola: no sabe la contraseña
 *  de nadie, y en staging el código se rellena solo. Si la API pide esperar
 *  para reenviar (`demasiados_intentos`, 45 s), espera y vuelve a pedir una vez. */
async function pedirCodigoConPaciencia(pag, correo) {
  await pag.goto(`${URL}/login`, { waitUntil: 'load' });
  await pag.getByPlaceholder('tu@correo.mx').fill(correo);
  await pag.getByRole('button', { name: 'Continuar' }).click();
  await pag.getByPlaceholder('contraseña').waitFor({ timeout: 15000 });
  for (let intento = 1; intento <= 2; intento++) {
    await pag.getByRole('button', { name: 'Olvidé mi contraseña' }).click();
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

/** Entra por el propio Worker: correo → contraseña → «Olvidé mi contraseña»
 *  → en staging el código se rellena solo → «Continuar» → si esa cuenta no
 *  tiene contraseña, la pantalla la pide y se pone → /dashboard. Caben las dos
 *  salidas en vez de suponer una: suponerla haría que la prueba fallara o no
 *  según lo que dejó la corrida anterior. */
async function entrar(pag, correo = CORREO) {
  await pedirCodigoConPaciencia(pag, correo);
  await pag.getByRole('button', { name: 'Continuar' }).click();
  const pide = await pag.getByPlaceholder('contraseña nueva').waitFor({ timeout: 8000 }).then(() => true, () => false);
  if (pide) {
    await pag.getByPlaceholder('contraseña nueva').fill(CLAVE);
    await pag.getByPlaceholder('otra vez, de memoria').fill(CLAVE);
    await pag.getByRole('button', { name: 'Guardar y entrar' }).click();
  }
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
    /* La lista de negocios de la demo crece: cada prueba que escribe se hace
     * su propio negocio para no mover Taller Demo, y el que sale activo en un
     * perfil nuevo es el primero que devuelva la API. Por eso se acepta
     * cualquier «Pruebas de …» en vez de nombrarlos uno por uno: el 20-sep
     * esto dejó el flujo en rojo cuando supply101 creó el suyo. */
    await pag.waitForFunction(
      () => /Taller Demo|Pruebas de |Sin negocios/.test(document.body.innerText),
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
  for (const ruta of ['/dashboard', '/movimientos', '/cuentas', '/conciliacion', '/ordenes', '/ordenes/nueva', '/ordenes/buzon', '/fiscal', '/fiscal/pendientes', '/fiscal/cfdi']) {
    await pag.goto(`${URL}${ruta}`, { waitUntil: 'load' });
    await pag.waitForTimeout(1500);
    const m = await pag.evaluate(() => ({ ancho: document.documentElement.scrollWidth, ventana: window.innerWidth }));
    assert.ok(m.ancho <= m.ventana + 1, `${ruta}: cero barrido horizontal (${m.ancho} vs ${m.ventana})`);
  }
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

/* ═══════════════ 5 · una compra de punta a punta, desde el celular ═══════════════
 *
 * Es el recorrido que pidió el encargo de órdenes (19-sep): pedir una compra
 * a 390 × 844 con foto adjunta, pagarla, y que quien la pidió vea el cambio.
 *
 * Aquí lo pide y lo paga la MISMA cuenta —es la única que esta prueba sabe
 * abrir— y por eso «ve el cambio» se comprueba en Mis compras. Que un miembro
 * no pueda ver las órdenes de otro ni abrir el buzón se mide en el servidor,
 * en `pruebas/ordenes.spec.ts` de suite101-api, que es donde se decide.
 *
 * Todo pasa en «Pruebas de navegador», no en Taller Demo: esto SÍ escribe
 * —una orden y un egreso— y las cifras de la demo son las de las capturas. */

// Un PNG de 1×1 transparente: lo mínimo que prueba que el archivo sube, se
// registra y se pinta. Una foto de verdad no mediría nada más.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('pedir una compra desde el celular, pagarla, y que el que la pidió lo vea', async () => {
  const { ctx, pag, errores } = await pestana({ width: 390, height: 844 }, true);

  // Primero la página: `api()` habla por `/s101`, que es una ruta relativa, y
  // sin una página abierta no hay contra qué resolverla.
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  const { neg, cuenta } = await negocioDePruebas(pag);
  await elegirNegocio(pag, neg.id);

  // Quien paga es una etiqueta, y la reparte el dueño: esta cuenta es admin
  // de `demo`, no dueña, así que NO puede ponérsela sola —eso lo revisa el
  // servidor—. Se la deja puesta `scripts/sembrar-demo.mjs`, que entra como
  // superadmin. Si el buzón no abre, eso es lo que falta.
  const buzon = await pag.evaluate(async () => (await fetch('/s101/orgs/demo/ordenes/buzon', {
    headers: { 'X-App': 'dash101' }, credentials: 'include',
  })).status);
  assert.equal(buzon, 200, 'esta cuenta puede pagar (si no: node scripts/sembrar-demo.mjs)');

  // ── pedirla ──
  await pag.goto(`${URL}/ordenes/nueva`, { waitUntil: 'load' });
  await pag.getByLabel('Cuánto es (total, con IVA si lleva)').fill('1160');
  await pag.getByLabel('Qué se compra').fill('Triplay del navegador');
  await pag.getByPlaceholder('Nombre del proveedor').fill('Maderas del navegador');
  await pag.setInputFiles('#archivo', { name: 'cotizacion.png', mimeType: 'image/png', buffer: PNG_1PX });

  // El desglose se propone solo, y es lo que se va a guardar.
  assert.equal(await pag.getByLabel('Subtotal').inputValue(), '1000', 'el subtotal propuesto');
  assert.equal(await pag.getByLabel('IVA', { exact: true }).inputValue(), '160', 'y el IVA');

  await pag.getByRole('button', { name: 'Pedir la compra' }).click();
  // `/ordenes/nueva` también casa con «/ordenes/algo»: hay que esperar a que
  // deje de ser la pantalla del formulario.
  await pag.waitForURL((u) => /\/ordenes\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith('/nueva'), { timeout: 30000 });
  await pag.waitForTimeout(1000);
  const dice = await texto(pag);
  assert.match(dice, /OC-\d+/, 'la orden trae folio');
  assert.match(dice, /\$1,160\.00/, 'el total en PESOS, no en centavos');
  assert.ok(!/116000/.test(dice), 'y en ningún lado se asoman los centavos crudos');
  assert.match(dice, /En el buzón/, 'cae directa al buzón, sin autorización previa');
  const folio = dice.match(/OC-\d+/)[0];

  // La cotización subió y se pinta.
  assert.equal(await pag.locator('img[alt="cotizacion.png"]').count(), 1, 'la cotización se ve');

  // ── pagarla ──
  await pag.getByRole('button', { name: 'Pagar', exact: true }).click();
  await pag.getByLabel('De qué cuenta sale').selectOption(cuenta.id);
  await pag.getByRole('button', { name: 'Registrar el pago' }).click();
  await pag.getByText(/Pagada\./).waitFor({ timeout: 30000 });

  // ── y el egreso quedó, por el monto exacto y una sola vez ──
  const movs = filas(await api(pag, `/orgs/${ORG}/movimientos?cuenta_id=${cuenta.id}`));
  const suyos = movs.filter((m) => (m.descripcion || '').includes(folio));
  assert.equal(suyos.length, 1, 'un solo egreso, no dos');
  assert.equal(suyos[0].tipo, 'egreso');
  assert.equal(suyos[0].monto, 116000, 'por 116 000 centavos, que son los $1,160.00');

  // ── el que la pidió lo ve ──
  await pag.goto(`${URL}/ordenes`, { waitUntil: 'load' });
  await pag.getByText(folio).first().waitFor({ timeout: 15000 });
  const lista = await texto(pag);
  assert.match(lista, /Pagada/, 'en Mis compras ya dice Pagada');

  console.log(`    ${folio}: pedida a 390×844 con foto, pagada de ${CUENTA_PRUEBAS}, egreso de 116000 centavos`);
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

/* ═══════════════ 6 · dar de alta un cliente sin salirse del proyecto ═══════
 *
 * Lo pidió Mike el 20-sep: antes, para crear un proyecto de un cliente nuevo
 * había que irse a Clientes, crearlo y volver a empezar el formulario. Aquí
 * se mide lo que de verdad importa: que el cliente nuevo quede escogido sin
 * salirse, y que al escribir un nombre que ya existe la pantalla pregunte
 * «¿no te refieres a éste?» en vez de crear el duplicado callada. */

const CLIENTE_PRUEBAS = 'Cliente de navegador';

test('se da de alta un cliente desde «nuevo proyecto», y avisa del parecido', async () => {
  const { ctx, pag, errores } = await pestana({ width: 1280, height: 900 }, true);
  // Primero la página: `api()` habla por `/s101`, que es relativo, y sin una
  // página abierta no hay contra qué resolverlo.
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  const { neg } = await negocioDePruebas(pag);
  await elegirNegocio(pag, neg.id);

  await pag.goto(`${URL}/proyectos/nuevo`, { waitUntil: 'load' });
  await pag.getByLabel('Cliente').waitFor({ timeout: 20000 });
  await pag.waitForTimeout(1000);

  const yaEsta = (await pag.getByLabel('Cliente').innerText()).includes(CLIENTE_PRUEBAS);

  await pag.getByLabel('Cliente').selectOption('__nuevo__');
  await pag.getByPlaceholder('Nombre o razón social').fill(
    // Con minúsculas y sin acentos a propósito: así se prueba que el parecido
    // se busca como lo guarda la suite, no comparando texto tal cual.
    yaEsta ? CLIENTE_PRUEBAS.toLowerCase() : CLIENTE_PRUEBAS,
  );
  await pag.getByRole('button', { name: 'Guardar cliente' }).click();

  if (yaEsta) {
    // Ya existía: tiene que preguntar antes de crear otro igual.
    await pag.getByText(/¿No te refieres a/).waitFor({ timeout: 15000 });
    await pag.getByRole('button', { name: new RegExp(`Usar ${CLIENTE_PRUEBAS}`) }).click();
  }

  await pag.waitForTimeout(2000);
  const escogido = await pag.getByLabel('Cliente').inputValue();
  assert.ok(escogido && escogido !== '__nuevo__', 'el cliente quedó escogido en el desplegable');
  const nombreEscogido = await pag.getByLabel('Cliente').evaluate((s) => s.selectedOptions[0]?.textContent);
  assert.match(nombreEscogido || '', new RegExp(CLIENTE_PRUEBAS, 'i'), 'y es el que se acaba de dar de alta');

  console.log(`    cliente «${nombreEscogido}» ${yaEsta ? 'reusado por parecido' : 'creado'} sin salirse del proyecto`);
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

/* ═══════════════ 6 bis · editar la lista de ítems EN LA PANTALLA ═══════════════
 *
 * Mike lo reportó dos veces, y la segunda con la pantalla enfrente:
 *
 *   «en la lista de "productos del cliente" […] me sigue solo sumando las
 *   listas de ítems cuando quiero editar y borrar. Le doy guardar cambios y
 *   vuelve a sumar lo que estaba editable. No quita nada.»
 *
 * La primera vez se arregló el módulo y se probó el módulo
 * (`pruebas/items-proyecto.spec.ts`), que es lo que llamaba la pantalla. Lo
 * que NO se probó fue la pantalla: abrirla, teclear, borrar un renglón, picar
 * «Guardar cambios» y volver a mirar. Esta prueba hace exactamente eso, con
 * un navegador de verdad contra staging, porque es el único lugar donde se
 * ve lo que Mike ve.
 */

test('editar los ítems del proyecto: se borra uno, se guarda, y NO vuelve', async () => {
  const { ctx, pag, errores } = await pestana({ width: 1280, height: 900 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  const { neg } = await negocioDePruebas(pag);
  await elegirNegocio(pag, neg.id);

  // Un proyecto propio de esta prueba, con su cliente, para no tocar nada de
  // los demás recorridos.
  let cliente = filas(await api(pag, `/orgs/${ORG}/clientes?negocio_id=${neg.id}`))
    .find((c) => c.nombre === CLIENTE_PRUEBAS);
  if (!cliente) {
    cliente = await api(pag, `/orgs/${ORG}/clientes`, {
      method: 'POST', body: { nombre: CLIENTE_PRUEBAS, negocio_id: neg.id },
    });
  }
  const proyecto = await api(pag, `/orgs/${ORG}/proyectos`, {
    method: 'POST',
    body: { nombre: `Ítems ${Date.now().toString(36).slice(-5)}`, cliente_id: cliente.id, negocio_id: neg.id, estado: 'activo' },
  });
  for (const [nombre, monto] of [['Cocina', 100_00], ['Clóset', 200_00], ['Isla', 50_00]]) {
    await api(pag, `/orgs/${ORG}/items`, {
      method: 'POST',
      body: { nombre, monto, cantidad: 1, estado: 'vendido', proyecto_id: proyecto.id, cliente_id: cliente.id, negocio_id: neg.id },
    });
  }

  await pag.goto(`${URL}/proyectos/${proyecto.id}`, { waitUntil: 'load' });
  await pag.getByText('Ítems del proyecto').first().waitFor({ timeout: 20000 });
  await pag.getByRole('button', { name: /^Editar$/ }).first().click();

  const renglones = pag.locator('input[placeholder^="Ítem ("]');
  await renglones.first().waitFor({ timeout: 15000 });
  assert.equal(await renglones.count(), 3, 'la pantalla abre con los tres que hay');

  // Lo de Mike: cambiarle a uno, BORRAR otro, y guardar.
  await renglones.nth(0).fill('Cocina grande');
  const basureros = pag.locator('input[placeholder^="Ítem ("]').locator('xpath=../button');
  await basureros.nth(1).click(); // fuera «Clóset»
  assert.equal(await renglones.count(), 2, 'en pantalla ya son dos');

  await pag.getByRole('button', { name: /Guardar cambios/ }).click();
  /* Dos señales, y en este orden a propósito: el formulario se cierra —eso
   * es lo estable— y además sale el aviso. El aviso vivía DENTRO del
   * formulario, que se desmonta al guardar, así que no aparecía nunca;
   * esta prueba lo cachó y por eso ahora se pinta en la vista. */
  await pag.getByRole('button', { name: /^Editar$/ }).first().waitFor({ timeout: 30000 });
  await pag.getByText('Cambios guardados').waitFor({ timeout: 10000 });
  await pag.waitForTimeout(1000);

  // Y ahora lo que importa: lo que quedó GUARDADO, leído de la API.
  const quedaron = filas(await api(pag, `/orgs/${ORG}/items?proyecto_id=${proyecto.id}`))
    .filter((i) => i.estado !== 'cancelado')
    .map((i) => i.nombre)
    .sort();
  assert.deepEqual(quedaron, ['Cocina grande', 'Isla'], 'quedó LO QUE SE VE: ni el borrado ni copias');

  const p = await api(pag, `/orgs/${ORG}/proyectos/${proyecto.id}`);
  assert.equal(p.precio_venta, 150_00, 'y el precio de venta es la suma de los que quedaron');

  // Guardar otra vez sin tocar nada tampoco duplica.
  await pag.getByRole('button', { name: /^Editar$/ }).first().click();
  await pag.getByRole('button', { name: /Guardar cambios/ }).click();
  await pag.getByRole('button', { name: /^Editar$/ }).first().waitFor({ timeout: 30000 });
  await pag.waitForTimeout(1000);
  const otraVez = filas(await api(pag, `/orgs/${ORG}/items?proyecto_id=${proyecto.id}`))
    .filter((i) => i.estado !== 'cancelado');
  assert.equal(otraVez.length, 2, 'guardar dos veces seguidas no agrega nada');

  console.log(`    ítems tras editar y borrar: ${quedaron.join(', ')} · precio ${pesos2(p.precio_venta)}`);
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

test('la cantidad: 20 puertas a $1,500 son $30,000 de línea, no $600,000', async () => {
  const { ctx, pag, errores } = await pestana({ width: 1280, height: 900 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  const { neg } = await negocioDePruebas(pag);
  await elegirNegocio(pag, neg.id);

  let cliente = filas(await api(pag, `/orgs/${ORG}/clientes?negocio_id=${neg.id}`))
    .find((c) => c.nombre === CLIENTE_PRUEBAS);
  if (!cliente) {
    cliente = await api(pag, `/orgs/${ORG}/clientes`, { method: 'POST', body: { nombre: CLIENTE_PRUEBAS, negocio_id: neg.id } });
  }
  const proyecto = await api(pag, `/orgs/${ORG}/proyectos`, {
    method: 'POST',
    body: { nombre: `Cantidad ${Date.now().toString(36).slice(-5)}`, cliente_id: cliente.id, negocio_id: neg.id, estado: 'activo' },
  });

  await pag.goto(`${URL}/proyectos/${proyecto.id}`, { waitUntil: 'load' });
  await pag.getByText('Ítems del proyecto').first().waitFor({ timeout: 20000 });
  await pag.getByRole('button', { name: /^Editar$/ }).first().click();
  await pag.getByRole('button', { name: 'Agregar' }).first().click();

  await pag.locator('input[placeholder^="Ítem ("]').first().fill('Puerta de clóset');
  await pag.getByLabel('Cantidad').first().fill('20');
  await pag.getByLabel('Precio por pieza').first().fill('1500');

  await pag.getByRole('button', { name: /Guardar cambios/ }).click();
  await pag.getByRole('button', { name: /^Editar$/ }).first().waitFor({ timeout: 30000 });
  await pag.waitForTimeout(1000);

  const item = filas(await api(pag, `/orgs/${ORG}/items?proyecto_id=${proyecto.id}`))
    .filter((i) => i.estado !== 'cancelado')[0];
  assert.equal(item.cantidad, 20, 'se guardaron las 20 piezas');
  assert.equal(item.monto, 30_000_00, 'y el importe es el de la línea');
  const p = await api(pag, `/orgs/${ORG}/proyectos/${proyecto.id}`);
  assert.equal(p.precio_venta, 30_000_00, 'el precio de venta NO se multiplica otra vez');

  const dice = await texto(pag);
  assert.ok(/20/.test(dice), 'la cantidad se ve en la tabla');
  console.log(`    20 × ${pesos2(1_500_00)} = ${pesos2(item.monto)} de línea`);
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

test('un cobro se captura «falta facturar» y aparece en la lista de pendientes', async () => {
  /* Encargo de Mike del 20-sep. Se recorre lo que él hace: capturar un
   * ingreso diciendo que falta facturarlo, y encontrarlo en Fiscal → Falta la
   * factura, del lado de los COBROS.
   *
   * Los campos se buscan por lo que SON —`input[type=number]`, el `select`
   * que contiene la opción con ese id— y no por su etiqueta: las etiquetas de
   * este formulario no están ligadas a su campo con `htmlFor`, y buscarlas
   * con getByLabel tumbó el despliegue de las 05:56. */
  const { ctx, pag, errores } = await pestana({ width: 1280, height: 900 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  const { neg } = await negocioDePruebas(pag);
  await elegirNegocio(pag, neg.id);

  const cuenta = filas(await api(pag, `/orgs/${ORG}/cuentas?negocio_id=${neg.id}`))[0];
  assert.ok(cuenta, 'la demo tiene al menos una cuenta');

  let cliente = filas(await api(pag, `/orgs/${ORG}/clientes?negocio_id=${neg.id}`))
    .find((c) => c.nombre === CLIENTE_PRUEBAS);
  if (!cliente) {
    cliente = await api(pag, `/orgs/${ORG}/clientes`, { method: 'POST', body: { nombre: CLIENTE_PRUEBAS, negocio_id: neg.id } });
  }
  const proyecto = await api(pag, `/orgs/${ORG}/proyectos`, {
    method: 'POST',
    body: { nombre: `Cobro ${Date.now().toString(36).slice(-5)}`, cliente_id: cliente.id, negocio_id: neg.id, estado: 'activo' },
  });

  await pag.goto(`${URL}/movimientos/nuevo`, { waitUntil: 'load' });
  const campoMonto = pag.locator('input[type="number"]').first();
  await campoMonto.waitFor({ timeout: 25000 });

  await pag.getByRole('button', { name: /^Ingreso$/ }).click();
  await campoMonto.fill('12345');

  // Cada select se ubica por la opción que contiene: no depende del orden.
  await pag.locator(`select:has(option[value="${proyecto.id}"])`).first()
    .selectOption(proyecto.id, { timeout: 25000 });
  await pag.locator(`select:has(option[value="${cuenta.id}"])`).first().selectOption(cuenta.id);
  await pag.locator(`select:has(option[value="${cliente.id}"])`).first().selectOption(cliente.id);

  // Lo nuevo: un ingreso arranca solo en «falta facturar».
  const falta = pag.getByRole('button', { name: 'Falta facturar' });
  await falta.waitFor({ timeout: 20000 });
  assert.equal(await falta.getAttribute('aria-pressed'), 'true',
    'un ingreso arranca en «falta facturar», que es lo que casi siempre pasa');

  await pag.getByRole('button', { name: /^Registrar ingreso$/ }).click();
  await pag.waitForURL(/\/movimientos(\?|$)/, { timeout: 30000 });

  const pend = filas(await api(pag, `/orgs/${ORG}/fiscal/pendientes?negocio_id=${neg.id}&tipo=ingreso`));
  const mio = pend.find((m) => m.monto === 12_345_00);
  assert.ok(mio, 'el cobro quedó esperando factura');
  assert.equal(mio.tipo, 'ingreso');

  await pag.goto(`${URL}/fiscal/pendientes`, { waitUntil: 'load' });
  await pag.getByText('Cobros que falta facturar').first().waitFor({ timeout: 25000 });

  console.log(`    un cobro de ${pesos2(12_345_00)} esperando factura`);
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

test('corregir un movimiento: se cambia el monto y el saldo se recalcula', async () => {
  /* Mike, 20-sep: «no hay manera de editar un movimiento, no puedo. necesito
   * corregir un movimiento». Antes había que borrarlo y recapturarlo. */
  const { ctx, pag, errores } = await pestana({ width: 1280, height: 900 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  const { neg } = await negocioDePruebas(pag);
  await elegirNegocio(pag, neg.id);

  const cuenta = filas(await api(pag, `/orgs/${ORG}/cuentas?negocio_id=${neg.id}`))[0];
  let cliente = filas(await api(pag, `/orgs/${ORG}/clientes?negocio_id=${neg.id}`))
    .find((c) => c.nombre === CLIENTE_PRUEBAS);
  if (!cliente) {
    cliente = await api(pag, `/orgs/${ORG}/clientes`, { method: 'POST', body: { nombre: CLIENTE_PRUEBAS, negocio_id: neg.id } });
  }

  // Un cobro capturado con un cero de más, que es el error de verdad.
  const mov = await api(pag, `/orgs/${ORG}/movimientos`, {
    method: 'POST',
    body: {
      negocio_id: neg.id, tipo: 'ingreso', monto: 90_000_00, fecha: '2026-03-18',
      cuenta_id: cuenta.id, contraparte_tipo: 'cliente', contraparte_id: cliente.id,
      contraparte_nombre: cliente.nombre, descripcion: 'Con un cero de mas',
    },
  });

  await pag.goto(`${URL}/movimientos/${mov.id}/editar`, { waitUntil: 'load' });
  const campoMonto = pag.locator('input[type="number"]').first();
  await campoMonto.waitFor({ timeout: 25000 });
  assert.equal(await campoMonto.inputValue(), '90000', 'llega prellenado con lo que había');

  /* Este movimiento NO tiene proyecto a propósito: es el caso que tumbó el
   * despliegue de las 06:10. El proyecto es obligatorio al capturar un
   * ingreso, y al corregir eso bloqueaba el envío del formulario en
   * silencio —se le picaba a «Guardar cambios» y no pasaba nada—. */
  await campoMonto.fill('9000');
  await pag.getByRole('button', { name: /^Guardar cambios$/ }).click();
  try {
    await pag.waitForURL(/\/movimientos(\?|$)/, { timeout: 30000 });
  } catch (e) {
    // Si no navegó, se dice POR QUÉ: lo que quedó en pantalla. Un timeout
    // pelón obliga a adivinar, y adivinar ya costó dos despliegues.
    const enPantalla = (await texto(pag)).replace(/\s+/g, ' ').slice(0, 400);
    assert.fail(`no guardó. La pantalla decía: ${enPantalla}`);
  }

  const d = await api(pag, `/orgs/${ORG}/movimientos/${mov.id}`);
  assert.equal(d.monto, 9_000_00, 'quedó corregido');
  assert.equal(d.descripcion, 'Con un cero de mas', 'y lo que no se tocó no se perdió');

  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

test('corregir un movimiento SIN contraparte: el botón no se queda apagado', async () => {
  /* Mike, 20-sep: «cuando quiero editar un movimiento, a la hora de guardar
   * no me hace nada». Sin mensaje: nada.
   *
   * Un movimiento puede no tener contraparte de a de veras —un ajuste, un
   * gasto fijo, la caseta, algo importado— y el formulario lo daba por
   * imposible sin decirlo: el botón de guardar se apagaba cuando faltaba la
   * contraparte, y un botón apagado sin explicación se ve igual que uno
   * descompuesto.
   *
   * Esto no lo puede atrapar una prueba de datos: la escritura SÍ acepta el
   * cambio (se mide en pruebas/editar-sin-contraparte.spec.ts). Lo que
   * estorbaba era la pantalla, y la pantalla sólo se ve con un navegador. */
  const { ctx, pag, errores } = await pestana({ width: 390, height: 844 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  const { neg } = await negocioDePruebas(pag);
  await elegirNegocio(pag, neg.id);

  const cuenta = filas(await api(pag, `/orgs/${ORG}/cuentas?negocio_id=${neg.id}`))[0];
  const mov = await api(pag, `/orgs/${ORG}/movimientos`, {
    method: 'POST',
    body: {
      negocio_id: neg.id, tipo: 'egreso', monto: 4_500_00, fecha: '2026-03-24',
      cuenta_id: cuenta.id, contraparte_tipo: 'otro', contraparte_id: null,
      contraparte_nombre: 'Caseta', descripcion: 'Sin proveedor',
    },
  });

  await pag.goto(`${URL}/movimientos/${mov.id}/editar`, { waitUntil: 'load' });
  const campoMonto = pag.locator('input[type="number"]').first();
  await campoMonto.waitFor({ timeout: 25000 });

  const boton = pag.getByRole('button', { name: /^Guardar cambios$/ });
  assert.equal(await boton.isDisabled(), false, 'el botón de guardar está vivo, no apagado');

  await campoMonto.fill('5200');
  await boton.click();
  try {
    await pag.waitForURL(/\/movimientos(\?|$)/, { timeout: 30000 });
  } catch (e) {
    const enPantalla = (await texto(pag)).replace(/\s+/g, ' ').slice(0, 400);
    assert.fail(`no guardó. La pantalla decía: ${enPantalla}`);
  }

  const d = await api(pag, `/orgs/${ORG}/movimientos/${mov.id}`);
  assert.equal(d.monto, 5_200_00, 'quedó corregido');
  // Y no se le inventó un proveedor con tal de poder guardar: un pago
  // atribuido a quien nunca lo cobró es peor que no poder corregirlo.
  assert.equal(d.contraparte_id, null, 'sigue sin contraparte');
  assert.equal(d.contraparte_nombre, 'Caseta', 'y conserva a quién se le pagó');

  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

/* ═══════════════ 7 · el otro sentido de la puerta, al final ═══════════════ */

test('un código equivocado NO entra', async () => {
  const { ctx, pag } = await pestana();
  await pedirCodigoConPaciencia(pag, CORREO);
  await pag.getByPlaceholder('código de 6 dígitos').fill('000000');
  await pag.getByRole('button', { name: 'Continuar' }).click();
  await pag.waitForTimeout(3000);
  assert.ok(pag.url().includes('/login'), 'sigue en el login');
  assert.ok(/c[oó]digo/i.test(await texto(pag)), 'y dice algo del código');
  await ctx.close();
});
