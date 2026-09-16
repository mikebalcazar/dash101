# Portal de estados de cuenta — cerrado el 16-sep-2026

Esta carpeta publicaba `cuenta-taller101.netlify.app`: un solo `index.html` que
leía el Firestore de CONTA MASTER en modo solo lectura con Firebase Auth
(correo + PIN de 6 dígitos), con la llave `AIza…` escrita dentro de la página.

**Ya no.** Su relevo es **peek101**
(`https://peek101.mike-929.workers.dev`), que entra con la sesión de la suite y
lee por `/s101/*`. Lo que queda aquí son dos cosas:

- `_redirects` y `netlify.toml`, que mandan todo a peek101 con un 302.
- `index.html`, reemplazado por un aviso sin llaves ni scripts. Eso es lo que
  de verdad cierra el portal: una redirección que alguien quite el año que
  viene volvería a publicar la llave; un archivo sin llave, no.

Netlify no se apagó ni se borró — eso es de Mike (OPERAR §8). El sitio sigue
existiendo y ya no sirve la app.

Lo mide el trabajo `portal` de `.github/workflows/verificar-publicado.yml` y
`pruebas/corte.spec.ts`. Cuidado con `publish = "."`: **todo** archivo de esta
carpeta queda publicado en internet, así que la prueba revisa la carpeta
entera, no nada más `index.html`.

El historial del portal viejo está en git, hasta el commit del corte.
