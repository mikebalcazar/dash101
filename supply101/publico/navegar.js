/* El botón «atrás» del navegador, que hasta hoy devolvía a la pantalla
 * anterior en vez de a la función anterior.
 *
 * Mike, 22-sep-2026: «en todas las apps, cuando picas el botón de back en el
 * navegador te saca hasta la página anterior (…). Queremos que cuando picas
 * back te regrese a la función anterior».
 *
 * Aquí las direcciones ya llevaban `#`, así que el «atrás» a secas no estaba
 * tan mal. Lo que estaba mal eran otras dos cosas:
 *
 *   · «← Mis compras» ESCRIBÍA una entrada nueva en vez de retroceder, así
 *     que el siguiente «atrás» reabría la pantalla que se acababa de cerrar
 *     y parecía que la app se devolvía sola;
 *   · al mandar una compra, la pantalla de la orden se apilaba encima del
 *     formulario, así que un «atrás» regresaba al formulario lleno de una
 *     compra YA PEDIDA. Ahí no se pierde la ruta: se pide dos veces lo
 *     mismo.
 *
 * LA IDEA, QUE ES LA MISMA EN TODAS LAS APPS DE LA SUITE
 *
 * Cada dirección tiene una HONDURA:
 *
 *   · ir más hondo empuja una entrada  → «atrás» regresa a donde estabas;
 *   · moverse al mismo nivel la reemplaza → mandar la compra no deja el
 *     formulario esperando atrás;
 *   · salir hacia afuera retrocede tantos pasos como haga falta, en vez de
 *     apilar otra entrada.
 *
 * QUIEN LLEGA DE FUERA
 *
 * quell101 y quote101 pueden mandar a alguien directo a `…/#/pedir`. Esa
 * persona no tiene «Mis compras» atrás —atrás está la otra app—, así que
 * «← Mis compras» no retrocede: reemplaza. Sacarla de supply101 con un
 * botón que dice a dónde va sería lo peor de los dos mundos.
 */

const est = () => history.state || {};
export const honduraActual = () => (typeof est().hondura === 'number' ? est().hondura : 0);

/** La hondura de la primera pantalla de esta visita: hasta ahí y no más
 *  atrás llegan las entradas que escribió esta app. */
let raiz = null;

/** Apuntar dónde estamos sin movernos. Hace falta en cada llegada, porque a
 *  `#/orden/…` también se entra picando una liga de la lista, que apila sin
 *  pasar por aquí. */
export function sellar(hondura) {
  if (raiz === null) raiz = hondura;
  if (history.state && honduraActual() === hondura) return;
  history.replaceState({ ...est(), hondura }, '', null);
}

/** Moverse a una dirección. El `hashchange` es quien pinta, aquí y cuando la
 *  persona pica «atrás»: así los dos caminos pasan por el mismo lugar. */
export function irA(ruta, hondura) {
  const destino = '#' + (ruta.startsWith('/') ? ruta : '/' + ruta);
  const ahora = honduraActual();
  if (raiz === null) raiz = ahora;
  if (hondura > ahora) history.pushState({ hondura }, '', destino);
  else if (hondura === ahora) history.replaceState({ hondura }, '', destino);
  else {
    const pasos = ahora - Math.max(hondura, raiz);
    if (pasos > 0) { history.go(-pasos); return; }   // el hashchange pinta
    history.replaceState({ hondura }, '', destino);  // no hay nada nuestro atrás
  }
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
