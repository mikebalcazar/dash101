# dash101 — datos

| | |
|---|---|
| **Nombre** | dash101 (repositorio todavía `conta-master`) |
| **Versión** | 0.1.0 |
| **Estado** | En producción, uso interno. Tres usuarios reales |
| **URL** | https://conta-master.netlify.app |
| **Portal del cliente** | https://cuenta-taller101.netlify.app |
| **Stack** | Next.js 15 · React 19 · Tailwind · Firebase (Firestore + Auth) · Recharts · Netlify |
| **Repositorio** | github.com/mikebalcazar/conta-master (privado) |

## Lo que conviene saber antes de enseñarlo

- **La capa de datos se va a mover.** `suite101-arquitectura.md` (v2) decide
  Cloudflare: Worker, Durable Objects con SQLite por empresa y D1. Firebase sale.
  dash101 es la fase 4 de esa migración. Lo que hoy se ve en pantalla no cambia;
  lo de abajo sí.
- **«Producto» pasa a llamarse «ítem»** en toda la suite. En dash101 todavía
  aparece como producto en la ficha de proyecto.
- **Multiempresa hoy es multinegocio.** Un usuario con varios negocios; la
  frontera por empresa (org) llega con la migración.
- **Los roles se aplican en la interfaz, no en la base.** Documentado en
  `CONTEXTO.md`. Con usuarios de confianza alcanza; se endurece al escalar.

## Tipografía y color

Los de la suite, ya aplicados: `#0080C1`, Raleway para texto, Sansation para la
marca y Fira Sans con cifras tabulares para todo número. Las fuentes van
alojadas en el propio sitio, sin una sola petición a Google. Ver
`tipografia-cifras-suite101.md`.
