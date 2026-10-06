/* Las pruebas aguantan un corte de conexión con staging (6-oct).
 *
 * Desde el 6-oct, «Pruebas» se cae a ratos con `read ECONNRESET` contra la API
 * de staging: cada corrida, una prueba distinta. No es el código, es la red
 * entre GitHub y staging. Esto envuelve `fetch` SÓLO en las pruebas (vitest
 * `setupFiles`; la app no lo carga) y repite una LECTURA (GET o HEAD) cuando
 * la conexión se corta antes de llegar la respuesta, hasta dos veces más.
 *
 * Una ESCRITURA no se repite nunca: el corte puede llegar cuando la API ya
 * guardó, y repetirla duplicaría lo escrito. Esa sigue tronando, y está bien
 * que truene. Se mide en `pruebas/red-de-staging.spec.ts`. */

const original = globalThis.fetch.bind(globalThis);
const CORTES = new Set(["ECONNRESET", "ECONNREFUSED", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_CLOSED"]);
const REPETICIONES = 2;

function esCorte(e: unknown): boolean {
  if (!(e instanceof TypeError)) return false;
  const causa = (e as { cause?: { code?: string } }).cause;
  return !!causa?.code && CORTES.has(causa.code);
}

function metodoDe(entrada: RequestInfo | URL, opciones?: RequestInit): string {
  if (opciones?.method) return opciones.method.toUpperCase();
  if (typeof Request !== "undefined" && entrada instanceof Request) return entrada.method.toUpperCase();
  return "GET";
}

globalThis.fetch = (async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
  const metodo = metodoDe(entrada, opciones);
  const repetible = metodo === "GET" || metodo === "HEAD";
  for (let intento = 0; ; intento++) {
    try {
      return await original(entrada, opciones);
    } catch (e) {
      if (!repetible || intento >= REPETICIONES || !esCorte(e)) throw e;
      await new Promise((listo) => setTimeout(listo, 300 * (intento + 1)));
    }
  }
}) as typeof fetch;
