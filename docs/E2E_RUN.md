# Local end-to-end run

`scripts/e2e-local.sh` builds both stacks from source on one machine, seeds the ERP, drives the store
API and the ERP API with curl, and prints PASS/FAIL per step. This file explains how to run it and
records two runs: the first against commit `70dbb0f` (five defects found) and the re-run after those
defects were fixed in the working tree (41/41 steps pass). The first run's findings are kept as history.

## Running it

Requirements: Docker Desktop (or any `docker compose` v2), `curl`, `python` (3.x on the PATH as
`python`), bash (Git Bash on Windows is fine). Nothing else; JSON is parsed with python one-liners.

```bash
cp .env.local.example .env.local     # or let the script create both files with fake values
cp .env.erp.example .env.erp         # fill in; ECOMMERCE_API_KEY must equal ERP_API_KEY in .env.local
bash scripts/e2e-local.sh            # ~10 min on first build, then ~7 min (5-minute ERP outbox wait)
```

Options (environment variables):

| Variable | Default | Effect |
|---|---|---|
| `E2E_SKIP_BUILD=1` | off | Do not run `docker compose up -d --build`; use the stacks already running |
| `E2E_ADVANCE_WAIT_SECONDS` | 360 | How long to wait for the store's five-minute ERP outbox flush (Treasure advance and repair service invoice have no manual push); `0` skips the wait |
| `E2E_INCLUDE_KNOWN_BUGS=0` | on | Skip the extra order that carries an `erpMaterialCode` |
| `E2E_LOG` | `scripts/e2e-local.log` | Every request and response (gitignored) |

The script is idempotent: it reuses the seeded ERP company and owner, the store admin, category,
product, customer and Treasure plan, and creates a fresh order, return, repair job and exchange
request on every run (document numbers keep counting). Exit code is the number of failed steps.
Both stacks are left running:

| Stack | Service | Port |
|---|---|---|
| store (`docker-compose.local.yml`, project `caratloop-local`) | Spring API | http://localhost:8080 by default; **18080 on this machine** (`/actuator/health`, `/api/v1`) |
| | storefront SSR | http://localhost:4200 |
| | admin SPA | http://localhost:4300 |
| | PostgreSQL 15 | 127.0.0.1:5432 (`jewelry_db`) |
| ERP (`docker-compose.erp.yml`, project `gemera_ecomm`) | FastAPI | http://127.0.0.1:8010 (`/health`, `/api/v1`, `/docs` because `ENVIRONMENT=development`) |
| | Next.js UI | http://127.0.0.1:3001 |
| | nginx | http://localhost:80 and :443 (proxies `/api/` to the API, the rest to the UI) |
| | PostgreSQL 16 | 127.0.0.1:5433 (`caratloop_erp`) |

Ports 80/443 did not collide with anything on this machine, so the ERP compose file keeps its default
host ports. Port **8080** did collide: an unrelated project's container (`miltiagentplatform-frontend-1`,
`restart: unless-stopped`) publishes it, so `docker-compose.local.yml` now takes its host ports from
`API_PORT` / `STOREFRONT_PORT` / `ADMIN_PORT` in `.env.local` (defaults 8080 / 4200 / 4300) and this
machine's `.env.local` sets `API_PORT=18080` with `API_URL=http://localhost:18080/api/v1` to match.
The script reads the same variables, so it follows whatever the env file says.

### ERP bootstrap: `scripts/erp-seed-first-company.sql`

Nothing in the ERP creates the first company or user. The Alembic migrations only install the
schema; `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env.erp` are read solely by
`settings.validate_runtime()` (`projects/erp-backend/app/core/config.py:29-30,132`); there is no
seed script, no lifespan seeding in `app/main.py`, and `POST /api/v1/users` needs an already
signed-in owner. The script therefore inserts one `caratloop.companies` row and one
`caratloop.users` row (bcrypt hash through pgcrypto, role `owner`, e-mail lower-cased) and relies
on the `AFTER INSERT` trigger `trg_provision_company_accounts`
(`migrations/sql/0003_provision_company.sql`, redefined in `0007_einvoice_tds_tcs.sql:151-333`) to
provision the 25 account groups, the 52-account chart (`BNK-001`, `SAL-001`.., `GST-00x`,
`STK-0xx`, `COGS-001`, `RCM-00x`, `ITC-00x`, ...), the stock locations and the current and next
fiscal years. It is idempotent and takes the values as psql variables so the password is not in the
file:

```bash
docker compose -f docker-compose.erp.yml --env-file .env.erp exec -T erp-db \
  psql -U caratloop -d caratloop_erp -v ON_ERROR_STOP=1 \
    -v email=erp-admin@example.com -v password='ChangeMe-12345!' \
    -v company_name=Caratloop -v legal_name='Caratloop Jewels' -v gstin=08AAAAA0000A1Z5 \
  < scripts/erp-seed-first-company.sql
```

## Re-run after the fixes (2026-10-02): 41 of 41 steps pass

The five defects below were fixed in the working tree (uncommitted on top of `70dbb0f` at the time of
the run): `AdminRepairController.java:142` and `RepairController.java:111` are
`@Transactional(readOnly = true)`; `integrations.py` accepts `external_ref` up to 64 characters
(lines 178/195/205) and declares `BridgePayment.date: Optional[_dt.date]` (line 159); `sales.py:685`
binds `_as_uuid(line.material_id)` in the stock-relief loop; `GlobalExceptionHandler.java:103-111`
maps 405/404 and logs the catch-all; `requirements.txt` pins `sqlalchemy[asyncio]>=2.0.35,<2.1`
(the image now carries SQLAlchemy 2.0.54, so the greenlet pin in the ERP Dockerfile is redundant but
harmless). Both stacks were rebuilt from that tree (`gradle test bootJar` green in 2m36s), then
`E2E_SKIP_BUILD=1 E2E_INCLUDE_KNOWN_BUGS=1 E2E_ADVANCE_WAIT_SECONDS=400 bash scripts/e2e-local.sh`:

| # | Step | Result |
|---|---|---|
| 1 | Bridge key and `ERP_BASE_URL=http://host.docker.internal:8010` | PASS |
| 2, 6 | Store / ERP `docker compose up -d --build` | PASS (done just before; skipped inside the run) |
| 3-5 | Store API health (:18080), storefront :4200, admin :4300 | PASS |
| 7-9 | ERP `/health`, nginx :80, ERP reachable from the API container | PASS |
| 10-13 | ERP seed, login, `/auth/me`, chart of accounts (53) | PASS |
| 14-17 | Store admin login, settings, category, product | PASS |
| 18-20 | Customer, cart 25000 + 750, COD order `ORD-7DB48A98` CONFIRMED | PASS |
| 21-22 | PROCESSING -> SHIPPED -> DELIVERED, `WEB/2026-27/00008`; invoice PDF 19 KB | PASS |
| 23-24 | SALE -> SENT; ERP invoice totals match | PASS |
| 25-27 | Return `RMA-2026-00005` STORE_CREDIT; ERP `CN/2026-27/00035` 25750 | PASS |
| 28-30 | Repair `RJ-2026-00005` to DELIVERED with CASH 1500, `SRV/2026-27/00005`; job card PDF | PASS |
| 31 | Service invoice PDF (`/admin/repairs/{id}/invoice.pdf`), 19551 bytes | **PASS** (was defect 1) |
| 32 | Service invoice queued for the ERP | PASS |
| 33-35 | Exchange `EX-2026-00005` assay/credit; ERP `PI/2026-27/00063` 51168 RCM | PASS |
| 36-37 | Treasure plan, admin cash installment (installmentsPaid 5) | PASS |
| 38 | ERP advance receipt after the scheduler flush (260 s): `REC/2026-27/00075` ref `ADV/TRS-...-5` 5000 | **PASS** (was defect 2) |
| 39 | ERP holds `SRV/2026-27/00005` 1500, payment status Paid | **PASS** (was defect 3) |
| 40 | Sale of the product with `erpMaterialCode` (`WEB/2026-27/00009`) synced | **PASS** (was defect 4) |
| 41 | Container logs: no ERROR/SEVERE/traceback in any of the seven containers | **PASS** |

The retry job also drained the backlog from the earlier runs: every `erp_sync_events` row is now
`SENT` (14 SALE, 5 CREDIT_NOTE, 5 OLD_GOLD_PURCHASE, 5 ADVANCE), so the ERP holds
`WEB/2026-27/00001..00009`, `SRV/2026-27/00001..00005`, the five credit notes, five purchase invoices
and five advance receipts. `DELETE /api/v1/cart` (defect 5) now answers 405
`method-not-allowed` instead of 500. There is still no API trigger for ADVANCE or service-invoice
events, so the script has to wait for the five-minute flush for steps 38 and 39.

## First run (commit 70dbb0f, 2026-09-26 / 2026-10-02): findings kept as history

### Results of the first run (commit 70dbb0f; builds 2026-09-26, final run 2026-10-02)

Both stacks were built from source on 2026-09-26: once from the tree as of 08:20 IST, and again after
the concurrent commits `746c366`..`70dbb0f` landed (store API: service invoices to the ERP, metal
rates; ERP: service lines through the bridge). `gradle test bootJar` was green both times (1m39s /
1m30s); the storefront, admin and both ERP images built. The table is the final run on 2026-10-02,
after a Docker Desktop restart, against those cached images and the persisted data volumes
(`E2E_SKIP_BUILD=1`; host API port 18080, see above). The 2026-09-26 run passed and failed exactly
the same steps, with earlier document numbers.

| # | Step | Result |
|---|---|---|
| 1 | Bridge key: `ERP_API_KEY` == `ECOMMERCE_API_KEY`, `ERP_BASE_URL=http://host.docker.internal:8010` | PASS |
| 2 | Store stack `docker compose up -d --build` (Postgres, API incl. `gradle test`, storefront SSR, admin) | PASS (first run; skipped in the second) |
| 3 | Store API `/actuator/health` = `{"status":"UP"}` | PASS |
| 4 | Storefront SSR answers on :4200 | PASS |
| 5 | Admin SPA answers on :4300 | PASS |
| 6 | ERP stack `docker compose up -d --build` (Postgres 5433, Alembic `0001..0010`, API 8010, UI 3001, nginx 80/443) | PASS after the two Dockerfile/compose fixes below |
| 7 | ERP `/health` | PASS |
| 8 | ERP nginx `/healthz` on :80 and `/api/v1/auth/me` through nginx | PASS |
| 9 | ERP reachable from the store API container at `host.docker.internal:8010` | PASS after the compose fix below |
| 10 | ERP seed SQL (company `Caratloop`, GSTIN `08AAAAA0000A1Z5`, owner user) | PASS |
| 11 | ERP `POST /api/v1/auth/login` | PASS |
| 12 | ERP `GET /api/v1/auth/me` returns the company | PASS |
| 13 | ERP `GET /api/v1/accounting/accounts?limit=1000`: 52 accounts (53 once the web customer's debtor account exists), every code the bridge needs present | PASS |
| 14 | Store admin login (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) | PASS |
| 15 | `PUT /api/v1/admin/settings`: legal name, GSTIN `08AAAAA0000A1Z5`, PAN, address, state `08`, `WEB` prefix, 3 % jewellery GST, 18 % repair GST | PASS |
| 16 | `POST /api/v1/admin/categories` (`e2e-jewellery`, `JEWELLERY`) | PASS |
| 17 | `POST /api/v1/products`: E2E Gold Ring, HSN 7113, stock 5, price 25000 | PASS |
| 18 | `POST /api/v1/auth/register` customer (then login on re-runs) | PASS |
| 19 | `POST /api/v1/cart/items`: subtotal 25000, GST 750 (3 %), shipping 0, total 25750 | PASS |
| 20 | `POST /api/v1/orders` cash on delivery, Jaipur / Rajasthan address: status `CONFIRMED` | PASS |
| 21 | Admin `PUT /orders/{id}/status` PROCESSING, SHIPPED (+ tracking number), DELIVERED; invoice `WEB/2026-27/00006` issued after commit of the SHIPPED transition | PASS |
| 22 | `GET /api/v1/orders/{id}/invoice`: `application/pdf`, `%PDF-1.5`, 19 KB, `attachment; filename="WEB-2026-27-00006.pdf"` | PASS |
| 23 | `POST /api/v1/orders/{id}/erp-sync`: `erp_sync_events` SALE `PENDING` -> `SENT`, `erpReference` = ERP invoice id | PASS |
| 24 | ERP `GET /api/v1/sales/invoices` holds `WEB/2026-27/00006`, place of supply 08, intra-state; taxable 25000 / CGST 375 / SGST 375 / grand total 25750 match the store; journal `JV/2026-27/..` balanced | PASS |
| 25 | Customer `POST /api/v1/orders/{id}/returns` (CHANGED_MIND, STORE_CREDIT): `RMA-2026-00004`, refundAmount 25750 | PASS |
| 26 | Admin `PUT /admin/returns/{id}/approve` -> `receive` -> `resolve`: `REFUNDED`, gift card issued, order `REFUNDED` | PASS |
| 27 | `POST /orders/{id}/erp-sync` pushes the CREDIT_NOTE; ERP `GET /vouchers?type=Credit_Note` and `GET /accounting/journal-entries?entry_type=Credit_Note` show `CN/2026-27/00027` for 25750 with reference `WEB/2026-27/00006/CN/RMA-2026-00004` | PASS |
| 28 | `POST /api/v1/repairs/requests` (RING / RESIZE): `RJ-2026-00004` | PASS |
| 29 | Admin: RECEIVED -> `PUT /estimate` 1500 (ASSESSED) -> APPROVED -> IN_PROGRESS -> READY -> `PUT /payment` CASH 1500 -> DELIVERED; service invoice `SRV/2026-27/00004` issued | PASS |
| 30 | `GET /admin/repairs/{id}/job-card.pdf`: PDF, 24 KB | PASS |
| 31 | `GET /admin/repairs/{id}/invoice.pdf` (and customer `GET /repairs/{jobNumber}/invoice?phone=`) | **FAIL** 400 `Error generating invoice PDF` (defect 1) |
| 32 | Service invoice queued for the ERP (`erp_sync_events` row keyed on `invoice_id`) | PASS |
| 33 | `POST /api/v1/exchange/requests` GOLD 22K 10 g: `EX-2026-00004`, indicative quote | PASS |
| 34 | Admin `POST /admin/exchange/{id}/receive` -> `assay` (0.916, 9.5 g, 6000/g, 2 % deduction: 51168) -> `credit` (gift card) | PASS |
| 35 | `POST /admin/exchange/{id}/erp-sync`; ERP `GET /api/v1/purchases/invoices` shows `PI/2026-27/00029`, vendor_inv_no `EX-2026-00004`, 51168, RCM | PASS |
| 36 | `POST /api/v1/treasure/enroll` 5000/month (reused on re-runs) | PASS |
| 37 | Admin `POST /api/v1/treasure/accounts/{id}/payment` (cash): installmentsPaid 4, ADVANCE event queued | PASS |
| 38 | ERP advance receipt after the five-minute flush | **FAIL** 422 (defect 2) |
| 39 | ERP holds the service invoice `SRV/2026-27/00004` after the flush | **FAIL** 422 (defect 3) |
| 40 | Sale of a product that carries `erpMaterialCode` (`E2E-PEND`) synced to the ERP (`WEB/2026-27/00007`) | **FAIL** 500 (defect 4) |
| 41 | Container logs free of unexpected ERROR/SEVERE/traceback lines | **FAIL**: 55 lines in `caratloop_erp_backend`, all the traceback of defect 4 repeated by the five-minute retry of the two FAILED SALE rows (see "Logs") |

36 of 41 steps pass. Every store-side flow works through its own API; the four functional failures are
all on the store -> ERP bridge or in one PDF endpoint.

### Failures in detail

**Defect 1 (fixed, see re-run) -- repair service invoice PDF answers 400 (`Error generating invoice PDF`).**
Request: `GET /api/v1/admin/repairs/29a8b5c6-bde7-4f8e-8416-e653c9303826/invoice.pdf` (admin) and
`GET /api/v1/repairs/RJ-2026-00004/invoice?phone=9876543210` (customer). Response, both:

```json
{"type":"https://www.caratloop.com/errors/runtime-exception","title":"Runtime Exception","status":400,
 "detail":"Error generating invoice PDF","instance":"/api/v1/admin/repairs/.../invoice.pdf"}
```

Believed cause: `backend/src/main/java/com/jewelry/backend/controller/AdminRepairController.java:139-151`
and `RepairController.java:109-122` call `invoiceService.ensureServiceInvoice(job)` (its own
`@Transactional`, `InvoiceService.java:242`) and then `invoiceService.renderPdf(invoice)` **outside any
transaction**. The invoice already exists by then (it is issued after commit of the DELIVERED / paid
transition), so `findByRepairJobId` returns an entity whose `repairJob` (`Invoice.java:53`,
`FetchType.LAZY`) and `lines` (`Invoice.java:112`, lazy `@OneToMany`) are uninitialised proxies;
`spring.jpa.open-in-view` is `false` (`application.yml`), so `InvoicePdfRenderer.java:118-121`
(`invoice.getRepairJob().getJobNumber()`) or `:178` (`invoice.getLines()`) throws
`LazyInitializationException`, which `InvoicePdfRenderer.java:91-92` wraps in
`RuntimeException("Error generating invoice PDF")` and `GlobalExceptionHandler.java:77-88` turns into a
400 without logging the cause. The goods invoice works because `OrderController.downloadInvoice`
(`OrderController.java:108`) is annotated `@Transactional`. Fix: the same annotation on the two repair
endpoints (or an `@EntityGraph` on `InvoiceRepository.findByRepairJobId`), and log `ex.getCause()` in the
handler.

**Defect 2 (fixed) -- Treasure installment never reaches the ERP (`external_ref` too long).**
`erp_sync_events` ADVANCE row goes `PENDING` -> `FAILED` on the first flush with

```
HTTP 422: {"detail":[{"type":"string_too_long","loc":["body","external_ref"],
 "msg":"String should have at most 40 characters","input":"TRS-dc172b7a-fec5-44d4-b3d7-a3a8a71b6a7e-4","ctx":{"max_length":40}}]}
```

Cause: `backend/src/main/java/com/jewelry/backend/service/ErpSyncService.java:689` builds
`external_ref = "TRS-" + accountId (36-char UUID) + "-" + installmentNumber` (42+ characters), while
`projects/erp-backend/app/api/v1/integrations.py:191` declares `BridgeAdvance.external_ref` with
`max_length=40`. There is no admin push for ADVANCE events (`syncNow` only handles SALE and
CREDIT_NOTE, `ErpSyncService.java:277-296`), so the row retries 30 times and then stays FAILED
silently. Fix: a shorter reference (e.g. the installment id, or `TRS-<8 chars>-<n>`), and either side's
limit documented.

**Defect 3 (fixed) -- repair service invoice rejected by the ERP (`payment.date` must be None).**
The SALE event for `SRV/2026-27/00004` fails on the flush with

```
HTTP 422: {"detail":[{"type":"none_required","loc":["body","payment","date"],"msg":"Input should be None","input":"2026-10-02"}]}
```

Cause: `projects/erp-backend/app/api/v1/integrations.py:151-155` defines
`class BridgePayment(BaseModel): ... date: Optional[date] = None`. The module has
`from __future__ import annotations` (line 39), so the annotation is the string `"Optional[date]"` and
pydantic resolves the name `date` in the class namespace first, where `date` is now the field's default
`None`; the field type becomes `Optional[None]` and any real date is rejected. The web-order SALE
does not hit this because a cash-on-delivery order sends `payment: null`; the repair job sends the
paid amount with a date (`ErpSyncService.java:630-636`), and an online (Razorpay) order would hit it
too. Fix: rename the field or the import (`from datetime import date as Date`, or `payment_date`
with an alias). The classes with `date: date` and no default (lines 194, 219) are unaffected.

**Defect 4 (fixed) -- a product with an ERP material code cannot be invoiced in the ERP (500).**
`POST /api/v1/orders/{id}/erp-sync` for `WEB/2026-27/00007` (product `E2E-PEND-002`,
`erpMaterialCode=E2E-PEND`) records

```
HTTP 500: {"detail":"Invoice creation failed. The operation was rolled back and nothing was saved.","status":"error"}
```

ERP log: `sqlalchemy.exc.DBAPIError: (asyncpg) invalid input for query argument $1: 'E2E-PEND'
(invalid UUID 'E2E-PEND': length must be between 32..36 characters, got 8)` raised from
`projects/erp-backend/app/api/v1/sales.py:677-681`. The material lookup at `sales.py:339-345` correctly
guards the code with `_as_uuid()` and `CAST(:mid AS UUID)`, but the stock-relief loop at `:677-680`
binds `str(line.material_id)` straight into `id = :mid` for a `uuid` column, so any code that is not
also a material UUID (and the store only sends codes, `ErpSyncService.java:493`) aborts the whole
invoice after the customer party has already been committed. On the image built before commit
`f72eb86` the same request failed earlier, at `integrations.py:286` (`InvoiceLineRequest.material_id`
was `Optional[UUID]`; a pydantic `ValidationError` became a generic 500). Fix: use `_as_uuid()` in the
second query as well; consider an explicit 400 when a sent code has no item-master row.

**Minor, not counted above (fixed).** `DELETE /api/v1/cart` (no such mapping; the script uses
`DELETE /cart/items/{id}`) answers `500 Internal Server Error` instead of 405 because
`GlobalExceptionHandler.java:103-107` catches every `Exception`, including Spring's
`HttpRequestMethodNotSupportedException`.

### Infrastructure defects found and fixed in this run (files outside application source)

| Symptom | Cause | Fix applied |
|---|---|---|
| `erp-migrate` exits 1: `ModuleNotFoundError: No module named 'psycopg'` | `docker-compose.erp.yml` passes `SYNC_DATABASE_URL=postgresql://...`; `requirements.txt` pins `sqlalchemy>=2.0.35,<3` and now resolves to **2.1.1**, whose default `postgresql://` driver is psycopg 3, while the image ships `psycopg2-binary` | `docker-compose.erp.yml`: `postgresql+psycopg2://` for both `SYNC_DATABASE_URL` values |
| ERP API crash-loops: `The SQLAlchemy asyncio module requires that the Python 'greenlet' library is installed` | SQLAlchemy 2.1 no longer depends on greenlet; `requirements.txt` uses `sqlalchemy` without the `[asyncio]` extra | `projects/erp-backend/Dockerfile`: `greenlet>=3.0` added to both `pip wheel` and `pip install` (the proper fix is `sqlalchemy[asyncio]` in `requirements.txt`, which is application source) |
| Store API fails to start: `io.jsonwebtoken.io.DecodingException: Illegal base64 character: '_'` | `.env.local.example` ships `JWT_SECRET=local_dev_secret_change_me_...`, but `JwtUtils.java:29` Base64-decodes the secret | `.env.local.example`: hex secret plus a comment (`openssl rand -hex 32`) |
| Store API cannot reach the ERP: `host.docker.internal` does not resolve from `jewelry-backend-local` | `docker-compose.local.yml` sets `dns: [8.8.8.8, 1.1.1.1]` on the backend, which bypasses Docker's internal resolver that answers `host.docker.internal` | `extra_hosts: ["host.docker.internal:host-gateway"]` on the backend service |
| Storefront logs `ERROR: Bad Request ... Header "host" with value "localhost:4200" is not allowed` on every request and falls back to client-side rendering | `@angular/ssr` 20.3 validates the Host header against `NG_ALLOWED_HOSTS` (`node_modules/@angular/ssr/fesm2022/node.mjs:14-27`); the manifest's `allowedHosts` is empty and no env file sets the variable | `NG_ALLOWED_HOSTS=localhost,127.0.0.1` in `.env.local.example` (and a production-shaped value in `.env.frontend.example`); SSR now renders `/` in 0.14 s |
| `docker compose` for either stack warns about the other's containers as orphans; `down --remove-orphans` on one would delete the other | Both compose files live in the same directory and share the default project name `gemera_ecomm` | `name: caratloop-local` in `docker-compose.local.yml` (the ERP keeps the default so its existing volume name is unchanged) |
| Storefront/admin image builds transfer a 400+ MB context | `.dockerignore` only ignores the root `node_modules`; `projects/erp-frontend/node_modules` (483 MB) and `.next` (326 MB) were shipped to the builder | `**/node_modules`, `**/.next`, `**/.venv`, `projects/erp-*` added to `.dockerignore` |
| `.env.local.example` had no ERP bridge variables | -- | `ERP_BASE_URL` / `ERP_API_KEY` block added with the `host.docker.internal:8010` value |
| Store API container cannot start: `Bind for 0.0.0.0:8080 failed: port is already allocated` (after a Docker Desktop restart) | Another project's container on this laptop publishes 8080 | Host ports made overridable (`API_PORT`, `STOREFRONT_PORT`, `ADMIN_PORT`) in `docker-compose.local.yml`; `.env.local` uses 18080 |
| Backend build failed on application code | not observed: `gradle test bootJar` was green in both builds (1m39s / 1m30s) | -- |

`.env.local` and `.env.erp` already existed with what looked like real credentials; they were moved
aside as `.env.local.pre-e2e.bak` / `.env.erp.pre-e2e.bak` (both gitignored) and rewritten with fake
values (`smtp.invalid`, fake R2 keys, empty Razorpay), so no e-mail leaves the machine (every send
is logged as `MailConnectException` and swallowed) and no gateway call is possible.

### Logs

`docker logs` of all nine containers after the run:

- `jewelry-backend-local`: one ERROR at start-up, expected with empty keys: `PaymentService: Razorpay is
  not configured ... Payment endpoints will fail closed.` Every order / return / repair transition logs a
  `WARN EmailService: Failed to send email` with a `MailSendException` stack trace (fake SMTP host); the
  request itself succeeds. No other ERROR/SEVERE.
- `jewelry-frontend-local`: before the `NG_ALLOWED_HOSTS` fix, one `ERROR: Bad Request` per request
  (see table). Right after that container was recreated on 2026-09-26 the first SSR renders logged
  `HttpErrorResponse ... http://backend:8080/api/v1/products: 0 Unknown Error` / `metal-prices/today`
  (data fetches in the first seconds after start-up); in the 2026-10-02 run the log is clean.
- `jewelry-admin-local`, `jewelry-postgres-local`, `caratloop_erp_frontend`, `caratloop_erp_nginx`,
  `caratloop_erp_migrate`: no errors.
- `caratloop_erp_backend`: 11 x `ERROR:app.api.v1.sales:Invoice creation failed` with the asyncpg
  `DataError` traceback of defect 4: the manual pushes plus the five-minute retry of the two FAILED
  SALE rows (`WEB/2026-27/00005`, `WEB/2026-27/00007`), which continues until their 30th attempt.
  On the pre-`f72eb86` image the same request failed as a pydantic `ValidationError` for
  `material_id`. Nothing else.
- `caratloop_erp_db`: two `ERROR` lines from the first two (syntax-fixing) attempts of the seed script.

### Other observations

- The store's auth endpoints are rate-limited to 5 requests per minute per IP
  (`RateLimitingFilter.java`, `AuthController.java`); a scripted run trips it easily. The script waits
  61 s and retries once.
- `GET /api/v1/orders/{id}` exposes `erpSyncStatus` / `erpLastError` for the SALE event only; return
  credit notes, exchange purchases, advances and service invoices have no API visibility of their
  outbox row. The script reads `erp_sync_events` through `docker exec ... psql`.
- The ERP `GET /vouchers` list has no `reference_no`; `GET /accounting/journal-entries?entry_type=`
  (unpaginated) is the endpoint to match `<invoice>/CN/<rma>`, `ADV/<ref>` and `Refund <ref>`.
