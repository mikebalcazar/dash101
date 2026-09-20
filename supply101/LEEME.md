# supply101 — pedir una compra

La cara de **quien pide** una compra en la empresa: el del taller, el de obra,
quien administra. Vive aparte de dash101 a propósito, porque quien pide no
tiene por qué entrar al tablero del dinero, y porque necesita una dirección
corta que se pueda repartir por WhatsApp.

    producción   https://supply101.mike-929.workers.dev
    staging      https://supply101-staging.mike-929.workers.dev

Lo pidió Mike el 20-sep-2026, cambiando su propia decisión 1 del 19 («el
módulo vive dentro de dash101»).

## Qué hace, y qué no

Hace tres cosas:

1. **Pedir una compra**: cuánto, qué, a quién, para qué proyecto —o gasto
   general—, para cuándo, y la foto de la cotización. El IVA se separa solo y
   se puede corregir.
2. **Ver en qué va**: esperando pago, devuelta con su motivo, pagada o
   rechazada. Una devuelta se corrige y vuelve con el mismo folio.
3. **Abrir el comprobante** del pago, que es con lo que se le reclama al
   proveedor.

**No paga.** No hay buzón, ni cuentas, ni saldos, ni nada fiscal: eso vive en
dash101, con el dinero. La misma orden, dos caras.

## Por qué está en el repositorio de dash101

Porque es la otra cara del mismo módulo y del mismo contrato de la API, y
porque un repositorio nuevo necesita que Mike pegue a mano los secretos de
Cloudflare en Actions. Se publica con el mismo flujo (`publicar.yml`), en dos
pasos propios. Si algún día conviene repositorio aparte, son cuatro archivos.

## Cómo se prueba aquí

    node supply101/pruebas/servidor.mjs 8798     # el Worker, en esta máquina
    URL_SUPPLY=http://127.0.0.1:8798 node --test supply101/pruebas/supply.spec.mjs

El servidor de pruebas reenvía `/s101/*` a la API de **staging** y le baja la
galleta a `SameSite=Lax` sin `Secure`, porque en `http://127.0.0.1` el
navegador la tiraría. En Cloudflare nada de eso pasa: todo es https y del
mismo origen.

La prueba escribe en un negocio propio, «Pruebas de supply101», para no mover
las cifras de Taller Demo, de donde salen las capturas.

## Las direcciones llevan `#`

`…/#/` es mis compras, `…/#/pedir` es el formulario y `…/#/orden/<id>` es una
compra. Así quell101 y quote101 pueden mandar a la gente directo a pedir una
compra con una liga, sin que esta app necesite servidor de rutas.
