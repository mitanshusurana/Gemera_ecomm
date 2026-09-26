# Caratloop Deployment & Workflow Guide

Five images are built by `.github/workflows/docker-build-push.yml` on every push to `main` and pushed to GHCR:
`gemera_ecomm-backend` (Spring Boot API), `gemera_ecomm-frontend` (Angular SSR storefront), `gemera_ecomm-admin`
(Angular admin behind nginx), `gemera_ecomm-erp-backend` (FastAPI ERP API) and `gemera_ecomm-erp-frontend` (Next.js
ERP UI). The image names follow the GitHub repository name; override them with `BACKEND_IMAGE`, `FRONTEND_IMAGE`,
`ADMIN_IMAGE`, `ERP_BACKEND_IMAGE`, `ERP_FRONTEND_IMAGE` if the repository is renamed. All five packages are public, so
the VMs pull them without logging into GHCR.

## 1. Topology

| Host | Compose file | Runs | Public ports |
|---|---|---|---|
| Core VM | `docker-compose.backend.yml` | PostgreSQL, API, admin SPA | 8080 (API), 81 (admin) |
| Storefront VM | `docker-compose.frontend.yml` | SSR storefront | 80 |
| Core VM | `docker-compose.erp.yml` | ERP PostgreSQL, ERP API, ERP UI, nginx | 80, 443 (ERP nginx) |
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
| `docker-compose.erp.yml` | `.env.erp` | `.env.erp.example` |

The examples document every variable. The API has no defaults for the database, `JWT_SECRET`, admin credentials, SMTP,
`GOLDAPI_KEY` and the R2 bucket, and refuses to start if one is missing. `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` may be
left empty: online card payment and gift-card purchase then answer 503 until keys are provided. The storefront's
`RAZORPAY_KEY` must equal `RAZORPAY_KEY_ID`.

**Razorpay webhook.** On the Razorpay dashboard add a webhook with URL `https://<api-host>/api/v1/payments/webhook`
subscribed to the events `payment.captured`, `order.paid` and `payment.failed`, and put the secret you choose there into
`RAZORPAY_WEBHOOK_SECRET`. The endpoint needs no JWT; it verifies the `X-Razorpay-Signature` header against that secret
and answers 401 when the secret is unset or the signature does not match. A captured payment marks the matching order
PAID (or activates the matching gift card) and sends the confirmation e-mail, so an order completes even when the
customer closes the browser before the checkout page can confirm it. Retries are safe: an already-PAID order is left alone.

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

## 3a. ERP

```bash
cp .env.erp.example .env.erp   # edit; POSTGRES_PASSWORD_URLENC is the URL-encoded password
docker compose -f docker-compose.erp.yml --env-file .env.erp pull
docker compose -f docker-compose.erp.yml --env-file .env.erp up -d
curl -fsS http://127.0.0.1:8010/health
```

Add `--build` to `up` to build the two ERP images from `projects/` instead of pulling them.

`erp-migrate` runs `alembic upgrade head` and the API waits for it. `erp-nginx` (`nginx/erp.conf`) is the public
entry point: it proxies `/api/` to the ERP API, everything else to the ERP UI, rate-limits the login endpoint and
blocks the OpenAPI docs. It serves plain HTTP on 80 until you follow `nginx/TLS.md` to issue a certificate and
enable the 443 listener. Set `CORS_ORIGINS` to the JSON list of origins the UI is served from.

## 3b. Storefront to ERP bridge

Every paid web order (or dispatched cash-on-delivery order) is invoiced by the store API in its own
`WEB/{FY}/{n}` series and posted to the ERP as a sales invoice under that same number; refunds post a
credit note and the refund payment. Configuration:

| Where | Variable | Value |
|---|---|---|
| `.env.backend` | `ERP_BASE_URL` | The ERP API origin as seen from the Core VM, e.g. `http://127.0.0.1:8010` or the ERP nginx URL |
| `.env.backend` | `ERP_API_KEY` | A long random secret |
| `.env.erp` | `ECOMMERCE_API_KEY` | The same secret |
| `.env.erp` | `ECOMMERCE_SETTLEMENT_ACCOUNT_CODE` | Ledger code of the bank account Razorpay settles into (default `BNK-001`) |
| `.env.erp` | `ECOMMERCE_COMPANY_ID` | Only when the ERP holds more than one company |
| `.env.erp` | `ECOMMERCE_OLD_GOLD_MATERIAL_CODE`, `ECOMMERCE_OLD_SILVER_MATERIAL_CODE` | Item-master codes old metal bought through the storefront exchange programme is booked into (defaults `OLD-GOLD`, `OLD-SILVER`; created on first use, set their stock account in the ERP item master) |

Both sides may be left empty: orders then queue in the store API (`erp_sync_events`, status PENDING)
and are posted once the bridge is configured, from the admin order page ("Sync to ERP now") or by the
five-minute retry job. A 409 from the ERP means the two systems disagree on GST for that order; fix the
rate settings (admin Settings, tax rates; ERP item master or `GST_RATE_*`) and retry from the admin.
The ERP records these postings under a service user `ecommerce-bridge@caratloop.local` that cannot sign in.

Repair service invoices (SRV series) and Treasure installments (as on-account advances) post through the same bridge.

Old gold exchange: when the admin credits an exchange request, the store API posts an RCM purchase from the
customer to `POST /api/v1/integrations/ecommerce/old-gold-purchases`; the customer's credit is a store gift card, and
the web sale that redeems it carries an `exchange_credit` block so the ERP sets the purchase off against the sale.

Messaging: `WHATSAPP_PROVIDER=meta` with `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` (templates named
`caratloop_<event>` must be approved in the WhatsApp Business account; override names per event in admin Settings,
Messaging), and `SMS_PROVIDER=msg91|http` with `SMS_API_KEY`, `SMS_SENDER_ID`, `SMS_ENDPOINT`, `SMS_TEMPLATE_ID`. Both
default to disabled; e-mail always sends. Test either channel from the admin Notifications page.

ERP e-invoicing: `EINVOICE_PROVIDER=nic` with the GSP base URL and credentials in `.env.erp` (see
`projects/erp-backend/app/core/config.py`); use `fake` to exercise the flow without a GSP. TDS and TCS are off until
`TDS_194Q_ENABLED` / `TCS_206C1H_ENABLED` are set.

Metal rates: no key is needed. Spot prices come from gold-api.com and USD/INR from frankfurter.dev (er-api as a
fallback); `GOLDAPI_KEY` is only needed if the admin switches the provider to GOLDAPI_IO. Customs duty, local premium
and the auto-lock hour are set on the admin Metal rates page, where the rate of the day is locked and products priced
from the rate are repriced.

Seller details printed on web invoices come from admin Settings (legal name, GSTIN, PAN, address,
state code, invoice series prefix).

## 4. Updating

```bash
docker compose -f docker-compose.backend.yml pull && docker compose -f docker-compose.backend.yml up -d
docker compose -f docker-compose.frontend.yml pull && docker compose -f docker-compose.frontend.yml up -d
docker compose -f docker-compose.erp.yml --env-file .env.erp pull && docker compose -f docker-compose.erp.yml --env-file .env.erp up -d
```

## 5. Local development

Without Docker: `npm start` (storefront on 4200), `npx ng serve admin` (admin), and the API from `backend/` with Gradle
(`./gradlew bootRun`) pointing at a local PostgreSQL through the same environment variables.

With Docker: `cp .env.local.example .env.local`, then `docker compose -f docker-compose.local.yml up --build`.
