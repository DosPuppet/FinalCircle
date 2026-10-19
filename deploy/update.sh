#!/usr/bin/env bash
# Update of FinalCircle on the server (from Planecircle): backup of the games in progress, code, dependencies, builds,
# the images the CDN lacks, check of the saved games with the new engine, restart. Rollback: docs/deployment.md.
set -euo pipefail
cd "$(dirname "$0")/.."
DATA="${FC_DATA_DIR:-data/rooms}"
PORT="${PORT:-8788}"

# 1. Backup of the games in progress (the last 10 kept in data/backups).
if [ -d "$DATA" ]; then
  mkdir -p data/backups
  backup="data/backups/rooms-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD).tgz"
  tar -czf "$backup" -C "$(dirname "$DATA")" "$(basename "$DATA")"
  chmod 600 "$backup"
  ls -1t data/backups/rooms-*.tgz | tail -n +11 | xargs -r rm -f
  echo "Games backed up: $backup"
fi

# 2. Code, dependencies, interface and compiled server.
git pull --ff-only
npm ci
npm run build
npm run build:server

# 3. Images the official CDN lacks (new cards of the supplement): fetched once, the others kept.
npx tsx tools/missing-images.ts || echo "Warning: some missing images could not be fetched (the cards show their text)."

# 4. Games in progress replayed with the new engine (on a copy): how many will be interrupted.
npx tsx tools/rooms-check.ts "$DATA" || echo "Warning: some games in progress will be interrupted (see above)."

# 5. Restart, then wait for the server to answer (loading the cards, resuming the rooms).
if pm2 describe finalcircle >/dev/null 2>&1; then
  pm2 restart finalcircle --update-env
else
  pm2 start deploy/ecosystem.config.cjs
fi
pm2 save
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
    echo "FinalCircle updated:"
    curl -fsS "http://127.0.0.1:${PORT}/healthz"
    exit 0
  fi
  sleep 1
done
echo "FinalCircle does not answer after 30 s: see pm2 logs finalcircle" >&2
exit 1
