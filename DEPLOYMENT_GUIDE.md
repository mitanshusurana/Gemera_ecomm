# Caratloop Deployment & Workflow Guide

Three images are built by `.github/workflows/docker-build-push.yml` on every push to `main` and pushed to GHCR:
`gemera_ecomm-backend` (Spring Boot API), `gemera_ecomm-frontend` (Angular SSR storefront) and `gemera_ecomm-admin`
(Angular admin behind nginx). The image names follow the GitHub repository name; override them with
`BACKEND_IMAGE`, `FRONTEND_IMAGE`, `ADMIN_IMAGE` if the repository is renamed.

## 1. Topology

| Host | Compose file | Runs | Public ports |
|---|---|---|---|
| Core VM | `docker-compose.backend.yml` | PostgreSQL, API, admin SPA | 8080 (API), 81 (admin) |
| Storefront VM | `docker-compose.frontend.yml` | SSR storefront | 80 |
| Laptop | `docker-compose.local.yml` | everything from source | 5432 (localhost only), 8080, 4200, 4300 |

PostgreSQL is not published on the Core VM; connect through an SSH tunnel:

```bash
ssh -N -L 5432:localhost:5432 user@core-vm
```

Put a TLS-terminating reverse proxy (nginx, Caddy or the cloud load balancer) in front of the API and the admin, and
list the resulting HTTPS origins in `CORS_ALLOWED_ORIGINS`. With the `prod` Spring profile active, non-HTTPS origins are
rejected.

## 2. Configuration

Each compose file reads one env file next to it; copy the matching example and fill it in:

| Compose file | Env file | Example |
|---|---|---|
| `docker-compose.backend.yml` | `.env.backend` | `.env.backend.example` |
| `docker-compose.frontend.yml` | `.env.frontend` | `.env.frontend.example` |
| `docker-compose.local.yml` | `.env.local` | `.env.local.example` |

The examples document every variable. The API has no defaults for the database, `JWT_SECRET`, admin credentials, SMTP,
`GOLDAPI_KEY` and the R2 bucket, and refuses to start if one is missing. `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` may be
left empty: online card payment and gift-card purchase then answer 503 until keys are provided. The storefront's
`RAZORPAY_KEY` must equal `RAZORPAY_KEY_ID`.

Frontend bundles are built once with placeholder tokens; `env-subst.sh` (storefront) and `admin-env-subst.sh` (admin)
replace them from the environment when the container starts, so one image serves every environment. The admin container
exits immediately if `API_URL` is missing.

Schema management is Hibernate `ddl-auto=update` (there is no migration tool). Do not switch to the `prod` profile's
`validate` mode on an empty database.

## 3. First deployment

Core VM:

```bash
cp .env.backend.example .env.backend   # edit
docker compose -f docker-compose.backend.yml pull
docker compose -f docker-compose.backend.yml up -d
curl -fsS http://localhost:8080/actuator/health
```

Storefront VM:

```bash
cp .env.frontend.example .env.frontend   # edit
docker compose -f docker-compose.frontend.yml pull
docker compose -f docker-compose.frontend.yml up -d
```

Then sign in to the admin (port 81) with `ADMIN_EMAIL` / `ADMIN_PASSWORD` and fill in Settings: company contact details
(shown in the storefront footer), tax rates, currency rates, and the Home page card (hero copy, hero image, trust badges,
configurator base price). Add stores under Stores and mark products "Show on home page" to feature them.

## 4. Updating

```bash
docker compose -f docker-compose.backend.yml pull && docker compose -f docker-compose.backend.yml up -d
docker compose -f docker-compose.frontend.yml pull && docker compose -f docker-compose.frontend.yml up -d
```

## 5. Local development

Without Docker: `npm start` (storefront on 4200), `npx ng serve admin` (admin), and the API from `backend/` with Gradle
(`./gradlew bootRun`) pointing at a local PostgreSQL through the same environment variables.

With Docker: `cp .env.local.example .env.local`, then `docker compose -f docker-compose.local.yml up --build`.
