#!/usr/bin/env bash
#
# Copy the Netlify/Neon database onto this box, once.
#
# Run as:  NEON_URL='postgresql://...' deploy/migrate-db.sh
# Take NEON_URL from the Netlify UI. It is a credential: pass it on the command
# line as above so it is never written into a file in the repo.
#
# WARNING -- ENCRYPTION_KEY. Connected social accounts are stored as AES-256-GCM
# ciphertext. The data copied here is useless to the new deployment unless
# ENCRYPTION_KEY in /opt/marketpilot/.env is byte-for-byte the value Netlify
# used. A different key does not error; it silently fails to decrypt, and every
# LinkedIn connection has to be redone.
set -euo pipefail

: "${NEON_URL:?set NEON_URL to the Netlify database connection string}"
APP_DIR=/opt/marketpilot
LOCAL_URL=$(cat "$APP_DIR/.db-url")
DUMP=/root/neon-$(date +%Y%m%d-%H%M%S).dump

echo "==> Dumping Neon"
pg_dump --no-owner --no-privileges --format=custom --file="$DUMP" "$NEON_URL"
echo "    $(du -h "$DUMP" | cut -f1) written to $DUMP"

echo "==> Restoring into local postgres"
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname="$LOCAL_URL" "$DUMP"

echo "==> Verifying"
psql "$LOCAL_URL" -c "\dt" | tail -n +1
for t in users organizations social_accounts scheduled_posts jobs; do
  n=$(psql "$LOCAL_URL" -tAc "select count(*) from $t" 2>/dev/null || echo "n/a")
  printf '    %-18s %s\n' "$t" "$n"
done

echo
echo "Keep $DUMP until the new deployment is proven, then delete it:"
echo "  shred -u $DUMP"
