# Load testing (k6)

A synthetic load test against read-only public browsing routes — home,
property listing, a property detail page, and the liveness check. See
`scripts/load-test/k6-load-test.js` for exactly what it hits and why it
deliberately does **not** exercise the appointment-booking or lead-capture
write paths (those create real `visits`/`leads` rows and send real
transactional emails — running them under load would pollute whichever
environment this runs against with synthetic data, not just measure
performance).

## Running it

**Via GitHub Actions** (`.github/workflows/load-test.yml`, `workflow_dispatch`
only — this never runs automatically on push/PR): Actions tab → "Load test
(k6)" → Run workflow → choose `staging` or `production`.

Requires the target GitHub Environment's `STAGING_URL`/`PRODUCTION_URL`
variable to be set (Settings → Environments → `<env>` → Variables) — the
same variables `ci.yml`'s smoke-test step already depends on. If it's not
set yet, the workflow's `preflight` job fails with a clear message instead
of silently testing nothing.

**Locally**, with [k6](https://k6.io/docs/get-started/installation/) installed:

```bash
BASE_URL=https://staging.example.workers.dev k6 run scripts/load-test/k6-load-test.js
```

## Reading the result

k6 reports `http_req_duration` (response time percentiles) and
`http_req_failed` (error rate) per run. The script's `thresholds` (p95 <
1.5s, error rate < 1%) are a conservative starting baseline, not a tuned
SLO — the first real run against a real deployed environment is what should
set the actual bar; adjust `options.thresholds` in the script once that
baseline exists.

The default `options.scenarios.browsing` stage ramps to 10 virtual users
over ~2 minutes total. That's intentionally light — meant to catch obvious
regressions and confirm the deploy pipeline's basic health under mild
concurrent load, not to find the app's breaking point. Increase
`stages`/`target` for a heavier run once there's a reason to (e.g. before an
expected traffic spike).
