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
 * hace en una cuenta aparte, «Caja de pruebas», que se crea una sola vez si
 * no existe. Lo que esta prueba ensucia, lo ensucia en su propio patio.
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
import { stat } from 'node:fs/promises';
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
const CUENTA_PRUEBAS = 'Caja de pruebas';
const AJUSTE = 'ajuste_conciliacion';

const texto = (pag) => pag.evaluate(() => document.body.innerText);
const pesos0 = (centavos) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(centavos / 100);
const pesos2 = (centavos) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(centavos / 100);
const filas = (x) => (Array.isArray(x) ? x : x?.filas ?? []);

/* La lista de la API se queda en 500 filas si no se le pide más, ordenada por
 * fecha de la más vieja a la más nueva. La org demo de staging ya pasó de 500
 * movimientos (cada corrida deja los suyos), y el 30-sep la conciliación
 * escribió su ajuste, la pantalla lo dijo, y la lista sin tope no lo enseñó:
 * quedaba en la fila 501. La app pide `?limite=` con el total (lib/api/
 * cliente.ts); aquí se pide el tope máximo de una vez. */
const TODOS = 'limite=5000';
const movimientosDe = (pag, filtro = '') => api(pag, `/orgs/${ORG}/movimientos?${filtro ? filtro + '&' : ''}${TODOS}`);

let nav;
let estado = null; // la sesión que abre la primera prueba
before(async () => { nav = await chromium.launch(); });
after(async () => { await nav?.close(); });

/* ─────────────── el navegador ─────────────── */

async function pestana(viewport = { width: 1440, height: 900 }, conSesion = false) {
  if (conSesion) assert.ok(estado, 'la primera prueba (entrar) tiene que haber pasado para tener sesión');
  /* `acceptDownloads` explícito: el estado de cuenta baja un .xlsx y esa
   * prueba no puede depender de cuál sea el valor por omisión del día. */
  const ctx = await nav.newContext({ viewport, locale: 'es-MX', acceptDownloads: true, ...(conSesion ? { storageState: estado } : {}) });
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
    await pag.getByRole('button', { name: 'No tengo contraseña o la olvidé' }).click();
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

/** `saldo_inicial + ingresos − egresos`, en centavos: la fórmula de la app. */
function saldoCentavos(cuenta, movimientos) {
  let delta = 0;
  for (const m of movimientos) if (m.cuenta_id === cuenta.id) delta += m.tipo === 'ingreso' ? m.monto : -m.monto;
  return cuenta.saldo_inicial + delta;
}

/** La cuenta de pruebas de la empresa demo; se crea una sola vez. La empresa
 *  es una (contrato 0.63.0): la cuenta cuelga de ella sola. */
async function cuentaDePruebas(pag) {
  let cuenta = filas(await api(pag, `/orgs/${ORG}/cuentas`)).find((c) => c.nombre === CUENTA_PRUEBAS);
  if (!cuenta) {
    cuenta = await api(pag, `/orgs/${ORG}/cuentas`, {
      method: 'POST', body: { nombre: CUENTA_PRUEBAS, tipo: 'caja', saldo_inicial: 1000000, moneda: 'MXN' },
    });
  }
  return { cuenta };
}

/** La conciliación pide TODAS las cuentas de la empresa, y la empresa demo
 *  es una (contrato 0.63.0): trae las de la siembra y las de otras pruebas.
 *  A las que no son de esta prueba se les pone lo registrado, para que
 *  cuadren y no dejen ajuste. */
async function cuadrarLasDemas(pag) {
  const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const c of filas(await api(pag, `/orgs/${ORG}/cuentas`))) {
    if (c.nombre === CUENTA_PRUEBAS) continue;
    const fila = pag.getByRole('row', { name: new RegExp(escapar(c.nombre)) }).first();
    await fila.getByPlaceholder('cuánto hay').fill((Number(c.saldo ?? c.saldo_inicial) / 100).toFixed(2));
  }
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
    // El marco de la app cargó cuando la barra de arriba ya dice cuál es la
    // empresa: eso sólo pasa con sesión y con la API contestando.
    await pag.waitForFunction(
      () => {
        const t = (document.querySelector('[data-empresa]')?.textContent ?? '').trim();
        return t.length > 1 && !/Cargando/.test(t);
      },
      null, { timeout: 20000 },
    );
    assert.ok(!pag.url().includes('/login'), `${ruta} no devolvió al login`);
    assert.equal((await api(pag, '/yo')).usuario.correo, CORREO, `${ruta}: la sesión sigue viva`);
  }
  assert.equal((await api(pag, '/yo')).usuario.correo, CORREO, 'la sesión aguantó seis pantallas');

  /* LA EMPRESA ES UNA (Mike, 1-oct): la barra dice cuál es; no hay selector,
   * ni pantalla aparte, ni alta, ni fusión, y la palabra de antes no aparece
   * en ninguna pantalla. */
  assert.equal(await pag.locator('[data-empresa]').count(), 1, 'la barra dice cuál es la empresa');
  assert.equal(await pag.getByRole('button', { name: /Taller Demo|Pruebas de / }).count(), 0, 'y no es un botón para cambiar de nada');
  assert.equal(await pag.getByRole('link', { name: /Crear nuevo negocio|Crear negocio/ }).count(), 0, 'ni ofrece crear otro');
  await pag.goto(`${URL}/negocios`, { waitUntil: 'load' });
  assert.equal(await pag.locator('[data-fusion-de-negocios]').count(), 0, 'la pantalla de negocios ya no existe');
  assert.equal(await pag.getByRole('button', { name: /^Negocios?$/ }).count() + await pag.getByRole('link', { name: /^Negocios?$/ }).count(), 0, 'el menú no trae «Negocio»');
  await pag.goto(`${URL}/settings`, { waitUntil: 'load' });
  await pag.locator('[data-configuracion-empresa]').waitFor({ timeout: 20000 });
  assert.ok(!/[Nn]egocio/.test(await pag.locator('body').innerText()), 'Configuración habla de la empresa, no de un negocio');
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  estado = await ctx.storageState();
  await ctx.close();
});

/* ═══════════════ 2 · el dinero, en centavos correctos ═══════════════ */

test('el dinero se pinta en centavos correctos (Taller Demo, sólo lectura)', async () => {
  const { ctx, pag, errores } = await pestana({ width: 1440, height: 900 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });

  /* Se lee lo mismo que dash101 enseña: la empresa, por su ruta. */
  const empresa = await api(pag, `/orgs/${ORG}/empresa`);
  assert.equal(empresa?.id, 'empresa', `la empresa ${ORG} tiene su registro`);
  const cuentas = filas(await api(pag, `/orgs/${ORG}/cuentas`));
  const movs = filas(await movimientosDe(pag));
  assert.ok(cuentas.length >= 1 && movs.length >= 1, 'hay cuentas y movimientos que cuadrar');

  const banco = cuentas.find((c) => c.tipo === 'banco') ?? cuentas[0];
  const centavos = saldoCentavos(banco, movs);
  const bien = pesos0(centavos);          // lo que la app tiene que pintar
  const mal = pesos0(centavos * 100);     // lo que pintaría si olvidara dividir
  const capital = pesos0(cuentas.reduce((s, c) => s + saldoCentavos(c, movs), 0));
  console.log(`    ${banco.nombre}: ${centavos} centavos → debe verse «${bien}» y nunca «${mal}»; capital «${capital}»`);

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
  const { cuenta } = await cuentaDePruebas(pag);

  const ajustesDe = async () =>
    filas(await movimientosDe(pag, `cuenta_id=${cuenta.id}`)).filter((m) => m.categoria === AJUSTE);
  const saldoActual = async () => saldoCentavos(cuenta, filas(await movimientosDe(pag, `cuenta_id=${cuenta.id}`)));
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
  await cuadrarLasDemas(pag);
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
  await cuadrarLasDemas(pag);
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
  /* El inicio en el teléfono (Mike, 30-sep-2026): el contenido ocupa la
   * pantalla y el balance por proyecto va en tarjetas apiladas, no en tabla. */
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  await pag.locator('[data-tarjeta="reembolsos-pendientes"]').waitFor({ timeout: 20000 });
  const anchoMain = await pag.evaluate(() => document.querySelector('main').clientWidth);
  assert.ok(anchoMain >= 300, `en el teléfono el contenido ocupa la pantalla (main mide ${anchoMain} px)`);
  const tarjetas = pag.locator('[data-balances="tarjetas"]');
  if (await tarjetas.count()) {
    assert.ok(await tarjetas.isVisible(), 'el balance por proyecto va en tarjetas apiladas');
    assert.ok(await pag.locator('table').first().isHidden(), 'y la tabla se esconde en el teléfono');
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
  const { cuenta } = await cuentaDePruebas(pag);

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

  // 0.67.0 · Mike, 5-oct: «ahí mismo en la orden aparezcan los datos
  // bancarios o de pago del proveedor». Éste se escribió a mano, así que no
  // hay cuenta de dónde, y la pantalla lo dice en vez de quedarse callada.
  assert.match(dice, /Para pagarle/i, 'la orden trae el bloque «Para pagarle» (el título va en mayúsculas por CSS)');
  assert.match(dice, /no está dado de alta en Proveedores/, 'y con un proveedor escrito a mano dice que no hay cuenta');

  // La cotización subió y se pinta.
  assert.equal(await pag.locator('img[alt="cotizacion.png"]').count(), 1, 'la cotización se ve');

  // ── pagarla ──
  await pag.getByRole('button', { name: 'Pagar', exact: true }).click();
  await pag.getByLabel('De qué cuenta sale').selectOption(cuenta.id);
  await pag.getByRole('button', { name: 'Registrar el pago' }).click();
  await pag.getByText(/Pagada\./).waitFor({ timeout: 30000 });

  // ── y el egreso quedó, por el monto exacto y una sola vez ──
  const movs = filas(await movimientosDe(pag, `cuenta_id=${cuenta.id}`));
  const suyos = movs.filter((m) => (m.descripcion || '').includes(folio));
  assert.equal(suyos.length, 1, 'un solo egreso, no dos');
  assert.equal(suyos[0].tipo, 'egreso');
  assert.equal(suyos[0].monto, 116000, 'por 116 000 centavos, que son los $1,160.00');

  // ── en Compras: por pagar arriba, pagadas abajo, y ahí está (Mike, 1-oct) ──
  await pag.goto(`${URL}/ordenes`, { waitUntil: 'load' });
  const pagadas = pag.locator('[data-seccion="pagadas"]');
  await pagadas.waitFor({ timeout: 15000 });
  await pag.waitForFunction((f) => document.querySelector('[data-seccion="pagadas"]')?.innerText.includes(f), folio, { timeout: 15000 });
  assert.match(await pagadas.innerText(), /Pagada/, 'el historial la enseña como pagada');
  const lista = await texto(pag);
  assert.ok(lista.indexOf('Por pagar') < lista.indexOf('Pagadas'), 'por pagar va arriba de pagadas');
  assert.ok(!/El buzón de lo que hay por pagar/.test(lista), 'y ya no hay que entrar a un buzón aparte');

  console.log(`    ${folio}: pedida a 390×844 con foto, pagada de ${CUENTA_PRUEBAS}, egreso de 116000 centavos`);
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

/* ═══════════════ 5a · para pagarle (0.67.0) ═══════════════
 *
 * Mike, 5-oct: «en las órdenes de compra, ahí mismo en la orden (desde dash)
 * aparezcan los datos bancarios o de pago del proveedor para hacer ese
 * pago». La compra de la demo a Maderas del Sur, que sembrar-demo deja con
 * su cuenta: la orden enseña alias, banco, la CLABE en grupos que se leen,
 * a nombre de quién, y el botón para copiarla. */
test('la orden a un proveedor dado de alta trae su cuenta para pagarle, con la CLABE legible y «Copiar»', async () => {
  const { ctx, pag, errores } = await pestana({ width: 390, height: 844 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  const buzon = await pag.evaluate(async () => (await fetch('/s101/orgs/demo/ordenes/buzon', {
    headers: { 'X-App': 'dash101' }, credentials: 'include',
  })).json());
  const oc = (buzon.data?.filas || []).find((f) => f.proveedor_nombre === 'Maderas del Sur');
  assert.ok(oc, 'hay una compra a Maderas del Sur en el buzón (si no: node scripts/sembrar-demo.mjs)');

  await pag.goto(`${URL}/ordenes/${oc.id}`, { waitUntil: 'load' });
  const bloque = pag.locator('[data-para-pagarle]');
  await bloque.waitFor({ timeout: 30000 });
  const dice = await bloque.innerText();
  assert.match(dice, /Para pagarle/i, 'el título (en mayúsculas por CSS)');
  assert.match(dice, /Maderas del Sur/, 'el proveedor');
  assert.match(dice, /Principal · Banorte/, 'la cuenta con su alias y su banco');
  assert.match(dice, /\d{3} \d{3} \d{11} \d/, 'la CLABE en grupos que se leen');
  assert.match(dice, /A nombre de Maderas del Sur SA de CV/, 'y a nombre de quién');
  assert.equal(await bloque.locator('button', { hasText: 'Copiar' }).count(), 1, 'con su botón para copiarla');
  assert.ok(!/no está dado de alta/.test(dice), 'y no dice que falta el proveedor');

  console.log(`    ${oc.folio}: «Para pagarle» con la cuenta de Maderas del Sur a 390×844`);
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

/* ═══════════════ 5b · un reembolso, de punta a punta (0.47.0) ═══════════════
 *
 * Mike, 28-sep: «que el trabajador pueda pedir reembolsos y en dash le
 * aparezcan (similar a las Órdenes de compra) (…) en el buzón (…) una pestaña
 * (…) de reembolsos pendientes (…) y debe de estar también el total de
 * reembolsos pendientes en la pantalla inicial junto con los otros totales».
 * Se camina eso: pedirlo, verlo en la tarjeta del inicio, en la pestaña del
 * buzón, pagarlo, y que el egreso salga como reembolso a la persona. */
test('pedir un reembolso, verlo en el inicio y en su pestaña del buzón, y pagarlo', async () => {
  const { ctx, pag, errores } = await pestana({ width: 390, height: 844 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  const { cuenta } = await cuentaDePruebas(pag);

  // ── pedirlo, desde la liga del botón «Pedir un reembolso» ──
  await pag.goto(`${URL}/ordenes/nueva?tipo=reembolso`, { waitUntil: 'load' });
  await pag.locator('[data-tipo="reembolso"][aria-checked="true"]').waitFor({ timeout: 15000 });
  await pag.getByLabel('Cuánto pagaste (total, con IVA si lleva)').fill('850');
  await pag.getByLabel('Qué compraste').fill('Gasolina del navegador');
  await pag.getByLabel('Con factura').uncheck();
  await pag.getByRole('button', { name: 'Pedir el reembolso' }).click();
  await pag.waitForURL((u) => /\/ordenes\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith('/nueva'), { timeout: 30000 });
  await pag.waitForTimeout(1000);
  let dice = await texto(pag);
  assert.match(dice, /RE-\d+/, 'folio de reembolso');
  assert.match(dice, /Reembolso/, 'marcado como reembolso');
  assert.match(dice, /\$850\.00/, 'en pesos');
  const folio = dice.match(/RE-\d+/)[0];
  // `URL` aquí es la dirección de la app, no el constructor: se lee a mano.
  const id = pag.url().replace(/[?#].*$/, '').split('/').pop();

  // ── el inicio lo cuenta y lo resta ──
  // La cifra se compara contra lo que dice la API, no
  // contra $850 a secas: una corrida anterior que se haya caído a la mitad
  // deja su reembolso en el buzón, y la tarjeta los suma todos (que es lo
  // correcto). Los enteros de pesos, que es como se pinta el inicio.
  const enteros = (t) => t.replace(/[^\d]/g, '');
  const resumen = await api(pag, `/orgs/${ORG}/ordenes/resumen`);
  assert.ok(resumen.reembolsos.total >= 85000, 'la API ya cuenta el reembolso');
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  const tarjeta = pag.locator('[data-tarjeta="reembolsos-pendientes"]');
  await tarjeta.waitFor({ timeout: 20000 });
  const pendientes = await tarjeta.innerText();
  assert.match(pendientes, /Reembolsos pendientes/);
  const cifra = (pendientes.match(/\$[\d,]+/) || [''])[0];
  assert.equal(enteros(cifra), String(Math.round(resumen.reembolsos.total / 100)),
    'el total de reembolsos pendientes está en el inicio, en pesos, y es el de la API');
  assert.match(await texto(pag), /− reembolsos pendientes/, 'y el capital total dice que los resta');

  // ── la pestaña del buzón ──
  await tarjeta.click();
  await pag.waitForURL((u) => u.pathname.endsWith('/ordenes/buzon'), { timeout: 20000 });
  await pag.locator('[data-pestana="reembolso"][aria-selected="true"]').waitFor({ timeout: 20000 });
  await pag.getByText(folio).first().waitFor({ timeout: 20000 });
  const total = await pag.locator('[data-total="reembolso"]').innerText();
  assert.equal(enteros(total), String(resumen.reembolsos.total), 'la pestaña suma sus reembolsos (en pesos con centavos)');
  await pag.locator('[data-pestana="compra"]').click();
  assert.ok(!(await texto(pag)).includes(folio), 'y en la de compras no está');

  // ── el menú dice «Compras», el circulito cuenta y el buzón está en el inicio (30-sep-2026) ──
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  /* El menú se pinta cuando la sesión ya cargó, no con la página: se espera
   * al botón y no se cuenta a ciegas (corrida 36774222077: 0 de 1). */
  await pag.locator('aside button[title="Compras"]').waitFor({ timeout: 20000 });
  assert.equal(await pag.locator('aside button[title="Compras"]').count(), 1, 'el menú dice «Compras» a secas');
  assert.equal(await pag.locator('aside button[title="Compras y reembolsos"]').count(), 0, 'y ya no «Compras y reembolsos»');
  const globo = pag.locator('[data-pendientes]');
  await globo.waitFor({ timeout: 20000 });
  /* Se compara contra la API en ESTE momento: lo que otras corridas dejen
   * en el buzón cuenta igual. Si no cuadra, el mensaje dice qué empresa tiene
   * la pantalla, para no adivinar. */
  const ahora = await api(pag, `/orgs/${ORG}/ordenes/resumen`);
  const cuantos = ahora.compras.cuantas + ahora.reembolsos.cuantas;
  const enPantalla = (await pag.locator('[data-empresa]').innerText()).trim();
  assert.equal(await globo.innerText(), String(cuantos),
    `el circulito de Compras cuenta las órdenes sin pagar de la empresa (pantalla: «${enPantalla}»)`);
  const seccion = pag.locator('[data-seccion="por-pagar"]');
  await seccion.waitFor({ timeout: 20000 });
  /* El inicio enseña las 8 que vencen primero. La empresa demo es una
   * (0.63.0) y carga con las compras de la siembra y lo que otras corridas
   * dejan, así que el reembolso nuevo puede quedar en el «y N más». */
  const enInicio = await seccion.innerText();
  assert.ok(enInicio.includes(folio) || /Y \d+ más en el buzón/.test(enInicio),
    'el buzón del inicio trae el reembolso por pagar, o dice que hay más en el buzón');

  // ── pagarlo, con los mismos botones ──
  await pag.goto(`${URL}/ordenes/${id}`, { waitUntil: 'load' });
  await pag.getByRole('button', { name: 'Pagar', exact: true }).click();
  await pag.getByLabel('De qué cuenta sale').selectOption(cuenta.id);
  await pag.getByRole('button', { name: 'Registrar el pago' }).click();
  await pag.getByText(/Pagada\./).waitFor({ timeout: 30000 });

  const movs = filas(await movimientosDe(pag, `cuenta_id=${cuenta.id}`));
  const suyos = movs.filter((m) => (m.descripcion || '').includes(folio));
  assert.equal(suyos.length, 1, 'un solo egreso');
  assert.equal(suyos[0].tipo, 'egreso', 'es salida de dinero');
  assert.equal(suyos[0].categoria, 'reembolso', 'registrado como reembolso, no como compra');
  assert.equal(suyos[0].monto, 85000);

  // ── pagada, sale del buzón del inicio y el movimiento lleva a su orden ──
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  await pag.locator('[data-tarjeta="reembolsos-pendientes"]').waitFor({ timeout: 20000 });
  const seccionDespues = pag.locator('[data-seccion="por-pagar"]');
  if (await seccionDespues.count()) assert.ok(!(await seccionDespues.innerText()).includes(folio), 'pagada, ya no está en el buzón del inicio');
  await pag.goto(`${URL}/movimientos`, { waitUntil: 'load' });
  const liga = pag.locator(`[data-orden-de="${suyos[0].id}"]`);
  await liga.waitFor({ timeout: 20000 });
  await liga.click();
  await pag.waitForURL((u) => u.pathname.endsWith(`/ordenes/${id}`), { timeout: 20000 });
  // La orden se pide al llegar: se espera a que diga «Pagada», no se lee el «Cargando…» (corrida 36777167927).
  await pag.getByText(/Pagada/).first().waitFor({ timeout: 20000 });
  assert.match(await texto(pag), /Pagada/, 'desde el movimiento se llega a la orden, ya pagada, con su historia');

  const despues = await api(pag, `/orgs/${ORG}/ordenes/resumen`);
  assert.equal(resumen.reembolsos.total - despues.reembolsos.total, 85000, 'pagado, ya no está pendiente');
  // Lo que otras corridas hayan dejado en el buzón se paga
  // aquí, para que el siguiente recorrido arranque limpio.
  const sobrantes = filas(await api(pag, `/orgs/${ORG}/ordenes/buzon?tipo=reembolso`));
  for (const o of sobrantes) await api(pag, `/orgs/${ORG}/ordenes/${o.id}/pagar`, { method: 'POST', body: { cuenta_id: cuenta.id } });
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  await tarjeta.waitFor({ timeout: 20000 });
  assert.match(await tarjeta.innerText(), /\$0\b/, 'con todo pagado, el inicio dice cero');

  console.log(`    ${folio}: pedido, visto en el inicio y en su pestaña, pagado como reembolso (${sobrantes.length} sobrantes pagados)`);
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

/* ═══════════════ accionistas: alta y retiro desde el celular ═══════════════ */

test('accionistas a 390×844: se da de alta uno, se le registra un retiro, y queda como egreso con su categoría', async () => {
  const { ctx, pag, errores } = await pestana({ width: 390, height: 844 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  const { cuenta } = await cuentaDePruebas(pag);

  const nombre = `Socio del navegador ${Date.now().toString(36)}`;
  await pag.goto(`${URL}/accionistas`, { waitUntil: 'load' });
  await pag.getByRole('button', { name: 'Nuevo accionista' }).waitFor({ timeout: 30000 });
  await pag.getByRole('button', { name: 'Nuevo accionista' }).click();
  await pag.getByPlaceholder('Nombre completo').fill(nombre);
  await pag.getByLabel('Participación %').fill('25');
  await pag.getByRole('button', { name: 'Dar de alta', exact: true }).click();
  const tarjeta = pag.locator(`[data-accionista="${nombre}"]`);
  await tarjeta.waitFor({ timeout: 30000 });
  assert.match(await tarjeta.innerText(), /25% de participación/, 'la tarjeta enseña la participación');
  assert.equal(await tarjeta.getAttribute('data-baja'), null, 'y está activo');

  // El retiro: $1,234.50 de la caja de pruebas.
  await tarjeta.getByRole('button', { name: 'Registrar retiro' }).click();
  await tarjeta.getByLabel('Monto').fill('1234.5');
  await tarjeta.getByLabel('De qué cuenta sale').selectOption(cuenta.id);
  await tarjeta.getByLabel('Concepto').fill('Retiro del navegador');
  await tarjeta.getByRole('button', { name: 'Registrar el retiro' }).click();
  await pag.waitForFunction(([n]) => document.querySelector(`[data-accionista="${n}"] [data-retirado]`)?.getAttribute('data-retirado') === '1234.5', [nombre], { timeout: 30000 });
  assert.match(await tarjeta.innerText(), /\$1,234\.50/, 'el retirado en pesos, con centavos');
  const lista = await pag.locator('[data-retiros]').innerText();
  assert.ok(lista.includes(nombre) && /−\$1,234\.50/.test(lista) && lista.includes('Retiro del navegador'), 'el retiro sale en la lista de abajo con su concepto');

  // Y en la API es un egreso con la categoría y la contraparte que lo apartan.
  const movs = filas(await movimientosDe(pag, `cuenta_id=${cuenta.id}`));
  const retiro = movs.find((m) => m.contraparte_nombre === nombre);
  assert.ok(retiro, 'el movimiento existe');
  assert.equal(retiro.tipo, 'egreso');
  assert.equal(retiro.monto, 123450, 'en centavos');
  assert.equal(retiro.categoria, 'retiro_utilidades');
  assert.equal(retiro.contraparte_tipo, 'accionista');
  assert.equal(retiro.descripcion, 'Retiro del navegador');

  const m = await pag.evaluate(() => ({ ancho: document.documentElement.scrollWidth, ventana: window.innerWidth }));
  assert.ok(m.ancho <= m.ventana, `sin barrido horizontal a 390: ${m.ancho} ≤ ${m.ventana}`);

  // Se da de baja y no desaparece: queda en «dados de baja» con lo retirado.
  await tarjeta.getByRole('button', { name: `Dar de baja a ${nombre}` }).click();
  await pag.getByRole('button', { name: /dado de baja|dados de baja/ }).waitFor({ timeout: 30000 });
  await pag.getByRole('button', { name: /dado de baja|dados de baja/ }).click();
  const baja = pag.locator(`[data-accionista="${nombre}"][data-baja]`);
  await baja.waitFor({ timeout: 30000 });
  assert.match(await baja.innerText(), /\$1,234\.50/, 'lo retirado sigue en su renglón');

  console.log(`    ${nombre}: alta a 390×844, retiro de 123450 centavos de ${CUENTA_PRUEBAS}, baja sin perder el retirado`);
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

test('se da de alta un cliente desde «nuevo proyecto», y avisa del parecido', async () => {
  const { ctx, pag, errores } = await pestana({ width: 1280, height: 900 }, true);
  // Primero la página: `api()` habla por `/s101`, que es relativo, y sin una
  // página abierta no hay contra qué resolverlo.
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });

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
    // `.first()`: la empresa demo junta lo de antes (0.63.0) y puede traer
    // dos clientes con este nombre; con uno basta para medir el aviso.
    await pag.getByRole('button', { name: new RegExp(`Usar ${CLIENTE_PRUEBAS}`) }).first().click();
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

/* Mike, 4-oct-2026: «en caso de querer generar un nuevo cliente con el email
 * de otro que ya existe, avisar que ya existe un cliente, presentar su info y
 * preguntar si es ese cliente el que estás buscando y ya usarlo». Aquí, con
 * la pantalla enfrente: se intenta dar de alta otro cliente con el correo de
 * uno que ya está, sale el aviso con su nombre, y «Sí, usar» lo escoge. */
test('un cliente nuevo con el correo de otro que ya existe: avisa, enseña quién es, y «Sí, usar» lo escoge', async () => {
  const { ctx, pag, errores } = await pestana({ width: 1280, height: 900 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  // Un cliente con correo, por la API, para que haya con quién chocar.
  const correo = `dueno-${Date.now().toString(36)}@ejemplo.mx`;
  const dueno = await api(pag, `/orgs/${ORG}/clientes`, { method: 'POST', body: { nombre: 'Dueño del correo', correo, telefono: '5512345678' } });

  await pag.goto(`${URL}/proyectos/nuevo`, { waitUntil: 'load' });
  await pag.getByLabel('Cliente').waitFor({ timeout: 20000 });
  await pag.waitForTimeout(1000);
  await pag.getByLabel('Cliente').selectOption('__nuevo__');
  await pag.getByPlaceholder('Nombre o razón social').fill('Otro nombre cualquiera');
  await pag.getByPlaceholder('Correo (opcional)').fill(correo.toUpperCase());
  await pag.getByRole('button', { name: 'Guardar cliente' }).click();

  const aviso = pag.locator('[data-con-ese-correo]');
  await aviso.waitFor({ timeout: 15000 });
  assert.match(await aviso.innerText(), /Ya hay un cliente con el correo/, 'avisa que el correo ya es de alguien');
  assert.match(await aviso.innerText(), /Dueño del correo/, 'y dice quién es');
  assert.match(await aviso.innerText(), /5512345678/, 'con su teléfono');
  await pag.getByRole('button', { name: /Sí, usar Dueño del correo/ }).click();
  await pag.waitForTimeout(1500);
  assert.equal(await pag.getByLabel('Cliente').inputValue(), dueno.id, 'quedó escogido el que ya existía, sin crear otro');

  const lista = await api(pag, `/orgs/${ORG}/clientes`);
  assert.equal(lista.filas.filter((f) => f.correo === correo).length, 1, 'y sigue habiendo uno solo con ese correo');
  try { await api(pag, `/orgs/${ORG}/clientes/${dueno.id}/borrar`, { method: 'POST', body: { modo: 'borrar' } }); } catch { /* se queda en la demo; no estorba */ }
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

  // Un proyecto propio de esta prueba, con su cliente, para no tocar nada de
  // los demás recorridos.
  let cliente = filas(await api(pag, `/orgs/${ORG}/clientes`))
    .find((c) => c.nombre === CLIENTE_PRUEBAS);
  if (!cliente) {
    cliente = await api(pag, `/orgs/${ORG}/clientes`, {
      method: 'POST', body: { nombre: CLIENTE_PRUEBAS },
    });
  }
  const proyecto = await api(pag, `/orgs/${ORG}/proyectos`, {
    method: 'POST',
    body: { nombre: `Ítems ${Date.now().toString(36).slice(-5)}`, cliente_id: cliente.id, estado: 'activo' },
  });
  for (const [nombre, monto] of [['Cocina', 100_00], ['Clóset', 200_00], ['Isla', 50_00]]) {
    await api(pag, `/orgs/${ORG}/items`, {
      method: 'POST',
      body: { nombre, monto, cantidad: 1, estado: 'vendido', proyecto_id: proyecto.id, cliente_id: cliente.id },
    });
  }

  await pag.goto(`${URL}/proyectos/${proyecto.id}`, { waitUntil: 'load' });
  await pag.getByText('Ítems del proyecto').first().waitFor({ timeout: 20000 });

  // Mike, 6-oct: picar el ⓘ de un ítem abre el panel de la obra. Este
  // proyecto no tiene obra en quell101, así que el panel lo dice con
  // palabras en vez de quedarse en blanco; y Escape lo cierra.
  await pag.locator('[data-ver-item]').first().click();
  await pag.locator('[data-panel-item]').waitFor({ timeout: 10000 });
  await pag.getByText(/ningún plano/).waitFor({ timeout: 15000 });
  assert.match(await pag.locator('[data-panel-item]').innerText(), /El ítem en la obra/, 'el panel se abre desde la lista del proyecto');
  await pag.keyboard.press('Escape');
  assert.equal(await pag.locator('[data-panel-item]').count(), 0, 'y Escape lo cierra');
  // También picando el nombre.
  await pag.locator('[data-abrir-item]').first().click();
  await pag.locator('[data-panel-item]').waitFor({ timeout: 10000 });
  await pag.locator('[data-panel-item] button[aria-label="Cerrar"]').click();
  assert.equal(await pag.locator('[data-panel-item]').count(), 0, 'y la ✕ también');

  await pag.getByRole('button', { name: /Editar la lista/ }).first().click();

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
   * esta prueba lo cachó y por eso ahora se pinta en la vista.
   *
   * Desde el 20-sep son DOS botones: «Editar el proyecto» arriba, para los
   * datos de la obra, y «Editar la lista» abajo, junto a acomodar y
   * agrupar. Lo pidió Mike con la pantalla enfrente. Por eso aquí se abre
   * con uno y se espera al otro. */
  await pag.getByRole('button', { name: /Editar el proyecto/ }).first().waitFor({ timeout: 30000 });
  await pag.getByText('Cambios guardados').waitFor({ timeout: 10000 });
  await pag.waitForTimeout(1000);

  // Y ahora lo que importa: lo que quedó GUARDADO, leído de la API.
  const quedaron = filas(await api(pag, `/orgs/${ORG}/items?proyecto_id=${proyecto.id}`))
    .filter((i) => i.estado === 'vendido')
    .map((i) => i.nombre)
    .sort();
  assert.deepEqual(quedaron, ['Cocina grande', 'Isla'], 'quedó LO QUE SE VE: ni el borrado ni copias');

  const p = await api(pag, `/orgs/${ORG}/proyectos/${proyecto.id}`);
  assert.equal(p.precio_venta, 150_00, 'y el precio de venta es la suma de los que quedaron');

  // Guardar otra vez sin tocar nada tampoco duplica.
  await pag.getByRole('button', { name: /Editar la lista/ }).first().click();
  await pag.getByRole('button', { name: /Guardar cambios/ }).click();
  await pag.getByRole('button', { name: /Editar el proyecto/ }).first().waitFor({ timeout: 30000 });
  await pag.waitForTimeout(1000);
  const otraVez = filas(await api(pag, `/orgs/${ORG}/items?proyecto_id=${proyecto.id}`))
    .filter((i) => i.estado === 'vendido');
  assert.equal(otraVez.length, 2, 'guardar dos veces seguidas no agrega nada');

  console.log(`    ítems tras editar y borrar: ${quedaron.join(', ')} · precio ${pesos2(p.precio_venta)}`);
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

test('la cantidad: 20 puertas a $1,500 son $30,000 de línea, no $600,000', async () => {
  const { ctx, pag, errores } = await pestana({ width: 1280, height: 900 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });

  let cliente = filas(await api(pag, `/orgs/${ORG}/clientes`))
    .find((c) => c.nombre === CLIENTE_PRUEBAS);
  if (!cliente) {
    cliente = await api(pag, `/orgs/${ORG}/clientes`, { method: 'POST', body: { nombre: CLIENTE_PRUEBAS } });
  }
  const proyecto = await api(pag, `/orgs/${ORG}/proyectos`, {
    method: 'POST',
    body: { nombre: `Cantidad ${Date.now().toString(36).slice(-5)}`, cliente_id: cliente.id, estado: 'activo' },
  });
  /* Mike, 2-oct (con botones): dash101 no genera ítems. La puerta entra por
   * la API —como lo haría quote101— y aquí sólo se le cambia la cantidad y
   * el precio por pieza. Y se mide que el «Agregar» de antes ya no está. */
  await api(pag, `/orgs/${ORG}/items`, {
    method: 'POST',
    body: { nombre: 'Puerta de clóset', monto: 1500_00, cantidad: 1, estado: 'vendido', proyecto_id: proyecto.id, cliente_id: cliente.id },
  });

  await pag.goto(`${URL}/proyectos/${proyecto.id}`, { waitUntil: 'load' });
  await pag.getByText('Ítems del proyecto').first().waitFor({ timeout: 20000 });
  await pag.getByRole('button', { name: /Editar la lista/ }).first().click();
  await pag.locator('input[placeholder^="Ítem ("]').first().waitFor({ timeout: 15000 });
  assert.equal(await pag.getByRole('button', { name: 'Agregar' }).count(), 0, 'ya no hay «Agregar»: dash101 no genera ítems');

  await pag.getByLabel('Cantidad').first().fill('20');
  await pag.getByLabel('Precio por pieza').first().fill('1500');

  await pag.getByRole('button', { name: /Guardar cambios/ }).click();
  await pag.getByRole('button', { name: /Editar el proyecto/ }).first().waitFor({ timeout: 30000 });
  await pag.waitForTimeout(1000);

  const item = filas(await api(pag, `/orgs/${ORG}/items?proyecto_id=${proyecto.id}`))
    .filter((i) => i.estado === 'vendido')[0];
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

test('el estado de cuenta del proyecto: la lista suma el subtotal y el IVA se desglosa', async () => {
  /* Encargo de Mike del 21-sep: «necesito poder exportar un estado de cuenta
   * en pdf y un excel con lo siguiente de cada proyecto: saldo general,
   * lista de productos en proyecto, subtotal, IVA y total de proyecto
   * completo, movimientos de proyecto (pagos), fecha del día que se genera».
   *
   * Este papel se le manda a un cliente, así que lo que se mide es que los
   * números que se VEN cuadren: la suma de la lista contra el subtotal, y
   * el subtotal más el IVA contra el total. Un documento que no cuadra lo
   * descubre quien lo recibe. */
  const { ctx, pag, errores } = await pestana({ width: 1280, height: 900 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });

  let cliente = filas(await api(pag, `/orgs/${ORG}/clientes`))
    .find((c) => c.nombre === CLIENTE_PRUEBAS);
  if (!cliente) {
    cliente = await api(pag, `/orgs/${ORG}/clientes`, { method: 'POST', body: { nombre: CLIENTE_PRUEBAS } });
  }
  const proyecto = await api(pag, `/orgs/${ORG}/proyectos`, {
    method: 'POST',
    body: { nombre: `Estado ${Date.now().toString(36).slice(-5)}`, cliente_id: cliente.id, estado: 'activo' },
  });
  await api(pag, `/orgs/${ORG}/items`, {
    method: 'POST',
    body: {
      cliente_id: cliente.id, proyecto_id: proyecto.id,
      nombre: 'Puerta del estado', monto: 30_000_00, cantidad: 2, estado: 'vendido', tipo: 'mueble',
    },
  });
  // En la cuenta de pruebas, no en la primera de la lista: desde que la
  // empresa demo es una sola (1-oct), la primera es «Banco Demo», la de la
  // siembra, y cada corrida le dejaba movimientos.
  const { cuenta } = await cuentaDePruebas(pag);
  await api(pag, `/orgs/${ORG}/movimientos`, {
    method: 'POST',
    body: {
      tipo: 'ingreso', monto: 10_000_00, fecha: '2026-03-01',
      cuenta_id: cuenta.id, proyecto_id: proyecto.id,
      contraparte_tipo: 'cliente', contraparte_id: cliente.id, descripcion: 'Anticipo del estado',
    },
  });

  // Se llega por donde llega Mike: el botón del proyecto, no la dirección.
  await pag.goto(`${URL}/proyectos/${proyecto.id}`, { waitUntil: 'load' });
  await pag.getByRole('link', { name: /Estado de cuenta/ }).first().click();
  await pag.getByRole('heading', { name: 'Estado de cuenta' }).waitFor({ timeout: 30000 });
  await pag.getByText('Lo que lleva la obra').first().waitFor({ timeout: 20000 });

  /* CON CENTAVOS, y es parte de lo que se mide: el resto de dash101 pinta
   * el dinero redondeado a pesos enteros, y aquí no se puede. Con «IVA
   * incluido» el subtotal casi nunca es redondo, y sin centavos la columna
   * que suma el cliente no da el total de abajo. */
  const dice = await texto(pag);
  assert.ok(dice.includes(pesos2(30_000_00)), `el subtotal sale con centavos: ${pesos2(30_000_00)}`);
  assert.ok(dice.includes(pesos2(4_800_00)), `y el IVA al 16%: ${pesos2(4_800_00)}`);
  assert.ok(dice.includes(pesos2(34_800_00)), `y el total: ${pesos2(34_800_00)}`);
  assert.ok(dice.includes(pesos2(10_000_00)), 'el pago aparece');
  assert.ok(dice.includes(pesos2(24_800_00)), 'y el saldo es contra el total con IVA');
  assert.ok(/Generado el/.test(dice), 'trae la fecha del día que se genera');
  assert.ok(/IVA 16%/.test(dice), 'dice la tasa con la que se hizo la cuenta');

  /* Las dos salidas que pidió.
   *
   * El PDF lo hace el navegador —abrir el diálogo de imprimir del sistema no
   * se puede medir desde aquí—, así que de ése se comprueba que el botón
   * esté.
   *
   * El Excel es una LIGA y no un botón: el archivo lo arma la API y el
   * navegador lo baja solo. Eso importa para la prueba y no es un detalle:
   * un `<a href>` tiene rol de liga, y buscarlo como botón lo deja sin
   * encontrar. Así se cayó el despliegue #56, con la descarga esperando un
   * clic que nunca ocurrió. */
  await pag.getByRole('button', { name: /Guardar como PDF/ }).waitFor({ timeout: 10000 });
  const liga = pag.getByRole('link', { name: /Bajar Excel/ });
  await liga.waitFor({ timeout: 10000 });
  assert.ok(/\/estado\.xlsx$/.test(await liga.getAttribute('href')), 'la liga apunta a la ruta de la API');
  const bajada = pag.waitForEvent('download', { timeout: 30000 });
  await liga.click();
  const archivo = await bajada;
  assert.ok(/\.xlsx$/.test(archivo.suggestedFilename()), `el Excel se baja: ${archivo.suggestedFilename()}`);
  /* Y que traiga algo: un ZIP vacío también se «baja». */
  const { size } = await stat(await archivo.path());
  assert.ok(size > 500, `y el archivo trae contenido: ${size} bytes`);

  console.log(`    ${pesos2(30_000_00)} + ${pesos2(4_800_00)} = ${pesos2(34_800_00)}, saldo ${pesos2(24_800_00)}`);
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

test('6-oct: el flujo proyectado se presenta por bloques —semana, quincena, mes, trimestre, semestre, año— y cada bloque abre lo que tiene planeado; la nómina se programa desde Nómina', async () => {
  /* Mike, 6-oct: «en la proyección de flujos necesito que haya opción para
   * presentar por bloques de tiempo (…) Quiero ver todos los gastos y los
   * cobros que están planeados para esa semana. Hay que ver en nómina el
   * programar la nómina para que también se considere en los gastos».
   *
   * SÓLO SE LEE: la demo no se toca. Lo que se afirma se calcula igual que
   * la app: los OPEX activos salen de la API; el número de bloques de un
   * año es fijo (13 meses porque el bloque de hoy y el de hoy + 12 meses
   * entran los dos; 2 años; 25 quincenas), y la cuenta que dice cada
   * renglón tiene que ser la de los renglones que abre. */
  const { ctx, pag, errores } = await pestana(undefined, true);
  await pag.goto(`${URL}/flujo`, { waitUntil: 'load' });
  await pag.locator('[data-bloque]').waitFor({ timeout: 20000 });

  const opex = filas(await api(pag, `/orgs/${ORG}/opex`)).filter((o) => o.activo);
  assert.ok(opex.length > 0, 'la demo trae OPEX activos: sin eso la pantalla no proyecta nada');
  assert.match(await pag.locator('[data-fuentes]').innerText(), new RegExp(`${opex.length} OPEX activo`), 'la nota dice cuántos OPEX entran');

  const cuantos = async (bloque, esperados) => {
    await pag.locator('[data-bloque]').selectOption(bloque);
    await pag.waitForFunction((n) => document.querySelectorAll('[data-fila-bloque]').length === n, esperados, { timeout: 10000 });
  };
  await cuantos('mes', 13);
  assert.match(await texto(pag), /por mes · 1 año/, 'el encabezado dice el bloque y el horizonte');
  await cuantos('anio', 2);
  await cuantos('quincena', 25);
  await cuantos('trimestre', 5);
  await cuantos('semestre', 3);
  await cuantos('semana', 53);

  /* El horizonte también cambia: a 3 meses por mes son 4 bloques. */
  await pag.locator('[data-horizonte]').selectOption('3');
  await cuantos('mes', 4);

  /* Un bloque con algo planeado se abre y enseña exactamente lo que dijo. */
  const boton = pag.locator('[data-abrir-bloque]:not([disabled])').first();
  await boton.waitFor({ timeout: 5000 });
  const dice = (await boton.innerText()).match(/· (\d+)$/);
  assert.ok(dice, `el renglón dice cuántas cosas trae: ${await boton.innerText()}`);
  assert.equal(await pag.locator('[data-planeado]').count(), 0, 'cerrado, no enseña nada');
  await boton.click();
  await pag.locator('[data-planeado]').first().waitFor({ timeout: 5000 });
  assert.equal(await pag.locator('[data-planeado]').count(), Number(dice[1]), 'abierto, enseña tantos como dijo');
  assert.match(await pag.locator('[data-planeado]').first().innerText(), /OPEX|Nómina|Orden/, 'y cada uno dice de qué clase es');
  await boton.click();
  await pag.waitForFunction(() => document.querySelectorAll('[data-planeado]').length === 0, null, { timeout: 5000 });

  /* Lo escogido se recuerda al volver. */
  await pag.goto(`${URL}/flujo`, { waitUntil: 'load' });
  await pag.locator('[data-bloque]').waitFor({ timeout: 20000 });
  assert.equal(await pag.locator('[data-bloque]').inputValue(), 'mes');
  assert.equal(await pag.locator('[data-horizonte]').inputValue(), '3');

  /* La nómina programada vive en Nómina, con el permiso de la raya: si la
   * API cierra la puerta, ni la tarjeta ni la nota la ofrecen; si la abre,
   * la tarjeta está y el formulario se abre (y NO se guarda: es la demo). */
  const puerta = await pag.evaluate(async () => (await fetch('/s101/orgs/demo/nomina/programa', { headers: { 'X-App': 'dash101' } })).status);
  await pag.goto(`${URL}/nomina`, { waitUntil: 'load' });
  if (puerta === 403) {
    await pag.getByText('Esto lo lleva alguien más').waitFor({ timeout: 20000 });
    assert.equal(await pag.locator('[data-nomina-programada]').count(), 0, 'sin permiso no hay tarjeta');
  } else {
    assert.equal(puerta, 200, 'la puerta de la nómina programada contesta');
    await pag.locator('[data-nomina-programada]').waitFor({ timeout: 20000 });
    if (await pag.locator('[data-editar-programa]').count()) await pag.locator('[data-editar-programa]').click();
    await pag.locator('[data-programa-monto]').waitFor({ timeout: 5000 });
    await pag.locator('[data-programa-frecuencia]').selectOption('quincenal');
    assert.equal(await pag.locator('[data-programa-dia]').count(), 0, 'la quincenal no pide día');
    await pag.locator('[data-programa-frecuencia]').selectOption('semanal');
    assert.equal(await pag.locator('[data-programa-dia]').count(), 1, 'la semanal sí');
  }

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

  // En la cuenta de pruebas, no en la primera de la lista: desde que la
  // empresa demo es una sola (1-oct), la primera es «Banco Demo», la de la
  // siembra, y cada corrida le dejaba movimientos.
  const { cuenta } = await cuentaDePruebas(pag);
  assert.ok(cuenta, 'la demo tiene al menos una cuenta');

  let cliente = filas(await api(pag, `/orgs/${ORG}/clientes`))
    .find((c) => c.nombre === CLIENTE_PRUEBAS);
  if (!cliente) {
    cliente = await api(pag, `/orgs/${ORG}/clientes`, { method: 'POST', body: { nombre: CLIENTE_PRUEBAS } });
  }
  const proyecto = await api(pag, `/orgs/${ORG}/proyectos`, {
    method: 'POST',
    body: { nombre: `Cobro ${Date.now().toString(36).slice(-5)}`, cliente_id: cliente.id, estado: 'activo' },
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

  /* Un ingreso arranca fiscal y con la factura pendiente, que es lo que casi
     siempre pasa. Desde el 21-sep eso son DOS marcadores y no uno —Mike:
     «son 2 pasos: uno que indica si ese monto es facturado, y eso activa
     otro que dice si ya se facturó»—, así que se revisan los dos: que lleve
     factura, y que todavía no se haya expedido. */
  const lleva = pag.getByRole('button', { name: 'Sí, lleva factura' });
  await lleva.waitFor({ timeout: 20000 });
  assert.equal(await lleva.getAttribute('aria-pressed'), 'true',
    'un ingreso arranca como fiscal: se le desglosa IVA');
  const todaviaNo = pag.getByRole('button', { name: 'Todavía no' });
  await todaviaNo.waitFor({ timeout: 20000 });
  assert.equal(await todaviaNo.getAttribute('aria-pressed'), 'true',
    'y con la factura pendiente, no dada por hecha');

  await pag.getByRole('button', { name: /^Registrar ingreso$/ }).click();
  await pag.waitForURL(/\/movimientos(\?|$)/, { timeout: 30000 });

  const pend = filas(await api(pag, `/orgs/${ORG}/fiscal/pendientes?tipo=ingreso`));
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

  // En la cuenta de pruebas, no en la primera de la lista: desde que la
  // empresa demo es una sola (1-oct), la primera es «Banco Demo», la de la
  // siembra, y cada corrida le dejaba movimientos.
  const { cuenta } = await cuentaDePruebas(pag);
  let cliente = filas(await api(pag, `/orgs/${ORG}/clientes`))
    .find((c) => c.nombre === CLIENTE_PRUEBAS);
  if (!cliente) {
    cliente = await api(pag, `/orgs/${ORG}/clientes`, { method: 'POST', body: { nombre: CLIENTE_PRUEBAS } });
  }

  // Un cobro capturado con un cero de más, que es el error de verdad.
  const mov = await api(pag, `/orgs/${ORG}/movimientos`, {
    method: 'POST',
    body: {
      tipo: 'ingreso', monto: 90_000_00, fecha: '2026-03-18',
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

  // En la cuenta de pruebas, no en la primera de la lista: desde que la
  // empresa demo es una sola (1-oct), la primera es «Banco Demo», la de la
  // siembra, y cada corrida le dejaba movimientos.
  const { cuenta } = await cuentaDePruebas(pag);
  const mov = await api(pag, `/orgs/${ORG}/movimientos`, {
    method: 'POST',
    body: {
      tipo: 'egreso', monto: 4_500_00, fecha: '2026-03-24',
      cuenta_id: cuenta.id, contraparte_tipo: 'otro', contraparte_id: null,
      contraparte_nombre: 'Caseta', descripcion: 'Sin proveedor',
    },
  });

  await pag.goto(`${URL}/movimientos/${mov.id}/editar`, { waitUntil: 'load' });
  const campoMonto = pag.locator('input[type="number"]').first();
  await campoMonto.waitFor({ timeout: 25000 });

  /* El botón SÍ se apaga un instante: mientras cargan los catálogos de la
   * empresa. Eso está bien y es corto. Lo que no puede pasar —el defecto de
   * Mike— es que se quede apagado para siempre porque falta un dato.
   *
   * Así que no se mira una vez: se espera a que encienda, y si no enciende
   * se dice QUÉ QUEDÓ EN PANTALLA. La primera versión de esta prueba miraba
   * al instante y salía roja con el arreglo puesto, que es la peor clase de
   * prueba: una que dice que no sirve algo que sí sirve. */
  const boton = pag.getByRole('button', { name: /^Guardar cambios$/ });
  let encendio = false;
  for (let i = 0; i < 80 && !encendio; i++) {
    encendio = !(await boton.isDisabled());
    if (!encendio) await pag.waitForTimeout(250);
  }
  if (!encendio) {
    const enPantalla = (await texto(pag)).replace(/\s+/g, ' ').slice(0, 400);
    assert.fail(`el botón de guardar se quedó apagado. La pantalla decía: ${enPantalla}`);
  }

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

test('agrupar dos renglones en un producto: NO se borra ninguno y se pueden mover de grupo', async () => {
  /* Mike, 20-sep: «son varias puertas iguales en diferente ubicación pero
   * el producto es el mismo, y no tiene caso tener 21 ítems idénticos
   * enlistados en dash». Y esa misma tarde: «debe poder moverse de grupo de
   * producto un ítem ya agrupado. Todos los ítems deberían tener un
   * dropdown para seleccionar qué producto es».
   *
   * Este paso decía «queda uno de dos piezas»: era cierto mientras agrupar
   * FUSIONABA. Ya no borra renglones —un renglón borrado no se puede mover
   * de grupo—, así que mide lo de ahora.
   *
   * Lo que alcanza y ninguna prueba de API ve: que el botón exista, que la
   * propuesta se pinte, que después de agrupar la lista enseñe UN renglón
   * de producto que se abre, y que cada pieza traiga su dropdown. Se espera
   * por condición, nunca por instante: esta pantalla se arma en partes y
   * una aserción a destiempo acusa a código que sí sirve. */
  const { ctx, pag, errores } = await pestana();
  await entrar(pag, CORREO);

  const cliente = filas(await api(pag, `/orgs/${ORG}/clientes`)).find((c) => c.nombre === CLIENTE_PRUEBAS)
    ?? await api(pag, `/orgs/${ORG}/clientes`, { method: 'POST', body: { nombre: CLIENTE_PRUEBAS } });
  const proyecto = await api(pag, `/orgs/${ORG}/proyectos`, {
    method: 'POST',
    body: { nombre: `Agrupar ${Date.now().toString(36).slice(-5)}`, cliente_id: cliente.id, estado: 'activo' },
  });
  for (let i = 0; i < 2; i++) {
    await api(pag, `/orgs/${ORG}/items`, {
      method: 'POST',
      body: { nombre: 'Puerta igualita', monto: 3_000_00, cantidad: 1, estado: 'vendido',
              proyecto_id: proyecto.id, cliente_id: cliente.id },
    });
  }
  const antes = (await api(pag, `/orgs/${ORG}/proyectos/${proyecto.id}`)).precio_venta;

  await pag.goto(`${URL}/proyectos/${proyecto.id}`, { waitUntil: 'load' });
  /* Si no aparece, se dice QUÉ había en pantalla. Sin eso, un timeout aquí
   * acusa a la pantalla sin decir de qué se murió —la lección del 20-sep—. */
  try {
    await pag.getByText('Ítems del proyecto').first().waitFor({ timeout: 30000 });
  } catch {
    assert.fail(`no cargó el proyecto. La pantalla decía: ${(await texto(pag)).replace(/\s+/g, ' ').slice(0, 400)}`);
  }

  /* Antes de agrupar, cada ítem ya trae su dropdown: los dos son su propio
   * producto único y cada uno puede escoger al otro.
   *
   * SE ESPERA POR CONDICIÓN. La primera versión de esto preguntaba
   * `isVisible()` en el instante en que aparecía «Ítems del proyecto», y se
   * cayó en la puerta de despliegue: el dropdown se pinta con una SEGUNDA
   * llamada —la de las opciones— que todavía no había vuelto, y mientras no
   * hay opciones el control no se dibuja, a propósito. O sea que acusó a
   * código que sí sirve, que es justo contra lo que avisa el comentario de
   * arriba en este mismo archivo.
   *
   * Y se busca la OPCIÓN, no el `<select>`: un `<option>` dentro de un
   * select cerrado no cuenta como visible para Playwright, así que se espera
   * a que esté `attached`. Es la manera directa de decir «existe el
   * dropdown y trae la opción de salirse del grupo».
   *
   * EL SELECTOR VIVE DETRÁS DEL «+». Mike lo pidió así el 20-sep: «oculta la
   * descripción en la lista, sólo que se abra con un signo de más; la info
   * que se despliega con + es: descripción, pagado, selector de qué producto
   * es». Así que primero se abre el detalle del renglón y luego se busca. La
   * versión anterior de este paso lo buscaba en la lista y se cayó en la
   * puerta: la prueba seguía donde el control ya no estaba. */
  const masDelItem = pag.getByRole('button', { name: /Ver el detalle de Puerta igualita/ }).first();
  await masDelItem.waitFor({ timeout: 20000 });
  await masDelItem.click();
  try {
    await pag
      .locator('select option', { hasText: 'Es su propio producto' })
      .first()
      .waitFor({ state: 'attached', timeout: 20000 });
  } catch {
    assert.fail(`no salió el dropdown de producto. La pantalla decía: ${(await texto(pag)).replace(/\s+/g, ' ').slice(0, 400)}`);
  }

  await pag.getByRole('button', { name: /Agrupar en productos/ }).click();
  /* La lista es de TODOS los ítems y nace sin nada marcado —Mike, 20-sep:
     «la lista debe ser de todos los ítems, sean o no similares; todo está
     en gestionar los ítems ya existentes»—, así que primero se marcan. */
  const marcar = pag.getByRole('button', { name: /^Marcar todos$/ });
  await marcar.waitFor({ timeout: 20000 });
  await marcar.click();
  const juntar = pag.getByRole('button', { name: /^Agrupar 2$/ });
  await juntar.waitFor({ timeout: 20000 });
  await juntar.click();

  /* Se espera a que la lista de verdad diga lo que tiene que decir, en vez
   * de mirar la pantalla en un instante cualquiera. */
  let quedaron = [];
  for (let i = 0; i < 40; i++) {
    quedaron = filas(await api(pag, `/orgs/${ORG}/items?proyecto_id=${proyecto.id}`)).filter((x) => x.estado === 'vendido');
    if (quedaron.length === 2 && quedaron.every((x) => x.producto_id)) break;
    await pag.waitForTimeout(500);
  }
  assert.equal(quedaron.length, 2, 'los DOS renglones siguen ahí: agrupar ya no borra');
  assert.ok(quedaron.every((x) => x.cantidad === 1), 'cada uno sigue siendo una pieza');
  assert.equal(new Set(quedaron.map((x) => x.producto_id)).size, 1, 'y los dos apuntan al mismo producto');

  const p = await api(pag, `/orgs/${ORG}/proyectos/${proyecto.id}`);
  assert.equal(p.precio_venta, antes, 'agruparlos al mismo precio no cambia lo que se cobra');

  /* Y en la pantalla queda UN renglón de producto que se abre. Es el
   * encargo original: no tener 21 puertas idénticas enlistadas. */
  const abrir = pag.getByRole('button', { name: /toca para ver cada pieza/ });
  await abrir.first().waitFor({ timeout: 20000 });
  await abrir.first().click();
  await pag.getByText('Puerta igualita').first().waitFor({ timeout: 10000 });

  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

test('el archivo de la factura: se escoge y se ve antes de guardar', async () => {
  /* Mike, 20-sep: «quiero poder arrastrar los archivos para subirlos. Y que
   * me muestre un preview del archivo abajo».
   *
   * Aquí se mide el camino que un navegador automatizado puede recorrer de
   * verdad: escoger el archivo y ver que la pantalla lo reconoce y lo pinta.
   * Arrastrar es el mismo `input` por debajo —el área es su etiqueta—, así
   * que si esto pasa, el otro camino entrega el mismo archivo. */
  const { ctx, pag, errores } = await pestana();
  await entrar(pag, CORREO);

  const cta = filas(await api(pag, `/orgs/${ORG}/cuentas`))
    .find((c) => c.nombre === CUENTA_PRUEBAS)
    ?? await api(pag, `/orgs/${ORG}/cuentas`, { method: 'POST', body: { nombre: CUENTA_PRUEBAS, tipo: 'banco' } });
  const mov = await api(pag, `/orgs/${ORG}/movimientos`, {
    method: 'POST',
    body: { tipo: 'egreso', monto: 1_160_00, fecha: '2026-09-16',
            cuenta_id: cta.id, descripcion: 'Con factura por colgar' },
  });

  await pag.goto(`${URL}/movimientos/${mov.id}/editar`, { waitUntil: 'load' });
  try {
    await pag.getByRole('button', { name: 'Sí, lleva factura' }).waitFor({ timeout: 30000 });
  } catch {
    assert.fail(`no cargó la pantalla de editar. Decía: ${(await texto(pag)).replace(/\s+/g, ' ').slice(0, 300)}`);
  }

  /* NO se marca «ya se expidió» antes de colgar el archivo, y eso es parte
     de lo que se mide: el comprobante se cuelga del MOVIMIENTO, no de la
     factura. Hasta el 21-sep el control vivía dentro del bloque del CFDI y
     había que decir que ya se había facturado —que es mentira— para poder
     adjuntar una ficha de transferencia. Mike lo reportó y por eso salió de
     ahí; si alguien lo regresa, este paso se cae. */
  const entrada = pag.locator('#archivo-factura');
  await entrada.waitFor({ state: 'attached', timeout: 15000 });
  await entrada.setInputFiles({
    name: 'factura-de-prueba.xml',
    mimeType: '',   // como llega arrastrado desde el explorador: sin tipo
    buffer: Buffer.from('<?xml version="1.0"?>\n<Comprobante Total="1160.00"/>', 'utf8'),
  });

  /* Lo que importa: que la pantalla lo haya tomado —a pesar de venir sin
   * tipo— y que enseñe qué se va a colgar. */
  await pag.getByText('factura-de-prueba.xml', { exact: false }).first().waitFor({ timeout: 15000 });
  const dice = await texto(pag);
  assert.ok(/Comprobante|1160/.test(dice), `la vista previa enseña el contenido; decía: ${dice.replace(/\s+/g, ' ').slice(0, 300)}`);

  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

/* ═══════════════ 6b · las partidas como pestañas de un libro ═══════════════
 *
 * Mike, 29-sep: «dividir por partidas (grupos de cotizaciones) los ítems. Ir
 * poniendo nuevos grupos de ítems que se van autorizando (…) pestañas, tipo
 * los libros de Excel. Como si fueran folders.»
 *
 * Las pestañas existían desde el 20-sep pero sólo salían con más de una
 * partida, y como todo caía en «Sin partida», nadie las veía. Se camina lo
 * que él pidió: la barra a la vista, «+» para abrir una pestaña, mover un
 * ítem a ella, renombrarla, y capturar un ítem nuevo directo en ella. */

test('las partidas son pestañas: se crea una con «+», se mueve un ítem, se renombra y se captura en ella', async () => {
  const { ctx, pag, errores } = await pestana({ width: 1280, height: 900 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  let cliente = filas(await api(pag, `/orgs/${ORG}/clientes`)).find((c) => c.nombre === CLIENTE_PRUEBAS);
  if (!cliente) cliente = await api(pag, `/orgs/${ORG}/clientes`, { method: 'POST', body: { nombre: CLIENTE_PRUEBAS } });
  const proyecto = await api(pag, `/orgs/${ORG}/proyectos`, {
    method: 'POST',
    body: { nombre: `Partidas ${Date.now().toString(36).slice(-5)}`, cliente_id: cliente.id, estado: 'activo' },
  });
  const ids = {};
  for (const [nombre, monto] of [['Cocina', 100_00], ['Clóset', 200_00], ['Isla', 50_00]]) {
    const it = await api(pag, `/orgs/${ORG}/items`, {
      method: 'POST',
      body: { nombre, monto, cantidad: 1, estado: 'vendido', proyecto_id: proyecto.id, cliente_id: cliente.id },
    });
    ids[nombre] = it.id;
  }
  const partidaDe = async (nombre) => (filas(await api(pag, `/orgs/${ORG}/items?proyecto_id=${proyecto.id}`)).find((i) => i.nombre === nombre)?.partida ?? '');

  await pag.goto(`${URL}/proyectos/${proyecto.id}`, { waitUntil: 'load' });
  await pag.getByText('Ítems del proyecto').first().waitFor({ timeout: 20000 });

  // 1 · La barra está a la vista aunque todo esté en «Sin partida».
  const barra = pag.getByRole('tablist', { name: 'Partidas' });
  await barra.waitFor({ timeout: 15000 });
  assert.ok(await pag.getByRole('tab', { name: /^Todas \(3\)/ }).isVisible(), 'con «Todas» y sus tres ítems');

  // 2 · «+» abre una pestaña nueva, vacía, y la deja seleccionada.
  await pag.locator('[data-nueva-partida]').click();
  await pag.getByLabel('Nombre de la partida nueva').fill('Etapa 2');
  await pag.locator('[data-crear-partida]').click();
  const etapa2 = pag.getByRole('tab', { name: /^Etapa 2 \(0\)/ });
  await etapa2.waitFor({ timeout: 5000 });
  assert.equal(await etapa2.getAttribute('aria-selected'), 'true', 'la pestaña nueva queda abierta');
  assert.ok(await pag.locator('[data-partida-abierta="Etapa 2"]').isVisible(), 'con su botón de renombrar');

  // 3 · Mover un ítem a la pestaña, desde su «+».
  await pag.getByRole('tab', { name: /^Todas/ }).click();
  await pag.getByRole('button', { name: 'Ver el detalle de Isla' }).click();
  await pag.locator(`[data-partida-de="${ids.Isla}"]`).selectOption('Etapa 2');
  await pag.getByRole('tab', { name: /^Etapa 2 \(1\)/ }).waitFor({ timeout: 15000 });
  assert.equal(await partidaDe('Isla'), 'Etapa 2', 'quedó GUARDADO en el ítem');
  assert.equal(await partidaDe('Cocina'), '', 'y los demás no se movieron');

  // 4 · Renombrarla: sus ítems cambian de partida.
  await pag.getByRole('tab', { name: /^Etapa 2 \(1\)/ }).click();
  await pag.locator('[data-renombrar-partida]').click();
  await pag.getByLabel('Nombre nuevo de la partida').fill('Etapa dos');
  await pag.locator('[data-guardar-nombre]').click();
  await pag.getByRole('tab', { name: /^Etapa dos \(1\)/ }).waitFor({ timeout: 15000 });
  assert.equal(await partidaDe('Isla'), 'Etapa dos', 'el nombre nuevo llegó al ítem');
  assert.equal(await pag.getByRole('tab', { name: /^Etapa 2/ }).count(), 0, 'y la vieja ya no está');

  // 5 · Hasta el 2-oct aquí había «Ítem en esta partida». Mike decidió (con
  //     botones) que dash101 no genera ítems: el botón ya no está, y lo que
  //     sí se mide es que guardar la lista no le borre la partida a nadie.
  assert.equal(await pag.locator('[data-nuevo-item-en-partida]').count(), 0, 'ya no hay «Ítem en esta partida»');
  await pag.getByRole('button', { name: /Editar la lista/ }).first().click();
  const renglones = pag.locator('input[placeholder^="Ítem ("]');
  await renglones.first().waitFor({ timeout: 15000 });
  assert.equal(await renglones.count(), 3, 'los tres que hay, y ninguno de más');
  await pag.getByRole('button', { name: /Guardar cambios/ }).click();
  await pag.getByRole('button', { name: /Editar el proyecto/ }).first().waitFor({ timeout: 30000 });
  await pag.waitForTimeout(1000);
  assert.equal(await partidaDe('Isla'), 'Etapa dos', 'guardar la lista no le borró la partida a nadie');
  await pag.getByRole('tab', { name: /^Etapa dos \(1\)/ }).waitFor({ timeout: 15000 });

  console.log(`    partidas: Etapa 2 → Etapa dos, con Isla movida; sin alta de ítems desde dash101`);
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

/* ═══════════════ 7 · el otro sentido de la puerta, al final ═══════════════ */

/* ═══════════════ 1-oct: el saldo de la base, la cuenta, el cliente y los gastos generales ═══════════════ */

test('1-oct: el líquido es el saldo que suma la API; la cuenta abre con su historial, el último arriba; un gasto general no lleva proyecto', async () => {
  /* Mike, 1-oct: «ya hay movimientos por más de 70,000 de egresos y el total
   * sigue sin contarlos» (el tope de 500 dejaba fuera lo de hoy), «cuando me
   * meto a una cuenta, quiero ver el historial de los movimientos de esa
   * cuenta», «el que esté hasta arriba es el último que se hizo» y «debe
   * haber un concepto de gastos generales en el tipo de egreso». */
  const { ctx, pag, errores } = await pestana({ width: 1280, height: 900 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  const { cuenta } = await cuentaDePruebas(pag);

  // ── un gasto general, de hoy, por la API: sin proyecto y con su categoría ──
  const hoy = new Date().toISOString().slice(0, 10);
  const gasto = await api(pag, `/orgs/${ORG}/movimientos`, {
    method: 'POST',
    body: {
      tipo: 'egreso', monto: 7_000_00, fecha: hoy, cuenta_id: cuenta.id,
      contraparte_tipo: 'otro', categoria: 'gasto_general', descripcion: 'Renta del taller (navegador)',
    },
  });
  assert.equal(gasto.proyecto_id ?? null, null, 'sin proyecto');

  // ── el líquido del inicio es la suma de `saldo` que manda la API (0.60.0), no una lista con tope ──
  const cuentas = filas(await api(pag, `/orgs/${ORG}/cuentas`));
  const mia = cuentas.find((c) => c.id === cuenta.id);
  assert.equal(typeof mia.saldo, 'number', 'la API manda el saldo de la cuenta (contrato 0.60.0)');
  const liquido = cuentas.reduce((t, c) => t + c.saldo, 0);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  const hero = pag.locator('[data-capital="liquido"]');
  await hero.waitFor({ timeout: 30000 });
  await pag.waitForFunction((e) => document.querySelector('[data-capital="liquido"]')?.innerText.includes(e), pesos0(liquido), { timeout: 30000 })
    .catch(async () => assert.fail(`el líquido debía ser ${pesos0(liquido)} y la pantalla dice: ${(await hero.innerText()).replace(/\s+/g, ' ').slice(0, 200)}`));

  // ── la cuenta abre con su historial, y el de hoy está hasta arriba ──
  await pag.goto(`${URL}/cuentas/${cuenta.id}`, { waitUntil: 'load' });
  const historial = pag.locator('[data-movimientos-cuenta]');
  await historial.waitFor({ timeout: 30000 });
  await pag.locator('[data-mov]').first().waitFor({ timeout: 30000 });
  const primero = await pag.locator('[data-mov]').first().getAttribute('data-mov');
  assert.equal(primero, gasto.id, 'el último capturado queda hasta arriba de la cuenta');
  const porApi = filas(await movimientosDe(pag, `cuenta_id=${cuenta.id}`))
    .sort((a, b) => (b.fecha > a.fecha ? 1 : b.fecha < a.fecha ? -1 : b.creado_at > a.creado_at ? 1 : -1));
  assert.equal(porApi[0].id, gasto.id, 'y es el mismo que la API dice que es el más reciente');
  assert.ok((await historial.innerText()).includes('Renta del taller (navegador)'), 'con su concepto');
  assert.equal(await pag.locator('[data-seccion="editar"]').count(), 0, 'el formulario de la cuenta NO está a la vista al entrar');
  await pag.locator('[data-editar]').click();
  await pag.locator('[data-seccion="editar"] #saldo-inicial').waitFor({ timeout: 10000 });
  assert.equal(await pag.locator('#saldo-inicial').inputValue(), String(cuenta.saldo_inicial / 100), 'y al pedirlo, trae el saldo inicial');

  // ── en la lista general, con su marca, y el filtro «Gastos generales» lo aísla ──
  await pag.goto(`${URL}/movimientos`, { waitUntil: 'load' });
  const marca = pag.locator(`[data-orden-de="${gasto.id}"], [data-gasto-general]`).first();
  await marca.waitFor({ timeout: 30000 });
  await pag.getByRole('button', { name: 'Gastos generales' }).click();
  await pag.waitForFunction(() => document.body.innerText.includes('Renta del taller (navegador)'), null, { timeout: 20000 });
  assert.ok((await texto(pag)).includes('Renta del taller (navegador)'), 'el filtro lo enseña');

  // ── al corregirlo, la marca viene puesta y el proyecto no se ofrece ──
  await pag.goto(`${URL}/movimientos/${gasto.id}/editar`, { waitUntil: 'load' });
  const casilla = pag.locator('#gasto-general');
  await casilla.waitFor({ timeout: 25000 });
  assert.equal(await casilla.isChecked(), true, 'la marca de gasto general viene puesta');
  /* Se mira el campo, no el texto «Proyecto»: en esa pantalla hay más de
   * un texto que empieza así (corrida 36905113064: 1 !== 0). */
  assert.equal(await pag.locator('[data-campo="proyecto"]').count(), 0, 'y no se pide proyecto');
  await casilla.uncheck();
  await pag.locator('[data-campo="proyecto"]').waitFor({ timeout: 10000 });
  await casilla.check();
  await pag.getByRole('button', { name: /^Guardar cambios$/ }).click();
  await pag.waitForURL(/\/movimientos(\?|$)/, { timeout: 30000 });
  const d = await api(pag, `/orgs/${ORG}/movimientos/${gasto.id}`);
  assert.equal(d.categoria, 'gasto_general', 'sigue siendo gasto general');
  assert.equal(d.proyecto_id ?? null, null, 'y sigue sin proyecto');

  console.log(`    gasto general de ${pesos2(7_000_00)} en ${CUENTA_PRUEBAS}, líquido ${pesos0(liquido)}`);
  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

test('1-oct: la pantalla del cliente abre con su estado de cuenta, con PDF, Excel y «por proyecto»; los datos se editan sólo al pedirlo', async () => {
  /* Mike, 1-oct: «no debo poder editar luego luego sus datos, sino ver su
   * estado de cuenta completo… y debo poder exportar su estado de cuenta
   * general y por proyecto». */
  const { ctx, pag, errores } = await pestana({ width: 1280, height: 900 }, true);
  await pag.goto(`${URL}/dashboard`, { waitUntil: 'load' });
  let cliente = filas(await api(pag, `/orgs/${ORG}/clientes`)).find((c) => c.nombre === CLIENTE_PRUEBAS);
  if (!cliente) cliente = await api(pag, `/orgs/${ORG}/clientes`, { method: 'POST', body: { nombre: CLIENTE_PRUEBAS } });

  await pag.goto(`${URL}/clientes/${cliente.id}`, { waitUntil: 'load' });
  const estado = pag.locator('[data-seccion="estado"]');
  await estado.waitFor({ timeout: 30000 });
  await pag.waitForFunction((n) => document.querySelector('[data-seccion="estado"]')?.innerText.includes(n), cliente.nombre, { timeout: 30000 });
  assert.equal(await pag.locator('[data-seccion="editar"]').count(), 0, 'el formulario NO está a la vista al entrar');
  assert.equal(await pag.getByRole('button', { name: 'Guardar como PDF' }).count(), 1, 'el PDF del general');
  const excel = pag.locator('[data-excel-cliente]');
  assert.ok((await excel.getAttribute('href')).endsWith(`/clientes/${cliente.id}/estado.xlsx`), 'el Excel del general lo arma la API');
  const estadoApi = await api(pag, `/orgs/${ORG}/clientes/${cliente.id}/estado-de-cuenta`);
  assert.equal(await pag.locator('[data-estado-proyecto]').count(), estadoApi.proyectos.filter((p) => p.precio_venta !== 0 || p.cobrado !== 0).length, 'cada proyecto con movimiento lleva a su propio estado de cuenta');

  await pag.locator('[data-editar]').click();
  const editar = pag.locator('[data-seccion="editar"]');
  await editar.waitFor({ timeout: 10000 });
  assert.equal(await pag.locator('#cliente-nombre').inputValue(), cliente.nombre, 'y al pedirlo, el formulario trae sus datos');

  assert.deepEqual(errores, [], 'cero errores de JavaScript');
  await ctx.close();
});

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
