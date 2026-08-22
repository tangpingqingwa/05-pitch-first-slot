# Pitch First Slot — Product Development Spec

**Version:** 1.0  
**Status:** Ready to build  
**Repo:** https://github.com/tangpingqingwa/05-pitch-first-slot  
**Market:** global English  
**Template:** pay-to-rank board in the shape of [outbid.lol](https://outbid.lol/)

This file is the product contract. If README or code disagree, fix one of them in the same PR.

---

## 1. Product statement

A public weekly auction for **one** scarce slot in front of angels and scouts: the **opening 3-minute pitch**, or **#1 on that week's deal list**. Rank is the bid. The room watches the price.

You **cannot** buy the rest of the show, the remaining agenda, or a private lock on every pitch.

One-line pitch: **This week's first three minutes are for sale. The rest of the room is not.**

---

## 2. Goals and non-goals

### Goals

- One English board. Same rules for founders in SF, London, Berlin, Bangalore.
- Highest **current** USD bid is #1 for the open week.
- A raise charges only the **difference** versus that listing's current bid.
- Equal bids: the **older** bid keeps the rank.
- Listing is company + one-liner + a deck or site URL. Nothing else ranks you.
- Public click counts on the deck/URL are real increments, never seeded.
- Weekly reset. Last week's #1 does not carry rank into the new week.
- Offline tests stay green with a Polar **fixture**. Live Polar is env-gated.

### Non-goals

- Buying the whole show, a block of slots, or “everyone else goes after us.”
- Invented traction: ARR, users, growth %, “hot,” scout scores, fake logos.
- Chat, comments, DMs, or founder-to-investor messaging.
- NSFW, adult, or dating inventory.
- Multi-track conferences, city-split boards, or a marketplace of many shows in v1.
- Accounts, social login, or a CRM for angels.

---

## 3. Market and cadence

| Rule | Value |
|---|---|
| Language | English UI and listing copy |
| Currency | USD, whole dollars |
| Audience | Angels, scouts, micro-funds, and founders watching each other |
| Prize | Opening 3-minute pitch **or** #1 line on the weekly deal list (same rank) |
| Window | One UTC week. Reset **Monday 00:00 UTC** |
| Inventory | Exactly **one** auctioned prize per week |

v1 is a single global board. Do not add city or sector lanes until ranking and reset are boring.

---

## 4. Listing shape

A listing is only:

| Field | Rule |
|---|---|
| `company` | 1–80 characters, trimmed. Required. |
| `oneLiner` | 1–140 characters, trimmed. What the company does. Required. |
| `url` | `https://` deck **or** company site. Required. One URL. |
| `createdAt` | Server clock, UTC. Used for tie-break. |

Optional, not shown on the public rank row: a contact email so the organizer can schedule the opening slot after the week closes. It does not affect rank.

**Forbidden on the listing and on the board:**

- ARR, MRR, revenue, user counts, growth rates, waitlist size
- “backed by,” fake scout quotes, star ratings, traction badges
- a second URL, file upload, or embedded PDF
- chat or calendar deep links as the listing URL

If the founder did not type a metric, the site must not invent one.

---

## 5. Auction rules (normative)

Clone of outbid.lol economics, with a weekly reset and a single prize.

1. **Currency.** USD. Integer dollars only. Store cents internally (`amount * 100`).
2. **Minimum.** First paid bid on a listing in a week is **$5**.
3. **Rank = bid.** Sort current-week bid descending. #1 is the opening slot.
4. **Ties.** Same bid amount: the **older** successful payment wins (earlier `paidAt`, then earlier `listing.createdAt`).
5. **Raise = difference.** If a listing is at $40 and the founder bids $55, Polar charges **$15**, not $55. The public bid becomes $55.
6. **Below #1 is allowed.** A $5 bid still lists, at the rank that amount buys.
7. **Same listing, same week.** One current bid per listing. A raise updates that row; it does not create a second row.
8. **New week.** All current bids expire. Ranked board starts empty. Listings may remain; they are unranked until a new paid bid in the new `weekId`.
9. **No retract.** A paid bid is not refundable because someone else raised.

`weekId` is the UTC Monday date of the open week, `YYYY-MM-DD`. Example: any instant from `2026-08-17T00:00:00Z` through `2026-08-23T23:59:59Z` is `weekId=2026-08-17`.

---

## 6. What you cannot buy

The SKU is **this week's opening slot** (3 minutes, or deal-list #1). There is no product for:

- the remaining pitch slots
- “host the whole show”
- pinning #1 for multiple weeks in one checkout
- hiding other listings

A request to buy more than the opening slot is **400** `cannot_buy_show`.

---

## 7. URLs, tracking, and public clicks

### Canonical URL

On write, normalize:

- require `https:`
- lowercase host
- drop `#fragment`
- **strip tracking query keys:** `utm_*`, `fbclid`, `gclid`, `gbraid`, `wbraid`, `msclkid`, `mc_eid`, `igshid`, `ref`, `ref_src`, `ref_url`, `yclid`
- drop empty `?`

Two listings with the same canonical URL in the same week collapse to one listing (the older one). A new bid on that URL raises the existing row.

### Reject

| Input | Error |
|---|---|
| non-https, `javascript:`, `data:` | `400 invalid_url` |
| chat hosts (`t.me`, `telegram.me`, `discord.gg`, `discord.com/invite`, `wa.me`, `chat.whatsapp.com`, `m.me`) | `400 no_chat` |
| operator NSFW / adult host list | `400 nsfw` |

### Public clicks

The deck/URL is a public outbound link. Each confirmed click increments `clicks` by 1. Start at **0**. Never seed, never estimate, never copy another listing's count.

---

## 8. Pages

| Path | Auth | Body |
|---|---|---|
| `GET /` | public | ranked board for the open week; bid + current $; company; one-liner; clickable URL; click count |
| `GET /about` | public | what the slot is; that you cannot buy the show |
| `GET /rules` | public | the auction rules in this SPEC |
| `POST /listings` | public | create listing (no payment yet) |
| `POST /listings/:id/bids` | public | start Polar checkout for first bid or raise |
| `POST /listings/:id/clicks` | public | increment clicks, then redirect to canonical URL |
| `GET /healthz` | public | `{ ok: true }` |

Empty week: honest empty state. Do not render sample startups.

No on-site chat. No comment thread.

---

## 9. Payments

**Live rail:** [Polar](https://polar.sh/) as merchant of record (global USD, tax).  
**Tests / CI:** `PolarPort` **fixture**. No network to Polar.

| Env | Behavior |
|---|---|
| unset / `POLAR_LIVE=0` | fixture or fail-closed; no live checkout |
| `POLAR_LIVE=1` + secrets | live Polar checkout + webhook |
| `POLAR_FIXTURE_ONLY=1` | **always** fixture; wins over `POLAR_LIVE` |

CI and `scripts/test.sh` must not set `POLAR_LIVE=1` and must not require Polar secrets.

A bid becomes current only after a successful payment (fixture or live webhook). Unpaid checkout sessions do not change rank.

---

## 10. Honesty

- Do not invent companies, bids, clicks, or traction to fill the homepage.
- Do not show a “typical raise” or fake #1 price.
- About page may state real totals **after** they exist. Until then, say the board is new.
- Operator takedown is allowed for fraud, NSFW, or impersonation. Takedown is not a rank edit.

---

## 11. Data model (implementation must match)

```ts
type WeekId = string // UTC Monday YYYY-MM-DD

type Listing = {
  id: string
  company: string
  oneLiner: string
  url: string          // canonical https, tracking stripped
  createdAt: string    // ISO UTC
  contactEmail?: string
}

type Bid = {
  listingId: string
  weekId: WeekId
  amountUsd: number    // integer dollars, >= 5
  paidAt: string       // ISO UTC of the payment that set this amount
}

type Click = {
  listingId: string
  count: number        // integer >= 0, only real increments
}
```

Rank key for the open week: `(-amountUsd, paidAt, listing.createdAt, listing.id)`.

---

## 12. Acceptance

| # | Case | Expected |
|---|---|---|
| 1 | Empty week | 200, zero listings, no sample companies |
| 2 | Listing: company + one-liner + https URL | 200, appears unranked until paid |
| 3 | First bid $4 | 400, min $5 |
| 4 | First bid $5 | rank by $5; Polar/fixture charged $5 |
| 5 | Raise $5 → $12 | charge **$7**; public bid $12 |
| 6 | Two listings both at $20; A paid first | A ranks above B |
| 7 | URL with `?utm_source=x&fbclid=1` | stored URL has those keys stripped |
| 8 | `https://t.me/foo` | 400 `no_chat` |
| 9 | Public click | `clicks` 0 → 1; redirect to canonical URL |
| 10 | Field `arr` or `users` on create | ignored or 400; never rendered |
| 11 | Checkout “all remaining slots” | 400 `cannot_buy_show` |
| 12 | Monday 00:00 UTC | previous bids unranked; board empty until new pays |
| 13 | Polar fixture | rank updates with no live Polar |
| 14 | `GET /about` and `GET /rules` | 200, state cannot-buy-the-show + weekly reset |

---

## 13. Milestones

**M1:** board + listings + ranking + hygiene + about/rules, Polar fixture.  
**M2:** live Polar, weekly reset job, public clicks.  
**M3:** operator live-smoke against the local process.

Launch = M2. Live-smoke is required before calling the product done.

---

## 14. Git collaboration (normative)

Development is GitHub trunk-based. **`main` is always cloneable, buildable, and testable.**

| Rule | Requirement |
|---|---|
| Integration branch | `main` only. No long-lived `develop`. |
| How code lands | Pull request into `main`. No direct push. |
| Required check | GitHub Actions workflow `ci` (job id `ci`) must be green. |
| Local / CI test | `bash scripts/test.sh` — offline, no Polar secrets. |
| Branch names | `feat/` `fix/` `docs/` `chore/` `test/` + short slug. |
| Merge | Squash. Delete the head branch. |
| Broken `main` | Treat as an incident. Fix on `fix/…` via PR. |

Full process: [CONTRIBUTING.md](./CONTRIBUTING.md).

Implementation plan (stack, modules, PR DAG): [BUILD.md](./BUILD.md).

Until there is an application binary, `scripts/test.sh` still has to pass: contract files exist, SPEC/CONTRIBUTING agree, no tracked secrets. Adding a server means **extending** that script with unit/contract tests. Live Polar is optional and must not be required for `main` to stay green.
