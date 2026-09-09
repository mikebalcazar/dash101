# Material de venta

Lo que se necesita para enseñar una aplicación sin abrirla. **Una carpeta por
aplicación**, porque en este repositorio viven dos: dash101 en la raíz y peek101
en `portal/`.

```
claude/venta/
  generar-logotipo.py     hace los tres SVG de cualquier app: python3 … dash101
  dash101/
    ficha.md              qué hace, para quién, 5 razones, 8 funciones, qué NO hace
    datos.md              versión, URL, estado, stack
    capturas/README.md    cuáles faltan y cómo tomarlas
    marca/                logo.svg · logo-blanco.svg · icono.svg
  peek101/
    …lo mismo
```

## Reglas

- **Decir qué no hace.** Las dos fichas cierran con esa sección. Vender
  facturación o cobro en línea, que no existen, sale más caro que no venderlos.
- **Capturas con datos inventados.** En peek101 con más razón: son clientes
  reales de Taller 101 y sus saldos.
- **Los números de `datos.md` se comprueban, no se recuerdan.** Versión, URL y
  stack salen del repositorio, no de la memoria de un chat.
- **La marca no se redibuja.** Se genera con la Sansation que ya está en el
  repositorio. Lo que está reconstruido queda anotado en cada `marca/README.md`.
