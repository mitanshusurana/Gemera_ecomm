import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Light theme. Fills, borders and rings read `colors`; text reads
      // `textColor` where a fill colour would be too pale to read on white
      // (gold, green, amber, red are darkened for text only).
      colors: {
        primary: "#C9992B",
        background: "#F5F5F7",
        surface: "#FFFFFF",
        border: "#E0E0E5",
        accent: "#C9992B",
        success: "#16A34A",
        warning: "#D97706",
        danger: "#DC2626",
        textPrimary: "#1D1D1F",
        textSecondary: "#6E6E73"
      },
      textColor: {
        primary: "#8A6508",
        accent: "#8A6508",
        success: "#15803D",
        warning: "#B45309",
        danger: "#B91C1C",
        // Text on the gold action fill (buttons): ink, not the page colour.
        background: "#1D1D1F",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "gold-gradient": "linear-gradient(135deg, #DDB04A 0%, #C9992B 100%)",
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
