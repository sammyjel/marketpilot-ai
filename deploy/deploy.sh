#!/usr/bin/env bash
#
# Build and release MarketPilot on the radio box. Re-run for every deploy.
#
# The build is the only memory-hungry step and it runs inside a transient
# systemd scope with a hard cap, so if Next needs more than it is allowed the
# build fails -- loudly, and on its own -- rather than the kernel killing an
# ffmpeg process to satisfy it. If this step ever does get killed, build in CI
# instead and ship the tarball; see RUNBOOK.md.
set -euo pipefail

APP_DIR=/opt/marketpilot
REPO=$APP_DIR/repo
RELEASES=$APP_DIR/releases
STAMP=$(date +%Y%m%d-%H%M%S)
TARGET=$RELEASES/$STAMP

cd "$REPO"

echo "==> Fetching"
git fetch --depth 50 origin main
git reset --hard origin/main
echo "    at $(git rev-parse --short HEAD) - $(git log -1 --pretty=%s)"

echo "==> Installing dependencies"
systemd-run --scope --quiet -p MemoryMax=900M -p MemorySwapMax=1G \
  npm ci --no-audit --no-fund

echo "==> Applying migrations"
set -a; . "$APP_DIR/.env"; set +a
npm run db:migrate

echo "==> Building"
systemd-run --scope --quiet -p MemoryMax=1200M -p MemorySwapMax=2G \
  env BUILD_STANDALONE=1 NODE_OPTIONS=--max-old-space-size=1024 npm run build

echo "==> Assembling release $STAMP"
# `output: standalone` emits a self-contained server with only the modules it
# actually imports -- a few hundred MB smaller than node_modules, which is what
# makes this viable next to three encoders. Next does not copy these two trees
# itself; that is documented behaviour, not an oversight.
mkdir -p "$TARGET"
cp -r .next/standalone/. "$TARGET/"
mkdir -p "$TARGET/.next"
cp -r .next/static "$TARGET/.next/static"
[ -d public ] && cp -r public "$TARGET/public"
# Migrations are read from disk at runtime by the drizzle migrator.
[ -d drizzle ] && cp -r drizzle "$TARGET/drizzle"

ln -sfn "$TARGET" "$APP_DIR/current"

echo "==> Restarting"
systemctl restart marketpilot-web marketpilot-worker
sleep 4
systemctl is-active marketpilot-web marketpilot-worker

echo "==> Health"
curl -fsS -o /dev/null -w "    local app responded %{http_code} in %{time_total}s\n" http://127.0.0.1:3000/ || {
  echo "    FAILED - journalctl -u marketpilot-web -n 50"; exit 1; }

# Keep the last three releases so a rollback is a symlink swap.
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +4 | xargs -r rm -rf
echo "Released $STAMP"
