# Conta Master — Contexto completo del proyecto

Este documento contiene toda la información necesaria para retomar el desarrollo desde cero.
**Léelo primero antes de cualquier iteración.**

---

## 1. Qué es

**Conta Master** es una plataforma web de gestión financiera multi-negocio para Mike Balcázar + 2-3 socios/familia. Permite llevar contabilidad simple pero completa de varios negocios/empresas simultáneamente, con proyectos, movimientos, cuentas, OPEX recurrentes y proyección de flujo de caja.

- **Live:** https://conta-master.netlify.app
- **Repo:** https://github.com/mikebalcazar/conta-master
- **Firebase project:** `contamaster-fs`
- **GitHub user:** `mikebalcazar`
- **Estilo comunicación con Mike:** español, "caveman style" — muy compacto, denso, sin florituras, oraciones cortas.

---

## 2. Stack

- **Framework:** Next.js 15 (App Router) + React 19 stable
- **Estilos:** Tailwind CSS
- **DB + Auth:** Firebase Firestore + Firebase Auth (Google + Email/Password)
- **Charts:** Recharts
- **Iconos:** `@tabler/icons-react`
- **Deploy:** Netlify (código Next.js) + GitHub Actions (rules/indexes Firestore, via Workload Identity Federation)
- **Sin Cloud Functions** (plan Spark). Agregados calculados cliente-side.
- **Sin Firebase Storage** (plan Spark). No hay comprobantes/adjuntos.

---

## 3. Setup deploy (crítico)

Dos pipelines corren **en paralelo** desde push a `main`:

### 3.1 Netlify — código Next.js
- Auto-detecta cambios. ~1-2 min a producción.
- Config en `netlify.toml` con `@netlify/plugin-nextjs`
- Env vars ya configuradas (6 keys `NEXT_PUBLIC_FIREBASE_*`)

### 3.2 GitHub Actions — Firestore rules + indexes
- Workflow en `.github/workflows/firebase-deploy.yml`
- Se dispara en cambios a `firestore.rules`, `firestore.indexes.json`, `firebase.json`
- **Auth:** Workload Identity Federation (WIF) — cero secret keys en repo
- Provider: `projects/869991865343/locations/global/workloadIdentityPools/github-pool/providers/github-provider`
- Service account: `firebase-adminsdk-fbsvc@contamaster-fs.iam.gserviceaccount.com`
- ~40-60 seg. Índices tardan 2-5 min extras en construirse dentro de Firestore.

### 3.3 Token GitHub
- Fine-grained PAT en `/tmp/.gh_token` (container-ephemeral — resetea entre chats)
- **NO tiene permiso `workflow`** → archivos en `.github/workflows/` los creó Mike manualmente en GitHub web
- Token value (si expira, regenerar):
  ```
  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
  ```

### 3.4 Firebase config web
```
apiKey: AIzaSyAlyfXN6W4l4tQ0UcWe7KyjGzKGw0R_TX8
authDomain: contamaster-fs.firebaseapp.com
projectId: contamaster-fs
storageBucket: contamaster-fs.firebasestorage.app
messagingSenderId: 869991865343
appId: 1:869991865343:web:8e6f928bafa7d390ce65ca
```
Dominio `conta-master.netlify.app` autorizado en Firebase Auth.

---

## 4. Workflow de desarrollo

Mike es 100% hands-off en dev. NO quiere instalar nada local.

**Flujo estándar:**
1. Claude clona repo con el PAT: `git clone https://x-access-token:${PAT}@github.com/mikebalcazar/conta-master.git`
2. Edita archivos con `str_replace` / `create_file` / `bash cat >`
3. `npm install && npm run build` para validar
4. `git add . && git commit -m "..." && git push`
5. Netlify + GitHub Actions deployan solos en ~2 min
6. Mike prueba en producción

**Nunca correr `firebase deploy` local** — todo por GitHub Actions.

---

## 5. Modelo de datos (Firestore)

Todas las colecciones. Los IDs son auto-generados por Firestore excepto donde se indica.

### `/usuarios/{uid}`
```ts
{
  email: string,           // lowercase
  nombre: string,
  negocios_acceso: string[],  // IDs para query rápida (array-contains)
  memberships: {           // Map: negocio_id → detalles
    [negocio_id]: {
      rol: "owner" | "socio" | "viewer",
      scope: "all" | "proyectos",
      proyectos_acceso?: string[],
      invited_by_uid?: string,
      invited_at?: Timestamp
    }
  },
  creado_at: Timestamp
}
```

### `/negocios/{id}`
```ts
{
  nombre, descripcion, rfc, moneda: "MXN"|"USD",
  owner_uid: string,       // UID del creador original
  miembros_uids: string[], // TODOS los que tienen acceso (owner + socios + viewers)
  creado_at, creado_por
}
```

### `/cuentas/{id}`
```ts
{
  nombre, tipo: "banco"|"caja"|"credito"|"otro",
  banco, numero, moneda,
  saldo_inicial: number,
  saldo_actual: number,    // calculado por recalcularCuenta()
  negocio_id, creado_at, creado_por
}
```

### `/clientes/{id}` — por negocio
```ts
{ nombre, rfc, email, telefono, notas, negocio_id, creado_at, creado_por }
```

### `/proveedores/{id}` — **GLOBAL** (compartido cross-negocios)
```ts
{ nombre, rfc, categoria, email, telefono, terminos_pago_default, notas, creado_at, creado_por }
```

### `/proyectos/{id}`
```ts
{
  nombre, descripcion,
  cliente_id, cliente_nombre,   // denormalized
  negocio_id, negocio_nombre,   // denormalized
  precio_venta: number,
  compromiso_total: number,     // suma partidas
  cobrado: number,              // calculado
  pagado: number,               // calculado
  disponible: number,           // cobrado - pagado
  margen_proyectado: number,    // precio_venta - compromiso_total
  partidas: PartidaProyecto[],
  estado: "planeando"|"activo"|"pausado"|"cerrado",
  fecha_inicio, fecha_fin_estimada, fecha_cierre,
  creado_at, creado_por, actualizado_at
}

PartidaProyecto = {
  proveedor_id, proveedor_nombre, concepto,
  monto_acordado, monto_pagado, estado: "pendiente"|"parcial"|"pagado"
}
```

### `/movimientos/{id}`
```ts
{
  tipo: "ingreso"|"egreso",     // NO "transferencia" (deprecated)
  monto, fecha,
  cuenta_id, cuenta_nombre,
  transfer_id?: string|null,    // Si es parte de una transferencia (2 movs ligados)
  cuenta_destino_id, cuenta_destino_nombre,  // DEPRECATED, mantenidos por compat
  proyecto_id, proyecto_nombre, // opcional
  contraparte_id, contraparte_tipo, contraparte_nombre,  // cliente/proveedor/cuenta/opex/ajuste
  negocio_id, descripcion, categoria,
  creado_at, creado_por
}
```

**Transferencia = 2 movs ligados por `transfer_id` compartido.**
- Egreso en cuenta origen + Ingreso en cuenta destino
- Ambos con mismo `transfer_id`
- Al borrar uno, se borra el par (deleteMovimiento detecta)
- Helper `createTransferencia()` ya está en `lib/movimientos.ts` pero **aún no expuesto en UI**

### `/opex/{id}` — gastos recurrentes
```ts
{
  nombre, tipo: "egreso"|"ingreso",
  monto, moneda,
  frecuencia: "semanal"|"mensual"|"anual",
  dia_semana?: number,          // 0-6 (0=domingo) para semanal
  dia_del_mes?: number,         // 1-31 para mensual (auto-ajusta si mes tiene menos días)
  fecha_inicio, fecha_fin?,
  cuenta_id?, cuenta_nombre?,   // preferida (solo referencia, no mueve saldos)
  categoria, activo: boolean,
  negocio_id, descripcion,
  creado_at, creado_por
}
```

### `/invitaciones/{id}`
```ts
{
  email: string,           // lowercase, para matching estricto
  negocio_id, negocio_nombre,
  invited_by_uid, invited_by_nombre, invited_by_email,
  rol: "owner"|"socio"|"viewer",
  scope: "all"|"proyectos",
  proyectos_ids?: string[], proyectos_labels?: string[],
  estado: "pendiente"|"aceptada"|"revocada"|"expirada",
  creado_at, expira_at,    // 7 días default
  aceptada_at?, aceptada_por_uid?
}
```

---

## 6. Rules Firestore (crítico — no romper)

**Patrón principal usado:** `request.auth.uid in negocio.miembros_uids` (array-contains).
**NO usamos** membership map de userDoc para checks de rules — Firestore Rules tiene comportamiento inconsistente con acceso dinámico a maps + `.get()` con default. Este patrón se probó y falla silenciosamente.

**Trade-off asumido en MVP:**
- Rol/scope granular (viewer no puede crear, scope=proyectos) → **enforcement solo en UI**
- Rules solo validan: (a) auth, (b) membership básica via `miembros_uids`, (c) ownership via `owner_uid`
- Para 3-user internal app con trusted users, aceptable. Backlog: endurecer al escalar.

**Helpers principales en rules:**
```
isMember(negocioId)    → uid in negocio.miembros_uids
isOwnerUid(negocioId)  → uid == negocio.owner_uid
```

**Invitaciones:** `allow read: if true;` (público) — invitado no está auth cuando abre el link. IDs son UUIDs.

---

## 7. Estado de features

### ✅ Implementado

- Auth Google + Email/Password + rutas protegidas
- Layout con sidebar icon-only + topbar con selector de negocio + botón Movimiento
- Multi-tenant: negocio activo persistido en localStorage
- CRUD completo: Negocios · Cuentas · Clientes · Proveedores · Proyectos (con partidas dinámicas) · Movimientos · OPEX
- **Movimientos:** form compacto (monto grande, toggle Ingreso/Egreso, campos: fecha, negocio, proyecto, cuenta, contraparte); nota expandible; botón "+ Crear nuevo" inline en dropdowns de proyecto/cliente/proveedor
- **Recálculo automático:** cuentas (`saldo_actual`) y proyectos (`cobrado`, `pagado`, `disponible`, partidas.`monto_pagado`) después de crear/borrar movimiento
- **Dashboard:** capital total, cobrado/pagado del mes, disponible en proyectos, cuentas, proyectos activos, actividad reciente
- **OPEX:** frecuencias semanal/mensual/anual, toggle activo/pausado, stats de neto mensual
- **Proyección 52 semanas:** chart Recharts + tabla; alerta cuando saldo cruza 0
- **Equipo:** memberships con rol+scope+proyectos_acceso; invitaciones con email match + expiración 7 días; página pública `/invite/[id]` con Google **y email+password** (para invitados no-Google como Hotmail)
- **Transferencias en DB:** helper `createTransferencia()` que crea 2 movs ligados con `transfer_id`; `deleteMovimiento` respeta el par
- Auto-cleanup de movs con tipo="transferencia" del formato viejo

### ⏳ Pendiente (backlog)

**Alta prioridad:**
1. **UI de transferencias:** exponer `createTransferencia()` en el form. Actualmente ya en lib pero no hay botón/opción en el UI.
2. **Endurecer rules Firestore:** cuando escale, agregar rol-based checks. Requiere resolver el issue de acceso a memberships map en rules.
3. **Editar rol/scope de miembro ya invitado:** actualmente solo se puede remover.

**Media prioridad:**
4. **Cobros/pagos calendarizados en proyectos:** agregar `fecha_esperada` a partidas para que se sumen a la proyección de flujo.
5. **Reportes:** métricas por proyecto/negocio/rango. Actualmente solo el dashboard.
6. **Comprobantes/adjuntos:** requiere Blaze plan (Firebase Storage). O usar Cloudinary free tier.
7. **Email real en invitaciones:** actualmente owner genera link y lo copia manualmente para mandar por WhatsApp/email. Podría integrarse SendGrid/Mailgun.

**Baja prioridad:**
8. Migración a Cloud Functions (Blaze) para agregados robustos sin race conditions.
9. Wizard modal para movimientos (alternativa al form actual).
10. Actividad/log por miembro (audit trail).

---

## 8. Aprendizajes y gotchas

### 8.1 Firestore Rules
- **NO usar `.get()` con default en maps de userDoc para checks de acceso.** El pattern `userDoc().memberships[negocioId].get('rol', 'viewer') in ['owner', 'socio']` falla silenciosamente aunque los datos existan. Usa el patrón simple `uid in negocio.miembros_uids`.
- **`in` operator en maps con key dinámico** puede tener comportamiento inesperado. Preferir `array-contains` cuando sea posible.
- **Migración perezosa de datos** con queries que violan rules falla silenciosa (try/catch). Siempre usa queries que respeten las rules (por ejemplo `where miembros_uids array-contains` en vez de `where owner_uid ==` que las rules pueden rechazar).

### 8.2 Firestore + Client-side agregados
- Sin Cloud Functions, agregados se recalculan cliente-side después de mutaciones (`recalcularCuenta`, `recalcularProyecto`)
- Usan `runTransaction` para atomicidad
- Race condition posible si 2 usuarios registran simultáneamente. Aceptable para 3 users. Migrar a Cloud Functions cuando crezca.

### 8.3 Deploy
- GitHub Actions solo dispara si cambian archivos específicos (`firestore.rules`, `firestore.indexes.json`, `firebase.json`). Si mudas rules, verifica que se dispare.
- Firestore índices tardan 2-5 min extra en construirse después del deploy. Si un query devuelve "requires an index", esperar.
- Rules propagan globalmente en ~1 min después del deploy.

### 8.4 UX
- Popup de Google login puede quedar detrás del browser (Windows). Documentar. O migrar a redirect si molesta.
- Invitaciones: read público de `/invitaciones/{id}` es necesario porque el invitado no está auth. IDs UUID son suficiente barrera.
- Email+password login es imprescindible para invitados con emails no-Google (Hotmail, Yahoo).

---

## 9. Estructura del repo

```
/
├── package.json (next ^15.5, react ^19, firebase ^11.5, @tabler/icons-react ^3.30, recharts, clsx)
├── tailwind.config.ts (paleta cream/ink/mint/mauve/sky)
├── netlify.toml
├── firebase.json + .firebaserc
├── firestore.rules + firestore.indexes.json
├── .env.local.example
├── .github/workflows/firebase-deploy.yml
├── types/schema.ts               ← todos los types + labels + COLLECTIONS
├── lib/
│   ├── firebase.ts               ← SDK init con env vars
│   ├── auth-context.tsx          ← Google + Email/Password + ensureUserDoc
│   ├── users.ts                  ← memberships helpers + migración perezosa
│   ├── negocio-activo-context.tsx ← global provider, localStorage
│   ├── format.ts                 ← formatMonto, formatDate
│   ├── negocios.ts               ← CRUD + removeMiembro batch + listMiembros
│   ├── cuentas.ts                ← CRUD
│   ├── clientes.ts               ← CRUD
│   ├── proveedores.ts            ← CRUD globales
│   ├── proyectos.ts              ← CRUD + recalcularProyecto transaccional
│   ├── movimientos.ts            ← CRUD + createTransferencia + recalcularCuenta
│   ├── opex.ts                   ← CRUD + estimarMensual
│   ├── proyeccion.ts             ← algoritmo 52 semanas
│   └── invitaciones.ts           ← CRUD + aceptarInvitacion transaccional
├── components/
│   ├── sidebar.tsx               ← icon-only 64px
│   └── topbar.tsx                ← greeting + selector negocio + botón Movimiento
├── app/
│   ├── layout.tsx                ← RootLayout con AuthProvider
│   ├── page.tsx                  ← redirect
│   ├── globals.css
│   ├── login/page.tsx            ← Google + Email/Password
│   ├── invite/[id]/page.tsx      ← PÚBLICA — accept flow
│   └── (app)/                    ← protected layout
│       ├── layout.tsx            ← wrap NegocioActivoProvider + Sidebar + Topbar
│       ├── dashboard/page.tsx
│       ├── negocios/(list, nuevo, [id])
│       ├── cuentas/(list, nueva, [id])
│       ├── clientes/(list, nuevo, [id])
│       ├── proveedores/(list, nuevo, [id])
│       ├── proyectos/(list, nuevo, [id])
│       ├── movimientos/(list, nuevo)
│       ├── opex/(list, nueva, [id])
│       ├── flujo/page.tsx        ← proyección 52 semanas
│       └── equipo/(list, invitar)
```

---

## 10. Comandos útiles

```bash
# Clonar (Claude, container fresh)
GH_TOKEN=$(cat /tmp/.gh_token)
git clone "https://x-access-token:${GH_TOKEN}@github.com/mikebalcazar/conta-master.git" /home/claude/repo

# Sync + config
cd /home/claude/repo
git remote set-url origin "https://github.com/mikebalcazar/conta-master.git"
git config user.email "mike@conta-master.local"
git config user.name "Mike Balcázar"

# Build
npm install
npm run build

# Push
git add -A
git commit -m "feat: ..."
git push "https://x-access-token:${GH_TOKEN}@github.com/mikebalcazar/conta-master.git" main
```

---

## 11. Convenciones de estilo

- **Paleta:**
  - `bg` #FBF8F2 (cálido) · `cream` #F3EEE3 · `white`
  - `ink` #1E2A3A (charcoal frío, botones/nav)
  - Ingreso: `mint-50/900` (verde frío)
  - Egreso: `mauve-50/900` (rosado apagado)
  - Transferencia/info: `sky-50/900` (azul frío)
- **Cards:** `rounded-2xl` / `rounded-3xl`, hover con `-translate-y-px`
- **Sidebar:** icon-only 64px
- **Formatos monto:** `formatMonto(n, moneda, {short?: true})` de `lib/format.ts`
- **Copywriting:** conciso, español, sin emojis excepto en errores/success específicos
