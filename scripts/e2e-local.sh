#!/usr/bin/env bash
# End-to-end smoke run of the whole Caratloop system from source, on one machine.
#
#   bash scripts/e2e-local.sh                 # full run: build + start both stacks, seed, exercise, scan logs
#   E2E_SKIP_BUILD=1 bash scripts/e2e-local.sh   # stacks already running: skip `up --build`
#   E2E_ADVANCE_WAIT_SECONDS=0 bash scripts/e2e-local.sh   # do not wait for the 5-minute ERP outbox flush
#
# Needs: docker compose, curl, python (3.x on PATH as `python`). Nothing else.
# Runs on Git Bash (Windows), Linux and macOS. Idempotent: it reuses the seeded
# admin, category, product, customer and treasure plan, and it creates a fresh
# order / return / repair / exchange on every run (numbers keep counting up).
#
# Every step prints PASS or FAIL and the summary table at the end lists them all.
# Exit code = number of failed steps (capped at 99). Nothing is torn down: both
# stacks stay up so the ports below can be inspected afterwards:
#   store   API http://localhost:8080  storefront http://localhost:4200  admin http://localhost:4300  Postgres 127.0.0.1:5432
#           (host ports follow API_PORT / STOREFRONT_PORT / ADMIN_PORT in .env.local)
#   ERP     API http://127.0.0.1:8010  UI http://127.0.0.1:3001  nginx http://localhost:80  Postgres 127.0.0.1:5433
#
# The full log of every request goes to $E2E_LOG (default: scripts/e2e-local.log, gitignored via *.log).

set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# Everything below uses paths relative to the repository root, so it works the
# same under Git Bash (which would otherwise rewrite /c/... paths for docker.exe
# and curl.exe), Linux and macOS. No container paths are passed to docker.

ERP_API="${ERP_API:-http://127.0.0.1:8010/api/v1}"
ERP_HEALTH="${ERP_HEALTH:-http://127.0.0.1:8010/health}"
E2E_LOG="${E2E_LOG:-scripts/e2e-local.log}"
E2E_SKIP_BUILD="${E2E_SKIP_BUILD:-0}"
E2E_ADVANCE_WAIT_SECONDS="${E2E_ADVANCE_WAIT_SECONDS:-360}"
E2E_INCLUDE_KNOWN_BUGS="${E2E_INCLUDE_KNOWN_BUGS:-1}"
RUN_ID="$(date +%Y%m%d%H%M%S)"
TMP="scripts/.e2e-tmp.$$"; mkdir -p "$TMP"
: > "$E2E_LOG"

STORE_COMPOSE=(docker compose -f docker-compose.local.yml --env-file .env.local)
ERP_COMPOSE=(docker compose -f docker-compose.erp.yml --env-file .env.erp)

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
RESULTS=()
FAILS=0
STEP=0
log() { printf '%s %s\n' "$(date +%H:%M:%S)" "$*" >> "$E2E_LOG"; }
say() { printf '%s\n' "$*"; log "$*"; }
pass() { STEP=$((STEP+1)); RESULTS+=("PASS|$STEP|$1|${2:-}"); say "PASS  [$STEP] $1${2:+  -- $2}"; }
fail() { STEP=$((STEP+1)); FAILS=$((FAILS+1)); RESULTS+=("FAIL|$STEP|$1|${2:-}"); say "FAIL  [$STEP] $1${2:+  -- $2}"; }
skip() { STEP=$((STEP+1)); RESULTS+=("SKIP|$STEP|$1|${2:-}"); say "SKIP  [$STEP] $1${2:+  -- $2}"; }

# py EXPR  : evaluate a python expression over the JSON on stdin, bound to `d`.
py() { python -c 'import sys,json
d=json.loads(sys.stdin.read() or "null")
v=eval(sys.argv[1])
print("" if v is None else (json.dumps(v) if isinstance(v,(dict,list)) else v))' "$1" 2>/dev/null; }

# envget FILE KEY : value of KEY in a dotenv file (quotes stripped, comments ignored).
envget() { python - "$1" "$2" <<'PY'
import sys,re
path,key=sys.argv[1],sys.argv[2]
val=""
for line in open(path,encoding="utf-8",errors="replace"):
    line=line.strip()
    if not line or line.startswith("#") or "=" not in line: continue
    k,v=line.split("=",1)
    if k.strip()!=key: continue
    v=v.strip()
    if v[:1] in "\"'" and v[-1:]==v[:1]: v=v[1:-1]
    else: v=re.split(r"\s+#",v,1)[0].strip()
    val=v
print(val)
PY
}

# req METHOD URL [TOKEN] [JSON]  -> sets CODE and BODY
CODE=""; BODY=""
req() {
    local method="$1" url="$2" token="${3:-}" data="${4:-}" out
    local args=(-s -m 60 -X "$method" "$url" -H 'Accept: application/json')
    [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
    [ -n "$data" ] && args+=(-H 'Content-Type: application/json' --data-raw "$data")
    out="$(curl "${args[@]}" -w $'\n%{http_code}' 2>>"$E2E_LOG")" || out=$'\n000'
    CODE="${out##*$'\n'}"; BODY="${out%$'\n'*}"
    log "$method $url -> $CODE ${BODY:0:600}"
}
# reqfile METHOD URL TOKEN OUTFILE -> CODE, CTYPE, CDISP
CTYPE=""; CDISP=""
reqfile() {
    local h="$TMP/headers"
    CODE="$(curl -s -m 60 -X "$1" "$2" -H "Authorization: Bearer $3" -D "$h" -o "$4" -w '%{http_code}' 2>>"$E2E_LOG")" || CODE=000
    CTYPE="$(grep -i '^content-type:' "$h" | tr -d '\r' | sed 's/^[^:]*: *//')"
    CDISP="$(grep -i '^content-disposition:' "$h" | tr -d '\r' | sed 's/^[^:]*: *//')"
    log "$1 $2 -> $CODE $CTYPE $CDISP"
}
wait_http() { # wait_http URL SECONDS
    local i=0 c
    while [ $i -lt "$2" ]; do
        c="$(curl -s -m 5 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null)"
        [ "$c" = "200" ] && return 0
        sleep 5; i=$((i+5))
    done
    return 1
}
store_sql() { docker exec jewelry-postgres-local psql -U "$PG_USER" -d "$PG_DB" -Atc "$1" 2>>"$E2E_LOG"; }
detail() { printf '%s' "$BODY" | py 'd.get("detail") or d.get("message") or d.get("error") or d' 2>/dev/null | head -c 300; }

# Store auth calls are rate limited to 5/min per IP (RateLimitingFilter); a 429
# gets one 61-second wait and retry.
store_login() { # store_login EMAIL PASSWORD -> prints token
    local body="{\"email\":\"$1\",\"password\":\"$2\"}"
    req POST "$STORE_API/auth/login" "" "$body"
    if [ "$CODE" = "429" ]; then say "      auth rate limit hit; waiting 61s"; sleep 61; req POST "$STORE_API/auth/login" "" "$body"; fi
    [ "$CODE" = "200" ] && printf '%s' "$BODY" | py 'd["token"]'
}

# ---------------------------------------------------------------------------
# 0. configuration
# ---------------------------------------------------------------------------
say "== Caratloop local end-to-end run $RUN_ID (log: $E2E_LOG)"
for tool in docker curl python; do command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 2; }; done

if [ ! -f .env.local ]; then
    say "   .env.local missing: creating it from .env.local.example with fake values and the ERP bridge"
    cp .env.local.example .env.local
    printf '\n# --- ERP bridge (added by scripts/e2e-local.sh; must equal ECOMMERCE_API_KEY in .env.erp) ---\nERP_BASE_URL=http://host.docker.internal:8010\nERP_API_KEY=e2e-shared-bridge-key-0123456789abcdef\n' >> .env.local
fi
if [ ! -f .env.erp ]; then
    say "   .env.erp missing: creating it from .env.erp.example with fake values"
    python - <<'PY'
vals={"POSTGRES_PASSWORD":"erplocaldevpassword","POSTGRES_PASSWORD_URLENC":"erplocaldevpassword",
"JWT_SECRET":"erp_e2e_fake_jwt_secret_0123456789abcdef0123456789abcdef","ADMIN_EMAIL":"erp-admin@caratloop.local",
"ADMIN_PASSWORD":"E2eErpAdmin12345!","ECOMMERCE_API_KEY":"e2e-shared-bridge-key-0123456789abcdef",
"ENVIRONMENT":"development","CORS_ORIGINS":'["http://localhost","http://localhost:3001"]'}
out=[]
for line in open(".env.erp.example",encoding="utf-8"):
    k=line.split("=",1)[0].strip() if "=" in line and not line.startswith("#") else None
    out.append(f"{k}={vals[k]}\n" if k in vals else line)
open(".env.erp","w",newline="\n").writelines(out)
PY
fi

ADMIN_EMAIL="$(envget .env.local ADMIN_EMAIL)"; ADMIN_PASSWORD="$(envget .env.local ADMIN_PASSWORD)"
# Host ports follow .env.local (API_PORT / STOREFRONT_PORT / ADMIN_PORT, see docker-compose.local.yml).
API_PORT="$(envget .env.local API_PORT)"; API_PORT="${API_PORT:-8080}"
STOREFRONT_PORT="$(envget .env.local STOREFRONT_PORT)"; STOREFRONT_PORT="${STOREFRONT_PORT:-4200}"
ADMIN_PORT="$(envget .env.local ADMIN_PORT)"; ADMIN_PORT="${ADMIN_PORT:-4300}"
STORE_API="${STORE_API:-http://127.0.0.1:$API_PORT/api/v1}"
STORE_HEALTH="${STORE_HEALTH:-http://127.0.0.1:$API_PORT/actuator/health}"
PG_USER="$(envget .env.local POSTGRES_USER)"; PG_DB="$(envget .env.local POSTGRES_DB)"
ERP_API_KEY="$(envget .env.local ERP_API_KEY)"; ERP_BASE_URL="$(envget .env.local ERP_BASE_URL)"
ERP_ADMIN_EMAIL="$(envget .env.erp ADMIN_EMAIL)"; ERP_ADMIN_PASSWORD="$(envget .env.erp ADMIN_PASSWORD)"
ECOMMERCE_API_KEY="$(envget .env.erp ECOMMERCE_API_KEY)"

if [ -n "$ERP_API_KEY" ] && [ "$ERP_API_KEY" = "$ECOMMERCE_API_KEY" ] && [ -n "$ERP_BASE_URL" ]; then
    pass "bridge key: ERP_API_KEY (.env.local) == ECOMMERCE_API_KEY (.env.erp), ERP_BASE_URL=$ERP_BASE_URL"
else
    fail "bridge key: set ERP_API_KEY in .env.local equal to ECOMMERCE_API_KEY in .env.erp and ERP_BASE_URL (e.g. http://host.docker.internal:8010)"
fi

# ---------------------------------------------------------------------------
# 1. stacks
# ---------------------------------------------------------------------------
if [ "$E2E_SKIP_BUILD" != "1" ]; then
    say "== building and starting the store stack (Postgres, Spring API with gradle test, storefront SSR, admin)"
    ok=0
    for attempt in 1 2 3; do
        if "${STORE_COMPOSE[@]}" up -d --build >>"$E2E_LOG" 2>&1; then ok=1; break; fi
        say "   store build/up failed (attempt $attempt); other agents may be mid-edit: waiting 120s and retrying"
        tail -n 40 "$E2E_LOG" | grep -E "error:|FAILED|ERROR" | head -10
        sleep 120
    done
    [ $ok = 1 ] && pass "store stack: docker compose up -d --build" || fail "store stack: docker compose up -d --build" "see $E2E_LOG"
else
    skip "store stack build (E2E_SKIP_BUILD=1)"
fi
if wait_http "$STORE_HEALTH" 420; then pass "store API health $STORE_HEALTH"; else fail "store API health" "$(docker logs jewelry-backend-local 2>&1 | grep -E 'ERROR|Caused by' | tail -3 | tr '\n' ' ')"; fi
c="$(curl -s -m 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$STOREFRONT_PORT/")"; [ "$c" = "200" ] && pass "storefront SSR answers on :$STOREFRONT_PORT" || fail "storefront SSR on :$STOREFRONT_PORT" "HTTP $c"
c="$(curl -s -m 10 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$ADMIN_PORT/")"; [ "$c" = "200" ] && pass "admin SPA answers on :$ADMIN_PORT" || fail "admin SPA on :$ADMIN_PORT" "HTTP $c"

if [ "$E2E_SKIP_BUILD" != "1" ]; then
    say "== building and starting the ERP stack (Postgres 5433, alembic, API 8010, UI 3001, nginx 80/443)"
    if "${ERP_COMPOSE[@]}" up -d --build >>"$E2E_LOG" 2>&1; then pass "ERP stack: docker compose up -d --build"; else fail "ERP stack: docker compose up -d --build" "$(docker logs caratloop_erp_migrate 2>&1 | tail -2 | tr '\n' ' ')"; fi
else
    skip "ERP stack build (E2E_SKIP_BUILD=1)"
fi
if wait_http "$ERP_HEALTH" 180; then pass "ERP API health $ERP_HEALTH"; else fail "ERP API health" "$(docker logs caratloop_erp_backend 2>&1 | tail -2 | tr '\n' ' ')"; fi
c="$(curl -s -m 10 -o /dev/null -w '%{http_code}' http://127.0.0.1/healthz)"; [ "$c" = "200" ] && pass "ERP nginx answers on :80" || fail "ERP nginx on :80" "HTTP $c"
if docker exec jewelry-backend-local curl -s -m 5 -o /dev/null -w '%{http_code}' "$ERP_BASE_URL/health" 2>/dev/null | grep -q 200; then
    pass "ERP reachable from the store API container at $ERP_BASE_URL"
else
    fail "ERP reachable from the store API container at $ERP_BASE_URL" "docker exec jewelry-backend-local curl failed (dns: override without extra_hosts host-gateway?)"
fi

# ---------------------------------------------------------------------------
# 2. ERP seed, login, chart of accounts
# ---------------------------------------------------------------------------
say "== seeding the ERP's first company and owner (scripts/erp-seed-first-company.sql)"
if "${ERP_COMPOSE[@]}" exec -T erp-db psql -U caratloop -d caratloop_erp -v ON_ERROR_STOP=1 \
        -v email="$ERP_ADMIN_EMAIL" -v password="$ERP_ADMIN_PASSWORD" \
        -v company_name=Caratloop -v legal_name="Caratloop Jewels Private Limited" -v gstin=08AAAAA0000A1Z5 \
        < scripts/erp-seed-first-company.sql >>"$E2E_LOG" 2>&1; then
    pass "ERP seed SQL applied (idempotent)"
else
    fail "ERP seed SQL" "$(tail -3 "$E2E_LOG" | tr '\n' ' ')"
fi
req POST "$ERP_API/auth/login" "" "{\"email\":\"$ERP_ADMIN_EMAIL\",\"password\":\"$ERP_ADMIN_PASSWORD\"}"
ETOK="$(printf '%s' "$BODY" | py 'd.get("access_token")')"
[ -n "$ETOK" ] && pass "ERP login $ERP_ADMIN_EMAIL" || fail "ERP login" "HTTP $CODE $(detail)"
req GET "$ERP_API/auth/me" "$ETOK"
ERP_COMPANY="$(printf '%s' "$BODY" | py 'd["company"]["id"]')"
[ -n "$ERP_COMPANY" ] && pass "ERP /auth/me returns company $(printf '%s' "$BODY" | py 'd["company"]["name"]') gstin $(printf '%s' "$BODY" | py 'd["company"]["gstin"]')" || fail "ERP /auth/me" "HTTP $CODE $(detail)"
req GET "$ERP_API/accounting/accounts?limit=1000" "$ETOK"
n="$(printf '%s' "$BODY" | py 'len(d["accounts"])')"; missing="$(printf '%s' "$BODY" | py 'sorted(set(["BNK-001","SAL-001","SAL-005","GST-001","GST-002","GST-005","STK-008","ITC-004","RCM-001","RCM-002","COGS-001"])-set(a["code"] for a in d["accounts"]))')"
if [ -n "$n" ] && [ "$n" -gt 0 ] && [ "$missing" = "[]" ]; then pass "ERP chart of accounts: $n accounts, all bridge codes present"; else fail "ERP chart of accounts" "HTTP $CODE accounts=$n missing=$missing"; fi

# ---------------------------------------------------------------------------
# 3. store flow
# ---------------------------------------------------------------------------
say "== store: admin login, settings, catalogue"
ATOK="$(store_login "$ADMIN_EMAIL" "$ADMIN_PASSWORD")"
[ -n "$ATOK" ] && pass "store admin login $ADMIN_EMAIL" || fail "store admin login" "HTTP $CODE $(detail)"

req PUT "$STORE_API/admin/settings" "$ATOK" '{"companyLegalName":"Caratloop Jewels Private Limited","companyGstin":"08AAAAA0000A1Z5","companyPan":"AAAAA0000A","companyAddress":"S149 Mahaveer Nagar, Jaipur 302018","companyStateCode":"08","invoiceSeriesPrefix":"WEB","taxRateJewelry":"0.03","taxRateDefault":"0.03","taxRateRepairService":"0.18","companyPhone":"+91 0000000000","companyEmail":"support@caratloop.local"}'
sc="$CODE"; req GET "$STORE_API/admin/settings" "$ATOK"
if [ "$sc" = "200" ] && [ "$(printf '%s' "$BODY" | py 'd.get("companyGstin")')" = "08AAAAA0000A1Z5" ]; then pass "company settings saved (legal name, GSTIN 08AAAAA0000A1Z5, state 08, WEB prefix, 3% jewellery GST)"; else fail "company settings" "PUT HTTP $sc, GET companyGstin=$(printf '%s' "$BODY" | py 'd.get("companyGstin")')"; fi

req POST "$STORE_API/admin/categories" "$ATOK" '{"name":"e2e-jewellery","displayName":"E2E Jewellery","itemType":"JEWELLERY","isActive":true}'
if [ "$CODE" = "200" ] || [ "$CODE" = "201" ]; then pass "category e2e-jewellery created"; else
    req GET "$STORE_API/admin/categories" "$ATOK"
    if printf '%s' "$BODY" | grep -q '"name":"e2e-jewellery"'; then pass "category e2e-jewellery already exists"; else fail "category create" "HTTP $CODE $(detail)"; fi
fi

req GET "$STORE_API/products/sku/E2E-RING-001" ""
PID="$(printf '%s' "$BODY" | py 'd.get("id")')"
if [ "$CODE" = "200" ] && [ -n "$PID" ]; then
    stock="$(printf '%s' "$BODY" | py 'd.get("stock")')"
    if [ "${stock:-0}" -lt 1 ] 2>/dev/null; then
        req PUT "$STORE_API/products/$PID" "$ATOK" "$(printf '%s' "$BODY" | py 'json.dumps(dict(d, stock=5))')"
    fi
    pass "product E2E-RING-001 reused ($PID)"
else
    req POST "$STORE_API/products" "$ATOK" '{"name":"E2E Gold Ring","description":"E2E test ring","price":25000,"category":"Jewelry","subCategory":"e2e-jewellery","sku":"E2E-RING-001","stock":5,"hsnCode":"7113","costPrice":20000,"grossWeight":4.5,"returnable":true,"published":true,"plainOrStudded":"PLAIN","metalDetails":{"metalType":"GOLD","metalPurity":"22K","netWeight":4.2},"images":[]}'
    PID="$(printf '%s' "$BODY" | py 'd.get("id")')"
    [ "$CODE" = "201" ] && [ -n "$PID" ] && pass "product E2E-RING-001 created: HSN 7113, stock 5, price 25000 ($PID)" || fail "product create" "HTTP $CODE $(detail)"
fi

say "== store: customer, cart, cash-on-delivery order"
CUST_EMAIL="e2e-customer@example.invalid"; CUST_PASS="Customer12345!"
req POST "$STORE_API/auth/register" "" "{\"email\":\"$CUST_EMAIL\",\"password\":\"$CUST_PASS\",\"firstName\":\"Asha\",\"lastName\":\"Verma\",\"phone\":\"9876543210\"}"
if [ "$CODE" = "201" ]; then CTOK="$(printf '%s' "$BODY" | py 'd["token"]')"; pass "customer registered $CUST_EMAIL"
else CTOK="$(store_login "$CUST_EMAIL" "$CUST_PASS")"; [ -n "$CTOK" ] && pass "customer login $CUST_EMAIL (already registered)" || fail "customer register/login" "HTTP $CODE $(detail)"; fi

req GET "$STORE_API/cart" "$CTOK"
for item in $(printf '%s' "$BODY" | py '" ".join(i["id"] for i in d.get("items",[]))'); do req DELETE "$STORE_API/cart/items/$item" "$CTOK"; done
req POST "$STORE_API/cart/items" "$CTOK" "{\"productId\":\"$PID\",\"quantity\":1}"
sub="$(printf '%s' "$BODY" | py 'd.get("subtotal")')"; tax="$(printf '%s' "$BODY" | py 'd.get("tax")')"; tot="$(printf '%s' "$BODY" | py 'd.get("total")')"
if [ "$CODE" = "200" ] && [ "$(python -c "print(float('${sub:-0}')==25000 and float('${tax:-0}')==750)")" = "True" ]; then pass "cart: subtotal $sub, GST $tax, total $tot"; else fail "cart add" "HTTP $CODE subtotal=$sub tax=$tax $(detail)"; fi

ADDR='{"firstName":"Asha","lastName":"Verma","street":"12 MI Road","city":"Jaipur","state":"Rajasthan","zipCode":"302001","country":"India","phone":"9876543210"}'
req POST "$STORE_API/orders" "$CTOK" "{\"shippingAddress\":$ADDR,\"billingAddress\":$ADDR,\"paymentMethod\":\"COD\",\"shippingMethod\":\"STANDARD\",\"idempotencyKey\":\"e2e-$RUN_ID-1\"}"
OID="$(printf '%s' "$BODY" | py 'd.get("id")')"; ONUM="$(printf '%s' "$BODY" | py 'd.get("orderNumber")')"; OTOTAL="$(printf '%s' "$BODY" | py 'd.get("total")')"; OITEM="$(printf '%s' "$BODY" | py 'd["items"][0]["id"]')"
if [ "$CODE" = "201" ] && [ "$(printf '%s' "$BODY" | py 'd.get("status")')" = "CONFIRMED" ]; then pass "COD order $ONUM placed to Jaipur (total $OTOTAL, status CONFIRMED)"; else fail "place COD order" "HTTP $CODE $(detail)"; fi

say "== store: admin fulfils the order"
okflow=1; last=""
for st in '{"status":"PROCESSING"}' "{\"status\":\"SHIPPED\",\"trackingNumber\":\"E2E-TRACK-$RUN_ID\",\"shippingMethod\":\"STANDARD\"}" '{"status":"DELIVERED"}'; do
    req PUT "$STORE_API/orders/$OID/status" "$ATOK" "$st"; last="$CODE $(detail)"; [ "$CODE" = "200" ] || { okflow=0; break; }
done
req GET "$STORE_API/orders/$OID" "$ATOK"
INV="$(printf '%s' "$BODY" | py 'd.get("invoiceNumber")')"; ostatus="$(printf '%s' "$BODY" | py 'd.get("status")')"
if [ $okflow = 1 ] && [ "$ostatus" = "DELIVERED" ] && [[ "$INV" == WEB/* ]]; then pass "order PROCESSING -> SHIPPED (tracking) -> DELIVERED, invoice $INV"; else fail "order status flow" "status=$ostatus invoice=$INV last=$last"; fi

reqfile GET "$STORE_API/orders/$OID/invoice" "$ATOK" "$TMP/invoice.pdf"
if [ "$CODE" = "200" ] && [ "$(head -c 4 "$TMP/invoice.pdf")" = "%PDF" ] && [[ "$CDISP" == *WEB-* ]]; then pass "invoice PDF: $CTYPE, $(wc -c < "$TMP/invoice.pdf") bytes, $CDISP"; else fail "invoice PDF" "HTTP $CODE $CTYPE $(head -c 200 "$TMP/invoice.pdf")"; fi

say "== ERP sync of the sale"
req POST "$STORE_API/orders/$OID/erp-sync" "$ATOK"
es="$(printf '%s' "$BODY" | py 'd.get("erpSyncStatus")')"; eref="$(printf '%s' "$BODY" | py 'd.get("erpReference")')"; eerr="$(printf '%s' "$BODY" | py 'd.get("erpLastError")')"
dbrow="$(store_sql "select status from erp_sync_events where order_id='$OID' and event_type='SALE'")"
if [ "$CODE" = "200" ] && [ "$es" = "SENT" ] && [ "$dbrow" = "SENT" ]; then pass "erp_sync_events SALE -> SENT (ERP invoice id $eref)"; else fail "ERP sync of sale" "HTTP $CODE erpSyncStatus=$es db=$dbrow error=$eerr"; fi

req GET "$ERP_API/sales/invoices?limit=200" "$ETOK"
EINV_ID="$(printf '%s' "$BODY" | py "[i['id'] for i in d['invoices'] if i['invoice_no']=='$INV'][0]")"
req GET "$ERP_API/sales/invoices/$EINV_ID" "$ETOK"
cmp="$(printf '%s' "$BODY" | py "'grand=%s taxable=%s cgst=%s sgst=%s match=%s' % (d.get('grand_total'), d.get('taxable_material_value'), d.get('cgst_material'), d.get('sgst_material'), abs(float(d.get('grand_total') or 0)-float('${OTOTAL:-0}'))<1 and abs(float(d.get('taxable_material_value') or 0)-float('${sub:-0}'))<1 and abs(float(d.get('cgst_material') or 0)+float(d.get('sgst_material') or 0)-float('${tax:-0}'))<1)")"
if [ -n "$EINV_ID" ] && [[ "$cmp" == *"match=True" ]]; then pass "ERP holds $INV with matching totals ($cmp)"; else fail "ERP invoice $INV" "id=$EINV_ID $cmp $(detail)"; fi

say "== return with STORE_CREDIT and the ERP credit note"
req POST "$STORE_API/orders/$OID/returns" "$CTOK" "{\"lines\":[{\"orderItemId\":\"$OITEM\",\"quantity\":1}],\"reason\":\"CHANGED_MIND\",\"reasonNote\":\"e2e $RUN_ID\",\"resolution\":\"STORE_CREDIT\"}"
RID="$(printf '%s' "$BODY" | py 'd.get("id")')"; RMA="$(printf '%s' "$BODY" | py 'd.get("rmaNumber")')"; RLINE="$(printf '%s' "$BODY" | py 'd["lines"][0]["id"]')"; RAMT="$(printf '%s' "$BODY" | py 'd.get("refundAmount")')"
[ "$CODE" = "201" ] && [ -n "$RID" ] && pass "return $RMA requested by the customer (refundAmount $RAMT)" || fail "create return" "HTTP $CODE $(detail)"
req PUT "$STORE_API/admin/returns/$RID/approve" "$ATOK" '{"note":"e2e approve"}'; a="$CODE $(printf '%s' "$BODY" | py 'd.get("status")')"
req PUT "$STORE_API/admin/returns/$RID/receive" "$ATOK" "{\"lines\":[{\"lineId\":\"$RLINE\",\"received\":true,\"condition\":\"GOOD\"}],\"note\":\"e2e received\"}"; b="$CODE $(printf '%s' "$BODY" | py 'd.get("status")')"
req PUT "$STORE_API/admin/returns/$RID/resolve" "$ATOK" '{"note":"e2e resolve"}'; c="$CODE $(printf '%s' "$BODY" | py 'd.get("status")')"; gc="$(printf '%s' "$BODY" | py 'd.get("storeCreditGiftCardCode")')"
if [ "$a" = "200 APPROVED" ] && [ "$b" = "200 RECEIVED" ] && [ "$c" = "200 REFUNDED" ] && [ -n "$gc" ]; then pass "return approved -> received -> resolved as STORE_CREDIT (gift card $gc)"; else fail "return admin flow" "approve=$a receive=$b resolve=$c $(detail)"; fi
req POST "$STORE_API/orders/$OID/erp-sync" "$ATOK"
cn="$(store_sql "select status||' '||coalesce(erp_reference,'')||' '||coalesce(left(last_error,200),'') from erp_sync_events where order_id='$OID' and event_type='CREDIT_NOTE'")"
req GET "$ERP_API/accounting/journal-entries?entry_type=Credit_Note" "$ETOK"
cdn="$(printf '%s' "$BODY" | py "[(e['entry_no'],e['total_debit']) for e in d['entries'] if e.get('reference_no')=='$INV/CN/$RMA']")"
req GET "$ERP_API/vouchers?type=Credit_Note" "$ETOK"; vcount="$(printf '%s' "$BODY" | py 'len(d)')"
if [[ "$cn" == SENT* ]] && [ "$cdn" != "[]" ] && [ -n "$cdn" ]; then pass "ERP credit note for $RMA: $cdn (GET /vouchers?type=Credit_Note lists $vcount)"; else fail "ERP credit note" "sync_event=$cn journal=$cdn"; fi

say "== repair job to DELIVERED with a manual cash payment"
req POST "$STORE_API/repairs/requests" "$CTOK" '{"customerName":"Asha Verma","phone":"9876543210","email":"e2e-customer@example.invalid","itemType":"RING","serviceType":"RESIZE","itemDescription":"22K gold ring","problemDescription":"resize to 14","ringSize":"12","targetSize":"14","declaredValue":30000}'
JID="$(printf '%s' "$BODY" | py 'd.get("id")')"; JNUM="$(printf '%s' "$BODY" | py 'd.get("jobNumber")')"
[ "$CODE" = "201" ] && [ -n "$JID" ] && pass "repair request $JNUM created" || fail "repair request" "HTTP $CODE $(detail)"
rstep() { req PUT "$STORE_API/admin/repairs/$JID/status" "$ATOK" "{\"status\":\"$1\",\"note\":\"e2e $1\",\"visibleToCustomer\":true}"; [ "$CODE" = "200" ] || rfail="$rfail $1:$CODE"; }
rfail=""
rstep RECEIVED
req PUT "$STORE_API/admin/repairs/$JID/estimate" "$ATOK" '{"estimateAmount":1500,"estimateNote":"resize","promisedDate":"2026-10-03"}'; [ "$CODE" = "200" ] || rfail="$rfail estimate:$CODE"
rstep APPROVED; rstep IN_PROGRESS; rstep READY
req PUT "$STORE_API/admin/repairs/$JID/payment" "$ATOK" '{"finalAmount":1500,"paidAmount":1500,"paymentMode":"CASH","paymentReference":"e2e-cash"}'; [ "$CODE" = "200" ] || rfail="$rfail payment:$CODE"
rstep DELIVERED
req GET "$STORE_API/admin/repairs/$JID" "$ATOK"; SRV="$(printf '%s' "$BODY" | py 'd.get("invoiceNumber")')"; jst="$(printf '%s' "$BODY" | py 'd.get("status")')"
if [ -z "$rfail" ] && [ "$jst" = "DELIVERED" ] && [[ "$SRV" == SRV/* ]]; then pass "repair RECEIVED -> estimate -> APPROVED -> IN_PROGRESS -> READY -> CASH 1500 -> DELIVERED, service invoice $SRV"; else fail "repair flow" "status=$jst invoice=$SRV failures:$rfail"; fi
reqfile GET "$STORE_API/admin/repairs/$JID/job-card.pdf" "$ATOK" "$TMP/jobcard.pdf"
[ "$CODE" = "200" ] && [ "$(head -c 4 "$TMP/jobcard.pdf")" = "%PDF" ] && pass "job card PDF ($(wc -c < "$TMP/jobcard.pdf") bytes)" || fail "job card PDF" "HTTP $CODE $(head -c 200 "$TMP/jobcard.pdf")"
reqfile GET "$STORE_API/admin/repairs/$JID/invoice.pdf" "$ATOK" "$TMP/service-invoice.pdf"
[ "$CODE" = "200" ] && [ "$(head -c 4 "$TMP/service-invoice.pdf")" = "%PDF" ] && pass "service invoice PDF $SRV ($(wc -c < "$TMP/service-invoice.pdf") bytes)" || fail "service invoice PDF" "HTTP $CODE $(head -c 300 "$TMP/service-invoice.pdf")"
# The service invoice travels to the ERP as a SALE event keyed on invoice_id (no
# order). There is no admin push endpoint for it, so it is checked after the
# scheduler flush below together with the Treasure advance.
SRV_EVT="$(store_sql "select e.id from erp_sync_events e join invoices i on i.id = e.invoice_id where i.invoice_number = '$SRV' and e.event_type = 'SALE'")"
[ -n "$SRV_EVT" ] && pass "service invoice $SRV queued for the ERP (erp_sync_events $SRV_EVT)" || fail "service invoice $SRV queued for the ERP" "no erp_sync_events row with invoice_id"

say "== old-gold exchange: assay, credit, ERP purchase invoice"
req POST "$STORE_API/exchange/requests" "$CTOK" '{"metal":"GOLD","purity":"22K","weightGrams":10,"customerName":"Asha Verma","email":"e2e-customer@example.invalid","phone":"9876543210","state":"Rajasthan","itemDescription":"old 22K bangle","idProofType":"AADHAAR","idProofNumber":"XXXX-XXXX-1234"}'
XID="$(printf '%s' "$BODY" | py 'd.get("id")')"; XNUM="$(printf '%s' "$BODY" | py 'd.get("requestNumber")')"
[ "$CODE" = "201" ] && [ -n "$XID" ] && pass "exchange request $XNUM created" || fail "exchange request" "HTTP $CODE $(detail)"
req POST "$STORE_API/admin/exchange/$XID/receive" "$ATOK" '{"note":"e2e"}'; a="$CODE"
req POST "$STORE_API/admin/exchange/$XID/assay" "$ATOK" '{"assayedPurityFraction":0.916,"assayedNetWeightGrams":9.5,"assayedRatePerGram":6000,"deductionPct":2,"note":"e2e assay"}'; b="$CODE"; XVAL="$(printf '%s' "$BODY" | py 'd.get("finalValue")')"
req POST "$STORE_API/admin/exchange/$XID/credit" "$ATOK"; c="$CODE"; xgc="$(printf '%s' "$BODY" | py 'd.get("creditGiftCardCode")')"
[ "$a$b$c" = "200200200" ] && [ -n "$xgc" ] && pass "exchange received -> assayed (9.5 g @ 6000, value $XVAL) -> credited (gift card $xgc)" || fail "exchange admin flow" "receive=$a assay=$b credit=$c $(detail)"
req POST "$STORE_API/admin/exchange/$XID/erp-sync" "$ATOK"; xs="$(printf '%s' "$BODY" | py 'd.get("erpSyncStatus")')"; xref="$(printf '%s' "$BODY" | py 'd.get("erpPurchaseRef")')"; xerr="$(printf '%s' "$BODY" | py 'd.get("erpSyncError")')"
req GET "$ERP_API/purchases/invoices?limit=200" "$ETOK"
pi="$(printf '%s' "$BODY" | py "[(i['bill_no'],i['grand_total'],i['is_rcm_applicable']) for i in d if i.get('vendor_inv_no')=='$XNUM' and abs(float(i['grand_total'])-float('${XVAL:-0}'))<1]")"
if [ "$xs" = "SENT" ] && [ "$pi" != "[]" ] && [ -n "$pi" ]; then pass "ERP purchase invoice for $XNUM: $pi (ref $xref)"; else fail "ERP old-gold purchase" "erpSyncStatus=$xs ref=$xref err=$xerr erp=$pi"; fi

say "== treasure enrolment, admin cash installment, ERP advance receipt"
req GET "$STORE_API/treasure/account" "$CTOK"; TID="$(printf '%s' "$BODY" | py 'd.get("id") if isinstance(d,dict) else None')"
if [ "$CODE" = "200" ] && [ -n "$TID" ]; then pass "treasure plan reused ($TID)"; else
    req POST "$STORE_API/treasure/enroll" "$CTOK" '{"planName":"E2E Treasure Chest","installmentAmount":5000}'; TID="$(printf '%s' "$BODY" | py 'd.get("id")')"
    [ "$CODE" = "200" ] && [ -n "$TID" ] && pass "treasure enrolment 5000/month ($TID)" || fail "treasure enrolment" "HTTP $CODE $(detail)"
fi
before="$(store_sql "select count(*) from erp_sync_events where event_type='ADVANCE'")"
req POST "$STORE_API/treasure/accounts/$TID/payment" "$ATOK" '{"note":"e2e cash installment"}'
paid="$(printf '%s' "$BODY" | py 'd.get("installmentsPaid")')"
adv="$(store_sql "select id from erp_sync_events where event_type='ADVANCE' order by created_at desc limit 1")"
if [ "$CODE" = "200" ] && [ "$(store_sql "select count(*) from erp_sync_events where event_type='ADVANCE'")" -gt "${before:-0}" ]; then pass "admin cash installment recorded (installmentsPaid=$paid), ADVANCE event queued"; else fail "treasure installment" "HTTP $CODE $(detail)"; fi
if [ "$E2E_ADVANCE_WAIT_SECONDS" -gt 0 ]; then
    say "   waiting up to ${E2E_ADVANCE_WAIT_SECONDS}s for the 5-minute ERP outbox flush (no manual push exists for ADVANCE or service-invoice events)"
    w=0; st=""; sst=""
    while [ $w -lt "$E2E_ADVANCE_WAIT_SECONDS" ]; do
        st="$(store_sql "select status from erp_sync_events where id='$adv'")"
        sst="$(store_sql "select status from erp_sync_events where id='${SRV_EVT:-00000000-0000-0000-0000-000000000000}'")"
        { [ "$st" = "SENT" ] || [ "$st" = "FAILED" ]; } && { [ -z "$SRV_EVT" ] || [ "$sst" = "SENT" ] || [ "$sst" = "FAILED" ]; } && break
        sleep 10; w=$((w+10))
    done
    aref="$(store_sql "select coalesce(erp_reference,'')||' '||coalesce(left(last_error,200),'') from erp_sync_events where id='$adv'")"
    req GET "$ERP_API/accounting/journal-entries?entry_type=Receipt" "$ETOK"
    rec="$(printf '%s' "$BODY" | py "[(e['entry_no'],e['reference_no'],e['total_debit']) for e in d['entries'] if str(e.get('reference_no','')).startswith('ADV/TRS-')]")"
    if [ "$st" = "SENT" ] && [ "$rec" != "[]" ]; then pass "ERP advance receipt for the installment after ${w}s: $rec"; else fail "ERP advance receipt" "event=$st $aref after ${w}s; ERP receipts=$rec"; fi
    if [ -n "$SRV_EVT" ]; then
        sref="$(store_sql "select coalesce(erp_reference,'')||' '||coalesce(left(last_error,200),'') from erp_sync_events where id='$SRV_EVT'")"
        req GET "$ERP_API/sales/invoices?limit=200" "$ETOK"
        srv_erp="$(printf '%s' "$BODY" | py "[(i['invoice_no'],i['grand_total'],i['payment_status']) for i in d['invoices'] if i['invoice_no']=='$SRV']")"
        if [ "$sst" = "SENT" ] && [ "$srv_erp" != "[]" ] && [ -n "$srv_erp" ]; then pass "ERP holds service invoice $SRV: $srv_erp"; else fail "ERP service invoice $SRV" "event=$sst $sref; ERP=$srv_erp"; fi
    fi
else
    skip "ERP advance receipt / service invoice wait (E2E_ADVANCE_WAIT_SECONDS=0)"
fi

if [ "$E2E_INCLUDE_KNOWN_BUGS" = "1" ]; then
    say "== product with an ERP material code (bridge sends material_code as a string)"
    req GET "$STORE_API/products/sku/E2E-PEND-002" ""; P2="$(printf '%s' "$BODY" | py 'd.get("id")')"
    if [ -z "$P2" ]; then req POST "$STORE_API/products" "$ATOK" '{"name":"E2E Gold Pendant","description":"E2E pendant with ERP material code","price":12000,"category":"Jewelry","sku":"E2E-PEND-002","stock":50,"hsnCode":"7113","erpMaterialCode":"E2E-PEND","grossWeight":2.5,"returnable":true,"published":true,"plainOrStudded":"PLAIN","metalDetails":{"metalType":"GOLD","metalPurity":"22K","netWeight":2.4},"images":[]}'; P2="$(printf '%s' "$BODY" | py 'd.get("id")')"; fi
    req GET "$STORE_API/cart" "$CTOK"; for item in $(printf '%s' "$BODY" | py '" ".join(i["id"] for i in d.get("items",[]))'); do req DELETE "$STORE_API/cart/items/$item" "$CTOK"; done
    req POST "$STORE_API/cart/items" "$CTOK" "{\"productId\":\"$P2\",\"quantity\":1}"
    req POST "$STORE_API/orders" "$CTOK" "{\"shippingAddress\":$ADDR,\"paymentMethod\":\"COD\",\"shippingMethod\":\"STANDARD\",\"idempotencyKey\":\"e2e-$RUN_ID-2\"}"; O2="$(printf '%s' "$BODY" | py 'd.get("id")')"
    for st in '{"status":"PROCESSING"}' "{\"status\":\"SHIPPED\",\"trackingNumber\":\"E2E-TRACK-$RUN_ID-2\"}" '{"status":"DELIVERED"}'; do req PUT "$STORE_API/orders/$O2/status" "$ATOK" "$st"; done
    req POST "$STORE_API/orders/$O2/erp-sync" "$ATOK"; es="$(printf '%s' "$BODY" | py 'd.get("erpSyncStatus")')"; eerr="$(printf '%s' "$BODY" | py 'd.get("erpLastError")')"
    [ "$es" = "SENT" ] && pass "sale of a product with erpMaterialCode synced to the ERP" || fail "sale of a product with erpMaterialCode (order $(printf '%s' "$BODY" | py 'd.get("invoiceNumber")'))" "erpSyncStatus=$es $eerr"
fi

# ---------------------------------------------------------------------------
# 4. container logs
# ---------------------------------------------------------------------------
say "== scanning container logs for ERROR / SEVERE / stack traces since the run started"
BENIGN='Razorpay is not configured|MailSendException|MailConnectException|UnknownHostException: smtp|Failed to send email|Could not connect to SMTP|GET /health'
logsum=""; bad=0
for cname in jewelry-backend-local jewelry-frontend-local jewelry-admin-local caratloop_erp_backend caratloop_erp_frontend caratloop_erp_nginx caratloop_erp_migrate; do
    n="$(docker logs "$cname" 2>&1 | grep -E 'ERROR|SEVERE|Traceback|Exception:' | grep -vE "$BENIGN" | grep -cE 'ERROR|SEVERE|Traceback|Exception:')"
    logsum="$logsum $cname=$n"; [ "${n:-0}" -gt 0 ] && bad=$((bad+n))
done
docker logs jewelry-backend-local 2>&1 | grep -E 'ERROR|SEVERE|Traceback|Exception:' | grep -vE "$BENIGN" | sort | uniq -c | sort -rn | head -20 >> "$E2E_LOG"
docker logs caratloop_erp_backend 2>&1 | grep -E 'ERROR|Traceback|Error' | grep -vE "$BENIGN" | sort | uniq -c | sort -rn | head -20 >> "$E2E_LOG"
# docker logs keeps the whole history of a container (across restarts), so the
# count covers every run since the container was last recreated.
[ $bad = 0 ] && pass "container logs: no unexpected ERROR/SEVERE/traceback lines ($logsum)" || fail "container logs: $bad unexpected error lines since the containers were created ($logsum)" "grouped in $E2E_LOG"

# ---------------------------------------------------------------------------
# summary
# ---------------------------------------------------------------------------
printf '\n%-5s %-4s %s\n' RESULT '#' STEP
for r in "${RESULTS[@]}"; do IFS='|' read -r s n name det <<<"$r"; printf '%-5s %-4s %s%s\n' "$s" "$n" "$name" "${det:+  -- $det}"; done
printf '\n%d step(s) failed. Stacks left running: store API :%s, storefront :%s, admin :%s, Postgres 127.0.0.1:5432; ERP API 127.0.0.1:8010, ERP UI 127.0.0.1:3001, ERP nginx :80/:443, ERP Postgres 127.0.0.1:5433\n' "$FAILS" "$API_PORT" "$STOREFRONT_PORT" "$ADMIN_PORT"
rm -rf "$TMP"
exit $(( FAILS > 99 ? 99 : FAILS ))
