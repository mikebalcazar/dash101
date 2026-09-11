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

---

## Fase 0 · las cuatro mediciones

### 1. El reporte de cuadre de `forespot` hoy — **no verificado**

- Se lee sólo con sesión de superadmin en `GET /admin/importar`. Esta sesión
  no la tiene y no la pide.
- **Decisión de Mike (11-sep):** queda no verificado hasta que exista M5 (la
  cuenta de servicio de sólo lectura, secreto `FIREBASE_SA_LECTURA`). **No se da
  por buena la frase «cuadrados» del 9-sep.**
- Cómo se va a medir: con M5, un guion en el runner lee Firestore y saca filas y
  sumas por colección; del lado de la API, `sumarDinero()` y `contarFilas()`
  (`suite101-api/src/org-db.ts:586` y `:670`). Los dos números se comparan al
  centavo. Para que el runner alcance `/admin/importar` hace falta la puerta de
  servicio que el arranque pide proponer en el muro antes de tocar la API
  (fase 5).

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

### 4. La forma real de `partidas` — **medida en el código; el conteo de datos no**

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
- **Cuántas partidas hay en total en `forespot`: no verificado.** Están en
  Firestore, y ni el cuadre las cuenta (`contarFilas` cuenta proyectos, no sus
  partidas). Se mide con M5, o con el reporte de cuadre de Mike, que sí trae
  `proyectos.partidas.monto_acordado` y `monto_pagado`.
- **Decisión de Mike (11-sep) para la fase 2:** las partidas **cuelgan del
  proyecto**. Tabla propia
  `partidas(id, proyecto_id NOT NULL → proyectos, item_id NULL → items,
  proveedor_id, proveedor_nombre, concepto, monto_acordado, monto_pagado,
  estado, …)`, dinero en centavos. No se inventa ningún ítem «general»; las
  sumas quedan iguales al centavo; dash101 liga cada partida a su ítem después,
  desde la pantalla. Es el cambio que la fase 2 hace en `suite101-api`, con su
  recado previo en el muro y `VERSION_CONTRATO` nueva.

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

- **M5** cuenta de servicio de Firebase de sólo lectura → sin ella no hay
  cuadre ni conteo de partidas desde el runner.
- **M6** revocar el PAT viejo. `CONTEXTO.md` ya **no** trae el valor del PAT
  (medido: 0 coincidencias de `github_pat_`/`ghp_`; §51-53 dicen que vivía en
  `/tmp`), pero sí trae una llave web de Firebase (patrón `AIza…`). Esa llave es
  pública por diseño en un SDK de cliente, pero no tiene por qué vivir en un
  `.md`: se saca en fase 1 y se deja dicho por qué.

---

## Lo que sigue · fase 1 (nombre y limpieza)

1. Menciones de `conta-master` → `dash101`: `OPERAR.md` (los siete repos),
   `descargas/venta/LEEME.md`, `suite101-repos.md`, el muro. En este repo:
   `README.md:29`, `package.json` (`"name"`), y las URL de `api.github.com` en
   `OPERAR.md`. **No** se toca `verificar-publicado.yml:30`
   (`conta-master.netlify.app` es el sitio, y el sitio no se renombra).
2. Sacar de `CONTEXTO.md` el renglón del PAT y la llave `AIza…`.
3. `OPERAR.md` ×7 (D7): §1 push en seco, §6 depende de la sesión, §8 patrón
   `/s101/` y org `demo`, más la sección de formato de encargo que está en
   `suite101-api/claude/formato-de-encargo.md`. Siete copias idénticas en un
   solo trabajo.
4. Comprobar que Netlify siga en verde tras el renombre: el push de este PR es
   la prueba (estado del commit en `main`).
