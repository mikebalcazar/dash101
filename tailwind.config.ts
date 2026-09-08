import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Base warm
        bg: "#FBF8F2",
        cream: "#F3EEE3",
        // Text cool
        ink: {
          DEFAULT: "#1E2A3A",
          dim: "#2A2E3A",
          muted: "#6E737E",
        },
        // Semantic cool accents
        mint: {
          50: "#D6E8E0",
          900: "#2F5D52",
          label: "#4A7468",
        },
        mauve: {
          50: "#E4D0D8",
          900: "#5C485E",
          label: "#7A627F",
        },
        sky: {
          50: "#D2DCE8",
          900: "#3A4D6B",
          label: "#586D8F",
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
