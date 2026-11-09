/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        ink: "#364193",
        sand: "#f4f6f6",
        ember: "#e22219",
        mint: "#189ad6",
        frost: "#fafafa",
        sun: "#d4812f",
        brand: {
          primary: "#364193",
          secondary: "#189ad6",
          accent: "#1daeef"
        }
      },
      fontFamily: {
        display: ["Inter", "sans-serif"],
        body: ["Roboto", "sans-serif"],
        mono: ["Roboto Mono", "monospace"]
      },
      boxShadow: {
        panel: "0 20px 34px -26px rgba(54, 65, 147, 0.45)"
      }
    }
  },
  plugins: []
};

