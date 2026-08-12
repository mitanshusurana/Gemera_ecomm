---
name: Caratloop
colors:
  surface: "#ffffff"
  surface-dim: "#f9fafb"
  surface-bright: "#ffffff"
  surface-container-lowest: "#ffffff"
  surface-container-low: "#f9fafb"
  surface-container: "#f3f4f6"
  surface-container-high: "#e5e7eb"
  surface-container-highest: "#d1d5db"
  on-surface: "#2c2c2c"
  on-surface-variant: "#4b5563"
  inverse-surface: "#1f2937"
  inverse-on-surface: "#f9fafb"
  outline: "#d1d5db"
  outline-variant: "#e5e7eb"
  surface-tint: "#115e59"
  primary: "#115e59"
  on-primary: "#ffffff"
  primary-container: "#ccfbf1"
  on-primary-container: "#042f2e"
  inverse-primary: "#5eead4"
  secondary: "#b45309"
  on-secondary: "#ffffff"
  secondary-container: "#fef3c7"
  on-secondary-container: "#451a03"
  tertiary: "#d4874a"
  on-tertiary: "#ffffff"
  tertiary-container: "#fce8c9"
  on-tertiary-container: "#4a2615"
  error: "#ef4444"
  on-error: "#ffffff"
  error-container: "#fee2e2"
  on-error-container: "#4c0519"
  background: "#ffffff"
  on-background: "#2c2c2c"
  surface-variant: "#f3f4f6"
typography:
  display-lg:
    fontFamily: "'Playfair Display', serif"
    fontSize: 60px
    fontWeight: "700"
    lineHeight: 60px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: "'Playfair Display', serif"
    fontSize: 48px
    fontWeight: "700"
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: "'Playfair Display', serif"
    fontSize: 36px
    fontWeight: "700"
    lineHeight: 40px
    letterSpacing: -0.02em
  title-lg:
    fontFamily: "'Playfair Display', serif"
    fontSize: 24px
    fontWeight: "700"
    lineHeight: 32px
    letterSpacing: -0.02em
  body-lg:
    fontFamily: "'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif"
    fontSize: 18px
    fontWeight: "400"
    lineHeight: 28px
  body-md:
    fontFamily: "'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif"
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 24px
  label-md:
    fontFamily: "'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif"
    fontSize: 14px
    fontWeight: "600"
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  xxl: 64px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
    padding: 12px 24px
  button-primary-hover:
    backgroundColor: "{colors.primary-container}"
  button-secondary:
    backgroundColor: transparent
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.lg}"
    padding: 12px 24px
  button-secondary-hover:
    backgroundColor: "{colors.primary-container}"
  card-standard:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  input-field:
    backgroundColor: transparent
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 10px 16px
  badge-standard:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.full}"
    padding: 4px 12px
---

## Brand & Style

The Caratloop design system embodies a **Modern Luxury** aesthetic, merging the opulence of fine jewelry with contemporary corporate cleanliness. The brand personality is refined, trustworthy, and subtly glamorous.

The interface aims to provide a premium shopping or browsing experience, relying on elegant typography, subtle animations (like floating and shimmering), and crisp whitespace to let the products take center stage. The emotional response is intended to be sophisticated and assuring.

## Colors

The palette heavily relies on an Emerald and Gold motif, symbolizing luxury, wealth, and timeless elegance.

- **Primary (Emerald):** Deep, rich greens (#115e59) form the core identity, used for primary actions, heavy text accents, and foundational UI elements.
- **Secondary (Gold/Bronze):** Warm gold and bronze tones (#b45309) serve as complementary accents, drawing attention to secondary actions or highlighting premium features.
- **Neutrals (Platinum & Diamond):** A range of crisp whites, soft grays, and deep charcoals form the canvas and typography colors, ensuring high contrast and a clean, gallery-like backdrop.
- **Text:** Dark charcoal (#2c2c2c) is used instead of pure black for a softer, more luxurious reading experience.

## Typography

Typography plays a crucial role in establishing the premium feel.

- **Headings (`Playfair Display`):** Used for all headings to inject a sense of heritage and editorial elegance. It features a slight negative letter spacing to pull letterforms tighter, creating a bespoke, crafted appearance.
- **Body (`Segoe UI` / System Sans):** A highly legible, modern sans-serif stack is used for body copy and UI elements to ensure clarity and modern usability, balancing the ornate nature of the serif headings.

## Layout & Spacing

Layouts are designed to breathe, emphasizing individual items rather than overwhelming the user with density.

- **Whitespace:** Generous padding (using `lg` and `xl` spacing tokens) is heavily utilized.
- **Containment:** Content typically sits within a max-width container (`max-w-7xl`) to ensure a structured, editorial flow on larger screens.
- **Rhythm:** A consistent scaling system governs vertical rhythm, ensuring predictable spacing between typography and components.

## Elevation & Depth

Depth is used sparingly to maintain a clean, flat aesthetic, reserving shadows for interaction and focal points.

- **Cards:** Standard cards feature a very subtle, soft shadow that elevates slightly on hover (`hover:shadow-luxury`), introducing a smooth, tactile feel.
- **Animations:** Subtle `float`, `fadeIn`, and `shimmer` keyframes are employed to add life to the interface without relying on heavy skeuomorphism or deep drop shadows.

## Shapes

The interface balances sharp, crisp edges with moderately rounded interactive elements.

- **Interactive Elements:** Buttons and inputs use `rounded-lg` (8px) for an approachable yet professional tactile target.
- **Badges & Pills:** Status indicators and small tags use `rounded-full` to stand out organically from more structural elements.

## Components

### Buttons
Primary buttons utilize gradient fills (from Emerald base to lighter emerald) to create a subtle metallic or jewel-like sheen. Secondary and ghost buttons rely on outlines or tinted backgrounds to establish clear hierarchy while maintaining brand colors.

### Inputs
Form fields are clean and unobtrusive, featuring a subtle gray border that transitions to the primary Emerald color upon focus, avoiding heavy background fills to keep forms looking light.

### Badges
The system includes multiple tinted badges (Emerald, Gold, Sapphire, Rose) that utilize a light container background with a dark, saturated text color for high contrast and clear status indication.
