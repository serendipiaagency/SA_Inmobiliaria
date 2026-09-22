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

# Estado local limpio por defecto. Sin esto, la D1 de `wrangler dev --local`
# sobrevive entre ejecuciones y va acumulando todo lo que la suite crea:
# medido antes de este cambio, 25 usuarios, 49 proyectos y 62 visitas donde
# una base recién migrada tiene un puñado. Eso costaba de tres formas:
#
#   1. Colisiones de filas únicas, que los specs esquivan con sufijos
#      `Date.now()` — un remiendo que sólo hace falta por esto.
#   2. El contador de `rate_limits` también persistía, así que dos
#      ejecuciones seguidas (o una tanda de pruebas a mano) agotaban los 10
#      intentos de login por IP y la suite entera moría en el global-setup
#      con un 429, por higiene del arnés y no por el código. Pasó dos veces
#      el mismo día.
#   3. Una suite que depende de restos de ejecuciones anteriores no prueba
#      lo que dice probar.
#
# Esto NO toca ningún control: el limitador sigue intacto y sigue aplicando
# dentro de cada ejecución. Lo que se descarta es una base de datos
# desechable que debería haber nacido vacía.
if [ "${E2E_KEEP_STATE:-}" = "1" ]; then
  echo "==> Conservando el estado local (E2E_KEEP_STATE=1)"
else
  echo "==> Partiendo de una D1 y un R2 locales limpios"
  rm -rf .wrangler/state/v3/d1 .wrangler/state/v3/r2
fi

echo "==> Applying D1 migrations (local)"
npx wrangler d1 migrations apply sa_inmobiliaria --local

echo "==> Starting wrangler dev on port ${PORT}"
# STRIPE_WEBHOOK_SECRET / RESEND_WEBHOOK_SECRET here are fixed, non-secret
# placeholders for tests/e2e/stripe-webhook.spec.ts and
# tests/e2e/resend-webhook.spec.ts to sign their own synthetic events
# against — never real values, never used for a real webhook endpoint.
npx wrangler dev --local --port "${PORT}" \
  --var STRIPE_WEBHOOK_SECRET:whsec_e2e_test_placeholder \
  --var RESEND_WEBHOOK_SECRET:whsec_ZTJlX3Rlc3RfcGxhY2Vob2xkZXJfMzJieXRlcw== \
  --var TOTP_ENCRYPTION_KEY:e2e_totp_key_placeholder \
  --var COMMS_CREDENTIALS_ENCRYPTION_KEY:e2e_comms_key_placeholder \
  >"${LOG_FILE}" 2>&1 &
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
