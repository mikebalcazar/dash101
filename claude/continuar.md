# Continuar — dash101

Estado al **2026-09-11 04:15 UTC**. Lo escribe la sesión de Claude Code «jr»
(sesión de respaldo, tarea T3 de `jr-programmer-arranque.md`), que ejecuta el
arranque de `claude/arranque-coordinador.md`. **La fase 0 (medir) está hecha**;
lo que sigue es la fase 1. Todo lo de abajo se leyó de `main` = `0743541`.

Regla: lo que dice **medido** se abrió y se leyó; lo que dice **no verificado**
no se pudo medir desde aquí y se dice cómo se mide.

---

## §0 del arranque

| Paso | Resultado |
| --- | --- |
| Push en seco | **OK** en `dash101` (`claude/prueba-dryrun`, 11-sep) y en `suite101-api` (siete merges del muro esta semana) |
| Último run en verde | «Verificar lo publicado» run 7, `0743541`, `success` (9-sep 15:17 UTC). Run 3 de «Verificar» también verde |
| `OPERAR.md` | Leído. §1 (PAT) y §6 (proxy) siguen viejos; se corrigen en fase 1 (D7). Aquí no se tocó |
| Semáforo | Puesto en `49b38fd`; se quita en el PR de esta fase |
| Muro | Leído completo. Recado de arranque: `suite101-api/muro/2026-09-11-0415-jr-dash101-fase-0-medida.md` |
| Copia del arranque | `claude/arranque-coordinador.md`, sha256 `ea22b1456ad8956a9c128693245d1f61c3445ee609b0213ca38a474e94be3ffc` (idéntico al de Drive `coordinacion/`) |

**Regla de cierre, pedida por Mike el 11-sep:** cada entrega que se fusiona
(no cada sesión: cada PR que entra a `main`) deja **un post en `wall101`**
(`posts/AAAA-MM-DD-HHMM-jr.md`, `python3 armar.py`, commit a `main`), en
lenguaje de a pie y contando qué cambia para el taller y qué decisión queda
con Mike. El muro es para los chats; el wall es para Mike, y es donde sigue
el proceso antes de decidir los pasos siguientes. El 11-sep se pasó por alto
hasta la noche: cinco entregas sin post. No se repite.

---

## Fase 0 · las cuatro mediciones

### 1. El reporte de cuadre de `forespot` hoy — **el lado de Firestore ya está medido**

- Se lee sólo con sesión de superadmin en `GET /admin/importar`. Esta sesión
  no la tiene y no la pide.
- **M5 quedó el 11-sep**, y no como estaba escrito: la organización de Google
  prohíbe crear llaves JSON de cuenta de servicio
  (`iam.disableServiceAccountKeyCreation`), así que no hay secreto
  `FIREBASE_SA_LECTURA` ni lo va a haber. En su lugar, el corredor se
  identifica con su propio token y Google le presta por una hora la cuenta
  `lector-firestore` (`roles/datastore.viewer`), y sólo se la presta al
  repositorio `mikebalcazar/dash101`. **No hay ninguna llave que guardar ni que
  revocar.**
- Con eso, `cuadre-firestore.yml` ya midió el lado viejo: los números están
  abajo, en «La medición del 11-sep». **Sigue sin medirse el lado de la API**
  (el OrgDB de `forespot` es un Durable Object y no se lee desde fuera), así
  que la frase «cuadrados» del 9-sep **sigue sin comprobarse**: falta la mitad
  de la comparación.
- Lo que falta para cerrarlo: una manera de que el corredor le pregunte a la
  API sus `contarFilas()` y `sumarDinero()`
  (`suite101-api/src/org-db.ts:578` y `:586`) sin sesión de superadmin. Es la
  puerta de servicio que el arranque pide **proponer en el muro antes de tocar
  la API** (fase 5). Hasta entonces, el cuadre está medido de un lado.

### 2. Cómo usa Firebase el código — **medido**

- **SDK de cliente** (`firebase` 11.x), inicializado en `lib/firebase.ts` con
  variables `NEXT_PUBLIC_FIREBASE_*` (`.env.local.example`). No hay Admin SDK,
  no hay Cloud Functions, no hay Storage en el código de la app.
- **Auth** (`lib/auth-context.tsx`, `app/login`, `app/invite/[id]`): **Google**
  (`GoogleAuthProvider` + `signInWithPopup`) **y correo/contraseña**
  (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`,
  `sendPasswordResetEmail`). La sesión se sigue con `onAuthStateChanged`.
  Quiénes son los usuarios reales no se ve desde el código (está en Firebase
  Auth): **no verificado**.
- **Firestore, modelo plano**, colecciones raíz: `usuarios`, `negocios`,
  `cuentas`, `clientes`, `proveedores`, `proyectos`, `movimientos`, `opex`,
  `invitaciones`. Todas llevan `negocio_id` salvo `usuarios` y `negocios`
  (`negocios` lleva `miembros_uids` y `owner_uid`). Los productos van dentro de
  `proyectos.productos` (`ProductoProyecto`, `types/schema.ts:101`), no en
  colección propia.
- **Quién lee y escribe:** un archivo por colección en `lib/` —
  `negocios.ts`, `cuentas.ts`, `clientes.ts`, `proveedores.ts`, `proyectos.ts`,
  `movimientos.ts`, `opex.ts`, `invitaciones.ts`, `users.ts` — con
  `addDoc`/`setDoc`/`updateDoc`/`deleteDoc`/`writeBatch`. `movimientos` es la
  más consultada (7 `collection(db, "movimientos")`). Las cachés del proyecto
  (`cobrado`, `pagado`, `disponible`, `margen_proyectado`, `productos[].pagado`)
  las recalcula el cliente en `lib/proyectos.ts` (`recalcularProyecto`,
  `cobrosPorProducto` ~línea 298), no una función.
- **Reglas** (`firestore.rules`): `usuarios` sólo el propio documento;
  `negocios` lee quien esté en `miembros_uids`, borra sólo `owner_uid`;
  `cuentas`, `clientes`, `proyectos`, `movimientos`, `opex` por
  `isMember(negocio_id)`; `proveedores` los lee y crea cualquier autenticado y
  los edita sólo `creado_por`. `clientes` (`portal_activo == true` y `uid`),
  `proyectos` y `movimientos` (`cliente_uid`) tienen una segunda condición de
  lectura, `esClientePortal(...)`: es la del portal del cliente.
- **Índices:** 11 compuestos en `firestore.indexes.json`. `firebase.json` sólo
  despliega reglas e índices; lo hace `firebase-deploy.yml` al tocar esos tres
  archivos.
- **`invitaciones`:** sí se usa (`lib/invitaciones.ts`, `app/(app)/equipo/invitar`,
  `app/invite/[id]`). El importador de la API no la trae (arranque §7): sigue
  abierto qué pasa con ella en el corte.
- **El portal de estados de cuenta** es `portal/index.html`: una página plana,
  **no es Next.js**, con Firebase cargado desde `gstatic` (Auth por
  correo/contraseña, Firestore). Lee `clientes` (`portal_activo == true`,
  `uid`), `proyectos` y `movimientos` por `cliente_uid`. Se publica aparte en
  Netlify `cuenta-taller101` (deploy `6aa04303…`, commit `3af9c8a`, sin
  funciones; su `netlify.toml` publica `.` con `command = ""`).
  **Mike (11-sep): es de prueba, nadie lo usa.** peek101 arranca sin
  compatibilidad hacia atrás.

### 3. Qué hace Next.js — **medido**

- `next.config.ts` = `{ reactStrictMode: true }`. **No hay `output: 'export'`.**
- `netlify.toml`: `publish = ".next"`, `@netlify/plugin-nextjs`,
  `NODE_VERSION = "20"`.
- Deploy de producción (Netlify `conta-master`, deploy `6aa177e1…`, commit
  `0743541` = `main`): **1 función**, «Next.js Server Handler»
  (`@netlify/plugin-nextjs@5.15.13`, `nodejs20.x`), 3 redirects, 1 header.
- Código: App Router, **27 páginas**, todas de cliente. **Ningún `route.ts`**,
  ningún `'use server'`, ningún `getServerSideProps`. Rutas dinámicas `[id]` en
  `clientes`, `cuentas`, `negocios`, `opex`, `proveedores`, `proyectos` e
  `invite`.
- Conclusión: corre con servidor **sólo porque nadie pidió export**; no hay
  lógica de servidor que conservar. Para la fase 4 hay dos caminos y se elige
  con el build medido, no aquí:
  1. `output: 'export'` → *static assets* en el Worker (D1, lo más simple). Lo
     que estorba son las siete rutas `[id]`: con export hay que darles
     `generateStaticParams` (imposible con ids vivos) o pasarlas a `?id=` /
     ruta de cliente. Es un cambio de rutas, no de lógica.
  2. `@opennextjs/cloudflare` (lo que documenta Cloudflare para SSR). Más
     piezas, sin cambiar rutas.
  Recomendación de esta sesión: medir primero el camino 1 con `next build` en
  el runner; si pasa, no hace falta OpenNext.

### 4. La forma real de `partidas` — **medida en el código y en los datos**

- `types/schema.ts:87`:
  ```ts
  interface PartidaProyecto {
    proveedor_id: string; proveedor_nombre: string; concepto?: string;
    monto_acordado: number; monto_pagado: number;
    estado: "pendiente" | "parcial" | "pagado";
  }
  ```
  Vive como arreglo en `proyectos.partidas`. `compromiso_total` del proyecto es
  la suma de `monto_acordado` (`lib/proyectos.ts:82`).
- **No existe ningún campo de producto o ítem en la partida.** Se crean en
  `lib/proyectos.ts:104` y se actualizan en `:175-197` fusionando por
  `proveedor_id`; la pantalla (`app/(app)/proyectos/[id]/page.tsx`) sólo captura
  proveedor, concepto y monto. El importador de la API
  (`suite101-api/src/importar/mapeo.ts:386-394`) copia esos seis campos y nada
  más, con el dinero convertido a centavos por `c.dinero`.
- **Por código: 0 partidas con referencia a ítem; el 100 % sin.** No hay nada
  que «se mueva solo».
- **Cuántas partidas hay en total en `forespot`: una.** Medido el 11-sep (ver
  abajo). La «trampa» de la fase 2 —repartir a ojo las partidas sin ítem— es
  **un renglón**, de 100,000.00 pesos, en estado `pendiente`, con
  `monto_pagado` en cero.
- **Decisión de Mike (11-sep) para la fase 2:** las partidas **cuelgan del
  proyecto**. Tabla propia
  `partidas(id, proyecto_id NOT NULL → proyectos, item_id NULL → items,
  proveedor_id, proveedor_nombre, concepto, monto_acordado, monto_pagado,
  estado, …)`, dinero en centavos. No se inventa ningún ítem «general»; las
  sumas quedan iguales al centavo; dash101 liga cada partida a su ítem después,
  desde la pantalla. Es el cambio que la fase 2 hace en `suite101-api`, con su
  recado previo en el muro y `VERSION_CONTRATO` nueva.

---

## La medición del 11-sep · lo que hay hoy en Firestore

Medido por `.github/workflows/cuadre-firestore.yml` sobre `contamaster-fs`, run
`34643868352`, commit `5e3fdd7`, en verde. Los números completos están en el
comentario de ese commit. **Son las mismas cifras que sacan `contarFilas()` y
`sumarDinero()` del OrgDB**, para poder compararlas al centavo cuando exista la
puerta de servicio.

| Colección | Filas |
| --- | --- |
| usuarios | 1 |
| negocios | 3 |
| cuentas | 1 |
| clientes | 3 |
| proveedores | 1 |
| proyectos | 3 |
| movimientos | 8 |
| opex | 0 |
| invitaciones | 1 |
| **total** | **21** |

Dinero, en centavos enteros (entre paréntesis, en pesos):

| Campo | Centavos | Pesos |
| --- | --- | --- |
| `cuentas.saldo_inicial` | 14,800,000 | 148,000.00 |
| `movimientos.monto` | 31,000,000 | 310,000.00 |
| `proyectos.compromiso_total` | 10,000,000 | 100,000.00 |
| `proyectos.partidas.monto_acordado` | 10,000,000 | 100,000.00 |
| `proyectos.partidas.monto_pagado` | 0 | 0.00 |
| `proyectos.precio_venta` *(caché)* | 85,000,000 | 850,000.00 |
| `proyectos.cobrado` *(caché)* | 10,000,000 | 100,000.00 |
| `proyectos.pagado` *(caché)* | 0 | 0.00 |
| `proyectos.disponible` *(caché)* | 10,000,000 | 100,000.00 |
| `proyectos.margen_proyectado` *(caché)* | 75,000,000 | 750,000.00 |

Los marcados *(caché)* la API no los importa: los recalcula desde los
movimientos (`mapeo.ts` §2). Compararlos de frente daría un descuadre que no
existe.

**Cuatro cosas que esto cambia:**

1. **Hay una sola partida en todo `forespot`**, en 1 de los 3 proyectos:
   100,000.00 pesos, estado `pendiente`, sin pagar. Sus campos son los seis del
   código y ninguno apunta a un ítem (se buscó `producto_id`, `item_id`,
   `quell_id`, `producto` e `item`). La decisión de Mike —que las partidas
   cuelguen del proyecto— se aplica igual, pero el riesgo de la fase 2 es de un
   renglón, no de un inventario.
2. **No hay un solo producto en Firestore.** Cero, en los tres proyectos; cero
   movimientos con `producto_id`. El catálogo de ítems de la suite **nace
   vacío**: no hay nada que migrar y nada que ligar. Eso también quiere decir
   que el portal del cliente hoy no enseña ítems, porque no existen.
3. **El paso de pesos a centavos es exacto**: ningún valor necesitó redondeo.
   El importador no va a introducir ni un centavo de diferencia.
4. **No hay colecciones inesperadas** en la raíz de Firestore: las nueve que
   documenta el código son todas las que existen.

Y una comprobación de consistencia que sale sola: `precio_venta` (850,000) −
`compromiso_total` (100,000) = `margen_proyectado` (750,000). Las cachés de
Firestore están al día con sus propias partidas.

**Cuidado al leer `movimientos.monto`:** suma ingresos y egresos sin distinguir
el `tipo`, igual que `sumarDinero()` de la API. Sirve para comparar los dos
lados; no es el flujo del negocio.

---

## Otras decisiones de Mike del 11-sep

- **M9 hecho:** el repo es `github.com/mikebalcazar/dash101`; GitHub redirige
  el nombre viejo (clon y push probados). **El sitio de Netlify `conta-master`
  NO se renombra** (confirmado, como lo leyó el coordinador).
- **La v2 de `suite101-arquitectura.md` está perdida.** Vale la v1
  (`suite101-api/claude/suite101-arquitectura.md`, sha256 `360c0697…`) más lo
  que la API ya implementa y que es lo que la v2 iba a nombrar:
  `items.estado ∈ {cotizado, vendido, cancelado}`, `items.etapa ∈ 0..7` que sólo
  se mueve por `POST /orgs/:o/items/:id/etapa`, `clave` que nace en la etapa 4
  (`suite101-api/migrations/org/0001_inicial.sql:71-91`), un escritor por campo
  (`src/permisos.ts`). Los nombres de las siete etapas son los de la v1.
- El portal `cuenta-taller101` es de prueba (arriba).

## Lo que hace falta de Mike (pendiente)

- **M5 hecho el 11-sep**, aunque no como estaba escrito: sin llave JSON, con
  Workload Identity Federation. Ver arriba.
- **M6 en pausa, por decisión de Mike (11-sep):** el PAT viejo **no se revoca
  todavía**, hasta estar seguros de que ninguna aplicación de fuera de la suite
  lo usa. Cómo saberlo sin adivinar: GitHub → Settings → Developer settings →
  Personal access tokens → Fine-grained tokens muestra **«Last used»** de cada
  uno. Si pasan una o dos semanas sin uso, ya nadie lo ocupa.

---

## Fase 1 · hecha el 11-sep

**El renombre.** `conta-master` → `dash101` en todo lo que nombra al
repositorio: `OPERAR.md` de los siete, `README.md`, `package.json` y
`package-lock.json` (con `npm pkg set` y `npm install --package-lock-only`, no
a mano), `claude/venta/dash101/datos.md`, `claude/venta/peek101/datos.md`,
`descargas/venta/LEEME.md` y `descargas/sitio/LEEME.md`.

**Lo que deliberadamente no se tocó, y por qué:**

- `conta-master.netlify.app`. El sitio no se renombra (decisión 5, confirmada
  por Mike): su URL está autorizada en Firebase Auth y cambiarla rompe el login
  antes del corte.
- «Conta Master» como nombre de producto en la interfaz, el `README` y el
  título de `CONTEXTO.md`. Es cambio de producto y lo decide Mike (arranque §4).
- `lib/negocio-activo-context.tsx:15`, la llave de `localStorage`
  `conta-master:negocio-activo-id`. **Cambiarla le borraría a cada usuario el
  negocio que tiene seleccionado.** Es estado vivo, no un nombre.
- Los recados del muro y los cierres de fase de `suite101-api/claude/`
  (`CONTINUAR.md`, `COORDINACION.md`, los dos `ENCARGO-*`). Son el registro de
  lo que era cierto ese día; el muro se corrige con un recado nuevo, no
  editando el viejo.
- `suite101-repos.md`, que el arranque manda actualizar: **no existe en ningún
  repositorio.** Vive en el conocimiento de un proyecto de claude.ai, como pasó
  con la arquitectura. Queda pendiente de Mike.

**La limpieza de `CONTEXTO.md`:**

- §3.3 ya no manda sacar un PAT: el arranque es el push en seco. Y queda dicho
  algo que estos documentos repetían mal: **este archivo nunca guardó el valor
  del token** (medido: cero coincidencias de `github_pat_` en todo el
  repositorio). Los arranques que dicen «CONTEXTO.md, con el PAT adentro» están
  equivocados.
- §3.4: los seis valores de la configuración web de Firebase **se borraron del
  archivo**. Son públicos por diseño en un SDK de cliente —lo que protege los
  datos son las reglas—, pero una llave en un `.md` se copia sin pensar. Viven
  en las variables de Netlify y en `.env.local.example`.
- §4 y §10: los comandos ya no clonan ni empujan con un token en la línea.
- §3.2 gana un renglón medido: **ya existía un Workload Identity Federation en
  este proyecto** —pool `github-pool`, cuenta `firebase-adminsdk-fbsvc`— que es
  el que usa `firebase-deploy.yml`. El de M5 es **otro pool, a propósito**:
  `github`, con la cuenta `lector-firestore`, que sólo lee. Medir no debe
  necesitar una cuenta de administrador.

**`OPERAR.md`, las siete copias.** Se reescribieron desde una plantilla, así
que salen idénticas por construcción: §1 (push en seco en vez de PAT), §6 (lo
que alcanza el proxy depende de la sesión, y se mide), §8 (dos reglas nuevas:
el prefijo `/s101/` y que nunca se captura `forespot`), §9 (el PAT sale de la
lista de Mike) y una **§10 nueva** con el formato de encargo, que es lo que
pedía D7. De paso, los `curl` perdieron el `Authorization: Bearer $T`, que se
había quedado sin origen al irse el PAT.

**Lo que no se pudo integrar:** el recado de roster101 sobre §6 que el arranque
manda incluir. Está en `claude/roster101-handoff.md` §7 **del proyecto de
claude.ai**, no en ningún repositorio, y esta sesión no lo alcanza. Si alguien
lo tiene, es un párrafo en las siete copias.

---

## Fase 2 · hecha el 11-sep

**`partidas` ya es tabla propia en `suite101-api`** (PR #32, squash `03a0830`;
contrato **0.3.0**). Recado previo en el muro:
`2026-09-11-2230-jr-antes-de-tocar-la-api-partidas.md`.

- `partidas(id, proyecto_id NOT NULL, item_id NULL, proveedor_id,
  proveedor_nombre, concepto, monto_acordado, monto_pagado, estado, …)`, en
  centavos. `proyecto_id` obligatorio e `item_id` nulo, como decidió Mike.
- La migración `0002` la aplica el Durable Object al despertar: mueve cada
  partida del JSON a un renglón con id `<proyecto>-p<n>`, deja al proyecto el
  caché **`compromiso`** (Σ acordado; es el `compromiso_total` de aquí) y quita
  la columna vieja. **El SQLite del DO aceptó `DROP COLUMN`**: el riesgo que
  dejé dicho no se dio.
- `monto_pagado` y `estado` de la partida son **cachés** que la API recalcula
  desde los egresos del proyecto con ese proveedor como contraparte — la
  misma regla de `lib/proyectos.ts:recalcularProyecto` de esta app, así que
  las cifras van a coincidir cuando dash101 lea de la API.
- dash101 es el único que escribe partidas, por el CRUD genérico
  (`POST/PATCH/DELETE /orgs/:o/partidas`) con `proyecto_id`, `item_id`,
  `proveedor_id`, `proveedor_nombre`, `concepto`, `monto_acordado`. Mandar
  `partidas` dentro del proyecto contesta `403 campo_no_permitido`. Quien no
  tiene `ve_costos` no lee `/partidas` ni ve `compromiso` ni `pagado_prov`.
- El importador produce las filas con el mismo id determinista, así que
  reimportar actualiza en vez de duplicar. El cuadre nombra
  `partidas.monto_acordado`; `partidas.monto_pagado` y `proyectos.compromiso`
  van entre los recalculados. `scripts/cuadre-firestore.py` ya habla esos
  nombres (commit `acc09c2` de este PR).

**Cómo se midió**, en este orden:

1. `suite101-api/pruebas/migracion-0002.py`: sqlite3 en memoria, `0001`
   aplicada, datos que imitan a `forespot`. Mismas filas antes y después en
   seis tablas; Σ `monto_acordado` 10,350,049 → 10,350,049 y Σ `monto_pagado`
   250,051 → 250,051 al centavo; `foreign_key_check` e `integrity_check`
   limpios; aplicarla dos veces truena. Corre en el corredor antes de publicar.
2. vitest dentro de workerd con el DO de verdad: **94 en verde** (85 + 9
   nuevas), incluida la que prueba que el DO despierta en versión 2.
3. `desplegar.yml`: el primer run (`34648868547`) salió **66/67** por una
   expectativa vieja del humo (pedía versión 1). Se corrigió en #33
   (`d0f7d2b`) y el run `34649196747` dio **67/67**. Producción y staging
   contestan `version 0.3.0 · contrato 0.3.0` en `/salud`, medido desde esta
   sesión.

**No verificado:** que el OrgDB de `forespot` ya haya corrido `0002`. Lo hace
en la primera petición que reciba después del despliegue, y desde aquí no hay
sesión para dársela. Se comprueba solo cuando dash101 o Mike entren.

---

## Fase 3 · lectura y sesión, hecha el 11-sep

**dash101 ya lee desde `suite101-api`** cuando `NEXT_PUBLIC_FUENTE=api`
(PR #12). Por omisión sigue en Firestore: en producción no cambia nada hasta
que se fije la variable en Netlify. Semáforo previo: `eea16fb`.

- `lib/fuente.ts` decide la fuente; `lib/api/cliente.ts` habla con la API
  (`/s101` en el navegador, `NEXT_PUBLIC_API_ORIGEN` en node, cookie `s101`,
  `X-App: dash101`); `lib/api/adaptar.ts` convierte centavos → pesos y
  ISO → `Timestamp`, y arma los cachés que Firestore guardaba (`saldo_actual`,
  `disponible`, `margen_proyectado`, `productos[].pagado`, `cliente_nombre`…)
  con un join en memoria; `lib/api/leer.ts` tiene las mismas firmas que los
  módulos de `lib/`. Las pantallas no se tocaron.
- Con `api`, toda escritura truena con «todavía no se escribe …» — nada cae a
  Firestore por debajo. Invitaciones: lista vacía, pues la API no las tiene.
- Sesión: `lib/auth-context.tsx` sale de `/s101/yo`; `app/login` pide código
  (en staging la API lo devuelve como `codigo_prueba`) o PIN. Con `firestore`
  sigue Google, igual que siempre.
- Proxy `/s101/*`: `netlify.toml` a producción con `X-App: dash101` (status
  200, force) y `next.config.ts` a staging en `next dev`.
- Esquema: `finiquito` entre los estados de proyecto y `personal` / `otro`
  entre las contrapartes, porque la API los tiene. El distintivo de
  `finiquito` usa `bg-cream text-ink-muted`: no hay paleta «sage».
- Roles: la API dice `owner|admin|socio|staff`; la app conoce
  `owner|socio|viewer`. `owner` y `admin` → `owner`, `staff` → `viewer`. El
  superadmin se ve como owner de todos los negocios de la org.

**Cómo se midió:** `pruebas/lectura-api.spec.ts` (vitest, node) contra la org
`demo` de staging, con guarda en `/salud`. Banco 365,000 y Caja −3,500;
Cocina Ramírez 262,000 / 140,000 / 33,500 / 50,500 con `disponible` y `margen`
por las fórmulas de Firestore; partidas parcial y pagado con lo que calculó
la API; ítems con lo pagado por ítem (120,000 y 20,000) y Σ montos =
precio_venta; cuatro movimientos con nombres y ordenados; opex con estimado;
escribir truena. **15 de 15**, `tsc` limpio, `next build` completo. El mismo
trío corre en `.github/workflows/pruebas.yml` en cada PR.

**No verificado:** el login por código en un navegador de verdad (solo se
midió en node), y la app completa con `FUENTE=api` en Netlify — para eso
hay que fijar las tres variables en el sitio, cosa que decide Mike.

---

## Fase 3 · escritura y «abrir portal», hecha el 11-sep

**dash101 ya escribe en `suite101-api`** con `NEXT_PUBLIC_FUENTE=api` (PR #13
de dash101; antes, PR #34 de la API, contrato **0.3.1**). Por omisión sigue en
Firestore.

- `lib/api/escribir.ts` tiene las mismas firmas que los `create*/update*/
  delete*` de `lib/`: recibe pesos y `Date`, manda centavos y `AAAA-MM-DD`,
  y no manda ningún caché (la API los recalcula; si se mandan, 403).
- **Tres reglas nuevas**, porque la suite no es Firestore:
  1. *El precio de venta es la suma de los ítems.* Un proyecto capturado con
     precio y sin productos se guarda como **un ítem con el nombre del
     proyecto** y ese monto. Con productos, el precio es su suma y el campo
     «precio» se ignora (la pantalla ya avisaba «≠ precio venta»).
  2. *Un ítem no se borra: se cancela.* Quitar un producto lo deja en
     `cancelado`; la lectura no lo enseña ni la API lo suma.
  3. *Lo que tiene filas colgando no se borra.* Un proyecto con movimientos
     truena con «cámbialo a Cerrado»; un cliente con ítems (aunque
     cancelados) o una cuenta con movimientos contestan `409 en_uso`, que
     aquí se vuelve un mensaje que la pantalla enseña tal cual.
- Ítems por id (los que vienen se actualizan, los nuevos se crean, los que no
  vienen se cancelan); partidas por proveedor, como lo hacía Firestore, y las
  que sobran sí se borran. Transferencias: se borran los dos movimientos.
- **«Abrir portal»** (`lib/portal.ts`, `components/acceso-portal.tsx`): con
  la API es `POST /clientes/:id/acceso`; **desactivar** es `DELETE
  …/acceso`, que apaga `accesos.activo` en el D1 (antes no existía: la
  bandera `portal_activo` sola no cerraba nada). **Cambiar el PIN** se hace
  aquí mismo (mismo POST) en vez de mandar una liga, porque el PIN lo guarda
  la API y no un proveedor. Reactivar pide PIN siempre.
- Lo que la suite no tiene y se acepta sin guardar: `negocios.descripcion`,
  `cuentas.numero`, `opex.descripcion`, los nombres denormalizados.
- La API ganó tres cosas para esto (PR #34): `DELETE …/acceso`, `409 en_uso`
  (antes `500 falla_interna` por la llave foránea) y `DELETE /admin/orgs/:o`
  **solo fuera de producción**, con el que se reinició y resembró `demo`
  después de que la medición de las llaves foráneas la ensuciara.

**Cómo se midió:** `pruebas/escritura-api.spec.ts` en una org propia de
staging (`prueba-escritura`, se crea al empezar y se reinicia al terminar;
`demo` no se toca). Crea negocio, cuentas, cliente, proveedor y proyecto con
partida; un ingreso al producto y un egreso al proveedor dejan cobrado 2,000,
pagado 700.25, disponible 1,299.75, partida parcial, Banco 12,000.50 y Caja
−700.25; editar cambia nombre, productos por id, partida a pagada, precio
7,500 = Σ ítems; quitar un producto lo cancela; el portal: entra con PIN y
ve `/peek` (200), PIN nuevo (viejo 401, nuevo 200), desactivar (`/peek`
403), reactivar (200); opex; borrar un movimiento recalcula; borrar proyecto
con movimientos truena y sin ellos se va. **15 de 15** más los 14 de
lectura, `tsc` limpio, `next build` completo. Los dos archivos corren uno a
la vez (`fileParallelism: false`): entran con el mismo correo y el segundo
código invalidaba al primero.

**Hallazgo para la fase 5 (corte):** el importador de la API deja en
`precio_venta = 0` cualquier proyecto que venga **sin productos**, porque el
precio es un caché que sale de los ítems y no crea ninguno. `forespot` tiene
proyectos así (la medición de la fase 0 contó 0 productos). El cuadre no lo
vio porque `precio_venta` no está entre sus llaves. Lo razonable es que el
importador aplique la misma regla 1 de arriba (un ítem con el nombre del
proyecto y el precio) y que el cuadre compare `proyectos.precio_venta`. No
se hizo aquí: es cambio del importador y va con aviso previo.

**No verificado:** las pantallas en un navegador con `FUENTE=api` (todo se
midió por los módulos de `lib/`, que es lo que las pantallas llaman). Que
`admin` de la suite deba escribir como `owner` en dash101 es decisión de
Mike.

---

## Decisiones de Mike del 11-sep (noche), una por una

| Decisión | Qué eligió | Estado |
| --- | --- | --- |
| Importador: proyecto sin productos | **Regla del producto único** | Hecho: suite101-api #36, cuadre en dash101 #16 |
| Login con la API | **También Google** | API lista (#37: boleto y `/auth/canje`); app lista (este PR); faltan las credenciales de Google, que pone Mike (guía en el chat) |
| Roles: `admin` de la suite en dash101 | **admin = propietario** | Queda como está |
| Regla del wall por entrega | **A los siete repositorios** | Hecho: OPERAR.md §5.6 ×7, copias idénticas |
| Ver las pantallas con la API | **Deploy preview en Netlify**, variables puestas por mí con el conector | Hecho: dash101 #15; preview `deploy-preview-15--conta-master.netlify.app`, `/s101/salud` contesta staging |
| PAT viejo | **Dejarlo vivo por ahora** | Sin fecha; no se vuelve a preguntar hasta que Mike lo saque |

**Google, cómo queda armado:** el navegador va a `/s101/auth/google?volver_a=<app>/login`;
Google regresa al Worker; el Worker abre la sesión, deja un boleto de un
minuto y un solo uso (`tickets` en el D1, migración 0002) y manda al
navegador a la app con `?entrada=`; la app lo canjea por `/s101/auth/canje`
y la cookie queda en su origen. Sin credenciales, `/auth/google` contesta
501 y la pantalla lo dice. Las credenciales entran como secretos del
repositorio `suite101-api` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) y
`desplegar.yml` las lleva a los dos Workers; un chat nunca las ve.

**Las pruebas contra staging ya no se pisan** (dash101 #16): org por corrida,
entrada con reintento y una corrida a la vez. El 11-sep tres corridas a la
vez compartían una org y se borraban entre sí.

---

## Lo que sigue · fase 3, tercera parte, y fase 4

Google en el login con `api` (el `redirect_uri` de `/auth/google` cae fuera
de `/s101/`: se resuelve en la API o se queda con correo, código y PIN).
Probar las pantallas en el navegador con las tres variables puestas en
`next dev` o en un deploy preview de Netlify. El importador con la regla del
precio (arriba). Después, fase 4: dash101 como Worker (OpenNext o
`output: 'export'`) y fase 5, el corte.
