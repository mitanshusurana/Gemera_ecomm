#!/usr/bin/env bash
# Prepares an Oracle Linux 9 VM for one of the compose stacks in this directory.
# Idempotent: safe to run again. Usage, on the VM, from ~/caratloop:
#   bash deploy/bootstrap.sh core|edge
#
# - Docker Engine + compose plugin (installs if missing)
# - a 4 GB swap file (the free-tier box shows ~500 MB of RAM)
# - firewalld: only ssh, 80 and 443 reach the host; every old published port is closed
# - env files created from the examples with generated secrets where one is blank
set -euo pipefail

role="${1:?usage: bootstrap.sh core|edge}"
[[ "$role" == core || "$role" == edge ]] || { echo "role must be core or edge" >&2; exit 2; }
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/.." && pwd)"
stack="$here/$role"

say() { printf '\n== %s\n' "$*"; }
rand() { openssl rand -hex "${1:-32}"; }
# URL-encode a string with Python (always present on Oracle Linux).
urlenc() { python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"; }
# set_if_blank FILE KEY VALUE: fill KEY only when it is missing or empty.
set_if_blank() {
    local f="$1" k="$2" v="$3"
    if grep -qE "^${k}=.*[^[:space:]]" "$f"; then return; fi
    if grep -qE "^${k}=" "$f"; then
        python3 - "$f" "$k" "$v" <<'PY'
import sys, re
f, k, v = sys.argv[1:]
s = open(f, encoding="utf-8").read()
s = re.sub(rf"(?m)^{re.escape(k)}=.*$", lambda m: f"{k}={v}", s, count=1)
open(f, "w", encoding="utf-8", newline="\n").write(s)
PY
    else
        printf '%s=%s\n' "$k" "$v" >> "$f"
    fi
    echo "   $k: generated"
}

say "Docker"
if ! command -v docker >/dev/null; then
    sudo dnf -y install dnf-plugins-core
    sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
    sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" || true
docker compose version >/dev/null 2>&1 || sudo docker compose version
echo "   $(sudo docker --version)"

say "Swap"
if ! swapon --show --noheadings | grep -q .; then
    sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
sudo sysctl -qw vm.swappiness=60 vm.overcommit_memory=1
echo 'vm.swappiness=60' | sudo tee /etc/sysctl.d/90-caratloop.conf >/dev/null
echo 'vm.overcommit_memory=1' | sudo tee -a /etc/sysctl.d/90-caratloop.conf >/dev/null
swapon --show

say "Firewall (ssh, 80, 443 only)"
sudo systemctl enable --now firewalld >/dev/null
for p in $(sudo firewall-cmd --list-ports); do sudo firewall-cmd --permanent --remove-port="$p" >/dev/null; done
sudo firewall-cmd --permanent --add-service=http --add-service=https --add-service=ssh >/dev/null
sudo firewall-cmd --reload >/dev/null
echo "   services: $(sudo firewall-cmd --list-services)  ports: $(sudo firewall-cmd --list-ports || true)"

say "Env files in $stack"
cd "$stack"
[[ -f .env ]] || { cp env.example .env; echo "   .env created from example: EDIT THE HOST NAMES"; }
if [[ "$role" == core ]]; then
    [[ -f .env.backend ]] || { cp "$repo/.env.backend.example" .env.backend; echo "   .env.backend created from example"; }
    db="$(rand 24)"
    set_if_blank .env.backend POSTGRES_PASSWORD "$db"
    set_if_blank .env.backend SPRING_DATASOURCE_PASSWORD "$(grep -E '^POSTGRES_PASSWORD=' .env.backend | cut -d= -f2-)"
    set_if_blank .env.backend JWT_SECRET "$(rand 32)"
    set_if_blank .env.backend ADMIN_PASSWORD "$(rand 12)"
    set_if_blank .env.backend ERP_API_KEY "$(rand 32)"
    # Values the example ships as placeholders must be replaced by hand.
    if grep -qE '^(POSTGRES_PASSWORD|SPRING_DATASOURCE_PASSWORD|JWT_SECRET|ADMIN_PASSWORD)=CHANGE_ME' .env.backend; then
        python3 - <<'PY'
import re, secrets
f = ".env.backend"; s = open(f, encoding="utf-8").read()
db = secrets.token_hex(24)
s = re.sub(r"(?m)^POSTGRES_PASSWORD=CHANGE_ME.*$", f"POSTGRES_PASSWORD={db}", s)
s = re.sub(r"(?m)^SPRING_DATASOURCE_PASSWORD=CHANGE_ME.*$", f"SPRING_DATASOURCE_PASSWORD={db}", s)
s = re.sub(r"(?m)^JWT_SECRET=CHANGE_ME.*$", f"JWT_SECRET={secrets.token_hex(32)}", s)
s = re.sub(r"(?m)^ADMIN_PASSWORD=CHANGE_ME.*$", f"ADMIN_PASSWORD={secrets.token_hex(12)}", s)
open(f, "w", encoding="utf-8", newline="\n").write(s)
print("   replaced CHANGE_ME placeholders")
PY
    fi
    echo "   still to fill by hand in .env.backend: MAIL_*, R2_*, RAZORPAY_* (optional), CORS/URL hosts, ERP_BASE_URL"
else
    [[ -f .env.frontend ]] || { cp "$repo/.env.frontend.example" .env.frontend; echo "   .env.frontend created from example"; }
    [[ -f .env.erp ]] || { cp "$repo/.env.erp.example" .env.erp; echo "   .env.erp created from example"; }
    pw="$(grep -E '^ERP_POSTGRES_PASSWORD=' .env | cut -d= -f2-)"
    if [[ -z "$pw" ]]; then pw="$(rand 24)"; set_if_blank .env ERP_POSTGRES_PASSWORD "$pw"; fi
    set_if_blank .env ERP_POSTGRES_PASSWORD_URLENC "$(urlenc "$pw")"
    # The ERP compose in the repo root reads these two from .env.erp; keep them in step.
    set_if_blank .env.erp POSTGRES_PASSWORD "$pw"
    set_if_blank .env.erp POSTGRES_PASSWORD_URLENC "$(urlenc "$pw")"
    set_if_blank .env.erp JWT_SECRET "$(rand 32)"
    set_if_blank .env.erp ADMIN_EMAIL "admin@caratloop.com"
    set_if_blank .env.erp ADMIN_PASSWORD "$(rand 12)"
    set_if_blank .env.erp ECOMMERCE_API_KEY "$(rand 32)"
    echo "   still to fill by hand: .env.frontend API_URL/SSR_API_URL/NG_ALLOWED_HOSTS/RAZORPAY_KEY; .env.erp ECOMMERCE_API_KEY must equal ERP_API_KEY on the core VM"
fi
chmod 600 .env .env.* 2>/dev/null || true

say "Done. Next: edit the env files, then  docker compose pull && docker compose up -d  in $stack"
