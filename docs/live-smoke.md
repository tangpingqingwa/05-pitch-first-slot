# Live smoke — Pitch First Slot

Operator-only. `bash scripts/live-smoke.sh` is **not** called from `scripts/test.sh` or GitHub Actions. CI and `scripts/test.sh` stay offline and must not set `POLAR_LIVE`.

`100%` for this unit means a **local process** walked every SPEC §12 acceptance row. Fixture checkout is the default path. Live Polar runs only when `POLAR_LIVE=1` and secrets exist. Missing Polar secret is `BLOCKED-SECRET` naming the env var — that is not a fixture success. Do not invent companies, bids, or click counts. An empty week is valid.

## How to run

```bash
bash scripts/live-smoke.sh
```

The script:

1. Refuses `CI=true` and `GITHUB_ACTIONS=true`.
2. Starts `node --import tsx src/server.ts` on a free loopback port with a temp SQLite file, Polar env unset, `POLAR_FIXTURE_ONLY=1`.
3. Or attaches to `LIVE_SMOKE_BASE` if that server already answers `GET /healthz`.
4. Walks every SPEC §12 row against the running process.
5. Live Polar: if `POLAR_LIVE` is not `1` or `POLAR_ACCESS_TOKEN` / `POLAR_WEBHOOK_SECRET` is empty, prints `BLOCKED-SECRET: <env>` for the live-checkout row.
6. Kills the process it started and deletes the temp database.

Overrides: `LIVE_SMOKE_BASE`, `LIVE_SMOKE_PORT`.

Live Polar (operator machine with real secrets):

```bash
POLAR_LIVE=1 POLAR_ACCESS_TOKEN=… POLAR_WEBHOOK_SECRET=… bash scripts/live-smoke.sh
```

## Verdicts

| Label | Meaning |
|---|---|
| `PASS` | Flow completed as SPEC requires. |
| `PASS-ERROR` | Documented product error; nothing invented. |
| `BLOCKED-SECRET` | Live Polar secret missing. Exact env var named. |
| `FAIL` | Broken product or invented listing/count. |

## This session

Ran `bash scripts/live-smoke.sh` on **2026-08-22** from `feat/live-smoke` (parent `63f5f12`, Polar live on `origin/main`). Local process started by the script on `http://127.0.0.1:52157`. Temp SQLite. `POLAR_LIVE` unset. `POLAR_ACCESS_TOKEN` unset. `POLAR_WEBHOOK_SECRET` unset. Fixture path. No invented companies: empty board first, then unique `*.example` URLs for this run.

Also refused `CI=true` (`FAIL: live-smoke refuses CI=true`) and `GITHUB_ACTIONS=true`.

| # | Case | Result | Note |
|---|---|---|---|
| 1 | Empty week | **PASS** | `GET /` 200. Zero listings. No sample companies. |
| 2 | Listing: company + one-liner + https URL | **PASS** | `POST /listings` 200. Helix Labs unranked until paid. |
| 3 | First bid $4 | **PASS-ERROR** | `POST /listings/:id/bids` $4 → 400 `min_bid`. |
| 4 | First bid $5 | **PASS** | Fixture charged $5. Public rank `#1 · $5`. |
| 5 | Raise $5 → $12 | **PASS** | Charge **$7**. Public bid $12. |
| 6 | Two listings both at $20; A paid first | **PASS** | Alpha #1, Beta #2. |
| 7 | URL with `?utm_source=x&fbclid=1` | **PASS** | Stored URL has those keys stripped. |
| 8 | `https://t.me/foo` | **PASS-ERROR** | 400 `no_chat`. |
| 9 | Public click | **PASS** | `POST /listings/:id/clicks` 302 to canonical URL. Clicks `0 → 1`. |
| 10 | Field `arr` or `users` on create | **PASS** | Ignored. Never rendered. |
| 11 | Checkout “all remaining slots” | **PASS-ERROR** | 400 `cannot_buy_show`. |
| 12 | Monday 00:00 UTC | **PASS** | Previous bids unranked. Listing remains; board has no current-week rank until a new pay. |
| 13 | Polar fixture | **PASS** | Rank updates with `POLAR_LIVE` unset. No Polar network. |
| 14 | `GET /about` and `GET /rules` | **PASS** | 200. Cannot-buy-the-show + weekly reset. |
| — | Live Polar checkout | **BLOCKED-SECRET** | `BLOCKED-SECRET: POLAR_ACCESS_TOKEN` |

Process exit 0 (`PASS=11` `PASS-ERROR=3` `BLOCKED-SECRET=1` `FAIL=0`). Re-run with `POLAR_LIVE=1` and real Polar secrets to complete hosted checkout; missing token must stay `BLOCKED-SECRET`, never a fixture listing.

## What this does not do

- Does not call `scripts/live-smoke.sh` from `scripts/test.sh` or Actions.
- Does not set `POLAR_LIVE=1` in CI.
- Does not seed fake companies, bids, or click counts on an empty week.
- Does not treat a missing Polar secret as a paid listing.
