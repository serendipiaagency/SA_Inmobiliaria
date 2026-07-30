#!/usr/bin/env bash
# Builds the Worker, applies D1 migrations to a local/ephemeral sqlite DB,
# boots `wrangler dev --local`, runs the Playwright suite against it, and
# always tears the dev server down (even on test failure).
set -euo pipefail

PORT="${E2E_PORT:-8788}"
BASE_URL="http://localhost:${PORT}"
LOG_FILE="$(mktemp)"
PID=""

cleanup() {
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "==> Building app"
npm run build

echo "==> Applying D1 migrations (local)"
npx wrangler d1 migrations apply sa_inmobiliaria --local

echo "==> Starting wrangler dev on port ${PORT}"
npx wrangler dev --local --port "${PORT}" >"${LOG_FILE}" 2>&1 &
PID=$!

echo "==> Waiting for ${BASE_URL} to respond"
for _ in $(seq 1 60); do
  if curl -sf "${BASE_URL}/" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -sf "${BASE_URL}/" >/dev/null 2>&1; then
  echo "wrangler dev never became ready. Log:"
  cat "${LOG_FILE}"
  exit 1
fi

echo "==> Running Playwright"
E2E_BASE_URL="${BASE_URL}" npx playwright test
