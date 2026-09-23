import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#D4A843",
        background: "#0A0A0B",
        surface: "#141418",
        border: "#2A2A35",
        accent: "#D4A843",
        success: "#22C55E",
        warning: "#F59E0B",
        danger: "#EF4444",
        textPrimary: "#F5F5F5",
        textSecondary: "#9CA3AF"
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "gold-gradient": "linear-gradient(135deg, #D4A843 0%, #B28830 100%)",
      },
      fontFamily: {
        inter: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        playfair: ['Playfair Display', 'Georgia', 'serif'],
      }
    },
  },
  plugins: [],
};
export default config;
