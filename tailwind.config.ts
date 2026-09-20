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
      colors: {
        bg: "#F3F6F8",      // fondo de la suite
        cream: "#E9EEF2",   // superficie apagada
        ink: {
          DEFAULT: "#122733", // azul oscuro de la casa
          dim: "#152028",     // tinta
          muted: "#4B5A66",   // tinta secundaria
        },
        mint: {
          50: "#DDF1E6",
          900: "#1E7A4C",
          label: "#2E6B4B",
        },
        mauve: {
          50: "#F7E4DE",
          900: "#A0472C",
          label: "#8A5340",
        },
        sky: {
          50: "#D9EEF8",
          900: "#05506F",
          label: "#0B6C93",
        },
        marca: {
          DEFAULT: "#0080C1",
          claro: "#3AA3DC",
        },
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
