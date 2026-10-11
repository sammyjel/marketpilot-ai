#!/usr/bin/env bash
#
# One-time preparation of the Hetzner box that already runs Hymal Jazz Radio.
#
# The radio is the priority on this machine: three ffmpeg feeds that must not
# be interrupted. Everything here is additive and memory-bounded so that if
# MarketPilot ever misbehaves it is killed before the streams are. Safe to
# re-run; every step checks before acting.
set -euo pipefail

APP_DIR=/opt/marketpilot
DB_NAME=marketpilot
DB_USER=marketpilot

echo "==> 1/5  Swap"
# The box has 2 GB and no swap. A build or a runaway worker would otherwise put
# the kernel in a position where ffmpeg is a plausible OOM victim. Swap plus a
# low swappiness means memory pressure costs disk I/O instead of a dead stream.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    created 2G swapfile"
else
  echo "    already present"
fi
sysctl -w vm.swappiness=10 >/dev/null
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

echo "==> 2/5  Node 22"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
else
  echo "    already present: $(node -v)"
fi

echo "==> 3/5  PostgreSQL"
if ! command -v psql >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib
else
  echo "    already present: $(psql --version)"
fi

# Tuned for a 2 GB box shared with three video encoders, not for a database
# server. These are deliberately small: the workload is a handful of
# connections, and giving the page cache room matters more than shared_buffers.
PGCONF=$(ls -d /etc/postgresql/*/main 2>/dev/null | head -1)
if [ -n "$PGCONF" ]; then
  mkdir -p "$PGCONF/conf.d"
  cat > "$PGCONF/conf.d/marketpilot.conf" <<'PGTUNE'
listen_addresses = 'localhost'
max_connections = 40
shared_buffers = 128MB
effective_cache_size = 512MB
work_mem = 4MB
maintenance_work_mem = 64MB
PGTUNE
  grep -q "conf.d" "$PGCONF/postgresql.conf" || echo "include_dir = 'conf.d'" >> "$PGCONF/postgresql.conf"
  systemctl restart postgresql
fi

echo "==> 4/5  Database and role"
# The password is generated on the box and never leaves it. Postgres listens on
# localhost only, so this credential is not reachable from the internet.
if ! sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='$DB_USER'" | grep -q 1; then
  DB_PASS=$(openssl rand -hex 24)
  sudo -u postgres psql -c "create role $DB_USER login password '$DB_PASS'" >/dev/null
  sudo -u postgres psql -c "create database $DB_NAME owner $DB_USER" >/dev/null
  mkdir -p "$APP_DIR"
  echo "postgresql://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME" > "$APP_DIR/.db-url"
  chmod 600 "$APP_DIR/.db-url"
  echo "    created; connection string in $APP_DIR/.db-url (chmod 600)"
else
  echo "    role '$DB_USER' already exists - left alone"
fi

echo "==> 5/5  Application directory"
mkdir -p "$APP_DIR"
if [ ! -d "$APP_DIR/repo/.git" ]; then
  git clone --depth 50 https://github.com/sammyjel/marketpilot-ai.git "$APP_DIR/repo"
else
  echo "    repo already cloned"
fi
mkdir -p "$APP_DIR/storage"

echo
echo "Done. Next:"
echo "  1. Create $APP_DIR/.env  (see deploy/RUNBOOK.md - ENCRYPTION_KEY must be copied EXACTLY)"
echo "  2. Import the Neon data:  deploy/migrate-db.sh"
echo "  3. Deploy:                deploy/deploy.sh"
