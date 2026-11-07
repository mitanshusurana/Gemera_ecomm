#!/usr/bin/env bash
# Nightly backup for one VM of the Oracle deployment. Installed by bootstrap.sh
# as a cron job (02:30 IST); safe to run by hand:  bash ~/caratloop/deploy/backup.sh
#
# For every PostgreSQL container on this host it writes a compressed pg_dump
# into ~/caratloop/backups/<db>/<db>-YYYYmmdd-HHMM.sql.gz, copies the stack's
# env files next to them (they are the only place the secrets live), deletes
# anything older than KEEP_DAYS, and, when BACKUP_PEER is set, mirrors the
# directory to the other VM over ssh so one lost machine does not lose the books.
#
#   KEEP_DAYS=14                 retention (default 14)
#   BACKUP_PEER=opc@68.233.96.36 mirror target; needs ~/.ssh/backup_peer (see bootstrap.sh)
#   BACKUP_PASSPHRASE=...        when set (with SMTP_* and ALERT_TO from alerts.env), the night's
#                                dumps are AES-256 encrypted and e-mailed: an off-site copy that
#                                survives losing both VMs. Decrypt with
#                                openssl enc -d -aes-256-cbc -pbkdf2 -in <file>.enc -out <file>
#
# Restore (example, store DB):
#   gunzip -c ~/caratloop/backups/jewelry-postgres/jewelry-postgres-20261004-0230.sql.gz \
#     | sudo docker exec -i jewelry-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
set -euo pipefail

KEEP_DAYS="${KEEP_DAYS:-14}"
BACKUP_PEER="${BACKUP_PEER:-}"
ROOT="$HOME/caratloop"
DEST="$ROOT/backups"
STAMP="$(date +%Y%m%d-%H%M)"
LOG="$ROOT/backup.log"

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" | tee -a "$LOG"; }

mkdir -p "$DEST"
chmod 700 "$DEST"

# ── databases ──────────────────────────────────────────────────────────────────
# Every running container whose image is postgres:*; user and database are read
# from the container's own environment, so no password is needed here.
containers="$(sudo docker ps --format '{{.Names}} {{.Image}}' | awk '$2 ~ /^postgres:/ {print $1}')"
[[ -n "$containers" ]] || { log "no postgres container running"; exit 1; }

for c in $containers; do
    user="$(sudo docker exec "$c" sh -c 'printf %s "${POSTGRES_USER:-postgres}"')"
    db="$(sudo docker exec "$c" sh -c 'printf %s "${POSTGRES_DB:-$POSTGRES_USER}"')"
    mkdir -p "$DEST/$c"
    out="$DEST/$c/$c-$STAMP.sql.gz"
    tmp="$out.part"
    if sudo docker exec "$c" pg_dump -U "$user" -d "$db" --no-owner --no-privileges | gzip -6 > "$tmp"; then
        mv "$tmp" "$out"
        chmod 600 "$out"
        log "dumped $c ($db) -> $(basename "$out") $(du -h "$out" | cut -f1)"
    else
        rm -f "$tmp"
        log "FAILED pg_dump for $c"
        exit 1
    fi
done

# ── env files ──────────────────────────────────────────────────────────────────
# Without these a restored database is unusable (JWT secret, bridge key, DB
# password). They change rarely, so one dated tarball per run is cheap.
if compgen -G "$ROOT/deploy/*/.env*" > /dev/null; then
    tar -czf "$DEST/env-$STAMP.tgz" -C "$ROOT/deploy" $(cd "$ROOT/deploy" && ls -d */.env* 2>/dev/null)
    chmod 600 "$DEST/env-$STAMP.tgz"
    log "saved env files -> env-$STAMP.tgz"
fi

# ── rotation ───────────────────────────────────────────────────────────────────
find "$DEST" -type f \( -name '*.sql.gz' -o -name 'env-*.tgz' \) -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/pruned /' | tee -a "$LOG" || true

# ── mirror to the other VM ─────────────────────────────────────────────────────
if [[ -n "$BACKUP_PEER" ]]; then
    if [[ -f "$HOME/.ssh/backup_peer" ]]; then
        host_tag="$(hostname)"
        if rsync -az --delete -e "ssh -i $HOME/.ssh/backup_peer -o BatchMode=yes -o StrictHostKeyChecking=accept-new" \
                "$DEST/" "$BACKUP_PEER:caratloop/backups-from-$host_tag/"; then
            log "mirrored to $BACKUP_PEER:caratloop/backups-from-$host_tag/"
        else
            log "WARNING mirror to $BACKUP_PEER failed"
        fi
    else
        log "WARNING BACKUP_PEER set but ~/.ssh/backup_peer key missing; skipped mirror"
    fi
fi

# ── off-site copy: encrypted dumps by e-mail ──────────────────────────────────
if [[ -n "${BACKUP_PASSPHRASE:-}" && -n "${SMTP_HOST:-}" && -n "${ALERT_TO:-}" ]]; then
    enc_dir="$(mktemp -d)"
    for f in "$DEST"/*/*-"$STAMP".sql.gz "$DEST"/env-"$STAMP".tgz; do
        [[ -f "$f" ]] || continue
        openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -in "$f" -out "$enc_dir/$(basename "$f").enc"
    done
    total_kb=$(du -sk "$enc_dir" | cut -f1)
    if (( total_kb > 20000 )); then
        log "off-site copy skipped: ${total_kb} KB exceeds the 20 MB mail limit; set up object storage"
    else
        python3 - "$enc_dir" "$(hostname)" "$STAMP" <<'PY'
import os, smtplib, ssl, sys
from email.message import EmailMessage
enc_dir, host, stamp = sys.argv[1:]
msg = EmailMessage()
msg["Subject"] = f"[Caratloop] backup {host} {stamp}"
msg["From"] = os.environ.get("SMTP_FROM") or os.environ["SMTP_USER"]
msg["To"] = os.environ["ALERT_TO"]
msg.set_content("Encrypted nightly backup. Decrypt each file with:\n"
                "  openssl enc -d -aes-256-cbc -pbkdf2 -in <file>.enc -out <file>\n"
                "using the BACKUP_PASSPHRASE from ~/caratloop/alerts.env on the VM.")
for name in sorted(os.listdir(enc_dir)):
    with open(os.path.join(enc_dir, name), "rb") as fh:
        msg.add_attachment(fh.read(), maintype="application", subtype="octet-stream", filename=name)
port = int(os.environ.get("SMTP_PORT") or 587)
with smtplib.SMTP(os.environ["SMTP_HOST"], port, timeout=60) as s:
    s.ehlo()
    if port != 465:
        s.starttls(context=ssl.create_default_context())
    s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASS"])
    s.send_message(msg)
print("sent")
PY
        rc=$?
        if [[ $rc -eq 0 ]]; then log "off-site copy e-mailed to $ALERT_TO (${total_kb} KB, encrypted)"; else log "WARNING off-site e-mail failed (rc=$rc)"; fi
    fi
    rm -rf "$enc_dir"
else
    log "off-site copy skipped: set BACKUP_PASSPHRASE (and SMTP_*/ALERT_TO) in alerts.env to enable it"
fi

log "done; $(du -sh "$DEST" | cut -f1) in $DEST"
