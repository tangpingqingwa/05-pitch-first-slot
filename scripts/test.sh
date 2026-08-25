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
  grep -q 'ROLLING_WEEK_MS' src/core/week.ts || fail "week.ts must export a rolling last-7-days window"
  grep -q 'bidInRollingWeek' src/core/week.ts || fail "week.ts must test paidAt against the rolling week"
  grep -q 'getBidInRollingWeek' src/core/rank.ts \
    || fail "rank.ts must quote against the rolling last-7-days window"
  grep -q 'bidInRollingWeek' src/core/rank.ts \
    || fail "rankedBoard must filter by rolling paidAt, not Monday weekId"
  grep -q '/listings/:id/bids' src/http/bids.ts \
    || fail "bids route missing POST /listings/:id/bids"
  grep -q 'createCheckout' src/http/bids.ts \
    || fail "bids route must start Polar checkout"
  if grep -Rqi 'polar_live' src/http/bids.ts; then
    fail "HTTP bids must not import the live Polar client"
  fi
  if grep -qi 'polar' src/core/rank.ts src/core/week.ts; then
    fail "core rank/week must not import Polar"
  fi
  grep -q 'Monday' tests/week.test.ts || fail "week tests must cover Monday UTC reset"
  grep -q 'rolling last-7-days' tests/week.test.ts \
    || fail "week tests must cover rolling last-7-days window"
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
  grep -q 'rolling last 7 days' src/http/pages.ts \
    || fail "pages must state the rolling last-7-days house window"
  grep -q 'data-rolling-week="true"' src/http/pages.ts \
    || fail "occupied / empty / must stamp data-rolling-week"
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
  grep -q 'rolling last-7-days' "$test_log" \
    || fail "week tests must cover rolling last-7-days window"
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
  grep -q 'data-raise-difference="true"' src/http/pages.ts \
    || fail "occupied raise must stamp data-raise-difference on the claim"
  grep -q 'data-raise-charge="true"' src/http/pages.ts \
    || fail "occupied raise must stamp Polar's difference charge"
  grep -q 'data-raise-charge-usd' src/http/pages.ts \
    || fail "occupied raise must show Polar's difference dollars"
  grep -q 'Polar charges $<span data-raise-charge-usd>' src/http/pages.ts \
    || fail "occupied claim must keep Polar raise-pays-difference dollars"
  grep -q 'only the difference, not a new bid' src/http/pages.ts \
    || fail "checkout return must still name only the difference, not a new bid"
  if grep -n 'data-occupied-raise' -A 6 src/http/pages.ts | grep -q 'The $ you type is the public bid'; then
    fail "occupied claim must not lecture the dashed \$amount over ± Outbid"
  fi
  if grep -n 'data-occupied-raise' -A 6 src/http/pages.ts | grep -q 'New deck: Polar'; then
    fail "occupied claim must not lecture New deck Polar over ± Outbid"
  fi
  if grep -n 'data-occupied-raise' -A 6 src/http/pages.ts | grep -q 'Sunday pay raised Monday'; then
    fail "occupied claim must not restamp checkout Sunday→Monday copy"
  fi
  if grep -n 'data-occupied-raise' -A 8 src/http/pages.ts | grep -q 'Same deck URL raises this row'; then
    fail "occupied claim hint must not lecture Same deck URL over Outbid"
  fi
  if grep -n 'function raiseAfterDeckHop' -A 12 src/http/pages.ts | grep -Eq 'New deck: Polar|Sunday pay raised Monday'; then
    fail "must not put Polar lecture on the #1 cue"
  fi
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
    || fail "later-rank cue must scan company then Bid then later Open foot"
  grep -q 'data-later-deck="true"' src/http/pages.ts \
    || fail "later-rank cue must stamp data-later-deck"
  grep -q 'data-open-later="true"' src/http/pages.ts \
    || fail "later-rank Open deck must stamp data-open-later"
  grep -q 'function laterOpenFoot' src/http/pages.ts \
    || fail "later-rank Open must live in laterOpenFoot, not filled open-deck"
  grep -q 'class="later-open-foot" data-later-open-foot="true"' src/http/pages.ts \
    || fail "later-rank Open must sit in later-open-foot, not a filled deck hop"
  grep -q 'class="open-later"' src/http/pages.ts \
    || fail "later-rank Open must use the later hop class"
  if grep -n 'function laterOpenFoot' -A 10 src/http/pages.ts | grep -q 'open-deck'; then
    fail "later-rank Open foot must not reuse filled open-deck"
  fi
  grep -q 'data-later-open-foot' src/views/skin.ts \
    || fail "later-rank Open foot must be styled quieter than #1 Open"
  grep -q 'data-later-deck' src/views/skin.ts \
    || fail "later-rank Open deck must be styled ahead of \$bid"
  if grep -n 'function renderUnranked' -A 12 src/http/pages.ts | grep -Eq 'later-deck|open-later|later-open-foot'; then
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
  grep -q 'house-occupied\[data-occupied-house\] .listing\[data-prize-first\] .company' src/views/skin.ts \
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
  grep -q 'house-occupied\[data-occupied-house\] .listing\[data-prize-first\] .rank.later-fact\[data-later-fact\]' src/views/skin.ts \
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
    | grep -E 'data-later-fact|later-fact' | grep -v 'house-empty\[data-empty-house\]' | grep -v 'listings-later'; then
    fail "HOUSE_CSS must not style later-fact chrome — only hide a leak"
  fi
  if awk '/^export const HOUSE_CSS/{p=1} p{print} /^export const OCCUPIED_CSS/{exit}' src/views/skin.ts \
    | grep -E 'data-later-seat|listings-later|data-later-open-foot|later-open-foot|data-first-click="open"|data-claim-after-slot' \
    | grep -v 'house-empty\[data-empty-house\]'; then
    fail "HOUSE_CSS must not style later Bid seats / occupied Open / Claim-after-slot — only hide a leak"
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
  grep -q 'class="house house-empty" data-empty-house="true"' src/http/pages.ts \
    || fail "empty / must wrap in house-empty"
  grep -q 'class="house house-occupied" data-occupied-house="true"' src/http/pages.ts \
    || fail "occupied / must wrap in house-occupied"
  grep -q 'occupiedHouse = ranked.length > 0' src/http/pages.ts \
    || fail "occupied / must stamp occupiedHouse only after a paid rank"
  if grep -q 'occupiedHouse: !emptyRoom' src/http/pages.ts; then
    fail "occupied house must not wrap unpaid-only / as occupied"
  fi
  grep -q 'opening slot is paid only' tests/pages.test.ts \
    || fail "pages tests must cover unpaid Polar checkout staying off the opening slot"
  grep -q 'opening slot is paid only' "$test_log" \
    || fail "pages tests must cover unpaid Polar checkout staying off the opening slot"
  grep -q 'doesNotMatch(boardMarkup(html), /data-occupied-house/)' tests/pages.test.ts \
    || fail "unpaid-only / must not wrap in occupied house"
  grep -q "doesNotMatch(html, /<ul class=\"listings\" aria-label=\"This week's opening slot\"/" tests/pages.test.ts \
    || fail "unpaid Polar checkout must not print as the opening slot"
  grep -F -q '.house-occupied[data-occupied-house] .listing[data-prize-first] .company' src/views/skin.ts \
    || fail "prize-first CSS must be scoped to the occupied house"
  grep -F -q '.house-occupied[data-occupied-house] .listing[data-prize-first] .rank.later-fact[data-later-fact]' src/views/skin.ts \
    || fail "later-fact CSS must be scoped to the occupied house"
  grep -F -q '.house-empty[data-empty-house] [data-prize-first]' src/views/skin.ts \
    || fail "empty house must hide leaked prize-first chrome"
  grep -F -q '.house-empty[data-empty-house] [data-later-fact]' src/views/skin.ts \
    || fail "empty house must hide leaked later-fact chrome"
  grep -F -q '.house-empty[data-empty-house] .later-fact' src/views/skin.ts \
    || fail "empty house must hide leaked later-fact class"
  grep -F -q '.house-empty[data-empty-house] [data-later-seat]' src/views/skin.ts \
    || fail "empty house must hide leaked later Bid seats"
  grep -F -q '.house-empty[data-empty-house] [data-later-seats]' src/views/skin.ts \
    || fail "empty house must hide leaked later-seat lists"
  grep -F -q '.house-empty[data-empty-house] .listings-later' src/views/skin.ts \
    || fail "empty house must hide leaked listings-later"
  grep -F -q '.house-empty[data-empty-house] [data-later-open-foot]' src/views/skin.ts \
    || fail "empty house must hide leaked later Open foot"
  grep -F -q '.house-empty[data-empty-house] .later-open-foot' src/views/skin.ts \
    || fail "empty house must hide leaked later-open-foot class"
  grep -F -q '.house-empty[data-empty-house] [data-first-click="open"]' src/views/skin.ts \
    || fail "empty house must hide leaked occupied Open first click"
  grep -F -q '.house-empty[data-empty-house] [data-claim-after-slot]' src/views/skin.ts \
    || fail "empty house must hide leaked occupied Claim-after-slot chrome"
  if grep -E '^\.listing\[data-prize-first\] \.company' src/views/skin.ts; then
    fail "prize-first CSS must not apply outside house-occupied"
  fi
  if grep -E '^\.listing\[data-prize-first\] \.rank\.later-fact' src/views/skin.ts; then
    fail "later-fact CSS must not apply outside house-occupied"
  fi
  if grep -n 'emptyHouse === true ? HOUSE_CSS' -A 0 src/http/pages.ts | grep -q 'OCCUPIED_CSS'; then
    fail "empty house must not ship occupied CSS"
  fi
  if awk '/^export const HOUSE_CSS/{p=1} p{print} /^export const OCCUPIED_CSS/{exit}' src/views/skin.ts \
    | grep -Eq 'data-off-board|off-board-cue'; then
    fail "HOUSE_CSS must not contain occupied / unpaid chrome"
  fi
  if awk '/^export const HOUSE_CSS/{p=1} p{print} /^export const OCCUPIED_CSS/{exit}' src/views/skin.ts \
    | grep -E 'data-prize-first|data-later-fact|later-fact' \
    | grep -v 'house-empty\[data-empty-house\]'; then
    fail "HOUSE_CSS must not style prize-first / later-fact — only hide a leak"
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
  grep -q 'prize-first / later-fact \$bid cannot leak' tests/pages.test.ts \
    || fail "pages tests must cover prize-first / later-fact cannot leak onto empty /"
  grep -q 'prize-first / later-fact \$bid cannot leak' "$test_log" \
    || fail "pages tests must cover prize-first / later-fact cannot leak onto empty /"
  grep -q 'doesNotMatch(empty, /data-occupied-house/)' tests/pages.test.ts \
    || fail "empty / must not wrap in occupied house"
  grep -q 'doesNotMatch(boardMarkup(occupied), /data-empty-house/)' tests/pages.test.ts \
    || fail "occupied / must not wrap in empty house"
  grep -q 'function laterBidSeat' src/http/pages.ts \
    || fail "later Bid seats must live in laterBidSeat, not steal occupied #1 Open"
  grep -q 'class="seat later-seat" data-later-seat="true"' src/http/pages.ts \
    || fail "later Bid seats must stamp data-later-seat"
  grep -q 'class="listings listings-later"' src/http/pages.ts \
    || fail "later Bid seats must sit in listings-later, after occupied #1"
  grep -q 'data-later-seats="true"' src/http/pages.ts \
    || fail "later Bid seats must stamp data-later-seats on the later list"
  grep -q "aria-label=\"This week's opening slot\"" src/http/pages.ts \
    || fail "occupied #1 list must name this week's opening slot"
  grep -q 'aria-label="Later seats this week"' src/http/pages.ts \
    || fail "later Bid seats must name Later seats this week"
  grep -q 'data-first-click="open"' src/http/pages.ts \
    || fail "occupied #1 Open must be the first founder click"
  grep -F -q '.house-occupied[data-occupied-house] .listing[data-open-one-first] .open-one[data-first-click="open"]' src/views/skin.ts \
    || fail "occupied #1 Open first click must be styled in the occupied house"
  grep -F -q '.house-occupied[data-occupied-house] .listings-later[data-later-seats] .seat.later-seat[data-later-seat]' src/views/skin.ts \
    || fail "later Bid seats must be quieter than occupied #1 Open"
  grep -F -q '.house-occupied[data-occupied-house] .listings-later[data-later-seats] .later-open-foot[data-later-open-foot] .open-later' src/views/skin.ts \
    || fail "later Open foot must be quieter than occupied #1 Open"
  if grep -n 'function laterOpenFoot' -A 10 src/http/pages.ts | grep -q 'data-open-deck'; then
    fail "later Open foot must not stamp filled data-open-deck"
  fi
  if grep -n 'function laterOpenFoot' -A 10 src/http/pages.ts | grep -q 'data-first-click="open"'; then
    fail "later Open foot must not steal occupied #1 first click"
  fi
  if grep -n 'function renderUnranked' -A 14 src/http/pages.ts | grep -q 'later-seat'; then
    fail "unpaid cue must not stamp a later Bid seat"
  fi
  if grep -n 'function renderUnranked' -A 14 src/http/pages.ts | grep -q 'data-first-click="open"'; then
    fail "unpaid cue must not stamp occupied Open as the first click"
  fi
  if grep -n 'function prizeLaterFact' -A 8 src/http/pages.ts | grep -q 'later-seat'; then
    fail "occupied #1 later-fact money must not sit in a later Bid seat"
  fi
  if awk '/prizeFirst && openOne/,/: prizeFirst/' src/http/pages.ts | grep -q 'laterBidSeat'; then
    fail "occupied #1 must not keep a later Bid seat beside Open"
  fi
  if grep -n 'function laterBidSeat' -A 8 src/http/pages.ts | grep -Eq 'open-deck|open-later'; then
    fail "later Bid seat must stay money, not a second hop"
  fi
  if awk '/^export const HOUSE_CSS/{p=1} p{print} /^export const OCCUPIED_CSS/{exit}' src/views/skin.ts \
    | grep -E 'data-later-seat|listings-later|data-later-open-foot|later-open-foot|data-first-click="open"|data-claim-after-slot' \
    | grep -v 'house-empty\[data-empty-house\]'; then
    fail "HOUSE_CSS must not style later Bid seats / occupied Open / Claim-after-slot — only hide a leak"
  fi
  if grep -E '^\.listings-later' src/views/skin.ts; then
    fail "later Bid seat CSS must stay scoped to house-occupied"
  fi
  grep -q 'occupied #1 Open is the first founder click' tests/pages.test.ts \
    || fail "pages tests must cover occupied #1 Open as the first founder click"
  grep -q 'later Bid seats stay quieter' tests/pages.test.ts \
    || fail "pages tests must cover quieter later Bid seats"
  grep -q 'later Open is a foot hop, not a filled deck' tests/pages.test.ts \
    || fail "pages tests must keep later Open off filled open-deck"
  grep -q 'Open is the first founder click' "$test_log" \
    || fail "pages tests must cover occupied #1 Open as the first founder click"
  grep -q 'later Bid seats stay quieter' "$test_log" \
    || fail "pages tests must cover quieter later Bid seats"
  grep -q 'later Open is a foot hop' "$test_log" \
    || fail "pages tests must cover later Open as a foot hop"
  grep -q 'data-rolling-week="true"' src/http/pages.ts \
    || fail "house must stamp the rolling last-7-days window"
  grep -q 'Rolling last 7 days. Not Monday 00:00 UTC.' src/http/pages.ts \
    || fail "house must name the rolling last-7-days window, not Monday midnight"
  grep -F -q '.house-occupied[data-occupied-house] .claim-note .week-window[data-rolling-week]' src/views/skin.ts \
    || fail "occupied rolling week cue must be composed in occupied CSS"
  grep -q 'occupied week window is rolling last-7-days' tests/pages.test.ts \
    || fail "pages tests must cover occupied rolling last-7-days window"
  grep -q 'rolling last-7-days — not Monday 00:00 UTC' "$test_log" \
    || fail "pages tests must cover occupied rolling last-7-days window"
  grep -q 'data-claim-after-slot="true"' src/http/pages.ts \
    || fail "occupied Claim #1 must stamp data-claim-after-slot after the slot"
  grep -q 'class="claim-after-slot" data-claim-after-slot="true"' src/http/pages.ts \
    || fail "occupied Claim #1 must wrap as claim-after-slot, not a same-weight rail"
  grep -q 'occupiedHouse === true' src/http/pages.ts \
    || fail "Claim-after-slot composition must apply only on the occupied house"
  if grep -n 'body: `${claimChrome' src/http/pages.ts; then
    fail "occupied / must not always mount Claim chrome above the listings"
  fi
  grep -F -q '.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot]' src/views/skin.ts \
    || fail "occupied Claim after the slot must be quieter than Open #1"
  if grep -E '^\.claim-after-slot' src/views/skin.ts; then
    fail "Claim-after-slot CSS must stay scoped to house-occupied"
  fi
  if grep -n 'function renderUnranked' -A 14 src/http/pages.ts | grep -q 'claim-after-slot'; then
    fail "unpaid cue must not stamp Claim-after-slot"
  fi
  if grep -Eq 'raise-after-open-seven|open-after-raise-six' src/http/pages.ts src/views/skin.ts; then
    fail "must not stamp raise-after-open-N / another named hop"
  fi
  grep -q 'occupied house keeps one first click' tests/pages.test.ts \
    || fail "pages tests must cover occupied Open #1 before Claim"
  grep -q 'Claim stays after the slot' tests/pages.test.ts \
    || fail "pages tests must keep Claim #1 after the occupied slot"
  grep -q 'Claim stays after the slot' "$test_log" \
    || fail "pages tests must keep Claim #1 after the occupied slot"
  grep -q 'doesNotMatch(boardMarkup(empty), /data-claim-after-slot/)' tests/pages.test.ts \
    || fail "empty / must not wrap Claim after the slot"
  grep -q 'claimWrapAt > offAt && claimAt > claimWrapAt' tests/pages.test.ts \
    || fail "pages tests must put occupied Claim after Open #1 and the listings"
  grep -q 'data-first-click="claim"' src/http/pages.ts \
    || fail "empty / must stamp Claim / Outbid as the first empty click"
  grep -q 'href="#write"' src/http/pages.ts \
    || fail "empty Outbid must hop to the later write"
  grep -q 'class="bid-form later-write" data-later-write="true"' src/http/pages.ts \
    || fail "empty Company / deck URL / one-liner must wrap as later-write after Outbid"
  grep -q 'id="write"' src/http/pages.ts \
    || fail "empty later write must sit at #write after the Outbid hop"
  grep -q 'emptyRoom === true' src/http/pages.ts \
    || fail "empty Claim-first composition must apply only on the empty house"
  if awk '/emptyRoom === true/,/: `<form id="bid-form" class="bid-form" method/' src/http/pages.ts | grep -q 'bid-row'; then
    fail "empty house must not put Company / deck URL in a bid-row fighting Outbid"
  fi
  grep -q 'class="bid-row"' src/http/pages.ts \
    || fail "occupied Claim must keep Company / deck URL / Outbid in the bid-row"
  grep -F -q '.house-empty[data-empty-house] a.outbid[data-first-click="claim"]' src/views/skin.ts \
    || fail "empty Outbid first click must be composed in the empty house"
  grep -F -q '.house-empty[data-empty-house] .later-write[data-later-write]' src/views/skin.ts \
    || fail "empty later write must sit after Outbid, not same-weight fields"
  grep -F -q '.house-empty[data-empty-house] .later-write[data-later-write] .outbid' src/views/skin.ts \
    || fail "empty later-write Outbid must stay quieter than the first click"
  if grep -E '^\.later-write' src/views/skin.ts; then
    fail "later-write CSS must stay scoped to house-empty"
  fi
  if grep -E '^a\.outbid\[data-first-click="claim"\]' src/views/skin.ts; then
    fail "empty Claim first-click CSS must stay scoped to house-empty"
  fi
  if awk '/^export const HOUSE_CSS/{p=1} p{print} /^export const OCCUPIED_CSS/{exit}' src/views/skin.ts \
    | grep -E 'data-later-write|data-first-click="claim"|#write:target' \
    | grep -v 'house-empty\[data-empty-house\]'; then
    fail "HOUSE_CSS must scope empty Claim-first / later-write to house-empty"
  fi
  if awk '/^export const OCCUPIED_CSS/{p=1} p{print} /^export const BOARD_CSS/{exit}' src/views/skin.ts \
    | grep -Eq 'data-later-write|data-first-click="claim"|#write:target'; then
    fail "OCCUPIED_CSS must not restyle empty Claim-first / later-write"
  fi
  if grep -n 'function renderUnranked' -A 14 src/http/pages.ts | grep -Eq 'later-write|data-first-click="claim"|href="#write"'; then
    fail "unpaid cue must not stamp empty Claim-first later-write"
  fi
  if grep -n 'occupiedHouse === true' -A 8 src/http/pages.ts | grep -Eq 'later-write|data-first-click="claim"'; then
    fail "occupied / must not wrap Claim as empty later-write"
  fi
  grep -q 'empty house keeps one first click' tests/pages.test.ts \
    || fail "pages tests must cover empty Claim / Outbid as the first click"
  grep -q 'Claim / Outbid, then the deck URL' tests/pages.test.ts \
    || fail "pages tests must put empty deck URL after the Outbid hop"
  grep -q 'Claim / Outbid, then the deck URL' "$test_log" \
    || fail "pages tests must cover empty Claim / Outbid then the deck URL"
  grep -q 'doesNotMatch(boardMarkup(empty), /class="bid-row"/)' tests/pages.test.ts \
    || fail "empty / must not keep Company / deck URL in a bid-row with Outbid"
  grep -q 'doesNotMatch(markup, /data-first-click="claim"/)' tests/pages.test.ts \
    || fail "occupied / must not stamp empty Claim as the first click"
  grep -q 'hopAt > bidAt && writeAt > hopAt' tests/pages.test.ts \
    || fail "pages tests must put empty Outbid before the later write"
  if grep -n 'function renderUnranked' -A 14 src/http/pages.ts | grep -q 'data-rolling-week'; then
    fail "unpaid cue must not stamp the rolling week window"
  fi
  if grep -Eqi '24h lock|lock on #1' src/http/pages.ts src/views/skin.ts; then
    fail "rolling week is not a 24h lock on #1"
  fi

  echo "== UX: occupied raise identity is last-7-days — not the UTC week label =="
  grep -q 'Same listing still inside last 7 days' src/http/pages.ts \
    || fail "occupied /rules must name last-7-days raise identity"
  grep -q 'weekId</code> stays an audit label — not raise identity' src/http/pages.ts \
    || fail "occupied /rules must keep weekId as an audit label"
  if grep -q 'Same listing, same week' src/http/pages.ts SPEC.md; then
    fail "occupied /rules must not tax raise identity as the UTC week"
  fi
  if grep -qi 'same weekId' src/http/pages.ts SPEC.md; then
    fail "raise identity must not key on weekId"
  fi
  grep -Fq 'Identity for raise: same **listing** still inside the rolling last 7 days' SPEC.md \
    || fail "SPEC must name last-7-days raise identity"
  grep -Fq '`weekId` stays a Polar/audit label — not raise identity' SPEC.md \
    || fail "SPEC must keep weekId as an audit label, not raise identity"
  grep -Fq 'Raise identity is the same listing still inside that window — not `weekId`' BUILD.md \
    || fail "BUILD must keep raise identity off weekId"
  grep -q 'Same listing still inside last 7 days raises' src/core/rank.ts \
    || fail "rank.ts must name last-7-days raise identity"
  grep -q 'weekId is not the raise key' src/core/rank.ts \
    || fail "rank.ts must keep weekId off raise identity"
  grep -q 'Raise identity is the listing still inside last 7 days. weekId is an audit label only.' src/core/rank.ts \
    || fail "checkoutWeekId must keep weekId as audit, not raise identity"
  grep -A 8 'export function checkoutWeekId' src/core/rank.ts | grep -q 'getBidInRollingWeek' \
    || fail "checkoutWeekId must quote against last-7-days, not weekId"
  if grep -A 8 'export function checkoutWeekId' src/core/rank.ts | grep -q 'getBid('; then
    fail "checkoutWeekId must not key raise identity on weekId"
  fi
  grep -q 'Same listing still inside last 7 days is a raise. weekId is not the raise key.' src/billing/polar_fixture.ts \
    || fail "Polar fixture checkout must raise on last-7-days identity"
  grep -q 'Raise identity is checkoutWeekId (last 7 days), not currentWeekId.' src/http/bids.ts \
    || fail "HTTP bids must raise on last-7-days identity"
  grep -q 'Raise identity is checkoutWeekId (last 7 days), not currentWeekId.' src/http/listings.ts \
    || fail "form checkout must raise on last-7-days identity"
  grep -q 'Raise identity is the listing still inside this window' src/core/week.ts \
    || fail "week.ts must keep weekId as Polar/audit only"
  grep -q 'occupied /rules raise identity is last-7-days, not the UTC week label' tests/pages.test.ts \
    || fail "rules tests must cover last-7-days raise identity"
  grep -q 'same listing still inside last-7-days raises after the UTC week label rolls' tests/rank.test.ts \
    || fail "rank tests must raise a Sunday pay across Monday weekId"
  grep -q 'Polar fixture raise after the UTC week label rolls charges the difference' tests/polar-fixture.test.ts \
    || fail "polar-fixture tests must raise a Sunday pay across Monday weekId"
  grep -q 'occupied /rules raise identity is last-7-days, not the UTC week label' "$test_log" \
    || fail "pages tests must cover last-7-days raise identity"
  grep -q 'same listing still inside last-7-days raises after the UTC week label rolls' "$test_log" \
    || fail "rank tests must cover Sunday pay Monday raise"
  grep -q 'Polar fixture raise after the UTC week label rolls charges the difference' "$test_log" \
    || fail "polar-fixture tests must cover Sunday pay Monday raise"
  grep -q 'class="bid-row"' src/http/pages.ts \
    || fail "raise-identity cut must keep occupied bid-row"
  grep -q 'data-first-click="claim"' src/http/pages.ts \
    || fail "raise-identity cut must keep empty Claim / Outbid as the first click"
  grep -q 'class="bid-form later-write" data-later-write="true"' src/http/pages.ts \
    || fail "raise-identity cut must keep empty deck URL as a later write"
  grep -q 'class="outbid">Outbid' src/http/pages.ts \
    || fail "raise-identity cut must keep Outbid"
  grep -q 'data-bid-step' src/http/pages.ts \
    || fail "raise-identity cut must keep ± steppers"
  grep -q 'bid-field' src/http/pages.ts \
    || fail "raise-identity cut must keep the dashed amount"
  grep -q 'The room is empty' src/http/pages.ts \
    || fail "raise-identity cut must keep honest empty"
  grep -q 'data-occupied-raise' src/http/pages.ts \
    || fail "raise-identity cut must keep occupied raise cue"
  grep -q 'Polar charges only the difference' src/http/pages.ts \
    || fail "raise-identity cut must keep Polar raise = difference"
  if grep -Eq 'raise-after-open-seven|open-after-raise-six' src/http/pages.ts src/views/skin.ts; then
    fail "raise identity must not add another numbered hop stamp"
  fi
  if grep -Eqi '24h lock|lock on #1' src/http/pages.ts src/core/rank.ts src/core/week.ts src/billing/polar_fixture.ts; then
    fail "raise identity is not a 24h lock on #1"
  fi
  if grep -Eq 'raise-identity|raise-rolling' src/views/skin.ts; then
    fail "raise identity must not recolor or rebuild the house"
  fi

  echo "== occupied checkout/return names Polar raise-pays-difference =="
  grep -q 'Sunday pay raised Monday still pays the difference' src/http/pages.ts \
    || fail "occupied checkout must name Sunday→Monday raise still pays the difference"
  grep -q 'Unpaid Polar checkout stays off the house until Polar reports paid' src/http/pages.ts \
    || fail "occupied checkout must name unpaid Polar stays off the house"
  grep -q 'renderCheckoutReturn' src/http/pages.ts \
    || fail "Polar return must render checkout copy instead of a silent redirect"
  grep -q 'data-return="paid"' src/http/pages.ts \
    || fail "paid Polar return must stamp data-return=paid"
  grep -q 'data-return="pending"' src/http/pages.ts \
    || fail "unpaid Polar return must stamp data-return=pending"
  grep -q 'data-return="cancel"' src/http/pages.ts \
    || fail "canceled Polar return must stamp data-return=cancel"
  grep -q 'Polar charged the difference' src/http/pages.ts \
    || fail "paid raise return must name Polar charged the difference"
  grep -F -q 'checkout/complete?checkoutId={CHECKOUT_ID}' src/billing/polar_live.ts \
    || fail "live Polar success_url must return to /checkout/complete"
  grep -q 'Occupied checkout: Polar charges the difference on a raise. Unpaid stays off.' src/views/skin.ts \
    || fail "occupied CSS must name checkout raise-pays-difference without rebuilding the house"
  grep -q 'occupied checkout copy names Polar raise-pays-difference — unpaid stays off' tests/pages.test.ts \
    || fail "pages tests must cover occupied checkout raise-pays-difference copy"
  grep -q 'occupied checkout copy names Polar raise-pays-difference' "$test_log" \
    || fail "pages tests must run occupied checkout raise-pays-difference"
  grep -q 'occupied checkout unpaid Polar return stays off the house' "$test_log" \
    || fail "pages tests must cover unpaid Polar return stays off the house"
  grep -q 'GET /checkout/complete' SPEC.md \
    || fail "SPEC must list Polar return copy"
  grep -q 'Unpaid Polar checkout stays off the house' SPEC.md \
    || fail "SPEC must name unpaid Polar stays off the house"
  if grep -n 'data-empty-room' -A 8 src/http/pages.ts | grep -q 'Sunday pay raised Monday'; then
    fail "empty Claim-first must not restamp Sunday→Monday checkout copy"
  fi
  if grep -n 'data-empty-room' -A 8 src/http/pages.ts | grep -q 'stays off the house'; then
    fail "empty Claim-first must not restamp occupied unpaid-off checkout copy"
  fi
  if grep -A 24 'export function renderRules' src/http/pages.ts | grep -q 'data-return'; then
    fail "checkout return copy must not restamp /rules raise identity"
  fi
  if grep -Eq 'data-unpaid-off|raise-after-open-seven|open-after-raise-six-stamp' src/http/pages.ts src/views/skin.ts; then
    fail "checkout copy must not add a hop stamp"
  fi
  grep -q 'class="bid-row"' src/http/pages.ts \
    || fail "checkout copy cut must keep occupied bid-row"
  grep -q 'data-first-click="claim"' src/http/pages.ts \
    || fail "checkout copy cut must keep empty Claim / Outbid as the first click"
  grep -q 'class="bid-form later-write" data-later-write="true"' src/http/pages.ts \
    || fail "checkout copy cut must keep empty deck URL as a later write"

  echo "== UX: occupied claim keeps raise-pays-difference short — ± Outbid stay the action =="
  grep -q 'occupied claim keeps raise-pays-difference short' tests/pages.test.ts \
    || fail "pages tests must cover shortened occupied claim"
  grep -q 'occupied claim keeps raise-pays-difference short' "$test_log" \
    || fail "pages tests must run shortened occupied claim"
  grep -n 'data-occupied-raise' -A 6 src/http/pages.ts | grep -q 'only the difference' \
    || fail "occupied claim must keep Polar raise-pays-difference"
  grep -n 'data-occupied-raise' -A 6 src/http/pages.ts | grep -q 'data-raise-charge' \
    || fail "occupied claim must keep the live difference charge"
  grep -q 'data-bid-step' src/http/pages.ts \
    || fail "occupied claim short cut must keep ±"
  grep -q 'class="outbid">Outbid' src/http/pages.ts \
    || fail "occupied claim short cut must keep Outbid"
  grep -q 'class="bid-row"' src/http/pages.ts \
    || fail "occupied claim short cut must keep occupied bid-row"
  grep -q 'data-first-click="claim"' src/http/pages.ts \
    || fail "occupied claim short cut must keep empty Claim / Outbid as the first click"
  grep -q 'class="bid-form later-write" data-later-write="true"' src/http/pages.ts \
    || fail "occupied claim short cut must keep empty deck URL as a later write"
  grep -q 'Polar charged the difference' src/http/pages.ts \
    || fail "occupied claim short cut must not restamp checkout-raise-copy"
  grep -q 'Sunday pay raised Monday still pays the difference' src/http/pages.ts \
    || fail "Sunday→Monday raise-pays-difference must stay on checkout return"
  grep -q 'Same listing still inside last 7 days' src/http/pages.ts \
    || fail "occupied claim short cut must not restamp raise-rolling-identity"
  if grep -n 'data-empty-room' -A 8 src/http/pages.ts | grep -q 'Sunday pay raised Monday'; then
    fail "empty Claim-first must not restamp Sunday→Monday checkout copy"
  fi
  if grep -Eq 'raise-after-open-seven|open-after-raise-six' src/http/pages.ts src/views/skin.ts; then
    fail "occupied claim short cut must not add another named hop"
  fi

  echo "== UX: occupied raise-charge stays quiet — ± Outbid stay the action =="
  grep -q 'occupied raise-charge stays quiet' tests/pages.test.ts \
    || fail "pages tests must cover quiet occupied raise-charge"
  grep -q 'occupied raise-charge stays quiet' "$test_log" \
    || fail "pages tests must run quiet occupied raise-charge"
  grep -n 'data-occupied-raise' -A 6 src/http/pages.ts | grep -q 'only the difference' \
    || fail "quiet raise-charge must keep Polar raise-pays-difference"
  grep -n 'data-occupied-raise' -A 6 src/http/pages.ts | grep -q 'data-raise-charge' \
    || fail "quiet raise-charge must keep the live difference charge"
  grep -n 'data-occupied-raise' -A 6 src/http/pages.ts | grep -q 'data-quiet-charge' \
    || fail "occupied raise-charge must stamp quiet so ± Outbid stay the action"
  grep -F -q '.house-occupied[data-occupied-house] .claim-note .raise-charge[data-raise-charge]' src/views/skin.ts \
    || fail "occupied raise-charge must be quieted in occupied CSS"
  grep -A 8 '.claim-note .raise-charge' src/views/skin.ts | grep -q 'font-size: 0.75rem' \
    || fail "occupied raise-charge must stay smaller than dashed \$amount"
  grep -A 8 '.claim-note .raise-charge' src/views/skin.ts | grep -q 'var(--sans)' \
    || fail "occupied raise-charge must not lecture in serif over ± Outbid"
  grep -A 8 '.claim-note .raise-charge' src/views/skin.ts | grep -q 'rgb(143, 122, 98)' \
    || fail "occupied raise-charge must stay muted so Outbid stays the action"
  if grep -A 8 '.claim-note .raise-charge' src/views/skin.ts | grep -q 'var(--serif)'; then
    fail "occupied raise-charge must not sit as a serif lecture between ± and Outbid"
  fi
  if grep -A 8 '.claim-note .raise-charge' src/views/skin.ts | grep -q 'font-size: 1.2rem'; then
    fail "occupied raise-charge must not match cream-serif lecture size over the dashed amount"
  fi
  if grep -A 8 '.claim-note .raise-charge' src/views/skin.ts | grep -q 'var(--cream)'; then
    fail "occupied raise-charge must not cream-lecture over ± Outbid"
  fi
  if awk '/^export const HOUSE_CSS/{p=1} p{print} /^export const OCCUPIED_CSS/{exit}' src/views/skin.ts \
    | grep -Eq 'data-quiet-charge|data-raise-charge|raise-charge'; then
    fail "HOUSE_CSS must not stamp occupied raise-charge chrome"
  fi
  if grep -n 'function raiseAfterDeckHop' -A 12 src/http/pages.ts | grep -Eq 'raise-charge|quiet-charge|New deck: Polar|Sunday pay raised Monday'; then
    fail "must not put Polar lecture on the #1 cue"
  fi
  if grep -n 'data-empty-room' -A 8 src/http/pages.ts | grep -Eq 'data-quiet-charge|data-raise-charge'; then
    fail "empty Claim-first must not stamp occupied raise-charge"
  fi
  grep -q 'class="bid-row"' src/http/pages.ts \
    || fail "quiet raise-charge cut must keep occupied bid-row"
  grep -q 'data-first-click="claim"' src/http/pages.ts \
    || fail "quiet raise-charge cut must keep empty Claim / Outbid as the first click"
  grep -q 'class="bid-form later-write" data-later-write="true"' src/http/pages.ts \
    || fail "quiet raise-charge cut must keep empty deck URL as a later write"
  grep -q 'data-bid-step' src/http/pages.ts \
    || fail "quiet raise-charge cut must keep ±"
  grep -q 'class="outbid">Outbid' src/http/pages.ts \
    || fail "quiet raise-charge cut must keep Outbid"
  grep -q 'bid-field' src/http/pages.ts \
    || fail "quiet raise-charge cut must keep the dashed amount"
  grep -q 'Polar charged the difference' src/http/pages.ts \
    || fail "quiet raise-charge cut must not restamp checkout-raise-copy"
  grep -q 'Sunday pay raised Monday still pays the difference' src/http/pages.ts \
    || fail "Sunday→Monday raise-pays-difference must stay on checkout return"
  grep -q 'Same listing still inside last 7 days' src/http/pages.ts \
    || fail "quiet raise-charge cut must not restamp raise-rolling-identity"
  grep -q 'occupied claim keeps raise-pays-difference short' tests/pages.test.ts \
    || fail "quiet raise-charge cut must not restamp occupied-claim-short copy"
  if grep -n 'data-occupied-raise' -A 6 src/http/pages.ts | grep -q 'The $ you type is the public bid'; then
    fail "quiet raise-charge must not restamp occupied-claim-short lecture"
  fi
  if grep -Eq 'raise-after-open-seven|open-after-raise-six' src/http/pages.ts src/views/skin.ts; then
    fail "quiet raise-charge cut must not add another named hop"
  fi

  if grep -Eqi 'polar\.(sh|in)|api\.polar' "$test_log"; then
    fail "unit tests must not call live Polar hosts"
  fi
fi

echo "OK: buildable and testable"
