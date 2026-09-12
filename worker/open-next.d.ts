/* El Worker de Next lo genera `opennextjs-cloudflare build` en `.open-next/`,
 * que no está en el repositorio. Sin esto, `npm run tipos:worker` pasaría o
 * fallaría según si alguien construyó antes en esa misma carpeta: verde en la
 * máquina de uno, rojo en el corredor. Declarándolo, la revisión de tipos da
 * lo mismo en los dos lados y no depende de un archivo generado.
 *
 * Sólo se declara el `fetch`, que es lo único que este Worker le llama.
 * `export *` en `index.ts` reexporta además lo que OpenNext ponga ahí —los
 * Durable Objects de la caché—; eso lo resuelve el empaquetador de wrangler
 * con el archivo de verdad, no los tipos. */
declare module "*/.open-next/worker.js" {
  const handler: {
    fetch(peticion: Request, entorno: unknown, contexto: ExecutionContext): Promise<Response>;
  };
  export default handler;
}
