#!/usr/bin/env bash
# Builds the Worker, applies D1 migrations to a local/ephemeral sqlite DB,
# boots `wrangler dev --local`, runs the Playwright suite against it, and
# always tears the dev server down (even on test failure).
set -euo pipefail

PORT="${E2E_PORT:-8788}"
BASE_URL="http://localhost:${PORT}"
LOG_FILE="$(mktemp)"
PID=""
MOCK_PORT="${E2E_PROVIDER_MOCK_PORT:-8799}"
MOCK_URL="http://127.0.0.1:${MOCK_PORT}"
MOCK_LOG="$(mktemp)"
MOCK_PID=""

# `npx wrangler dev` deja por debajo un `node …/wrangler-dist/cli.js` (y
# éste su `workerd`): matar sólo el PID de `npx` dejaba ese hijo huérfano y
# escuchando en el puerto. La siguiente ejecución ya no podía usar el puerto,
# su comprobación de arranque respondía el servidor VIEJO y la suite entera
# corría contra un build y una D1 anteriores sin que nada lo dijera. Se mata
# el árbol completo, hijos primero.
kill_tree() {
  local parent="$1" child
  for child in $(pgrep -P "$parent" 2>/dev/null); do
    kill_tree "$child"
  done
  kill "$parent" 2>/dev/null || true
}

cleanup() {
  for p in "$PID" "$MOCK_PID"; do
    if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then
      kill_tree "$p"
      wait "$p" 2>/dev/null || true
    fi
  done
}

# Si algo ya responde en los puertos de la suite, la ejecución probaría contra
# ese proceso y no contra el build recién hecho: se para aquí, con el motivo.
port_busy() {
  curl -s -o /dev/null --max-time 2 "$1" 2>/dev/null
}
trap cleanup EXIT

for url in "${BASE_URL}/" "${MOCK_URL}/__health"; do
  if port_busy "$url"; then
    echo "Ya hay un proceso respondiendo en ${url} — probablemente un wrangler dev"
    echo "o un simulador de una ejecución anterior. Detenlo antes de lanzar la suite:"
    echo "la suite correría contra él y no contra este build."
    exit 1
  fi
done

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

# Simulador local de la Graph API de WhatsApp (scripts/e2e-provider-mock.mjs):
# el Worker lo usa sólo porque WHATSAPP_GRAPH_BASE_URL apunta a loopback
# (graphBase() ignora cualquier otro host). Permite probar un envío saliente
# real de punta a punta sin tocar Meta. El mismo simulador hace de Messages
# API guionizada para INMO (AI_BASE_URL, también sólo loopback): ninguna
# llamada de IA sale de la máquina durante el e2e.
echo "==> Arrancando el simulador del proveedor en ${MOCK_URL}"
E2E_PROVIDER_MOCK_PORT="${MOCK_PORT}" node scripts/e2e-provider-mock.mjs >"${MOCK_LOG}" 2>&1 &
MOCK_PID=$!
for _ in $(seq 1 20); do
  if curl -sf "${MOCK_URL}/__health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
if ! curl -sf "${MOCK_URL}/__health" >/dev/null 2>&1; then
  echo "El simulador del proveedor no arrancó. Log:"
  cat "${MOCK_LOG}"
  exit 1
fi

echo "==> Starting wrangler dev on port ${PORT}"
# STRIPE_WEBHOOK_SECRET / RESEND_WEBHOOK_SECRET here are fixed, non-secret
# placeholders for tests/e2e/stripe-webhook.spec.ts and
# tests/e2e/resend-webhook.spec.ts to sign their own synthetic events
# against — never real values, never used for a real webhook endpoint.
# RESEND_BASE_URL apunta al simulador local (sólo se respeta si es loopback,
# server/utils/email/resendClient.ts) y RESEND_API_KEY es un marcador: los
# emails «se envían» al simulador y tests/e2e/empresas.spec.ts lee el cuerpo
# exacto que habría recibido Resend. Ninguno sale de la máquina.
npx wrangler dev --local --port "${PORT}" \
  --var STRIPE_WEBHOOK_SECRET:whsec_e2e_test_placeholder \
  --var RESEND_WEBHOOK_SECRET:whsec_ZTJlX3Rlc3RfcGxhY2Vob2xkZXJfMzJieXRlcw== \
  --var TOTP_ENCRYPTION_KEY:e2e_totp_key_placeholder \
  --var COMMS_CREDENTIALS_ENCRYPTION_KEY:e2e_comms_key_placeholder \
  --var "WHATSAPP_GRAPH_BASE_URL:${MOCK_URL}" \
  --var "AI_BASE_URL:${MOCK_URL}" \
  --var AI_API_KEY:e2e_ai_key_placeholder \
  --var "RESEND_BASE_URL:${MOCK_URL}" \
  --var RESEND_API_KEY:e2e_resend_key_placeholder \
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
E2E_BASE_URL="${BASE_URL}" E2E_PROVIDER_MOCK_URL="${MOCK_URL}" npx playwright test
