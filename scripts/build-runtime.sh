#!/usr/bin/env bash
# Emit the production Node artifact and copy the runtime migration assets.
# This is deliberately separate from typecheck: npm start must not need tsx.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

[[ -x "$root/node_modules/.bin/tsc" ]] \
  || fail "local TypeScript compiler is missing; run npm ci first"

# dist/ is a generated, ignored build output. Recreate it so stale JavaScript
# or migration files cannot survive a clean production build.
rm -rf "$root/dist"
"$root/node_modules/.bin/tsc" -p "$root/tsconfig.build.json"

[[ -f "$root/dist/server.js" ]] || fail "build did not emit dist/server.js"
mkdir -p "$root/dist/migrations"
for source in "$root"/src/migrations/*.sql; do
  [[ -f "$source" ]] || fail "no SQL migrations found"
  cp "$source" "$root/dist/migrations/$(basename "$source")"
done

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

echo "OK: emitted dist/server.js and byte-identical migration manifest"
