import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate } from 'k6/metrics'

/**
 * Synthetic load test (P2, docs/production-hardening-audit.md) — deliberately
 * scoped to read-only, side-effect-free public routes. It does NOT exercise
 * the appointment-booking or lead-capture write paths: those create real
 * `visits`/`leads` rows and trigger real transactional emails
 * (server/utils/email/send.ts), so hammering them under load would pollute
 * whichever environment this runs against with synthetic data instead of
 * just measuring performance. If a write-path load test is ever wanted, it
 * needs its own script against a database that's explicitly disposable, not
 * this one.
 *
 * Run via .github/workflows/load-test.yml (workflow_dispatch only — this
 * never runs automatically on push/PR), or locally:
 *   BASE_URL=https://staging.example.workers.dev k6 run scripts/load-test/k6-load-test.js
 */

const BASE_URL = (__ENV.BASE_URL || '').replace(/\/$/, '')
if (!BASE_URL) {
  throw new Error('BASE_URL env var is required, e.g. BASE_URL=https://staging.example.workers.dev k6 run scripts/load-test/k6-load-test.js')
}

const errorRate = new Rate('errors')

// Conservative defaults — this is meant to establish a baseline and catch
// regressions, not to find the app's breaking point. Override via k6's
// --vus/--duration flags (or edit `options` below) for a heavier run once a
// baseline exists to compare against.
export const options = {
  scenarios: {
    browsing: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 10 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    // Same shape as scripts/smoke-test.mjs's checks, just measured under
    // concurrent load instead of one request at a time.
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
    errors: ['rate<0.01'],
  },
}

function get(path, expectedStatus = 200) {
  const res = http.get(`${BASE_URL}${path}`)
  const ok = check(res, {
    [`${path} returns ${expectedStatus}`]: (r) => r.status === expectedStatus,
  })
  errorRate.add(!ok)
  return res
}

export default function () {
  get('/api/health/live')
  sleep(1)

  get('/')
  sleep(1)

  get('/propiedades')
  sleep(1)

  const listRes = get('/api/public/properties?perPage=6')
  let slug = null
  try {
    const body = JSON.parse(listRes.body)
    slug = body?.rows?.[0]?.slug || null
  } catch {
    // Non-JSON/failed response — already flagged by the check() above; nothing more to do here.
  }
  sleep(1)

  if (slug) {
    get(`/propiedades/${slug}`)
    sleep(1)
  }
}
