# peek101 — datos

| | |
|---|---|
| **Nombre** | peek101 (en el repositorio es la carpeta `portal/`) |
| **Versión** | v0 — lo publicado el 7 de septiembre |
| **Estado** | En producción con clientes de prueba |
| **URL** | https://cuenta-taller101.netlify.app |
| **Stack** | Un solo `index.html` estático · Firebase (Firestore + Auth) por CDN · Netlify, sin compilación |
| **Repositorio** | github.com/mikebalcazar/conta-master, carpeta `portal/` (privado) |

## Lo que conviene saber antes de enseñarlo

- **Vive en el repositorio de dash101.** Son dos sitios de Netlify distintos: el
  de peek101 tiene `portal/` como directorio base y no compila nada.
- **De dónde salen los datos.** Del mismo Firestore de dash101. El taller activa
  el acceso desde la ficha del cliente y eso marca sus proyectos y sus ingresos
  con el identificador del cliente; las reglas de lectura solo dejan pasar lo que
  lleva esa marca. Proveedores y márgenes quedan fuera por construcción.
- **La etapa de fabricación todavía no llega sola.** Se lee del producto si
  alguien la puso; si no, dice que no hay dato del taller. La fuente real será
  quell101, que aún no existe.
- **La capa de datos se muda.** `suite101-arquitectura.md` (v2) lleva todo a
  Cloudflare; peek101 es la **fase 3** y pasa a pedirle los números ya sumados a
  `suite101-api`. Es la primera app que se migra, por chica.
- **«Producto» pasa a llamarse «ítem»** en toda la suite. En pantalla todavía
  dice producto.

## Tipografía y color

Los de la suite, ya aplicados: `#0080C1`, Raleway para texto, Sansation para la
marca y Fira Sans con cifras tabulares para los montos —que aquí importan más que
en ningún lado, porque el cliente compara columnas—. Las fuentes van alojadas en
`portal/fonts/`, sin una sola petición a Google.
