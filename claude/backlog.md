# Backlog de dash101

_Lo lleva el chat de dash101. Cada punto dice quién lo pidió, qué es, dónde va a
vivir, cuándo conviene hacerlo y qué falta decidir. Nada de aquí está hecho._

## B1 · Conciliación semanal — pedido por Mike, 11-sep-2026

**Qué es.** Una vez por semana, dash101 pide conciliar: cuenta por cuenta,
alguien captura cuánto hay de verdad en ese momento. Se guarda siempre:

- el saldo que dash101 tiene registrado,
- el saldo real,
- la diferencia entre los dos.

**Para qué.** Para medir cuánto dinero se escapa del registro. Una diferencia
positiva (dash101 dice más de lo que hay) son salidas que no se registraron.
Una negativa son entradas que faltan. La hipótesis de Mike es que va a ganar la
positiva: gastos que nunca se capturan.

**Decisiones de Mike (11-sep-2026).**
1. **dash101 siempre refleja la realidad, y la diferencia queda registrada.**
   (Corregido por Mike el mismo 11-sep: la primera respuesta, «dejar crecer»,
   no era lo que quería decir.) Al conciliar, dash101 registra un movimiento de
   «ajuste por conciliación» por cada cuenta que no cuadre, y su saldo queda
   igual al real. Cada ajuste queda guardado. Como cada semana arranca cuadrada,
   el ajuste de esa semana es exactamente lo que se escapó en esa semana, y la
   suma de todos los ajustes es el acumulado.
2. **El día se escoge en la configuración de dash101; por defecto, lunes.**
3. **Concilian el owner y el admin.** Nadie más.
4. **Se concilian todas las cuentas, igual:** bancos, efectivo y tarjetas. En
   una tarjeta de crédito, el saldo real es lo que se debe.

**Cómo se vería.**
- El día configurado, dash101 marca la conciliación como pendiente y la enseña
  hasta que un owner o un admin la haga. Si se quiere, también un correo (la
  API ya manda correos con Resend).
- Por cada cuenta: el saldo que dash101 calcula **a esa hora exacta**, el saldo
  real que se captura y la diferencia (registrado − real).
- La estadística: lo que se escapó cada semana, el acumulado, el desglose por
  cuenta y la tendencia.
- El ajuste va como egreso o ingreso **«sin identificar»**, separado de los
  movimientos normales. Así los reportes de gastos e ingresos pueden
  enseñarlo aparte, en vez de mezclarlo con lo que sí se registró bien.

**Reglas.**
- Dinero en centavos, como entero.
- Cada conciliación guarda quién la hizo y cuándo.
- Una conciliación pasada nunca se edita: sólo se agregan nuevas, igual que
  `avances`.
- La ve sólo quien ve dinero. El cliente nunca.

**Dónde vive.** En una tabla nueva de OrgDB en `suite101-api`
(`conciliaciones`), escrita sólo por dash101, más un lugar para la
configuración (el día de la conciliación). Es una migración con semáforo,
prueba, recado en el muro y un contrato nuevo (D4). No se construye en
Firestore, porque Firestore se va a apagar.

**Cuándo.** Después de la fase 3, cuando dash101 ya lea y escriba en la API.
Hacerlo antes sería construirlo dos veces.

**Qué falta decidir.** Nada: las dudas se resolvieron el 11-sep.

**Hecho el 12-sep-2026.** La API en `suite101-api` #38 (contrato 0.4.0,
migración `0003`: `conciliaciones`, `conciliacion_cuentas` y
`negocios.dia_conciliacion`) y la pantalla en dash101, en `/conciliacion`.
Las cinco decisiones quedaron tal cual. Medido contra la org `demo` de
staging y con `sqlite3` para la migración; los números están en el muro
(`2026-09-12-…-jr-conciliacion-publicada.md`) y en `claude/continuar.md`.

---

_Este archivo lo escribe el chat de dash101 en Drive
(`suite101/dash101/backlog.md`); esta copia la trajo el Jr. PROGRAMMER al
repo, como pedía `2026-09-11-tarea-t3-lo-ya-medido.md`._
