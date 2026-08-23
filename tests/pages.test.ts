import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import { getBid } from "../src/core/rank.js";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const WEEK = "2026-08-17";

const SAMPLE_COMPANIES = [
  "Acme",
  "OpenAI",
  "Stripe",
  "Y Combinator",
  "sample startup",
];

function assertNoFalsePositiveRank(html: string): void {
  assert.doesNotMatch(html, /#1/);
  assert.doesNotMatch(html, /#2/);
  assert.doesNotMatch(html, /\$[0-9]/);
}

function assertPitchNightChrome(html: string): void {
  assert.match(html, /<h1 class="headline">Opening three minutes<\/h1>/);
  assert.match(html, /class="outbid">Outbid<\/button>/);
  assert.match(html, /data-bid-step="-1"/);
  assert.match(html, /data-bid-step="1"/);
  assert.match(html, /class="bid-field"/);
  assert.match(html, /name="company"/);
  assert.match(html, /name="url"/);
  assert.match(html, /name="oneLiner"/);
  assert.match(html, /name="amountUsd"/);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /traction meter/i);
  assert.doesNotMatch(html, /loading/i);
  assert.doesNotMatch(html, /remaining agenda for sale/i);
  assert.doesNotMatch(html, /name="arr"/);
  assert.doesNotMatch(html, /name="users"/);
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

test("GET / opening three minutes is a pitch-night stage with honest empty room — first slot is still open", async () => {
  const app = await buildApp({ databasePath: ":memory:", now: () => NOW });
  after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const html = response.body;
  assertPitchNightChrome(html);
  assert.match(html, /id="claim"/);
  assert.match(html, /class="claim-note" data-empty-room/);
  assert.match(html, /The room is empty\./);
  assert.match(html, /This week's first slot is still open\. Outbid takes it after Polar lands\./);
  assert.doesNotMatch(html, /The board is empty/);
  assert.doesNotMatch(html, /No listings this week/);
  assert.doesNotMatch(html, /class="empty-board"/);
  assert.doesNotMatch(html, /class="listing"/);
  assert.doesNotMatch(html, /<ul class="listings">/);
  assert.doesNotMatch(html, /data-occupied-raise/);
  assert.doesNotMatch(html, /Polar charges only the difference/);
  assertNoFalsePositiveRank(html);
  for (const name of SAMPLE_COMPANIES) {
    assert.doesNotMatch(html, new RegExp(name, "i"));
  }
});

test("unranked listing stays a cue card without #1 until Polar lands", async () => {
  const app = await buildApp({ databasePath: ":memory:", now: () => NOW });
  after(() => app.close());

  await createListing(app, {
    company: "Helix Labs",
    oneLiner: "Benchtop instruments for small labs",
    url: "https://helix.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  assert.match(html, /Helix Labs/);
  assert.match(html, /Benchtop instruments for small labs/);
  assert.match(html, /https:\/\/helix\.example\/deck/);
  assert.match(html, /Unranked — no paid bid yet/);
  assert.match(html, /data-unranked="true"/);
  assert.match(html, /class="who"[\s\S]*Helix Labs[\s\S]*Benchtop instruments for small labs[\s\S]*Deck or site[\s\S]*https:\/\/helix\.example\/deck/);
  assert.match(html, /class="seat"[\s\S]*Bid[\s\S]*Unranked — no paid bid yet/);
  assert.doesNotMatch(html, /The board is empty/);
  assert.doesNotMatch(html, /first slot is still open/);
  assert.doesNotMatch(html, /data-empty-room/);
  assert.doesNotMatch(html, /data-occupied-raise/);
  assert.doesNotMatch(html, /Polar charges only the difference/);
  assert.doesNotMatch(html, /data-rank="/);
  assertNoFalsePositiveRank(html);
});

test("HTML Outbid form creates the listing then fixture-ranks the opening slot", async () => {
  const app = await buildApp({ databasePath: ":memory:", now: () => NOW });
  after(() => app.close());

  const posted = await app.inject({
    method: "POST",
    url: "/listings",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html",
    },
    payload: new URLSearchParams({
      company: "Stage Co",
      oneLiner: "Opens the room",
      url: "https://stage.example/deck",
      amountUsd: "5",
    }).toString(),
  });
  assert.equal(posted.statusCode, 303);
  assert.match(String(posted.headers.location), /^\/checkout\/complete/);

  const board = await app.inject({ method: "GET", url: "/" });
  assert.match(board.body, /#1 · \$5/);
  assert.match(board.body, /Stage Co/);
  assert.match(board.body, /Opens the room/);
  assert.match(board.body, /https:\/\/stage\.example\/deck/);
  assert.match(
    board.body,
    /class="cue"[\s\S]*class="who"[\s\S]*Stage Co[\s\S]*Opens the room[\s\S]*Deck or site[\s\S]*https:\/\/stage\.example\/deck[\s\S]*class="seat"[\s\S]*Bid[\s\S]*#1 · \$5/,
  );
  assert.doesNotMatch(board.body, /Unranked — no paid bid yet/);
  assert.doesNotMatch(board.body, /The room is empty/);
  assert.doesNotMatch(board.body, /first slot is still open/);
  assert.match(board.body, /class="claim-note" data-occupied-raise/);
  assert.match(board.body, /#1 is \$5\./);
  assert.match(board.body, /Polar charges only the difference/);
});

test("same deck URL on the form raises the existing row by the difference", async () => {
  const app = await buildApp({ databasePath: ":memory:", now: () => NOW });
  after(() => app.close());

  const listing = await createListing(app, {
    company: "Stage Co",
    oneLiner: "Opens the room",
    url: "https://stage.example/deck",
  });
  const first = await app.inject({
    method: "POST",
    url: `/listings/${listing.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(first.statusCode, 200);

  const raised = await app.inject({
    method: "POST",
    url: "/listings",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html",
    },
    payload: new URLSearchParams({
      company: "Stage Co",
      oneLiner: "Opens the room",
      url: "https://stage.example/deck",
      amountUsd: "12",
    }).toString(),
  });
  assert.equal(raised.statusCode, 303);
  assert.equal(getBid(app.db, listing.id, WEEK)?.amountUsd, 12);

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assert.match(html, /#1 · \$12/);
  assert.doesNotMatch(html, /#2/);
  assert.equal((html.match(/Stage Co/g) ?? []).length, 1);
  assert.match(html, /#1 is \$12\./);
  assert.match(html, /Polar charges only the difference/);
});

test("occupied raise cue tells a founder who is not #1 what Polar charges", async () => {
  const app = await buildApp({ databasePath: ":memory:", now: () => NOW });
  after(() => app.close());

  const leader = await createListing(app, {
    company: "Stage Co",
    oneLiner: "Opens the room",
    url: "https://stage.example/deck",
  });
  const first = await app.inject({
    method: "POST",
    url: `/listings/${leader.id}/bids`,
    payload: { amountUsd: 20 },
  });
  assert.equal(first.statusCode, 200);

  const challenger = await createListing(app, {
    company: "Helix Labs",
    oneLiner: "Benchtop instruments for small labs",
    url: "https://helix.example/deck",
  });
  const second = await app.inject({
    method: "POST",
    url: `/listings/${challenger.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(second.statusCode, 200);

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  assert.match(html, /class="claim-note" data-occupied-raise/);
  assert.match(html, /#1 is \$20\./);
  assert.match(html, /The \$ you type is the public bid/);
  assert.match(html, /New deck: Polar charges that full amount/);
  assert.match(
    html,
    /Same deck already ranked: Polar charges only the difference/,
  );
  assert.match(html, /value="21"/);
  assert.match(html, /#1 · \$20/);
  assert.match(html, /#2 · \$5/);
  assert.match(
    html,
    /class="cue"[\s\S]*class="who"[\s\S]*Stage Co[\s\S]*class="seat"[\s\S]*Bid[\s\S]*#1 · \$20/,
  );
  assert.match(
    html,
    /class="cue"[\s\S]*class="who"[\s\S]*Helix Labs[\s\S]*class="seat"[\s\S]*Bid[\s\S]*#2 · \$5/,
  );
  assert.doesNotMatch(html, /data-empty-room/);
  assert.doesNotMatch(html, /The room is empty/);
  assert.doesNotMatch(html, /first slot is still open/);
  assert.doesNotMatch(html, /claim this rank/i);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
});

test("GET /checkout/complete returns to the room", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const done = await app.inject({
    method: "GET",
    url: "/checkout/complete?checkoutId=fix_test",
  });
  assert.equal(done.statusCode, 303);
  assert.equal(done.headers.location, "/");
});
