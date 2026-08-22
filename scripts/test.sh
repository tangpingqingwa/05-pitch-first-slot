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
  if grep -Rqi 'polar' src/core/rank.ts src/core/week.ts src/http/bids.ts; then
    fail "PR 3 must not add Polar checkout"
  fi
  grep -q 'Monday' tests/week.test.ts || fail "week tests must cover Monday UTC reset"
  grep -q 'older paidAt' tests/rank.test.ts || fail "rank tests must cover older-wins-ties"

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
  # Offline only. Do not set POLAR_LIVE=1. Fixture-only is set once billing exists.
  unset POLAR_LIVE || true
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
fi

echo "OK: buildable and testable"
