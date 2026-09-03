#!/usr/bin/env bash
#
# Deploy-time database step, for Railway's pre-deploy command.
#
# Fixes three things that were wrong with running `prisma db push` there raw:
#
#   1. It raced the database. A deploy that started while Postgres was still
#      booting died on "FATAL: the database system is starting up" and took the
#      whole container with it. This waits instead.
#   2. It dropped the HNSW indexes on every single deploy and never put them
#      back, quietly turning every semantic search into a sequential scan.
#      This re-applies them (see scripts/sql/hnsw-indexes.sql).
#   3. Nothing verified the result. This checks the indexes are actually there
#      and fails the deploy if they aren't.
#
# Deliberately NOT `--accept-data-loss`: a deploy must never silently drop a
# column. If the schema needs a destructive change, this fails and a human
# decides — run it by hand, as documented in CLAUDE.md.
#
# Uses `prisma db execute` rather than psql because the runtime image has no
# psql, but always has Prisma.

set -euo pipefail

SCHEMA="prisma/schema.prisma"
ATTEMPTS="${DB_WAIT_ATTEMPTS:-30}"
DELAY="${DB_WAIT_SECONDS:-2}"

log() { echo "[deploy-db] $*"; }

# ── 1. Wait for Postgres ────────────────────────────────────────────────────
log "waiting for the database (up to $((ATTEMPTS * DELAY))s)…"
ready=0
for attempt in $(seq 1 "$ATTEMPTS"); do
  if echo "SELECT 1;" | npx prisma db execute --stdin --schema "$SCHEMA" >/dev/null 2>&1; then
    log "database reachable after ${attempt} attempt(s)"
    ready=1
    break
  fi
  sleep "$DELAY"
done

if [ "$ready" -ne 1 ]; then
  log "ERROR: database never became reachable — refusing to deploy against it."
  exit 1
fi

# ── 2. Reconcile the schema ─────────────────────────────────────────────────
log "pushing schema…"
npx prisma db push --skip-generate

# ── 3. Put the HNSW indexes back ────────────────────────────────────────────
log "restoring HNSW indexes (db push drops them every time)…"
npx prisma db execute --file scripts/sql/hnsw-indexes.sql --schema "$SCHEMA"

# ── 4. Prove it ─────────────────────────────────────────────────────────────
# A silent failure here is the exact bug this script exists to prevent, so the
# count is checked rather than assumed.
log "verifying…"
cat > /tmp/hnsw-check.sql <<'CHECK'
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_indexes WHERE indexdef ILIKE '%hnsw%';
  IF n < 4 THEN
    RAISE EXCEPTION 'expected 4 HNSW indexes, found %', n;
  END IF;
  RAISE NOTICE 'HNSW indexes present: %', n;
END $$;
CHECK
npx prisma db execute --file /tmp/hnsw-check.sql --schema "$SCHEMA"

log "done."
