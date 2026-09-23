# Caratloop e-commerce

Five deployables live in this repository:

| Path | What it is | Stack |
|---|---|---|
| `src/` | Public storefront (SSR) | Angular 20 standalone components, Tailwind CSS v4, Express SSR |
| `projects/admin/` | Back-office admin app | Angular 20, Tailwind CSS v4 |
| `backend/` | REST API | Spring Boot, PostgreSQL, Razorpay, Cloudflare R2 |
| `projects/erp-backend/` | ERP API: double-entry ledger, GST, inventory costing, job work | FastAPI, SQLAlchemy, Alembic, PostgreSQL |
| `projects/erp-frontend/` | ERP web UI | Next.js 14, React 18, Tailwind CSS v3 |

## Storefront

```bash
npm install
npm start                 # http://localhost:4200, expects the API at http://localhost:8080/api/v1
npm run build:prod        # production browser + server bundles in dist/fusion-angular-tailwind-starter
npm run build:prod:ssr    # same, then validates the SSR output (scripts/validate-build.js)
npm run serve:ssr:fusion-angular-tailwind-starter   # run the built SSR server
```

Runtime configuration for the storefront comes from `src/environments/` at build time and from
`env-subst.sh` inside the Docker image. Copy `.env.frontend.example` to `.env` for local Docker runs.

### Design system

The storefront follows the Apple-style system documented in `DESIGN.md` with the brand's champagne gold
as the single action colour. Tokens live in `tailwind.config.js`; shared component classes
(`btn-apple-pill`, `input-field`, `store-utility-card`, ...) live in `src/styles.css`. Pages are standalone
components with inline templates under `src/app/pages`, shared UI under `src/app/components`. The fixed
two-tier header is 96px tall and `app.ts` pads `<main>` for it, so pages must not add their own top offset.

## Admin

```bash
npx ng serve admin        # http://localhost:4300 by default in docker-compose.local.yml
npx ng build admin --configuration production
```

The admin has its own `projects/admin/tailwind.config.js`.

## Backend

See `backend/` (Gradle). Required environment variables are listed in `.env.backend.example`; the
service refuses to start without `JWT_SECRET`, admin credentials and Razorpay keys.

## ERP

The ERP is a separate service with its own PostgreSQL database and its own login; it is not wired to the store API yet.

```bash
cd projects/erp-backend && pip install -r requirements.txt && python -m pytest -q   # 500 tests, no database needed
cd projects/erp-frontend && npm install && npm run dev                              # http://localhost:3000
docker compose -f docker-compose.erp.yml --env-file .env.erp up -d                  # GHCR images; add --build to build from source
```

The schema is owned by Alembic (`projects/erp-backend/migrations`); run `alembic upgrade head` against a
fresh database rather than any SQL dump. Both ERP folders were imported with `git subtree` and keep their
history; `git log -- projects/erp-backend` shows it.

## Deployment

`DEPLOYMENT_GUIDE.md` describes the two-VM topology. Docker definitions: `frontend.Dockerfile`,
`admin.Dockerfile`, `backend/Dockerfile`, `projects/erp-*/Dockerfile`, and the `docker-compose.*.yml` files. GitHub Actions
(`.github/workflows/docker-build-push.yml`) builds and pushes all five images (backend, storefront, admin,
ERP backend, ERP frontend) on every push to `main`.

This repository is public: never commit `.env*` files with real values.
