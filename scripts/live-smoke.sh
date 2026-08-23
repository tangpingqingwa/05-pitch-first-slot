#!/usr/bin/env bash
# Operator smoke against a local process. Not called from scripts/test.sh or CI.
# Starts the product process and walks every SPEC §12 acceptance row.
# Fixture path is the default. Live Polar only if POLAR_LIVE=1 and secrets exist;
# otherwise BLOCKED-SECRET for the live-checkout row.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

if [[ "${CI:-}" == "true" ]]; then
  fail "live-smoke refuses CI=true"
fi
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
  fail "live-smoke must not run in GitHub Actions"
fi

command -v curl >/dev/null || fail "curl is required"
command -v node >/dev/null || fail "node is required"

if [[ ! -d node_modules ]]; then
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
fi

PASS=0
PASS_ERROR=0
BLOCKED=0
FAIL=0
STARTED_PID=""
WEEK_PID=""
LIVE_PID=""
WORKDIR=""
RESULT_LOG=""
BASE="${LIVE_SMOKE_BASE:-}"

# Capture operator Polar flags before the fixture process unsets them.
OP_POLAR_LIVE="${POLAR_LIVE:-}"
OP_POLAR_ACCESS_TOKEN="${POLAR_ACCESS_TOKEN:-}"
OP_POLAR_WEBHOOK_SECRET="${POLAR_WEBHOOK_SECRET:-}"
OP_POLAR_PRODUCT_ID="${POLAR_PRODUCT_ID:-}"
OP_POLAR_API_BASE="${POLAR_API_BASE:-}"

cleanup() {
  if [[ -n "${LIVE_PID}" ]] && kill -0 "${LIVE_PID}" 2>/dev/null; then
    kill "${LIVE_PID}" 2>/dev/null || true
    wait "${LIVE_PID}" 2>/dev/null || true
  fi
  if [[ -n "${WEEK_PID}" ]] && kill -0 "${WEEK_PID}" 2>/dev/null; then
    kill "${WEEK_PID}" 2>/dev/null || true
    wait "${WEEK_PID}" 2>/dev/null || true
  fi
  if [[ -n "${STARTED_PID}" ]] && kill -0 "${STARTED_PID}" 2>/dev/null; then
    kill "${STARTED_PID}" 2>/dev/null || true
    wait "${STARTED_PID}" 2>/dev/null || true
  fi
  if [[ -n "${WORKDIR}" && -d "${WORKDIR}" ]]; then
    rm -rf "${WORKDIR}"
  fi
}
trap cleanup EXIT

record() {
  local flow="$1"
  local status="$2"
  local note="${3:-}"
  printf 'RESULT\t%s\t%s\t%s\n' "$flow" "$status" "$note"
  if [[ -n "${RESULT_LOG}" ]]; then
    printf '%s\t%s\t%s\n' "$flow" "$status" "$note" >>"${RESULT_LOG}"
  fi
  case "$status" in
    PASS) PASS=$((PASS + 1)) ;;
    PASS-ERROR) PASS_ERROR=$((PASS_ERROR + 1)) ;;
    BLOCKED-SECRET) BLOCKED=$((BLOCKED + 1)) ;;
    FAIL) FAIL=$((FAIL + 1)) ;;
    *) fail "unknown smoke status ${status}" ;;
  esac
}

pick_port() {
  node --input-type=module -e '
    import net from "node:net";
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") process.exit(1);
      process.stdout.write(String(addr.port));
      server.close();
    });
  '
}

wait_health() {
  local url="$1/healthz"
  local i
  for i in $(seq 1 80); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.1
  done
  return 1
}

start_server() {
  local port="$1"
  local db_path="$2"
  local log_path="$3"
  shift 3
  (
    cd "$root"
    unset POLAR_LIVE POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET || true
    export POLAR_FIXTURE_ONLY=1
    export PORT="${port}"
    export DATABASE_PATH="${db_path}"
    export PUBLIC_BASE_URL="http://127.0.0.1:${port}"
    while [[ $# -gt 0 ]]; do
      export "$1"
      shift
    done
    exec node --import tsx src/server.ts
  ) >"${log_path}" 2>&1 &
  echo $!
}

http_get() {
  local base="$1"
  local path="$2"
  local out="$3"
  curl -sS -o "$out" -w "%{http_code}" --connect-timeout 5 --max-time 20 \
    "${base}${path}"
}

http_get_headers() {
  local base="$1"
  local path="$2"
  local body="$3"
  local hdrs="$4"
  curl -sS -D "$hdrs" -o "$body" -w "%{http_code}" --connect-timeout 5 --max-time 20 \
    --max-redirs 0 \
    "${base}${path}"
}

http_post_json() {
  local base="$1"
  local path="$2"
  local payload="$3"
  local body="$4"
  local hdrs="$5"
  curl -sS -D "$hdrs" -o "$body" -w "%{http_code}" --connect-timeout 5 --max-time 20 \
    --max-redirs 0 \
    -X POST \
    -H "content-type: application/json" \
    -H "accept: application/json" \
    --data "$payload" \
    "${base}${path}"
}

header_value() {
  local file="$1"
  local name="$2"
  awk -v name="$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')" '
    BEGIN { FS = ": " }
    tolower($1) == name {
      val = $0
      sub(/^[^:]+:[ \t]*/, "", val)
      gsub(/\r/, "", val)
      print val
      exit
    }
  ' "$file"
}

json_field() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const raw = readFileSync(process.argv[1], "utf8");
    let data;
    try { data = JSON.parse(raw); } catch { process.exit(2); }
    const key = process.argv[2];
    const value = data == null ? undefined : data[key];
    if (value === undefined || value === null) process.exit(3);
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      process.stdout.write(String(value));
      process.exit(0);
    }
    process.stdout.write(JSON.stringify(value));
  ' "$1" "$2"
}

html_has() {
  local file="$1"
  local pattern="$2"
  grep -Eq "$pattern" "$file"
}

sample_company_leak() {
  local file="$1"
  grep -Eiq 'Acme|OpenAI|Stripe|Y Combinator|sample startup' "$file"
}

rank_for_company() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const html = readFileSync(process.argv[1], "utf8");
    const company = process.argv[2];
    const items = [...html.matchAll(/<li class="listing"[\s\S]*?<\/li>/g)].map((m) => m[0]);
    for (const item of items) {
      if (item.includes(`<p class="company">${company}</p>`)) {
        const rank = item.match(/data-rank="(\d+)"/);
        if (rank) {
          process.stdout.write(rank[1]);
          process.exit(0);
        }
        process.exit(3);
      }
    }
    process.exit(2);
  ' "$1" "$2"
}

bid_for_company() {
  node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const html = readFileSync(process.argv[1], "utf8");
    const company = process.argv[2];
    const items = [...html.matchAll(/<li class="listing"[\s\S]*?<\/li>/g)].map((m) => m[0]);
    for (const item of items) {
      if (item.includes(`<p class="company">${company}</p>`)) {
        const bid = item.match(/data-bid="(\d+)"/);
        if (bid) {
          process.stdout.write(bid[1]);
          process.exit(0);
        }
        process.exit(3);
      }
    }
    process.exit(2);
  ' "$1" "$2"
}

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/pitch-first-slot-live-smoke.XXXXXX")"
RESULT_LOG="${WORKDIR}/results.tsv"
: >"${RESULT_LOG}"
STAMP="$(date -u +%Y%m%d%H%M%S)"

echo "== live-smoke (operator only; not CI) =="
echo "root=${root}"

if [[ -z "${BASE}" ]]; then
  PORT="${LIVE_SMOKE_PORT:-$(pick_port)}"
  BASE="http://127.0.0.1:${PORT}"
  DB_PATH="${WORKDIR}/board.sqlite"
  LOG_PATH="${WORKDIR}/server.log"
  echo "starting local fixture server on ${BASE}"
  echo "database=${DB_PATH}"
  STARTED_PID="$(start_server "$PORT" "$DB_PATH" "$LOG_PATH")"
  if ! wait_health "$BASE"; then
    echo "server log:" >&2
    cat "${LOG_PATH}" >&2 || true
    fail "local server did not become healthy at ${BASE}/healthz"
  fi
else
  BASE="${BASE%/}"
  echo "assuming existing server at ${BASE}"
  if ! wait_health "$BASE"; then
    fail "existing server at ${BASE} did not answer /healthz"
  fi
fi

echo "base=${BASE}"
echo "operator POLAR_LIVE=${OP_POLAR_LIVE:-<unset>}"
if [[ -n "${OP_POLAR_API_BASE}" ]]; then
  echo "operator POLAR_API_BASE_set=1"
else
  echo "operator POLAR_API_BASE=<unset>"
fi

# --- healthz (process is up) ---
health_body="${WORKDIR}/healthz.json"
health_code="$(http_get "$BASE" "/healthz" "$health_body" || true)"
if [[ "$health_code" == "200" ]] && grep -q '"ok":true' "$health_body"; then
  echo "healthz 200 { ok: true }"
else
  fail "GET /healthz HTTP ${health_code}"
fi

# --- SPEC 1: Empty week ---
board0="${WORKDIR}/board0.html"
board0_code="$(http_get "$BASE" "/" "$board0" || true)"
if [[ "$board0_code" == "200" ]] \
  && html_has "$board0" 'The room is empty\.' \
  && html_has "$board0" "This week's first slot is still open. Outbid takes it after Polar lands." \
  && ! html_has "$board0" 'No listings this week' \
  && ! html_has "$board0" 'class="listing"' \
  && ! html_has "$board0" '\$[0-9]' \
  && ! sample_company_leak "$board0"; then
  record "1-empty-week" "PASS" "GET / 200 zero listings, no sample companies"
else
  record "1-empty-week" "FAIL" "GET / HTTP ${board0_code} empty-board contract broken"
fi

# --- SPEC 2: Listing company + one-liner + https URL, unranked until paid ---
list2_body="${WORKDIR}/list2.json"
list2_hdrs="${WORKDIR}/list2.hdrs"
list2_code="$(http_post_json "$BASE" "/listings" \
  "{\"company\":\"Helix Labs\",\"oneLiner\":\"Benchtop instruments for small labs\",\"url\":\"https://helix-${STAMP}.example/deck\"}" \
  "$list2_body" "$list2_hdrs" || true)"
list2_id="$(json_field "$list2_body" "id" || true)"
list2_url="$(json_field "$list2_body" "url" || true)"
board2="${WORKDIR}/board2.html"
board2_code="$(http_get "$BASE" "/" "$board2" || true)"
if [[ "$list2_code" == "200" && -n "$list2_id" ]] \
  && [[ "$list2_url" == "https://helix-${STAMP}.example/deck" ]] \
  && [[ "$board2_code" == "200" ]] \
  && html_has "$board2" 'Helix Labs' \
  && html_has "$board2" 'Benchtop instruments for small labs' \
  && html_has "$board2" 'Unranked — no paid bid yet' \
  && html_has "$board2" 'Deck or site' \
  && ! html_has "$board2" 'The board is empty' \
  && ! html_has "$board2" 'first slot is still open' \
  && ! html_has "$board2" 'data-open-deck' \
  && ! html_has "$board2" '#1 · \$'; then
  record "2-listing-unranked" "PASS" "POST /listings 200; Helix Labs unranked until paid"
else
  record "2-listing-unranked" "FAIL" "POST /listings HTTP ${list2_code} id=${list2_id}"
fi

# --- SPEC 3: First bid $4 → 400 min $5 ---
if [[ -z "$list2_id" ]]; then
  record "3-first-bid-4" "FAIL" "no listing id for min-bid check"
else
  bid4_body="${WORKDIR}/bid4.json"
  bid4_hdrs="${WORKDIR}/bid4.hdrs"
  bid4_code="$(http_post_json "$BASE" "/listings/${list2_id}/bids" \
    '{"amountUsd":4}' "$bid4_body" "$bid4_hdrs" || true)"
  bid4_err="$(json_field "$bid4_body" "error" || true)"
  board3="${WORKDIR}/board3.html"
  http_get "$BASE" "/" "$board3" >/dev/null || true
  if [[ "$bid4_code" == "400" && "$bid4_err" == "min_bid" ]] \
    && html_has "$board3" 'Unranked — no paid bid yet' \
    && ! html_has "$board3" '\$4' \
    && ! html_has "$board3" '#1 · \$'; then
    record "3-first-bid-4" "PASS-ERROR" "POST /listings/:id/bids \$4 → 400 min_bid"
  else
    record "3-first-bid-4" "FAIL" "\$4 bid HTTP ${bid4_code} error=${bid4_err}"
  fi
fi

# --- SPEC 4: First bid $5 ranks; fixture charged $5 ---
if [[ -z "$list2_id" ]]; then
  record "4-first-bid-5" "FAIL" "no listing id for first paid bid"
else
  bid5_body="${WORKDIR}/bid5.json"
  bid5_hdrs="${WORKDIR}/bid5.hdrs"
  bid5_code="$(http_post_json "$BASE" "/listings/${list2_id}/bids" \
    '{"amountUsd":5}' "$bid5_body" "$bid5_hdrs" || true)"
  bid5_amount="$(json_field "$bid5_body" "amountUsd" || true)"
  bid5_charge="$(json_field "$bid5_body" "chargeUsd" || true)"
  board4="${WORKDIR}/board4.html"
  board4_code="$(http_get "$BASE" "/" "$board4" || true)"
  if [[ "$bid5_code" == "200" && "$bid5_amount" == "5" && "$bid5_charge" == "5" ]] \
    && [[ "$board4_code" == "200" ]] \
    && html_has "$board4" '#1 · \$5' \
    && html_has "$board4" 'Helix Labs' \
    && html_has "$board4" 'data-occupied-raise' \
    && html_has "$board4" 'Polar charges only the difference' \
    && html_has "$board4" 'data-open-deck="true"' \
    && html_has "$board4" 'Open deck' \
    && html_has "$board4" 'data-raise-after-deck="true"' \
    && html_has "$board4" 'Then Outbid' \
    && html_has "$board4" 'data-open-after-raise="true"' \
    && html_has "$board4" 'after Then Outbid' \
    && html_has "$board4" 'data-raise-after-open="true"' \
    && html_has "$board4" 'after Open deck' \
    && ! html_has "$board4" 'data-later-deck' \
    && ! html_has "$board4" 'data-open-later' \
    && ! html_has "$board4" 'data-open-after-raise-one' \
    && ! html_has "$board4" 'data-raise-after-open-two' \
    && ! html_has "$board4" 'data-open-after-raise-two' \
    && ! html_has "$board4" 'Unranked — no paid bid yet'; then
    record "4-first-bid-5" "PASS" "fixture charged \$5; public rank #1 · \$5"
  else
    record "4-first-bid-5" "FAIL" "\$5 bid HTTP ${bid5_code} amount=${bid5_amount} charge=${bid5_charge}"
  fi
fi

# --- SPEC 5: Raise $5 → $12 charges $7; public bid $12 ---
if [[ -z "$list2_id" ]]; then
  record "5-raise-12" "FAIL" "no listing id for raise"
else
  raise_body="${WORKDIR}/raise.json"
  raise_hdrs="${WORKDIR}/raise.hdrs"
  raise_code="$(http_post_json "$BASE" "/listings/${list2_id}/bids" \
    '{"amountUsd":12}' "$raise_body" "$raise_hdrs" || true)"
  raise_amount="$(json_field "$raise_body" "amountUsd" || true)"
  raise_charge="$(json_field "$raise_body" "chargeUsd" || true)"
  board5="${WORKDIR}/board5.html"
  board5_code="$(http_get "$BASE" "/" "$board5" || true)"
  if [[ "$raise_code" == "200" && "$raise_amount" == "12" && "$raise_charge" == "7" ]] \
    && [[ "$board5_code" == "200" ]] \
    && html_has "$board5" '#1 · \$12' \
    && ! html_has "$board5" '#2'; then
    record "5-raise-12" "PASS" "raise charged \$7; public bid \$12"
  else
    record "5-raise-12" "FAIL" "raise HTTP ${raise_code} amount=${raise_amount} charge=${raise_charge}"
  fi
fi

# --- SPEC 6: Two listings both at $20; A paid first ranks above B ---
alpha_body="${WORKDIR}/alpha.json"
alpha_hdrs="${WORKDIR}/alpha.hdrs"
alpha_code="$(http_post_json "$BASE" "/listings" \
  "{\"company\":\"Alpha Pitch\",\"oneLiner\":\"Older payment at twenty\",\"url\":\"https://alpha-${STAMP}.example\"}" \
  "$alpha_body" "$alpha_hdrs" || true)"
alpha_id="$(json_field "$alpha_body" "id" || true)"
beta_body="${WORKDIR}/beta.json"
beta_hdrs="${WORKDIR}/beta.hdrs"
beta_code="$(http_post_json "$BASE" "/listings" \
  "{\"company\":\"Beta Pitch\",\"oneLiner\":\"Newer payment at twenty\",\"url\":\"https://beta-${STAMP}.example\"}" \
  "$beta_body" "$beta_hdrs" || true)"
beta_id="$(json_field "$beta_body" "id" || true)"
if [[ "$alpha_code" != "200" || "$beta_code" != "200" || -z "$alpha_id" || -z "$beta_id" ]]; then
  record "6-tie-older-wins" "FAIL" "could not create Alpha/Beta listings"
else
  a_bid="${WORKDIR}/alpha-bid.json"
  a_hdrs="${WORKDIR}/alpha-bid.hdrs"
  a_code="$(http_post_json "$BASE" "/listings/${alpha_id}/bids" \
    '{"amountUsd":20}' "$a_bid" "$a_hdrs" || true)"
  sleep 1
  b_bid="${WORKDIR}/beta-bid.json"
  b_hdrs="${WORKDIR}/beta-bid.hdrs"
  b_code="$(http_post_json "$BASE" "/listings/${beta_id}/bids" \
    '{"amountUsd":20}' "$b_bid" "$b_hdrs" || true)"
  board6="${WORKDIR}/board6.html"
  board6_code="$(http_get "$BASE" "/" "$board6" || true)"
  alpha_rank="$(rank_for_company "$board6" "Alpha Pitch" || true)"
  beta_rank="$(rank_for_company "$board6" "Beta Pitch" || true)"
  alpha_bid="$(bid_for_company "$board6" "Alpha Pitch" || true)"
  beta_bid="$(bid_for_company "$board6" "Beta Pitch" || true)"
  if [[ "$a_code" == "200" && "$b_code" == "200" && "$board6_code" == "200" ]] \
    && [[ "$alpha_rank" == "1" && "$beta_rank" == "2" ]] \
    && [[ "$alpha_bid" == "20" && "$beta_bid" == "20" ]] \
    && html_has "$board6" 'data-later-deck="true"' \
    && html_has "$board6" 'data-open-later="true"' \
    && html_has "$board6" 'data-open-one-first="true"' \
    && html_has "$board6" 'data-open-one="true"' \
    && html_has "$board6" 'data-raise-one-first="true"' \
    && html_has "$board6" 'data-raise-one="true"' \
    && html_has "$board6" 'data-open-after-raise-one-first="true"' \
    && html_has "$board6" 'data-open-after-raise-one="true"' \
    && html_has "$board6" 'data-raise-after-open-two-first="true"' \
    && html_has "$board6" 'data-raise-after-open-two="true"' \
    && html_has "$board6" 'data-open-after-raise-two-first="true"' \
    && html_has "$board6" 'data-open-after-raise-two="true"' \
    && html_has "$board6" 'Then Outbid' \
    && html_has "$board6" 'Open deck'; then
    record "6-tie-older-wins" "PASS" "both \$20; Alpha paid first stays #1"
  else
    record "6-tie-older-wins" "FAIL" "tie rank HTTP a=${a_code} b=${b_code} alpha=${alpha_rank}/${alpha_bid} beta=${beta_rank}/${beta_bid}"
  fi
fi

# --- SPEC 7: tracking query stripped ---
track_body="${WORKDIR}/track.json"
track_hdrs="${WORKDIR}/track.hdrs"
track_code="$(http_post_json "$BASE" "/listings" \
  "{\"company\":\"Tracked Deck\",\"oneLiner\":\"URL hygiene on write\",\"url\":\"https://tracked-${STAMP}.example/deck?utm_source=x&fbclid=1\"}" \
  "$track_body" "$track_hdrs" || true)"
track_url="$(json_field "$track_body" "url" || true)"
board7="${WORKDIR}/board7.html"
http_get "$BASE" "/" "$board7" >/dev/null || true
if [[ "$track_code" == "200" \
  && "$track_url" == "https://tracked-${STAMP}.example/deck" ]] \
  && html_has "$board7" "https://tracked-${STAMP}.example/deck" \
  && ! html_has "$board7" 'utm_source' \
  && ! html_has "$board7" 'fbclid'; then
  record "7-tracking-stripped" "PASS" "utm_source and fbclid stripped from stored URL"
else
  record "7-tracking-stripped" "FAIL" "POST /listings tracking HTTP ${track_code} url=${track_url}"
fi

# --- SPEC 8: https://t.me/foo → 400 no_chat ---
chat_body="${WORKDIR}/chat.json"
chat_hdrs="${WORKDIR}/chat.hdrs"
chat_code="$(http_post_json "$BASE" "/listings" \
  '{"company":"Chat Link","oneLiner":"Must reject telegram","url":"https://t.me/foo"}' \
  "$chat_body" "$chat_hdrs" || true)"
chat_err="$(json_field "$chat_body" "error" || true)"
if [[ "$chat_code" == "400" && "$chat_err" == "no_chat" ]]; then
  record "8-no-chat" "PASS-ERROR" "https://t.me/foo → 400 no_chat"
else
  record "8-no-chat" "FAIL" "t.me HTTP ${chat_code} error=${chat_err}"
fi

# --- SPEC 9: public click 0 → 1; redirect to canonical URL ---
if [[ -z "$list2_id" ]]; then
  record "9-public-click" "FAIL" "no listing id for click"
else
  click_before="${WORKDIR}/click-before.html"
  http_get "$BASE" "/" "$click_before" >/dev/null || true
  click_body="${WORKDIR}/click.body"
  click_hdrs="${WORKDIR}/click.hdrs"
  click_code="$(http_post_json "$BASE" "/listings/${list2_id}/clicks" \
    '{}' "$click_body" "$click_hdrs" || true)"
  click_loc="$(header_value "$click_hdrs" "location" || true)"
  click_after="${WORKDIR}/click-after.html"
  http_get "$BASE" "/" "$click_after" >/dev/null || true
  if [[ "$click_code" == "302" \
    && "$click_loc" == "https://helix-${STAMP}.example/deck" ]] \
    && html_has "$click_before" 'data-clicks="0"' \
    && html_has "$click_after" 'data-clicks="1"' \
    && html_has "$click_after" '1 clicks'; then
    record "9-public-click" "PASS" "POST /listings/:id/clicks 302; clicks 0 → 1"
  else
    record "9-public-click" "FAIL" "click HTTP ${click_code} loc=${click_loc}"
  fi
fi

# --- SPEC 10: arr / users ignored or 400; never rendered ---
arr_body="${WORKDIR}/arr.json"
arr_hdrs="${WORKDIR}/arr.hdrs"
arr_code="$(http_post_json "$BASE" "/listings" \
  "{\"company\":\"Northwind\",\"oneLiner\":\"Invoice tools for wholesalers\",\"url\":\"https://northwind-${STAMP}.example\",\"arr\":\"\$1.2M\",\"users\":\"10k\"}" \
  "$arr_body" "$arr_hdrs" || true)"
arr_err="$(json_field "$arr_body" "error" || true)"
board10="${WORKDIR}/board10.html"
http_get "$BASE" "/" "$board10" >/dev/null || true
if [[ "$arr_code" == "400" ]]; then
  if ! html_has "$board10" '\$1\.2M' && ! html_has "$board10" '10k'; then
    record "10-no-traction" "PASS-ERROR" "arr/users rejected HTTP 400 ${arr_err}; never rendered"
  else
    record "10-no-traction" "FAIL" "arr/users 400 but traction still rendered"
  fi
elif [[ "$arr_code" == "200" ]] \
  && ! grep -q '"arr"' "$arr_body" \
  && ! grep -q '"users"' "$arr_body" \
  && html_has "$board10" 'Northwind' \
  && ! html_has "$board10" '\$1\.2M' \
  && ! html_has "$board10" '10k' \
  && ! grep -Eqi '(^|[^a-z])arr([^a-z]|$)' "$board10" \
  && ! grep -Eqi '(^|[^a-z])users([^a-z]|$)' "$board10"; then
  record "10-no-traction" "PASS" "arr/users ignored; never rendered"
else
  record "10-no-traction" "FAIL" "arr/users HTTP ${arr_code}"
fi

# --- SPEC 11: checkout all remaining slots → 400 cannot_buy_show ---
show_list="${WORKDIR}/show-list.json"
show_list_hdrs="${WORKDIR}/show-list.hdrs"
show_list_code="$(http_post_json "$BASE" "/listings" \
  "{\"company\":\"Show Grab\",\"oneLiner\":\"Must not buy remaining slots\",\"url\":\"https://show-${STAMP}.example\"}" \
  "$show_list" "$show_list_hdrs" || true)"
show_id="$(json_field "$show_list" "id" || true)"
if [[ "$show_list_code" != "200" || -z "$show_id" ]]; then
  record "11-cannot-buy-show" "FAIL" "could not create listing for cannot_buy_show"
else
  show_body="${WORKDIR}/show-bid.json"
  show_hdrs="${WORKDIR}/show-bid.hdrs"
  show_code="$(http_post_json "$BASE" "/listings/${show_id}/bids" \
    '{"amountUsd":50,"sku":"all remaining slots"}' "$show_body" "$show_hdrs" || true)"
  show_err="$(json_field "$show_body" "error" || true)"
  board11="${WORKDIR}/board11.html"
  http_get "$BASE" "/" "$board11" >/dev/null || true
  if [[ "$show_code" == "400" && "$show_err" == "cannot_buy_show" ]] \
    && ! html_has "$board11" 'data-rank=.*Show Grab'; then
    record "11-cannot-buy-show" "PASS-ERROR" "all remaining slots → 400 cannot_buy_show"
  else
    record "11-cannot-buy-show" "FAIL" "show SKU HTTP ${show_code} error=${show_err}"
  fi
fi

# --- SPEC 12: Monday 00:00 UTC previous bids unranked ---
week_db="${WORKDIR}/week-reset.sqlite"
week_old_port="$(pick_port)"
week_old_log="${WORKDIR}/week-old.log"
week_old_base="http://127.0.0.1:${week_old_port}"
WEEK_PID="$(start_server "$week_old_port" "$week_db" "$week_old_log" \
  "WEEK_NOW=2026-08-16T12:00:00.000Z")"
if ! wait_health "$week_old_base"; then
  record "12-monday-reset" "FAIL" "Sunday-week process did not become healthy"
else
  week_list="${WORKDIR}/week-list.json"
  week_list_hdrs="${WORKDIR}/week-list.hdrs"
  week_list_code="$(http_post_json "$week_old_base" "/listings" \
    "{\"company\":\"Last Week Winner\",\"oneLiner\":\"Paid last Sunday\",\"url\":\"https://last-week-${STAMP}.example\"}" \
    "$week_list" "$week_list_hdrs" || true)"
  week_id="$(json_field "$week_list" "id" || true)"
  week_bid="${WORKDIR}/week-bid.json"
  week_bid_hdrs="${WORKDIR}/week-bid.hdrs"
  week_bid_code="000"
  if [[ -n "$week_id" ]]; then
    week_bid_code="$(http_post_json "$week_old_base" "/listings/${week_id}/bids" \
      '{"amountUsd":5}' "$week_bid" "$week_bid_hdrs" || true)"
  fi
  week_old_board="${WORKDIR}/week-old.html"
  http_get "$week_old_base" "/" "$week_old_board" >/dev/null || true
  if [[ -n "${WEEK_PID}" ]] && kill -0 "${WEEK_PID}" 2>/dev/null; then
    kill "${WEEK_PID}" 2>/dev/null || true
    wait "${WEEK_PID}" 2>/dev/null || true
  fi
  WEEK_PID=""
  week_new_port="$(pick_port)"
  week_new_log="${WORKDIR}/week-new.log"
  week_new_base="http://127.0.0.1:${week_new_port}"
  WEEK_PID="$(start_server "$week_new_port" "$week_db" "$week_new_log" \
    "WEEK_NOW=2026-08-17T00:00:00.000Z")"
  if ! wait_health "$week_new_base"; then
    record "12-monday-reset" "FAIL" "Monday 00:00 UTC process did not become healthy"
  else
    week_new_board="${WORKDIR}/week-new.html"
    week_new_code="$(http_get "$week_new_base" "/" "$week_new_board" || true)"
    if [[ "$week_list_code" == "200" && "$week_bid_code" == "200" ]] \
      && html_has "$week_old_board" '#1 · \$5' \
      && [[ "$week_new_code" == "200" ]] \
      && html_has "$week_new_board" 'Last Week Winner' \
      && html_has "$week_new_board" 'Unranked — no paid bid yet' \
      && ! html_has "$week_new_board" 'data-rank="' \
      && ! html_has "$week_new_board" '#1 · \$5'; then
      record "12-monday-reset" "PASS" "Monday 00:00 UTC drops last week rank; listing stays unranked"
    else
      record "12-monday-reset" "FAIL" "reset list=${week_list_code} bid=${week_bid_code} monday=${week_new_code}"
    fi
  fi
  if [[ -n "${WEEK_PID}" ]] && kill -0 "${WEEK_PID}" 2>/dev/null; then
    kill "${WEEK_PID}" 2>/dev/null || true
    wait "${WEEK_PID}" 2>/dev/null || true
  fi
  WEEK_PID=""
fi

# --- SPEC 13: Polar fixture — rank updates with no live Polar ---
fix_list="${WORKDIR}/fix-list.json"
fix_list_hdrs="${WORKDIR}/fix-list.hdrs"
fix_list_code="$(http_post_json "$BASE" "/listings" \
  "{\"company\":\"Fixture Rank\",\"oneLiner\":\"Rank moves with no live Polar\",\"url\":\"https://fixture-${STAMP}.example\"}" \
  "$fix_list" "$fix_list_hdrs" || true)"
fix_id="$(json_field "$fix_list" "id" || true)"
if [[ "$fix_list_code" != "200" || -z "$fix_id" ]]; then
  record "13-polar-fixture" "FAIL" "could not create fixture listing"
else
  fix_bid="${WORKDIR}/fix-bid.json"
  fix_bid_hdrs="${WORKDIR}/fix-bid.hdrs"
  fix_code="$(http_post_json "$BASE" "/listings/${fix_id}/bids" \
    '{"amountUsd":5}' "$fix_bid" "$fix_bid_hdrs" || true)"
  fix_charge="$(json_field "$fix_bid" "chargeUsd" || true)"
  board13="${WORKDIR}/board13.html"
  board13_code="$(http_get "$BASE" "/" "$board13" || true)"
  if [[ "$fix_code" == "200" && "$fix_charge" == "5" && "$board13_code" == "200" ]] \
    && html_has "$board13" 'Fixture Rank' \
    && html_has "$board13" 'data-bid="5"' \
    && ! grep -Eiq 'polar\.(sh|in)|api\.polar' "$fix_bid" "$board13"; then
    record "13-polar-fixture" "PASS" "POLAR_LIVE unset; fixture rank # updates with no Polar network"
  else
    record "13-polar-fixture" "FAIL" "fixture bid HTTP ${fix_code} charge=${fix_charge}"
  fi
fi

# --- SPEC 14: GET /about and GET /rules ---
about_body="${WORKDIR}/about.html"
about_code="$(http_get "$BASE" "/about" "$about_body" || true)"
rules_body="${WORKDIR}/rules.html"
rules_code="$(http_get "$BASE" "/rules" "$rules_body" || true)"
if [[ "$about_code" == "200" && "$rules_code" == "200" ]] \
  && html_has "$about_body" 'cannot buy the show' \
  && html_has "$about_body" 'weekly reset' \
  && html_has "$about_body" 'Monday 00:00 UTC' \
  && html_has "$rules_body" 'cannot buy the show' \
  && html_has "$rules_body" 'weekly reset' \
  && html_has "$rules_body" 'Monday 00:00 UTC' \
  && html_has "$rules_body" 'cannot_buy_show'; then
  record "14-about-rules" "PASS" "GET /about and /rules 200; cannot-buy-the-show + weekly reset"
else
  record "14-about-rules" "FAIL" "about HTTP ${about_code} rules HTTP ${rules_code}"
fi

# --- Live Polar checkout (not a SPEC numbered row; env-gated) ---
echo "== polar live-checkout =="
is_sandbox_checkout_url() {
  local value="$1"
  [[ "$value" == https://sandbox.polar.sh/* ]]
}

if [[ "${OP_POLAR_LIVE}" == "1" ]]; then
  missing=""
  if [[ -z "${OP_POLAR_ACCESS_TOKEN}" ]]; then
    missing="POLAR_ACCESS_TOKEN"
  elif [[ -z "${OP_POLAR_WEBHOOK_SECRET}" ]]; then
    missing="POLAR_WEBHOOK_SECRET"
  elif [[ -z "${OP_POLAR_PRODUCT_ID}" ]]; then
    missing="POLAR_PRODUCT_ID"
  fi
  if [[ -n "$missing" ]]; then
    echo "BLOCKED-SECRET: ${missing}"
    record "live-checkout" "BLOCKED-SECRET" "${missing}"
  else
    live_port="$(pick_port)"
    live_db="${WORKDIR}/polar-live.sqlite"
    live_log="${WORKDIR}/polar-live.log"
    live_base="http://127.0.0.1:${live_port}"
    (
      cd "$root"
      unset POLAR_FIXTURE_ONLY || true
      export POLAR_LIVE=1
      export POLAR_ACCESS_TOKEN="${OP_POLAR_ACCESS_TOKEN}"
      export POLAR_WEBHOOK_SECRET="${OP_POLAR_WEBHOOK_SECRET}"
      export POLAR_PRODUCT_ID="${OP_POLAR_PRODUCT_ID}"
      if [[ -n "${OP_POLAR_API_BASE}" ]]; then
        export POLAR_API_BASE="${OP_POLAR_API_BASE}"
      fi
      export PORT="${live_port}"
      export DATABASE_PATH="${live_db}"
      export PUBLIC_BASE_URL="${live_base}"
      exec node --import tsx src/server.ts
    ) >"${live_log}" 2>&1 &
    LIVE_PID=$!
    if ! wait_health "$live_base"; then
      if grep -q 'BLOCKED-SECRET: POLAR_ACCESS_TOKEN' "${live_log}"; then
        echo "BLOCKED-SECRET: POLAR_ACCESS_TOKEN"
        record "live-checkout" "BLOCKED-SECRET" "POLAR_ACCESS_TOKEN"
      elif grep -q 'BLOCKED-SECRET: POLAR_WEBHOOK_SECRET' "${live_log}"; then
        echo "BLOCKED-SECRET: POLAR_WEBHOOK_SECRET"
        record "live-checkout" "BLOCKED-SECRET" "POLAR_WEBHOOK_SECRET"
      elif grep -q 'BLOCKED-SECRET: POLAR_PRODUCT_ID' "${live_log}"; then
        echo "BLOCKED-SECRET: POLAR_PRODUCT_ID"
        record "live-checkout" "BLOCKED-SECRET" "POLAR_PRODUCT_ID"
      else
        record "live-checkout" "FAIL" "live Polar process did not become healthy"
      fi
    else
      live_list="${WORKDIR}/live-list.json"
      live_list_hdrs="${WORKDIR}/live-list.hdrs"
      live_list_code="$(http_post_json "$live_base" "/listings" \
        "{\"company\":\"Live Checkout\",\"oneLiner\":\"Must not rank until Polar pays\",\"url\":\"https://live-${STAMP}.example\"}" \
        "$live_list" "$live_list_hdrs" || true)"
      live_id="$(json_field "$live_list" "id" || true)"
      live_bid="${WORKDIR}/live-bid.json"
      live_bid_hdrs="${WORKDIR}/live-bid.hdrs"
      live_bid_code="000"
      live_bid_url=""
      live_bid_loc=""
      live_bid_err=""
      if [[ -n "$live_id" ]]; then
        live_bid_code="$(http_post_json "$live_base" "/listings/${live_id}/bids" \
          '{"amountUsd":5}' "$live_bid" "$live_bid_hdrs" || true)"
        live_bid_url="$(json_field "$live_bid" "url" || true)"
        live_bid_loc="$(header_value "$live_bid_hdrs" "location" || true)"
        live_bid_err="$(json_field "$live_bid" "error" || true)"
      fi
      live_board="${WORKDIR}/live-board.html"
      http_get "$live_base" "/" "$live_board" >/dev/null || true
      if [[ "$live_bid_url" == /checkout/complete* ]] || grep -Eiq 'fix_' "$live_bid" 2>/dev/null; then
        record "live-checkout" "FAIL" "live Polar returned a fixture listing, not sandbox.polar.sh"
      elif { [[ "$live_bid_code" == "200" ]] || [[ "$live_bid_code" =~ ^30[12378]$ ]]; } \
        && { is_sandbox_checkout_url "$live_bid_url" || is_sandbox_checkout_url "$live_bid_loc"; }; then
        if html_has "$live_board" '#1 · \$5' || html_has "$live_board" 'data-bid="5"'; then
          record "live-checkout" "FAIL" "unpaid live Polar session appeared as ranked"
        else
          record "live-checkout" "PASS" "live Polar sandbox Checkout URL; unpaid session not ranked"
        fi
      elif [[ "$live_bid_code" == "503" && "$live_bid_err" == "polar_unavailable" ]]; then
        record "live-checkout" "PASS-ERROR" "POLAR_LIVE=1 secrets present; Polar sandbox checkout failed closed"
      elif [[ "$live_list_code" == "200" ]]; then
        record "live-checkout" "FAIL" "live bid HTTP ${live_bid_code} did not return sandbox.polar.sh"
      else
        record "live-checkout" "FAIL" "live listing HTTP ${live_list_code} bid HTTP ${live_bid_code}"
      fi
    fi
    if [[ -n "${LIVE_PID}" ]] && kill -0 "${LIVE_PID}" 2>/dev/null; then
      kill "${LIVE_PID}" 2>/dev/null || true
      wait "${LIVE_PID}" 2>/dev/null || true
    fi
    LIVE_PID=""
  fi
else
  if [[ -z "${OP_POLAR_ACCESS_TOKEN}" ]]; then
    echo "BLOCKED-SECRET: POLAR_ACCESS_TOKEN"
    record "live-checkout" "BLOCKED-SECRET" "POLAR_ACCESS_TOKEN"
  elif [[ -z "${OP_POLAR_WEBHOOK_SECRET}" ]]; then
    echo "BLOCKED-SECRET: POLAR_WEBHOOK_SECRET"
    record "live-checkout" "BLOCKED-SECRET" "POLAR_WEBHOOK_SECRET"
  elif [[ -z "${OP_POLAR_PRODUCT_ID}" ]]; then
    echo "BLOCKED-SECRET: POLAR_PRODUCT_ID"
    record "live-checkout" "BLOCKED-SECRET" "POLAR_PRODUCT_ID"
  else
    record "live-checkout" "PASS-ERROR" "POLAR_LIVE unset; secrets present but live Polar not invoked"
  fi
fi

echo
echo "== summary =="
echo "PASS=${PASS} PASS-ERROR=${PASS_ERROR} BLOCKED-SECRET=${BLOCKED} FAIL=${FAIL}"
echo "base=${BASE}"
if [[ -f "${RESULT_LOG}" ]]; then
  echo "----"
  while IFS=$'\t' read -r flow status note; do
    printf '%-22s %-16s %s\n' "$flow" "$status" "$note"
  done <"${RESULT_LOG}"
fi

if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
