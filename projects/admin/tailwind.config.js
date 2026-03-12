/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./projects/admin/src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        "primary": "#115e59",
        "secondary": "#b45309",
        "background-light": "#f6f6f8",
        "background-dark": "#111121",
      },
      fontFamily: {
        "display": ["Inter", "sans-serif"]
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries'),
  ],
}