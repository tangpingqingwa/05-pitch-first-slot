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
  grep -q 'data-first-click="claim"' src/http/pages.ts \
    || fail "empty house Outbid must be the Claim #1 first click"
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
  grep -q 'data-raise-difference="true"' src/http/pages.ts \
    || fail "occupied raise must stamp data-raise-difference on the claim"
  grep -q 'data-raise-charge="true"' src/http/pages.ts \
    || fail "occupied raise must stamp Polar's difference charge"
  grep -q 'data-raise-charge-usd' src/http/pages.ts \
    || fail "occupied raise must show Polar's difference dollars"
  grep -q 'only the difference, not a new bid' src/http/pages.ts \
    || fail "occupied raise must not look like a full new bid"
  grep -q 'Same deck URL raises this row' src/http/pages.ts \
    || fail "occupied form hint must say a same-deck raise updates the row"
  if grep -n 'data-empty-room' -A 4 src/http/pages.ts | grep -q 'data-raise-difference'; then
    fail "empty house must not stamp a raise-difference charge"
  fi
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'raise-difference|raise-charge'; then
    fail "unpaid cue must not stamp a raise-difference charge"
  fi
  if grep -n 'function raiseAfterDeckHop' -A 8 src/http/pages.ts | grep -q 'raise-difference'; then
    fail "raise-difference must stay on the claim form, not a new hop"
  fi
  if grep -Eqi 'claim this rank' src/http/pages.ts src/views/skin.ts; then
    fail "occupied raise cue must not hide behind claim-this-rank copy"
  fi
  if grep -Eqi 'hot deal|traction meter' src/http/pages.ts src/views/skin.ts; then
    fail "product UI must not sell traction meters or hot-deal chips"
  fi
  grep -q 'doesNotMatch(html, /#1/)' tests/pages.test.ts \
    || fail "pages tests must keep false-positive #1 forbidden on empty/unranked"
  grep -q 'empty house first click is Claim #1' tests/pages.test.ts \
    || fail "pages tests must cover empty-house Claim #1 first click"
  grep -q 'data-first-click="claim"' tests/pages.test.ts \
    || fail "pages tests must stamp Claim #1 as the first click"
  grep -q 'data-later-write' tests/pages.test.ts \
    || fail "pages tests must keep deck identity a later write"
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
  grep -q 'raise is certain' tests/pages.test.ts \
    || fail "pages tests must cover occupied raise as Polar difference"
  grep -q 'raise is certain' "$test_log" \
    || fail "pages tests must cover occupied raise as Polar difference"
  grep -q 'data-open-deck="true"' src/http/pages.ts \
    || fail "paid cue must name Open deck with data-open-deck"
  grep -q 'class="open-deck"' src/http/pages.ts \
    || fail "paid cue hop must be the Open deck action"
  grep -q 'Open deck' src/http/pages.ts \
    || fail "paid cue hop must say Open deck"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'open-deck|Open deck'; then
    fail "unpaid cue must not use the Open deck hop"
  fi
  grep -q 'occupied paid cue names Open deck' tests/pages.test.ts \
    || fail "pages tests must cover occupied Open deck hop"
  grep -q 'Open deck' "$test_log" \
    || fail "pages tests must cover Open deck hop"
  grep -q 'data-raise-after-deck="true"' src/http/pages.ts \
    || fail "occupied #1 cue must hop to Outbid after Open deck"
  grep -q 'Then Outbid' src/http/pages.ts \
    || fail "raise-after-deck hop must say Then Outbid"
  grep -q 'href="#claim"' src/http/pages.ts \
    || fail "raise-after-deck hop must return to #claim"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'raise-after-deck|Then Outbid|#claim'; then
    fail "unpaid cue must not hop to Outbid after a deck"
  fi
  grep -q 'occupied #1 cue hops Then Outbid after Open deck' tests/pages.test.ts \
    || fail "pages tests must cover raise after Open deck"
  grep -q 'Then Outbid' "$test_log" \
    || fail "pages tests must cover Then Outbid after Open deck"
  grep -q 'data-open-after-raise="true"' src/http/pages.ts \
    || fail "occupied #1 cue must hop Open deck after Then Outbid"
  grep -q 'after Then Outbid' src/http/pages.ts \
    || fail "open-after-raise hop must sit after Then Outbid"
  grep -q 'class="open-after-raise"' src/http/pages.ts \
    || fail "open-after-raise hop must use the later Open deck class"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'open-after-raise|after Then Outbid'; then
    fail "unpaid cue must not hop Open deck after Then Outbid"
  fi
  if grep -n 'function raiseAfterDeckHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise'; then
    fail "Then Outbid hop must stay a raise hop, not Open deck"
  fi
  grep -q 'occupied #1 cue hops Open deck after Then Outbid' tests/pages.test.ts \
    || fail "pages tests must cover Open deck after Then Outbid"
  grep -q 'Open deck after Then Outbid' "$test_log" \
    || fail "pages tests must cover Open deck after Then Outbid"
  grep -q 'data-raise-after-open="true"' src/http/pages.ts \
    || fail "occupied #1 cue must hop Then Outbid after the after-raise Open deck"
  grep -q 'after Open deck' src/http/pages.ts \
    || fail "raise-after-open hop must sit after the after-raise Open deck"
  grep -q 'class="raise-after-open"' src/http/pages.ts \
    || fail "raise-after-open hop must use the later Then Outbid class"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'raise-after-open|after Open deck'; then
    fail "unpaid cue must not hop Then Outbid after Open deck"
  fi
  if grep -n 'function openAfterRaiseHop' -A 8 src/http/pages.ts | grep -q 'raise-after-open'; then
    fail "Open deck after Then Outbid must stay a deck hop, not Then Outbid"
  fi
  grep -q 'occupied #1 cue hops Then Outbid after the after-raise Open deck' tests/pages.test.ts \
    || fail "pages tests must cover Then Outbid after the after-raise Open deck"
  grep -q 'Then Outbid after the after-raise Open deck' "$test_log" \
    || fail "pages tests must cover Then Outbid after the after-raise Open deck"
  grep -q 'class="cue later-cue"' src/http/pages.ts \
    || fail "later-rank cue must scan Open deck before \$bid"
  grep -q 'data-later-deck="true"' src/http/pages.ts \
    || fail "later-rank cue must stamp data-later-deck"
  grep -q 'data-open-later="true"' src/http/pages.ts \
    || fail "later-rank Open deck must stamp data-open-later"
  grep -q 'class="open-deck open-later"' src/http/pages.ts \
    || fail "later-rank Open deck must use the later hop class"
  grep -q 'data-later-deck' src/views/skin.ts \
    || fail "later-rank Open deck must be styled ahead of \$bid"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'later-deck|open-later'; then
    fail "unpaid cue must not stamp a later-rank Open deck hop"
  fi
  if grep -n 'raiseAfter: listing.rank === 1' -A 4 src/http/pages.ts | grep -q 'later: listing.rank === 1'; then
    fail "later-rank hop must not reuse the #1 cue"
  fi
  grep -q 'occupied later ranks stamp Open deck' tests/pages.test.ts \
    || fail "pages tests must cover later-rank Open deck hop"
  grep -q 'later ranks stamp Open deck' "$test_log" \
    || fail "pages tests must cover later-rank Open deck hop"
  grep -q 'class="cue open-one-cue"' src/http/pages.ts \
    || fail "#1 cue must scan Open deck before \$bid when later decks exist"
  grep -q 'data-open-one-first="true"' src/http/pages.ts \
    || fail "#1 cue must stamp data-open-one-first when later decks exist"
  grep -q 'data-open-one="true"' src/http/pages.ts \
    || fail "#1 Open deck must stamp data-open-one when later decks exist"
  grep -q 'class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"' src/http/pages.ts \
    || fail "#1 Open deck must use the concentrated hop class"
  grep -q 'data-open-one-first' src/views/skin.ts \
    || fail "#1 Open deck must be styled ahead of \$bid when later decks exist"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'open-one|open-one-first'; then
    fail "unpaid cue must not stamp a #1 Open deck hop"
  fi
  if grep -n 'later: listing.rank > 1' -A 2 src/http/pages.ts | grep -q 'openOne: listing.rank > 1'; then
    fail "#1 Open deck hop must not reuse the later-rank cue"
  fi
  grep -q 'occupied #1 Open deck is the first hop after later decks exist' tests/pages.test.ts \
    || fail "pages tests must cover concentrated #1 Open deck"
  grep -q 'Open deck is the first hop after later decks exist' "$test_log" \
    || fail "pages tests must cover concentrated #1 Open deck"
  grep -q 'data-raise-one-first="true"' src/http/pages.ts \
    || fail "#1 cue must stamp data-raise-one-first when later decks exist"
  grep -q 'data-raise-one="true"' src/http/pages.ts \
    || fail "Then Outbid must stamp data-raise-one when later decks exist"
  grep -q 'class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"' src/http/pages.ts \
    || fail "Then Outbid must use the concentrated raise hop class"
  grep -q 'data-raise-one-first' src/views/skin.ts \
    || fail "Then Outbid must be styled after concentrated Open deck"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'raise-one|raise-one-first'; then
    fail "unpaid cue must not stamp a concentrated Then Outbid hop"
  fi
  if grep -n 'function raiseAfterDeckHop' -A 8 src/http/pages.ts | grep -q 'open-one'; then
    fail "Then Outbid hop must stay a raise hop, not Open deck"
  fi
  grep -q 'occupied #1 Then Outbid is concentrated after Open deck when later decks exist' tests/pages.test.ts \
    || fail "pages tests must cover concentrated Then Outbid after Open deck"
  grep -q 'Then Outbid is concentrated after Open deck' "$test_log" \
    || fail "pages tests must cover concentrated Then Outbid after Open deck"
  grep -q 'data-open-after-raise-one-first="true"' src/http/pages.ts \
    || fail "#1 cue must stamp data-open-after-raise-one-first when later decks exist"
  grep -q 'data-open-after-raise-one="true"' src/http/pages.ts \
    || fail "#1 Open deck must stamp data-open-after-raise-one after Then Outbid is concentrated"
  grep -q 'class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"' src/http/pages.ts \
    || fail "#1 Open deck must use the after-raise concentrate class"
  grep -q 'data-open-after-raise-one-first' src/views/skin.ts \
    || fail "#1 Open deck must be styled after concentrated Then Outbid"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'open-after-raise-one|open-after-raise-one-first'; then
    fail "unpaid cue must not stamp Open deck after Then Outbid"
  fi
  if grep -n 'function raiseAfterDeckHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-one'; then
    fail "Then Outbid hop must stay a raise hop, not Open deck"
  fi
  if grep -n 'function openAfterRaiseHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-one'; then
    fail "later Open deck after Then Outbid must stay the later hop, not the first Open deck"
  fi
  grep -q 'occupied #1 Open deck is concentrated after Then Outbid when later decks exist' tests/pages.test.ts \
    || fail "pages tests must cover concentrated Open deck after Then Outbid"
  grep -q 'Open deck is concentrated after Then Outbid' "$test_log" \
    || fail "pages tests must cover concentrated Open deck after Then Outbid"
  grep -q 'data-raise-after-open-two-first="true"' src/http/pages.ts \
    || fail "#1 cue must stamp data-raise-after-open-two-first when later decks exist"
  grep -q 'data-raise-after-open-two="true"' src/http/pages.ts \
    || fail "Then Outbid must stamp data-raise-after-open-two after Open deck is re-concentrated"
  grep -q 'class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"' src/http/pages.ts \
    || fail "Then Outbid must use the re-concentrated raise hop class"
  grep -q 'data-raise-after-open-two-first' src/views/skin.ts \
    || fail "Then Outbid must be styled after re-concentrated Open deck"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'raise-after-open-two|raise-after-open-two-first'; then
    fail "unpaid cue must not stamp a re-concentrated Then Outbid hop"
  fi
  if grep -n 'function raiseAfterDeckHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-one'; then
    fail "Then Outbid hop must stay a raise hop, not Open deck"
  fi
  if grep -n 'function openAfterRaiseHop' -A 8 src/http/pages.ts | grep -q 'raise-after-open-two'; then
    fail "later Open deck after Then Outbid must stay a deck hop, not Then Outbid"
  fi
  if grep -n 'function raiseAfterOpenHop' -A 8 src/http/pages.ts | grep -q 'raise-after-open-two'; then
    fail "later Then Outbid after Open deck must stay the later hop, not the first Then Outbid"
  fi
  grep -q 'occupied #1 Then Outbid is concentrated after Open deck is re-concentrated' tests/pages.test.ts \
    || fail "pages tests must cover Then Outbid after Open deck is re-concentrated"
  grep -q 'Then Outbid is concentrated after Open deck is re-concentrated' "$test_log" \
    || fail "pages tests must cover Then Outbid after Open deck is re-concentrated"
  grep -q 'data-open-after-raise-two-first="true"' src/http/pages.ts \
    || fail "#1 cue must stamp data-open-after-raise-two-first when later decks exist"
  grep -q 'data-open-after-raise-two="true"' src/http/pages.ts \
    || fail "#1 Open deck must stamp data-open-after-raise-two after Then Outbid is re-concentrated"
  grep -q 'class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"' src/http/pages.ts \
    || fail "#1 Open deck must use the re-concentrated hop class"
  grep -q 'data-open-after-raise-two-first' src/views/skin.ts \
    || fail "#1 Open deck must be styled after Then Outbid is re-concentrated"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'open-after-raise-two|open-after-raise-two-first'; then
    fail "unpaid cue must not stamp Open deck after Then Outbid is re-concentrated"
  fi
  if grep -n 'function raiseAfterDeckHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-two'; then
    fail "Then Outbid hop must stay a raise hop, not Open deck"
  fi
  if grep -n 'function openAfterRaiseHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-two'; then
    fail "later Open deck after Then Outbid must stay the later hop, not the first Open deck"
  fi
  if grep -n 'function raiseAfterOpenHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-two'; then
    fail "later Then Outbid after Open deck must stay a raise hop, not Open deck"
  fi
  grep -q 'occupied #1 Open deck is concentrated after Then Outbid is re-concentrated' tests/pages.test.ts \
    || fail "pages tests must cover Open deck after Then Outbid is re-concentrated"
  grep -q 'Open deck is concentrated after Then Outbid is re-concentrated' "$test_log" \
    || fail "pages tests must cover Open deck after Then Outbid is re-concentrated"
  grep -q 'data-raise-after-open-three-first="true"' src/http/pages.ts \
    || fail "#1 cue must stamp data-raise-after-open-three-first when later decks exist"
  grep -q 'data-raise-after-open-three="true"' src/http/pages.ts \
    || fail "Then Outbid must stamp data-raise-after-open-three after Open deck is re-concentrated again"
  grep -q 'class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"' src/http/pages.ts \
    || fail "Then Outbid must use the raise-after-open-three hop class"
  grep -q 'data-raise-after-open-three-first' src/views/skin.ts \
    || fail "Then Outbid must be styled after Open deck is re-concentrated again"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'raise-after-open-three|raise-after-open-three-first'; then
    fail "unpaid cue must not stamp Then Outbid after Open deck is re-concentrated again"
  fi
  if grep -n 'function raiseAfterDeckHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-two'; then
    fail "Then Outbid hop must stay a raise hop, not Open deck"
  fi
  if grep -n 'function openAfterRaiseHop' -A 8 src/http/pages.ts | grep -q 'raise-after-open-three'; then
    fail "later Open deck after Then Outbid must stay a deck hop, not Then Outbid"
  fi
  if grep -n 'function raiseAfterOpenHop' -A 8 src/http/pages.ts | grep -q 'raise-after-open-three'; then
    fail "later Then Outbid after Open deck must stay the later hop, not the first Then Outbid"
  fi
  grep -q 'occupied #1 Then Outbid is concentrated after Open deck is re-concentrated again' tests/pages.test.ts \
    || fail "pages tests must cover Then Outbid after Open deck is re-concentrated again"
  grep -q 'Then Outbid is concentrated after Open deck is re-concentrated again' "$test_log" \
    || fail "pages tests must cover Then Outbid after Open deck is re-concentrated again"
  grep -q 'data-open-after-raise-three-first="true"' src/http/pages.ts \
    || fail "#1 cue must stamp data-open-after-raise-three-first when later decks exist"
  grep -q 'data-open-after-raise-three="true"' src/http/pages.ts \
    || fail "#1 Open deck must stamp data-open-after-raise-three after Then Outbid is re-concentrated again"
  grep -q 'class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"' src/http/pages.ts \
    || fail "#1 Open deck must use the open-after-raise-three hop class"
  grep -q 'data-open-after-raise-three-first' src/views/skin.ts \
    || fail "#1 Open deck must be styled after Then Outbid is re-concentrated again"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'open-after-raise-three|open-after-raise-three-first'; then
    fail "unpaid cue must not stamp Open deck after Then Outbid is re-concentrated again"
  fi
  if grep -n 'function raiseAfterDeckHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-three'; then
    fail "Then Outbid hop must stay a raise hop, not Open deck"
  fi
  if grep -n 'function openAfterRaiseHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-three'; then
    fail "later Open deck after Then Outbid must stay the later hop, not the first Open deck"
  fi
  if grep -n 'function raiseAfterOpenHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-three'; then
    fail "later Then Outbid after Open deck must stay a raise hop, not Open deck"
  fi
  grep -q 'occupied #1 Open deck is concentrated after Then Outbid is re-concentrated again' tests/pages.test.ts \
    || fail "pages tests must cover Open deck after Then Outbid is re-concentrated again"
  grep -q 'Open deck is concentrated after Then Outbid is re-concentrated again' "$test_log" \
    || fail "pages tests must cover Open deck after Then Outbid is re-concentrated again"
  grep -q 'data-raise-after-open-four-first="true"' src/http/pages.ts \
    || fail "#1 cue must stamp data-raise-after-open-four-first when later decks exist"
  grep -q 'data-raise-after-open-four="true"' src/http/pages.ts \
    || fail "Then Outbid must stamp data-raise-after-open-four after Open deck is re-concentrated again"
  grep -q 'class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"' src/http/pages.ts \
    || fail "Then Outbid must use the raise-after-open-four hop class"
  grep -q 'data-raise-after-open-four-first' src/views/skin.ts \
    || fail "Then Outbid must be styled after Open deck is re-concentrated again"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'raise-after-open-four|raise-after-open-four-first'; then
    fail "unpaid cue must not stamp Then Outbid after Open deck is re-concentrated again"
  fi
  if grep -n 'function raiseAfterDeckHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-three'; then
    fail "Then Outbid hop must stay a raise hop, not Open deck"
  fi
  if grep -n 'function openAfterRaiseHop' -A 8 src/http/pages.ts | grep -q 'raise-after-open-four'; then
    fail "later Open deck after Then Outbid must stay a deck hop, not Then Outbid"
  fi
  if grep -n 'function raiseAfterOpenHop' -A 8 src/http/pages.ts | grep -q 'raise-after-open-four'; then
    fail "later Then Outbid after Open deck must stay the later hop, not the first Then Outbid"
  fi
  grep -q 'occupied #1 Then Outbid is concentrated after Open deck is re-concentrated four' tests/pages.test.ts \
    || fail "pages tests must cover Then Outbid after Open deck is re-concentrated four"
  grep -q 'Then Outbid is concentrated after Open deck is re-concentrated four' "$test_log" \
    || fail "pages tests must cover Then Outbid after Open deck is re-concentrated four"
  grep -q 'data-open-after-raise-four-first="true"' src/http/pages.ts \
    || fail "#1 cue must stamp data-open-after-raise-four-first when later decks exist"
  grep -q 'data-open-after-raise-four="true"' src/http/pages.ts \
    || fail "#1 Open deck must stamp data-open-after-raise-four after Then Outbid is re-concentrated four"
  grep -q 'class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"' src/http/pages.ts \
    || fail "#1 Open deck must use the open-after-raise-four hop class"
  grep -q 'data-open-after-raise-four-first' src/views/skin.ts \
    || fail "#1 Open deck must be styled after Then Outbid is re-concentrated four"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'open-after-raise-four|open-after-raise-four-first'; then
    fail "unpaid cue must not stamp Open deck after Then Outbid is re-concentrated four"
  fi
  if grep -n 'function raiseAfterDeckHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-four'; then
    fail "Then Outbid hop must stay a raise hop, not Open deck"
  fi
  if grep -n 'function openAfterRaiseHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-four'; then
    fail "later Open deck after Then Outbid must stay the later hop, not the first Open deck"
  fi
  if grep -n 'function raiseAfterOpenHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-four'; then
    fail "later Then Outbid after Open deck must stay a raise hop, not Open deck"
  fi
  grep -q 'occupied #1 Open deck is concentrated after Then Outbid is re-concentrated four' tests/pages.test.ts \
    || fail "pages tests must cover Open deck after Then Outbid is re-concentrated four"
  grep -q 'Open deck is concentrated after Then Outbid is re-concentrated four' "$test_log" \
    || fail "pages tests must cover Open deck after Then Outbid is re-concentrated four"
  grep -q 'data-raise-after-open-five-first="true"' src/http/pages.ts \
    || fail "#1 cue must stamp data-raise-after-open-five-first when later decks exist"
  grep -q 'data-raise-after-open-five="true"' src/http/pages.ts \
    || fail "Then Outbid must stamp data-raise-after-open-five after Open deck is re-concentrated again"
  grep -q 'class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"' src/http/pages.ts \
    || fail "Then Outbid must use the raise-after-open-five hop class"
  grep -q 'data-raise-after-open-five-first' src/views/skin.ts \
    || fail "Then Outbid must be styled after Open deck is re-concentrated again"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'raise-after-open-five|raise-after-open-five-first'; then
    fail "unpaid cue must not stamp Then Outbid after Open deck is re-concentrated again"
  fi
  if grep -n 'function raiseAfterDeckHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-four'; then
    fail "Then Outbid hop must stay a raise hop, not Open deck"
  fi
  if grep -n 'function openAfterRaiseHop' -A 8 src/http/pages.ts | grep -q 'raise-after-open-five'; then
    fail "later Open deck after Then Outbid must stay a deck hop, not Then Outbid"
  fi
  if grep -n 'function raiseAfterOpenHop' -A 8 src/http/pages.ts | grep -q 'raise-after-open-five'; then
    fail "later Then Outbid after Open deck must stay the later hop, not the first Then Outbid"
  fi
  grep -q 'occupied #1 Then Outbid is concentrated after Open deck is re-concentrated five' tests/pages.test.ts \
    || fail "pages tests must cover Then Outbid after Open deck is re-concentrated five"
  grep -q 'Then Outbid is concentrated after Open deck is re-concentrated five' "$test_log" \
    || fail "pages tests must cover Then Outbid after Open deck is re-concentrated five"
  grep -q 'data-open-after-raise-five-first="true"' src/http/pages.ts \
    || fail "#1 cue must stamp data-open-after-raise-five-first when later decks exist"
  grep -q 'data-open-after-raise-five="true"' src/http/pages.ts \
    || fail "#1 Open deck must stamp data-open-after-raise-five after Then Outbid is re-concentrated five"
  grep -q 'class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"' src/http/pages.ts \
    || fail "#1 Open deck must use the open-after-raise-five hop class"
  grep -q 'data-open-after-raise-five-first' src/views/skin.ts \
    || fail "#1 Open deck must be styled after Then Outbid is re-concentrated five"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'open-after-raise-five|open-after-raise-five-first'; then
    fail "unpaid cue must not stamp Open deck after Then Outbid is re-concentrated five"
  fi
  if grep -n 'function raiseAfterDeckHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-five'; then
    fail "Then Outbid hop must stay a raise hop, not Open deck"
  fi
  if grep -n 'function openAfterRaiseHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-five'; then
    fail "later Open deck after Then Outbid must stay the later hop, not the first Open deck"
  fi
  if grep -n 'function raiseAfterOpenHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-five'; then
    fail "later Then Outbid after Open deck must stay a raise hop, not Open deck"
  fi
  grep -q 'occupied #1 Open deck is concentrated after Then Outbid is re-concentrated five' tests/pages.test.ts \
    || fail "pages tests must cover Open deck after Then Outbid is re-concentrated five"
  grep -q 'Open deck is concentrated after Then Outbid is re-concentrated five' "$test_log" \
    || fail "pages tests must cover Open deck after Then Outbid is re-concentrated five"
  grep -q 'data-raise-after-open-six-first="true"' src/http/pages.ts \
    || fail "#1 cue must stamp data-raise-after-open-six-first when later decks exist"
  grep -q 'data-raise-after-open-six="true"' src/http/pages.ts \
    || fail "Then Outbid must stamp data-raise-after-open-six after Open deck is re-concentrated again"
  grep -q 'class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"' src/http/pages.ts \
    || fail "Then Outbid must use the raise-after-open-six hop class"
  grep -q 'data-raise-after-open-six-first' src/views/skin.ts \
    || fail "Then Outbid must be styled after Open deck is re-concentrated again"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'raise-after-open-six|raise-after-open-six-first'; then
    fail "unpaid cue must not stamp Then Outbid after Open deck is re-concentrated again"
  fi
  if grep -n 'function raiseAfterDeckHop' -A 8 src/http/pages.ts | grep -q 'open-after-raise-five'; then
    fail "Then Outbid hop must stay a raise hop, not Open deck"
  fi
  if grep -n 'function openAfterRaiseHop' -A 8 src/http/pages.ts | grep -q 'raise-after-open-six'; then
    fail "later Open deck after Then Outbid must stay a deck hop, not Then Outbid"
  fi
  if grep -n 'function raiseAfterOpenHop' -A 8 src/http/pages.ts | grep -q 'raise-after-open-six'; then
    fail "later Then Outbid after Open deck must stay the later hop, not the first Then Outbid"
  fi
  grep -q 'occupied #1 Then Outbid is concentrated after Open deck is re-concentrated six' tests/pages.test.ts \
    || fail "pages tests must cover Then Outbid after Open deck is re-concentrated six"
  grep -q 'Then Outbid is concentrated after Open deck is re-concentrated six' "$test_log" \
    || fail "pages tests must cover Then Outbid after Open deck is re-concentrated six"
  grep -q 'data-prize-first="true"' src/http/pages.ts \
    || fail "occupied #1 must stamp data-prize-first"
  grep -q 'data-prize-first' src/views/skin.ts \
    || fail "occupied #1 prize must be styled ahead of \$bid"
  grep -q 'listing\[data-prize-first\] .company' src/views/skin.ts \
    || fail "occupied #1 pitch title must read larger than \$bid"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -q 'prize-first'; then
    fail "unpaid cue must not stamp prize-first"
  fi
  if grep -n 'later: listing.rank > 1' -A 2 src/http/pages.ts | grep -q 'prizeFirst: listing.rank > 1'; then
    fail "later ranks must stay quieter than occupied #1 prize"
  fi
  grep -q 'occupied #1 pitch title reads first and larger than $bid' tests/pages.test.ts \
    || fail "pages tests must cover prize before price on occupied #1"
  grep -q 'pitch title reads first and larger than $bid' "$test_log" \
    || fail "pages tests must cover prize before price on occupied #1"
  grep -q 'function prizeLaterFact' src/http/pages.ts \
    || fail "occupied #1 money must live in prizeLaterFact, not a Bid seat"
  grep -q 'class="rank later-fact" data-later-fact="true"' src/http/pages.ts \
    || fail "occupied #1 must stamp \$bid as a later fact after the pitch title"
  grep -q 'rank.later-fact\[data-later-fact\]' src/views/skin.ts \
    || fail "CSS must keep occupied #1 \$bid a later fact after the pitch title"
  if awk '/^function prizeLaterFact/,/^function bidSeat/' src/http/pages.ts | grep -q 'class="seat"'; then
    fail "occupied #1 later-fact money must not sit in a Bid seat"
  fi
  if awk '/^function prizeLaterFact/,/^function bidSeat/' src/http/pages.ts | grep -q 'cue-label">Bid'; then
    fail "occupied #1 later-fact money must not use cue-label Bid"
  fi
  if grep -n 'function renderUnranked' -A 14 src/http/pages.ts | grep -q 'later-fact'; then
    fail "unpaid cue must not stamp \$bid as a later fact"
  fi
  if awk '/^function prizeLaterFact/,/^function bidSeat/' src/http/pages.ts | grep -q 'open-deck'; then
    fail "later-fact \$bid must stay money, not a second hop"
  fi
  if awk '/prizeFirst && openOne/,/: prizeFirst/' src/http/pages.ts | grep -q 'bidSeat'; then
    fail "occupied #1 must not keep a Bid seat beside the pitch title"
  fi
  if awk '/^export const HOUSE_CSS/{p=1} p{print} /^export const OCCUPIED_CSS/{exit}' src/views/skin.ts \
    | grep -Eq 'data-later-fact|later-fact'; then
    fail "HOUSE_CSS must not contain later-fact chrome"
  fi
  grep -q 'occupied #1 pitch title stays the prize — Bid seat is not beside the title' tests/pages.test.ts \
    || fail "pages tests must keep occupied #1 money off the Bid seat"
  grep -q 'Bid seat is not beside the title' "$test_log" \
    || fail "pages tests must keep occupied #1 money off the Bid seat"
  grep -q 'data-off-board="true"' src/http/pages.ts \
    || fail "unpaid cue must stamp data-off-board"
  grep -q 'Not on the board' src/http/pages.ts \
    || fail "unpaid cue must say Not on the board"
  grep -q 'class="cue off-board-cue"' src/http/pages.ts \
    || fail "unpaid cue must use the off-board cue"
  grep -q 'data-off-board-list="true"' src/http/pages.ts \
    || fail "unpaid decks must sit in the off-board list, not the ranked board"
  grep -q 'aside class="off-board"' src/http/pages.ts \
    || fail "unpaid decks must render as an off-board aside"
  grep -q 'class="off-board-list"' src/http/pages.ts \
    || fail "unpaid decks must not sit in the ranked listings list"
  grep -q 'data-off-board' src/views/skin.ts \
    || fail "unpaid off-board cue must be styled off the seat"
  grep -q '.off-board {' src/views/skin.ts \
    || fail "off-board list must be styled off the ranked listings"
  grep -q '.off-board-list' src/views/skin.ts \
    || fail "off-board list must not reuse ranked listings chrome"
  if grep -n 'function renderUnranked' -A 14 src/http/pages.ts | grep -q 'class="seat"'; then
    fail "unpaid cue must not take a ranked seat"
  fi
  if grep -n 'function renderUnranked' -A 14 src/http/pages.ts | grep -q 'cue-label">Bid'; then
    fail "unpaid cue must not label a Bid seat"
  fi
  if grep -n 'function renderRanked' -A 18 src/http/pages.ts | grep -q 'off-board'; then
    fail "paid ranks must not stamp off-board"
  fi
  grep -q 'unpaid cue stays off the board and does not take a seat' tests/pages.test.ts \
    || fail "pages tests must cover unpaid off-board"
  grep -q 'unpaid cue stays off the board' "$test_log" \
    || fail "pages tests must cover unpaid off-board"
  grep -q 'data-off-board-list' tests/pages.test.ts \
    || fail "pages tests must keep unpaid decks off the ranked listings"
  grep -q 'export const HOUSE_CSS' src/views/skin.ts \
    || fail "empty house must export HOUSE_CSS"
  grep -q 'export const OCCUPIED_CSS' src/views/skin.ts \
    || fail "occupied / unpaid chrome must live in OCCUPIED_CSS"
  grep -q 'emptyHouse' src/http/pages.ts \
    || fail "empty / must choose the house sheet"
  grep -q 'data-empty-house="true"' src/http/pages.ts \
    || fail "empty / must stamp data-empty-house"
  if grep -n 'emptyHouse === true ? HOUSE_CSS' -A 0 src/http/pages.ts | grep -q 'OCCUPIED_CSS'; then
    fail "empty house must not ship occupied CSS"
  fi
  if awk '/^export const HOUSE_CSS/{p=1} p{print} /^export const OCCUPIED_CSS/{exit}' src/views/skin.ts \
    | grep -Eq 'data-prize-first|data-later-fact|later-fact|data-off-board|off-board-cue'; then
    fail "HOUSE_CSS must not contain occupied / unpaid chrome"
  fi
  if awk '/^export const HOUSE_CSS/{p=1} p{print} /^export const OCCUPIED_CSS/{exit}' src/views/skin.ts \
    | grep -Eq 'data-raise-difference|data-raise-charge|raise-charge'; then
    fail "HOUSE_CSS must not stamp raise-difference chrome"
  fi
  grep -q '.claim-note .raise-charge' src/views/skin.ts \
    || fail "occupied raise charge must be styled on the claim"
  grep -q 'empty house stays empty' tests/pages.test.ts \
    || fail "pages tests must cover empty house stays empty"
  grep -q 'empty house stays empty' "$test_log" \
    || fail "pages tests must cover empty house stays empty"
  grep -q 'data-empty-claim-first="true"' src/http/pages.ts \
    || fail "empty house must stamp data-empty-claim-first"
  grep -q 'class="empty-claim-first"' src/http/pages.ts \
    || fail "empty house must use the empty-claim-first class"
  grep -q 'data-first-click="claim"' src/http/pages.ts \
    || fail "empty house must stamp Claim #1 as the first click"
  grep -q 'Claim #1' src/http/pages.ts \
    || fail "empty house must name Claim #1"
  grep -q 'data-later-write="true"' src/http/pages.ts \
    || fail "empty house must stamp deck identity as a later write"
  grep -q 'data-deck-identity="true"' src/http/pages.ts \
    || fail "empty house must stamp deck identity"
  grep -q 'Then the deck' src/http/pages.ts \
    || fail "empty house must write the deck after Claim #1"
  grep -q 'data-empty-claim-first' src/views/skin.ts \
    || fail "empty Claim #1 must be composed in HOUSE_CSS"
  grep -q 'data-later-write' src/views/skin.ts \
    || fail "later deck write must be composed in HOUSE_CSS"
  if grep -n 'function renderUnranked' -A 14 src/http/pages.ts | grep -Eq 'empty-claim-first|data-first-click="claim"|later-write|deck-identity'; then
    fail "unpaid cue must not stamp empty Claim #1"
  fi
  if awk '/const form = emptyRoom/,/: `<form id="bid-form"/' src/http/pages.ts | grep -q 'class="bid-row"'; then
    fail "empty house must not keep Company/URL in the same claim row as Outbid"
  fi
  if awk '/const claimRow = emptyRoom/,/const form = emptyRoom/' src/http/pages.ts | grep -Eq 'name="company"|name="url"|name="oneLiner"'; then
    fail "empty Claim #1 row must not include deck identity fields"
  fi
  if grep -n 'class="bid-row"' -A 6 src/http/pages.ts | grep -Eq 'data-first-click="claim"|later-write|Claim #1'; then
    fail "occupied bid-row must not stamp empty Claim #1"
  fi
  grep -q 'empty house first click is Claim #1' "$test_log" \
    || fail "pages tests must cover empty-house Claim #1 first click"
  grep -q 'deck identity is a later write' "$test_log" \
    || fail "pages tests must cover deck identity as a later write"
  if grep -Eqi 'polar\.(sh|in)|api\.polar' "$test_log"; then
    fail "unit tests must not call live Polar hosts"
  fi
fi

echo "OK: buildable and testable"
