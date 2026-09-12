/* Mide el Worker de dash101 ya publicado en Cloudflare.
 *
 * El chat que escribe el código no alcanza *.workers.dev: el proxy de salida
 * se lo rechaza. El corredor de GitHub sí. Por eso esto corre allá y lo que
 * mide vuelve por el comentario del commit, que es lo único que el chat puede
 * leer (OPERAR.md §6).
 *
 * Lo que se mide, y por qué cada cosa:
 *
 *   la portada y las fuentes   que OpenNext dejó los archivos donde van. Si
 *                              una .woff2 se cae, la app abre igual y sólo se
 *                              nota porque cambió la letra.
 *   una ruta [id] inventada    que el Worker sirve las rutas con id. Esto es
 *                              exactamente lo que se habría roto si dash101
 *                              se hubiera publicado como sitio estático: las
 *                              siete rutas [id] habrían dado 404.
 *   /s101/salud                que el enlace de servicio llega a la API, y a
 *                              LA QUE TOCA: staging con staging, producción
 *                              con producción. Un enlace cruzado sería un
 *                              sitio de prueba escribiendo en la empresa real.
 *   la cabecera X-App          sólo en staging, porque hay que entrar. El
 *                              Worker la pone; el navegador nunca la manda.
 *                              Se mide mandando una basura a propósito: si la
 *                              respuesta sigue siendo buena, es que el Worker
 *                              la sobrescribió.
 *   las cifras de la demo      cuántos negocios y cuántas cuentas contesta la
 *                              API a través del Worker. No es una prueba de
 *                              cuadre —eso lo hacen las pruebas de vitest—,
 *                              es la señal de que el camino entero jala.
 *
 * En producción NO se entra y NO se escribe nada: se mira lo que cualquiera
 * puede mirar sin sesión. Ahí vive el dinero de clientes reales.
 */

const PROD = process.env.PROD;
const STAGING = process.env.STAGING;
const CORREO = process.env.CORREO_SUPERADMIN || 'mike@forespot.com';
// La empresa es distinta en cada entorno: `demo` en staging, la de verdad en
// producción. En producción sólo se usa para pedir sin sesión y comprobar que
// contesta la API y no Next: no se entra, no se lee nada y no se escribe nada.
const ORG_STAGING = process.env.ORG_STAGING || 'demo';
const ORG_PROD = process.env.ORG_PROD || 'forespot';

const FUENTES = [
  '/fonts/fira-cifras-400.woff2',
  '/fonts/fira-cifras-600.woff2',
  '/fonts/raleway-400.woff2',
  '/fonts/raleway-700.woff2',
  '/fonts/sansation-700.woff2',
];

let fallas = 0;
let revisadas = 0;
const linea = (t) => console.log(t);

function rev(ok, texto, extra = '') {
  revisadas++;
  if (!ok) fallas++;
  linea(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
}

/** Una petición cualquiera. Guarda la galleta como lo haría un navegador. */
async function traer(base, ruta, { method = 'GET', body, cabeceras = {}, galleta } = {}) {
  const t0 = Date.now();
  const h = { ...cabeceras };
  if (body) h['Content-Type'] = 'application/json';
  if (galleta) h.Cookie = galleta;
  const r = await fetch(`${base}${ruta}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch { /* HTML, no JSON */ }
  return {
    estado: r.status,
    ms: Date.now() - t0,
    tipo: r.headers.get('content-type') || '',
    puesta: r.headers.get('set-cookie') || '',
    texto,
    cuerpo,
  };
}

/** Lo que cualquiera ve sin sesión. Se mide igual en los dos entornos. */
async function laCascara(base, quien) {
  linea('');
  linea(`== ${quien} ==  ${base}`);

  const portada = await traer(base, '/');
  rev(portada.estado === 200, 'la portada contesta', `${portada.estado} en ${portada.ms} ms`);
  rev(portada.texto.includes('Conta Master'), 'la portada trae la marca');

  for (const f of FUENTES) {
    const r = await traer(base, f);
    rev(r.estado === 200 && r.tipo.includes('font'), `la fuente ${f.split('/').pop()}`, `${r.estado} ${r.tipo}`);
  }

  // Una ruta con id que no existe en ninguna base: lo que importa es que el
  // Worker la sirva (200), no lo que diga la pantalla después.
  const conId = await traer(base, '/proyectos/no-existe-a-proposito');
  rev(conId.estado === 200, 'una ruta [id] se sirve (esto es lo que un sitio estático no podía)', `${conId.estado}`);
}

/** El enlace de servicio a la API, por debajo, sin salir a internet. */
async function elEnlace(base, entornoEsperado, quien) {
  const salud = await traer(base, '/s101/salud');
  const d = salud.cuerpo || {};
  rev(salud.estado === 200, `${quien}: /s101/salud contesta`, `${salud.estado} en ${salud.ms} ms`);
  rev(
    d.entorno === entornoEsperado,
    `${quien}: el enlace va a la API de ${entornoEsperado}`,
    `contestó «${d.entorno}»`,
  );
  linea(`       contrato ${d.contrato}  ·  versión ${d.version}  ·  D1 ${d.d1}`);

  const raiz = await traer(base, '/s101');
  rev(raiz.cuerpo?.servicio === 'suite101-api', `${quien}: /s101 a secas cae en la raíz de la API`, `${raiz.estado}`);
  return d;
}

/* ─────────────── producción: mirar, no tocar ─────────────── */

async function produccion() {
  await laCascara(PROD, 'Producción');
  await elEnlace(PROD, 'produccion', 'producción');

  // Sin galleta la API contesta 401 y no filtra nada. Que conteste JSON de la
  // API (y no el HTML de Next) es la prueba de que /s101/* no lo atiende Next.
  const sinSesion = await traer(PROD, `/s101/orgs/${ORG_PROD}/cuentas`);
  rev(
    sinSesion.estado === 401 && sinSesion.cuerpo?.error === 'sin_sesion',
    'producción: sin sesión, la API contesta 401 y no Next',
    `${sinSesion.estado} ${sinSesion.cuerpo?.error ?? sinSesion.tipo}`,
  );
}

/* ─────────────── staging: el recorrido completo ─────────────── */

async function staging() {
  await laCascara(STAGING, 'Staging');
  await elEnlace(STAGING, 'staging', 'staging');

  // Entrar por el propio Worker: la galleta tiene que quedar en el origen de
  // dash101, no en el de la API. Eso es lo que compra el proxy /s101.
  let galleta = '';
  let entro = false;
  for (let i = 0; i < 4 && !entro; i++) {
    const pide = await traer(STAGING, '/s101/auth/codigo', { method: 'POST', body: { correo: CORREO } });
    const codigo = pide.cuerpo?.codigo_prueba;
    if (!codigo) {
      rev(false, 'staging devuelve codigo_prueba', `${pide.estado} ${pide.cuerpo?.error ?? ''}`);
      return;
    }
    const entra = await traer(STAGING, '/s101/auth/entrar', { method: 'POST', body: { correo: CORREO, codigo } });
    if (entra.estado === 200) {
      galleta = entra.puesta.split(';')[0];
      entro = true;
      rev(entra.puesta.includes('s101='), 'la galleta de sesión se pone en el origen de dash101', entra.puesta.split(';')[0].slice(0, 12) + '…');
    } else if (i === 3) {
      rev(false, 'entrar por /s101/auth/entrar', `${entra.estado} ${entra.cuerpo?.error ?? ''}`);
      return;
    } else {
      // Otra corrida pidió otro código para el mismo correo entre medias.
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }

  const yo = await traer(STAGING, '/s101/yo', { galleta });
  rev(yo.cuerpo?.usuario?.correo === CORREO, '/s101/yo reconoce la sesión', yo.cuerpo?.usuario?.correo ?? `${yo.estado}`);

  // El Worker pone X-App: dash101. Se le manda una basura a propósito: si la
  // pusiera el navegador, la API contestaría 400 app_desconocida.
  const conBasura = await traer(STAGING, `/s101/orgs/${ORG_STAGING}/negocios`, { galleta, cabeceras: { 'X-App': 'basura-a-proposito' } });
  rev(
    conBasura.estado === 200,
    'el Worker sobrescribe X-App: dash101 (se mandó basura y contestó bien)',
    `${conBasura.estado} ${conBasura.cuerpo?.error ?? ''}`,
  );

  const negocios = await traer(STAGING, `/s101/orgs/${ORG_STAGING}/negocios`, { galleta });
  const cuentas = await traer(STAGING, `/s101/orgs/${ORG_STAGING}/cuentas`, { galleta });
  const n = negocios.cuerpo?.filas?.length ?? negocios.cuerpo?.length;
  const c = cuentas.cuerpo?.filas?.length ?? cuentas.cuerpo?.length;
  rev(typeof n === 'number' && n > 0, `la org ${ORG_STAGING} contesta negocios por el Worker`, `${n} negocios`);
  rev(typeof c === 'number' && c > 0, `la org ${ORG_STAGING} contesta cuentas por el Worker`, `${c} cuentas`);
}

/* ─────────────── ─────────────── */

const t0 = Date.now();
linea(`dash101 como Worker — medido el ${new Date().toISOString()}`);
if (!PROD && !STAGING) {
  linea('No hay nada que medir: faltan PROD y STAGING en el ambiente.');
  process.exit(1);
}
try {
  // Se mide lo que haya. El flujo mide STAGING primero y sólo publica
  // producción si eso salió bien; entonces PROD llega vacío en esa vuelta.
  if (PROD) await produccion();
  if (STAGING) await staging();
} catch (e) {
  fallas++;
  linea(`\nSe cayó la medición: ${e?.stack || e}`);
}
linea('');
linea(`${revisadas} revisadas · ${fallas} fallas · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fallas === 0 ? 0 : 1);
