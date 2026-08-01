#!/bin/bash
# Provisions everything `npm run test` needs.
#
# The repo's normal path is `docker compose -f infra/compose.yaml up -d`
# (Postgres, MailCatcher, MinIO). In Claude Code on the web the Docker daemon
# runs but image pulls are blocked by the egress policy, so compose fails and
# the whole suite looks unrunnable. This falls back to native equivalents that
# speak the same protocols on the same ports, so no application code or test
# has to know the difference.
#
# Idempotent: every step is skipped when it is already satisfied.
set -euo pipefail

# Local machines have working Docker; leave them on the normal path.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

log() { echo "[session-start] $*"; }

# Ports and credentials come from .env.development, which is committed.
PGPORT=6432
PGUSER_APP=local_user
PGPASS_APP=local_password
PGDB_APP=local_db
PGDATA=/var/lib/postgresql/manifold
PG_BIN=/usr/lib/postgresql/16/bin

log "installing npm dependencies"
npm install --no-audit --no-fund >/dev/null

# --- Postgres ---------------------------------------------------------------
if pg_isready -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1; then
  log "postgres already accepting connections on $PGPORT"
elif docker compose -f infra/compose.yaml up -d >/dev/null 2>&1 &&
     node infra/scripts/wait-for-postgres.js >/dev/null 2>&1; then
  log "postgres started via docker compose"
else
  log "docker unavailable (image pulls are blocked here) — using native postgres"

  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    mkdir -p "$PGDATA"
    chown postgres:postgres "$PGDATA"
    chmod 700 "$PGDATA"
    su postgres -c "$PG_BIN/initdb -D $PGDATA -A trust -U postgres" >/dev/null
  fi

  su postgres -c \
    "$PG_BIN/pg_ctl -D $PGDATA -l /tmp/postgres-manifold.log \
     -o '-p $PGPORT -c listen_addresses=127.0.0.1' start" >/dev/null 2>&1 || true

  for _ in $(seq 1 30); do
    pg_isready -h 127.0.0.1 -p "$PGPORT" >/dev/null 2>&1 && break
    sleep 1
  done

  psql -h 127.0.0.1 -p "$PGPORT" -U postgres -tc \
    "SELECT 1 FROM pg_roles WHERE rolname='$PGUSER_APP'" | grep -q 1 ||
    psql -h 127.0.0.1 -p "$PGPORT" -U postgres -c \
      "CREATE USER $PGUSER_APP WITH PASSWORD '$PGPASS_APP' SUPERUSER CREATEDB" >/dev/null

  psql -h 127.0.0.1 -p "$PGPORT" -U postgres -tc \
    "SELECT 1 FROM pg_database WHERE datname='$PGDB_APP'" | grep -q 1 ||
    psql -h 127.0.0.1 -p "$PGPORT" -U postgres -c \
      "CREATE DATABASE $PGDB_APP OWNER $PGUSER_APP" >/dev/null
fi

# --- MailCatcher (SMTP 1025 / HTTP 1080) ------------------------------------
# tests/orchestrator.js waitForAllServices() blocks on the HTTP API, so every
# suite hangs without it. The orchestrator speaks MailCatcher's API, not
# MailHog's, so the gem is the right substitute for the container.
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:1080/messages; then
  log "mailcatcher already listening"
else
  # The gem's binary is not necessarily on PATH — under rbenv it lands in
  # Gem.bindir, which is the only reliable way to find it.
  resolve_mailcatcher() {
    command -v mailcatcher 2>/dev/null && return 0
    local bindir
    bindir=$(ruby -e 'print Gem.bindir' 2>/dev/null || echo "")
    if [ -n "$bindir" ] && [ -x "$bindir/mailcatcher" ]; then
      echo "$bindir/mailcatcher"
      return 0
    fi
    return 1
  }

  MAILCATCHER=$(resolve_mailcatcher || echo "")
  if [ -z "$MAILCATCHER" ] && command -v gem >/dev/null 2>&1; then
    log "installing mailcatcher"
    gem install mailcatcher --no-document >/dev/null 2>&1 || true
    MAILCATCHER=$(resolve_mailcatcher || echo "")
  fi

  if [ -n "$MAILCATCHER" ]; then
    nohup "$MAILCATCHER" --foreground --smtp-port 1025 --http-port 1080 \
      --http-ip 127.0.0.1 >/tmp/mailcatcher.log 2>&1 &
    log "mailcatcher started"
  else
    log "WARNING: mailcatcher unavailable — suites will hang in waitForAllServices"
  fi
fi

# --- S3 on :9000 ------------------------------------------------------------
# moto is S3-compatible and covers what infra/storage.ts uses, including
# presigned upload and download URLs. Without it the game-file suites fail in
# beforeAll on clearStorage().
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:9000/; then
  log "s3 endpoint already listening on 9000"
else
  python3 -c "import moto" >/dev/null 2>&1 ||
    pip3 install --quiet --ignore-installed PyYAML "moto[server]" >/dev/null 2>&1 || true

  if python3 -c "import moto" >/dev/null 2>&1; then
    nohup python3 -m moto.server -p 9000 -H 127.0.0.1 >/tmp/moto.log 2>&1 &
    log "s3 (moto) started"
  else
    log "WARNING: no S3 endpoint — game-file suites will fail on clearStorage()"
  fi
fi

# --- Prisma -----------------------------------------------------------------
log "generating prisma client and applying migrations"
npx prisma generate >/dev/null
npx prisma migrate deploy >/dev/null

log "ready — run 'npm run test:no-docker' (npm run test would try docker compose)"
