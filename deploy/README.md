# Deploying to the two Oracle VMs

Both free-tier VMs run Oracle Linux 9 on x86_64 with about 500 MB of visible RAM, two vCPUs and a swap
file. The stack is split so that no VM carries two heavy processes:

| VM | Role | Runs | Public host names |
|---|---|---|---|
| 129.159.18.63 ("caratloop") | `core` | store API (Java), its PostgreSQL, admin SPA, Caddy | `api.`, `admin.` |
| 68.233.96.36 ("bullion") | `edge` | SSR storefront, ERP API + PostgreSQL + UI, Caddy | `www.`/apex, `erp.` |

Caddy terminates HTTPS on each VM and gets certificates itself. Only ports 22, 80 and 443 are open; the
databases and every application port stay on the Docker network. The storefront bridge on the core VM
reaches the ERP over `https://<ERP_HOST>/api/v1`, which Caddy routes straight to the ERP API.

## Prerequisites

1. **OCI network.** In the VCN security list (or network security group) of each VM allow ingress TCP 80
   and 443 from 0.0.0.0/0. Port 80 was already open; 443 was not.
2. **DNS.** A records for `api`, `admin` → 129.159.18.63 and for `www`, apex, `erp` → 68.233.96.36.
   Until then the `sslip.io` names in the `env.example` files resolve to the IPs and get real certificates.

## First deployment

```bash
deploy/deploy.sh core opc@129.159.18.63 ~/.ssh/core.key --bootstrap
deploy/deploy.sh edge opc@68.233.96.36  ~/.ssh/edge.key --bootstrap
```

`bootstrap.sh` installs Docker if needed, adds a 4 GB swap file, restricts firewalld to ssh/80/443 and
creates the env files from the examples with generated secrets. It then stops: edit on each VM

- `~/caratloop/deploy/core/.env` and `.env.backend` (host names, SMTP, R2, Razorpay, `ERP_BASE_URL=https://<ERP_HOST>`),
- `~/caratloop/deploy/edge/.env`, `.env.frontend` and `.env.erp` (host names, `API_URL`, `ECOMMERCE_API_KEY` equal to the core VM's `ERP_API_KEY`),

and run the same `deploy.sh` line again without `--bootstrap`.

**ERP first user.** Nothing in the ERP creates its first company or owner; `ADMIN_EMAIL` / `ADMIN_PASSWORD` in
`.env.erp` are only validated, not applied. After the edge stack is up, seed once (idempotent) on the edge VM:

```bash
cd ~/caratloop/deploy/edge
em=$(grep -E '^ADMIN_EMAIL=' .env.erp | cut -d= -f2-); pw=$(grep -E '^ADMIN_PASSWORD=' .env.erp | cut -d= -f2-)
sudo docker compose exec -T erp-db psql -U caratloop -d caratloop_erp -v ON_ERROR_STOP=1   -v email="$em" -v password="$pw" -v company_name=Caratloop -v legal_name="Caratloop Jewels" -v gstin=""   < ~/caratloop/erp-seed-first-company.sql     # copy scripts/erp-seed-first-company.sql there first
```

Then sign in and fill the company GSTIN and address under Settings.

To keep the data of an earlier deployment, set `POSTGRES_VOLUME` (core) or `ERP_POSTGRES_VOLUME` (edge) in
`.env` to the existing volume name before the first `up`.

## Updating

```bash
deploy/deploy.sh core opc@129.159.18.63 ~/.ssh/core.key
deploy/deploy.sh edge opc@68.233.96.36  ~/.ssh/edge.key
```

## Memory on the free-tier VMs

Oracle Linux boots these 1 GB VMs with `crashkernel=1G-64G:448M`, reserving 448 MB for kdump, so only about
500 MB is usable. `bootstrap.sh` disables kdump and removes the boot argument; **reboot once after the first
bootstrap** to get the memory back (`sudo systemctl reboot`). It also sets `vm.swappiness=10`: with the
default the JVM was swapped out in favour of page cache and the store API took 13 minutes to start and
30 seconds per request.

## Memory budget

| Service | Cap | Note |
|---|---|---|
| store API | 560 MB | `-Xmx300m`, Serial GC, one JIT tier |
| PostgreSQL (each) | 160 MB | `shared_buffers=32MB`, 40 connections |
| storefront SSR | 260 MB | Node heap 160 MB |
| ERP API | 260 MB | one uvicorn worker (image default is four) |
| ERP UI | 200 MB | Node heap 128 MB |
| Caddy, admin | 96 / 48 MB | |

Caps add up to more than the RAM; the swap file absorbs the difference and the caps only stop a leak
from taking everything. Check with `free -m` and `sudo docker stats --no-stream`.
