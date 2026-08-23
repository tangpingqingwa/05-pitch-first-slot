# Pitch First Slot — Detailed Specification and Build Plan

**Product contract:** [SPEC.md](./SPEC.md) wins on auction rules, listing shape, and honesty.  
**This file** wins on stack, module boundaries, tests, and the PR sequence.  
**Git:** [CONTRIBUTING.md](./CONTRIBUTING.md). Every `### PR N` row is one squash-merged PR. `main` stays green.

Pay-to-rank clone of outbid.lol. USD. Polar + fixture. No chat, no NSFW, no invented traction.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 22 LTS + TypeScript `strict` | Same as the rest of the fleet |
| HTTP / HTML | Fastify 5, server-rendered templates | One process, no React SSR in v1 |
| DB | SQLite via `better-sqlite3` | One file, backup = copy |
| Money | Integer USD cents | No float dollars |
| Payments | `PolarPort` — fixture default; live Polar when `POLAR_LIVE=1` | Merchant of record; CI stays offline |
| Tests | `node:test` + `tsx` | No Jest |
| Time | UTC only; `weekId` = Monday 00:00 UTC date | SPEC cadence |
| Host | One VPS, Caddy TLS | No AWS required for v1 |

**Out of stack:** Prisma, Nest, Redis, Next.js, Vercel, Supabase, Stripe (Polar is the rail).

---

## 2. Process architecture

```
Browser
  GET /  /about  /rules
  POST /listings  /listings/:id/bids  /listings/:id/clicks
        │
        ▼
   Fastify app.ts
        │
        ├─ http/listings.ts
        ├─ http/bids.ts
        ├─ http/clicks.ts
        ├─ http/pages.ts          about / rules / board
        └─ http/health.ts
                │
                ▼
              core/
                week.ts           weekId from UTC clock
                listing.ts        validate company / one-liner / url
                rank.ts           bid desc, older wins ties
                url.ts            strip tracking, reject chat/NSFW
                clicks.ts         increment only
                show.ts           refuse cannot_buy_show
                │
        ┌───────┴────────┐
        ▼                ▼
   sqlite listings    PolarPort
   bids / clicks      fixture | live
```

HTTP handlers call `core/*` only. They do not import the live Polar client.

---

## 3. Target tree

```
05-pitch-first-slot/
  README.md
  SPEC.md
  BUILD.md
  CONTRIBUTING.md
  package.json
  tsconfig.json
  scripts/test.sh
  scripts/live-smoke.sh          # operator only; not in CI
  docs/live-smoke.md
  src/
    server.ts
    app.ts
    config.ts
    db.ts
    types.ts
    migrations/001_init.sql
    core/{week,listing,rank,url,clicks,show}.ts
    http/{health,pages,listings,bids,clicks}.ts
    views/skin.ts                # pitch-night stage, not a dashboard recolor
    billing/polar.ts             # PolarPort
    billing/polar_fixture.ts
    billing/polar_live.ts        # POLAR_LIVE=1 only
  tests/
    rank.test.ts
    url.test.ts
    week.test.ts
    listings.test.ts
    polar-fixture.test.ts
    clicks.test.ts
    show.test.ts
    pages.test.ts
```

---

## 4. Ranking (implementation)

```ts
function rankKey(b: Bid, listing: Listing): [number, string, string, string] {
  return [-b.amountUsd, b.paidAt, listing.createdAt, listing.id]
}
```

- Compare only bids with `weekId === currentWeekId()`.
- Raise: `chargeUsd = nextUsd - currentUsd`. Reject if `nextUsd <= currentUsd` or `nextUsd < 5`.
- First bid: `chargeUsd = nextUsd`, `nextUsd >= 5`.
- Do not store a `traction` column.

---

## 5. PolarPort

```ts
type PolarPort = {
  createCheckout(input: {
    listingId: string
    weekId: string
    chargeUsd: number
    nextUsd: number
  }): Promise<{ checkoutId: string; url: string }>
  applyPaid(checkoutId: string, paidAt: string): Promise<void>
}
```

Fixture `createCheckout` immediately `applyPaid` (or exposes a test hook). Live adapter returns a Polar hosted URL and applies on webhook.

`POLAR_FIXTURE_ONLY=1` always selects the fixture, including when `POLAR_LIVE=1`.

---

## 6. Tests (extend `scripts/test.sh`)

| Test | Assert |
|---|---|
| empty board | no fixture companies |
| min bid | $4 rejected; $5 accepted |
| raise | $5 → $12 charges $7 |
| tie | older `paidAt` stays above |
| tracking | `utm_` / `fbclid` stripped |
| chat | telegram / discord / wa.me → `no_chat` |
| clicks | 0 then 1; never seeded |
| show | extra-slot SKU → `cannot_buy_show` |
| week | clock at Monday 00:00 UTC drops last week's rank |
| traction | create body with `arr` does not render |
| polar fixture | rank moves with no network |
| live flag | unset / `0` does not call Polar |

When `src/` exists: `tsc --noEmit` and `node --import tsx --test tests/*.test.ts` inside `scripts/test.sh`. Do not delete the contract checks.

---

## 7. PR plan

Each PR is independently mergeable. Dependencies are hard.

### PR 1: Tooling skeleton

- **Description:** Node package, tsconfig, Fastify `GET /healthz`, extend `scripts/test.sh` to typecheck + run tests (health is enough).
- **Files:** `package.json`, `tsconfig.json`, `src/server.ts`, `src/app.ts`, `src/http/health.ts`, `scripts/test.sh`
- **Dependencies:** None
- **Acceptance:** `GET /healthz` 200 `{ ok: true }`. `scripts/test.sh` green.

### PR 2: Listings and empty board

- **Description:** SQLite listings; `POST /listings`; `GET /` empty or real rows; company + one-liner + URL only.
- **Files:** `src/db.ts`, `src/migrations/001_init.sql`, `src/core/listing.ts`, `src/http/listings.ts`, `src/http/pages.ts`, `tests/listings.test.ts`
- **Dependencies:** PR 1
- **Acceptance:** SPEC rows 1, 2, 10. No traction fields rendered.

### PR 3: Ranking, raise, weekly window

- **Description:** Bids, `weekId`, rank = bid, older wins ties, raise = difference, Monday UTC reset.
- **Files:** `src/core/rank.ts`, `src/core/week.ts`, `src/http/bids.ts`, `tests/rank.test.ts`, `tests/week.test.ts`
- **Dependencies:** PR 2
- **Acceptance:** SPEC rows 3–6, 12.

### PR 4: URL hygiene, public clicks, cannot-buy-the-show

- **Description:** Strip tracking; reject chat/NSFW; public click counter + redirect; refuse buying the rest of the show.
- **Files:** `src/core/url.ts`, `src/core/clicks.ts`, `src/core/show.ts`, `src/http/clicks.ts`, `tests/url.test.ts`, `tests/clicks.test.ts`, `tests/show.test.ts`
- **Dependencies:** PR 2
- **Acceptance:** SPEC rows 7–9, 11.

### PR 5: About, rules, Polar fixture

- **Description:** `/about` and `/rules` copy from SPEC. `PolarPort` fixture completes checkout and then rank updates.
- **Files:** `src/http/pages.ts`, `src/billing/polar.ts`, `src/billing/polar_fixture.ts`, `tests/polar-fixture.test.ts`
- **Dependencies:** PR 3, PR 4
- **Acceptance:** SPEC rows 13–14.

### PR 6: Live Polar (env-gated)

- **Description:** `polar_live.ts` behind `POLAR_LIVE=1`. Webhook applies payment. Fixture-only still wins. No live Polar in `scripts/test.sh`.
- **Files:** `src/billing/polar_live.ts`, `src/config.ts`, webhook route, `tests/polar-live-flag.test.ts`
- **Dependencies:** PR 5
- **Acceptance:** unset / `0` / fixture-only never hits Polar. Missing secrets fail closed.

### PR 7: live-smoke

- **Description:** Operator script starts the local process and walks every SPEC acceptance row. Live Polar only if `POLAR_LIVE=1` and secrets exist; otherwise fixture path + `BLOCKED-SECRET` for the live-checkout row. Not called from `scripts/test.sh` or Actions.
- **Files:** `scripts/live-smoke.sh`, `docs/live-smoke.md`
- **Dependencies:** PR 6
- **Acceptance:** script refuses `CI=true`. Offline `scripts/test.sh` still green. `docs/live-smoke.md` records PASS / PASS-ERROR / BLOCKED-SECRET per SPEC row. CI must not set `POLAR_LIVE`.

### PR 10: product UI — opening three minutes

- **Description:** Pitch-night stage for the opening slot. Claim chrome, dashed $amount, ±, Outbid. Empty week is an empty room. Company + deck URL + one-liner is the whole card. Unranked stays unranked until paid. Not a night-blue recolor.
- **Files:** `src/http/pages.ts`, `src/http/listings.ts`, `src/views/skin.ts`, `tests/pages.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 9
- **Acceptance:** `GET /` headline is opening three minutes. Empty/unranked HTML still forbids false-positive `#1`. Form Outbid starts Polar/fixture checkout. `scripts/test.sh` green offline.

---

## 8. Live flags

| Flag | Default | CI |
|---|---|---|
| `POLAR_LIVE` | unset (off) | must not be `1` |
| `POLAR_FIXTURE_ONLY` | unset; set `1` in `scripts/test.sh` once billing exists | allowed |
| `WEEK_NOW` | real UTC | tests may inject a clock |

---

## 9. Rollback

Any PR that makes `scripts/test.sh` red is reverted with `fix/` or `git revert` via PR. Do not force-push `main`.
