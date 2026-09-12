/* dash101 como Worker de Cloudflare (fase 4 del arranque, decisión D1).
 *
 * Por qué OpenNext y no un export estático, que sería más ligero: la app es
 * cliente pura —no hay rutas de API de Next, ni middleware, ni acciones de
 * servidor, y la única pieza de servidor es el envoltorio `app/layout.tsx`,
 * medido el 12-sep—, pero tiene siete rutas con parámetro (`clientes/[id]`,
 * `proyectos/[id]`…). `output: 'export'` no admite una ruta con parámetro sin
 * `generateStaticParams`, y esos ids salen de la base, no se conocen al
 * construir. Convertirlas a `?id=` cambiaría direcciones que la gente ya
 * tiene guardadas. OpenNext deja la app exactamente igual.
 *
 * Sin caché incremental: aquí no hay nada que revalidar. Todo lo que se ve
 * sale de la API en el navegador. */
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
