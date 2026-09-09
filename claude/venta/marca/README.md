# Marca de dash101

| Archivo | Qué es | Dónde va |
|---|---|---|
| `logo.svg` | Logotipo azul `#0080C1`, 917×439 | Fondo claro: ficha, presentación, encabezados |
| `logo-blanco.svg` | El mismo en blanco | Fondo oscuro o sobre el azul |
| `icono.svg` | Solo el círculo «101», blanco sobre azul, cuadrado | Favicon, aplicación, cualquier lugar chico |

Se regeneran con:

```bash
python3 claude/venta/marca/generar.py
```

## Qué está medido y qué está reconstruido

**La palabra sí está medida.** «dash» sale del `sansation-700.woff2` que ya vive
en `public/fonts/`, convertida a curvas con las medidas que `identidad-taller101.md`
comprobó contra el logotipo real de Taller 101: tamaño 224, tracking −13.2, línea
base y=322, arranque x=−10. El SVG no depende de que la fuente esté instalada.

**El círculo, el «101» y la raya están reconstruidos.** El original vive en el
repositorio de nest101 y desde este contenedor no se alcanza. `identidad-taller101.md`
es claro en que no se redibujan: se copian. Así que estos tres son una
aproximación geométrica hasta que alguien traiga el archivo bueno.

El lienzo sí se derivó del original: en «taller» la raya y el círculo ocupan
469.6 px, y ese bloque se conservó tal cual. Como «dash» mide 457.5 px contra los
440.4 de «taller», el lienzo queda en 917 en lugar de 900 — el mismo criterio con
el que «nest», más corta, bajó a 840.

Lo que falta por comprobar contra el original: el diámetro del círculo (aquí 330),
el grosor de la raya (26) y el tamaño del «101» (170). Se eligieron para que la
raya tuviera ritmo, no porque se hayan medido.

## Cuando aparezca el original

Sustituir en `generar.py` el `<circle>`, el `<rect>` de la raya y el «101» por los
del archivo de verdad. La parte de la palabra ya no se toca.
