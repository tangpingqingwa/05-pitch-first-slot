#!/usr/bin/env bash
# Serve the exact emitted artifact from a disposable production-dependency
# install. The fixture rail is explicit and must make zero provider calls.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  if [[ -n "${log_path:-}" && -f "$log_path" ]]; then
    echo "built runtime log:" >&2
    cat "$log_path" >&2 || true
  fi
  exit 1
}

command -v curl >/dev/null || fail "curl is required for the built-runtime check"
command -v node >/dev/null || fail "node is required for the built-runtime check"
command -v npm >/dev/null || fail "npm is required for the production install check"
[[ -f "$root/dist/server.js" ]] || fail "dist/server.js is missing; run npm run build first"
[[ -d "$root/dist/migrations" ]] || fail "dist/migrations is missing; run npm run build first"

source_manifest="$(find "$root/src/migrations" -type f -name '*.sql' -exec basename {} \; | LC_ALL=C sort)"
runtime_manifest="$(find "$root/dist/migrations" -type f -name '*.sql' -exec basename {} \; | LC_ALL=C sort)"
[[ "$source_manifest" == "$runtime_manifest" ]] \
  || fail "runtime migration manifest differs from source"
if [[ -n "$source_manifest" ]]; then
  while IFS= read -r migration; do
    [[ -n "$migration" ]] || continue
    cmp -s "$root/src/migrations/$migration" "$root/dist/migrations/$migration" \
      || fail "runtime migration differs: $migration"
  done <<< "$source_manifest"
fi

workdir="$(mktemp -d "${TMPDIR:-/tmp}/pitch-first-slot-built.XXXXXX")"
runtime_root="$workdir/app"
db_path="$workdir/board.sqlite"
log_path="$workdir/server.log"
server_pid=""

kill_tree() {
  local pid="$1"
  local child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill_tree "$server_pid"
    wait "$server_pid" 2>/dev/null || true
  fi
  if [[ -n "${workdir:-}" && -d "$workdir" ]]; then
    rm -rf "$workdir"
  fi
}
trap cleanup EXIT

mkdir -p "$runtime_root"
cp "$root/package.json" "$root/package-lock.json" "$runtime_root/"
cp -R "$root/dist" "$runtime_root/dist"

echo "== production dependencies only =="
(cd "$runtime_root" && npm ci --omit=dev --no-audit --no-fund)
[[ ! -d "$runtime_root/node_modules/tsx" ]] \
  || fail "production-only install retained dev-only tsx"
[[ ! -e "$runtime_root/node_modules/.bin/tsx" ]] \
  || fail "production-only install retained the tsx executable"

port="$(node --input-type=module -e '
  import net from "node:net";
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address === null || typeof address === "string") process.exit(1);
    process.stdout.write(String(address.port));
    server.close();
  });
')"
base="http://127.0.0.1:${port}"

(
  cd "$runtime_root"
  exec env \
    -u WAFFO_MODE \
    -u WAFFO_API_BASE \
    -u WAFFO_MERCHANT_ID \
    -u WAFFO_STORE_ID \
    -u WAFFO_PRODUCT_ID \
    -u WAFFO_PRIVATE_KEY \
    -u WAFFO_PRIVATE_KEY_FILE \
    -u WAFFO_WEBHOOK_PUBLIC_KEY \
    -u WAFFO_WEBHOOK_TEST_PUBLIC_KEY \
    -u WAFFO_WEBHOOK_PROD_PUBLIC_KEY \
    -u DATABASE_PATH \
    -u PUBLIC_BASE_URL \
    -u POLAR_LIVE \
    -u POLAR_ACCESS_TOKEN \
    NODE_ENV=test \
    WAFFO_MODE=fixture \
    DATABASE_PATH="$db_path" \
    PUBLIC_BASE_URL="$base" \
    PORT="$port" \
    npm start
) >"$log_path" 2>&1 &
server_pid="$!"

ready=0
for _ in $(seq 1 120); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    break
  fi
  if curl -fsS --connect-timeout 2 --max-time 5 "$base/healthz" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.1
done
[[ "$ready" == 1 ]] || fail "compiled npm start did not answer /healthz"

health_body="$workdir/healthz.json"
health_code="$(curl -sS -o "$health_body" -w '%{http_code}' --connect-timeout 5 --max-time 10 "$base/healthz" || true)"
[[ "$health_code" == 200 ]] || fail "built GET /healthz returned HTTP $health_code"
node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const value = JSON.parse(readFileSync(process.argv[1], "utf8"));
  if (value?.ok !== true) process.exit(1);
' "$health_body" || fail "built GET /healthz did not return { ok: true }"

board_body="$workdir/board.html"
board_code="$(curl -sS -o "$board_body" -w '%{http_code}' --connect-timeout 5 --max-time 20 "$base/" || true)"
[[ "$board_code" == 200 ]] || fail "built GET / returned HTTP $board_code"
grep -Fq 'Opening three minutes' "$board_body" \
  || fail "built GET / did not render the pitch-first-slot board"
[[ -f "$db_path" ]] || fail "built runtime did not open the temporary durable SQLite path"
if grep -Eqi 'waffo checkout request|provider request|api\.waffo\.(ai|sh)' "$log_path"; then
  fail "fixture built-runtime smoke emitted a provider request marker"
fi

stop_pid="$server_pid"
server_pid=""
kill_tree "$stop_pid"
wait "$stop_pid" 2>/dev/null || true
echo "OK: compiled npm start served /healthz 200 and / 200; fixture provider calls=0"
