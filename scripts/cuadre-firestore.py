#!/usr/bin/env python3
"""Cuenta y suma lo que hay en Firestore, para poder cuadrarlo contra la API.

Es el lado viejo del cuadre: las mismas cifras que `sumarDinero()` y
`contarFilas()` de `suite101-api/src/org-db.ts` sacan del OrgDB, pero leídas de
Firestore. Las llaves del dinero van con los nombres del contrato 0.3.0
(`partidas.monto_acordado`, no `proyectos.partidas.monto_acordado`), para que
las dos columnas se puedan poner una junto a la otra sin traducir. Mientras los dos lados no den el mismo número al centavo, el corte
(fase 5) no se hace.

Tres cosas que conviene tener presentes:

  1. **En Firestore el dinero está en PESOS, con decimales**; en la API está en
     centavos enteros. Aquí se reportan las dos cifras y, además, cuántos
     valores no caen exactos en un centavo: el importador los redondea
     (`aCentavosExacto`), y cada redondeo es una diferencia que alguien tiene
     que poder explicar.
  2. **No imprime un solo dato de un cliente.** Ni nombres, ni conceptos, ni
     correos: sólo cuentas, sumas y qué campos existen. El cuadre se hace con
     números, no con el directorio de nadie.
  3. **Sólo lee.** La cuenta de servicio tiene `roles/datastore.viewer`; una
     escritura aquí fallaría con 403 aunque alguien la escribiera por error.

Se corre desde `.github/workflows/cuadre-firestore.yml`, que se identifica ante
Google con el token del propio runner (Workload Identity Federation). No hay
ninguna llave que guardar.
"""

from __future__ import annotations

import os
import sys
from collections import Counter
from decimal import Decimal, ROUND_HALF_UP

from google.cloud import firestore

# Las nueve colecciones del modelo plano de dash101, y el dinero que lleva cada
# una. Los nombres salen de `types/schema.ts` y de `lib/`; si aparece una
# colección que no está aquí, el guion lo dice al final en vez de callárselo.
COLECCIONES: dict[str, list[str]] = {
    "usuarios": [],
    "negocios": [],
    "cuentas": ["saldo_inicial"],
    "clientes": [],
    "proveedores": [],
    "proyectos": [
        "precio_venta",
        "compromiso_total",
        "cobrado",
        "pagado",
        "disponible",
        "margen_proyectado",
    ],
    "movimientos": ["monto"],
    "opex": ["monto"],
    "invitaciones": [],
}

# Cachés: la API no los importa, los recalcula desde los movimientos
# (`mapeo.ts` §2). Se suman igual, pero se marcan, para que nadie compare un
# caché de Firestore contra un caché recalculado y crea que hay un descuadre.
CACHES = {
    # `precio_venta` ya no va aquí: desde el 12-sep el importador aplica la
    # regla del producto único (un proyecto con precio y sin productos produce
    # un ítem con su nombre y su precio), así que `items.monto` en la API tiene
    # que ser Σ productos.monto + Σ precio_venta de los proyectos sin productos.
    # Ese número se imprime abajo, para compararlo contra la API al importar.
    "proyectos.cobrado",
    "proyectos.pagado",
    "proyectos.disponible",
    "proyectos.margen_proyectado",
    "proyectos.productos.pagado",
    # Desde el contrato 0.3.0 (11-sep) la partida es tabla propia en la API:
    # lo pagado a cada proveedor y el compromiso del proyecto son cachés que
    # recalcula desde los egresos. Aquí se llaman como en Firestore; en la API
    # son `partidas.monto_pagado` y `proyectos.compromiso`.
    "partidas.monto_pagado",
    "proyectos.compromiso_total",
}

# Cómo se reconoce que una partida (o un producto) apunta a un ítem. Se buscan
# todos los nombres plausibles, no sólo el que dice el código de hoy: la
# pregunta de la fase 2 es justo si alguna partida trae la referencia.
REFS_ITEM = ("producto_id", "item_id", "quell_id", "producto", "item")


def centavos(valor) -> tuple[int, bool, bool]:
    """Pesos → centavos, como lo hace `aCentavosExacto` de la API.

    Devuelve (centavos, hubo_redondeo, ilegible). Un valor vacío es cero y no
    es error; un texto que no es número sí se cuenta aparte.
    """
    if valor is None or valor == "":
        return 0, False, False
    if isinstance(valor, bool):
        return 0, False, True
    try:
        d = Decimal(str(valor).replace(",", "").replace("$", "").strip())
    except Exception:
        return 0, False, True
    if not d.is_finite():
        return 0, False, True
    cien = d * 100
    entero = cien.to_integral_value(rounding=ROUND_HALF_UP)
    return int(entero), cien != entero, False


def pesos(cents: int) -> str:
    signo = "-" if cents < 0 else ""
    c = abs(cents)
    return f"{signo}{c // 100:,}.{c % 100:02d}"


def main() -> int:
    proyecto = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCP_PROJECT")
    db = firestore.Client(project=proyecto)
    print(f"Proyecto de Firestore: {db.project}")
    print()

    filas: dict[str, int] = {}
    dinero: dict[str, int] = {}
    redondeos: Counter[str] = Counter()
    ilegibles: Counter[str] = Counter()

    # partidas y productos viven dentro de cada proyecto, así que se cuentan
    # en la misma pasada.
    partidas_n = 0
    partidas_con_ref = 0
    partidas_campos: Counter[str] = Counter()
    partidas_estado: Counter[str] = Counter()
    proyectos_con_partidas = 0
    productos_n = 0
    productos_con_quell = 0
    proyectos_con_productos = 0
    movs_con_producto = 0
    # La regla del producto único: lo que la API va a sumar en items.monto.
    proyectos_sin_productos_con_precio = 0
    precio_sin_productos = 0

    for col, campos in COLECCIONES.items():
        n = 0
        for doc in db.collection(col).stream():
            n += 1
            d = doc.to_dict() or {}

            for campo in campos:
                c, redondeo, malo = centavos(d.get(campo))
                clave = f"{col}.{campo}"
                dinero[clave] = dinero.get(clave, 0) + c
                if redondeo:
                    redondeos[clave] += 1
                if malo:
                    ilegibles[clave] += 1

            if col == "proyectos":
                lista = d.get("partidas") or []
                if isinstance(lista, list) and lista:
                    proyectos_con_partidas += 1
                for p in lista if isinstance(lista, list) else []:
                    if not isinstance(p, dict):
                        continue
                    partidas_n += 1
                    for k in p:
                        partidas_campos[k] += 1
                    partidas_estado[str(p.get("estado", "(sin estado)"))] += 1
                    if any(p.get(r) for r in REFS_ITEM):
                        partidas_con_ref += 1
                    for campo in ("monto_acordado", "monto_pagado"):
                        c, redondeo, malo = centavos(p.get(campo))
                        clave = f"partidas.{campo}"
                        dinero[clave] = dinero.get(clave, 0) + c
                        if redondeo:
                            redondeos[clave] += 1
                        if malo:
                            ilegibles[clave] += 1

                prods = d.get("productos") or []
                if isinstance(prods, list) and prods:
                    proyectos_con_productos += 1
                else:
                    c, _, malo = centavos(d.get("precio_venta"))
                    if c and not malo:
                        proyectos_sin_productos_con_precio += 1
                        precio_sin_productos += c
                for p in prods if isinstance(prods, list) else []:
                    if not isinstance(p, dict):
                        continue
                    productos_n += 1
                    if p.get("quell_id"):
                        productos_con_quell += 1
                    for campo in ("monto", "pagado"):
                        c, redondeo, malo = centavos(p.get(campo))
                        clave = f"proyectos.productos.{campo}"
                        dinero[clave] = dinero.get(clave, 0) + c
                        if redondeo:
                            redondeos[clave] += 1
                        if malo:
                            ilegibles[clave] += 1

            if col == "movimientos" and d.get("producto_id"):
                movs_con_producto += 1

        filas[col] = n

    print("== Filas por colección ==")
    for col, n in filas.items():
        print(f"  {col:<14} {n:>8}")
    print(f"  {'TOTAL':<14} {sum(filas.values()):>8}")
    print()

    print("== Dinero, en centavos enteros (así lo guarda la API) ==")
    for clave in sorted(dinero):
        marca = "  ← caché, la API lo recalcula" if clave in CACHES else ""
        print(f"  {clave:<38} {dinero[clave]:>14}   ({pesos(dinero[clave])}){marca}")
    print()

    print("== Lo que la API debe sumar en items.monto al importar (regla del producto único) ==")
    esperado_items = dinero.get("proyectos.productos.monto", 0) + precio_sin_productos
    print(f"  Σ productos.monto                       {dinero.get('proyectos.productos.monto', 0):>14}   ({pesos(dinero.get('proyectos.productos.monto', 0))})")
    print(f"  Σ precio_venta sin productos ({proyectos_sin_productos_con_precio} proy.)  {precio_sin_productos:>14}   ({pesos(precio_sin_productos)})")
    print(f"  {'items.monto esperado en la API':<38} {esperado_items:>14}   ({pesos(esperado_items)})")
    print()

    if redondeos or ilegibles:
        print("== Valores que no caen exactos en un centavo ==")
        for clave, n in sorted(redondeos.items()):
            print(f"  {clave}: {n} valor(es) redondeado(s)")
        for clave, n in sorted(ilegibles.items()):
            print(f"  {clave}: {n} valor(es) ILEGIBLES (el importador los rechaza)")
        print()
    else:
        print("== Ningún valor necesitó redondeo: el paso a centavos es exacto ==")
        print()

    print("== partidas (la pregunta de la fase 2) ==")
    print(f"  partidas en total:                 {partidas_n}")
    print(f"  proyectos que tienen partidas:     {proyectos_con_partidas} de {filas.get('proyectos', 0)}")
    print(f"  partidas CON referencia a ítem:    {partidas_con_ref}")
    print(f"  partidas SIN referencia a ítem:    {partidas_n - partidas_con_ref}")
    print(f"  (se buscó cualquiera de: {', '.join(REFS_ITEM)})")
    print("  campos que existen en las partidas, y en cuántas:")
    for k, n in partidas_campos.most_common():
        print(f"    {k:<22} {n:>6}")
    print("  por estado:")
    for k, n in partidas_estado.most_common():
        print(f"    {k:<22} {n:>6}")
    print()

    print("== productos (los ítems de mañana) ==")
    print(f"  productos en total:                {productos_n}")
    print(f"  proyectos que tienen productos:    {proyectos_con_productos} de {filas.get('proyectos', 0)}")
    print(f"  productos ligados a quell101:      {productos_con_quell}")
    print(f"  movimientos con producto_id:       {movs_con_producto}")
    print()

    # Una colección que nadie esperaba es una fuga en la migración: el
    # importador no la traería y nadie se daría cuenta hasta el corte.
    try:
        vistas = {c.id for c in db.collections()}
        sobran = sorted(vistas - set(COLECCIONES))
        print("== Colecciones raíz que existen y este guion no mide ==")
        print(f"  {', '.join(sobran) if sobran else '(ninguna)'}")
    except Exception as e:  # noqa: BLE001 — informativo, no debe tumbar la medición
        print(f"== No se pudieron listar las colecciones raíz: {e} ==")

    return 0


if __name__ == "__main__":
    sys.exit(main())
