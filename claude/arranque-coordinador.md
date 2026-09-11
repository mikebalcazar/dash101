# dash101 — arranque coordinado

**Para:** el chat que tome dash101 (CONTA MASTER).
**De:** el coordinador de suite101, 10-sep-2026.
**Regla de este documento:** lo marcado **medido** se leyó hoy de primera mano:
el código desplegado de `suite101-api` en Cloudflare, la D1 `suite101-master`,
los sitios de Netlify, la carpeta de Drive y el repo público `descargas`. Lo que
viene de documentos de otros chats dice **según**. Si un renglón no coincide
con un archivo, manda el archivo (OPERAR §3).

**Tu objetivo, en una línea:** sacar a dash101 de Firebase y de Netlify sin
perder ni un centavo. Eres la migración más delicada de la suite, porque aquí
vive el dinero real, y la que más le toca a las demás: eres el único dueño de
`movimientos`, `cuentas`, `opex` y `partidas`, y eres quien le abre el portal a
un cliente.

* * *

## 0 · Lo primero, en este orden

1. **Dónde vas a trabajar.** Este documento está pensado para una sesión de
   **Claude Code en la web** (claude.ai/code; se abre y se sigue desde la app
   del celular) con tu repo como fuente. Es el único tipo de sesión donde un
   chat de taller101 ha podido empujar: ahí el proxy pone la credencial por ti.
   En un chat normal de claude.ai puedes leer, planear y armar la ficha (§6),
   pero no publicar. Tres chats lo descubrieron el 10-sep a la mitad del
   trabajo; tú descúbrelo en el primer minuto.

2. **Comprueba que puedes escribir**, en tu repo **y en `suite101-api`** (ahí
   vive el muro y ahí van los cambios de la API):

   ```bash
   git push --dry-run origin HEAD:refs/heads/claude/prueba-de-acceso
   ```

   Si pasa en los dos, adelante: tú publicas y no le pides clics a Mike. Si
   sale *«not in this session's authorized repository set»* o un 403, **no es
   el PAT**, es la sesión. Dile a Mike el mensaje exacto, señálale §8 y para
   ahí. No busques tokens en archivos y no rodees el proxy.

   **Ya está comprobado que la sesión puede empujar, incluso workflows.** El
   10-sep la app de Claude quedó instalada con acceso a todos los repos y
   permiso de escritura en código, actions y workflows, y el chat «sitio»
   hizo merges en `descargas` desde Claude Code ese mismo día. El push en seco
   sigue siendo tu primer paso, pero si falla es una anomalía: díselo a Mike
   con el mensaje exacto.

   **Desde Claude Code sí se alcanzan `pages.dev`, `workers.dev` y
   `api.github.com`** (medido por el chat «sitio»). `OPERAR.md` §6 dice lo
   contrario porque se escribió para chats de claude.ai. Aun así, deja que el
   workflow mida solo: así los números quedan en el commit.

3. **Lee `OPERAR.md`** de tu repo. Dos partes quedaron viejas y este documento
   las corrige mientras se actualizan (§3, D7). **§1** manda sacar un PAT de
   `CONTEXTO.md`: si tu push en seco pasó, no hace falta ningún PAT. **§6**
   dice qué deja pasar el proxy, y eso depende de la sesión: mídelo.

4. **Semáforo** `claude/EN-CURSO.md` (OPERAR §2), en tu repo y también en
   `suite101-api` cuando vayas a tocarla. Tres chats van a entrar ahí.

5. **Muro.** Lee completo `suite101-api/muro/` y deja tu recado de arranque
   (§10). Si el muro trae algo más nuevo que contradiga este documento, manda
   el muro.

6. **Último run en verde** antes de apilar nada (OPERAR §4).

7. En tu primer commit, copia este documento a `claude/arranque-coordinador.md`
   de tu repo. El repo es la fuente de verdad; el proyecto de Claude es sólo el
   mapa.

* * *

## 1 · Qué es dash101 y dónde está

«Las cuentas del taller: proyectos, gastos y flujo». Así lo presenta hoy la
portada de `suite101.pages.dev`, donde sale como tarjeta apagada.

| | |
| --- | --- |
| Repo | `github.com/mikebalcazar/conta-master` (privado). **Según** `suite101-repos.md`: Next.js, Firebase y Netlify; trae `CONTEXTO.md`, **con el PAT adentro** (ver §4, fase 1) |
| Sitio vivo | Netlify `conta-master` → `https://conta-master.netlify.app`. **Medido:** deploy `ready` |
| Datos de hoy | Firestore, en modelo plano: `negocios`, `cuentas`, `clientes`, `proyectos`, `movimientos`, `opex`, `proveedores`, `invitaciones`, `usuarios` y los productos, que en la suite se llaman ítems |
| Datos de mañana | OrgDB de `forespot`. **Según** el coordinador anterior (9-sep), ya se importó y cuadró. **No se pudo medir hoy**: un Durable Object no se lee desde el conector |
| En la API | `X-App: dash101`; en `orgs.apps` es la llave `dash`. **Medido:** encendida en `forespot` |
| Material de venta | **según** `descargas/venta/LEEME.md`: el de dash101 **y el de peek101** va en `conta-master/claude/venta/`. Está pendiente |

* * *

## 2 · La API de la suite — medida hoy leyendo el código desplegado

El coordinador anterior dejó `MASTER-CODER-handoff.md`. El 10-sep se leyó el
código que está corriendo en Cloudflare, y ese documento tiene tres cosas mal:

- Las rutas de datos van bajo **`/orgs/:o/…`**, no `/:o/…`. Las de sesión van
  bajo `/auth/…`.
- OrgDB tiene **13 tablas**, no 9. A las que listaba se suman `avances`
  (sólo se agrega, nunca se edita), `movimientos`, `opex` y `archivos`.
- El conector de Cloudflare dice `num_tables: 0` para `suite101-master`. Es
  falso: se consultó y tiene tablas y datos. No te fíes de ese campo.

| | medido el 10-sep |
| --- | --- |
| Worker | `suite101-api` y `suite101-api-staging` (Hono), contrato `0.2.0`, último cambio 9-sep 17:16 UTC |
| Identidad | D1 `suite101-master`: **una sola org, `forespot`**, activa, con las seis apps encendidas. 3 usuarios, 1 miembro, 2 accesos de tipo `cliente` |
| Datos por empresa | Durable Object `OrgDB`, un SQLite por org. Sus migraciones **las aplica el propio objeto al despertar**, comparando su versión; wrangler no las toca |
| Staging | D1 `suite101-master-staging` con 15 orgs de humo (`humo-*`, `imp-*`) que dejan las pruebas de la API. No hay org de demostración |

**Cómo se habla con ella:**

- **La sesión es sólo una cookie**: `s101`, con `HttpOnly; Secure;
  SameSite=None`. No existe `Authorization: Bearer`. Esto decide cómo se
  hospeda cada app (§3, D1).
- **`X-App` es obligatorio** en `/orgs/…`. Los valores válidos son `dash101`,
  `quell101`, `peek101`, `cotizador101`, `roster101`, `nest101`, `master101` y
  `suite101`. Si la org no tiene tu app encendida responde `403 app_inactiva`.
- **Para entrar:** `POST /auth/codigo {correo}` manda un código de 6 dígitos
  por Resend; vence en 10 min y se puede reenviar cada 45 s. Luego
  `POST /auth/entrar {correo, codigo}` o `{correo, pin}`. `POST /auth/pin {pin}`
  lo fija: 6 dígitos, que no sean escalera ni seis iguales. Quedan
  `POST /auth/salir`, `GET /yo` y Google en `/auth/google`, que responde 501 si
  faltan sus secretos.
- **En staging, `/auth/codigo` devuelve `codigo_prueba`** en la respuesta
  (cuando `ENTORNO ≠ produccion`). Con eso una prueba de Playwright entra sola,
  sin leer correo. En producción no lo devuelve.
- **El dinero va en centavos, como entero.** Un monto con decimales se rechaza
  con `400 dinero_no_entero`. Las fechas van como texto ISO 8601 UTC.
- **Cada campo tiene dueño.** Cada app escribe sólo ciertos campos de ciertas
  tablas (`ESCRITORES`, en `src/permisos.ts`). Lo demás responde
  `403 campo_no_permitido` y dice qué sí se permite. Los de tu app están en §4.
- **Quién ve dinero:** los miembros sí. `ve_costos` sólo lo tienen owner,
  admin y socio. El personal ve dinero según su `ve_dinero`. **Un cliente sólo
  puede abrir `/peek`.**
- Toda respuesta tiene la forma `{ok:true, data}` o `{ok:false, error, detalle}`.
- Hay canal en vivo por org: `GET /orgs/:o/ws`, un WebSocket con hibernación.

* * *

## 3 · Decisiones del coordinador (valen igual para quote101, dash101 y peek101)

**D1 · Cada app vive en su propio Worker y le habla a la API desde su mismo
origen.**

- El Worker sirve la interfaz como *static assets* y tiene un **service
  binding** a `suite101-api`. Todo lo que llega a `/s101/*` se reenvía a la API
  sin el prefijo.
- **Por qué:** la sesión es una cookie `SameSite=None`. Si la app vive en un
  sitio y la API en otro, es cookie de terceros, y Safari la bloquea (es decir,
  todo iPhone). Desde el mismo origen la cookie es propia y además no hay CORS
  que configurar.
- El proxy pone `X-App`; la interfaz no lo manda.
- El prefijo es `/s101/` y no `/api/` por dos razones: no chocar con las rutas
  `/api` de Next.js en dash101, y que las tres apps tengan la misma regla.

```toml
# wrangler.toml — esqueleto: mídelo, no lo copies a ciegas
name = "dash101"
main = "worker/index.js"
compatibility_date = "2026-09-01"
assets = { directory = "./dist", binding = "ASSETS" }
# si usas not_found_handling = "single-page-application", agrega
# run_worker_first = ["/s101/*"] para que la API no reciba index.html

[[services]]
binding = "API"
service = "suite101-api"

[env.staging]
name = "dash101-staging"
[[env.staging.services]]
binding = "API"
service = "suite101-api-staging"
```

```js
// worker/index.js
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname.startsWith('/s101/')) {
      u.pathname = u.pathname.slice(5);        // /s101/auth/codigo → /auth/codigo
      const r = new Request(u, req);
      r.headers.set('X-App', 'dash101');
      return env.API.fetch(r);
    }
    return env.ASSETS.fetch(req);
  }
};
```

**D2 · Nombres.** Los Workers nuevos se llaman `quote101`, `dash101` y
`peek101`, cada uno con su gemelo `-staging`. Sus direcciones son
`https://<nombre>.mike-929.workers.dev` hasta que haya dominio propio. Son
nombres nuevos, no renombres, así que OPERAR §8 sigue en pie. Mike puede
vetarlos; si lo hace, se corrige aquí y en el muro **antes** del primer deploy.

**D3 · Netlify no se toca hasta el corte.** El sitio viejo sigue sirviendo
mientras el nuevo se mide a su lado. El corte llega cuando el nuevo pasa la
misma verificación que el viejo, con números. Apagar o borrar un sitio de
Netlify lo hace Mike, porque es irreversible y un chat no borra. Ningún sitio
de Netlify se renombra.

**D4 · Ninguna app toca una base directo.**

- Si falta un campo o una ruta, se agrega en `suite101-api`, con semáforo,
  prueba y recado en el muro. La app espera a que ese cambio esté desplegado.
- Cada cambio de contrato sube `VERSION_CONTRATO` y se anuncia en el muro.
- Una migración de OrgDB se prueba como manda OPERAR §7: `sqlite3` en memoria
  con todas las anteriores aplicadas, `PRAGMA foreign_keys = ON`, con datos,
  filas antes y después, y `PRAGMA foreign_key_check`.

**D5 · Staging primero.** Todo se prueba contra `suite101-api-staging` y el
Worker `-staging` de tu app. A producción sólo llega lo que ya salió verde ahí.

**D6 · La org de demostración.**

- Capturas y pruebas usan una org **`demo` en staging**, con datos ficticios:
  el cliente «Familia Ramírez» y el proyecto «Cocina Ramírez», los mismos que
  ya usa draw101 en su material de venta.
- **Nunca se captura `forespot`**: ahí hay dinero real de clientes reales.
- La siembra dash101, porque el dinero es suyo. Si peek101 o quote101 llegan
  antes, la crean con esos mismos nombres y lo avisan en el muro.

**D7 · `OPERAR.md` lo actualiza un solo chat: dash101**, porque su §1 apunta
al `CONTEXTO.md` de ese repo. Los otros dos no lo tocan; si encuentran algo,
lo dejan en el muro para dash101.

**D8 · Nombres de producto, siempre en minúsculas.**

- **quote101**. En la API se sigue identificando como `cotizador101`: es
  contrato y no se cambia.
- **dash101**. Su interfaz hoy dice CONTA MASTER.
- **peek101**.

* * *
## 4 · Tu migración, por fases

### Lo que la API ya te da (medido)

Estos son tus permisos de escritura:

| Tabla | Qué puede escribir `dash101` |
| --- | --- |
| `movimientos`, `cuentas`, `opex`, `proveedores` | **todo** |
| `negocios` | todo (compartido con `suite101`) |
| `proyectos` | `nombre`, `descripcion`, `estado`, fechas, **`partidas`**, `cliente_id`, `negocio_id` |
| `clientes` | `nombre`, `nombre_norm`, `correo`, `telefono`, `rfc`, `notas`, **`portal_activo`**, `negocio_id` |
| `items` | `nombre`, `descripcion`, `tipo`, `monto`, `moneda`, `estado`, `proyecto_id`, `cliente_id`, `negocio_id`, `fecha_entrega` |

Lo que no puedes escribir:

- `precio_venta`, `cobrado`, `pagado_prov` y `avance` de `proyectos`. Son
  cachés que la API recalcula después de cada cambio; si los mandas responde
  `campo_no_permitido`.
- La `etapa` de un ítem. Sólo cambia por `POST /orgs/:o/items/:id/etapa`.
- Los montos de las tablas de dinero van en centavos, como entero.

**Tú abres el portal de un cliente:**
`POST /orgs/:o/clientes/:id/acceso {correo, pin}`, sólo como miembro. Esa
llamada crea al usuario si no existe, le fija el PIN, registra su acceso de
tipo `cliente` y pone `portal_activo = 1`. **Medido:** en `forespot` ya hay 2
accesos de tipo `cliente`. peek101 depende de esta pantalla tuya.

**El importador** (`GET /admin/importar`, medido leyendo su página):

- Es la «fase 2 de la migración» y se corre una vez por empresa.
- Conserva los ids: un `producto_id` viejo sigue apuntando al mismo ítem.
- No migra los PIN; cada quien fija el suyo otra vez.
- No inventa historial.
- Correrlo dos veces no duplica nada.
- Trae un **reporte de cuadre**: filas y sumas de dinero por tabla, incluidas
  las de `partidas`. Es la herramienta de comparación entre los dos lados.
- **Depende del navegador de Mike.** Lee Firestore desde su sesión de CONTA
  MASTER, y las reglas de Firestore sólo dejan leer con el filtro
  `miembros_uids` y, de `usuarios`, sólo el documento propio. Los demás
  miembros se dan de alta con `POST /admin/orgs/:o/miembros`.

### Fase 0 · Medir

Deja lo que midas en `claude/continuar.md`:

- **El reporte de cuadre de `forespot` hoy.** Para leerlo necesitas una sesión
  de superadmin. Si no puedes, anótalo como no verificado; **no des por buena
  la frase «cuadrados» del 9-sep.**
- **Cómo usa Firebase el código.** Todas las lecturas, escrituras, reglas y
  Auth (¿Google? ¿correo?).
- **Qué hace Next.js.** Si es `output: 'export'` (estático) basta con *static
  assets*. Si usa SSR o rutas `/api`, el camino que documenta Cloudflare es el
  adaptador de OpenNext (`@opennextjs/cloudflare`). Mide cuál es antes de
  elegir.
- **La forma real de `partidas`** en Firestore. Lo que la API suma de cada una
  es `monto_acordado` y `monto_pagado`. Cuenta cuántas partidas traen una
  referencia a un producto o ítem y cuántas no.

### Fase 1 · El nombre y la limpieza (decisión 5 de Mike: «ya, antes de seguir migrando»)

**El repo `conta-master` pasa a llamarse `dash101`.**

- Renombrar un repo necesita permiso de administración; lo hace Mike (§8,
  M9), en Settings → General → Repository name.
- GitHub redirige los clones y las URLs viejas.
- Después tú actualizas todas las menciones: `OPERAR.md` (los siete),
  `descargas/venta/LEEME.md`, `suite101-repos.md` y el muro.
- Comprueba que el deploy de Netlify siga en verde tras el renombre (estado
  del commit).

**El sitio de Netlify `conta-master` NO se renombra.**

- Su URL es la que usa la gente hoy, y muy probablemente está en los dominios
  autorizados de Firebase Auth: cambiarla rompería el login antes del corte.
- El nombre dash101 nace en Cloudflare (Worker `dash101`, D2), y el sitio de
  Netlify muere en el corte.
- Así lee el coordinador la decisión 5. Si Mike quiere otra cosa, que lo diga
  y se corrige aquí.

**Saca el PAT de `CONTEXTO.md`.**

- Con la GitHub App de Claude (M1) las sesiones ya no lo necesitan.
- El historial lo conserva, así que el arreglo real es que Mike lo revoque
  (M6). Tú borra el renglón y deja dicho por qué.

**Actualiza `OPERAR.md` en los siete repos (D7).**

- §1: el arranque es el push en seco, no un PAT.
- §6: lo que deja pasar el proxy depende de la sesión.
- §8: se agrega el patrón `/s101/` y la regla de la org `demo`.
- Integra también el recado pendiente de roster101 sobre §6 (está en
  `claude/roster101-handoff.md` §7 del proyecto). Van siete copias idénticas,
  en el mismo trabajo.

### Fase 2 · `partidas` pasa de `proyectos` a `items` (decisión 1 de Mike)

Eres el único que escribe `partidas`, así que este cambio es tuyo, en
`suite101-api` (D4).

- **Dónde.** Hoy vive en `proyectos.partidas`, un JSON. La cabecera de
  `0001_inicial.sql` dice: «JSON sólo donde el contenido no se consulta por sí
  solo». Las partidas se suman (cuadre, `pagado_prov`), así que la
  recomendación es una **tabla propia**: `partidas(id, item_id → items,
  proveedor_id, concepto, monto_acordado, monto_pagado, …)`, con el dinero en
  columnas de centavos. Si eliges otra forma, explica por qué en el muro.
- **Qué tienes que tocar:** `migrations/org/0002_*.sql`, `DEFS` y `ESCRITORES`
  (quién escribe partidas: dash101), el recálculo de `pagado_prov`, las sumas
  del cuadre (`sumarDinero` y `sumarDineroDe` leen `proyectos.partidas` hoy) y
  el mapeo del importador.
- **La trampa:** una partida de hoy cuelga del proyecto, no de un ítem. Las
  que traen referencia a un producto se mueven solas. **Las que no, no se
  reparten a ojo:** cuéntalas, enséñale a Mike una muestra y que él decida (por
  ejemplo, un ítem «general» por proyecto). Hasta que decida, la migración no
  corre en producción.
- **Cómo se mide (OPERAR §7):** `sqlite3` en memoria con `0001` aplicada y
  datos que imiten los de `forespot`, filas antes y después, `PRAGMA
  foreign_key_check`, y **la misma suma de `monto_acordado` y `monto_pagado`
  antes y después, al centavo**. Luego en staging. Recuerda que la migración la
  aplica cada objeto al despertar: la primera petición a una org la dispara.
- **El cliente nunca ve partidas.** Comprueba que `peek()` siga sin tocarlas y
  que quien no tiene `ve_costos` tampoco las reciba.

### Fase 3 · Que dash101 lea y escriba en la API

- **Una sola capa de datos**, con la misma interfaz que hoy usa para Firestore,
  y un interruptor (`FUENTE = firestore | api`). Primero **lectura**: cada
  pantalla, con la API, tiene que dar las mismas cifras que con Firestore. Se
  compara contra el cuadre, no a ojo. Después **escritura**.
- **Sesión** por `/s101/auth/…` (D1). Si hoy se entra con Google: la API
  soporta `/auth/google`, pero arma el `redirect_uri` con el origen de la
  petición, y detrás del proxy `/s101/` el callback caería fuera del prefijo.
  Resuélvelo en la API (por ejemplo, respetando un prefijo reenviado) antes de
  ofrecer Google, o quédate con correo, código y PIN.
- **La pantalla «abrir portal»** para un cliente, contra `/clientes/:id/acceso`
  (arriba). Es lo que peek101 necesita de ti.
- **Siembra la org `demo` en staging (D6):** negocio, cuenta, el cliente
  «Familia Ramírez», el proyecto «Cocina Ramírez» con ítems en varias etapas,
  un par de ingresos y de egresos, y un acceso de cliente para peek101. Avisa
  en el muro cuando esté.

### Fase 4 · Mudanza a Cloudflare

- Worker `dash101-staging` y luego `dash101` (D1, D2), con el workflow de §5.
- Netlify sigue vivo al lado (D3).

### Fase 5 · Corte

1. Congelar Firestore en sólo lectura, para que nadie escriba del lado viejo
   durante el paso.
2. Correr un **último reimport**, que es idempotente.
3. Pasar `FUENTE` a `api`.
4. Comprobar que el cuadre dé **cero diferencias**, con números.
5. Mike apaga Netlify y, pasados unos días sin sorpresas, Firebase.

Para que el reimport final **no dependa del navegador de Mike** hace falta
leer Firestore desde el runner: una cuenta de servicio de sólo lectura como
secreto (M5). Cómo se autentica el runner contra `/admin/importar` (hoy pide
sesión de superadmin) es diseño tuyo en `suite101-api`. Propónlo en el muro
antes de tocar la API: es la puerta de servicio y va por debajo de los
permisos normales.

### En paralelo, desde el día uno: la ficha (§6)

- **Capturas sólo de la org `demo`.** Una captura de `forespot` enseñaría el
  dinero real de clientes reales.
- **Tu logo:** hoy no hay ninguno registrado en el material de venta; sácalo
  con `marca-svg.py dash101`.
- **La interfaz dice CONTA MASTER.** Si pasa a decir dash101, es cambio de
  producto: pregúntale a Mike antes de tocarlo. La ficha, en cambio, ya va como
  dash101.

* * *

## 5 · Publicar sin Mike y sin PC

Una vez puestos los permisos de §8, la cadena completa es esta:

1. Mike pide algo desde el celular, en una sesión de Claude Code en la web.
2. La sesión abre una rama `claude/…`, mide, hace commit en español, PR y merge
   (OPERAR §5).
3. El push a `main` dispara GitHub Actions, que hace `wrangler deploy` con el
   secreto `CLOUDFLARE_API_TOKEN` del repo.
4. El mismo workflow verifica lo publicado desde el runner, que sí alcanza
   `*.workers.dev`, y deja los números como comentario del commit. Es el patrón
   de `verificar.yml` en `descargas`.
5. La sesión lee ese comentario por la API de GitHub y le cuenta a Mike qué se
   midió.

**Nada de eso pasa por la computadora de Mike.** Las llaves viven en dos
lugares y sólo en dos: los **secretos de Actions** de cada repo y los
**secretos de cada Worker** en Cloudflare. Nunca en un archivo del repo, en un
chat, en un `.bat` ni en una carpeta de OneDrive.

**Ya arreglado (10-sep, chat «sitio», merge `cc1767c`):** el paso «Medir lo
publicado» de `descargas/publicar-sitio.yml` reintenta, sigue las
redirecciones de Pages y deja los números como comentario del commit. Run 5 de
«Publicar sitio» en verde de punta a punta. Cópiale el patrón, no lo reinventes.

Tres cosas que ya no se hacen:

- `.bat` o parches para que Mike los corra. Quedaron sueltos en `t101w` de un
  intento anterior.
- PAT en `CONTEXTO.md` o en `github-token.txt`.
- `wrangler deploy` desde una máquina.

```yaml
# .github/workflows/publicar.yml — esqueleto
name: Publicar
on:
  push: { branches: [main], paths-ignore: ['claude/**'] }
  workflow_dispatch:
permissions:
  contents: write            # para dejar el comentario en el commit
concurrency: { group: publicar, cancel-in-progress: false }
jobs:
  publicar:
    runs-on: ubuntu-latest
    env:
      CLOUDFLARE_API_TOKEN:  ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    steps:
      - uses: actions/checkout@v4
      - run: npx --yes wrangler@4 deploy --env staging
      - run: ./scripts/medir.sh https://dash101-staging.mike-929.workers.dev   # portada, /s101/salud, marca, cifras
      - run: npx --yes wrangler@4 deploy
      - run: ./scripts/medir.sh https://dash101.mike-929.workers.dev --comentar
```

`/s101/salud` pasa por tu proxy hasta la API y te devuelve
`{servicio, version, contrato, entorno, d1}`. Si responde, el binding está
bien puesto.

* * *

## 6 · La ficha de producto y el material para el sitio → Drive

El sitio de la plataforma **ya existe y ya lo arma otro chat**, el chat
«sitio»: `suite101.pages.dev`, publicado y medido el 10-sep desde
`descargas/sitio/`. Hoy enseña dash101, peek101 y nest101 con **maquetas
dibujadas** (`sitio/img/dash101/maqueta-*.png`), porque de esas apps sólo hay datos
reales; quote101 tiene dos capturas y necesita dos más. Tu parte es entregarle
la materia prima de tu app, completa y explicada, para que sustituya las
maquetas por capturas de la org `demo` sin preguntarte nada. Lee sus recados en
`suite101-api/muro/2026-09-10-*-sitio-*.md` antes de empezar.

**Dónde va.** En Google Drive, carpeta **`suite101`**. Hoy se comprobó que
existe, que es de mike@forespot.com y que está vacía; su id es
`1DAInf5w-XgLyb7teIgTJOyfvMbLUotiv`. Crea dentro `suite101/dash101/` y deja ahí
todo.

La misma materia prima va también en tu repo, en `claude/venta/`, que es la
convención de `descargas/venta/LEEME.md`. El repo es la copia con historia;
Drive es la entrega. Si tu sesión no tiene el conector de Google Drive, deja
todo en el repo y pídelo en el muro: alguien con Drive lo sube.

```
suite101/dash101/
  LEEME.md      qué es cada archivo — lo primero que abre el chat del sitio
  web.md        el texto de la página de la app
  ficha.md      la ficha comercial de una hoja
  datos.md      versión, dirección, estado, stack
  marca/        el logotipo en todas sus presentaciones
  capturas/     las pantallas
```

**`LEEME.md`** es obligatorio. Es una tabla con cinco columnas: archivo, qué
es, para qué sirve en el sitio, cómo se generó (el comando o el guion de
captura) y fecha. Si falta algún archivo, el LEEME dice por qué. Marca cuáles
son las 4 capturas de `web.md`.

**`web.md`** lleva los campos **exactos** del diccionario `APPS` de
`descargas/sitio/herramientas/armar-sitio.py`. Así el chat del sitio lo pega
sin reescribir nada. Toma de ahí el tono de roster101 y de quell101.

```
lema:        una frase: lo que la app hace por quien la usa (≤ 12 palabras)
corto:       la línea de la tarjeta en la portada (≤ 10 palabras)
             hoy la portada dice: «Las cuentas del taller: proyectos, gastos y flujo.»
estado:      En producción · En uso · En preparación
plataforma:  p. ej. «Web · celular y computadora»
entrada:     un párrafo de 60 a 90 palabras: qué es, cómo se usa, qué cambia
beneficios:  6 × (título de ≤ 6 palabras · una frase)
funciones:   8 × (nombre · detalle corto, sin verbo)
capturas:    4 × (archivo · pie de una línea)
datos:       Versión · Plataforma · Estado · Modelo
conecta:     2 a 4 renglones: qué recibe de otras apps de la suite y qué les entrega
```

**`ficha.md`** sigue el formato de `descargas/venta/draw101/ficha.md`: título
y subtítulo, para quién (3), 5 beneficios, 8 funciones, capturas (tabla de
archivo y qué enseña, más cómo se tomaron), marca y cómo se pide.
**`datos.md`** sigue el de `descargas/venta/draw101/datos.md`.

**`marca/`**

| Archivo | Para qué |
| --- | --- |
| `dash101-azul.svg` y `.png` (1024 px de ancho) | logotipo sobre fondo claro |
| `dash101-blanco.svg` y `.png` | sobre fondo oscuro o sobre el azul |
| `dash101-negro.svg` | una sola tinta: impresión, sellos |
| `dash101-icono.svg`, `-512.png`, `-192.png`, `-180.png`, `-32.png`, `-16.png`, `.ico` | ícono de app, favicon, pantalla de inicio del celular |
| `dash101-og-1200x630.png` | tarjeta para compartir por redes y WhatsApp |

Reglas de la marca:

- El vector sale de `descargas/venta/herramientas/marca-svg.py`: puros
  `<path>`, sin `<text>` ni `font-family`. Nada de calcar un PNG.
- Azul `#0080C1`. Sansation para la marca y los títulos, Raleway para el
  texto, **Fira Sans para todas las cifras**.
- Se mide con cairosvg y PIL a 512 y a 32 px (OPERAR §7). Que a 32 px el
  ícono siga leyéndose se comprueba, no se supone.

**`capturas/`**

- Tema claro, idioma español, datos de la org `demo` (D6). **Nunca datos
  reales.**
- En computadora, 1600 × 1100. La portada, en 16:9 a 1600 × 900, se llama
  `00-portada-16-9.png`. Si la app se usa en celular, también a 390 × 844, con
  el sufijo `-celular`.
- Se nombran `NN-que-enseña.png`, y van de 4 a 9.
- Se toman con un guion de Playwright que queda en el repo y se puede repetir,
  como `build/capturas_venta.py` de draw101.

**Reglas del contenido.** Las decidió Mike el 9-sep y están en
`descargas/venta/LEEME.md`:

- Se vende como **Suite 101**.
- **Sin precios.** La única llamada a la acción es pedir una demostración a
  **info@forespot.com**.
- **Nada de números medidos en una sola máquina.** Se dice qué se siente, no
  cuánto marcó el cronómetro.
- **La ficha no promete nada que la app no haga hoy.** Si la app cambia, la
  ficha cambia en el mismo PR.

Cuando termines, deja un recado en el muro («material de venta de dash101 en
Drive») para el chat del sitio.

* * *
## 7 · Lo que no se sabe todavía

- **Si `forespot` sigue cuadrado.** Lo último escrito es del 9-sep y no se
  midió hoy.
- **Cuántas partidas no traen referencia a un ítem.** De eso depende la
  migración de la fase 2.
- **Si Next.js corre estático o con servidor.**
- **Cómo entra la gente hoy** (Firebase Auth, con qué proveedor) y quiénes son
  los usuarios reales.
- **Qué pasa con `invitaciones`.** El importador no la trae.
- **Quién dio de alta los 2 accesos de cliente** que ya existen en producción,
  y a quiénes. No los uses para pruebas.
- **Un choque que viene** (avísale a peek101): en `accesos`, cada usuario tiene
  **un solo** acceso (`ON CONFLICT(usuario_id)`). La decisión 4 dice que un
  cliente que compra a dos empresas son dos documentos separados; hoy el
  segundo acceso **pisaría** al primero. Con una sola org no duele todavía;
  anótalo en el muro.

* * *

## 8 · Lo que hace falta de Mike

Se hace una sola vez, desde el navegador del celular, y el chat nunca ve los
valores. Suponlo pendiente hasta medir lo contrario.

| # | Qué | Para qué |
| --- | --- | --- |
| M1 | ✅ **Hecho según Mike (10-sep):** la Claude GitHub App ya está instalada en `mikebalcazar`. Tú lo compruebas con el push en seco y la prueba del workflow (§0.2) | sin esto la sesión clona pero no empuja |
| M2 | ✅ **Hecho el 10-sep:** token nuevo de Cloudflare («Edit Cloudflare Workers» más *D1: Edit* y *Pages: Edit*) pegado como `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` en `cotizador-t101`, `conta-master`, `suite101-api`, `descargas`, `bitacora-obra`, `t101-portal-trabajadores` y `taller101` (y en `peek101` cuando exista). **Probado:** en el run 4 de «Publicar sitio» de `descargas`, el paso que usa el token salió verde. Los otros repos se comprueban en su primer deploy. Si no se sabe si el token viejo ya se revocó, no lo supongas | deploy solo |
| M5 | **Cuenta de servicio de Firebase de sólo lectura** (rol de lector de Firestore), con su JSON pegado como secreto `FIREBASE_SA_LECTURA` en el repo de dash101 | reimport final y comparaciones sin el navegador de Mike |
| M6 | **Revocar el PAT** que vive en `CONTEXTO.md`, cuando M1 funcione | que la llave del historial ya no abra nada |
| M7 | Subir al proyecto `suite101-arquitectura.md` (7-sep) y `suite101-estado-real-2026-09-09.md` | ciclo de vida del ítem y dueño por campo, para la fase 2 |
| M8 | Conector de **Google Drive** en la sesión que entregue la ficha | subir a `suite101/dash101/` |
| M9 | **Renombrar el repo** `conta-master` → `dash101` en GitHub (Settings → General) | decisión 5 |
| — | Decidir qué pasa con las partidas sin ítem (fase 2) y confirmar la lectura de la decisión 5 (fase 1) | tú le llevas los números |

Si tu push en seco falla, avísale a Mike: M1 dice que ya está hecho. Si el deploy sale con 403 de Cloudflare,
falta M2. Dilo con el mensaje exacto y no pidas nada más.

* * *

## 9 · Convenciones que no se negocian

- **Mike decide, el chat ejecuta y mide.** No se le pide que abra GitHub, que
  haga merge ni que verifique.
- **El mensaje de un commit no es prueba de nada.** Tampoco este documento. Se
  abre el archivo y se mide.
- **Ninguna llave** se escribe en un chat, en un commit, en la bitácora ni en
  un archivo. Los secretos se comprueban porque el deploy sale verde, no
  leyéndolos.
- **Dinero en centavos, como entero.** Nunca `REAL`, nunca `parseFloat` para
  guardar.
- **Fuentes propias, cero Google Fonts.** Las cifras van en Fira Sans con
  `unicode-range`.
- **Nombres en minúsculas:** suite101, taller101, quote101, dash101, peek101.
- **No se renombra infraestructura** que ya vive (OPERAR §8). La única
  excepción decidida es la del repo de dash101.
- **Si no se pudo medir, se dice.** Nunca se supone.

* * *

## 10 · Recados en el muro

Formato: `suite101-api/muro/AAAA-MM-DD-HHMM-dash101-de-que.md`. Es un archivo
nuevo cada vez y nunca se edita el de otro. Lleva tres renglones de encabezado:

```
de:    dash101
para:  todos | coordinador | dash101 | quote101 | peek101 | sitio
qué:   una línea
```

Van cuatro recados como mínimo:

1. **Al arrancar:** qué medí del alcance (push en seco sí o no) y qué voy a
   hacer.
2. **Antes de tocar `suite101-api`:** qué cambio, qué versión de contrato sale
   y a quién afecta.
3. **Al entregar el material de venta:** dónde quedó.
4. **Al cerrar la sesión:** qué quedó hecho, con números, y qué quedó sin
   verificar.
