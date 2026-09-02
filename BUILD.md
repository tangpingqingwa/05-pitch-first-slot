# Pitch First Slot — Detailed Specification and Build Plan

**Product contract:** [SPEC.md](./SPEC.md) wins on auction rules, listing shape, and honesty.  
**This file** wins on stack, module boundaries, tests, and the PR sequence.  
**Git:** [CONTRIBUTING.md](./CONTRIBUTING.md). Every `### PR N` row is one squash-merged PR. `main` stays green.

Pay-to-rank clone of outbid.lol. USD. Waffo + fixture. No chat, no NSFW, no invented traction.

---

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 22 LTS + TypeScript `strict` | Same as the rest of the fleet |
| HTTP / HTML | Fastify 5, server-rendered templates | One process, no React SSR in v1 |
| DB | SQLite via `better-sqlite3` | One file, backup = copy |
| Money | Integer USD cents | No float dollars |
| Payments | `PaymentPort` — explicit fixture, Waffo test, or Waffo production mode | Merchant of record; CI stays offline |
| Tests | `node:test` + `tsx` | No Jest |
| Time | UTC only; public window = rolling last 7 days; `weekId` = Monday date label (audit, not raise identity) | SPEC cadence |
| Host | One VPS, Caddy TLS | No AWS required for v1 |

**Out of stack:** Prisma, Nest, Redis, Next.js, Vercel, Supabase, Stripe (Waffo is the rail).

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
                week.ts           rolling last-7-days window; weekId label
                listing.ts        validate company / one-liner / url
                rank.ts           bid desc, older wins ties
                url.ts            strip tracking, reject chat/NSFW
                clicks.ts         increment only
                show.ts           refuse cannot_buy_show
                │
        ┌───────┴────────┐
        ▼                ▼
   sqlite listings    PaymentPort
   bids / clicks      fixture | live
```

HTTP handlers call `core/*` only. They do not import the live Waffo client.

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
    billing/port.ts              # PaymentPort
    billing/index.ts              # canonical Waffo factory
    billing/waffo-fixture.ts      # offline only
    billing/waffo.ts              # official Waffo SDK adapter
  tests/
    rank.test.ts
    url.test.ts
    week.test.ts
    listings.test.ts
    waffo-payment.test.ts
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

- Compare only bids whose `paidAt` age is strictly less than 7 days (`now - 7d < paidAt <= now`). Not Monday 00:00 UTC.
- Raise identity is the same listing still inside that window — not `weekId`. Sunday pay raised Monday (ISO week rolled) still charges the difference. After 7 days the same listing is a new full bid.
- Raise: `chargeUsd = nextUsd - currentUsd`. Reject if `nextUsd <= currentUsd` or `nextUsd < 5`.
- First bid: `chargeUsd = nextUsd`, `nextUsd >= 5`.
- Do not store a `traction` column.

---

## 5. PaymentPort

```ts
type PaymentPort = {
  createCheckout(input: {
    listingId: string
    weekId: string
    chargeUsd: number
    nextUsd: number
  }): Promise<{ checkoutId: string; url: string }>
  applyPaid(checkoutId: string, paidAt: string): Promise<void>
}
```

Fixture `createCheckout` immediately `applyPaid` (or exposes a test hook). Live adapter returns a Waffo hosted URL and applies on webhook.

Only `WAFFO_MODE` selects a rail. Missing, invalid, or legacy selector values
fail closed. Production accepts only `WAFFO_MODE=waffo-prod` and an explicit
durable `DATABASE_PATH`.

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
| week | clock 7 days after `paidAt` drops last week's rank; Monday 00:00 UTC does not |
| traction | create body with `arr` does not render |
| waffo fixture | rank moves with no network |
| live flag | unset / `0` does not call Waffo |

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

- **Description:** Bids, `weekId` label, rank = bid, older wins ties, raise = difference, rolling last-7-days window.
- **Files:** `src/core/rank.ts`, `src/core/week.ts`, `src/http/bids.ts`, `tests/rank.test.ts`, `tests/week.test.ts`
- **Dependencies:** PR 2
- **Acceptance:** SPEC rows 3–6, 12.

### PR 4: URL hygiene, public clicks, cannot-buy-the-show

- **Description:** Strip tracking; reject chat/NSFW; public click counter + redirect; refuse buying the rest of the show.
- **Files:** `src/core/url.ts`, `src/core/clicks.ts`, `src/core/show.ts`, `src/http/clicks.ts`, `tests/url.test.ts`, `tests/clicks.test.ts`, `tests/show.test.ts`
- **Dependencies:** PR 2
- **Acceptance:** SPEC rows 7–9, 11.

### PR 5: About, rules, Waffo fixture

- **Description:** `/about` and `/rules` copy from SPEC. The explicit Waffo fixture completes checkout and then rank updates.
- **Files:** `src/http/pages.ts`, `src/billing/index.ts`, `src/billing/waffo-fixture.ts`, `tests/waffo-payment.test.ts`
- **Dependencies:** PR 3, PR 4
- **Acceptance:** SPEC rows 13–14.

### PR 6: Live Waffo (explicit mode)

- **Description:** `waffo.ts` uses the official SDK when `WAFFO_MODE=waffo-test` or `waffo-prod`. Signed webhooks apply payment. Fixture remains an explicit offline mode; no live Waffo in `scripts/test.sh`.
- **Files:** `src/billing/waffo.ts`, `src/config.ts`, webhook route, `tests/waffo-payment.test.ts`
- **Dependencies:** PR 5
- **Acceptance:** fixture is offline; missing, invalid, or legacy mode selectors never hit Waffo. Missing secrets fail closed.

### PR 7: live-smoke

- **Description:** Operator script starts the local process and walks every SPEC acceptance row. Live Waffo requires an explicit mode and complete deployment configuration; otherwise the fixture path is used only when explicitly selected. Not called from `scripts/test.sh` or Actions.
- **Files:** `scripts/live-smoke.sh`, `docs/live-smoke.md`
- **Dependencies:** PR 6
- **Acceptance:** script refuses `CI=true`. Offline `scripts/test.sh` still green. `docs/live-smoke.md` records PASS / PASS-ERROR / BLOCKED-SECRET per SPEC row.

### PR 10: product UI — opening three minutes

- **Description:** Pitch-night stage for the opening slot. Claim chrome, `Claim #1 for`, and a compact `− amount +` cluster. Empty week is an empty room. Company + deck URL + one-liner is the whole card. Unranked stays unranked until paid. Not a night-blue recolor.
- **Files:** `src/http/pages.ts`, `src/http/listings.ts`, `src/views/skin.ts`, `tests/pages.test.ts`, `scripts/test.sh`
- **Dependencies:** PR 9
- **Acceptance:** `GET /` headline is opening three minutes. Empty/unranked HTML still forbids false-positive `#1`. The `Claim rank` form starts Waffo/fixture checkout, and its visible `− amount +` controls stay centered and aligned on responsive rows. `scripts/test.sh` green offline.

---

## 8. Payment modes

| Flag | Default | CI |
|---|---|---|
| `WAFFO_MODE` | required | `fixture` in offline CI |
| `DATABASE_PATH` | explicit durable path in production | never `:memory:` in production |
| `WEEK_NOW` | real UTC | tests may inject a clock |

---

## 9. Rollback

Any PR that makes `scripts/test.sh` red is reverted with `fix/` or `git revert` via PR. Do not force-push `main`.
