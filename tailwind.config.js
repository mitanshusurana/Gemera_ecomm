/** @type {import('tailwindcss').Config} */
// Design tokens for the storefront. The vocabulary follows DESIGN.md (Apple-style
// canvases, ink, hairlines, one action colour) with the brand's champagne gold
// standing in for Apple's action blue.
const gold = {
  50: "#fbf8ef",
  100: "#f6efd8",
  200: "#ecdcaa",
  300: "#e2c97c",
  400: "#dbbb59",
  500: "#D4AF37", // action gold
  600: "#B5952F",
  700: "#967b27",
  800: "#77611f",
  900: "#584817",
  950: "#3a300f",
};

// Neutral ramp built from the Apple canvas/ink values so legacy "diamond-*"
// classes render as parchment, hairline and ink instead of nothing.
const neutral = {
  50: "#fafafc", // surface-pearl
  100: "#f5f5f7", // canvas-parchment
  200: "#e0e0e0", // hairline
  300: "#d2d2d7",
  400: "#a1a1a6",
  500: "#7a7a7a", // ink-muted-48
  600: "#6e6e73",
  700: "#48484a",
  800: "#333333", // ink-muted-80
  900: "#1d1d1f", // ink
};

module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        primary: gold[500],
        "primary-dark": gold[600],
        accent: gold[500],
        gold,
        // Legacy palette names still used by older pages; all resolve to the
        // same neutral ramp so the whole site shares one set of greys.
        diamond: neutral,
        secondary: neutral,
        sapphire: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
        },
        surface: "#faf9f9",
        "surface-dim": "#dadada",
        "surface-bright": "#faf9f9",
        "soft-ivory": "#F9F8F6",
        "champagne-gold": gold[500],
        "muted-charcoal": "#333333",
        "stroke-delicate": "#E5E1DA",
        ink: neutral[900],
        "ink-muted-80": neutral[800],
        "ink-muted-48": neutral[500],
        "canvas-light": "#ffffff",
        "canvas-parchment": neutral[100],
        "surface-pearl": neutral[50],
        "surface-tile-1": "#1c1c1e",
        "surface-tile-2": "#272729",
        "surface-tile-3": "#252527",
        "surface-black": "#000000",
        "divider-soft": "#f0f0f0",
        hairline: neutral[200],
        success: "#16a34a",
        error: "#ba1a1a",
        warning: "#f59e0b",
        info: "#3b82f6",
      },
      fontFamily: {
        sans: ["'Inter'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        serif: ["'Playfair Display'", "Georgia", "serif"],
        display: ["'Playfair Display'", "'Inter'", "-apple-system", "sans-serif"],
      },
      fontSize: {
        // Apple typographic scale (DESIGN.md)
        "apple-hero": ["3.5rem", { lineHeight: "1.07", letterSpacing: "-0.028em" }],
        "apple-display": ["2.5rem", { lineHeight: "1.10", letterSpacing: "-0.02em" }],
        "apple-lead": ["1.75rem", { lineHeight: "1.14", letterSpacing: "0.007em" }],
        "apple-tagline": ["1.3125rem", { lineHeight: "1.19", letterSpacing: "0.011em" }],
        "apple-body": ["1.0625rem", { lineHeight: "1.47", letterSpacing: "-0.022em" }],
      },
      borderRadius: {
        "apple-xs": "5px",
        "apple-sm": "8px",
        "apple-md": "11px",
        "apple-lg": "18px",
        "apple-pill": "9999px",
      },
      boxShadow: {
        luxury: "0 20px 40px -10px rgba(0, 0, 0, 0.15)",
        "luxury-lg": "0 40px 80px -20px rgba(0, 0, 0, 0.2)",
        "luxury-glow": "0 20px 50px -10px rgba(212, 175, 55, 0.15)",
        // The one product shadow in the system (DESIGN.md "Elevation")
        "product-surface": "0 20px 40px -10px rgba(0, 0, 0, 0.22), 0 5px 15px rgba(0, 0, 0, 0.12)",
      },
      animation: {
        shimmer: "shimmer 2s infinite",
        fadeIn: "fadeIn 0.4s ease-out",
        "fade-in": "fadeIn 0.4s ease-out",
        "fade-in-up": "fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        scaleUp: "scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        slideUp: "slideUp 0.5s ease-out",
        float: "float 3s ease-in-out infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleUp: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
    },
  },
  plugins: [],
};
