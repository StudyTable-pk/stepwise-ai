/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Deep green — the "detailed" brand color (headers, links, AI).
        brand: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#166534",
          700: "#14532d",
          800: "#0f3f23",
          900: "#0b331d",
          950: "#052e16"
        },
        // Bright yellow — the primary action color.
        sun: {
          50: "#fffbe6",
          100: "#fff5c2",
          200: "#ffeb8a",
          300: "#ffdd4d",
          400: "#ffd21f",
          500: "#f5c400",
          600: "#d9a900",
          700: "#b78900",
          800: "#966d00",
          900: "#7a5800",
          950: "#5c4200"
        },
        ink: {
          50: "#f6f7f9",
          100: "#eceef2",
          200: "#d5dae2",
          300: "#b0bac9",
          400: "#8694ab",
          500: "#677791",
          600: "#526078",
          700: "#434e62",
          800: "#3a4253",
          900: "#343a47",
          950: "#22262f"
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"]
      },
      boxShadow: {
        card: "0 1px 3px rgba(16,24,40,0.08), 0 1px 2px rgba(16,24,40,0.04)",
        panel: "0 8px 24px rgba(16,24,40,0.12)"
      },
      animation: {
        "fade-in": "fadeIn 0.25s ease-out",
        "slide-up": "slideUp 0.3s ease-out"
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        }
      }
    }
  },
  plugins: []
};
