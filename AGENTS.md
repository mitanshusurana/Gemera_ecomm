# Working in this repository

Read `README.md` first for the layout. This file records the conventions an agent or contributor must keep.

## Storefront (`src/`)

- Angular 20, standalone components, inline `template:` strings, signals for state, `ChangeDetectionStrategy.OnPush`
  on presentational components. Routes are lazy `loadComponent` entries in `src/app/app.routes.ts`.
- Tailwind CSS **v4**. `src/styles.css` imports Tailwind, loads `tailwind.config.js` via `@config`, and defines the
  shared classes. There is no `@tailwind base/components/utilities` and no PostCSS `tailwindcss` plugin; the
  `.postcssrc.json` uses `@tailwindcss/postcss`.
- Design language: `DESIGN.md` (Apple-style canvases, ink text, hairlines, pill buttons) with `#D4AF37` gold as the
  only action colour. Reuse `btn-apple-pill`, `btn-apple-pill-secondary`, `btn-outline`, `input-field`,
  `store-utility-card`, `badge`, `active-press` before writing new button or card markup. No gradients as
  backgrounds and no shadows on cards, buttons or text; `product-surface-shadow` is the one product shadow.
- Layout: `app.ts` renders the only `<main>` and pads it `pt-[96px]` for the fixed header. Pages use `<div>` /
  `<section>` roots and never add their own header offset.
- Colours: use the hex tokens already in use (`#1d1d1f` ink, `#6e6e73`/`#7a7a7a` muted, `#e0e0e0` hairline,
  `#f5f5f7` parchment, `#fafafc` pearl, `#1c1c1e` dark tile). Legacy `gold-*` / `diamond-*` scales still resolve
  (they map onto the same ramp) but new code should use the hex tokens or the named tokens in `tailwind.config.js`.
- API base URL comes from `environment.apiUrl`; HTTP calls go through the services in `src/app/services` and the
  interceptors in `src/app/interceptors`. Do not read `window`/`document` without a platform check: the app is SSR.
- The repository is public. Never commit secrets; `.env*` files are ignored for that reason.

## Checks before finishing

```bash
npx tsc --noEmit -p tsconfig.app.json                      # storefront types
npx ng build fusion-angular-tailwind-starter --configuration production
npx ng build admin --configuration production               # when the admin changed
```

The storefront build prints one Beasties warning ("1 rules skipped due to selector errors"); it is a critical-CSS
inlining notice, not a build failure.

## Git hygiene

This working tree often carries unrelated in-progress changes (backend Gradle files, compose files). Stage files
explicitly by path rather than `git add -A`.
