#!/usr/bin/env bash
# Offline gate for main. Must exit 0 on a clean clone with no secrets.
# When application code lands, add unit/contract tests here. Do not delete the
# contract checks. Do not require live Waffo or other third-party networks.
# scripts/live-smoke.sh is operator-only and must not run here.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "== contract files =="
for f in README.md SPEC.md BUILD.md CONTRIBUTING.md scripts/test.sh .github/workflows/ci.yml; do
  [[ -f "$f" ]] || fail "missing $f"
  [[ -s "$f" ]] || fail "empty $f"
done

echo "== contributing rules are documented =="
grep -q 'main must always be buildable' CONTRIBUTING.md \
  || grep -q 'main` must always be buildable' CONTRIBUTING.md \
  || fail "CONTRIBUTING.md does not state the main-branch rule"

echo "== SPEC mentions git collaboration =="
grep -q 'Git collaboration' SPEC.md || fail "SPEC.md missing Git collaboration section"

echo "== BUILD is a numbered PR plan through live-smoke =="
grep -qE '^### PR 1:' BUILD.md || fail "BUILD.md missing ### PR 1:"
grep -qE '^### PR [0-9]+: live-smoke$' BUILD.md || fail "BUILD.md missing ### PR N: live-smoke"

echo "== CI job id is ci =="
grep -qE '^[[:space:]]+ci:[[:space:]]*$' .github/workflows/ci.yml \
  || fail ".github/workflows/ci.yml missing job id ci"
if grep -qE 'POLAR_LIVE=1|WAFFO_LIVE=1|WAFFO_FIXTURE_ONLY=1' .github/workflows/ci.yml; then
  fail "CI must not select a legacy or live payment rail"
fi
if grep -q 'live-smoke.sh' .github/workflows/ci.yml; then
  fail "CI must not invoke live-smoke.sh"
fi

echo "== product contract keywords =="
grep -q 'weekly' SPEC.md || fail "SPEC.md must state weekly cadence"
grep -q '\$5' SPEC.md || fail "SPEC.md must state min \$5"
grep -q 'cannot buy' SPEC.md || fail "SPEC.md must forbid buying the whole show"
grep -qi 'waffo' SPEC.md || fail "SPEC.md must name Waffo"
grep -qi 'traction' SPEC.md || fail "SPEC.md must forbid invented traction"

echo "== no committed secrets =="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if git ls-files | grep -E '(^|/)\.env$|(^|/)id_rsa$|\.pem$|credentials\.json$' >/dev/null; then
    fail "secret-like path is tracked"
  fi
fi

echo "== markdown is UTF-8 text =="
file -b --mime-encoding README.md SPEC.md BUILD.md CONTRIBUTING.md | grep -qiE 'utf-8|us-ascii' \
  || fail "docs are not UTF-8/ASCII"

if grep -E '^[[:space:]]*(bash[[:space:]]+)?(\./)?scripts/live-smoke\.sh' scripts/test.sh >/dev/null; then
  fail "scripts/test.sh must not invoke live-smoke.sh"
fi

if [[ -f package.json ]]; then
  echo "== Node 22 + systemd/Caddy launch contract =="
  command -v node >/dev/null || fail "node is required for the release gate"
  node_version="$(node --version)"
  node_major="${node_version#v}"
  node_major="${node_major%%.*}"
  [[ "$node_major" =~ ^[0-9]+$ ]] || fail "could not parse Node.js version ${node_version}"
  (( node_major >= 22 )) || fail "Node.js 22 or newer is required (found ${node_version})"
  grep -q '"node": ">=22"' package.json \
    || fail "package.json must require Node.js >=22"
  grep -q '"start": "node dist/server.js"' package.json \
    || fail "npm start must execute the compiled runtime"
  grep -q 'await app.listen({ host: "127.0.0.1", port });' src/server.ts \
    || fail "server must keep the PORT listener loopback-only behind Caddy"
  grep -qi 'One VPS, Caddy TLS' BUILD.md \
    || fail "BUILD.md must document the systemd/Caddy VPS boundary"

  echo "== durable SQLite contract =="
  for f in src/db.ts src/server.ts src/app.ts; do
    [[ -s "$f" ]] || fail "missing or empty $f"
  done
  grep -q 'DATABASE_PATH' src/db.ts src/server.ts src/app.ts \
    || fail "runtime must use an explicit DATABASE_PATH"
  grep -q 'journal_mode = WAL' src/db.ts \
    || fail "SQLite must use WAL for the durable file"
  grep -q 'foreign_keys = ON' src/db.ts \
    || fail "SQLite foreign keys must be enabled"
  grep -q 'schema_migrations' src/db.ts \
    || fail "SQLite migrations must be recorded"
  grep -q 'production requires an explicit durable DATABASE_PATH' src/server.ts src/app.ts \
    || fail "production must fail closed without a durable SQLite path"
  migration_count="$(find src/migrations -type f -name '*.sql' -print | wc -l | tr -d ' ')"
  [[ "$migration_count" =~ ^[0-9]+$ && "$migration_count" -gt 0 ]] \
    || fail "no SQL migrations found"
  echo "node=${node_version}; migrations=${migration_count}; SQLite=WAL"

  echo "== listings and board files =="
  for f in \
    src/db.ts \
    src/migrations/001_init.sql \
    src/core/listing.ts \
    src/http/listings.ts \
    src/http/pages.ts \
    tests/listings.test.ts
  do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  grep -q 'CREATE TABLE listings' src/migrations/001_init.sql \
    || fail "001_init.sql must create listings"
  if grep -Eqi 'arr|mrr|traction|users' src/migrations/001_init.sql; then
    fail "listings schema must not store traction fields"
  fi
  grep -q 'app.post("/listings"' src/http/listings.ts \
    || fail "listings route missing POST /listings"
  grep -q 'app.get("/"' src/http/pages.ts || fail "pages route missing GET /"

  echo "== ranking, raise, weekly window files =="
  for f in \
    src/core/rank.ts \
    src/core/week.ts \
    src/http/bids.ts \
    src/migrations/002_bids.sql \
    tests/rank.test.ts \
    tests/week.test.ts
  do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  grep -q 'CREATE TABLE bids' src/migrations/002_bids.sql \
    || fail "002_bids.sql must create bids"
  grep -q 'function rankKey' src/core/rank.ts || fail "rank.ts must export rankKey"
  grep -q 'chargeUsd' src/core/rank.ts || fail "rank.ts must compute chargeUsd"
  grep -q 'weekId' src/core/week.ts || fail "week.ts must compute weekId"
  grep -q 'WEEK_NOW' src/core/week.ts || fail "week.ts must honor WEEK_NOW"
  grep -q 'ROLLING_WEEK_MS' src/core/week.ts || fail "week.ts must export a rolling last-7-days window"
  grep -q 'bidInRollingWeek' src/core/week.ts || fail "week.ts must test paidAt against the rolling week"
  grep -q 'getBidInRollingWeek' src/core/rank.ts \
    || fail "rank.ts must quote against the rolling last-7-days window"
  grep -q 'bidInRollingWeek' src/core/rank.ts \
    || fail "rankedBoard must filter by rolling paidAt, not Monday weekId"
  grep -q '/listings/:id/bids' src/http/bids.ts \
    || fail "bids route missing POST /listings/:id/bids"
  grep -q 'createCheckout' src/http/bids.ts \
    || fail "bids route must start Waffo checkout"
  if grep -Rqi 'polar_live\|app\.polar' src/http/bids.ts; then
    fail "HTTP bids must not import an obsolete payment client"
  fi
  if grep -qi 'waffo' src/core/rank.ts src/core/week.ts; then
    fail "core rank/week must not import Waffo"
  fi
  grep -q 'Monday' tests/week.test.ts || fail "week tests must cover Monday UTC reset"
  grep -q 'rolling last-7-days' tests/week.test.ts \
    || fail "week tests must cover rolling last-7-days window"
  grep -q 'paid bid expires at exactly seven days' tests/week.test.ts \
    || fail "week tests must cover the exact seven-day expiry boundary"
  grep -q 'older paidAt' tests/rank.test.ts || fail "rank tests must cover older-wins-ties"

  echo "== URL hygiene, public clicks, cannot-buy-the-show files =="
  for f in \
    src/core/url.ts \
    src/core/clicks.ts \
    src/core/show.ts \
    src/http/clicks.ts \
    src/migrations/003_clicks.sql \
    tests/url.test.ts \
    tests/clicks.test.ts \
    tests/show.test.ts
  do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  grep -q 'CREATE TABLE clicks' src/migrations/003_clicks.sql \
    || fail "003_clicks.sql must create clicks"
  grep -q 'utm_' src/core/url.ts || fail "url.ts must strip utm_ tracking keys"
  grep -q 'fbclid' src/core/url.ts || fail "url.ts must strip fbclid"
  grep -q 'no_chat' src/core/url.ts || fail "url.ts must reject chat hosts"
  grep -q 'nsfw' src/core/url.ts || fail "url.ts must reject NSFW hosts"
  grep -q 'function incrementClick' src/core/clicks.ts \
    || fail "clicks.ts must increment only"
  grep -q 'cannot_buy_show' src/core/show.ts \
    || fail "show.ts must refuse cannot_buy_show"
  grep -q '/listings/:id/clicks' src/http/clicks.ts \
    || fail "clicks route missing POST /listings/:id/clicks"
  if grep -Rqi 'waffo' src/core/url.ts src/core/clicks.ts src/core/show.ts src/http/clicks.ts; then
    fail "PR 4 must not add Waffo checkout"
  fi

  echo "== about, rules, Waffo fixture files =="
  for f in \
    src/http/pages.ts \
    src/billing/waffo-fixture.ts \
    tests/waffo-payment.test.ts
  do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  grep -q 'app.get("/about"' src/http/pages.ts || fail "pages route missing GET /about"
  grep -q 'app.get("/rules"' src/http/pages.ts || fail "pages route missing GET /rules"
  grep -q 'cannot buy' src/http/pages.ts || fail "pages must state cannot-buy-the-show"
  grep -q 'rolling last 7 days' src/http/pages.ts \
    || fail "pages must state the rolling last-7-days house window"
  grep -Eq 'instead of resetting for everyone at Monday midnight|does not reset for everyone at Monday midnight' src/http/pages.ts \
    || fail "pages must state that Monday midnight is not a global reset"
  grep -q 'Unpaid checkout sessions do not change rank' src/http/pages.ts \
    || fail "pages must state that unpaid checkout does not rank"
  grep -q 'data-rolling-week="true"' src/http/pages.ts \
    || fail "occupied / empty / must stamp data-rolling-week"
  grep -q 'class WaffoFixture' src/billing/waffo-fixture.ts \
    || fail "waffo fixture must export WaffoFixture"
  grep -q 'createCheckout' src/billing/waffo-fixture.ts \
    || fail "waffo fixture must define createCheckout"
  grep -q 'applyPaid' src/billing/waffo-fixture.ts \
    || fail "waffo fixture must define applyPaid"
  if grep -Eqi 'api\\.waffo\\.(ai|sh)|waffo\\.sh/v1' src/billing/waffo-fixture.ts; then
    fail "fixture must not call live Waffo"
  fi
  grep -q 'Waffo factory is explicit' tests/waffo-payment.test.ts \
    || fail "Waffo payment tests must cover fixture rank update"
  grep -q 'app.get("/about"' src/http/pages.ts || fail "pages route must cover GET /about"
  grep -q 'app.get("/rules"' src/http/pages.ts || fail "pages route must cover GET /rules"

  echo "== live Waffo SDK/config files =="
  for f in \
    src/billing/waffo.ts \
    src/config.ts \
    src/http/webhook.ts \
    tests/waffo-payment.test.ts
  do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  grep -q 'WAFFO_MODE' src/config.ts || fail "config must require canonical WAFFO_MODE"
  grep -q 'class WaffoLive' src/billing/waffo.ts || fail "waffo.ts must export WaffoLive"
  grep -q 'BLOCKED-SECRET' src/billing/waffo.ts || fail "Waffo live config must fail closed"
  grep -q 'DATABASE_PATH' src/billing/waffo.ts src/server.ts \
    || fail "Waffo live config must require durable database"
  grep -q 'WAFFO_API_BASE' src/config.ts src/billing/waffo.ts \
    || fail "Waffo API base must be configurable and validated"
  grep -q 'PUBLIC_BASE_URL' src/billing/waffo.ts \
    || fail "Waffo success URL must require a public base"
  grep -q 'order.completed' src/billing/waffo.ts \
    || fail "Waffo webhook must accept only order.completed"
  grep -q 'verify' src/billing/waffo.ts \
    || fail "Waffo webhook must use SDK verification"
  grep -q 'app.post(WAFFO_WEBHOOK_PATH' src/http/webhook.ts \
    || fail "canonical Waffo webhook route missing"
  grep -q 'WAFFO_WEBHOOK_PATH = "/api/webhooks/waffo"' src/http/webhook.ts \
    || fail "canonical Waffo webhook path must be /api/webhooks/waffo"
  if grep -q 'POLAR_WEBHOOK_PATH\|/webhooks/polar' src/http/webhook.ts; then
    fail "obsolete Polar webhook route remains active"
  fi
  if grep -q 'createSign\|createHmac' src/billing/waffo.ts src/billing/waffo-fixture.ts; then
    fail "live Waffo signing must stay inside the official SDK"
  fi
  grep -q 'Waffo production and legacy selectors fail closed' tests/waffo-payment.test.ts \
    || fail "Waffo tests must cover production and legacy selectors"
  grep -q 'Waffo production requires durable DB' tests/waffo-payment.test.ts \
    || fail "Waffo tests must cover production durable DB and origin gates"
  grep -q 'Waffo exact replay' tests/waffo-payment.test.ts \
    || fail "Waffo tests must cover exact replay"
  if grep -q '"@polar-sh/sdk"' package.json package-lock.json; then
    fail "obsolete Waffo dependency remains"
  fi
  if find src/billing tests -maxdepth 1 -type f \( -name 'polar*.ts' -o -name '*polar*.test.ts' \) -print -quit | grep -q .; then
    fail "obsolete Polar adapters/tests remain"
  fi

  echo "== live-smoke offline boundary =="
  grep -q 'WAFFO_MODE=fixture' scripts/live-smoke.sh \
    || fail "live-smoke must require the fixture mode"
  grep -q 'LIVE_SMOKE_BASE is unsupported' scripts/live-smoke.sh \
    || fail "live-smoke must reject the retired base override"
  if grep -Eq 'BASE=.*LIVE_SMOKE_BASE|LIVE_SMOKE_PORT|assuming existing server' scripts/live-smoke.sh; then
    fail "live-smoke must not accept a supplied base or port"
  fi
  ci_selector_unsets=(
    -u CI
    -u GITHUB_ACTIONS
    -u CONTINUOUS_INTEGRATION
    -u GITHUB_RUN_ID
    -u GITHUB_RUN_NUMBER
    -u GITHUB_WORKFLOW
    -u GITHUB_WORKFLOW_REF
    -u GITHUB_WORKFLOW_SHA
    -u GITHUB_EVENT_NAME
    -u GITHUB_EVENT_PATH
    -u GITHUB_JOB
    -u GITHUB_WORKSPACE
    -u RUNNER_OS
    -u RUNNER_ARCH
    -u RUNNER_NAME
    -u RUNNER_TEMP
    -u RUNNER_TOOL_CACHE
  )
  live_smoke_script="scripts/live-smoke.sh"
  for unsafe_base in \
    'https://deployed.example' \
    'http://user:password@127.0.0.1:43127'; do
    boundary_log="$(mktemp)"
    if env "${ci_selector_unsets[@]}" \
      -u LIVE_SMOKE_BASE -u LIVE_SMOKE_PORT -u WAFFO_MODE \
      WAFFO_MODE=fixture LIVE_SMOKE_BASE="$unsafe_base" \
      bash "$live_smoke_script" >"$boundary_log" 2>&1; then
      rm -f "$boundary_log"
      fail "live-smoke accepted an unsafe base override"
    fi
    grep -q 'LIVE_SMOKE_BASE is unsupported' "$boundary_log" \
      || { rm -f "$boundary_log"; fail "live-smoke did not reject the base override"; }
    if grep -Fq "$unsafe_base" "$boundary_log"; then
      rm -f "$boundary_log"
      fail "live-smoke printed the supplied base override"
    fi
    rm -f "$boundary_log"
  done
  for non_fixture_mode in waffo-test waffo-prod; do
    boundary_log="$(mktemp)"
    if env "${ci_selector_unsets[@]}" \
      -u LIVE_SMOKE_BASE -u LIVE_SMOKE_PORT -u WAFFO_MODE \
      WAFFO_MODE="$non_fixture_mode" bash "$live_smoke_script" >"$boundary_log" 2>&1; then
      rm -f "$boundary_log"
      fail "live-smoke accepted non-fixture mode ${non_fixture_mode}"
    fi
    grep -q 'live-smoke requires WAFFO_MODE=fixture' "$boundary_log" \
      || { rm -f "$boundary_log"; fail "live-smoke did not reject non-fixture mode"; }
    if grep -q 'starting local fixture server\|database=' "$boundary_log"; then
      rm -f "$boundary_log"
      fail "non-fixture mode reached the mutating local journey"
    fi
    rm -f "$boundary_log"
  done

  echo "== compiled production artifact contract =="
  for f in tsconfig.build.json scripts/build-runtime.sh scripts/check-built-runtime.sh; do
    [[ -s "$f" ]] || fail "missing or empty $f"
  done
  [[ -x scripts/build-runtime.sh ]] || fail "scripts/build-runtime.sh must be executable"
  [[ -x scripts/check-built-runtime.sh ]] || fail "scripts/check-built-runtime.sh must be executable"
  grep -q '"start": "node dist/server.js"' package.json \
    || fail "npm start must execute compiled dist/server.js"
  grep -q '"build": "bash scripts/build-runtime.sh"' package.json \
    || fail "npm run build must emit the compiled runtime"
  grep -q 'npm ci --omit=dev' scripts/check-built-runtime.sh \
    || fail "built-runtime gate must verify production-only dependencies"

  echo "== install =="
  if [[ ! -d node_modules ]]; then
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
  fi

  echo "== tsc --noEmit =="
  npx tsc --noEmit

  echo "== compiled production artifact =="
  npm run build
  bash scripts/check-built-runtime.sh

  echo "== unit tests =="
  # Offline only. Select the fixture explicitly; no provider secrets or network.
  test_log="$(mktemp)"
  trap 'rm -f "$test_log"' EXIT
  set +e
  env NODE_ENV=test WAFFO_MODE=fixture node --import tsx --test tests/*.test.ts | tee "$test_log"
  test_status=${PIPESTATUS[0]}
  set -e
  [[ $test_status -eq 0 ]] || fail "unit tests failed"
  grep -Eq 'tests[[:space:]]+[1-9][0-9]*|#[[:space:]]+pass[[:space:]]+[1-9]' "$test_log" \
    || fail "test runner reported 0 tests"
  grep -q 'empty week' "$test_log" || fail "listings tests must cover empty week"
  grep -q 'arr' tests/listings.test.ts || fail "listings tests must cover arr/users"
  grep -q 'first bid $4' "$test_log" || fail "rank tests must cover min bid"
  grep -q 'Monday 00:00 UTC' "$test_log" || fail "week tests must cover Monday UTC reset"
  grep -q 'rolling last-7-days' "$test_log" \
    || fail "week tests must cover rolling last-7-days window"
  grep -q 'paid bid expires at exactly seven days' "$test_log" \
    || fail "exact seven-day expiry regression did not run"
  grep -q 'utm_source' "$test_log" || fail "url tests must cover tracking strip"
  grep -q 'no_chat' "$test_log" || fail "url tests must cover chat reject"
  grep -q '0 → 1' "$test_log" || fail "clicks tests must cover increment"
  grep -q 'cannot_buy_show' "$test_log" || fail "show tests must cover extra-slot SKU"
  grep -q 'Waffo factory is explicit' "$test_log" \
    || fail "Waffo payment tests must cover explicit fixture and no provider calls"
  grep -q 'Waffo verified order.completed' "$test_log" \
    || fail "Waffo payment tests must cover verified settlement"
  grep -q 'Waffo exact replay' "$test_log" \
    || fail "Waffo payment tests must cover replay no-op"
  grep -q 'production and legacy selectors fail closed' "$test_log" \
    || fail "Waffo payment tests must cover production/legacy mode blockers"

  echo "== product UI opening three minutes =="

  for f in src/views/skin.ts src/http/pages.ts tests/pages.test.ts; do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  if grep -Eq 'outbid-reference|renderOutbidReference|isOutbidReferenceFixture|OUTBID_REFERENCE_ROWS' src/http/pages.ts; then
    fail "product page must not route through the shared Outbid reference adapter"
  fi
  if grep -q '\${VISUAL_CSS}' src/views/skin.ts; then
    fail "product skin must not emit the shared visual parity layer"
  fi
  grep -q 'data-stage-section="on-stage"' src/http/pages.ts \
    || fail "board must expose the first.slot on-stage section"
  grep -q 'const stageRole = input.paid' src/http/pages.ts \
    || fail "board must expose semantic stage-card roles"
  grep -q 'stageRole = input.paid ? (later ? "later-cue" : "lead-cue")' src/http/pages.ts \
    || fail "board must expose the spotlighted lead and later cues"
  grep -q 'data-stage-section="in-wings"' src/http/pages.ts \
    || fail "board must expose the in-wings unpaid section"
  grep -q 'Opening three minutes' src/http/pages.ts \
    || fail "board headline must be Opening three minutes"
  grep -q 'class="outbid">Claim rank' src/http/pages.ts \
    || fail "board must keep the Claim rank action"
  grep -q 'data-bid-step' src/http/pages.ts \
    || fail "board must keep the ± bid stepper"
  grep -q 'bid-field' src/http/pages.ts \
    || fail "board must keep the dashed amount field"
  grep -q 'obfuscated schemes and path-only inputs fail closed' tests/url.test.ts \
    || fail "URL tests must reject obfuscated schemes and path-only input"
  grep -q 'HTML checkout rejects obfuscated schemes and path-only URLs before checkout' tests/listings.test.ts \
    || fail "checkout tests must reject obfuscated URL input before checkout"
  grep -q 'The room is empty' src/http/pages.ts \
    || fail "empty week must be an honest room"
  grep -q "This week's first slot is still open" src/http/pages.ts \
    || fail "empty room must explain the open slot"
  grep -q 'Unranked — no paid bid yet' src/http/pages.ts \
    || fail "unpaid listings must stay unranked"
  grep -q 'data-occupied-raise' src/http/pages.ts \
    || fail "occupied board must expose a raise cue"
  grep -q 'only the difference' src/http/pages.ts \
    || fail "occupied raise cue must explain the difference charge"
  grep -q 'data-raise-difference="true"' src/http/pages.ts \
    || fail "occupied raise must stamp the difference"
  grep -q 'data-raise-charge-usd' src/http/pages.ts \
    || fail "occupied raise must show the difference dollars"
  grep -q 'data-open-deck="true"' src/http/pages.ts \
    || fail "paid cards must expose Open deck"
  grep -q 'data-open-later="true"' src/http/pages.ts \
    || fail "later paid cards must expose their deck foot action"
  grep -q 'data-first-click="open"' src/http/pages.ts \
    || fail "#1 Open deck must remain the first click"
  grep -q 'data-prize-first="true"' src/http/pages.ts \
    || fail "#1 must retain prize-first card facts"
  grep -q 'data-later-seat="true"' src/http/pages.ts \
    || fail "later ranks must retain quiet bid seats"
  grep -q 'data-claim-after-slot="true"' src/http/pages.ts \
    || fail "occupied Claim must remain after the slot"
  grep -q 'data-open-first="true"' src/http/pages.ts \
    || fail "#1 with later seats must retain semantic open-first state"
  echo "== no invented traction or social proof =="
  social_proof_re='(^|[^[:alnum:]_])(arr|mrr|revenue|users|growth([[:space:]-]+rate|[[:space:]-]*%)|waitlist([[:space:]-]+size)?|traction|hot[[:space:]-]+deal|traction[[:space:]-]+(meter|badge)|fake[[:space:]-]+(logo|logos|score|scores|rating|ratings|quote|quotes)|scout[[:space:]-]+(score|scores|rating|ratings|quote|quotes)|star[[:space:]-]+ratings?|social[[:space:]-]+proof|backed[[:space:]]+by|typical[[:space:]-]+(raise|price))([^[:alnum:]_]|$)'
  social_proof_hits="$(find src -type f \( -name '*.ts' -o -name '*.sql' \) -exec grep -Eil "$social_proof_re" {} + || true)"
  [[ -z "$social_proof_hits" ]] \
    || fail "source contains invented traction/social proof vocabulary: ${social_proof_hits}"
  grep -q 'rendered pages never invent traction or social proof' tests/pages.test.ts \
    || fail "pages tests must cover rendered anti-traction/social-proof output"
  grep -q 'one Open deck per paid card' tests/pages.test.ts \
    || fail "page tests must assert one Open deck per paid card"
  grep -q 'one #1 Claim rank entry' tests/pages.test.ts \
    || fail "page tests must assert one #1 Claim rank entry"
  grep -q 'unpaid and empty states stay honest' tests/pages.test.ts \
    || fail "page tests must keep unpaid and empty honesty"
  if grep -Eqi 'Then Outbid|after Open deck|after Then Outbid|raise-after-deck|open-after-raise|raise-after-open|data-raise-after|data-open-after' src/http/pages.ts src/views/skin.ts; then
    fail "obsolete hop ladder remains in product source"
  fi
  if grep -Eq 'function (raiseAfterDeckHop|openAfterRaiseHop|raiseAfterOpenHop)|\b(raiseAfter|openAfterRaise|raiseAfterOpen|openOne)\b' src/http/pages.ts; then
    fail "obsolete hop helpers remain in page source"
  fi
  if grep -Eqi 'data-open-one-first|data-raise-one-first|data-open-after-raise|data-raise-after-open|open-one-cue|open-one\b' src/http/pages.ts src/views/skin.ts; then
    fail "obsolete numbered hop state remains in UI source"
  fi
  if grep -n 'function renderUnranked' -A 18 src/http/pages.ts | grep -Eq 'Open deck|data-open-deck|data-first-click="open"'; then
    fail "unpaid cards must not inherit paid deck actions"
  fi
  if grep -q 'after that hop' src/http/pages.ts; then
    fail "empty copy must not describe a missing hop"
  fi
  grep -q '\.listing\[data-open-first\]' src/views/skin.ts \
    || fail "occupied styling must use the semantic open-first state"
  if grep -Eqi 'waffo\.(sh|in)|api\.waffo' "$test_log"; then
    fail "unit tests must not call live Waffo hosts"
  fi
  if ! grep -q 'one Open deck per paid card' "$test_log"; then
    fail "page contract test did not run"
  fi
  if ! grep -q 'unpaid and empty states stay honest' "$test_log"; then
    fail "empty/unpaid page contract test did not run"
  fi
  if ! grep -q 'rendered pages never invent traction or social proof' "$test_log"; then
    fail "rendered anti-traction/social-proof page test did not run"
  fi
fi

echo "OK: buildable and testable"
