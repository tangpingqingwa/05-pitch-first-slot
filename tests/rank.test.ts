import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import {
  compareRank,
  getBid,
  getBidInRollingWeek,
  MIN_BID_USD,
  quoteBid,
  rankKey,
  rankListings,
  type Bid,
} from "../src/core/rank.js";
import { currentWeekId } from "../src/core/week.js";
import type { Listing } from "../src/core/listing.js";

const WEEK = "2026-08-17";

function listing(
  partial: Partial<Listing> & Pick<Listing, "id" | "createdAt">,
): Listing {
  return {
    company: partial.company ?? `Co ${partial.id}`,
    oneLiner: partial.oneLiner ?? `Does ${partial.id}`,
    url: partial.url ?? `https://${partial.id}.example`,
    ...partial,
  };
}

function bid(
  partial: Partial<Bid> & Pick<Bid, "listingId" | "amountUsd" | "paidAt">,
): Bid {
  return {
    weekId: WEEK,
    ...partial,
  };
}

async function createListing(
  app: Awaited<ReturnType<typeof buildApp>>,
  body: { company: string; oneLiner: string; url: string },
): Promise<{ id: string }> {
  const created = await app.inject({
    method: "POST",
    url: "/listings",
    payload: body,
  });
  assert.equal(created.statusCode, 200);
  return created.json() as { id: string };
}

test("rankKey is (-amountUsd, paidAt, listing.createdAt, listing.id)", () => {
  const row = listing({ id: "lst_a", createdAt: "2026-08-17T10:00:00.000Z" });
  const paid = bid({
    listingId: row.id,
    amountUsd: 20,
    paidAt: "2026-08-18T09:00:00.000Z",
  });
  assert.deepEqual(rankKey(paid, row), [
    -20,
    "2026-08-18T09:00:00.000Z",
    "2026-08-17T10:00:00.000Z",
    "lst_a",
  ]);
});

test("older paidAt wins a tie, then older listing.createdAt", () => {
  const olderPay = {
    listing: listing({ id: "a", createdAt: "2026-08-18T00:00:00.000Z" }),
    bid: bid({
      listingId: "a",
      amountUsd: 20,
      paidAt: "2026-08-19T08:00:00.000Z",
    }),
  };
  const newerPay = {
    listing: listing({ id: "b", createdAt: "2026-08-17T00:00:00.000Z" }),
    bid: bid({
      listingId: "b",
      amountUsd: 20,
      paidAt: "2026-08-19T09:00:00.000Z",
    }),
  };
  assert.ok(compareRank(olderPay, newerPay) < 0);

  const olderListing = {
    listing: listing({ id: "c", createdAt: "2026-08-17T00:00:00.000Z" }),
    bid: bid({
      listingId: "c",
      amountUsd: 20,
      paidAt: "2026-08-19T10:00:00.000Z",
    }),
  };
  const newerListing = {
    listing: listing({ id: "d", createdAt: "2026-08-18T00:00:00.000Z" }),
    bid: bid({
      listingId: "d",
      amountUsd: 20,
      paidAt: "2026-08-19T10:00:00.000Z",
    }),
  };
  assert.ok(compareRank(olderListing, newerListing) < 0);
});

test("rankListings uses only the rolling last-7-days paidAt window", () => {
  const now = new Date("2026-08-24T00:00:00.000Z");
  const current = {
    listing: listing({ id: "now", createdAt: "2026-08-17T00:00:00.000Z" }),
    bid: bid({
      listingId: "now",
      amountUsd: 5,
      paidAt: "2026-08-17T00:00:00.000Z",
    }),
  };
  const previous = {
    listing: listing({ id: "then", createdAt: "2026-08-10T00:00:00.000Z" }),
    bid: bid({
      listingId: "then",
      weekId: "2026-08-10",
      amountUsd: 99,
      paidAt: "2026-08-16T23:59:59.000Z",
    }),
  };
  const ranked = rankListings([previous, current], now);
  assert.deepEqual(
    ranked.map((row) => ({ id: row.id, rank: row.rank, amountUsd: row.bid.amountUsd })),
    [{ id: "now", rank: 1, amountUsd: 5 }],
  );
});

test("first bid $5 charges $5; raise $5 → $12 charges $7", () => {
  assert.deepEqual(quoteBid(undefined, MIN_BID_USD), {
    chargeUsd: 5,
    nextUsd: 5,
  });
  const current = bid({
    listingId: "lst",
    amountUsd: 5,
    paidAt: "2026-08-17T01:00:00.000Z",
  });
  assert.deepEqual(quoteBid(current, 12), { chargeUsd: 7, nextUsd: 12 });
});

test("SPEC 3: first bid $4 is 400 min $5", async () => {
  const app = await buildApp({
    databasePath: ":memory:",
    now: () => new Date("2026-08-19T12:00:00.000Z"),
  });
  after(() => app.close());

  const listingRow = await createListing(app, {
    company: "Helix Labs",
    oneLiner: "Benchtop instruments for small labs",
    url: "https://helix.example/deck",
  });
  const bidRes = await app.inject({
    method: "POST",
    url: `/listings/${listingRow.id}/bids`,
    payload: { amountUsd: 4 },
  });
  assert.equal(bidRes.statusCode, 400);
  assert.equal(bidRes.json().error, "min_bid");

  const board = await app.inject({ method: "GET", url: "/" });
  assert.doesNotMatch(board.body, /\$4/);
  assert.doesNotMatch(board.body, /#1/);
  assert.match(board.body, /Unranked — no paid bid yet/);
});

test("SPEC 4: first bid $5 ranks by $5 and charges $5", async () => {
  const app = await buildApp({
    databasePath: ":memory:",
    now: () => new Date("2026-08-19T12:00:00.000Z"),
  });
  after(() => app.close());

  const listingRow = await createListing(app, {
    company: "Helix Labs",
    oneLiner: "Benchtop instruments for small labs",
    url: "https://helix.example/deck",
  });
  const bidRes = await app.inject({
    method: "POST",
    url: `/listings/${listingRow.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(bidRes.statusCode, 200);
  const body = bidRes.json() as {
    amountUsd: number;
    chargeUsd: number;
    weekId: string;
  };
  assert.equal(body.amountUsd, 5);
  assert.equal(body.chargeUsd, 5);
  assert.equal(body.weekId, WEEK);

  const board = await app.inject({ method: "GET", url: "/" });
  assert.equal(board.statusCode, 200);
  assert.match(board.body, /#1 · \$5/);
  assert.match(board.body, /Helix Labs/);
  assert.doesNotMatch(board.body, /Unranked — no paid bid yet/);
});

test("SPEC 5: raise $5 → $12 charges $7 and keeps one current bid", async () => {
  const app = await buildApp({
    databasePath: ":memory:",
    now: () => new Date("2026-08-19T12:00:00.000Z"),
  });
  after(() => app.close());

  const listingRow = await createListing(app, {
    company: "Northwind",
    oneLiner: "Invoice tools for wholesalers",
    url: "https://northwind.example",
  });
  const first = await app.inject({
    method: "POST",
    url: `/listings/${listingRow.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(first.statusCode, 200);
  const raised = await app.inject({
    method: "POST",
    url: `/listings/${listingRow.id}/bids`,
    payload: { amountUsd: 12 },
  });
  assert.equal(raised.statusCode, 200);
  const body = raised.json() as { amountUsd: number; chargeUsd: number };
  assert.equal(body.amountUsd, 12);
  assert.equal(body.chargeUsd, 7);

  const same = await app.inject({
    method: "POST",
    url: `/listings/${listingRow.id}/bids`,
    payload: { amountUsd: 12 },
  });
  assert.equal(same.statusCode, 400);
  assert.equal(same.json().error, "bid_not_higher");

  const board = await app.inject({ method: "GET", url: "/" });
  assert.match(board.body, /#1 · \$12/);
  assert.doesNotMatch(board.body, /#2/);
  assert.equal((board.body.match(/Northwind/g) ?? []).length, 1);
});

test("SPEC 6: two $20 bids — older paidAt stays above", async () => {
  let now = new Date("2026-08-19T10:00:00.000Z");
  const app = await buildApp({
    databasePath: ":memory:",
    now: () => now,
  });
  after(() => app.close());

  const first = await createListing(app, {
    company: "Alpha Pitch",
    oneLiner: "Older payment at twenty",
    url: "https://alpha.example",
  });
  const second = await createListing(app, {
    company: "Beta Pitch",
    oneLiner: "Newer payment at twenty",
    url: "https://beta.example",
  });

  const aBid = await app.inject({
    method: "POST",
    url: `/listings/${first.id}/bids`,
    payload: { amountUsd: 20 },
  });
  assert.equal(aBid.statusCode, 200);

  now = new Date("2026-08-19T11:00:00.000Z");
  const bBid = await app.inject({
    method: "POST",
    url: `/listings/${second.id}/bids`,
    payload: { amountUsd: 20 },
  });
  assert.equal(bBid.statusCode, 200);

  const board = await app.inject({ method: "GET", url: "/" });
  assert.equal(board.statusCode, 200);
  const alpha = board.body.indexOf("Alpha Pitch");
  const beta = board.body.indexOf("Beta Pitch");
  assert.ok(alpha >= 0 && beta >= 0);
  assert.ok(alpha < beta);
  assert.match(board.body, /data-rank="1"[\s\S]*Alpha Pitch/);
  assert.match(board.body, /data-rank="2"[\s\S]*Beta Pitch/);
});

test("below #1 still lists at the rank that amount buys", async () => {
  const app = await buildApp({
    databasePath: ":memory:",
    now: () => new Date("2026-08-19T12:00:00.000Z"),
  });
  after(() => app.close());

  const top = await createListing(app, {
    company: "Top Slot",
    oneLiner: "High bid",
    url: "https://top.example",
  });
  const under = await createListing(app, {
    company: "Under Slot",
    oneLiner: "Low bid still lists",
    url: "https://under.example",
  });
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/listings/${top.id}/bids`,
        payload: { amountUsd: 40 },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/listings/${under.id}/bids`,
        payload: { amountUsd: 5 },
      })
    ).statusCode,
    200,
  );

  const board = await app.inject({ method: "GET", url: "/" });
  assert.match(board.body, /#1 · \$40/);
  assert.match(board.body, /#2 · \$5/);
  assert.match(board.body, /Under Slot/);
});

test("SPEC 12: rolling last 7 days drops last week's rank — not Monday 00:00 UTC", async () => {
  let now = new Date("2026-08-16T12:00:00.000Z");
  const app = await buildApp({
    databasePath: ":memory:",
    now: () => now,
  });
  after(() => app.close());

  const listingRow = await createListing(app, {
    company: "Last Week Winner",
    oneLiner: "Won the previous window",
    url: "https://last-week.example",
  });
  const paid = await app.inject({
    method: "POST",
    url: `/listings/${listingRow.id}/bids`,
    payload: { amountUsd: 20 },
  });
  assert.equal(paid.statusCode, 200);
  assert.equal((paid.json() as { weekId: string }).weekId, "2026-08-10");
  assert.match(
    (await app.inject({ method: "GET", url: "/" })).body,
    /#1 · \$20/,
  );

  now = new Date("2026-08-17T00:00:00.000Z");
  const monday = await app.inject({ method: "GET", url: "/" });
  assert.equal(monday.statusCode, 200);
  assert.match(monday.body, /#1 · \$20/);
  assert.match(monday.body, /data-rolling-week="true"/);
  assert.match(monday.body, /Rolling last 7 days\. Not Monday 00:00 UTC\./);
  assert.doesNotMatch(monday.body, /Unranked — no paid bid yet/);

  now = new Date("2026-08-23T12:00:01.000Z");
  const board = await app.inject({ method: "GET", url: "/" });
  assert.equal(board.statusCode, 200);
  assert.match(board.body, /Last Week Winner/);
  assert.match(board.body, /Unranked — no paid bid yet/);
  assert.doesNotMatch(board.body, /#1 · \$20/);
  assert.doesNotMatch(board.body, /data-rank="/);

  const next = await app.inject({
    method: "POST",
    url: `/listings/${listingRow.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(next.statusCode, 200);
  const nextBody = next.json() as { weekId: string; chargeUsd: number };
  assert.equal(nextBody.weekId, WEEK);
  assert.equal(nextBody.chargeUsd, 5);
  assert.match(
    (await app.inject({ method: "GET", url: "/" })).body,
    /#1 · \$5/,
  );
});

test("same listing still inside last-7-days raises after the UTC week label rolls", async () => {
  let now = new Date("2026-08-16T12:00:00.000Z");
  const app = await buildApp({
    databasePath: ":memory:",
    now: () => now,
  });
  after(() => app.close());

  const listingRow = await createListing(app, {
    company: "Sunday Pitch",
    oneLiner: "Paid before Monday midnight",
    url: "https://sunday-pitch.example/deck",
  });
  const paid = await app.inject({
    method: "POST",
    url: `/listings/${listingRow.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(paid.statusCode, 200);
  const sunday = paid.json() as {
    weekId: string;
    chargeUsd: number;
    amountUsd: number;
  };
  assert.equal(sunday.weekId, "2026-08-10");
  assert.equal(sunday.chargeUsd, 5);
  assert.equal(sunday.amountUsd, 5);

  now = new Date("2026-08-17T00:00:00.000Z");
  const mondayLabel = currentWeekId(now);
  assert.equal(mondayLabel, "2026-08-17");
  assert.notEqual(mondayLabel, sunday.weekId);
  assert.equal(getBid(app.db, listingRow.id, mondayLabel), undefined);
  assert.equal(getBidInRollingWeek(app.db, listingRow.id, now)?.amountUsd, 5);
  assert.equal(getBidInRollingWeek(app.db, listingRow.id, now)?.weekId, "2026-08-10");

  const raised = await app.inject({
    method: "POST",
    url: `/listings/${listingRow.id}/bids`,
    payload: { amountUsd: 12 },
  });
  assert.equal(raised.statusCode, 200);
  const raiseBody = raised.json() as {
    weekId: string;
    chargeUsd: number;
    amountUsd: number;
  };
  assert.equal(raiseBody.chargeUsd, 7);
  assert.equal(raiseBody.amountUsd, 12);
  assert.equal(raiseBody.weekId, "2026-08-10");
  assert.equal(getBid(app.db, listingRow.id, "2026-08-10")?.amountUsd, 12);
  assert.equal(getBid(app.db, listingRow.id, mondayLabel), undefined);

  const formRaise = await app.inject({
    method: "POST",
    url: "/listings",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html",
    },
    payload: new URLSearchParams({
      company: "Sunday Pitch",
      oneLiner: "Paid before Monday midnight",
      url: "https://sunday-pitch.example/deck",
      amountUsd: "20",
    }).toString(),
  });
  assert.equal(formRaise.statusCode, 303);
  assert.equal(getBid(app.db, listingRow.id, "2026-08-10")?.amountUsd, 20);
  assert.equal(getBid(app.db, listingRow.id, mondayLabel), undefined);

  const board = await app.inject({ method: "GET", url: "/" });
  assert.match(board.body, /#1 · \$20/);
  assert.doesNotMatch(board.body, /#2/);
  assert.equal((board.body.match(/Sunday Pitch/g) ?? []).length, 1);

  now = new Date("2026-08-24T00:00:01.000Z");
  assert.equal(getBidInRollingWeek(app.db, listingRow.id, now), undefined);
  const next = await app.inject({
    method: "POST",
    url: `/listings/${listingRow.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(next.statusCode, 200);
  const nextBody = next.json() as {
    weekId: string;
    chargeUsd: number;
    amountUsd: number;
  };
  assert.equal(nextBody.chargeUsd, 5);
  assert.equal(nextBody.amountUsd, 5);
  assert.equal(nextBody.weekId, "2026-08-24");
});
