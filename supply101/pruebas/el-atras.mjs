/* El «atrás» del navegador en supply101.
 *
 * Mike, 22-sep-2026: «en todas las apps, cuando picas el botón de back en el
 * navegador te saca hasta la página anterior (…). Queremos que cuando picas
 * back te regrese a la función anterior».
 *
 * Aquí las direcciones ya llevaban `#`, así que el «atrás» a secas más o
 * menos servía. Lo que no servía era esto:
 *
 *   · «← Mis compras» ESCRIBÍA una entrada nueva en vez de retroceder, así
 *     que el siguiente «atrás» reabría la pantalla recién cerrada;
 *   · al mandar una compra, la orden se apilaba encima del formulario, así
 *     que «atrás» devolvía el formulario LLENO de una compra ya pedida.
 *     Ahí no se pierde la ruta: se pide dos veces lo mismo, y eso sale caro.
 *
 * POR QUÉ SE MIDE CONTRA UN HISTORIAL DE MENTIRAS
 *
 * El recorrido en navegador de esta app corre contra staging, que desde el
 * chat no se alcanza. Pero lo delicado no es el navegador: es la CUENTA de
 * entradas. Un `pushState` de más obliga a picar atrás dos veces y uno de
 * menos saca de la app; las dos se ven igual de bien en la pantalla.
 *
 *   node supply101/pruebas/el-atras.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const AQUI = fileURLToPath(new URL('../', import.meta.url));

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};

function navegadorFalso(hashInicial = '#/') {
  const pila = [{ estado: null, hash: hashInicial }];
  let i = 0;
  const oyentes = [];
  const avisa = () => oyentes.slice().forEach((f) => f());
  const history = {
    get state() { return pila[i].estado; },
    pushState(estado, _t, url) { pila.splice(i + 1); pila.push({ estado, hash: url ?? pila[i].hash }); i = pila.length - 1; },
    replaceState(estado, _t, url) { pila[i] = { estado, hash: url ?? pila[i].hash }; },
    go(n) { const j = Math.min(pila.length - 1, Math.max(0, i + n)); if (j !== i) { i = j; avisa(); } },
    back() { history.go(-1); },
  };
  return {
    history,
    window: { addEventListener: (q, f) => { if (q === 'hashchange') oyentes.push(f); }, dispatchEvent: avisa },
    hash: () => pila[i].hash,
    // Retroceder NO acorta la pila —la entrada de adelante sigue ahí, para
    // poder dar «adelante»—, así que para saber si volvimos al mismo sitio
    // hay que mirar la POSICIÓN, no el largo.
    posicion: () => i,
    largo: () => pila.length,
  };
}

/** Enciende el módulo y un enrutador de mentiras con las mismas honduras que
 *  la app: lista 1, pedir y una orden 2, corregir 3. */
async function app(hashInicial = '#/') {
  const g = navegadorFalso(hashInicial);
  globalThis.history = g.history;
  globalThis.window = g.window;
  globalThis.HashChangeEvent = class { constructor(t) { this.type = t; } };
  // El módulo guarda la raíz de la visita, así que cada recorrido necesita
  // una copia limpia.
  const m = await import(`../publico/navegar.js?${Math.random()}`);
  const HONDURA = { lista: 1, pedir: 2, orden: 2, corregir: 3 };
  const visto = [];
  const enrutar = () => {
    const h = g.hash();
    const mc = /^#\/corregir\/(.+)$/.exec(h);
    if (mc) { m.sellar(HONDURA.corregir); visto.push('corregir'); return; }
    if (/^#\/orden\/(.+)$/.test(h)) { m.sellar(HONDURA.orden); visto.push('orden'); return; }
    if (h === '#/pedir') { m.sellar(HONDURA.pedir); visto.push('pedir'); return; }
    m.sellar(HONDURA.lista); visto.push('lista');
  };
  g.window.addEventListener('hashchange', enrutar);
  enrutar();                                    // la primera llegada
  return { g, m, HONDURA, visto, donde: () => visto[visto.length - 1] };
}

{
  console.log('· pedir una compra y regresar con «atrás»');
  const { g, m, HONDURA, donde } = await app();
  const enLista = g.posicion();
  m.irA('/pedir', HONDURA.pedir);
  rev(donde() === 'pedir' && g.hash() === '#/pedir', 'se abre el formulario');
  rev(g.posicion() === enLista + 1, 'y deja una entrada', `${g.posicion()} vs ${enLista}`);
  g.history.back();
  rev(donde() === 'lista', 'atrás regresa a mis compras, no saca de la app');
  rev(g.posicion() === enLista, 'y queda parado donde estaba', `${g.posicion()} vs ${enLista}`);
}

{
  console.log('· «← Mis compras» hace lo mismo que atrás, no algo parecido');
  const { g, m, HONDURA, donde } = await app();
  m.irA('/pedir', HONDURA.pedir);
  const conFormulario = g.posicion();
  m.irA('/', HONDURA.lista);
  rev(donde() === 'lista', 'el botón regresa a la lista');
  rev(g.posicion() === conFormulario - 1, 'retrocediendo, no apilando', `${g.posicion()} vs ${conFormulario}`);
  /* Si hubiera apilado, este «atrás» reabriría el formulario que se acaba de
   * cerrar y parecería que la app se devolvió sola. */
  g.history.back();
  rev(donde() !== 'pedir', 'y el siguiente atrás no reabre el formulario', `fue a ${donde()}`);
}

{
  console.log('· mandar la compra NO deja el formulario esperando atrás');
  /* Éste es el que cuesta dinero: con el formulario apilado, un «atrás»
   * después de mandar lo devolvía lleno de una compra YA PEDIDA, lista para
   * mandarse otra vez. */
  const { g, m, HONDURA, donde } = await app();
  const enLista = g.posicion();
  m.irA('/pedir', HONDURA.pedir);
  m.irA('/orden/OC-7', HONDURA.orden);          // se mandó
  rev(donde() === 'orden' && g.hash() === '#/orden/OC-7', 'se abre la orden recién pedida');
  rev(g.posicion() === enLista + 1, 'reemplazando el formulario, no apilándose encima', `${g.posicion()} vs ${enLista}`);
  g.history.back();
  rev(donde() === 'lista', 'atrás lleva a mis compras, no al formulario', `fue a ${donde()}`);
}

{
  console.log('· corregir una orden devuelta: tres clicks de hondo');
  const { g, m, HONDURA, donde } = await app();
  const enLista = g.posicion();
  g.history.pushState({}, '', '#/orden/OC-9');  // picar el renglón es una liga
  g.window.dispatchEvent();
  rev(donde() === 'orden', 'se abre la orden desde la lista');
  m.irA('/corregir/OC-9', HONDURA.corregir);
  rev(donde() === 'corregir' && g.hash() === '#/corregir/OC-9', 'y de ahí a corregirla');
  rev(g.posicion() === enLista + 2, 'son dos entradas, una por click', `${g.posicion()} vs ${enLista}`);
  g.history.back();
  rev(donde() === 'orden', 'atrás regresa a la orden, no hasta la lista', `fue a ${donde()}`);
}

{
  console.log('· «← Mis compras» desde una corrección va hasta la lista, no a medio camino');
  /* El botón dice a dónde va. Un solo `history.back()` lo dejaría en la
   * orden, que no es «mis compras». */
  const { g, m, HONDURA, donde } = await app();
  const enLista = g.posicion();
  g.history.pushState({}, '', '#/orden/OC-9');
  g.window.dispatchEvent();
  m.irA('/corregir/OC-9', HONDURA.corregir);
  m.irA('/', HONDURA.lista);
  rev(donde() === 'lista', 'llega a mis compras de un botonazo', `fue a ${donde()}`);
  rev(g.posicion() === enLista, 'retrocediendo los dos pasos, sin apilar', `${g.posicion()} vs ${enLista}`);
}

{
  console.log('· mandar la corrección regresa a la orden, no apila otra');
  const { g, m, HONDURA, donde } = await app();
  g.history.pushState({}, '', '#/orden/OC-9');
  g.window.dispatchEvent();
  const enOrden = g.posicion();
  m.irA('/corregir/OC-9', HONDURA.corregir);
  m.irA('/orden/OC-9', HONDURA.orden);          // se mandó la corrección
  rev(donde() === 'orden', 'se vuelve a ver la orden');
  rev(g.posicion() === enOrden, 'en la entrada que ya había, no en una nueva', `${g.posicion()} vs ${enOrden}`);
}

{
  console.log('· quien llega de fuera directo a «#/pedir» no se sale de supply101');
  /* quell101 y quote101 pueden mandar a alguien directo al formulario. Esa
   * persona no tiene «Mis compras» atrás —atrás está la otra app—, así que
   * el botón no puede retroceder: tiene que enseñar la lista. */
  const { g, m, HONDURA, donde } = await app('#/pedir');
  rev(donde() === 'pedir', 'cae en el formulario');
  const alLlegar = g.posicion();
  m.irA('/', HONDURA.lista);
  rev(donde() === 'lista', '«← Mis compras» le enseña sus compras', `fue a ${donde()}`);
  rev(g.posicion() === alLlegar, 'sin retroceder a la app de donde venía', `${g.posicion()} vs ${alLlegar}`);
  rev(g.largo() === 1, 'y sin apilar una entrada de más', `${g.largo()} entradas`);
}

console.log('· la pantalla está cableada a esto');
const app_js = readFileSync(AQUI + 'publico/app.js', 'utf8');
const html = readFileSync(AQUI + 'publico/index.html', 'utf8');
rev(/import \{ irA, sellar \} from '\.\/navegar\.js'/.test(app_js), 'la app usa el módulo');
rev(/<script type="module" src="app\.js">/.test(html), 'y el HTML lo carga como módulo');
rev(!/location\.hash = '#\/pedir'/.test(app_js) && !/location\.hash = '#\/'/.test(app_js),
    'ya nadie escribe la dirección a mano para navegar');
rev(/irA\(`\/orden\/\$\{orden\.id\}`, HONDURA\.orden\)/.test(app_js), 'mandar la compra va a la orden por el módulo');
rev(/irA\(`\/corregir\/\$\{o\.id\}`, HONDURA\.corregir\)/.test(app_js), 'corregir es una dirección propia');
rev(/sellar\(HONDURA\.orden\)/.test(app_js) && /sellar\(HONDURA\.lista\)/.test(app_js),
    'y el enrutador sella la hondura de cada llegada');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
