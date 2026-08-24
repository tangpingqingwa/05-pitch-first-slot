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

function boardMarkup(html: string): string {
  const styleEnd = html.indexOf("</style>");
  return styleEnd === -1 ? html : html.slice(styleEnd);
}

function listingCard(html: string, company: string): string {
  const items = [...html.matchAll(/<li class="listing[\s\S]*?<\/li>/g)].map(
    (match) => match[0],
  );
  const card = items.find((item) => item.includes(company));
  assert.ok(card, `missing cue for ${company}`);
  return card;
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
  assert.doesNotMatch(boardMarkup(html), /data-open-deck/);
  assert.doesNotMatch(boardMarkup(html), /Open deck/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-deck/);
  assert.doesNotMatch(boardMarkup(html), /Then Outbid/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise/);
  assert.doesNotMatch(boardMarkup(html), /after Then Outbid/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open/);
  assert.doesNotMatch(boardMarkup(html), /after Open deck/);
  assert.doesNotMatch(boardMarkup(html), /data-later-deck/);
  assert.doesNotMatch(boardMarkup(html), /data-open-later/);
  assert.doesNotMatch(boardMarkup(html), /data-open-one-first/);
  assert.doesNotMatch(boardMarkup(html), /data-open-one=/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-one-first/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-one=/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-one-first/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-one=/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-two-first/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-two=/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-two-first/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-two=/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-three-first/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-three-first/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-three=/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-three=/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-four-first/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-five-first/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-five-first/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-four-first/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-four=/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-five=/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-five=/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-four=/);
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
  const unpaid = listingCard(html, "Helix Labs");
  assert.match(unpaid, /Deck or site/);
  assert.doesNotMatch(unpaid, /data-open-deck/);
  assert.doesNotMatch(unpaid, /Open deck/);
  assert.doesNotMatch(unpaid, /data-raise-after-deck/);
  assert.doesNotMatch(unpaid, /Then Outbid/);
  assert.doesNotMatch(unpaid, /data-open-after-raise/);
  assert.doesNotMatch(unpaid, /after Then Outbid/);
  assert.doesNotMatch(unpaid, /data-raise-after-open/);
  assert.doesNotMatch(unpaid, /after Open deck/);
  assert.doesNotMatch(unpaid, /data-later-deck/);
  assert.doesNotMatch(unpaid, /data-open-later/);
  assert.doesNotMatch(unpaid, /data-open-one-first/);
  assert.doesNotMatch(unpaid, /data-open-one=/);
  assert.doesNotMatch(unpaid, /data-raise-one-first/);
  assert.doesNotMatch(unpaid, /data-raise-one=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-one-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-one=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-two-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-two=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-two-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-two=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four=/);
  assert.doesNotMatch(boardMarkup(html), /data-open-deck/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-deck/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open/);
  assert.doesNotMatch(boardMarkup(html), /data-later-deck/);
  assert.doesNotMatch(boardMarkup(html), /data-open-one-first/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-one-first/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-one-first/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-two-first/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-two-first/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-three-first/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-three-first/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-four-first/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-five-first/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-five-first/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-four-first/);
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
    /class="cue"[\s\S]*class="who"[\s\S]*Stage Co[\s\S]*Opens the room[\s\S]*class="seat"[\s\S]*Bid[\s\S]*#1 · \$5[\s\S]*class="open-deck"[\s\S]*data-open-deck="true"[\s\S]*Open deck[\s\S]*https:\/\/stage\.example\/deck/,
  );
  assert.doesNotMatch(board.body, /Unranked — no paid bid yet/);
  assert.doesNotMatch(board.body, /The room is empty/);
  assert.doesNotMatch(board.body, /first slot is still open/);
  assert.match(board.body, /class="claim-note" data-occupied-raise/);
  assert.match(board.body, /#1 is \$5\./);
  assert.match(board.body, /Polar charges only the difference/);
  const lone = listingCard(board.body, "Stage Co");
  assert.doesNotMatch(lone, /data-open-one-first/);
  assert.doesNotMatch(lone, /data-open-one=/);
  assert.doesNotMatch(lone, /class="open-deck open-one"/);
  assert.doesNotMatch(lone, /data-raise-one-first/);
  assert.doesNotMatch(lone, /data-raise-one=/);
  assert.doesNotMatch(lone, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.doesNotMatch(lone, /data-open-after-raise-one-first/);
  assert.doesNotMatch(lone, /data-open-after-raise-one=/);
  assert.doesNotMatch(lone, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.doesNotMatch(lone, /data-raise-after-open-two-first/);
  assert.doesNotMatch(lone, /data-raise-after-open-two=/);
  assert.doesNotMatch(lone, /data-open-after-raise-two-first/);
  assert.doesNotMatch(lone, /data-open-after-raise-two=/);
  assert.doesNotMatch(lone, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.doesNotMatch(lone, /data-raise-after-open-three-first/);
  assert.doesNotMatch(lone, /data-open-after-raise-three-first/);
  assert.doesNotMatch(lone, /data-raise-after-open-three=/);
  assert.doesNotMatch(lone, /data-open-after-raise-three=/);
  assert.doesNotMatch(lone, /data-raise-after-open-four-first/);
  assert.doesNotMatch(lone, /data-raise-after-open-five-first/);
  assert.doesNotMatch(lone, /data-open-after-raise-five-first/);
  assert.doesNotMatch(lone, /data-open-after-raise-four-first/);
  assert.doesNotMatch(lone, /data-raise-after-open-four=/);
  assert.doesNotMatch(lone, /data-raise-after-open-five=/);
  assert.doesNotMatch(lone, /data-open-after-raise-five=/);
  assert.doesNotMatch(lone, /data-open-after-raise-four=/);
  assert.doesNotMatch(boardMarkup(board.body), /data-open-one-first/);
  assert.doesNotMatch(boardMarkup(board.body), /data-open-one=/);
  assert.doesNotMatch(boardMarkup(board.body), /data-raise-one-first/);
  assert.doesNotMatch(boardMarkup(board.body), /data-raise-one=/);
  assert.doesNotMatch(boardMarkup(board.body), /data-open-after-raise-one-first/);
  assert.doesNotMatch(boardMarkup(board.body), /data-open-after-raise-one=/);
  assert.doesNotMatch(boardMarkup(board.body), /data-raise-after-open-two-first/);
  assert.doesNotMatch(boardMarkup(board.body), /data-raise-after-open-two=/);
  assert.doesNotMatch(boardMarkup(board.body), /data-open-after-raise-two-first/);
  assert.doesNotMatch(boardMarkup(board.body), /data-open-after-raise-two=/);
  assert.doesNotMatch(boardMarkup(board.body), /data-raise-after-open-three-first/);
  assert.doesNotMatch(boardMarkup(board.body), /data-open-after-raise-three-first/);
  assert.doesNotMatch(boardMarkup(board.body), /data-raise-after-open-three=/);
  assert.doesNotMatch(boardMarkup(board.body), /data-open-after-raise-three=/);
  assert.doesNotMatch(boardMarkup(board.body), /data-raise-after-open-four-first/);
  assert.doesNotMatch(boardMarkup(board.body), /data-raise-after-open-five-first/);
  assert.doesNotMatch(boardMarkup(board.body), /data-open-after-raise-five-first/);
  assert.doesNotMatch(boardMarkup(board.body), /data-open-after-raise-four-first/);
  assert.doesNotMatch(boardMarkup(board.body), /data-raise-after-open-four=/);
  assert.doesNotMatch(boardMarkup(board.body), /data-raise-after-open-five=/);
  assert.doesNotMatch(boardMarkup(board.body), /data-open-after-raise-five=/);
  assert.doesNotMatch(boardMarkup(board.body), /data-open-after-raise-four=/);
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
    /class="cue open-one-cue"[\s\S]*class="who"[\s\S]*Stage Co[\s\S]*data-open-one="true"[\s\S]*Open deck[\s\S]*data-raise-after-deck="true"[\s\S]*Then Outbid[\s\S]*class="seat"[\s\S]*Bid[\s\S]*#1 · \$20/,
  );
  assert.match(
    html,
    /class="cue later-cue"[\s\S]*class="who"[\s\S]*Helix Labs[\s\S]*data-open-later="true"[\s\S]*Open deck[\s\S]*class="seat"[\s\S]*Bid[\s\S]*#2 · \$5/,
  );
  assert.equal((html.match(/data-open-deck="true"/g) ?? []).length, 2);
  assert.equal((listingCard(html, "Stage Co").match(/class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/g) ?? []).length, 1);
  assert.equal((listingCard(html, "Helix Labs").match(/class="open-deck open-later"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-deck="true"/g) ?? []).length, 1);
  assert.match(listingCard(html, "Stage Co"), /data-raise-after-deck="true"/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-after-deck/);
  assert.equal((html.match(/data-open-after-raise="true"/g) ?? []).length, 1);
  assert.match(listingCard(html, "Stage Co"), /data-open-after-raise="true"/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-after-raise/);
  assert.equal((html.match(/data-raise-after-open="true"/g) ?? []).length, 1);
  assert.match(listingCard(html, "Stage Co"), /data-raise-after-open="true"/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-after-open/);
  assert.doesNotMatch(listingCard(html, "Stage Co"), /data-later-deck/);
  assert.match(listingCard(html, "Stage Co"), /data-open-one-first="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-open-one="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-raise-one-first="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-raise-one="true"/);
  assert.match(listingCard(html, "Stage Co"), /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.match(listingCard(html, "Stage Co"), /data-open-after-raise-one-first="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-open-after-raise-one="true"/);
  assert.match(listingCard(html, "Stage Co"), /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(listingCard(html, "Stage Co"), /data-raise-after-open-two-first="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-raise-after-open-two="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-open-after-raise-two-first="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-open-after-raise-two="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-raise-after-open-three-first="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-open-after-raise-three-first="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-raise-after-open-three="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-open-after-raise-three="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-raise-after-open-four-first="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-raise-after-open-five-first="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-open-after-raise-five-first="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-open-after-raise-four-first="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-raise-after-open-four="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-raise-after-open-five="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-open-after-raise-five="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-open-after-raise-four="true"/);
  assert.match(listingCard(html, "Helix Labs"), /data-later-deck="true"/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-one-first/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-one=/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-one-first/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-one=/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-after-raise-one-first/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-after-raise-one=/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-after-open-two-first/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-after-open-two=/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-after-raise-two-first/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-after-raise-two=/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-after-open-three-first/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-after-raise-three-first/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-after-open-three=/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-after-raise-three=/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-after-open-four-first/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-after-open-five-first/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-after-raise-five-first/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-after-raise-four-first/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-after-open-four=/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-after-open-five=/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-after-raise-five=/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-after-raise-four=/);
  assert.doesNotMatch(html, /data-empty-room/);
  assert.doesNotMatch(html, /The room is empty/);
  assert.doesNotMatch(html, /first slot is still open/);
  assert.doesNotMatch(html, /claim this rank/i);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
});

test("occupied paid cue names Open deck as the only outbound hop", async () => {
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

  await createListing(app, {
    company: "Helix Labs",
    oneLiner: "Benchtop instruments for small labs",
    url: "https://helix.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const unpaid = listingCard(html, "Helix Labs");
  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /#1 · \$20/);
  assert.match(paid, /data-open-deck="true"/);
  assert.match(paid, /class="open-deck"/);
  assert.match(paid, /Open deck/);
  assert.match(paid, /https:\/\/stage\.example\/deck/);
  assert.doesNotMatch(paid, /Deck or site/);
  assert.doesNotMatch(paid, /class="listing-url"/);
  assert.equal((paid.match(/class="open-deck"/g) ?? []).length, 1);
  assert.equal((paid.match(/href="\/listings\/[^"]+\/clicks"/g) ?? []).length, 2);
  assert.match(paid, /data-open-after-raise="true"/);
  assert.match(paid, /data-raise-after-open="true"/);
  assert.match(
    paid,
    new RegExp(
      `href="/listings/${leader.id}/clicks"[\\s\\S]*Open deck[\\s\\S]*https://stage\\.example/deck`,
    ),
  );
  const whoAt = paid.indexOf('class="who"');
  const seatAt = paid.indexOf('class="seat"');
  const hopAt = paid.indexOf('data-open-deck="true"');
  assert.ok(whoAt > -1 && seatAt > whoAt && hopAt > seatAt);
  assert.doesNotMatch(paid, /data-open-one-first/);
  assert.doesNotMatch(paid, /data-open-one=/);
  assert.doesNotMatch(paid, /class="open-deck open-one"/);
  assert.doesNotMatch(paid, /data-raise-one-first/);
  assert.doesNotMatch(paid, /data-raise-one=/);
  assert.doesNotMatch(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.doesNotMatch(paid, /data-open-after-raise-one-first/);
  assert.doesNotMatch(paid, /data-open-after-raise-one=/);
  assert.doesNotMatch(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.doesNotMatch(paid, /data-raise-after-open-two-first/);
  assert.doesNotMatch(paid, /data-raise-after-open-two=/);
  assert.doesNotMatch(paid, /data-open-after-raise-two-first/);
  assert.doesNotMatch(paid, /data-open-after-raise-two=/);
  assert.doesNotMatch(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.doesNotMatch(paid, /data-raise-after-open-three-first/);
  assert.doesNotMatch(paid, /data-open-after-raise-three-first/);
  assert.doesNotMatch(paid, /data-raise-after-open-three=/);
  assert.doesNotMatch(paid, /data-open-after-raise-three=/);
  assert.doesNotMatch(paid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(paid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(paid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(paid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(paid, /data-raise-after-open-four=/);
  assert.doesNotMatch(paid, /data-raise-after-open-five=/);
  assert.doesNotMatch(paid, /data-open-after-raise-five=/);
  assert.doesNotMatch(paid, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /data-open-deck/);
  assert.doesNotMatch(unpaid, /Open deck/);
  assert.doesNotMatch(unpaid, /data-raise-after-deck/);
  assert.doesNotMatch(unpaid, /Then Outbid/);
  assert.doesNotMatch(unpaid, /data-open-after-raise/);
  assert.doesNotMatch(unpaid, /after Then Outbid/);
  assert.doesNotMatch(unpaid, /data-raise-after-open/);
  assert.doesNotMatch(unpaid, /after Open deck/);
  assert.doesNotMatch(paid, /data-later-deck/);
  assert.doesNotMatch(paid, /data-open-later/);
  assert.doesNotMatch(unpaid, /data-later-deck/);
  assert.doesNotMatch(unpaid, /data-open-later/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.equal((html.match(/data-open-deck="true"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);

  const opened = await app.inject({
    method: "GET",
    url: `/listings/${leader.id}/clicks`,
  });
  assert.equal(opened.statusCode, 302);
  assert.equal(opened.headers.location, "https://stage.example/deck");
  const boardAfter = (await app.inject({ method: "GET", url: "/" })).body;
  assert.match(listingCard(boardAfter, "Stage Co"), /data-clicks="1"/);
  assert.match(listingCard(boardAfter, "Stage Co"), /1 clicks/);
  assert.match(listingCard(boardAfter, "Helix Labs"), /data-clicks="0"/);
});

test("occupied #1 cue hops Then Outbid after Open deck", async () => {
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
  const paid = listingCard(html, "Stage Co");
  const below = listingCard(html, "Helix Labs");
  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-deck="true"/);
  assert.match(paid, /Open deck/);
  assert.match(paid, /data-raise-after-deck="true"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /Polar charges only the difference/);
  assert.match(paid, /href="#claim"/);
  assert.equal((paid.match(/data-raise-after-deck="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/href="#claim"/g) ?? []).length, 2);
  assert.equal((html.match(/data-raise-after-deck="true"/g) ?? []).length, 1);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);
  const hopAt = paid.indexOf('data-open-deck="true"');
  const raiseAt = paid.indexOf('data-raise-after-deck="true"');
  assert.ok(hopAt > -1 && raiseAt > hopAt);
  assert.match(
    paid,
    /data-open-deck="true"[\s\S]*Open deck[\s\S]*data-raise-after-deck="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference/,
  );
  assert.match(below, /data-rank="2"/);
  assert.match(below, /data-open-deck="true"/);
  assert.match(below, /data-later-deck="true"/);
  assert.match(below, /data-open-later="true"/);
  assert.doesNotMatch(below, /data-raise-after-deck/);
  assert.doesNotMatch(below, /Then Outbid/);
  assert.doesNotMatch(below, /href="#claim"/);
  assert.doesNotMatch(below, /data-open-after-raise/);
  assert.doesNotMatch(below, /after Then Outbid/);
  assert.doesNotMatch(below, /data-raise-after-open/);
  assert.doesNotMatch(below, /after Open deck/);
  assert.doesNotMatch(paid, /data-later-deck/);
  assert.doesNotMatch(paid, /data-open-later/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.match(paid, /data-open-after-raise-one-first="true"/);
  assert.match(paid, /data-open-after-raise-one="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /data-raise-after-open-two-first="true"/);
  assert.match(paid, /data-raise-after-open-two="true"/);
  assert.match(paid, /data-open-after-raise-two-first="true"/);
  assert.match(paid, /data-open-after-raise-two="true"/);
  assert.match(paid, /data-raise-after-open-three-first="true"/);
  assert.match(paid, /data-open-after-raise-three-first="true"/);
  assert.match(paid, /data-raise-after-open-three="true"/);
  assert.match(paid, /data-open-after-raise-three="true"/);
  assert.match(paid, /data-raise-after-open-four-first="true"/);
  assert.match(paid, /data-raise-after-open-five-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.doesNotMatch(below, /data-raise-one-first/);
  assert.doesNotMatch(below, /data-raise-one=/);
  assert.doesNotMatch(below, /data-open-after-raise-one-first/);
  assert.doesNotMatch(below, /data-open-after-raise-one=/);
  assert.doesNotMatch(below, /data-raise-after-open-two-first/);
  assert.doesNotMatch(below, /data-raise-after-open-two=/);
  assert.doesNotMatch(below, /data-open-after-raise-two-first/);
  assert.doesNotMatch(below, /data-open-after-raise-two=/);
  assert.doesNotMatch(below, /data-raise-after-open-three-first/);
  assert.doesNotMatch(below, /data-open-after-raise-three-first/);
  assert.doesNotMatch(below, /data-raise-after-open-three=/);
  assert.doesNotMatch(below, /data-open-after-raise-three=/);
  assert.doesNotMatch(below, /data-raise-after-open-four-first/);
  assert.doesNotMatch(below, /data-raise-after-open-five-first/);
  assert.doesNotMatch(below, /data-open-after-raise-five-first/);
  assert.doesNotMatch(below, /data-open-after-raise-four-first/);
  assert.doesNotMatch(below, /data-raise-after-open-four=/);
  assert.doesNotMatch(below, /data-raise-after-open-five=/);
  assert.doesNotMatch(below, /data-open-after-raise-five=/);
  assert.doesNotMatch(below, /data-open-after-raise-four=/);
  assert.match(html, /class="claim-note" data-occupied-raise/);
  assert.match(html, /The \$ you type is the public bid/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /claim this rank/i);
  assert.doesNotMatch(html, /hot deal/i);
});

test("occupied #1 cue hops Open deck after Then Outbid", async () => {
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
  const paid = listingCard(html, "Stage Co");
  const below = listingCard(html, "Helix Labs");
  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-deck="true"/);
  assert.match(paid, /Open deck/);
  assert.match(paid, /data-raise-after-deck="true"/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /data-open-after-raise="true"/);
  assert.match(paid, /class="open-after-raise"/);
  assert.match(paid, /after Then Outbid/);
  assert.match(
    paid,
    new RegExp(
      `data-open-after-raise="true"[\\s\\S]*href="/listings/${leader.id}/clicks"`,
    ),
  );
  assert.equal((paid.match(/data-open-after-raise="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise="true"/g) ?? []).length, 1);
  assert.equal((html.match(/after Then Outbid/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-deck="true"/g) ?? []).length, 1);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);
  const hopAt = paid.indexOf('data-open-deck="true"');
  const raiseAt = paid.indexOf('data-raise-after-deck="true"');
  const afterAt = paid.indexOf('data-open-after-raise="true"');
  assert.ok(hopAt > -1 && raiseAt > hopAt && afterAt > raiseAt);
  assert.match(
    paid,
    /data-open-deck="true"[\s\S]*Open deck[\s\S]*data-raise-after-deck="true"[\s\S]*Then Outbid[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid/,
  );
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /data-open-after-raise-one-first="true"/);
  assert.match(paid, /data-open-after-raise-one="true"/);
  assert.match(paid, /data-raise-after-open-two-first="true"/);
  assert.match(paid, /data-raise-after-open-two="true"/);
  assert.match(paid, /data-open-after-raise-two-first="true"/);
  assert.match(paid, /data-open-after-raise-two="true"/);
  assert.match(paid, /data-raise-after-open-three-first="true"/);
  assert.match(paid, /data-open-after-raise-three-first="true"/);
  assert.match(paid, /data-raise-after-open-three="true"/);
  assert.match(paid, /data-open-after-raise-three="true"/);
  assert.match(paid, /data-raise-after-open-four-first="true"/);
  assert.match(paid, /data-raise-after-open-five-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.doesNotMatch(below, /data-raise-one-first/);
  assert.doesNotMatch(below, /data-raise-one=/);
  assert.doesNotMatch(below, /data-open-after-raise-one-first/);
  assert.doesNotMatch(below, /data-open-after-raise-one=/);
  assert.doesNotMatch(below, /data-raise-after-open-two-first/);
  assert.doesNotMatch(below, /data-raise-after-open-two=/);
  assert.doesNotMatch(below, /data-open-after-raise-two-first/);
  assert.doesNotMatch(below, /data-open-after-raise-two=/);
  assert.doesNotMatch(below, /data-raise-after-open-three-first/);
  assert.doesNotMatch(below, /data-open-after-raise-three-first/);
  assert.doesNotMatch(below, /data-raise-after-open-three=/);
  assert.doesNotMatch(below, /data-open-after-raise-three=/);
  assert.doesNotMatch(below, /data-raise-after-open-four-first/);
  assert.doesNotMatch(below, /data-raise-after-open-five-first/);
  assert.doesNotMatch(below, /data-open-after-raise-five-first/);
  assert.doesNotMatch(below, /data-open-after-raise-four-first/);
  assert.doesNotMatch(below, /data-raise-after-open-four=/);
  assert.doesNotMatch(below, /data-raise-after-open-five=/);
  assert.doesNotMatch(below, /data-open-after-raise-five=/);
  assert.doesNotMatch(below, /data-open-after-raise-four=/);
  assert.match(below, /data-rank="2"/);
  assert.match(below, /data-open-deck="true"/);
  assert.match(below, /data-later-deck="true"/);
  assert.match(below, /data-open-later="true"/);
  assert.doesNotMatch(below, /data-raise-after-deck/);
  assert.doesNotMatch(below, /Then Outbid/);
  assert.doesNotMatch(below, /data-open-after-raise/);
  assert.doesNotMatch(below, /after Then Outbid/);
  assert.doesNotMatch(below, /data-raise-after-open/);
  assert.doesNotMatch(below, /after Open deck/);
  assert.doesNotMatch(paid, /data-later-deck/);
  assert.doesNotMatch(paid, /data-open-later/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /claim this rank/i);
  assert.doesNotMatch(html, /hot deal/i);

  const opened = await app.inject({
    method: "GET",
    url: `/listings/${leader.id}/clicks`,
  });
  assert.equal(opened.statusCode, 302);
  assert.equal(opened.headers.location, "https://stage.example/deck");
  const boardAfter = (await app.inject({ method: "GET", url: "/" })).body;
  assert.match(listingCard(boardAfter, "Stage Co"), /data-clicks="1"/);
  assert.match(listingCard(boardAfter, "Stage Co"), /1 clicks/);
  assert.match(listingCard(boardAfter, "Helix Labs"), /data-clicks="0"/);
});

test("occupied #1 cue hops Then Outbid after the after-raise Open deck", async () => {
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
  const paid = listingCard(html, "Stage Co");
  const below = listingCard(html, "Helix Labs");
  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-deck="true"/);
  assert.match(paid, /Open deck/);
  assert.match(paid, /data-raise-after-deck="true"/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /data-open-after-raise="true"/);
  assert.match(paid, /after Then Outbid/);
  assert.match(paid, /data-raise-after-open="true"/);
  assert.match(paid, /class="raise-after-open"/);
  assert.match(paid, /after Open deck/);
  assert.match(paid, /href="#claim"/);
  assert.equal((paid.match(/data-raise-after-open="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open="true"/g) ?? []).length, 1);
  assert.equal((html.match(/after Open deck/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-deck="true"/g) ?? []).length, 1);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);
  assert.equal((paid.match(/href="#claim"/g) ?? []).length, 2);
  const hopAt = paid.indexOf('data-open-deck="true"');
  const raiseAt = paid.indexOf('data-raise-after-deck="true"');
  const afterAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  assert.ok(
    hopAt > -1 &&
      raiseAt > hopAt &&
      afterAt > raiseAt &&
      raiseOpenAt > afterAt,
  );
  assert.match(
    paid,
    /data-open-deck="true"[\s\S]*Open deck[\s\S]*data-raise-after-deck="true"[\s\S]*Then Outbid[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck/,
  );
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /data-open-after-raise-one-first="true"/);
  assert.match(paid, /data-open-after-raise-one="true"/);
  assert.match(paid, /data-raise-after-open-two-first="true"/);
  assert.match(paid, /data-raise-after-open-two="true"/);
  assert.match(paid, /data-open-after-raise-two-first="true"/);
  assert.match(paid, /data-open-after-raise-two="true"/);
  assert.match(paid, /data-raise-after-open-three-first="true"/);
  assert.match(paid, /data-open-after-raise-three-first="true"/);
  assert.match(paid, /data-raise-after-open-three="true"/);
  assert.match(paid, /data-open-after-raise-three="true"/);
  assert.match(paid, /data-raise-after-open-four-first="true"/);
  assert.match(paid, /data-raise-after-open-five-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.doesNotMatch(below, /data-raise-one-first/);
  assert.doesNotMatch(below, /data-raise-one=/);
  assert.doesNotMatch(below, /data-open-after-raise-one-first/);
  assert.doesNotMatch(below, /data-open-after-raise-one=/);
  assert.doesNotMatch(below, /data-raise-after-open-two-first/);
  assert.doesNotMatch(below, /data-raise-after-open-two=/);
  assert.doesNotMatch(below, /data-open-after-raise-two-first/);
  assert.doesNotMatch(below, /data-open-after-raise-two=/);
  assert.doesNotMatch(below, /data-raise-after-open-three-first/);
  assert.doesNotMatch(below, /data-open-after-raise-three-first/);
  assert.doesNotMatch(below, /data-raise-after-open-three=/);
  assert.doesNotMatch(below, /data-open-after-raise-three=/);
  assert.doesNotMatch(below, /data-raise-after-open-four-first/);
  assert.doesNotMatch(below, /data-raise-after-open-five-first/);
  assert.doesNotMatch(below, /data-open-after-raise-five-first/);
  assert.doesNotMatch(below, /data-open-after-raise-four-first/);
  assert.doesNotMatch(below, /data-raise-after-open-four=/);
  assert.doesNotMatch(below, /data-raise-after-open-five=/);
  assert.doesNotMatch(below, /data-open-after-raise-five=/);
  assert.doesNotMatch(below, /data-open-after-raise-four=/);
  assert.match(below, /data-rank="2"/);
  assert.match(below, /data-open-deck="true"/);
  assert.match(below, /data-later-deck="true"/);
  assert.match(below, /data-open-later="true"/);
  assert.doesNotMatch(below, /data-raise-after-deck/);
  assert.doesNotMatch(below, /Then Outbid/);
  assert.doesNotMatch(below, /data-open-after-raise/);
  assert.doesNotMatch(below, /after Then Outbid/);
  assert.doesNotMatch(below, /data-raise-after-open/);
  assert.doesNotMatch(below, /after Open deck/);
  assert.doesNotMatch(paid, /data-later-deck/);
  assert.doesNotMatch(paid, /data-open-later/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /claim this rank/i);
  assert.doesNotMatch(html, /hot deal/i);
});

test("occupied later ranks stamp Open deck as the certain hop, not a second #1 take", async () => {
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
    payload: { amountUsd: 8 },
  });
  assert.equal(second.statusCode, 200);

  const rival = await createListing(app, {
    company: "Rival Pitch",
    oneLiner: "Lists below at five",
    url: "https://rival.example/deck",
  });
  const third = await app.inject({
    method: "POST",
    url: `/listings/${rival.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(third.statusCode, 200);
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const later = listingCard(html, "Helix Labs");
  const last = listingCard(html, "Rival Pitch");
  const unpaid = listingCard(html, "Cue Only");

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.match(later, /data-open-later="true"/);
  assert.match(later, /class="open-deck open-later"/);
  assert.match(later, /data-open-deck="true"/);
  assert.match(later, /Open deck/);
  assert.match(
    later,
    new RegExp(
      `href="/listings/${challenger.id}/clicks"[\\s\\S]*Open deck[\\s\\S]*https://helix\\.example/deck`,
    ),
  );
  const laterStamp = later.indexOf('data-later-deck="true"');
  const laterWho = later.indexOf('class="who"');
  const laterHop = later.indexOf('data-open-later="true"');
  const laterOpen = later.indexOf("Open deck");
  const laterSeat = later.indexOf('class="seat"');
  const laterBid = later.indexOf("#2 · $8");
  assert.ok(laterStamp > -1 && laterWho > laterStamp && laterHop > laterWho);
  assert.ok(laterOpen > laterHop && laterSeat > laterOpen && laterBid > laterSeat);
  assert.match(later, /#2 · \$8/);
  assert.doesNotMatch(later, /data-raise-after-deck/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(later, /data-raise-one-first/);
  assert.doesNotMatch(later, /data-raise-one=/);
  assert.doesNotMatch(later, /data-open-after-raise-one-first/);
  assert.doesNotMatch(later, /data-open-after-raise-one=/);
  assert.doesNotMatch(later, /data-raise-after-open-two-first/);
  assert.doesNotMatch(later, /data-raise-after-open-two=/);
  assert.doesNotMatch(later, /data-open-after-raise-two-first/);
  assert.doesNotMatch(later, /data-open-after-raise-two=/);
  assert.doesNotMatch(later, /data-raise-after-open-three-first/);
  assert.doesNotMatch(later, /data-open-after-raise-three-first/);
  assert.doesNotMatch(later, /data-raise-after-open-three=/);
  assert.doesNotMatch(later, /data-open-after-raise-three=/);
  assert.doesNotMatch(later, /data-raise-after-open-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /href="#claim"/);
  assert.doesNotMatch(later, /class="listing top"/);
  assert.doesNotMatch(later, /data-rank="1"/);

  assert.match(last, /data-rank="3"/);
  assert.match(last, /data-later-deck="true"/);
  assert.match(last, /data-open-later="true"/);
  assert.match(last, /Open deck/);
  assert.doesNotMatch(last, /data-raise-after-deck/);
  assert.doesNotMatch(last, /Then Outbid/);
  assert.doesNotMatch(last, /data-open-after-raise-one-first/);
  assert.doesNotMatch(last, /data-open-after-raise-one=/);
  assert.doesNotMatch(last, /data-raise-after-open-two-first/);
  assert.doesNotMatch(last, /data-raise-after-open-two=/);
  assert.doesNotMatch(last, /data-open-after-raise-two-first/);
  assert.doesNotMatch(last, /data-open-after-raise-two=/);
  assert.doesNotMatch(last, /data-raise-after-open-three-first/);
  assert.doesNotMatch(last, /data-open-after-raise-three-first/);
  assert.doesNotMatch(last, /data-raise-after-open-three=/);
  assert.doesNotMatch(last, /data-open-after-raise-three=/);
  assert.doesNotMatch(last, /data-raise-after-open-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);

  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-deck="true"/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.match(paid, /data-open-after-raise-one-first="true"/);
  assert.match(paid, /data-open-after-raise-one="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /data-raise-after-open-two-first="true"/);
  assert.match(paid, /data-raise-after-open-two="true"/);
  assert.match(paid, /data-open-after-raise-two-first="true"/);
  assert.match(paid, /data-open-after-raise-two="true"/);
  assert.match(paid, /data-raise-after-open-three-first="true"/);
  assert.match(paid, /data-open-after-raise-three-first="true"/);
  assert.match(paid, /data-raise-after-open-three="true"/);
  assert.match(paid, /data-open-after-raise-three="true"/);
  assert.match(paid, /data-raise-after-open-four-first="true"/);
  assert.match(paid, /data-raise-after-open-five-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /data-raise-after-deck="true"/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /data-open-after-raise="true"/);
  assert.match(paid, /data-raise-after-open="true"/);
  assert.doesNotMatch(paid, /data-later-deck/);
  assert.doesNotMatch(paid, /data-open-later/);
  assert.doesNotMatch(paid, /open-later/);
  const whoAt = paid.indexOf('class="who"');
  const hopAt = paid.indexOf('data-open-one="true"');
  const seatAt = paid.indexOf('class="seat"');
  assert.ok(whoAt > -1 && hopAt > whoAt && seatAt > hopAt);

  assert.doesNotMatch(unpaid, /data-later-deck/);
  assert.doesNotMatch(unpaid, /data-open-later/);
  assert.doesNotMatch(unpaid, /data-raise-one-first/);
  assert.doesNotMatch(unpaid, /data-raise-one=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-one-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-one=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-two-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-two=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-two-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-two=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /Open deck/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Unranked — no paid bid yet/);

  assert.equal((html.match(/data-later-deck="true"/g) ?? []).length, 2);
  assert.equal((html.match(/data-open-later="true"/g) ?? []).length, 2);
  assert.equal((html.match(/data-raise-after-deck="true"/g) ?? []).length, 1);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);
  assert.doesNotMatch(later, /data-open-after-raise/);
  assert.doesNotMatch(later, /data-raise-after-open/);
  assert.doesNotMatch(last, /data-open-after-raise/);
  assert.doesNotMatch(last, /data-raise-after-open/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);

  const opened = await app.inject({
    method: "GET",
    url: `/listings/${challenger.id}/clicks`,
  });
  assert.equal(opened.statusCode, 302);
  assert.equal(opened.headers.location, "https://helix.example/deck");
  const boardAfter = (await app.inject({ method: "GET", url: "/" })).body;
  assert.match(listingCard(boardAfter, "Helix Labs"), /data-clicks="1"/);
  assert.match(listingCard(boardAfter, "Helix Labs"), /1 clicks/);
  assert.match(listingCard(boardAfter, "Stage Co"), /data-clicks="0"/);
});

test("occupied #1 Open deck is the first hop after later decks exist", async () => {
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
    payload: { amountUsd: 8 },
  });
  assert.equal(second.statusCode, 200);

  const rival = await createListing(app, {
    company: "Rival Pitch",
    oneLiner: "Lists below at five",
    url: "https://rival.example/deck",
  });
  const third = await app.inject({
    method: "POST",
    url: `/listings/${rival.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(third.statusCode, 200);
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const later = listingCard(html, "Helix Labs");
  const last = listingCard(html, "Rival Pitch");
  const unpaid = listingCard(html, "Cue Only");

  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /data-open-deck="true"/);
  assert.match(paid, /Open deck/);
  assert.match(
    paid,
    new RegExp(
      `href="/listings/${leader.id}/clicks"[\\s\\S]*Open deck[\\s\\S]*https://stage\\.example/deck`,
    ),
  );
  const stampAt = paid.indexOf('data-open-one-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const hopAt = paid.indexOf('data-open-one="true"');
  const openAt = paid.indexOf("Open deck");
  const raiseAt = paid.indexOf('data-raise-after-deck="true"');
  const afterAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const seatAt = paid.indexOf('class="seat"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && hopAt > whoAt);
  assert.ok(openAt > hopAt && raiseAt > openAt && afterAt > raiseAt);
  assert.ok(raiseOpenAt > afterAt && seatAt > raiseOpenAt && bidAt > seatAt);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-one="true"[\s\S]*Open deck[\s\S]*data-raise-after-deck="true"[\s\S]*Then Outbid[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*class="seat"[\s\S]*#1 · \$20/,
  );
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.match(paid, /data-open-after-raise-one-first="true"/);
  assert.match(paid, /data-open-after-raise-one="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /data-raise-after-open-two-first="true"/);
  assert.match(paid, /data-raise-after-open-two="true"/);
  assert.match(paid, /data-open-after-raise-two-first="true"/);
  assert.match(paid, /data-open-after-raise-two="true"/);
  assert.match(paid, /data-raise-after-open-three-first="true"/);
  assert.match(paid, /data-open-after-raise-three-first="true"/);
  assert.match(paid, /data-raise-after-open-three="true"/);
  assert.match(paid, /data-open-after-raise-three="true"/);
  assert.match(paid, /data-raise-after-open-four-first="true"/);
  assert.match(paid, /data-raise-after-open-five-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.equal((paid.match(/class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-one-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-one-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-one-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-two-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-two-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.doesNotMatch(paid, /data-later-deck/);
  assert.doesNotMatch(paid, /data-open-later/);
  assert.doesNotMatch(paid, /open-later/);

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.match(later, /data-open-later="true"/);
  assert.doesNotMatch(later, /data-open-one-first/);
  assert.doesNotMatch(later, /data-open-one=/);
  assert.doesNotMatch(later, /class="open-deck open-one"/);
  assert.doesNotMatch(later, /data-raise-one-first/);
  assert.doesNotMatch(later, /data-raise-one=/);
  assert.doesNotMatch(later, /data-open-after-raise-one-first/);
  assert.doesNotMatch(later, /data-open-after-raise-one=/);
  assert.doesNotMatch(later, /data-raise-after-open-two-first/);
  assert.doesNotMatch(later, /data-raise-after-open-two=/);
  assert.doesNotMatch(later, /data-open-after-raise-two-first/);
  assert.doesNotMatch(later, /data-open-after-raise-two=/);
  assert.doesNotMatch(later, /data-raise-after-open-three-first/);
  assert.doesNotMatch(later, /data-open-after-raise-three-first/);
  assert.doesNotMatch(later, /data-raise-after-open-three=/);
  assert.doesNotMatch(later, /data-open-after-raise-three=/);
  assert.doesNotMatch(later, /data-raise-after-open-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /Then Outbid/);

  assert.match(last, /data-rank="3"/);
  assert.match(last, /data-later-deck="true"/);
  assert.doesNotMatch(last, /data-open-one-first/);
  assert.doesNotMatch(last, /data-open-one=/);
  assert.doesNotMatch(last, /data-raise-one-first/);
  assert.doesNotMatch(last, /data-raise-one=/);
  assert.doesNotMatch(last, /data-open-after-raise-one-first/);
  assert.doesNotMatch(last, /data-open-after-raise-one=/);
  assert.doesNotMatch(last, /data-raise-after-open-two-first/);
  assert.doesNotMatch(last, /data-raise-after-open-two=/);
  assert.doesNotMatch(last, /data-open-after-raise-two-first/);
  assert.doesNotMatch(last, /data-open-after-raise-two=/);
  assert.doesNotMatch(last, /data-raise-after-open-three-first/);
  assert.doesNotMatch(last, /data-open-after-raise-three-first/);
  assert.doesNotMatch(last, /data-raise-after-open-three=/);
  assert.doesNotMatch(last, /data-open-after-raise-three=/);
  assert.doesNotMatch(last, /data-raise-after-open-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);

  assert.doesNotMatch(unpaid, /data-open-one-first/);
  assert.doesNotMatch(unpaid, /data-open-one=/);
  assert.doesNotMatch(unpaid, /data-raise-one-first/);
  assert.doesNotMatch(unpaid, /data-raise-one=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-one-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-one=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-two-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-two=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-two-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-two=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /Open deck/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Unranked — no paid bid yet/);

  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);

  const opened = await app.inject({
    method: "GET",
    url: `/listings/${leader.id}/clicks`,
  });
  assert.equal(opened.statusCode, 302);
  assert.equal(opened.headers.location, "https://stage.example/deck");
  const boardAfter = (await app.inject({ method: "GET", url: "/" })).body;
  assert.match(listingCard(boardAfter, "Stage Co"), /data-clicks="1"/);
  assert.match(listingCard(boardAfter, "Stage Co"), /1 clicks/);
  assert.match(listingCard(boardAfter, "Helix Labs"), /data-clicks="0"/);
});

test("occupied #1 Then Outbid is concentrated after Open deck when later decks exist", async () => {
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
    payload: { amountUsd: 8 },
  });
  assert.equal(second.statusCode, 200);

  const rival = await createListing(app, {
    company: "Rival Pitch",
    oneLiner: "Lists below at five",
    url: "https://rival.example/deck",
  });
  const third = await app.inject({
    method: "POST",
    url: `/listings/${rival.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(third.statusCode, 200);
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const later = listingCard(html, "Helix Labs");
  const last = listingCard(html, "Rival Pitch");
  const unpaid = listingCard(html, "Cue Only");

  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.match(paid, /data-open-after-raise-one-first="true"/);
  assert.match(paid, /data-open-after-raise-one="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /data-raise-after-open-two-first="true"/);
  assert.match(paid, /data-raise-after-open-two="true"/);
  assert.match(paid, /data-open-after-raise-two-first="true"/);
  assert.match(paid, /data-open-after-raise-two="true"/);
  assert.match(paid, /data-raise-after-open-three-first="true"/);
  assert.match(paid, /data-open-after-raise-three-first="true"/);
  assert.match(paid, /data-raise-after-open-three="true"/);
  assert.match(paid, /data-open-after-raise-three="true"/);
  assert.match(paid, /data-raise-after-open-four-first="true"/);
  assert.match(paid, /data-raise-after-open-five-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /data-raise-after-deck="true"/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /Polar charges only the difference/);
  assert.match(paid, /href="#claim"/);
  assert.equal((paid.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-two="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-one-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-two-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-two-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-deck="true"/g) ?? []).length, 1);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);

  const stampAt = paid.indexOf('data-raise-one-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const openAt = paid.indexOf('data-open-one="true"');
  const raiseAt = paid.indexOf('data-raise-one="true"');
  const raiseCopy = paid.indexOf("Then Outbid");
  const afterAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const seatAt = paid.indexOf('class="seat"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(raiseAt > openAt && raiseCopy > raiseAt && afterAt > raiseCopy);
  assert.ok(raiseOpenAt > afterAt && seatAt > raiseOpenAt && bidAt > seatAt);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-one="true"[\s\S]*Open deck[\s\S]*data-raise-one="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*class="seat"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.doesNotMatch(later, /data-raise-one-first/);
  assert.doesNotMatch(later, /data-raise-one=/);
  assert.doesNotMatch(later, /data-open-after-raise-one-first/);
  assert.doesNotMatch(later, /data-open-after-raise-one=/);
  assert.doesNotMatch(later, /data-raise-after-open-two-first/);
  assert.doesNotMatch(later, /data-raise-after-open-two=/);
  assert.doesNotMatch(later, /data-open-after-raise-two-first/);
  assert.doesNotMatch(later, /data-open-after-raise-two=/);
  assert.doesNotMatch(later, /data-raise-after-open-three-first/);
  assert.doesNotMatch(later, /data-open-after-raise-three-first/);
  assert.doesNotMatch(later, /data-raise-after-open-three=/);
  assert.doesNotMatch(later, /data-open-after-raise-three=/);
  assert.doesNotMatch(later, /data-raise-after-open-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-raise-one-first/);
  assert.doesNotMatch(last, /data-raise-one=/);
  assert.doesNotMatch(last, /data-open-after-raise-one-first/);
  assert.doesNotMatch(last, /data-open-after-raise-one=/);
  assert.doesNotMatch(last, /data-raise-after-open-two-first/);
  assert.doesNotMatch(last, /data-raise-after-open-two=/);
  assert.doesNotMatch(last, /data-open-after-raise-two-first/);
  assert.doesNotMatch(last, /data-open-after-raise-two=/);
  assert.doesNotMatch(last, /data-raise-after-open-three-first/);
  assert.doesNotMatch(last, /data-open-after-raise-three-first/);
  assert.doesNotMatch(last, /data-raise-after-open-three=/);
  assert.doesNotMatch(last, /data-open-after-raise-three=/);
  assert.doesNotMatch(last, /data-raise-after-open-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /data-raise-one-first/);
  assert.doesNotMatch(unpaid, /data-raise-one=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-one-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-one=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-two-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-two=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-two-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-two=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /Then Outbid/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);
});

test("occupied #1 Open deck is concentrated after Then Outbid when later decks exist", async () => {
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
    payload: { amountUsd: 8 },
  });
  assert.equal(second.statusCode, 200);

  const rival = await createListing(app, {
    company: "Rival Pitch",
    oneLiner: "Lists below at five",
    url: "https://rival.example/deck",
  });
  const third = await app.inject({
    method: "POST",
    url: `/listings/${rival.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(third.statusCode, 200);
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const later = listingCard(html, "Helix Labs");
  const last = listingCard(html, "Rival Pitch");
  const unpaid = listingCard(html, "Cue Only");

  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-open-after-raise-one-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /data-open-after-raise-one="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.match(paid, /data-raise-after-open-two-first="true"/);
  assert.match(paid, /data-raise-after-open-two="true"/);
  assert.match(paid, /data-open-after-raise-two-first="true"/);
  assert.match(paid, /data-open-after-raise-two="true"/);
  assert.match(paid, /data-raise-after-open-three-first="true"/);
  assert.match(paid, /data-open-after-raise-three-first="true"/);
  assert.match(paid, /data-raise-after-open-three="true"/);
  assert.match(paid, /data-open-after-raise-three="true"/);
  assert.match(paid, /data-raise-after-open-four-first="true"/);
  assert.match(paid, /data-raise-after-open-five-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /data-open-deck="true"/);
  assert.match(paid, /Open deck/);
  assert.match(
    paid,
    new RegExp(
      `href="/listings/${leader.id}/clicks"[\\s\\S]*Open deck[\\s\\S]*https://stage\\.example/deck`,
    ),
  );
  assert.equal((paid.match(/data-open-after-raise-one="true"/g) ?? []).length, 1);
  assert.equal(
    (paid.match(/class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/g) ?? []).length,
    1,
  );
  assert.equal((html.match(/data-open-after-raise-one-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-two-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-two-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise="true"/g) ?? []).length, 1);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);

  const stampAt = paid.indexOf('data-open-after-raise-one-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const openAt = paid.indexOf('data-open-one="true"');
  const afterRaiseAt = paid.indexOf('data-open-after-raise-one="true"');
  const openCopy = paid.indexOf("Open deck");
  const raiseAt = paid.indexOf('data-raise-one="true"');
  const raiseCopy = paid.indexOf("Then Outbid");
  const laterOpenAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const seatAt = paid.indexOf('class="seat"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(afterRaiseAt > openAt && afterRaiseAt < openCopy);
  assert.ok(openCopy > openAt && raiseAt > openCopy && raiseCopy > raiseAt);
  assert.ok(laterOpenAt > raiseCopy && raiseOpenAt > laterOpenAt);
  assert.ok(seatAt > raiseOpenAt && bidAt > seatAt);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-one="true"[\s\S]*Open deck[\s\S]*data-raise-one="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*class="seat"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.doesNotMatch(later, /data-open-after-raise-one-first/);
  assert.doesNotMatch(later, /data-open-after-raise-one=/);
  assert.doesNotMatch(later, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.doesNotMatch(later, /data-raise-after-open-two-first/);
  assert.doesNotMatch(later, /data-raise-after-open-two=/);
  assert.doesNotMatch(later, /data-open-after-raise-two-first/);
  assert.doesNotMatch(later, /data-open-after-raise-two=/);
  assert.doesNotMatch(later, /data-raise-after-open-three-first/);
  assert.doesNotMatch(later, /data-open-after-raise-three-first/);
  assert.doesNotMatch(later, /data-raise-after-open-three=/);
  assert.doesNotMatch(later, /data-open-after-raise-three=/);
  assert.doesNotMatch(later, /data-raise-after-open-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-open-after-raise-one-first/);
  assert.doesNotMatch(last, /data-open-after-raise-one=/);
  assert.doesNotMatch(last, /data-raise-after-open-two-first/);
  assert.doesNotMatch(last, /data-raise-after-open-two=/);
  assert.doesNotMatch(last, /data-open-after-raise-two-first/);
  assert.doesNotMatch(last, /data-open-after-raise-two=/);
  assert.doesNotMatch(last, /data-raise-after-open-three-first/);
  assert.doesNotMatch(last, /data-open-after-raise-three-first/);
  assert.doesNotMatch(last, /data-raise-after-open-three=/);
  assert.doesNotMatch(last, /data-open-after-raise-three=/);
  assert.doesNotMatch(last, /data-raise-after-open-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-one-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-one=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-two-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-two=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-two-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-two=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /Open deck/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);

  const opened = await app.inject({
    method: "GET",
    url: `/listings/${leader.id}/clicks`,
  });
  assert.equal(opened.statusCode, 302);
  assert.equal(opened.headers.location, "https://stage.example/deck");
  const boardAfter = (await app.inject({ method: "GET", url: "/" })).body;
  assert.match(listingCard(boardAfter, "Stage Co"), /data-clicks="1"/);
  assert.match(listingCard(boardAfter, "Stage Co"), /1 clicks/);
  assert.match(listingCard(boardAfter, "Helix Labs"), /data-clicks="0"/);
});

test("occupied #1 Then Outbid is concentrated after Open deck is re-concentrated", async () => {
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
    payload: { amountUsd: 8 },
  });
  assert.equal(second.statusCode, 200);

  const rival = await createListing(app, {
    company: "Rival Pitch",
    oneLiner: "Lists below at five",
    url: "https://rival.example/deck",
  });
  const third = await app.inject({
    method: "POST",
    url: `/listings/${rival.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(third.statusCode, 200);
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const later = listingCard(html, "Helix Labs");
  const last = listingCard(html, "Rival Pitch");
  const unpaid = listingCard(html, "Cue Only");

  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-open-after-raise-one-first="true"/);
  assert.match(paid, /data-raise-after-open-two-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /data-open-after-raise-one="true"/);
  assert.match(paid, /data-raise-after-open-two="true"/);
  assert.match(paid, /data-open-after-raise-two-first="true"/);
  assert.match(paid, /data-open-after-raise-two="true"/);
  assert.match(paid, /data-raise-after-open-three-first="true"/);
  assert.match(paid, /data-open-after-raise-three-first="true"/);
  assert.match(paid, /data-raise-after-open-three="true"/);
  assert.match(paid, /data-open-after-raise-three="true"/);
  assert.match(paid, /data-raise-after-open-four-first="true"/);
  assert.match(paid, /data-raise-after-open-five-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.match(paid, /data-raise-after-deck="true"/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /Polar charges only the difference/);
  assert.match(paid, /href="#claim"/);
  assert.equal((paid.match(/data-raise-after-open-two="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal(
    (paid.match(/class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/g) ?? []).length,
    1,
  );
  assert.equal((html.match(/data-raise-after-open-two-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-two-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-deck="true"/g) ?? []).length, 1);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);
  assert.equal((paid.match(/href="#claim"/g) ?? []).length, 2);

  const stampAt = paid.indexOf('data-raise-after-open-two-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const openAt = paid.indexOf('data-open-after-raise-one="true"');
  const raiseAt = paid.indexOf('data-raise-after-open-two="true"');
  const raiseCopy = paid.indexOf("Then Outbid");
  const laterOpenAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const seatAt = paid.indexOf('class="seat"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(raiseAt > openAt && raiseCopy > raiseAt && laterOpenAt > raiseCopy);
  assert.ok(raiseOpenAt > laterOpenAt && seatAt > raiseOpenAt && bidAt > seatAt);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-one="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-two="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*class="seat"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.doesNotMatch(later, /data-raise-after-open-two-first/);
  assert.doesNotMatch(later, /data-raise-after-open-two=/);
  assert.doesNotMatch(later, /data-open-after-raise-two-first/);
  assert.doesNotMatch(later, /data-open-after-raise-two=/);
  assert.doesNotMatch(later, /data-raise-after-open-three-first/);
  assert.doesNotMatch(later, /data-open-after-raise-three-first/);
  assert.doesNotMatch(later, /data-raise-after-open-three=/);
  assert.doesNotMatch(later, /data-open-after-raise-three=/);
  assert.doesNotMatch(later, /data-raise-after-open-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-raise-after-open-two-first/);
  assert.doesNotMatch(last, /data-raise-after-open-two=/);
  assert.doesNotMatch(last, /data-open-after-raise-two-first/);
  assert.doesNotMatch(last, /data-open-after-raise-two=/);
  assert.doesNotMatch(last, /data-raise-after-open-three-first/);
  assert.doesNotMatch(last, /data-open-after-raise-three-first/);
  assert.doesNotMatch(last, /data-raise-after-open-three=/);
  assert.doesNotMatch(last, /data-open-after-raise-three=/);
  assert.doesNotMatch(last, /data-raise-after-open-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-two-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-two=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-two-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-two=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /Then Outbid/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);
});

test("occupied #1 Open deck is concentrated after Then Outbid is re-concentrated", async () => {
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
    payload: { amountUsd: 8 },
  });
  assert.equal(second.statusCode, 200);

  const rival = await createListing(app, {
    company: "Rival Pitch",
    oneLiner: "Lists below at five",
    url: "https://rival.example/deck",
  });
  const third = await app.inject({
    method: "POST",
    url: `/listings/${rival.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(third.statusCode, 200);
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const later = listingCard(html, "Helix Labs");
  const last = listingCard(html, "Rival Pitch");
  const unpaid = listingCard(html, "Cue Only");

  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-open-after-raise-one-first="true"/);
  assert.match(paid, /data-raise-after-open-two-first="true"/);
  assert.match(paid, /data-open-after-raise-two-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /data-open-after-raise-one="true"/);
  assert.match(paid, /data-raise-after-open-two="true"/);
  assert.match(paid, /data-open-after-raise-two="true"/);
  assert.match(paid, /data-raise-after-open-three-first="true"/);
  assert.match(paid, /data-open-after-raise-three-first="true"/);
  assert.match(paid, /data-raise-after-open-three="true"/);
  assert.match(paid, /data-open-after-raise-three="true"/);
  assert.match(paid, /data-raise-after-open-four-first="true"/);
  assert.match(paid, /data-raise-after-open-five-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.match(paid, /data-open-deck="true"/);
  assert.match(paid, /Open deck/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /Polar charges only the difference/);
  assert.match(paid, /href="#claim"/);
  assert.match(
    paid,
    new RegExp(
      `href="/listings/${leader.id}/clicks"[\\s\\S]*Open deck[\\s\\S]*https://stage\\.example/deck`,
    ),
  );
  assert.equal((paid.match(/data-open-after-raise-two="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-one="true"/g) ?? []).length, 1);
  assert.equal(
    (paid.match(/class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/g) ?? [])
      .length,
    1,
  );
  assert.equal((html.match(/data-open-after-raise-two-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-deck="true"/g) ?? []).length, 3);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);

  const stampAt = paid.indexOf('data-open-after-raise-two-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const openAt = paid.indexOf('data-open-after-raise-two="true"');
  const openCopy = paid.indexOf("Open deck");
  const raiseAt = paid.indexOf('data-raise-after-open-two="true"');
  const raiseCopy = paid.indexOf("Then Outbid");
  const laterOpenAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const seatAt = paid.indexOf('class="seat"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(openAt < openCopy && raiseAt > openCopy && raiseCopy > raiseAt);
  assert.ok(laterOpenAt > raiseCopy && raiseOpenAt > laterOpenAt);
  assert.ok(seatAt > raiseOpenAt && bidAt > seatAt);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-two="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-two="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*class="seat"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.match(later, /data-open-later="true"/);
  assert.doesNotMatch(later, /data-open-after-raise-two-first/);
  assert.doesNotMatch(later, /data-open-after-raise-two=/);
  assert.doesNotMatch(later, /data-raise-after-open-three-first/);
  assert.doesNotMatch(later, /data-open-after-raise-three-first/);
  assert.doesNotMatch(later, /data-raise-after-open-three=/);
  assert.doesNotMatch(later, /data-open-after-raise-three=/);
  assert.doesNotMatch(later, /data-raise-after-open-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-open-after-raise-two-first/);
  assert.doesNotMatch(last, /data-open-after-raise-two=/);
  assert.doesNotMatch(last, /data-raise-after-open-three-first/);
  assert.doesNotMatch(last, /data-open-after-raise-three-first/);
  assert.doesNotMatch(last, /data-raise-after-open-three=/);
  assert.doesNotMatch(last, /data-open-after-raise-three=/);
  assert.doesNotMatch(last, /data-raise-after-open-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-two-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-two=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /Open deck/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);

  const opened = await app.inject({
    method: "GET",
    url: `/listings/${leader.id}/clicks`,
  });
  assert.equal(opened.statusCode, 302);
  assert.equal(opened.headers.location, "https://stage.example/deck");
  const boardAfter = (await app.inject({ method: "GET", url: "/" })).body;
  assert.match(listingCard(boardAfter, "Stage Co"), /data-clicks="1"/);
  assert.match(listingCard(boardAfter, "Stage Co"), /1 clicks/);
  assert.match(listingCard(boardAfter, "Helix Labs"), /data-clicks="0"/);
});

test("occupied #1 Then Outbid is concentrated after Open deck is re-concentrated again", async () => {
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
    payload: { amountUsd: 8 },
  });
  assert.equal(second.statusCode, 200);

  const rival = await createListing(app, {
    company: "Rival Pitch",
    oneLiner: "Lists below at five",
    url: "https://rival.example/deck",
  });
  const third = await app.inject({
    method: "POST",
    url: `/listings/${rival.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(third.statusCode, 200);
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const later = listingCard(html, "Helix Labs");
  const last = listingCard(html, "Rival Pitch");
  const unpaid = listingCard(html, "Cue Only");

  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-open-after-raise-one-first="true"/);
  assert.match(paid, /data-raise-after-open-two-first="true"/);
  assert.match(paid, /data-open-after-raise-two-first="true"/);
  assert.match(paid, /data-raise-after-open-three-first="true"/);
  assert.match(paid, /data-open-after-raise-three-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /data-open-after-raise-one="true"/);
  assert.match(paid, /data-raise-after-open-two="true"/);
  assert.match(paid, /data-open-after-raise-two="true"/);
  assert.match(paid, /data-raise-after-open-three="true"/);
  assert.match(paid, /data-open-after-raise-three="true"/);
  assert.match(paid, /data-raise-after-open-four-first="true"/);
  assert.match(paid, /data-raise-after-open-five-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.match(paid, /data-raise-after-deck="true"/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /Polar charges only the difference/);
  assert.match(paid, /href="#claim"/);
  assert.equal((paid.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-two="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal(
    (paid.match(/class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/g) ?? []).length,
    1,
  );
  assert.equal((html.match(/data-raise-after-open-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-deck="true"/g) ?? []).length, 1);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);
  assert.equal((paid.match(/href="#claim"/g) ?? []).length, 2);

  const stampAt = paid.indexOf('data-raise-after-open-three-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const openAt = paid.indexOf('data-open-after-raise-two="true"');
  const raiseAt = paid.indexOf('data-raise-after-open-three="true"');
  const raiseCopy = paid.indexOf("Then Outbid");
  const laterOpenAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const seatAt = paid.indexOf('class="seat"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(raiseAt > openAt && raiseCopy > raiseAt && laterOpenAt > raiseCopy);
  assert.ok(raiseOpenAt > laterOpenAt && seatAt > raiseOpenAt && bidAt > seatAt);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-two="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-three="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*class="seat"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.doesNotMatch(later, /data-raise-after-open-three-first/);
  assert.doesNotMatch(later, /data-open-after-raise-three-first/);
  assert.doesNotMatch(later, /data-raise-after-open-three=/);
  assert.doesNotMatch(later, /data-open-after-raise-three=/);
  assert.doesNotMatch(later, /data-raise-after-open-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-raise-after-open-three-first/);
  assert.doesNotMatch(last, /data-open-after-raise-three-first/);
  assert.doesNotMatch(last, /data-raise-after-open-three=/);
  assert.doesNotMatch(last, /data-open-after-raise-three=/);
  assert.doesNotMatch(last, /data-raise-after-open-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /Then Outbid/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);
});

test("occupied #1 Open deck is concentrated after Then Outbid is re-concentrated again", async () => {
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
    payload: { amountUsd: 8 },
  });
  assert.equal(second.statusCode, 200);

  const rival = await createListing(app, {
    company: "Rival Pitch",
    oneLiner: "Lists below at five",
    url: "https://rival.example/deck",
  });
  const third = await app.inject({
    method: "POST",
    url: `/listings/${rival.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(third.statusCode, 200);
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const later = listingCard(html, "Helix Labs");
  const last = listingCard(html, "Rival Pitch");
  const unpaid = listingCard(html, "Cue Only");

  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-open-after-raise-one-first="true"/);
  assert.match(paid, /data-raise-after-open-two-first="true"/);
  assert.match(paid, /data-open-after-raise-two-first="true"/);
  assert.match(paid, /data-raise-after-open-three-first="true"/);
  assert.match(paid, /data-open-after-raise-three-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /data-open-after-raise-one="true"/);
  assert.match(paid, /data-raise-after-open-two="true"/);
  assert.match(paid, /data-open-after-raise-two="true"/);
  assert.match(paid, /data-raise-after-open-three="true"/);
  assert.match(paid, /data-open-after-raise-three="true"/);
  assert.match(paid, /data-raise-after-open-four-first="true"/);
  assert.match(paid, /data-raise-after-open-five-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.match(paid, /data-open-deck="true"/);
  assert.match(paid, /Open deck/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /Polar charges only the difference/);
  assert.match(paid, /href="#claim"/);
  assert.match(
    paid,
    new RegExp(
      `href="/listings/${leader.id}/clicks"[\\s\\S]*Open deck[\\s\\S]*https://stage\\.example/deck`,
    ),
  );
  assert.equal((paid.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-two="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal(
    (paid.match(/class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/g) ?? [])
      .length,
    1,
  );
  assert.equal((html.match(/data-open-after-raise-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-deck="true"/g) ?? []).length, 3);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);

  const stampAt = paid.indexOf('data-open-after-raise-three-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const openAt = paid.indexOf('data-open-after-raise-three="true"');
  const openCopy = paid.indexOf("Open deck");
  const raiseAt = paid.indexOf('data-raise-after-open-three="true"');
  const raiseCopy = paid.indexOf("Then Outbid");
  const laterOpenAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const seatAt = paid.indexOf('class="seat"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(openAt < openCopy && raiseAt > openCopy && raiseCopy > raiseAt);
  assert.ok(laterOpenAt > raiseCopy && raiseOpenAt > laterOpenAt);
  assert.ok(seatAt > raiseOpenAt && bidAt > seatAt);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-three="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-three="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*class="seat"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.match(later, /data-open-later="true"/);
  assert.doesNotMatch(later, /data-open-after-raise-three-first/);
  assert.doesNotMatch(later, /data-open-after-raise-three=/);
  assert.doesNotMatch(later, /data-raise-after-open-three-first/);
  assert.doesNotMatch(later, /data-raise-after-open-three=/);
  assert.doesNotMatch(later, /data-raise-after-open-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-open-after-raise-three-first/);
  assert.doesNotMatch(last, /data-open-after-raise-three=/);
  assert.doesNotMatch(last, /data-raise-after-open-three-first/);
  assert.doesNotMatch(last, /data-raise-after-open-three=/);
  assert.doesNotMatch(last, /data-raise-after-open-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /Open deck/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);

  const opened = await app.inject({
    method: "GET",
    url: `/listings/${leader.id}/clicks`,
  });
  assert.equal(opened.statusCode, 302);
  assert.equal(opened.headers.location, "https://stage.example/deck");
  const boardAfter = (await app.inject({ method: "GET", url: "/" })).body;
  assert.match(listingCard(boardAfter, "Stage Co"), /data-clicks="1"/);
  assert.match(listingCard(boardAfter, "Stage Co"), /1 clicks/);
  assert.match(listingCard(boardAfter, "Helix Labs"), /data-clicks="0"/);
});

test("occupied #1 Then Outbid is concentrated after Open deck is re-concentrated four", async () => {
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
    payload: { amountUsd: 8 },
  });
  assert.equal(second.statusCode, 200);

  const rival = await createListing(app, {
    company: "Rival Pitch",
    oneLiner: "Lists below at five",
    url: "https://rival.example/deck",
  });
  const third = await app.inject({
    method: "POST",
    url: `/listings/${rival.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(third.statusCode, 200);
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const later = listingCard(html, "Helix Labs");
  const last = listingCard(html, "Rival Pitch");
  const unpaid = listingCard(html, "Cue Only");

  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-open-after-raise-one-first="true"/);
  assert.match(paid, /data-raise-after-open-two-first="true"/);
  assert.match(paid, /data-open-after-raise-two-first="true"/);
  assert.match(paid, /data-raise-after-open-three-first="true"/);
  assert.match(paid, /data-open-after-raise-three-first="true"/);
  assert.match(paid, /data-raise-after-open-four-first="true"/);
  assert.match(paid, /data-raise-after-open-five-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /data-open-after-raise-one="true"/);
  assert.match(paid, /data-raise-after-open-two="true"/);
  assert.match(paid, /data-open-after-raise-two="true"/);
  assert.match(paid, /data-raise-after-open-three="true"/);
  assert.match(paid, /data-open-after-raise-three="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.match(paid, /data-raise-after-deck="true"/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /Polar charges only the difference/);
  assert.match(paid, /href="#claim"/);
  assert.equal((paid.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal(
    (paid.match(/class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/g) ?? []).length,
    1,
  );
  assert.equal((html.match(/data-raise-after-open-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-deck="true"/g) ?? []).length, 1);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);
  assert.equal((paid.match(/href="#claim"/g) ?? []).length, 2);

  const stampAt = paid.indexOf('data-raise-after-open-four-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const openAt = paid.indexOf('data-open-after-raise-three="true"');
  const raiseAt = paid.indexOf('data-raise-after-open-four="true"');
  const raiseCopy = paid.indexOf("Then Outbid");
  const laterOpenAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const seatAt = paid.indexOf('class="seat"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(raiseAt > openAt && raiseCopy > raiseAt && laterOpenAt > raiseCopy);
  assert.ok(raiseOpenAt > laterOpenAt && seatAt > raiseOpenAt && bidAt > seatAt);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-three="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-four="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*class="seat"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.doesNotMatch(later, /data-raise-after-open-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-open-after-raise-three-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /data-open-after-raise-three=/);
  assert.doesNotMatch(later, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-raise-after-open-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-open-after-raise-three-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);
  assert.doesNotMatch(last, /data-open-after-raise-three=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three=/);
  assert.doesNotMatch(unpaid, /Then Outbid/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);
});


test("occupied #1 Then Outbid is concentrated after Open deck is re-concentrated five", async () => {
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
    payload: { amountUsd: 8 },
  });
  assert.equal(second.statusCode, 200);

  const rival = await createListing(app, {
    company: "Rival Pitch",
    oneLiner: "Lists below at five",
    url: "https://rival.example/deck",
  });
  const third = await app.inject({
    method: "POST",
    url: `/listings/${rival.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(third.statusCode, 200);
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const later = listingCard(html, "Helix Labs");
  const last = listingCard(html, "Rival Pitch");
  const unpaid = listingCard(html, "Cue Only");

  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-open-after-raise-one-first="true"/);
  assert.match(paid, /data-raise-after-open-two-first="true"/);
  assert.match(paid, /data-open-after-raise-two-first="true"/);
  assert.match(paid, /data-raise-after-open-three-first="true"/);
  assert.match(paid, /data-open-after-raise-three-first="true"/);
  assert.match(paid, /data-raise-after-open-four-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-five-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /data-open-after-raise-one="true"/);
  assert.match(paid, /data-raise-after-open-two="true"/);
  assert.match(paid, /data-open-after-raise-two="true"/);
  assert.match(paid, /data-raise-after-open-three="true"/);
  assert.match(paid, /data-open-after-raise-three="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.match(paid, /data-raise-after-deck="true"/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /Polar charges only the difference/);
  assert.match(paid, /href="#claim"/);
  assert.equal((paid.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal(
    (paid.match(/class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/g) ?? []).length,
    1,
  );
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-deck="true"/g) ?? []).length, 1);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);
  assert.equal((paid.match(/href="#claim"/g) ?? []).length, 2);

  const stampAt = paid.indexOf('data-raise-after-open-five-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const openAt = paid.indexOf('data-open-after-raise-four="true"');
  const raiseAt = paid.indexOf('data-raise-after-open-five="true"');
  const raiseCopy = paid.indexOf("Then Outbid");
  const laterOpenAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const seatAt = paid.indexOf('class="seat"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(raiseAt > openAt && raiseCopy > raiseAt && laterOpenAt > raiseCopy);
  assert.ok(raiseOpenAt > laterOpenAt && seatAt > raiseOpenAt && bidAt > seatAt);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-four="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-five="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*class="seat"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /Then Outbid/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);
});

test("occupied #1 Open deck is concentrated after Then Outbid is re-concentrated four", async () => {
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
    payload: { amountUsd: 8 },
  });
  assert.equal(second.statusCode, 200);

  const rival = await createListing(app, {
    company: "Rival Pitch",
    oneLiner: "Lists below at five",
    url: "https://rival.example/deck",
  });
  const third = await app.inject({
    method: "POST",
    url: `/listings/${rival.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(third.statusCode, 200);
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const later = listingCard(html, "Helix Labs");
  const last = listingCard(html, "Rival Pitch");
  const unpaid = listingCard(html, "Cue Only");

  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-open-after-raise-one-first="true"/);
  assert.match(paid, /data-raise-after-open-two-first="true"/);
  assert.match(paid, /data-open-after-raise-two-first="true"/);
  assert.match(paid, /data-raise-after-open-three-first="true"/);
  assert.match(paid, /data-open-after-raise-three-first="true"/);
  assert.match(paid, /data-raise-after-open-four-first="true"/);
  assert.match(paid, /data-raise-after-open-five-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /data-open-after-raise-one="true"/);
  assert.match(paid, /data-raise-after-open-two="true"/);
  assert.match(paid, /data-open-after-raise-two="true"/);
  assert.match(paid, /data-raise-after-open-three="true"/);
  assert.match(paid, /data-open-after-raise-three="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.match(paid, /data-open-deck="true"/);
  assert.match(paid, /Open deck/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /Polar charges only the difference/);
  assert.match(paid, /href="#claim"/);
  assert.match(
    paid,
    new RegExp(
      `href="/listings/${leader.id}/clicks"[\\s\\S]*Open deck[\\s\\S]*https://stage\\.example/deck`,
    ),
  );
  assert.equal((paid.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal(
    (paid.match(/class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/g) ?? [])
      .length,
    1,
  );
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-deck="true"/g) ?? []).length, 3);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);

  const stampAt = paid.indexOf('data-open-after-raise-four-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const openAt = paid.indexOf('data-open-after-raise-four="true"');
  const openCopy = paid.indexOf("Open deck");
  const raiseAt = paid.indexOf('data-raise-after-open-four="true"');
  const raiseCopy = paid.indexOf("Then Outbid");
  const laterOpenAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const seatAt = paid.indexOf('class="seat"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(openAt < openCopy && raiseAt > openCopy && raiseCopy > raiseAt);
  assert.ok(laterOpenAt > raiseCopy && raiseOpenAt > laterOpenAt);
  assert.ok(seatAt > raiseOpenAt && bidAt > seatAt);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-four="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-four="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*class="seat"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.match(later, /data-open-later="true"/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /Open deck/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);

  const opened = await app.inject({
    method: "GET",
    url: `/listings/${leader.id}/clicks`,
  });
  assert.equal(opened.statusCode, 302);
  assert.equal(opened.headers.location, "https://stage.example/deck");
  const boardAfter = (await app.inject({ method: "GET", url: "/" })).body;
  assert.match(listingCard(boardAfter, "Stage Co"), /data-clicks="1"/);
  assert.match(listingCard(boardAfter, "Stage Co"), /1 clicks/);
  assert.match(listingCard(boardAfter, "Helix Labs"), /data-clicks="0"/);
});

test("occupied #1 Open deck is concentrated after Then Outbid is re-concentrated five", async () => {
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
    payload: { amountUsd: 8 },
  });
  assert.equal(second.statusCode, 200);

  const rival = await createListing(app, {
    company: "Rival Pitch",
    oneLiner: "Lists below at five",
    url: "https://rival.example/deck",
  });
  const third = await app.inject({
    method: "POST",
    url: `/listings/${rival.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(third.statusCode, 200);
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const later = listingCard(html, "Helix Labs");
  const last = listingCard(html, "Rival Pitch");
  const unpaid = listingCard(html, "Cue Only");

  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-open-after-raise-one-first="true"/);
  assert.match(paid, /data-raise-after-open-two-first="true"/);
  assert.match(paid, /data-open-after-raise-two-first="true"/);
  assert.match(paid, /data-raise-after-open-three-first="true"/);
  assert.match(paid, /data-open-after-raise-three-first="true"/);
  assert.match(paid, /data-raise-after-open-four-first="true"/);
  assert.match(paid, /data-raise-after-open-five-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /data-open-after-raise-one="true"/);
  assert.match(paid, /data-raise-after-open-two="true"/);
  assert.match(paid, /data-open-after-raise-two="true"/);
  assert.match(paid, /data-raise-after-open-three="true"/);
  assert.match(paid, /data-open-after-raise-three="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five"/);
  assert.match(paid, /data-open-deck="true"/);
  assert.match(paid, /Open deck/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /Polar charges only the difference/);
  assert.match(paid, /href="#claim"/);
  assert.match(
    paid,
    new RegExp(
      `href="/listings/${leader.id}/clicks"[\\s\\S]*Open deck[\\s\\S]*https://stage\\.example/deck`,
    ),
  );
  assert.equal((paid.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal(
    (paid.match(/class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/g) ?? [])
      .length,
    1,
  );
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-deck="true"/g) ?? []).length, 3);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);

  const stampAt = paid.indexOf('data-open-after-raise-five-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const openAt = paid.indexOf('data-open-after-raise-five="true"');
  const openCopy = paid.indexOf("Open deck");
  const raiseAt = paid.indexOf('data-raise-after-open-five="true"');
  const raiseCopy = paid.indexOf("Then Outbid");
  const laterOpenAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const seatAt = paid.indexOf('class="seat"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(openAt < openCopy && raiseAt > openCopy && raiseCopy > raiseAt);
  assert.ok(laterOpenAt > raiseCopy && raiseOpenAt > laterOpenAt);
  assert.ok(seatAt > raiseOpenAt && bidAt > seatAt);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-five="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-five="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*class="seat"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.match(later, /data-open-later="true"/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /Open deck/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);

  const opened = await app.inject({
    method: "GET",
    url: `/listings/${leader.id}/clicks`,
  });
  assert.equal(opened.statusCode, 302);
  assert.equal(opened.headers.location, "https://stage.example/deck");
  const boardAfter = (await app.inject({ method: "GET", url: "/" })).body;
  assert.match(listingCard(boardAfter, "Stage Co"), /data-clicks="1"/);
  assert.match(listingCard(boardAfter, "Stage Co"), /1 clicks/);
  assert.match(listingCard(boardAfter, "Helix Labs"), /data-clicks="0"/);
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
