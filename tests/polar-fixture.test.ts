import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import {
  createPolarPort,
  polarFixtureOnly,
  polarLiveEnabled,
} from "../src/billing/polar.js";
import { PolarFixture } from "../src/billing/polar_fixture.js";
import { getBid, rankedBoard } from "../src/core/rank.js";
import { currentWeekId } from "../src/core/week.js";
import { openDatabase } from "../src/db.js";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const WEEK = "2026-08-17";

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

test("GET /about and GET /rules are 200 with cannot-buy-the-show + weekly reset", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const about = await app.inject({ method: "GET", url: "/about" });
  assert.equal(about.statusCode, 200);
  assert.match(about.headers["content-type"] ?? "", /text\/html/);
  assert.match(about.body, /cannot buy the show/i);
  assert.match(about.body, /opening 3-minute pitch/i);
  assert.match(about.body, /Monday 00:00 UTC/);
  assert.match(about.body, /The board is new/);
  assert.doesNotMatch(about.body, /\$[0-9]/);
  assert.doesNotMatch(about.body, /typical raise/i);

  const rules = await app.inject({ method: "GET", url: "/rules" });
  assert.equal(rules.statusCode, 200);
  assert.match(rules.headers["content-type"] ?? "", /text\/html/);
  assert.match(rules.body, /cannot buy the show/i);
  assert.match(rules.body, /Monday 00:00 UTC/);
  assert.match(rules.body, /\$5/);
  assert.match(rules.body, /older/);
  assert.match(rules.body, /difference/);
  assert.match(rules.body, /cannot_buy_show/);
  assert.match(rules.body, /weekly reset/i);
});

test("POLAR_FIXTURE_ONLY=1 wins over POLAR_LIVE=1", () => {
  assert.equal(polarFixtureOnly({}), false);
  assert.equal(polarFixtureOnly({ POLAR_FIXTURE_ONLY: "1" }), true);
  assert.equal(polarLiveEnabled({}), false);
  assert.equal(polarLiveEnabled({ POLAR_LIVE: "0" }), false);
  assert.equal(polarLiveEnabled({ POLAR_LIVE: "1" }), true);
  assert.equal(
    polarLiveEnabled({ POLAR_LIVE: "1", POLAR_FIXTURE_ONLY: "1" }),
    false,
  );

  const db = openDatabase(":memory:");
  after(() => db.close());
  const port = createPolarPort(db, {
    env: { POLAR_LIVE: "1", POLAR_FIXTURE_ONLY: "1" },
  });
  assert.ok(port instanceof PolarFixture);

  assert.throws(
    () => createPolarPort(db, { env: { POLAR_LIVE: "1" } }),
    /BLOCKED-SECRET: POLAR_ACCESS_TOKEN/,
  );
});

test("Polar fixture: rank updates with no live Polar", async () => {
  const app = await buildApp({
    databasePath: ":memory:",
    now: () => NOW,
  });
  after(() => app.close());

  const listing = await createListing(app, {
    company: "Helix Labs",
    oneLiner: "Benchtop instruments for small labs",
    url: "https://helix.example/deck",
  });

  const empty = await app.inject({ method: "GET", url: "/" });
  assert.match(empty.body, /Unranked — no paid bid yet/);
  assert.doesNotMatch(empty.body, /#1 · \$5/);

  const polar = createPolarPort(app.db, {
    env: { POLAR_FIXTURE_ONLY: "1", POLAR_LIVE: "1" },
  });
  assert.ok(polar instanceof PolarFixture);
  const started = await polar.createCheckout({
    listingId: listing.id,
    weekId: currentWeekId(NOW),
    chargeUsd: 5,
    nextUsd: 5,
  });
  assert.match(started.checkoutId, /^fix_/);
  assert.doesNotMatch(started.url, /polar\.sh/i);
  assert.doesNotMatch(started.url, /^https?:\/\//);
  assert.equal(polar.getCheckout(started.checkoutId)?.status, "paid");

  const bid = getBid(app.db, listing.id, WEEK);
  assert.ok(bid);
  assert.equal(bid.amountUsd, 5);
  assert.equal(bid.weekId, WEEK);

  const ranked = rankedBoard(app.db, WEEK);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.id, listing.id);
  assert.equal(ranked[0]?.rank, 1);
  assert.equal(ranked[0]?.bid.amountUsd, 5);

  const board = await app.inject({ method: "GET", url: "/" });
  assert.equal(board.statusCode, 200);
  assert.match(board.body, /#1 · \$5/);
  assert.match(board.body, /Helix Labs/);
  assert.doesNotMatch(board.body, /Unranked — no paid bid yet/);
});

test("Polar fixture raise $5 → $12 charges $7 then rank updates", async () => {
  const app = await buildApp({
    databasePath: ":memory:",
    now: () => NOW,
  });
  after(() => app.close());

  const listing = await createListing(app, {
    company: "Northwind",
    oneLiner: "Invoice tools for wholesalers",
    url: "https://northwind.example",
  });
  const polar = new PolarFixture(app.db);

  const first = await polar.createCheckout({
    listingId: listing.id,
    weekId: WEEK,
    chargeUsd: 5,
    nextUsd: 5,
  });
  assert.equal(polar.getCheckout(first.checkoutId)?.chargeUsd, 5);

  const raised = await polar.createCheckout({
    listingId: listing.id,
    weekId: WEEK,
    chargeUsd: 7,
    nextUsd: 12,
  });
  assert.equal(polar.getCheckout(raised.checkoutId)?.chargeUsd, 7);
  assert.equal(getBid(app.db, listing.id, WEEK)?.amountUsd, 12);

  const board = await app.inject({ method: "GET", url: "/" });
  assert.match(board.body, /#1 · \$12/);
  assert.doesNotMatch(board.body, /#2/);
});

test("unpaid Polar fixture checkout does not change rank", async () => {
  const app = await buildApp({
    databasePath: ":memory:",
    now: () => NOW,
  });
  after(() => app.close());

  const listing = await createListing(app, {
    company: "Open Bid Co",
    oneLiner: "Unpaid checkout stays unranked",
    url: "https://open-bid.example",
  });
  const polar = new PolarFixture(app.db, { autoSettle: false });
  const started = await polar.createCheckout({
    listingId: listing.id,
    weekId: WEEK,
    chargeUsd: 5,
    nextUsd: 5,
  });
  assert.equal(polar.getCheckout(started.checkoutId)?.status, "pending");
  assert.equal(getBid(app.db, listing.id, WEEK), undefined);
  assert.deepEqual(rankedBoard(app.db, WEEK), []);
  assert.match(
    (await app.inject({ method: "GET", url: "/" })).body,
    /Unranked — no paid bid yet/,
  );

  await polar.applyPaid(started.checkoutId, NOW.toISOString());
  assert.equal(polar.getCheckout(started.checkoutId)?.status, "paid");
  assert.equal(getBid(app.db, listing.id, WEEK)?.amountUsd, 5);
  assert.match(
    (await app.inject({ method: "GET", url: "/" })).body,
    /#1 · \$5/,
  );
});
