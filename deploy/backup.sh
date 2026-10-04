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

log "done; $(du -sh "$DEST" | cut -f1) in $DEST"
