#!/usr/bin/env bash
# Offline gate for main. Must exit 0 on a clean clone with no secrets.
# When application code lands, add unit/contract tests here. Do not delete the
# contract checks. Do not require live Polar or other third-party networks.
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
if grep -qE 'POLAR_LIVE=1' .github/workflows/ci.yml; then
  fail "CI must not set POLAR_LIVE=1"
fi
if grep -q 'live-smoke.sh' .github/workflows/ci.yml; then
  fail "CI must not invoke live-smoke.sh"
fi

echo "== product contract keywords =="
grep -q 'weekly' SPEC.md || fail "SPEC.md must state weekly cadence"
grep -q '\$5' SPEC.md || fail "SPEC.md must state min \$5"
grep -q 'cannot buy' SPEC.md || fail "SPEC.md must forbid buying the whole show"
grep -qi 'polar' SPEC.md || fail "SPEC.md must name Polar"
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
  grep -q '/listings/:id/bids' src/http/bids.ts \
    || fail "bids route missing POST /listings/:id/bids"
  grep -q 'createCheckout' src/http/bids.ts \
    || fail "bids route must start Polar checkout"
  if grep -Rqi 'polar_live' src/http/bids.ts; then
    fail "HTTP bids must not import the live Polar client"
  fi
  if grep -Rqi 'polar' src/core/rank.ts src/core/week.ts; then
    fail "core rank/week must not import Polar"
  fi
  grep -q 'Monday' tests/week.test.ts || fail "week tests must cover Monday UTC reset"
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
  if grep -Rqi 'polar' src/core/url.ts src/core/clicks.ts src/core/show.ts src/http/clicks.ts; then
    fail "PR 4 must not add Polar checkout"
  fi

  echo "== about, rules, Polar fixture files =="
  for f in \
    src/http/pages.ts \
    src/billing/polar.ts \
    src/billing/polar_fixture.ts \
    tests/polar-fixture.test.ts
  do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  grep -q 'app.get("/about"' src/http/pages.ts || fail "pages route missing GET /about"
  grep -q 'app.get("/rules"' src/http/pages.ts || fail "pages route missing GET /rules"
  grep -q 'cannot buy' src/http/pages.ts || fail "pages must state cannot-buy-the-show"
  grep -q 'weekly reset' src/http/pages.ts || fail "pages must state weekly reset"
  grep -q 'Monday 00:00 UTC' src/http/pages.ts || fail "pages must state Monday 00:00 UTC reset"
  grep -q 'type PolarPort' src/billing/polar.ts || fail "polar.ts must export PolarPort"
  grep -q 'createCheckout' src/billing/polar.ts || fail "polar.ts must define createCheckout"
  grep -q 'applyPaid' src/billing/polar.ts || fail "polar.ts must define applyPaid"
  grep -q 'POLAR_FIXTURE_ONLY' src/billing/polar.ts || fail "polar.ts must honor POLAR_FIXTURE_ONLY"
  grep -q 'applyPaid' src/billing/polar_fixture.ts || fail "polar_fixture.ts must applyPaid"
  grep -q 'class PolarFixture' src/billing/polar_fixture.ts || fail "polar_fixture.ts must export PolarFixture"
  if grep -Rqi 'api.polar.sh\|polar.sh/v1' src/billing/polar.ts src/billing/polar_fixture.ts; then
    fail "PR 5 fixture must not call live Polar"
  fi
  grep -q 'Polar fixture' tests/polar-fixture.test.ts \
    || fail "polar-fixture tests must cover fixture rank update"
  grep -q 'POST /listings/:id/bids starts Polar fixture' tests/polar-fixture.test.ts \
    || fail "polar-fixture tests must cover HTTP bid Polar checkout"
  grep -q '/about' tests/polar-fixture.test.ts || fail "polar-fixture tests must cover GET /about"
  grep -q '/rules' tests/polar-fixture.test.ts || fail "polar-fixture tests must cover GET /rules"

  echo "== live Polar env-gated files =="
  for f in \
    src/billing/polar_live.ts \
    src/config.ts \
    src/http/webhook.ts \
    tests/polar-live-flag.test.ts
  do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  grep -q 'POLAR_LIVE' src/billing/polar_live.ts || fail "polar_live.ts must gate on POLAR_LIVE"
  grep -q 'class PolarLive' src/billing/polar_live.ts || fail "polar_live.ts must export PolarLive"
  grep -q 'BLOCKED-SECRET: POLAR_ACCESS_TOKEN' src/billing/polar_live.ts \
    || fail "polar_live.ts must fail closed without POLAR_ACCESS_TOKEN"
  grep -q 'BLOCKED-SECRET: POLAR_WEBHOOK_SECRET' src/billing/polar_live.ts \
    || fail "polar_live.ts must fail closed without POLAR_WEBHOOK_SECRET"
  grep -q 'POLAR_LIVE' src/config.ts || fail "config.ts must honor POLAR_LIVE"
  grep -q 'POLAR_FIXTURE_ONLY' src/config.ts || fail "config.ts must honor POLAR_FIXTURE_ONLY"
  grep -q 'POLAR_API_BASE' src/config.ts || fail "config.ts must honor POLAR_API_BASE"
  grep -q '/webhooks/polar' src/http/webhook.ts || fail "webhook route missing POST /webhooks/polar"
  grep -q 'handleWebhook' src/http/webhook.ts || fail "webhook route must apply payment"
  grep -q 'unset' tests/polar-live-flag.test.ts || fail "live-flag tests must cover unset Polar"
  grep -q 'POLAR_FIXTURE_ONLY' tests/polar-live-flag.test.ts \
    || fail "live-flag tests must cover fixture-only wins"
  grep -q 'BLOCKED-SECRET' tests/polar-live-flag.test.ts \
    || fail "live-flag tests must cover missing secrets"
  if grep -Rqi 'api.polar.sh\|https://polar.sh' src/billing/polar.ts src/billing/polar_fixture.ts src/config.ts tests/polar-live-flag.test.ts; then
    fail "live Polar host must not be hard-coded in fixture/config/tests"
  fi
  if grep -E '^[[:space:]]*(export[[:space:]]+)?POLAR_LIVE=1' scripts/test.sh >/dev/null; then
    fail "scripts/test.sh must not set POLAR_LIVE=1"
  fi

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

  echo "== unit tests =="
  # Offline only. Do not set POLAR_LIVE=1. Fixture-only wins once billing exists.
  unset POLAR_LIVE POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET || true
  export POLAR_FIXTURE_ONLY=1
  [[ "${POLAR_LIVE:-}" != "1" ]] || fail "POLAR_LIVE must stay unset in test.sh"
  test_log="$(mktemp)"
  trap 'rm -f "$test_log"' EXIT
  set +e
  node --import tsx --test tests/*.test.ts | tee "$test_log"
  test_status=${PIPESTATUS[0]}
  set -e
  [[ $test_status -eq 0 ]] || fail "unit tests failed"
  grep -Eq 'tests[[:space:]]+[1-9][0-9]*|#[[:space:]]+pass[[:space:]]+[1-9]' "$test_log" \
    || fail "test runner reported 0 tests"
  grep -q 'empty week' "$test_log" || fail "listings tests must cover empty week"
  grep -q 'arr' tests/listings.test.ts || fail "listings tests must cover arr/users"
  grep -q 'first bid $4' "$test_log" || fail "rank tests must cover min bid"
  grep -q 'Monday 00:00 UTC' "$test_log" || fail "week tests must cover Monday UTC reset"
  grep -q 'utm_source' "$test_log" || fail "url tests must cover tracking strip"
  grep -q 'no_chat' "$test_log" || fail "url tests must cover chat reject"
  grep -q '0 → 1' "$test_log" || fail "clicks tests must cover increment"
  grep -q 'cannot_buy_show' "$test_log" || fail "show tests must cover extra-slot SKU"
  grep -q 'Polar fixture' "$test_log" || fail "polar-fixture tests must cover fixture rank update"
  grep -q 'GET /about' "$test_log" || fail "polar-fixture tests must cover GET /about"
  grep -q 'GET /rules' "$test_log" || fail "polar-fixture tests must cover GET /rules"
  grep -q 'unset / 0 / fixture-only never hits Polar' "$test_log" \
    || fail "live-flag tests must cover unset / 0 / fixture-only"
  grep -q 'POLAR_LIVE unset in test' "$test_log" \
    || fail "live-flag tests must cover POLAR_LIVE unset"

  echo "== product UI opening three minutes =="
  for f in src/views/skin.ts src/http/pages.ts tests/pages.test.ts; do
    [[ -f "$f" ]] || fail "missing $f"
    [[ -s "$f" ]] || fail "empty $f"
  done
  grep -q 'Opening three minutes' src/http/pages.ts \
    || fail "board headline must be Opening three minutes"
  grep -q 'class="outbid">Outbid' src/http/pages.ts \
    || fail "board must clone Outbid claim chrome"
  grep -q 'data-bid-step' src/http/pages.ts \
    || fail "board must clone ± bid stepper"
  grep -q 'bid-field' src/http/pages.ts \
    || fail "board must clone dashed \$amount field"
  grep -q 'The room is empty' src/http/pages.ts \
    || fail "empty week must be an empty room"
  grep -q "This week's first slot is still open" src/http/pages.ts \
    || fail "empty room must tell a founder the first slot is still open"
  grep -q 'Outbid takes it after Polar lands' src/http/pages.ts \
    || fail "empty room must name Outbid as the move that takes the first slot"
  if grep -q 'No listings this week' src/http/pages.ts; then
    fail "empty room must not talk like a scout about listings"
  fi
  grep -q 'Unranked — no paid bid yet' src/http/pages.ts \
    || fail "unranked listings must stay unranked until paid"
  grep -q 'data-occupied-raise' src/http/pages.ts \
    || fail "occupied board must expose a raise cue"
  grep -q 'Polar charges only the difference' src/http/pages.ts \
    || fail "occupied raise cue must say Polar charges only the difference"
  grep -q 'The $ you type is the public bid' src/http/pages.ts \
    || fail "occupied raise cue must say the typed \$ is the public bid"
  if grep -Eqi 'claim this rank' src/http/pages.ts src/views/skin.ts; then
    fail "occupied raise cue must not hide behind claim-this-rank copy"
  fi
  if grep -Eqi 'hot deal|traction meter' src/http/pages.ts src/views/skin.ts; then
    fail "product UI must not sell traction meters or hot-deal chips"
  fi
  grep -q 'doesNotMatch(html, /#1/)' tests/pages.test.ts \
    || fail "pages tests must keep false-positive #1 forbidden on empty/unranked"
  grep -q 'opening three minutes' "$test_log" \
    || fail "pages tests must cover opening three minutes"
  grep -q 'empty room' "$test_log" \
    || fail "pages tests must cover empty room"
  grep -q 'first slot is still open' "$test_log" \
    || fail "pages tests must cover founder first-slot empty copy"
  grep -q 'unranked listing stays' "$test_log" \
    || fail "pages tests must cover unranked until paid"
  grep -q 'occupied raise cue' "$test_log" \
    || fail "pages tests must cover occupied raise cue"
  if grep -Eqi 'polar\.(sh|in)|api\.polar' "$test_log"; then
    fail "unit tests must not call live Polar hosts"
  fi
fi

echo "OK: buildable and testable"
