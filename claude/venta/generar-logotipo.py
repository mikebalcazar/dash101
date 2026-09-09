#!/usr/bin/env python3
"""
Genera el logotipo de dash101 en SVG a partir del Sansation 700 real del repo.

La palabra se convierte a curvas con las medidas que ya estaban comprobadas en
`identidad-taller101.md` (tamaño 224, tracking -13.2, línea base y=322,
arranque x=-10). El círculo, el «101» y la raya son una reconstrucción: el
archivo original vive en el repositorio de nest101 y desde aquí no se alcanza.
Si algún día se tiene a mano, se sustituyen por los de verdad y este archivo
solo sirve para la palabra.

    python3 claude/venta/generar-logotipo.py dash101
    python3 claude/venta/generar-logotipo.py peek101

Escribe logo.svg, logo-blanco.svg e icono.svg en claude/venta/<app>/marca/.
"""

from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

AQUI = Path(__file__).parent
FUENTE = AQUI.parents[1] / "public" / "fonts" / "sansation-700.woff2"

AZUL = "#0080C1"

# medidas comprobadas contra el logotipo real (identidad-taller101.md)
TAMANO = 224
TRACKING = -13.2
BASE_Y = 322
INICIO_X = -10

ALTO = 439
# lo que ocupan la raya y el círculo en el original de «taller»
BLOQUE_DERECHO = 469.6

CIRCULO_D = 330
MARGEN_DERECHO = 10
RAYA_GROSOR = 26
AIRE_RAYA = 34  # a cada lado de la raya, medido desde la tinta

TAMANO_101 = 170
TRACKING_101 = -8


def cargar():
    fuente = TTFont(FUENTE)
    return fuente, fuente.getBestCmap(), fuente["hmtx"], fuente["head"].unitsPerEm


def trazar(texto, tamano, tracking, x, y, fuente, cmap, hmtx, upem):
    """Devuelve (path_d, ancho_avance, fin_tinta) del texto ya en curvas.

    `fin_tinta` es donde acaba el trazo de la última letra, que no es lo mismo
    que el avance: la «h» deja 13.7 px de aire después de la tinta y la «k»
    solo 2.7. Si el aire de la raya se mide contra el avance, «peek» sale
    apretada y «dash» no.
    """
    escala = tamano / upem
    glifos = fuente.getGlyphSet()
    glifos_tt = fuente["glyf"]
    partes = []
    pluma_x = x
    fin_tinta = x
    for letra in texto:
        nombre = cmap[ord(letra)]
        pluma = SVGPathPen(glifos)
        glifos[nombre].draw(pluma)
        d = pluma.getCommands()
        if d:
            # y invertida: en la fuente crece hacia arriba, en SVG hacia abajo
            partes.append(
                f'<g transform="translate({pluma_x:.2f} {y:.2f}) '
                f'scale({escala:.6f} {-escala:.6f})"><path d="{d}"/></g>'
            )
            fin_tinta = pluma_x + glifos_tt[nombre].xMax * escala
        pluma_x += hmtx[nombre][0] * escala + tracking
    ancho = pluma_x - tracking - x
    return "\n    ".join(partes), ancho, fin_tinta


def construir(palabra="dash"):
    fuente, cmap, hmtx, upem = cargar()

    letras, ancho_palabra, fin_tinta = trazar(
        palabra, TAMANO, TRACKING, INICIO_X, BASE_Y, fuente, cmap, hmtx, upem
    )
    ancho = round(ancho_palabra + INICIO_X + BLOQUE_DERECHO)

    radio = CIRCULO_D / 2
    circulo_x = ancho - MARGEN_DERECHO - radio
    circulo_y = ALTO / 2

    # el «101» centrado dentro del círculo
    escala_101 = TAMANO_101 / upem
    ancho_101 = (
        sum(hmtx[cmap[ord(c)]][0] for c in "101") * escala_101 + TRACKING_101 * 2
    )
    # centro óptico: la mitad de la altura de las cifras por debajo del centro.
    # Se mide en el glifo, no en OS/2: esta Sansation trae la tabla en una
    # versión que no incluye sCapHeight.
    glifos_tt = fuente["glyf"]
    alto_cifra = glifos_tt[cmap[ord("0")]].yMax * escala_101
    d101, _, _ = trazar(
        "101",
        TAMANO_101,
        TRACKING_101,
        circulo_x - ancho_101 / 2,
        circulo_y + alto_cifra / 2,
        fuente,
        cmap,
        hmtx,
        upem,
    )

    # desde donde acaba la tinta, no desde el avance (ver trazar)
    raya_x1 = fin_tinta + AIRE_RAYA
    raya_x2 = circulo_x - radio - AIRE_RAYA
    if raya_x2 - raya_x1 < 40:
        raise SystemExit(
            f"la raya queda en {raya_x2 - raya_x1:.1f} px: baja CIRCULO_D o sube "
            f"BLOQUE_DERECHO antes de dar esto por bueno"
        )

    return {
        "ancho": ancho,
        "letras": letras,
        "circulo_x": circulo_x,
        "circulo_y": circulo_y,
        "radio": radio,
        "d101": d101,
        "raya_x1": raya_x1,
        "raya_x2": raya_x2,
    }


def svg_completo(g, palabra, color):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {g['ancho']} {ALTO}" width="{g['ancho']}" height="{ALTO}" role="img" aria-label="{palabra}101">
  <title>{palabra}101</title>
  <g fill="{color}">
    {g['letras']}
    <rect x="{g['raya_x1']:.2f}" y="{ALTO/2 - RAYA_GROSOR/2:.2f}" width="{g['raya_x2']-g['raya_x1']:.2f}" height="{RAYA_GROSOR}"/>
    <circle cx="{g['circulo_x']:.2f}" cy="{g['circulo_y']:.2f}" r="{g['radio']:.2f}"/>
  </g>
  <g fill="#FFFFFF">
    {g['d101']}
  </g>
</svg>
"""


def svg_icono(g, palabra):
    lado = CIRCULO_D
    r = g["radio"]
    d101 = g["d101"]
    # recentrar el «101» en un lienzo cuadrado
    dx = r - g["circulo_x"]
    dy = r - g["circulo_y"]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {lado} {lado}" width="{lado}" height="{lado}" role="img" aria-label="{palabra}101">
  <title>{palabra}101</title>
  <circle cx="{r}" cy="{r}" r="{r}" fill="{AZUL}"/>
  <g fill="#FFFFFF" transform="translate({dx:.2f} {dy:.2f})">
    {d101}
  </g>
</svg>
"""


def main():
    import sys

    app = sys.argv[1] if len(sys.argv) > 1 else "dash101"
    palabra = app.replace("101", "")
    destino = AQUI / app / "marca"
    if not destino.is_dir():
        raise SystemExit(f"no existe {destino}")

    g = construir(palabra)
    (destino / "logo.svg").write_text(svg_completo(g, palabra, AZUL), encoding="utf-8")
    (destino / "logo-blanco.svg").write_text(
        svg_completo(g, palabra, "#FFFFFF"), encoding="utf-8"
    )
    (destino / "icono.svg").write_text(svg_icono(g, palabra), encoding="utf-8")
    print(f"{app}: lienzo {g['ancho']}x{ALTO} · tres archivos en {destino}")


if __name__ == "__main__":
    main()
