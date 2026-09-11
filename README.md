# Conta Master

Plataforma de gestión financiera multi-negocio para uso interno (3 usuarios).

Stack: Next.js 15 + Firebase (Firestore + Auth) + Tailwind + Netlify.

## Estado actual (commit inicial)

- ✅ Scaffold Next.js + TypeScript + Tailwind
- ✅ Paleta cream + cool ink/mint/mauve/sky locked en `tailwind.config.ts`
- ✅ Firebase client SDK configurado (lee de env vars)
- ✅ Auth con Google + Email/Password
- ✅ Rutas protegidas (`(app)/...` requiere login)
- ✅ Sidebar icon-only + Topbar
- ✅ Login page
- ✅ Dashboard placeholder (sin datos reales aún)
- ✅ `netlify.toml` para auto-deploy

## Lo que falta para que funcione end-to-end

1. **Completar Firebase setup** (si no lo has hecho):
   - Crear proyecto en https://console.firebase.google.com
   - Habilitar Firestore (Production mode, region `nam5`)
   - Habilitar Authentication → Google + Email/Password
   - Project Settings → Web app → copiar `firebaseConfig`

2. **Conectar Netlify al repo**:
   - https://app.netlify.com → Add new site → Import from GitHub
   - Seleccionar `dash101`
   - Netlify detecta Next.js automático

3. **Agregar env vars en Netlify**:
   - Site settings → Environment variables → agregar todas las del `.env.local.example`
   - Valores van del `firebaseConfig` que copiaste
   - **Marcar "Trigger deploy after save"** o redeployar manualmente

4. **Autorizar dominio Netlify en Firebase**:
   - En Firebase Console → Authentication → Settings → Authorized domains
   - Add: `<tu-site>.netlify.app`

## Desarrollo local (opcional)

Si quieres correr local:
```bash
cp .env.local.example .env.local
# rellenar valores
npm install
npm run dev
```

## Flujo de iteración

Pides cambios en el chat → Claude modifica + commit + push → Netlify deploya automático.
