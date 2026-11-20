import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      /* La paleta de la suite 101, la misma de master101, peek101, docs101 y
       * supply101: azul #0080C1, fondos fríos y tinta azulada. Antes dash101
       * andaba en crema y tinta caliente, de cuando se llamaba Conta Master,
       * y era la única app que no se veía de la casa. Lo pidió Mike el
       * 20-sep.
       *
       * Los nombres de los tonos NO cambiaron —`cream`, `mint`, `mauve`,
       * `sky`— y por eso este cambio se lee en un solo archivo en vez de en
       * cuarenta pantallas. Dicen para qué sirve cada uno, no de qué color
       * son:
       *
       *   bg / cream   el fondo y la superficie apagada (barra, bloques)
       *   ink          la tinta, y el oscuro de los botones y lo activo
       *   mint         lo que entra: ingresos, cobrado, pagado
       *   mauve        lo que sale: egresos, vencido, devuelto
       *   sky          la marca: azul de la suite, para lo informativo */
      /* 8-oct-2026 · Mike: «todas las plataformas (…) con el diseño look and
       * feel de cost101, pero siguiendo los parámetros de tipografía y de logo
       * de dash y quell». Los tonos ahora salen de variables (globals.css):
       * en pantalla, el azul oscuro de cost101; al imprimir, los claros de
       * siempre. `black` también: en oscuro, lo que era sombra negra es luz. */
      /* 20-nov-2026 · Mike: «Rediseña el look and feel de la interfaz de
       * dash101» con Material Design 3, en claro. Los tonos siguen saliendo
       * de las mismas variables; lo que valen y qué papel de Material 3 hace
       * cada uno está en globals.css. `black` vuelve a ser tinta. */
      colors: {
        bg: "rgb(var(--c-bg) / <alpha-value>)",
        cream: "rgb(var(--c-cream) / <alpha-value>)",
        ink: {
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",
          dim: "rgb(var(--c-ink-dim) / <alpha-value>)",
          muted: "rgb(var(--c-ink-muted) / <alpha-value>)",
        },
        mint: {
          50: "rgb(var(--c-mint-50) / <alpha-value>)",
          900: "rgb(var(--c-mint-900) / <alpha-value>)",
          label: "rgb(var(--c-mint-label) / <alpha-value>)",
        },
        mauve: {
          50: "rgb(var(--c-mauve-50) / <alpha-value>)",
          900: "rgb(var(--c-mauve-900) / <alpha-value>)",
          label: "rgb(var(--c-mauve-label) / <alpha-value>)",
        },
        sky: {
          50: "rgb(var(--c-sky-50) / <alpha-value>)",
          900: "rgb(var(--c-sky-900) / <alpha-value>)",
          label: "rgb(var(--c-sky-label) / <alpha-value>)",
        },
        marca: {
          DEFAULT: "rgb(var(--c-marca) / <alpha-value>)",
          claro: "rgb(var(--c-marca-claro) / <alpha-value>)",
        },
        black: "rgb(var(--c-negro) / <alpha-value>)",
      },
      /* 20-nov-2026 · Material Design 3. `ink` es la tinta del texto (on
       * surface) y `cream` una superficie; pero `bg-ink text-cream` es, en
       * todas las pantallas, EL BOTÓN RELLENO y lo activo. En Material 3 ése
       * es el color primario con su «on primary». Se apartan aquí, por
       * utilidad, para no tocar las pantallas: el fondo y el contorno `ink`
       * son el primario, y el texto `cream` es lo que va encima. */
      backgroundColor: { ink: "rgb(var(--c-primario) / <alpha-value>)" },
      borderColor: { ink: "rgb(var(--c-primario) / <alpha-value>)" },
      ringColor: { ink: "rgb(var(--c-primario) / <alpha-value>)" },
      accentColor: { ink: "rgb(var(--c-primario) / <alpha-value>)" },
      textColor: { cream: "rgb(var(--c-sobre-primario) / <alpha-value>)" },
      fontFamily: {
        // "Cifras" delante y limitada por unicode-range: solo se lleva los
        // digitos y los signos de medida, que caen en Fira Sans. El resto, Raleway.
        sans: ["Cifras", "Raleway", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        marca: ["Sansation", "Raleway", "sans-serif"],
      },
      /* La escala de formas de Material 3: «medium» 12 (tarjetas, campos),
       * «large» 16, «extra large» 28 (diálogos). Los botones van en píldora
       * (globals.css). */
      borderRadius: {
        "2xl": "12px",
        "3xl": "16px",
        "4xl": "28px",
      },
    },
  },
  plugins: [],
};

export default config;
