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
      fontFamily: {
        // "Cifras" delante y limitada por unicode-range: solo se lleva los
        // digitos y los signos de medida, que caen en Fira Sans. El resto, Raleway.
        sans: ["Cifras", "Raleway", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        marca: ["Sansation", "Raleway", "sans-serif"],
      },
      borderRadius: {
        "2xl": "18px",
        "3xl": "20px",
      },
    },
  },
  plugins: [],
};

export default config;
