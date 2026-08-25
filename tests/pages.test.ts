import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import { PolarFixture } from "../src/billing/polar_fixture.js";
import { getBid } from "../src/core/rank.js";
import { openDatabase } from "../src/db.js";

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

function rankedListMarkup(html: string): string {
  const start = html.indexOf(
    '<ul class="listings" aria-label="This week\'s opening slot" data-rolling-week="true">',
  );
  if (start === -1) {
    return "";
  }
  const laterStart = html.indexOf('<ul class="listings listings-later"');
  const offBoardStart = html.indexOf('<aside class="off-board"');
  const stopAt = [laterStart, offBoardStart].filter((n) => n > start);
  const endBound = stopAt.length === 0 ? html.length : Math.min(...stopAt);
  const end = html.lastIndexOf("</ul>", endBound);
  return end === -1 ? html.slice(start) : html.slice(start, end + 5);
}

function laterListMarkup(html: string): string {
  const start = html.indexOf('<ul class="listings listings-later"');
  if (start === -1) {
    return "";
  }
  const end = html.indexOf("</ul>", start);
  return end === -1 ? html.slice(start) : html.slice(start, end + 5);
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
  assert.match(html, /data-rolling-week="true"/);
  assert.match(html, /Rolling last 7 days\. Not Monday 00:00 UTC\./);
  assert.doesNotMatch(html, /The board is empty/);
  assert.doesNotMatch(html, /No listings this week/);
  assert.doesNotMatch(html, /class="empty-board"/);
  assert.doesNotMatch(boardMarkup(html), /class="listing"/);
  assert.doesNotMatch(boardMarkup(html), /<ul class="listings">/);
  assert.doesNotMatch(boardMarkup(html), /listings-later/);
  assert.doesNotMatch(boardMarkup(html), /data-later-seats/);
  assert.doesNotMatch(boardMarkup(html), /data-later-seat/);
  assert.doesNotMatch(boardMarkup(html), /data-first-click="open"/);
  assert.doesNotMatch(html, /data-off-board-list/);
  assert.doesNotMatch(html, /class="off-board"/);
  assert.match(html, /data-empty-house="true"/);
  assert.match(html, /class="house house-empty" data-empty-house="true"/);
  assert.match(html, /\.house-empty\[data-empty-house\] \[data-prize-first\]/);
  assert.match(html, /\.house-empty\[data-empty-house\] \[data-later-fact\]/);
  assert.match(html, /\.house-empty\[data-empty-house\] \.later-fact/);
  assert.match(html, /\.house-empty\[data-empty-house\] \[data-later-seat\]/);
  assert.match(html, /\.house-empty\[data-empty-house\] \[data-later-seats\]/);
  assert.match(html, /\.house-empty\[data-empty-house\] \.listings-later/);
  assert.match(html, /\.house-empty\[data-empty-house\] \[data-later-open-foot\]/);
  assert.match(html, /\.house-empty\[data-empty-house\] \.later-open-foot/);
  assert.match(html, /\.house-empty\[data-empty-house\] \[data-first-click="open"\]/);
  assert.match(html, /\.house-empty\[data-empty-house\] \[data-claim-after-slot\]/);
  assert.doesNotMatch(boardMarkup(html), /data-claim-after-slot/);
  const emptyClaimAt = html.indexOf('id="claim"');
  const emptyHeadlineAt = html.indexOf('<h1 class="headline">Opening three minutes</h1>');
  assert.ok(emptyClaimAt > -1 && emptyHeadlineAt > emptyClaimAt);
  assert.match(html, /data-first-click="claim"/);
  assert.match(html, /href="#write"/);
  assert.match(html, /class="bid-form later-write" data-later-write="true"/);
  assert.match(html, /id="write"/);
  assert.match(html, /Outbid first\. Company, deck URL, and a one-liner after that hop\./);
  assert.doesNotMatch(boardMarkup(html), /class="bid-row"/);
  const emptyMarkup = boardMarkup(html);
  const emptyHopAt = emptyMarkup.indexOf(
    '<a class="outbid" data-first-click="claim" href="#write">',
  );
  const emptyWriteAt = emptyMarkup.indexOf('data-later-write="true"');
  const emptyCompanyAt = emptyMarkup.indexOf('name="company"');
  const emptyHeadlineMarkupAt = emptyMarkup.indexOf(
    '<h1 class="headline">Opening three minutes</h1>',
  );
  assert.ok(emptyHopAt > emptyHeadlineMarkupAt && emptyWriteAt > emptyHopAt);
  assert.ok(emptyCompanyAt > emptyWriteAt);
  assert.match(
    html,
    /\.house-empty\[data-empty-house\] a\.outbid\[data-first-click="claim"\] \{[\s\S]*display: flex/,
  );
  assert.match(
    html,
    /\.house-empty\[data-empty-house\] \.later-write\[data-later-write\] \{[\s\S]*border-top: 1px dashed/,
  );
  assert.doesNotMatch(html, /data-occupied-house/);
  assert.doesNotMatch(html, /house-occupied/);
  assert.doesNotMatch(boardMarkup(html), /data-prize-first/);
  assert.doesNotMatch(boardMarkup(html), /data-later-fact/);
  assert.doesNotMatch(boardMarkup(html), /later-fact/);
  assert.doesNotMatch(html, /data-off-board/);
  assert.doesNotMatch(html, /off-board-cue/);
  assert.doesNotMatch(html, /Not on the board/);
  assert.doesNotMatch(html, /data-occupied-raise/);
  assert.doesNotMatch(html, /Polar charges only the difference/);
  assert.doesNotMatch(html, /Sunday pay raised Monday/);
  assert.doesNotMatch(html, /stays off the house/);
  assert.doesNotMatch(html, /data-return=/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-difference/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-charge/);
  assert.doesNotMatch(boardMarkup(html), /not a new bid/);
  assert.doesNotMatch(boardMarkup(html), /Same deck URL raises this row/);
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
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-six-first/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-five-first/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-four-first/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-four=/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-five=/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-six=/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-five=/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-four=/);
  assert.doesNotMatch(boardMarkup(html), /data-prize-first/);
  assert.doesNotMatch(html, /data-off-board/);
  assert.doesNotMatch(html, /off-board-cue/);
  assertNoFalsePositiveRank(html);
  for (const name of SAMPLE_COMPANIES) {
    assert.doesNotMatch(html, new RegExp(name, "i"));
  }
});

test("empty house stays empty — occupied / unpaid chrome does not leak onto /", async () => {
  const app = await buildApp({ databasePath: ":memory:", now: () => NOW });
  after(() => app.close());

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  assert.match(html, /data-empty-house="true"/);
  assert.match(html, /class="house house-empty" data-empty-house="true"/);
  assert.match(html, /class="claim-note" data-empty-room/);
  assert.match(html, /The room is empty\./);
  assert.match(html, /This week's first slot is still open\. Outbid takes it after Polar lands\./);
  assert.match(html, /data-rolling-week="true"/);
  assert.match(html, /Rolling last 7 days\. Not Monday 00:00 UTC\./);
  assert.doesNotMatch(html, /data-occupied-house/);
  assert.doesNotMatch(html, /house-occupied/);
  assert.doesNotMatch(boardMarkup(html), /data-prize-first/);
  assert.doesNotMatch(boardMarkup(html), /data-later-fact/);
  assert.doesNotMatch(boardMarkup(html), /later-fact/);
  assert.doesNotMatch(html, /data-off-board/);
  assert.doesNotMatch(html, /off-board-cue/);
  assert.doesNotMatch(html, /Not on the board/);
  assert.doesNotMatch(boardMarkup(html), /class="listing"/);
  assert.doesNotMatch(boardMarkup(html), /<ul class="listings">/);
  assert.doesNotMatch(boardMarkup(html), /listings-later/);
  assert.doesNotMatch(boardMarkup(html), /data-later-seats/);
  assert.doesNotMatch(boardMarkup(html), /data-later-seat/);
  assert.doesNotMatch(boardMarkup(html), /data-first-click="open"/);
  assert.doesNotMatch(boardMarkup(html), /data-claim-after-slot/);
  assert.doesNotMatch(html, /data-off-board-list/);
  assert.doesNotMatch(html, /class="off-board"/);
  assert.doesNotMatch(html, /data-occupied-raise/);
  assert.doesNotMatch(html, /Polar charges only the difference/);
  assert.doesNotMatch(html, /Sunday pay raised Monday/);
  assert.doesNotMatch(html, /stays off the house/);
  assert.doesNotMatch(html, /data-return=/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-difference/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-charge/);
  assert.doesNotMatch(boardMarkup(html), /not a new bid/);
  assert.doesNotMatch(boardMarkup(html), /Same deck URL raises this row/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /traction meter/i);
  assertNoFalsePositiveRank(html);
  for (const name of SAMPLE_COMPANIES) {
    assert.doesNotMatch(html, new RegExp(name, "i"));
  }

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
    url: `/listings/${listing.id}/bids`,
    payload: { amountUsd: 12 },
  });
  assert.equal(raised.statusCode, 200);
  assert.equal(getBid(app.db, listing.id, WEEK)?.amountUsd, 12);
  const occupied = (await app.inject({ method: "GET", url: "/" })).body;
  assert.match(occupied, /#1 · \$12/);
  assert.match(occupied, /class="claim-note" data-occupied-raise/);
  assert.match(occupied, /data-raise-difference="true"/);
  assert.match(occupied, /Polar charges \$<span data-raise-charge-usd>1<\/span> — only the difference/);
  assert.match(occupied, /Polar charges only the difference/);
  assert.match(occupied, /data-occupied-house="true"/);
  assert.match(occupied, /class="house house-occupied" data-occupied-house="true"/);
  assert.match(occupied, /data-rolling-week="true"/);
  assert.match(occupied, /Rolling last 7 days\. Not Monday 00:00 UTC\./);
  assert.match(occupied, /data-prize-first="true"/);
  assert.match(occupied, /class="rank later-fact" data-later-fact="true"/);
  assert.doesNotMatch(listingCard(occupied, "Stage Co"), /class="seat"/);
  assert.doesNotMatch(listingCard(occupied, "Stage Co"), /cue-label">Bid</);
  assert.doesNotMatch(boardMarkup(occupied), /data-empty-house/);
  assert.doesNotMatch(boardMarkup(occupied), /house-empty/);
  assert.doesNotMatch(occupied, /The room is empty/);
});

test("empty house stays empty — prize-first / later-fact $bid cannot leak onto /", async () => {
  const emptyApp = await buildApp({ databasePath: ":memory:", now: () => NOW });
  after(() => emptyApp.close());
  const empty = (await emptyApp.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(empty);
  assert.match(empty, /data-empty-house="true"/);
  assert.match(empty, /class="house house-empty" data-empty-house="true"/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \[data-prize-first\]/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \[data-later-fact\]/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \.later-fact/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \[data-later-seat\]/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \[data-later-seats\]/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \.listings-later/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \[data-later-open-foot\]/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \.later-open-foot/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \[data-first-click="open"\]/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \[data-claim-after-slot\]/);
  assert.match(empty, /class="claim-note" data-empty-room/);
  assert.match(empty, /The room is empty\./);
  assert.match(empty, /This week's first slot is still open\. Outbid takes it after Polar lands\./);
  assert.doesNotMatch(empty, /data-occupied-house/);
  assert.doesNotMatch(empty, /house-occupied/);
  assert.doesNotMatch(boardMarkup(empty), /data-prize-first/);
  assert.doesNotMatch(boardMarkup(empty), /data-later-fact/);
  assert.doesNotMatch(boardMarkup(empty), /later-fact/);
  assert.doesNotMatch(boardMarkup(empty), /data-later-seat/);
  assert.doesNotMatch(boardMarkup(empty), /data-later-seats/);
  assert.doesNotMatch(boardMarkup(empty), /listings-later/);
  assert.doesNotMatch(boardMarkup(empty), /data-first-click="open"/);
  assert.doesNotMatch(boardMarkup(empty), /data-claim-after-slot/);
  assert.doesNotMatch(empty, /Not on the board/);
  assert.doesNotMatch(empty, /class="seat"/);
  assert.doesNotMatch(empty, /cue-label">Bid</);
  assert.doesNotMatch(empty, /data-occupied-raise/);
  assert.doesNotMatch(empty, /Polar charges only the difference/);
  assert.doesNotMatch(empty, /Sunday pay raised Monday/);
  assert.doesNotMatch(empty, /stays off the house/);
  assert.doesNotMatch(empty, /data-return=/);
  assertNoFalsePositiveRank(empty);

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
  const later = await createListing(app, {
    company: "Helix Labs",
    oneLiner: "Benchtop instruments for small labs",
    url: "https://helix.example/deck",
  });
  const second = await app.inject({
    method: "POST",
    url: `/listings/${later.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(second.statusCode, 200);
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const occupied = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(occupied);
  const paid = listingCard(occupied, "Stage Co");
  const below = listingCard(occupied, "Helix Labs");
  const unpaid = listingCard(occupied, "Cue Only");
  assert.match(occupied, /data-occupied-house="true"/);
  assert.match(occupied, /class="house house-occupied" data-occupied-house="true"/);
  assert.match(
    occupied,
    /class="house house-occupied" data-occupied-house="true"[\s\S]*This week's opening slot[\s\S]*id="claim"/,
  );
  const occupiedMarkup = boardMarkup(occupied);
  const occupiedSlotAt = occupiedMarkup.indexOf(
    '<ul class="listings" aria-label="This week\'s opening slot" data-rolling-week="true">',
  );
  const occupiedClaimAt = occupiedMarkup.indexOf('id="claim"');
  const occupiedClaimAfterAt = occupiedMarkup.indexOf('data-claim-after-slot="true"');
  assert.ok(occupiedSlotAt > -1 && occupiedClaimAfterAt > occupiedSlotAt);
  assert.ok(occupiedClaimAt > occupiedClaimAfterAt);
  assert.match(occupied, /\.house-occupied\[data-occupied-house\] \.listing\[data-prize-first\] \.company \{[\s\S]*font-size: 2\.15rem/);
  assert.match(
    occupied,
    /\.house-occupied\[data-occupied-house\] \.listing\[data-prize-first\] \.rank\.later-fact\[data-later-fact\][\s\S]*font-size: 1\.2rem/,
  );
  assert.doesNotMatch(occupied, /^\.listing\[data-prize-first\] \.company \{/m);
  assert.doesNotMatch(boardMarkup(occupied), /data-empty-house/);
  assert.doesNotMatch(boardMarkup(occupied), /house-empty/);
  assert.doesNotMatch(occupied, /The room is empty/);
  assert.doesNotMatch(occupied, /first slot is still open/);

  assert.match(paid, /data-prize-first="true"/);
  assert.match(paid, /class="rank later-fact" data-later-fact="true"/);
  assert.match(paid, /#1 · \$20/);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  const whoAt = paid.indexOf('class="who"');
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(whoAt > -1 && laterFactAt > whoAt && bidAt > laterFactAt);

  assert.match(below, /data-rank="2"/);
  assert.match(below, /class="seat later-seat"/);
  assert.match(below, /data-later-seat="true"/);
  assert.match(below, /cue-label">Bid</);
  assert.doesNotMatch(below, /data-prize-first/);
  assert.doesNotMatch(below, /data-later-fact/);
  assert.doesNotMatch(below, /later-fact/);
  assert.doesNotMatch(below, /data-first-click="open"/);

  assert.match(unpaid, /Not on the board/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.doesNotMatch(unpaid, /data-prize-first/);
  assert.doesNotMatch(unpaid, /data-later-fact/);
  assert.doesNotMatch(unpaid, /later-fact/);
  assert.doesNotMatch(unpaid, /class="seat"/);
  assert.match(occupied, /data-off-board-list="true"/);
  assert.doesNotMatch(rankedListMarkup(occupied), /Cue Only/);
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
  assert.match(html, /data-off-board="true"/);
  assert.match(html, /data-off-board-list="true"/);
  assert.match(html, /<aside class="off-board" data-off-board-list="true"/);
  assert.match(html, /class="who"[\s\S]*Helix Labs[\s\S]*Benchtop instruments for small labs[\s\S]*Deck or site[\s\S]*https:\/\/helix\.example\/deck/);
  assert.match(html, /Not on the board[\s\S]*Unranked — no paid bid yet/);
  const unpaid = listingCard(html, "Helix Labs");
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Not on the board/);
  assert.doesNotMatch(unpaid, /class="seat"/);
  assert.doesNotMatch(unpaid, /cue-label">Bid</);
  assert.doesNotMatch(boardMarkup(html), /<ul class="listings">/);
  assert.match(html, /<ul class="off-board-list">/);
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
  assert.doesNotMatch(unpaid, /data-raise-after-open-six-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six=/);
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
  assert.doesNotMatch(boardMarkup(html), /data-raise-after-open-six-first/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-five-first/);
  assert.doesNotMatch(boardMarkup(html), /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-prize-first/);
  assert.doesNotMatch(unpaid, /data-later-fact/);
  assert.doesNotMatch(unpaid, /later-fact/);
  assert.doesNotMatch(boardMarkup(html), /data-prize-first/);
  assert.doesNotMatch(boardMarkup(html), /data-later-fact/);
  assert.doesNotMatch(html, /The board is empty/);
  assert.doesNotMatch(html, /first slot is still open/);
  assert.doesNotMatch(html, /data-empty-room/);
  assert.doesNotMatch(boardMarkup(html), /data-empty-house/);
  assert.doesNotMatch(boardMarkup(html), /data-occupied-house/);
  assert.doesNotMatch(boardMarkup(html), /house-occupied/);
  assert.doesNotMatch(html, /data-occupied-raise/);
  assert.doesNotMatch(html, /Polar charges only the difference/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-difference/);
  assert.doesNotMatch(boardMarkup(html), /data-raise-charge/);
  assert.doesNotMatch(boardMarkup(html), /not a new bid/);
  assert.doesNotMatch(boardMarkup(html), /Same deck URL raises this row/);
  assert.doesNotMatch(html, /data-rank="/);
  assert.doesNotMatch(html, /<ul class="listings" aria-label="This week's opening slot"/);
  assert.doesNotMatch(rankedListMarkup(html), /Helix Labs/);
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
    /class="cue"[\s\S]*class="who"[\s\S]*Stage Co[\s\S]*Opens the room[\s\S]*data-later-fact="true"[\s\S]*#1 · \$5[\s\S]*class="open-deck"[\s\S]*data-open-deck="true"[\s\S]*Open deck[\s\S]*https:\/\/stage\.example\/deck/,
  );
  assert.doesNotMatch(board.body, /Unranked — no paid bid yet/);
  assert.doesNotMatch(board.body, /The room is empty/);
  assert.doesNotMatch(board.body, /first slot is still open/);
  assert.doesNotMatch(boardMarkup(board.body), /data-empty-house/);
  assert.match(board.body, /class="claim-note" data-occupied-raise/);
  assert.match(board.body, /data-raise-difference="true"/);
  assert.match(board.body, /#1 is \$5\./);
  assert.match(board.body, /value="6"/);
  assert.match(
    board.body,
    /Polar charges \$<span data-raise-charge-usd>1<\/span> — only the difference/,
  );
  assert.match(board.body, /Unpaid Polar checkout stays off the house/);
  assert.match(board.body, /Polar charges only the difference/);
  const lone = listingCard(board.body, "Stage Co");
  assert.match(lone, /data-prize-first="true"/);
  const prizeAt = lone.indexOf('class="who"');
  const companyAt = lone.indexOf("Stage Co");
  const oneLinerAt = lone.indexOf("Opens the room");
  const laterFactAt = lone.indexOf('data-later-fact="true"');
  const bidAt = lone.indexOf("#1 · $5");
  const clicksAt = lone.indexOf("0 clicks");
  assert.ok(prizeAt > -1 && companyAt > prizeAt && oneLinerAt > companyAt);
  assert.ok(laterFactAt > oneLinerAt && bidAt > laterFactAt && clicksAt > bidAt);
  assert.doesNotMatch(lone, /class="seat"/);
  assert.doesNotMatch(lone, /cue-label">Bid</);
  assert.doesNotMatch(lone, /data-open-one-first/);
  assert.doesNotMatch(lone, /data-open-one=/);
  assert.doesNotMatch(lone, /class="open-deck open-one"/);
  assert.doesNotMatch(lone, /data-raise-one-first/);
  assert.doesNotMatch(lone, /data-raise-one=/);
  assert.doesNotMatch(lone, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
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
  assert.doesNotMatch(lone, /data-raise-after-open-six-first/);
  assert.doesNotMatch(lone, /data-open-after-raise-five-first/);
  assert.doesNotMatch(lone, /data-open-after-raise-four-first/);
  assert.doesNotMatch(lone, /data-raise-after-open-four=/);
  assert.doesNotMatch(lone, /data-raise-after-open-five=/);
  assert.doesNotMatch(lone, /data-raise-after-open-six=/);
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
  assert.doesNotMatch(boardMarkup(board.body), /data-raise-after-open-six-first/);
  assert.doesNotMatch(boardMarkup(board.body), /data-open-after-raise-five-first/);
  assert.doesNotMatch(boardMarkup(board.body), /data-open-after-raise-four-first/);
  assert.doesNotMatch(boardMarkup(board.body), /data-raise-after-open-four=/);
  assert.doesNotMatch(boardMarkup(board.body), /data-raise-after-open-five=/);
  assert.doesNotMatch(boardMarkup(board.body), /data-raise-after-open-six=/);
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
  assert.match(html, /data-raise-difference="true"/);
  assert.match(html, /value="13"/);
  assert.match(
    html,
    /Polar charges \$<span data-raise-charge-usd>1<\/span> — only the difference/,
  );
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
  assert.match(html, /data-raise-difference="true"/);
  assert.match(html, /data-rolling-week="true"/);
  assert.match(html, /Rolling last 7 days\. Not Monday 00:00 UTC\./);
  assert.match(html, /#1 is \$20\./);
  assert.match(html, /data-bid-step="-1"/);
  assert.match(html, /data-bid-step="1"/);
  assert.match(html, /class="outbid">Outbid/);
  assert.match(html, /class="bid-row"/);
  assert.match(html, /data-raise-charge="true"/);
  assert.match(html, /data-current-usd="20"/);
  assert.match(
    html,
    /Polar charges \$<span data-raise-charge-usd>1<\/span> — only the difference/,
  );
  assert.doesNotMatch(html, /The \$ you type is the public bid/);
  assert.doesNotMatch(html, /New deck: Polar charges that full amount/);
  assert.doesNotMatch(html, /Same deck already ranked: Polar charges only the difference/);
  assert.doesNotMatch(html, /Sunday pay raised Monday/);
  assert.doesNotMatch(html, /Same deck URL raises this row/);
  assert.match(html, /Unpaid Polar checkout stays off the house/);
  assert.doesNotMatch(html, /until Polar reports paid/);
  assert.doesNotMatch(listingCard(html, "Stage Co"), /New deck: Polar/);
  assert.doesNotMatch(listingCard(html, "Stage Co"), /Sunday pay raised Monday/);
  assert.match(html, /value="21"/);
  assert.match(html, /#1 · \$20/);
  assert.match(html, /#2 · \$5/);
  assert.match(
    html,
    /class="cue open-one-cue"[\s\S]*class="who"[\s\S]*Stage Co[\s\S]*data-open-one="true"[\s\S]*Open deck[\s\S]*data-raise-after-deck="true"[\s\S]*Then Outbid[\s\S]*data-later-fact="true"[\s\S]*#1 · \$20/,
  );
  assert.match(
    html,
    /class="cue later-cue"[\s\S]*class="who"[\s\S]*Helix Labs[\s\S]*class="seat later-seat"[\s\S]*data-later-seat="true"[\s\S]*Bid[\s\S]*#2 · \$5[\s\S]*class="later-open-foot"[\s\S]*data-later-open-foot="true"[\s\S]*data-open-later="true"[\s\S]*Open deck/,
  );
  assert.equal((html.match(/data-open-deck="true"/g) ?? []).length, 1);
  assert.equal((listingCard(html, "Stage Co").match(/class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/g) ?? []).length, 1);
  assert.equal((listingCard(html, "Helix Labs").match(/class="open-later"/g) ?? []).length, 1);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /class="open-deck/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-deck/);
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
  assert.match(listingCard(html, "Stage Co"), /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
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
  assert.match(listingCard(html, "Stage Co"), /data-raise-after-open-six-first="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-open-after-raise-five-first="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-open-after-raise-four-first="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-raise-after-open-four="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-raise-after-open-five="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-raise-after-open-six="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-open-after-raise-five="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-open-after-raise-four="true"/);
  assert.match(listingCard(html, "Helix Labs"), /data-later-deck="true"/);
  assert.match(listingCard(html, "Stage Co"), /data-prize-first="true"/);
  assert.match(listingCard(html, "Stage Co"), /class="rank later-fact" data-later-fact="true"/);
  assert.doesNotMatch(listingCard(html, "Stage Co"), /class="seat"/);
  assert.doesNotMatch(listingCard(html, "Stage Co"), /cue-label">Bid</);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-prize-first/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-later-fact/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /later-fact/);
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
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-after-open-six-first/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-after-raise-five-first/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-after-raise-four-first/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-after-open-four=/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-after-open-five=/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-raise-after-open-six=/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-after-raise-five=/);
  assert.doesNotMatch(listingCard(html, "Helix Labs"), /data-open-after-raise-four=/);
  assert.doesNotMatch(html, /data-empty-room/);
  assert.doesNotMatch(boardMarkup(html), /data-empty-house/);
  assert.doesNotMatch(html, /The room is empty/);
  assert.doesNotMatch(html, /first slot is still open/);
  assert.doesNotMatch(html, /claim this rank/i);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
});

test("occupied raise is certain — Polar charges only the difference, not a new bid", async () => {
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
    payload: { amountUsd: 40 },
  });
  assert.equal(first.statusCode, 200);

  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const raiseMarkup = boardMarkup(html);
  const listingsStart = raiseMarkup.indexOf(
    '<ul class="listings" aria-label="This week\'s opening slot" data-rolling-week="true">',
  );
  const claimAfterStart = raiseMarkup.indexOf('data-claim-after-slot="true"');
  const claimStart = raiseMarkup.indexOf('id="claim"');
  assert.ok(listingsStart > -1 && claimAfterStart > listingsStart);
  assert.ok(claimStart > claimAfterStart);
  const claim = raiseMarkup.slice(claimStart);
  const unpaid = listingCard(html, "Cue Only");

  assert.match(claim, /class="claim-note" data-occupied-raise data-raise-difference="true"/);
  assert.match(claim, /#1 is \$40\./);
  assert.match(claim, /value="41"/);
  assert.match(claim, /data-raise-charge="true"/);
  assert.match(claim, /data-current-usd="40"/);
  assert.match(
    claim,
    /Polar charges \$<span data-raise-charge-usd>1<\/span> — only the difference/,
  );
  assert.match(claim, /data-bid-step="-1"/);
  assert.match(claim, /data-bid-step="1"/);
  assert.match(claim, /class="outbid">Outbid/);
  assert.match(claim, /class="bid-row"/);
  assert.doesNotMatch(claim, /The \$ you type is the public bid/);
  assert.doesNotMatch(claim, /New deck: Polar charges that full amount/);
  assert.doesNotMatch(claim, /Same deck already ranked: Polar charges only the difference/);
  assert.doesNotMatch(claim, /Sunday pay raised Monday/);
  assert.match(
    claim,
    /Unpaid Polar checkout stays off the house/,
  );
  assert.doesNotMatch(claim, /Same deck URL raises this row/);
  assert.doesNotMatch(claim, /until Polar reports paid/);
  assert.match(claim, /function syncCharge/);
  assert.match(claim, /next > current \? next - current : 0/);
  assert.doesNotMatch(claim, /class="outbid">New bid/);
  assert.doesNotMatch(claim, /typical raise/i);
  assert.doesNotMatch(claim, /claim this rank/i);

  assert.match(unpaid, /data-off-board="true"/);
  assert.match(unpaid, /Not on the board/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.doesNotMatch(unpaid, /data-raise-difference/);
  assert.doesNotMatch(unpaid, /data-raise-charge/);
  assert.doesNotMatch(unpaid, /not a new bid/);
  assert.doesNotMatch(unpaid, /class="seat"/);
  assert.match(html, /data-off-board-list="true"/);
  assert.match(html, /<ul class="listings" aria-label="This week's opening slot" data-rolling-week="true">[\s\S]*Stage Co[\s\S]*<\/ul>[\s\S]*<aside class="off-board"/);
  assert.doesNotMatch(rankedListMarkup(html), /Cue Only/);
  assert.doesNotMatch(boardMarkup(html), /data-empty-house/);
  assert.doesNotMatch(html, /The room is empty/);
  assert.doesNotMatch(html, /first slot is still open/);
  assert.match(html, /data-claim-after-slot="true"/);
  assert.doesNotMatch(rankedListMarkup(html), /id="claim"/);
  assert.doesNotMatch(rankedListMarkup(html), /class="outbid"/);

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
      amountUsd: "55",
    }).toString(),
  });
  assert.equal(raised.statusCode, 303);
  assert.equal(getBid(app.db, leader.id, WEEK)?.amountUsd, 55);
  const raisedBoard = (await app.inject({ method: "GET", url: "/" })).body;
  assert.match(raisedBoard, /#1 · \$55/);
  assert.doesNotMatch(raisedBoard, /#2/);
  assert.equal((raisedBoard.match(/Stage Co/g) ?? []).length, 1);
  assert.match(raisedBoard, /value="56"/);
  assert.match(
    raisedBoard,
    /Polar charges \$<span data-raise-charge-usd>1<\/span> — only the difference/,
  );
  assert.match(listingCard(raisedBoard, "Cue Only"), /data-off-board="true"/);
  assert.match(listingCard(raisedBoard, "Cue Only"), /Not on the board/);
  assert.doesNotMatch(listingCard(raisedBoard, "Cue Only"), /class="seat"/);
  assert.match(raisedBoard, /data-off-board-list="true"/);
  assert.doesNotMatch(rankedListMarkup(raisedBoard), /Cue Only/);
  assert.doesNotMatch(boardMarkup(raisedBoard), /data-empty-house/);
});

test("occupied claim keeps raise-pays-difference short — ± Outbid stay the action", async () => {
  const emptyApp = await buildApp({ databasePath: ":memory:", now: () => NOW });
  after(() => emptyApp.close());
  const empty = (await emptyApp.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(empty);
  assert.match(empty, /<a class="outbid" data-first-click="claim" href="#write">Outbid<\/a>/);
  assert.match(empty, /class="bid-form later-write" data-later-write="true"/);
  assert.doesNotMatch(boardMarkup(empty), /class="bid-row"/);
  assert.doesNotMatch(empty, /data-occupied-raise/);
  assert.doesNotMatch(empty, /New deck: Polar/);
  assert.doesNotMatch(empty, /Sunday pay raised Monday/);
  assert.doesNotMatch(empty, /The \$ you type is the public bid/);

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
  const later = await createListing(app, {
    company: "Helix Labs",
    oneLiner: "Benchtop instruments for small labs",
    url: "https://helix.example/deck",
  });
  const second = await app.inject({
    method: "POST",
    url: `/listings/${later.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(second.statusCode, 200);

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const markup = boardMarkup(html);
  const claimStart = markup.indexOf('id="claim"');
  const claim = markup.slice(claimStart);
  const cue = listingCard(html, "Stage Co");

  assert.match(claim, /class="claim-note" data-occupied-raise data-raise-difference="true"/);
  assert.match(claim, /#1 is \$20\./);
  assert.match(
    claim,
    /Polar charges \$<span data-raise-charge-usd>1<\/span> — only the difference/,
  );
  assert.match(claim, /data-bid-step="-1"/);
  assert.match(claim, /data-bid-step="1"/);
  assert.match(claim, /class="bid-field"/);
  assert.match(claim, /class="outbid">Outbid/);
  assert.match(claim, /class="bid-row"/);
  assert.doesNotMatch(claim, /The \$ you type is the public bid/);
  assert.doesNotMatch(claim, /New deck: Polar/);
  assert.doesNotMatch(claim, /Same deck already ranked/);
  assert.doesNotMatch(claim, /Sunday pay raised Monday/);
  assert.doesNotMatch(claim, /Same deck URL raises this row/);
  assert.match(claim, /Unpaid Polar checkout stays off the house/);
  assert.doesNotMatch(claim, /until Polar reports paid/);
  assert.doesNotMatch(cue, /New deck: Polar/);
  assert.doesNotMatch(cue, /Sunday pay raised Monday/);
  assert.doesNotMatch(cue, /The \$ you type is the public bid/);
  assert.match(cue, /Polar charges only the difference/);
  assert.doesNotMatch(boardMarkup(html), /data-first-click="claim"/);
  assert.doesNotMatch(boardMarkup(html), /data-later-write/);
  assert.doesNotMatch(html, /data-return=/);
});

test("occupied raise-charge stays quiet — ± Outbid stay the action", async () => {
  const emptyApp = await buildApp({ databasePath: ":memory:", now: () => NOW });
  after(() => emptyApp.close());
  const empty = (await emptyApp.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(empty);
  assert.match(empty, /<a class="outbid" data-first-click="claim" href="#write">Outbid<\/a>/);
  assert.match(empty, /class="bid-form later-write" data-later-write="true"/);
  assert.doesNotMatch(boardMarkup(empty), /class="bid-row"/);
  assert.doesNotMatch(empty, /data-occupied-raise/);
  assert.doesNotMatch(empty, /data-raise-charge/);
  assert.doesNotMatch(empty, /data-quiet-charge/);
  assert.doesNotMatch(empty, /\.house-occupied\[data-occupied-house\] \.claim-note \.raise-charge/);
  assert.doesNotMatch(empty, /New deck: Polar/);
  assert.doesNotMatch(empty, /Sunday pay raised Monday/);
  assert.doesNotMatch(empty, /The \$ you type is the public bid/);

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
  const later = await createListing(app, {
    company: "Helix Labs",
    oneLiner: "Benchtop instruments for small labs",
    url: "https://helix.example/deck",
  });
  const second = await app.inject({
    method: "POST",
    url: `/listings/${later.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(second.statusCode, 200);
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const markup = boardMarkup(html);
  const claimStart = markup.indexOf('id="claim"');
  const claim = markup.slice(claimStart);
  const cue = listingCard(html, "Stage Co");
  const unpaid = listingCard(html, "Cue Only");

  assert.match(claim, /class="claim-note" data-occupied-raise data-raise-difference="true"/);
  assert.match(claim, /data-raise-charge="true"/);
  assert.match(claim, /data-quiet-charge="true"/);
  assert.match(
    claim,
    /Polar charges \$<span data-raise-charge-usd>1<\/span> — only the difference/,
  );
  assert.match(
    html,
    /\.house-occupied\[data-occupied-house\] \.claim-note \.raise-charge\[data-raise-charge\] \{[\s\S]*font-family: var\(--sans\)[\s\S]*font-size: 0\.75rem[\s\S]*color: rgb\(143, 122, 98\)/,
  );
  assert.match(
    html,
    /\.house-occupied\[data-occupied-house\] \.claim-after-slot\[data-claim-after-slot\] \.bid-field \{[\s\S]*font-size: 1\.45rem/,
  );
  assert.doesNotMatch(
    html,
    /\.claim-note \.raise-charge \{\s*display: block;\s*margin: 0\.4rem 0 0\.2rem;\s*font-family: var\(--serif\);\s*font-size: 1\.2rem;\s*color: var\(--cream\);/,
  );
  const minusAt = claim.indexOf('data-bid-step="-1"');
  const fieldAt = claim.indexOf('class="bid-field"');
  const plusAt = claim.indexOf('data-bid-step="1"');
  const chargeAt = claim.indexOf('data-raise-charge="true"');
  const outbidAt = claim.indexOf('class="outbid">Outbid');
  assert.ok(minusAt > -1 && fieldAt > minusAt && plusAt > fieldAt);
  assert.ok(chargeAt > plusAt && outbidAt > chargeAt);
  assert.match(claim, /class="bid-row"/);
  assert.doesNotMatch(claim, /The \$ you type is the public bid/);
  assert.doesNotMatch(claim, /New deck: Polar/);
  assert.doesNotMatch(claim, /Same deck already ranked/);
  assert.doesNotMatch(claim, /Sunday pay raised Monday/);
  assert.doesNotMatch(claim, /Same deck URL raises this row/);
  assert.match(claim, /Unpaid Polar checkout stays off the house/);
  assert.doesNotMatch(cue, /data-raise-charge/);
  assert.doesNotMatch(cue, /data-quiet-charge/);
  assert.doesNotMatch(cue, /New deck: Polar/);
  assert.doesNotMatch(cue, /Sunday pay raised Monday/);
  assert.match(cue, /Polar charges only the difference/);
  assert.match(unpaid, /data-off-board="true"/);
  assert.doesNotMatch(unpaid, /data-raise-charge/);
  assert.doesNotMatch(unpaid, /data-quiet-charge/);
  assert.doesNotMatch(boardMarkup(html), /data-first-click="claim"/);
  assert.doesNotMatch(boardMarkup(html), /data-later-write/);
  assert.doesNotMatch(html, /data-return=/);
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
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const hopAt = paid.indexOf('data-open-deck="true"');
  assert.ok(whoAt > -1 && laterFactAt > whoAt && hopAt > laterFactAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.match(paid, /data-prize-first="true"/);
  assert.doesNotMatch(unpaid, /data-prize-first/);
  assert.doesNotMatch(paid, /data-open-one-first/);
  assert.doesNotMatch(paid, /data-open-one=/);
  assert.doesNotMatch(paid, /class="open-deck open-one"/);
  assert.doesNotMatch(paid, /data-raise-one-first/);
  assert.doesNotMatch(paid, /data-raise-one=/);
  assert.doesNotMatch(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
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
  assert.doesNotMatch(paid, /data-raise-after-open-six-first/);
  assert.doesNotMatch(paid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(paid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(paid, /data-raise-after-open-four=/);
  assert.doesNotMatch(paid, /data-raise-after-open-five=/);
  assert.doesNotMatch(paid, /data-raise-after-open-six=/);
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
  assert.match(unpaid, /data-off-board="true"/);
  assert.match(unpaid, /Not on the board/);
  assert.doesNotMatch(unpaid, /class="seat"/);
  assert.doesNotMatch(unpaid, /cue-label">Bid</);
  assert.doesNotMatch(paid, /data-off-board/);
  assert.match(html, /data-off-board-list="true"/);
  assert.match(html, /<ul class="listings" aria-label="This week's opening slot" data-rolling-week="true">[\s\S]*Stage Co[\s\S]*<\/ul>[\s\S]*<aside class="off-board"/);
  assert.doesNotMatch(rankedListMarkup(html), /Helix Labs/);
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
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
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
  assert.match(below, /data-later-open-foot="true"/);
  assert.match(below, /data-later-deck="true"/);
  assert.match(below, /data-open-later="true"/);
  assert.doesNotMatch(below, /data-open-deck/);
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
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-raise-after-open-six="true"/);
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
  assert.doesNotMatch(below, /data-raise-after-open-six-first/);
  assert.doesNotMatch(below, /data-open-after-raise-five-first/);
  assert.doesNotMatch(below, /data-open-after-raise-four-first/);
  assert.doesNotMatch(below, /data-raise-after-open-four=/);
  assert.doesNotMatch(below, /data-raise-after-open-five=/);
  assert.doesNotMatch(below, /data-raise-after-open-six=/);
  assert.doesNotMatch(below, /data-open-after-raise-five=/);
  assert.doesNotMatch(below, /data-open-after-raise-four=/);
  assert.match(html, /class="claim-note" data-occupied-raise/);
  assert.match(html, /Polar charges \$<span data-raise-charge-usd>/);
  assert.doesNotMatch(html, /The \$ you type is the public bid/);
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-raise-after-open-six="true"/);
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
  assert.doesNotMatch(below, /data-raise-after-open-six-first/);
  assert.doesNotMatch(below, /data-open-after-raise-five-first/);
  assert.doesNotMatch(below, /data-open-after-raise-four-first/);
  assert.doesNotMatch(below, /data-raise-after-open-four=/);
  assert.doesNotMatch(below, /data-raise-after-open-five=/);
  assert.doesNotMatch(below, /data-raise-after-open-six=/);
  assert.doesNotMatch(below, /data-open-after-raise-five=/);
  assert.doesNotMatch(below, /data-open-after-raise-four=/);
  assert.match(below, /data-rank="2"/);
  assert.match(below, /data-later-open-foot="true"/);
  assert.match(below, /data-later-deck="true"/);
  assert.match(below, /data-open-later="true"/);
  assert.doesNotMatch(below, /data-open-deck/);
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-raise-after-open-six="true"/);
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
  assert.doesNotMatch(below, /data-raise-after-open-six-first/);
  assert.doesNotMatch(below, /data-open-after-raise-five-first/);
  assert.doesNotMatch(below, /data-open-after-raise-four-first/);
  assert.doesNotMatch(below, /data-raise-after-open-four=/);
  assert.doesNotMatch(below, /data-raise-after-open-five=/);
  assert.doesNotMatch(below, /data-raise-after-open-six=/);
  assert.doesNotMatch(below, /data-open-after-raise-five=/);
  assert.doesNotMatch(below, /data-open-after-raise-four=/);
  assert.match(below, /data-rank="2"/);
  assert.match(below, /data-later-open-foot="true"/);
  assert.match(below, /data-later-deck="true"/);
  assert.match(below, /data-open-later="true"/);
  assert.doesNotMatch(below, /data-open-deck/);
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
  assert.match(later, /class="later-open-foot"/);
  assert.match(later, /data-later-open-foot="true"/);
  assert.match(later, /class="open-later"/);
  assert.doesNotMatch(later, /class="open-deck/);
  assert.doesNotMatch(later, /data-open-deck/);
  assert.match(later, /Open deck/);
  assert.match(
    later,
    new RegExp(
      `href="/listings/${challenger.id}/clicks"[\\s\\S]*Open deck[\\s\\S]*https://helix\\.example/deck`,
    ),
  );
  const laterStamp = later.indexOf('data-later-deck="true"');
  const laterWho = later.indexOf('class="who"');
  const laterSeat = later.indexOf('class="seat later-seat"');
  const laterBid = later.indexOf("#2 · $8");
  const laterFoot = later.indexOf('data-later-open-foot="true"');
  const laterHop = later.indexOf('data-open-later="true"');
  const laterOpen = later.indexOf("Open deck");
  assert.ok(laterStamp > -1 && laterWho > laterStamp && laterSeat > laterWho);
  assert.ok(laterBid > laterSeat && laterFoot > laterBid && laterHop > laterFoot);
  assert.ok(laterOpen > laterHop);
  assert.match(later, /data-later-seat="true"/);
  assert.doesNotMatch(later, /data-first-click="open"/);
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
  assert.doesNotMatch(later, /data-raise-after-open-six-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-raise-after-open-six=/);
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
  assert.doesNotMatch(last, /data-raise-after-open-six-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-raise-after-open-six=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);

  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-open-deck="true"/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-raise-after-open-six="true"/);
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
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  assert.ok(whoAt > -1 && hopAt > whoAt && laterFactAt > hopAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);

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
  assert.doesNotMatch(unpaid, /data-raise-after-open-six-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /Open deck/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.match(paid, /data-prize-first="true"/);
  assert.doesNotMatch(later, /data-prize-first/);
  assert.doesNotMatch(last, /data-prize-first/);
  assert.doesNotMatch(unpaid, /data-prize-first/);

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
  assert.match(paid, /data-first-click="open"/);
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
  const firstClickAt = paid.indexOf('data-first-click="open"');
  const openAt = paid.indexOf("Open deck");
  const raiseAt = paid.indexOf('data-raise-after-deck="true"');
  const afterAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && hopAt > whoAt);
  assert.ok(firstClickAt > hopAt && openAt > firstClickAt);
  assert.ok(openAt > hopAt && raiseAt > openAt && afterAt > raiseAt);
  assert.ok(raiseOpenAt > afterAt && laterFactAt > raiseOpenAt && bidAt > laterFactAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-one="true"[\s\S]*Open deck[\s\S]*data-raise-after-deck="true"[\s\S]*Then Outbid[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*data-later-fact="true"[\s\S]*#1 · \$20/,
  );
  assert.match(paid, /data-raise-one-first="true"/);
  assert.match(paid, /data-raise-one="true"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-raise-after-open-six="true"/);
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
  assert.equal((html.match(/data-raise-after-open-six-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.doesNotMatch(paid, /data-later-deck/);
  assert.doesNotMatch(paid, /data-open-later/);
  assert.doesNotMatch(paid, /open-later/);

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.match(later, /data-open-later="true"/);
  assert.match(later, /data-later-seat="true"/);
  assert.doesNotMatch(later, /data-first-click="open"/);
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
  assert.doesNotMatch(later, /data-raise-after-open-six-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-raise-after-open-six=/);
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
  assert.doesNotMatch(last, /data-raise-after-open-six-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-raise-after-open-six=/);
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
  assert.doesNotMatch(unpaid, /data-raise-after-open-six-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six=/);
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
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-raise-after-open-six="true"/);
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
  assert.equal((paid.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/g) ?? []).length, 1);
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
  assert.equal((html.match(/data-raise-after-open-six-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
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
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(raiseAt > openAt && raiseCopy > raiseAt && afterAt > raiseCopy);
  assert.ok(raiseOpenAt > afterAt && laterFactAt > raiseOpenAt && bidAt > laterFactAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-one="true"[\s\S]*Open deck[\s\S]*data-raise-one="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*data-later-fact="true"[\s\S]*#1 · \$20/,
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
  assert.doesNotMatch(later, /data-raise-after-open-six-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-raise-after-open-six=/);
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
  assert.doesNotMatch(last, /data-raise-after-open-six-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-raise-after-open-six=/);
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
  assert.doesNotMatch(unpaid, /data-raise-after-open-six-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six=/);
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
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-raise-after-open-six="true"/);
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
  assert.equal((html.match(/data-raise-after-open-six-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
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
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(afterRaiseAt > openAt && afterRaiseAt < openCopy);
  assert.ok(openCopy > openAt && raiseAt > openCopy && raiseCopy > raiseAt);
  assert.ok(laterOpenAt > raiseCopy && raiseOpenAt > laterOpenAt);
  assert.ok(laterFactAt > raiseOpenAt && bidAt > laterFactAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-one="true"[\s\S]*Open deck[\s\S]*data-raise-one="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*data-later-fact="true"[\s\S]*#1 · \$20/,
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
  assert.doesNotMatch(later, /data-raise-after-open-six-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-raise-after-open-six=/);
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
  assert.doesNotMatch(last, /data-raise-after-open-six-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-raise-after-open-six=/);
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
  assert.doesNotMatch(unpaid, /data-raise-after-open-six-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six=/);
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-raise-after-open-six="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
  assert.match(paid, /data-raise-after-deck="true"/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /Polar charges only the difference/);
  assert.match(paid, /href="#claim"/);
  assert.equal((paid.match(/data-raise-after-open-two="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal(
    (paid.match(/class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/g) ?? []).length,
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
  assert.equal((html.match(/data-raise-after-open-six-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
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
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(raiseAt > openAt && raiseCopy > raiseAt && laterOpenAt > raiseCopy);
  assert.ok(raiseOpenAt > laterOpenAt && laterFactAt > raiseOpenAt && bidAt > laterFactAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-one="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-two="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*data-later-fact="true"[\s\S]*#1 · \$20/,
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
  assert.doesNotMatch(later, /data-raise-after-open-six-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-raise-after-open-six=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
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
  assert.doesNotMatch(last, /data-raise-after-open-six-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-raise-after-open-six=/);
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
  assert.doesNotMatch(unpaid, /data-raise-after-open-six-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six=/);
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-raise-after-open-six="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
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
  assert.equal((html.match(/data-raise-after-open-six-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-deck="true"/g) ?? []).length, 1);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);

  const stampAt = paid.indexOf('data-open-after-raise-two-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const openAt = paid.indexOf('data-open-after-raise-two="true"');
  const openCopy = paid.indexOf("Open deck");
  const raiseAt = paid.indexOf('data-raise-after-open-two="true"');
  const raiseCopy = paid.indexOf("Then Outbid");
  const laterOpenAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(openAt < openCopy && raiseAt > openCopy && raiseCopy > raiseAt);
  assert.ok(laterOpenAt > raiseCopy && raiseOpenAt > laterOpenAt);
  assert.ok(laterFactAt > raiseOpenAt && bidAt > laterFactAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-two="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-two="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*data-later-fact="true"[\s\S]*#1 · \$20/,
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
  assert.doesNotMatch(later, /data-raise-after-open-six-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-raise-after-open-six=/);
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
  assert.doesNotMatch(last, /data-raise-after-open-six-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-raise-after-open-six=/);
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
  assert.doesNotMatch(unpaid, /data-raise-after-open-six-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six=/);
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-raise-after-open-six="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
  assert.match(paid, /data-raise-after-deck="true"/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /Polar charges only the difference/);
  assert.match(paid, /href="#claim"/);
  assert.equal((paid.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-two="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal(
    (paid.match(/class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/g) ?? []).length,
    1,
  );
  assert.equal((html.match(/data-raise-after-open-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
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
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(raiseAt > openAt && raiseCopy > raiseAt && laterOpenAt > raiseCopy);
  assert.ok(raiseOpenAt > laterOpenAt && laterFactAt > raiseOpenAt && bidAt > laterFactAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-two="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-three="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*data-later-fact="true"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.doesNotMatch(later, /data-raise-after-open-three-first/);
  assert.doesNotMatch(later, /data-open-after-raise-three-first/);
  assert.doesNotMatch(later, /data-raise-after-open-three=/);
  assert.doesNotMatch(later, /data-open-after-raise-three=/);
  assert.doesNotMatch(later, /data-raise-after-open-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-raise-after-open-six-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-raise-after-open-six=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-raise-after-open-three-first/);
  assert.doesNotMatch(last, /data-open-after-raise-three-first/);
  assert.doesNotMatch(last, /data-raise-after-open-three=/);
  assert.doesNotMatch(last, /data-open-after-raise-three=/);
  assert.doesNotMatch(last, /data-raise-after-open-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-raise-after-open-six-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-raise-after-open-six=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six=/);
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
  assert.match(paid, /data-open-after-raise-five-first="true"/);
  assert.match(paid, /data-open-after-raise-four-first="true"/);
  assert.match(paid, /data-raise-after-open-four="true"/);
  assert.match(paid, /data-raise-after-open-five="true"/);
  assert.match(paid, /data-raise-after-open-six="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
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
  assert.equal((html.match(/data-raise-after-open-six-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-two="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-deck="true"/g) ?? []).length, 1);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);

  const stampAt = paid.indexOf('data-open-after-raise-three-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const openAt = paid.indexOf('data-open-after-raise-three="true"');
  const openCopy = paid.indexOf("Open deck");
  const raiseAt = paid.indexOf('data-raise-after-open-three="true"');
  const raiseCopy = paid.indexOf("Then Outbid");
  const laterOpenAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(openAt < openCopy && raiseAt > openCopy && raiseCopy > raiseAt);
  assert.ok(laterOpenAt > raiseCopy && raiseOpenAt > laterOpenAt);
  assert.ok(laterFactAt > raiseOpenAt && bidAt > laterFactAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-three="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-three="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*data-later-fact="true"[\s\S]*#1 · \$20/,
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
  assert.doesNotMatch(later, /data-raise-after-open-six-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-raise-after-open-six=/);
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
  assert.doesNotMatch(last, /data-raise-after-open-six-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-raise-after-open-six=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-three=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six=/);
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
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
  assert.match(paid, /data-raise-after-open-six="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
  assert.match(paid, /data-raise-after-deck="true"/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /Polar charges only the difference/);
  assert.match(paid, /href="#claim"/);
  assert.equal((paid.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-three="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal(
    (paid.match(/class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/g) ?? []).length,
    1,
  );
  assert.equal((html.match(/data-raise-after-open-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
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
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(raiseAt > openAt && raiseCopy > raiseAt && laterOpenAt > raiseCopy);
  assert.ok(raiseOpenAt > laterOpenAt && laterFactAt > raiseOpenAt && bidAt > laterFactAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-three="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-four="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*data-later-fact="true"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.doesNotMatch(later, /data-raise-after-open-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-raise-after-open-six-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-open-after-raise-three-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-raise-after-open-six=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /data-open-after-raise-three=/);
  assert.doesNotMatch(later, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-raise-after-open-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-raise-after-open-six-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-open-after-raise-three-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-raise-after-open-six=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);
  assert.doesNotMatch(last, /data-open-after-raise-three=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-three-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six=/);
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
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
  assert.match(paid, /data-raise-after-open-six="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
  assert.match(paid, /data-raise-after-deck="true"/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /Polar charges only the difference/);
  assert.match(paid, /href="#claim"/);
  assert.equal((paid.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal(
    (paid.match(/class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/g) ?? []).length,
    1,
  );
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
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
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(raiseAt > openAt && raiseCopy > raiseAt && laterOpenAt > raiseCopy);
  assert.ok(raiseOpenAt > laterOpenAt && laterFactAt > raiseOpenAt && bidAt > laterFactAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-four="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-five="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*data-later-fact="true"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-raise-after-open-six-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-raise-after-open-six=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-raise-after-open-six-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-raise-after-open-six=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /Then Outbid/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);
});

test("occupied #1 Then Outbid is concentrated after Open deck is re-concentrated six", async () => {
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
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
  assert.match(paid, /data-raise-after-open-six="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
  assert.match(paid, /data-raise-after-deck="true"/);
  assert.match(paid, /Then Outbid/);
  assert.match(paid, /Polar charges only the difference/);
  assert.match(paid, /href="#claim"/);
  assert.equal((paid.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((paid.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal(
    (paid.match(/class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/g) ?? []).length,
    1,
  );
  assert.equal((html.match(/data-raise-after-open-six-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-one="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-deck="true"/g) ?? []).length, 1);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);
  assert.equal((paid.match(/href="#claim"/g) ?? []).length, 2);

  const stampAt = paid.indexOf('data-raise-after-open-six-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const openAt = paid.indexOf('data-open-after-raise-five="true"');
  const raiseAt = paid.indexOf('data-raise-after-open-six="true"');
  const raiseCopy = paid.indexOf("Then Outbid");
  const laterOpenAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(raiseAt > openAt && raiseCopy > raiseAt && laterOpenAt > raiseCopy);
  assert.ok(raiseOpenAt > laterOpenAt && laterFactAt > raiseOpenAt && bidAt > laterFactAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-five="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-six="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*data-later-fact="true"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.doesNotMatch(later, /data-raise-after-open-six-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-raise-after-open-six=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-raise-after-open-six-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-raise-after-open-six=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
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
  assert.match(paid, /data-raise-after-open-six="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
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
  assert.equal((paid.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
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
  assert.equal((html.match(/data-raise-after-open-six-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-three="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-deck="true"/g) ?? []).length, 1);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);

  const stampAt = paid.indexOf('data-open-after-raise-four-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const openAt = paid.indexOf('data-open-after-raise-four="true"');
  const openCopy = paid.indexOf("Open deck");
  const raiseAt = paid.indexOf('data-raise-after-open-four="true"');
  const raiseCopy = paid.indexOf("Then Outbid");
  const laterOpenAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(openAt < openCopy && raiseAt > openCopy && raiseCopy > raiseAt);
  assert.ok(laterOpenAt > raiseCopy && raiseOpenAt > laterOpenAt);
  assert.ok(laterFactAt > raiseOpenAt && bidAt > laterFactAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-four="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-four="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*data-later-fact="true"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.match(later, /data-open-later="true"/);
  assert.doesNotMatch(later, /data-open-after-raise-four-first/);
  assert.doesNotMatch(later, /data-open-after-raise-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-four-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-raise-after-open-six-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-raise-after-open-four=/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-raise-after-open-six=/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-open-after-raise-four-first/);
  assert.doesNotMatch(last, /data-open-after-raise-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-four-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-raise-after-open-six-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-raise-after-open-four=/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-raise-after-open-six=/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-four=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six=/);
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
  assert.match(paid, /data-raise-after-open-six-first="true"/);
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
  assert.match(paid, /data-raise-after-open-six="true"/);
  assert.match(paid, /data-open-after-raise-five="true"/);
  assert.match(paid, /data-open-after-raise-four="true"/);
  assert.match(paid, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.match(paid, /class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six"/);
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
  assert.equal((paid.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
  assert.equal(
    (paid.match(/class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/g) ?? [])
      .length,
    1,
  );
  assert.equal((html.match(/data-open-after-raise-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-five="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-raise-after-open-six="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise-four="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-after-raise="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-open-deck="true"/g) ?? []).length, 1);
  assert.equal((html.match(/>\s*Then Outbid\s*</g) ?? []).length, 2);

  const stampAt = paid.indexOf('data-open-after-raise-five-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const openAt = paid.indexOf('data-open-after-raise-five="true"');
  const openCopy = paid.indexOf("Open deck");
  const raiseAt = paid.indexOf('data-raise-after-open-five="true"');
  const raiseCopy = paid.indexOf("Then Outbid");
  const laterOpenAt = paid.indexOf('data-open-after-raise="true"');
  const raiseOpenAt = paid.indexOf('data-raise-after-open="true"');
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(stampAt > -1 && whoAt > stampAt && openAt > whoAt);
  assert.ok(openAt < openCopy && raiseAt > openCopy && raiseCopy > raiseAt);
  assert.ok(laterOpenAt > raiseCopy && raiseOpenAt > laterOpenAt);
  assert.ok(laterFactAt > raiseOpenAt && bidAt > laterFactAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*data-open-after-raise-five="true"[\s\S]*Open deck[\s\S]*data-raise-after-open-five="true"[\s\S]*Then Outbid[\s\S]*Polar charges only the difference[\s\S]*data-open-after-raise="true"[\s\S]*Open deck[\s\S]*after Then Outbid[\s\S]*data-raise-after-open="true"[\s\S]*Then Outbid[\s\S]*after Open deck[\s\S]*data-later-fact="true"[\s\S]*#1 · \$20/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.match(later, /data-open-later="true"/);
  assert.doesNotMatch(later, /data-open-after-raise-five-first/);
  assert.doesNotMatch(later, /data-open-after-raise-five=/);
  assert.doesNotMatch(later, /data-raise-after-open-five-first/);
  assert.doesNotMatch(later, /data-raise-after-open-six-first/);
  assert.doesNotMatch(later, /data-raise-after-open-five=/);
  assert.doesNotMatch(later, /data-raise-after-open-six=/);
  assert.doesNotMatch(later, /class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five"/);
  assert.doesNotMatch(later, /Then Outbid/);
  assert.doesNotMatch(last, /data-open-after-raise-five-first/);
  assert.doesNotMatch(last, /data-open-after-raise-five=/);
  assert.doesNotMatch(last, /data-raise-after-open-five-first/);
  assert.doesNotMatch(last, /data-raise-after-open-six-first/);
  assert.doesNotMatch(last, /data-raise-after-open-five=/);
  assert.doesNotMatch(last, /data-raise-after-open-six=/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five-first/);
  assert.doesNotMatch(unpaid, /data-open-after-raise-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six-first/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-five=/);
  assert.doesNotMatch(unpaid, /data-raise-after-open-six=/);
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

test("occupied #1 pitch title reads first and larger than $bid", async () => {
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
  assert.match(paid, /data-prize-first="true"/);
  assert.match(paid, /class="who"[\s\S]*Stage Co[\s\S]*Opens the room[\s\S]*data-later-fact="true"[\s\S]*#1 · \$20[\s\S]*clicks/);
  const stampAt = paid.indexOf('data-prize-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const companyAt = paid.indexOf("Stage Co");
  const oneLinerAt = paid.indexOf("Opens the room");
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  const clicksAt = paid.indexOf("0 clicks");
  assert.ok(stampAt > -1 && whoAt > stampAt && companyAt > whoAt);
  assert.ok(oneLinerAt > companyAt && laterFactAt > oneLinerAt && bidAt > laterFactAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.ok(clicksAt > bidAt);
  assert.match(html, /\.house-occupied\[data-occupied-house\] \.listing\[data-prize-first\] \.company \{[\s\S]*font-size: 2\.15rem/);
  assert.match(html, /\.house-occupied\[data-occupied-house\] \.listing\[data-prize-first\] \.rank\.later-fact\[data-later-fact\][\s\S]*font-size: 1\.2rem/);
  assert.doesNotMatch(html, /\.house-occupied\[data-occupied-house\] \.listing\[data-prize-first\] \.seat/);
  assert.equal((html.match(/data-prize-first="true"/g) ?? []).length, 1);
  assert.equal((html.match(/data-later-fact="true"/g) ?? []).length, 1);
  assert.equal((html.match(/class="rank later-fact"/g) ?? []).length, 1);

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.doesNotMatch(later, /data-prize-first/);
  assert.doesNotMatch(later, /data-later-fact/);
  assert.doesNotMatch(later, /later-fact/);
  assert.doesNotMatch(last, /data-prize-first/);
  assert.doesNotMatch(last, /data-later-fact/);
  assert.doesNotMatch(unpaid, /data-prize-first/);
  assert.doesNotMatch(unpaid, /data-later-fact/);
  assert.doesNotMatch(unpaid, /later-fact/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.match(unpaid, /Deck or site/);
  assert.match(unpaid, /data-off-board="true"/);
  assert.match(unpaid, /Not on the board/);
  assert.doesNotMatch(unpaid, /class="seat"/);
  assert.doesNotMatch(unpaid, /cue-label">Bid</);
  assert.doesNotMatch(paid, /data-off-board/);
  assert.doesNotMatch(later, /data-off-board/);
  assert.doesNotMatch(last, /data-off-board/);
  assert.doesNotMatch(unpaid, /Open deck/);
  assert.match(html, /class="claim-note" data-occupied-raise/);
  assert.match(html, /Polar charges only the difference/);
  assert.match(html, /data-raise-difference="true"/);
  assert.doesNotMatch(boardMarkup(html), /data-empty-house/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);
  assert.doesNotMatch(html, /The room is empty/);
});

test("occupied #1 pitch title stays the prize — Bid seat is not beside the title", async () => {
  const emptyApp = await buildApp({ databasePath: ":memory:", now: () => NOW });
  after(() => emptyApp.close());
  const empty = (await emptyApp.inject({ method: "GET", url: "/" })).body;

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
  assert.match(paid, /data-prize-first="true"/);
  assert.match(paid, /class="rank later-fact" data-later-fact="true"/);
  assert.match(paid, /#1 · \$20/);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  const prizeAt = paid.indexOf('data-prize-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const companyAt = paid.indexOf("Stage Co");
  const oneLinerAt = paid.indexOf("Opens the room");
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  const clicksAt = paid.indexOf("0 clicks");
  const seatAt = paid.indexOf('class="seat"');
  const bidLabelAt = paid.indexOf('cue-label">Bid');
  assert.ok(prizeAt > -1 && whoAt > prizeAt && companyAt > whoAt);
  assert.ok(oneLinerAt > companyAt && laterFactAt > oneLinerAt);
  assert.ok(bidAt > laterFactAt && clicksAt > bidAt);
  assert.equal(seatAt, -1);
  assert.equal(bidLabelAt, -1);
  assert.match(
    paid,
    /class="who"[\s\S]*Stage Co[\s\S]*Opens the room[\s\S]*data-later-fact="true"[\s\S]*#1 · \$20[\s\S]*clicks/,
  );
  assert.match(html, /\.house-occupied\[data-occupied-house\] \.listing\[data-prize-first\] \.company \{[\s\S]*font-size: 2\.15rem/);
  assert.match(
    html,
    /\.house-occupied\[data-occupied-house\] \.listing\[data-prize-first\] \.rank\.later-fact\[data-later-fact\][\s\S]*font-size: 1\.2rem/,
  );
  assert.doesNotMatch(html, /\.listing\[data-prize-first\] \.seat/);
  assert.doesNotMatch(
    html,
    /\.listing\.top\[data-prize-first\] \.rank\.later-fact\[data-later-fact\][\s\S]*color: rgb\(138, 75, 18\)/,
  );
  assert.equal((html.match(/data-later-fact="true"/g) ?? []).length, 1);
  assert.equal((html.match(/class="rank later-fact"/g) ?? []).length, 1);
  assert.equal((html.match(/data-prize-first="true"/g) ?? []).length, 1);

  assert.match(later, /data-rank="2"/);
  assert.match(later, /#2 · \$8/);
  assert.match(later, /class="seat later-seat"/);
  assert.match(later, /data-later-seat="true"/);
  assert.match(later, /cue-label">Bid</);
  assert.doesNotMatch(later, /data-prize-first/);
  assert.doesNotMatch(later, /data-later-fact/);
  assert.doesNotMatch(later, /later-fact/);
  assert.doesNotMatch(last, /data-prize-first/);
  assert.doesNotMatch(last, /data-later-fact/);
  assert.match(unpaid, /Not on the board/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.doesNotMatch(unpaid, /data-later-fact/);
  assert.doesNotMatch(unpaid, /later-fact/);
  assert.doesNotMatch(unpaid, /data-prize-first/);
  assert.doesNotMatch(unpaid, /class="seat"/);
  assert.doesNotMatch(unpaid, /cue-label">Bid</);
  assert.match(html, /data-off-board-list="true"/);
  assert.doesNotMatch(rankedListMarkup(html), /Cue Only/);
  assert.match(empty, /data-empty-house="true"/);
  assert.match(empty, /class="house house-empty" data-empty-house="true"/);
  assert.doesNotMatch(empty, /data-occupied-house/);
  assert.doesNotMatch(empty, /house-occupied/);
  assert.doesNotMatch(boardMarkup(empty), /data-later-fact/);
  assert.doesNotMatch(boardMarkup(empty), /later-fact/);
  assert.doesNotMatch(boardMarkup(empty), /data-prize-first/);
  assert.doesNotMatch(empty, /Not on the board/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);
});

test("unpaid cue stays off the board and does not take a seat", async () => {
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

  const later = await createListing(app, {
    company: "Helix Labs",
    oneLiner: "Benchtop instruments for small labs",
    url: "https://helix.example/deck",
  });
  const second = await app.inject({
    method: "POST",
    url: `/listings/${later.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(second.statusCode, 200);

  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const below = listingCard(html, "Helix Labs");
  const unpaid = listingCard(html, "Cue Only");

  assert.match(unpaid, /data-unranked="true"/);
  assert.match(unpaid, /data-off-board="true"/);
  assert.match(unpaid, /class="cue off-board-cue"/);
  assert.match(unpaid, /Not on the board/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.match(unpaid, /Deck or site/);
  assert.doesNotMatch(unpaid, /class="seat"/);
  assert.doesNotMatch(unpaid, /cue-label">Bid</);
  assert.doesNotMatch(unpaid, /data-rank="/);
  assert.doesNotMatch(unpaid, /#1/);
  assert.doesNotMatch(unpaid, /#2/);
  assert.doesNotMatch(unpaid, /Open deck/);
  assert.doesNotMatch(unpaid, /Then Outbid/);
  assert.doesNotMatch(unpaid, /data-prize-first/);
  assert.doesNotMatch(unpaid, /data-later-fact/);
  assert.doesNotMatch(unpaid, /later-fact/);
  assert.doesNotMatch(unpaid, /data-later-deck/);
  assert.doesNotMatch(unpaid, /data-open-deck/);
  assert.doesNotMatch(unpaid, /data-raise-difference/);
  assert.doesNotMatch(unpaid, /data-raise-charge/);
  const whoAt = unpaid.indexOf('class="who"');
  const offAt = unpaid.indexOf("Not on the board");
  const unrankedAt = unpaid.indexOf("Unranked — no paid bid yet");
  assert.ok(whoAt > -1 && offAt > whoAt && unrankedAt > offAt);

  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /class="rank later-fact" data-later-fact="true"/);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.doesNotMatch(paid, /data-off-board/);
  assert.doesNotMatch(paid, /Not on the board/);
  assert.match(below, /data-rank="2"/);
  assert.match(below, /class="seat later-seat"/);
  assert.match(below, /data-later-seat="true"/);
  assert.match(below, /cue-label">Bid</);
  assert.doesNotMatch(below, /data-later-fact/);
  assert.doesNotMatch(below, /later-fact/);
  assert.doesNotMatch(below, /data-off-board/);
  assert.doesNotMatch(below, /Not on the board/);
  assert.equal((html.match(/data-off-board="true"/g) ?? []).length, 1);
  assert.match(html, /data-off-board-list="true"/);
  assert.match(html, /<aside class="off-board" data-off-board-list="true"/);
  assert.match(html, /<ul class="listings" aria-label="This week's opening slot" data-rolling-week="true">[\s\S]*Stage Co[\s\S]*<\/ul>[\s\S]*<ul class="listings listings-later"[\s\S]*Helix Labs[\s\S]*<\/ul>[\s\S]*<aside class="off-board"/);
  assert.doesNotMatch(rankedListMarkup(html), /Cue Only/);
  assert.doesNotMatch(rankedListMarkup(html), /Helix Labs/);
  assert.match(laterListMarkup(html), /Helix Labs/);
  assert.match(html, /data-off-board[\s\S]*\.off-board-cue/);
  assert.match(html, /\.off-board \{/);
  assert.match(html, /class="claim-note" data-occupied-raise/);
  assert.match(html, /Polar charges only the difference/);
  assert.match(html, /data-raise-difference="true"/);
  assert.doesNotMatch(boardMarkup(html), /data-empty-house/);
  assert.doesNotMatch(html, /The room is empty/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);
});

test("unpaid Polar checkout stays Not on the board — opening slot is paid only", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const polar = new PolarFixture(db, { autoSettle: false, now: () => NOW });
  const app = await buildApp({
    db,
    polar,
    now: () => NOW,
  });
  after(() => app.close());

  const listing = await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });
  const started = await polar.createCheckout({
    listingId: listing.id,
    weekId: WEEK,
    chargeUsd: 5,
    nextUsd: 5,
  });
  assert.equal(polar.getCheckout(started.checkoutId)?.status, "pending");
  assert.equal(getBid(app.db, listing.id, WEEK), undefined);

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const unpaid = listingCard(html, "Cue Only");
  assert.match(unpaid, /data-unranked="true"/);
  assert.match(unpaid, /data-off-board="true"/);
  assert.match(unpaid, /class="cue off-board-cue"/);
  assert.match(unpaid, /Not on the board/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.match(unpaid, /Deck or site/);
  assert.doesNotMatch(unpaid, /class="seat"/);
  assert.doesNotMatch(unpaid, /cue-label">Bid</);
  assert.doesNotMatch(unpaid, /data-rank="/);
  assert.doesNotMatch(unpaid, /#1/);
  assert.doesNotMatch(unpaid, /Open deck/);
  assert.doesNotMatch(unpaid, /data-prize-first/);
  assert.doesNotMatch(unpaid, /data-later-fact/);
  assert.doesNotMatch(unpaid, /data-first-click="open"/);
  assert.match(html, /data-off-board-list="true"/);
  assert.match(html, /<aside class="off-board" data-off-board-list="true"/);
  assert.doesNotMatch(boardMarkup(html), /data-occupied-house/);
  assert.doesNotMatch(boardMarkup(html), /house-occupied/);
  assert.doesNotMatch(html, /data-occupied-raise/);
  assert.doesNotMatch(html, /Polar charges only the difference/);
  assert.doesNotMatch(html, /<ul class="listings" aria-label="This week's opening slot"/);
  assert.doesNotMatch(boardMarkup(html), /data-claim-after-slot/);
  assert.doesNotMatch(rankedListMarkup(html), /Cue Only/);
  assert.doesNotMatch(laterListMarkup(html), /Cue Only/);
  assert.doesNotMatch(boardMarkup(html), /data-empty-house/);
  assert.doesNotMatch(html, /The room is empty/);
  assert.doesNotMatch(html, /first slot is still open/);
  assertNoFalsePositiveRank(html);

  await polar.applyPaid(started.checkoutId, NOW.toISOString());
  const paidBoard = (await app.inject({ method: "GET", url: "/" })).body;
  const paid = listingCard(paidBoard, "Cue Only");
  assert.match(paidBoard, /class="house house-occupied" data-occupied-house="true"/);
  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /#1 · \$5/);
  assert.match(paid, /data-prize-first="true"/);
  assert.match(paid, /class="rank later-fact" data-later-fact="true"/);
  assert.match(paid, /Open deck/);
  assert.doesNotMatch(paid, /data-off-board/);
  assert.doesNotMatch(paid, /Not on the board/);
  assert.doesNotMatch(paidBoard, /Unranked — no paid bid yet/);
  assert.doesNotMatch(rankedListMarkup(paidBoard), /Not on the board/);
  assert.match(paidBoard, /<ul class="listings" aria-label="This week's opening slot" data-rolling-week="true">/);
  const paidSlotAt = paidBoard.indexOf(
    '<ul class="listings" aria-label="This week\'s opening slot" data-rolling-week="true">',
  );
  const paidClaimAt = paidBoard.indexOf('id="claim"');
  assert.ok(paidSlotAt > -1 && paidClaimAt > paidSlotAt);
  assert.match(paidBoard, /data-claim-after-slot="true"/);
});

test("occupied #1 Open is the first founder click — later Bid seats stay quieter", async () => {
  const emptyApp = await buildApp({ databasePath: ":memory:", now: () => NOW });
  after(() => emptyApp.close());
  const empty = (await emptyApp.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(empty);
  assert.match(empty, /class="house house-empty" data-empty-house="true"/);
  assert.doesNotMatch(empty, /data-occupied-house/);
  assert.doesNotMatch(boardMarkup(empty), /data-first-click="open"/);
  assert.doesNotMatch(boardMarkup(empty), /data-later-seat/);
  assert.doesNotMatch(boardMarkup(empty), /data-later-seats/);
  assert.doesNotMatch(boardMarkup(empty), /listings-later/);
  assert.doesNotMatch(boardMarkup(empty), /data-later-open-foot/);
  assert.doesNotMatch(boardMarkup(empty), /later-open-foot/);
  assert.doesNotMatch(boardMarkup(empty), /data-claim-after-slot/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \[data-later-seat\]/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \[data-later-open-foot\]/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \.later-open-foot/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \[data-first-click="open"\]/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \[data-claim-after-slot\]/);

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
  const leadList = rankedListMarkup(html);
  const laterList = laterListMarkup(html);

  assert.match(html, /class="house house-occupied" data-occupied-house="true"/);
  assert.match(html, /<ul class="listings" aria-label="This week's opening slot" data-rolling-week="true">/);
  assert.match(
    html,
    /<ul class="listings listings-later" data-later-seats="true" aria-label="Later seats this week">/,
  );
  assert.match(leadList, /Stage Co/);
  assert.doesNotMatch(leadList, /Helix Labs/);
  assert.doesNotMatch(leadList, /Rival Pitch/);
  assert.doesNotMatch(leadList, /Cue Only/);
  assert.match(laterList, /Helix Labs/);
  assert.match(laterList, /Rival Pitch/);
  assert.doesNotMatch(laterList, /Stage Co/);
  assert.doesNotMatch(laterList, /Cue Only/);

  assert.match(paid, /data-rank="1"/);
  assert.match(paid, /data-prize-first="true"/);
  assert.match(paid, /data-open-one-first="true"/);
  assert.match(paid, /data-open-one="true"/);
  assert.match(paid, /data-first-click="open"/);
  assert.match(paid, /Open deck/);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.doesNotMatch(paid, /cue-label">Bid</);
  assert.doesNotMatch(paid, /data-later-seat/);
  const prizeAt = paid.indexOf('data-prize-first="true"');
  const whoAt = paid.indexOf('class="who"');
  const firstClickAt = paid.indexOf('data-first-click="open"');
  const openAt = paid.indexOf("Open deck");
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  assert.ok(prizeAt > -1 && whoAt > prizeAt);
  assert.ok(firstClickAt > whoAt && openAt > firstClickAt);
  assert.ok(laterFactAt > openAt && bidAt > laterFactAt);
  assert.equal((boardMarkup(html).match(/data-first-click="open"/g) ?? []).length, 1);
  assert.match(
    html,
    /\.house-occupied\[data-occupied-house\] \.listing\[data-open-one-first\] \.open-one\[data-first-click="open"\] \{[\s\S]*font-size: 1\.7rem/,
  );

  assert.match(later, /data-rank="2"/);
  assert.match(later, /data-later-deck="true"/);
  assert.match(later, /class="seat later-seat"/);
  assert.match(later, /data-later-seat="true"/);
  assert.match(later, /cue-label">Bid</);
  assert.match(later, /#2 · \$8/);
  assert.doesNotMatch(later, /data-first-click="open"/);
  assert.doesNotMatch(later, /data-prize-first/);
  assert.match(last, /data-rank="3"/);
  assert.match(last, /class="seat later-seat"/);
  assert.match(last, /data-later-seat="true"/);
  assert.doesNotMatch(last, /data-first-click="open"/);
  assert.equal((boardMarkup(html).match(/data-later-seat="true"/g) ?? []).length, 2);
  assert.match(
    html,
    /\.house-occupied\[data-occupied-house\] \.listings-later\[data-later-seats\] \.seat\.later-seat\[data-later-seat\] \.rank \{[\s\S]*font-size: 0\.88rem/,
  );
  assert.match(later, /class="later-open-foot"/);
  assert.match(later, /data-later-open-foot="true"/);
  assert.match(later, /class="open-later"/);
  assert.doesNotMatch(later, /class="open-deck/);
  assert.doesNotMatch(later, /data-open-deck/);
  assert.doesNotMatch(last, /class="open-deck/);
  assert.doesNotMatch(last, /data-open-deck/);
  assert.equal((boardMarkup(html).match(/data-open-deck="true"/g) ?? []).length, 1);
  assert.equal((boardMarkup(html).match(/data-later-open-foot="true"/g) ?? []).length, 2);
  assert.match(
    html,
    /\.house-occupied\[data-occupied-house\] \.listings-later\[data-later-seats\] \.later-open-foot\[data-later-open-foot\] \.open-later \{[\s\S]*font-size: 0\.78rem/,
  );
  assert.match(
    html,
    /\.house-occupied\[data-occupied-house\] \.listings-later\[data-later-seats\] \.later-open-foot\[data-later-open-foot\] \.open-later \{[\s\S]*background: transparent/,
  );

  assert.match(unpaid, /Not on the board/);
  assert.match(unpaid, /Unranked — no paid bid yet/);
  assert.doesNotMatch(unpaid, /data-later-seat/);
  assert.doesNotMatch(unpaid, /data-first-click="open"/);
  assert.doesNotMatch(unpaid, /class="seat"/);
  assert.match(html, /data-off-board-list="true"/);
  assert.doesNotMatch(rankedListMarkup(html), /Cue Only/);
  assert.doesNotMatch(laterListMarkup(html), /Cue Only/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /hot deal/i);
  assert.doesNotMatch(html, /claim this rank/i);
  assert.doesNotMatch(boardMarkup(html), /data-empty-house/);
  const occupiedMarkup = boardMarkup(html);
  const slotAt = occupiedMarkup.indexOf(
    '<ul class="listings" aria-label="This week\'s opening slot" data-rolling-week="true">',
  );
  const openAtPage = occupiedMarkup.indexOf('data-first-click="open"');
  const claimAfterAt = occupiedMarkup.indexOf('data-claim-after-slot="true"');
  const claimAt = occupiedMarkup.indexOf('id="claim"');
  const outbidAt = occupiedMarkup.indexOf('class="outbid">Outbid</button>');
  assert.ok(slotAt > -1 && openAtPage > slotAt);
  assert.ok(claimAfterAt > openAtPage && claimAt > claimAfterAt);
  assert.ok(outbidAt > claimAt);
  assert.match(html, /class="claim-after-slot" data-claim-after-slot="true"/);
  assert.match(
    html,
    /\.house-occupied\[data-occupied-house\] \.claim-after-slot\[data-claim-after-slot\] \.headline \{[\s\S]*font-size: clamp\(1\.35rem, 4\.2vw, 1\.85rem\)/,
  );
});

test("occupied later Bid seats stay quieter than #1 Open — later Open is a foot hop, not a filled deck", async () => {
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
  const leadList = rankedListMarkup(html);
  const laterList = laterListMarkup(html);

  assert.match(paid, /data-prize-first="true"/);
  assert.match(paid, /data-first-click="open"/);
  assert.match(paid, /class="open-deck open-one/);
  assert.match(paid, /data-open-deck="true"/);
  assert.doesNotMatch(paid, /later-open-foot/);
  assert.doesNotMatch(paid, /data-later-open-foot/);
  assert.doesNotMatch(paid, /class="open-later"/);

  assert.match(later, /data-later-deck="true"/);
  assert.match(later, /class="later-open-foot"/);
  assert.match(later, /data-later-open-foot="true"/);
  assert.match(later, /class="open-later"/);
  assert.match(later, /data-open-later="true"/);
  assert.match(later, /Open deck/);
  assert.doesNotMatch(later, /class="open-deck/);
  assert.doesNotMatch(later, /data-open-deck/);
  assert.doesNotMatch(later, /data-first-click="open"/);
  const laterWho = later.indexOf('class="who"');
  const laterSeat = later.indexOf('class="seat later-seat"');
  const laterBid = later.indexOf("#2 · $8");
  const laterFoot = later.indexOf('data-later-open-foot="true"');
  const laterHop = later.indexOf('data-open-later="true"');
  assert.ok(laterWho > -1 && laterSeat > laterWho && laterBid > laterSeat);
  assert.ok(laterFoot > laterBid && laterHop > laterFoot);

  assert.match(last, /data-later-open-foot="true"/);
  assert.match(last, /class="open-later"/);
  assert.doesNotMatch(last, /class="open-deck/);
  assert.doesNotMatch(last, /data-open-deck/);

  assert.match(leadList, /data-open-deck="true"/);
  assert.doesNotMatch(laterList, /data-open-deck/);
  assert.doesNotMatch(laterList, /class="open-deck/);
  assert.equal((boardMarkup(html).match(/data-open-deck="true"/g) ?? []).length, 1);
  assert.equal((boardMarkup(html).match(/class="open-deck /g) ?? []).length, 1);
  assert.equal((boardMarkup(html).match(/data-later-open-foot="true"/g) ?? []).length, 2);
  assert.match(
    html,
    /\.house-occupied\[data-occupied-house\] \.listings-later\[data-later-seats\] \.later-open-foot\[data-later-open-foot\] \.open-later \{[\s\S]*background: transparent/,
  );
  assert.match(unpaid, /Not on the board/);
  assert.doesNotMatch(unpaid, /later-open-foot/);
  assert.doesNotMatch(unpaid, /Open deck/);
  const markup = boardMarkup(html);
  const slotAt = markup.indexOf(
    '<ul class="listings" aria-label="This week\'s opening slot" data-rolling-week="true">',
  );
  const openAt = markup.indexOf('data-first-click="open"');
  const laterAt = markup.indexOf('data-later-seats="true"');
  const laterFootAt = markup.indexOf('data-later-open-foot="true"');
  const claimAt = markup.indexOf('id="claim"');
  assert.ok(slotAt > -1 && openAt > slotAt);
  assert.ok(laterAt > openAt && laterFootAt > laterAt && claimAt > laterFootAt);

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

test("occupied week window is rolling last-7-days — not Monday 00:00 UTC", async () => {
  let now = new Date("2026-08-16T12:00:00.000Z");
  const app = await buildApp({ databasePath: ":memory:", now: () => now });
  after(() => app.close());

  const empty = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(empty);
  assert.match(empty, /class="house house-empty" data-empty-house="true"/);
  assert.match(empty, /data-rolling-week="true"/);
  assert.match(empty, /Rolling last 7 days\. Not Monday 00:00 UTC\./);
  assert.doesNotMatch(boardMarkup(empty), /data-first-click="open"/);
  assert.doesNotMatch(boardMarkup(empty), /listings-later/);
  assert.doesNotMatch(boardMarkup(empty), /Not on the board/);

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
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  now = new Date("2026-08-17T00:00:00.000Z");
  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const later = listingCard(html, "Helix Labs");
  const unpaid = listingCard(html, "Cue Only");

  assert.match(html, /class="house house-occupied" data-occupied-house="true"/);
  assert.match(html, /data-rolling-week="true"/);
  assert.match(html, /Rolling last 7 days\. Not Monday 00:00 UTC\./);
  assert.match(
    html,
    /<ul class="listings" aria-label="This week's opening slot" data-rolling-week="true">/,
  );
  assert.match(html, /#1 · \$20/);
  assert.match(html, /#2 · \$8/);
  assert.doesNotMatch(html, /Unranked — no paid bid yet[\s\S]*Stage Co/);
  assert.match(paid, /data-prize-first="true"/);
  const whoAt = paid.indexOf('class="who"');
  const companyAt = paid.indexOf("Stage Co");
  const laterFactAt = paid.indexOf('data-later-fact="true"');
  const bidAt = paid.indexOf("#1 · $20");
  const firstClickAt = paid.indexOf('data-first-click="open"');
  assert.ok(whoAt > -1 && companyAt > whoAt);
  assert.ok(firstClickAt > companyAt);
  assert.ok(laterFactAt > firstClickAt && bidAt > laterFactAt);
  assert.doesNotMatch(paid, /class="seat"/);
  assert.match(later, /data-later-seat="true"/);
  assert.match(later, /cue-label">Bid</);
  assert.doesNotMatch(later, /data-first-click="open"/);
  assert.match(unpaid, /Not on the board/);
  assert.doesNotMatch(unpaid, /class="seat"/);
  assert.doesNotMatch(boardMarkup(html), /data-empty-house/);
  assert.doesNotMatch(html, /24h lock/i);
  const rollingMarkup = boardMarkup(html);
  const rollingSlotAt = rollingMarkup.indexOf(
    '<ul class="listings" aria-label="This week\'s opening slot" data-rolling-week="true">',
  );
  const rollingClaimAt = rollingMarkup.indexOf('id="claim"');
  assert.ok(rollingSlotAt > -1 && rollingClaimAt > rollingSlotAt);
  assert.match(html, /data-claim-after-slot="true"/);
});

test("occupied house keeps one first click — Open #1, Claim stays after the slot", async () => {
  const emptyApp = await buildApp({ databasePath: ":memory:", now: () => NOW });
  after(() => emptyApp.close());
  const empty = (await emptyApp.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(empty);
  assert.match(empty, /class="house house-empty" data-empty-house="true"/);
  assert.match(empty, /id="claim"/);
  assert.match(empty, /<h1 class="headline">Opening three minutes<\/h1>/);
  assert.match(empty, /class="outbid">Outbid<\/button>/);
  assert.match(empty, /\.house-empty\[data-empty-house\] \[data-claim-after-slot\]/);
  assert.doesNotMatch(empty, /data-occupied-house/);
  assert.doesNotMatch(boardMarkup(empty), /data-claim-after-slot/);
  assert.doesNotMatch(boardMarkup(empty), /data-first-click="open"/);
  assert.doesNotMatch(boardMarkup(empty), /class="listing"/);
  const emptyMarkup = boardMarkup(empty);
  const emptyClaim = emptyMarkup.indexOf('id="claim"');
  const emptyHop = emptyMarkup.indexOf(
    '<a class="outbid" data-first-click="claim" href="#write">',
  );
  const emptyWrite = emptyMarkup.indexOf('data-later-write="true"');
  const emptyCompany = emptyMarkup.indexOf('name="company"');
  const emptyOutbid = emptyMarkup.indexOf('class="outbid">Outbid</button>');
  assert.ok(emptyClaim > -1 && emptyHop > emptyClaim);
  assert.ok(emptyWrite > emptyHop && emptyCompany > emptyWrite);
  assert.ok(emptyOutbid > emptyCompany);
  assert.doesNotMatch(emptyMarkup, /class="bid-row"/);

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
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const later = listingCard(html, "Helix Labs");
  const unpaid = listingCard(html, "Cue Only");
  const markup = boardMarkup(html);
  const slotAt = markup.indexOf(
    '<ul class="listings" aria-label="This week\'s opening slot" data-rolling-week="true">',
  );
  const openAt = markup.indexOf('data-first-click="open"');
  const laterAt = markup.indexOf('data-later-seats="true"');
  const offAt = markup.indexOf('data-off-board-list="true"');
  const claimWrapAt = markup.indexOf('data-claim-after-slot="true"');
  const claimAt = markup.indexOf('id="claim"');
  const headlineAt = markup.indexOf(
    '<h1 class="headline">Opening three minutes</h1>',
  );
  const outbidAt = markup.indexOf('class="outbid">Outbid</button>');
  assert.ok(slotAt > -1 && openAt > slotAt);
  assert.ok(laterAt > openAt && offAt > laterAt);
  assert.ok(claimWrapAt > offAt && claimAt > claimWrapAt);
  assert.ok(headlineAt > claimAt && outbidAt > headlineAt);
  assert.match(html, /class="house house-occupied" data-occupied-house="true"/);
  assert.match(html, /class="claim-after-slot" data-claim-after-slot="true"/);
  assert.match(
    html,
    /\.house-occupied\[data-occupied-house\] \.claim-after-slot\[data-claim-after-slot\] \.headline \{[\s\S]*font-size: clamp\(1\.35rem, 4\.2vw, 1\.85rem\)/,
  );
  assert.match(paid, /data-prize-first="true"/);
  assert.match(paid, /data-first-click="open"/);
  assert.match(paid, /Open deck/);
  assert.doesNotMatch(paid, /id="claim"/);
  assert.doesNotMatch(paid, /class="outbid"/);
  assert.doesNotMatch(rankedListMarkup(html), /id="claim"/);
  assert.doesNotMatch(laterListMarkup(html), /id="claim"/);
  assert.match(later, /data-later-seat="true"/);
  assert.doesNotMatch(later, /data-first-click="open"/);
  assert.match(unpaid, /Not on the board/);
  assert.doesNotMatch(unpaid, /data-claim-after-slot/);
  assert.match(html, /data-rolling-week="true"/);
  assert.match(html, /Rolling last 7 days\. Not Monday 00:00 UTC\./);
  assert.doesNotMatch(html, /The room is empty/);
  assert.doesNotMatch(boardMarkup(html), /data-empty-house/);
  assert.doesNotMatch(boardMarkup(html), /data-first-click="claim"/);
  assert.doesNotMatch(boardMarkup(html), /data-later-write/);
  assert.match(boardMarkup(html), /class="bid-row"/);
  assert.doesNotMatch(html, /typical raise/i);
  assert.doesNotMatch(html, /claim this rank/i);
});

test("empty house keeps one first click — Claim / Outbid, then the deck URL", async () => {
  const emptyApp = await buildApp({ databasePath: ":memory:", now: () => NOW });
  after(() => emptyApp.close());
  const empty = (await emptyApp.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(empty);
  assertNoFalsePositiveRank(empty);
  assert.match(empty, /class="house house-empty" data-empty-house="true"/);
  assert.match(empty, /class="claim-note" data-empty-room/);
  assert.match(empty, /The room is empty\./);
  assert.match(empty, /value="5"/);
  assert.match(empty, /data-bid-step="-1"/);
  assert.match(empty, /data-bid-step="1"/);
  assert.match(empty, /class="bid-field"/);
  assert.match(empty, /<a class="outbid" data-first-click="claim" href="#write">Outbid<\/a>/);
  assert.match(empty, /class="bid-form later-write" data-later-write="true"/);
  assert.match(empty, /id="write"/);
  assert.match(empty, /Outbid first\. Company, deck URL, and a one-liner after that hop\./);
  assert.match(empty, /class="outbid">Outbid<\/button>/);
  assert.doesNotMatch(boardMarkup(empty), /class="bid-row"/);
  assert.doesNotMatch(boardMarkup(empty), /data-claim-after-slot/);
  assert.doesNotMatch(boardMarkup(empty), /data-first-click="open"/);
  assert.doesNotMatch(empty, /data-occupied-house/);
  const emptyBoard = boardMarkup(empty);
  const claimAt = emptyBoard.indexOf('id="claim"');
  const headlineAt = emptyBoard.indexOf(
    '<h1 class="headline">Opening three minutes</h1>',
  );
  const bidAt = emptyBoard.indexOf('class="bid-field"');
  const hopAt = emptyBoard.indexOf(
    '<a class="outbid" data-first-click="claim" href="#write">',
  );
  const writeAt = emptyBoard.indexOf('data-later-write="true"');
  const writeIdAt = emptyBoard.indexOf('id="write"');
  const companyAt = emptyBoard.indexOf('name="company"');
  const urlAt = emptyBoard.indexOf('name="url"');
  const oneLinerAt = emptyBoard.indexOf('name="oneLiner"');
  const submitAt = emptyBoard.indexOf('class="outbid">Outbid</button>');
  assert.ok(claimAt > -1 && headlineAt > claimAt && bidAt > headlineAt);
  assert.ok(hopAt > bidAt && writeAt > hopAt && writeIdAt > writeAt);
  assert.ok(companyAt > writeIdAt && urlAt > companyAt && oneLinerAt > urlAt);
  assert.ok(submitAt > oneLinerAt);
  assert.match(
    empty,
    /\.house-empty\[data-empty-house\] a\.outbid\[data-first-click="claim"\] \{[\s\S]*display: flex/,
  );
  assert.match(
    empty,
    /\.house-empty\[data-empty-house\] \.later-write\[data-later-write\] \{[\s\S]*margin-top: 1\.6rem[\s\S]*border-top: 1px dashed/,
  );
  assert.match(
    empty,
    /\.house-empty\[data-empty-house\] \.later-write\[data-later-write\] \.outbid \{[\s\S]*height: 2\.4rem/,
  );
  assert.match(empty, /data-rolling-week="true"/);
  assert.match(empty, /Rolling last 7 days\. Not Monday 00:00 UTC\./);

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
  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Polar",
    url: "https://cue.example/deck",
  });

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(html);
  const paid = listingCard(html, "Stage Co");
  const later = listingCard(html, "Helix Labs");
  const unpaid = listingCard(html, "Cue Only");
  const markup = boardMarkup(html);
  assert.match(html, /class="house house-occupied" data-occupied-house="true"/);
  assert.doesNotMatch(markup, /data-empty-house/);
  assert.doesNotMatch(markup, /data-first-click="claim"/);
  assert.doesNotMatch(markup, /data-later-write/);
  assert.doesNotMatch(markup, /href="#write"/);
  assert.match(markup, /class="bid-row"/);
  const slotAt = markup.indexOf(
    '<ul class="listings" aria-label="This week\'s opening slot" data-rolling-week="true">',
  );
  const openAt = markup.indexOf('data-first-click="open"');
  const laterAt = markup.indexOf('data-later-seats="true"');
  const offAt = markup.indexOf('data-off-board-list="true"');
  const claimWrapAt = markup.indexOf('data-claim-after-slot="true"');
  const occupiedClaimAt = markup.indexOf('id="claim"');
  const occupiedOutbidAt = markup.indexOf('class="outbid">Outbid</button>');
  const occupiedCompanyAt = markup.indexOf('name="company"');
  assert.ok(slotAt > -1 && openAt > slotAt);
  assert.ok(laterAt > openAt && offAt > laterAt);
  assert.ok(claimWrapAt > offAt && occupiedClaimAt > claimWrapAt);
  assert.ok(occupiedCompanyAt > occupiedClaimAt && occupiedOutbidAt > occupiedCompanyAt);
  assert.match(paid, /data-prize-first="true"/);
  assert.match(paid, /data-first-click="open"/);
  const whoAt = paid.indexOf("Stage Co");
  const moneyAt = paid.indexOf("#1 · $20");
  assert.ok(whoAt > -1 && moneyAt > whoAt);
  assert.match(later, /data-later-seat="true"/);
  assert.doesNotMatch(later, /data-first-click="open"/);
  assert.match(unpaid, /Not on the board/);
  assert.doesNotMatch(unpaid, /class="seat"/);
  assert.match(html, /data-rolling-week="true"/);
  assert.match(html, /Rolling last 7 days\. Not Monday 00:00 UTC\./);
});

test("occupied checkout copy names Polar raise-pays-difference — unpaid stays off", async () => {
  const emptyApp = await buildApp({ databasePath: ":memory:", now: () => NOW });
  after(() => emptyApp.close());
  const empty = (await emptyApp.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(empty);
  assert.match(empty, /<a class="outbid" data-first-click="claim" href="#write">Outbid<\/a>/);
  assert.match(empty, /class="bid-form later-write" data-later-write="true"/);
  assert.doesNotMatch(boardMarkup(empty), /class="bid-row"/);
  assert.doesNotMatch(empty, /data-occupied-raise/);
  assert.doesNotMatch(empty, /Sunday pay raised Monday/);
  assert.doesNotMatch(empty, /stays off the house/);
  assert.doesNotMatch(empty, /data-return=/);
  assert.doesNotMatch(empty, /Polar charged the difference/);

  let now = new Date("2026-08-16T12:00:00.000Z");
  const db = openDatabase(":memory:");
  after(() => db.close());
  const polar = new PolarFixture(db, { now: () => now });
  const app = await buildApp({ db, polar, now: () => now });
  after(() => app.close());

  const listing = await createListing(app, {
    company: "Sunday Pitch",
    oneLiner: "Paid before Monday midnight",
    url: "https://sunday-pitch.example/deck",
  });
  const first = await app.inject({
    method: "POST",
    url: `/listings/${listing.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(first.statusCode, 200);
  const firstBody = first.json() as { checkoutId: string; chargeUsd: number };
  assert.equal(firstBody.chargeUsd, 5);

  const firstReturn = await app.inject({
    method: "GET",
    url: `/checkout/complete?checkoutId=${encodeURIComponent(firstBody.checkoutId)}`,
  });
  assert.equal(firstReturn.statusCode, 200);
  assert.match(firstReturn.body, /data-return="paid"/);
  assert.match(firstReturn.body, /Sunday Pitch is on the house at \$5/);
  assert.match(firstReturn.body, /Unpaid Polar checkout would have stayed off the house/);
  assert.doesNotMatch(firstReturn.body, /data-raise-difference/);
  assert.doesNotMatch(boardMarkup(firstReturn.body), /data-occupied-house/);
  assert.doesNotMatch(boardMarkup(firstReturn.body), /data-empty-house/);
  assert.doesNotMatch(boardMarkup(firstReturn.body), /data-first-click="claim"/);

  now = new Date("2026-08-17T00:00:00.000Z");
  const raised = await app.inject({
    method: "POST",
    url: `/listings/${listing.id}/bids`,
    payload: { amountUsd: 12 },
  });
  assert.equal(raised.statusCode, 200);
  const raiseBody = raised.json() as {
    checkoutId: string;
    chargeUsd: number;
    amountUsd: number;
  };
  assert.equal(raiseBody.chargeUsd, 7);
  assert.equal(raiseBody.amountUsd, 12);

  const occupied = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(occupied);
  assert.match(occupied, /class="claim-note" data-occupied-raise/);
  assert.match(occupied, /data-raise-difference="true"/);
  assert.match(
    occupied,
    /Polar charges \$<span data-raise-charge-usd>1<\/span> — only the difference/,
  );
  assert.doesNotMatch(occupied, /Sunday pay raised Monday/);
  assert.doesNotMatch(occupied, /New deck: Polar/);
  assert.match(occupied, /Unpaid Polar checkout stays off the house/);
  assert.doesNotMatch(occupied, /until Polar reports paid/);
  assert.match(occupied, /class="bid-row"/);
  assert.doesNotMatch(boardMarkup(occupied), /data-first-click="claim"/);
  assert.doesNotMatch(boardMarkup(occupied), /data-later-write/);
  assert.doesNotMatch(occupied, /data-return=/);

  const raiseReturn = await app.inject({
    method: "GET",
    url: `/checkout/complete?checkoutId=${encodeURIComponent(raiseBody.checkoutId)}`,
  });
  assert.equal(raiseReturn.statusCode, 200);
  assert.match(raiseReturn.body, /data-return="paid"/);
  assert.match(raiseReturn.body, /data-raise-difference="true"/);
  assert.match(raiseReturn.body, /Polar charged the difference/);
  assert.match(
    raiseReturn.body,
    /Polar charged \$7 to raise to \$12 — only the difference, not a new bid/,
  );
  assert.match(raiseReturn.body, /Sunday pay raised Monday still pays the difference/);
  assert.match(raiseReturn.body, /Sunday Pitch is on the house at \$12/);
  assert.doesNotMatch(boardMarkup(raiseReturn.body), /data-occupied-house/);
  assert.doesNotMatch(boardMarkup(raiseReturn.body), /class="bid-row"/);
  assert.doesNotMatch(boardMarkup(raiseReturn.body), /data-empty-claim-first/);
});

test("occupied checkout unpaid Polar return stays off the house", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const polar = new PolarFixture(db, { autoSettle: false, now: () => NOW });
  const app = await buildApp({ db, polar, now: () => NOW });
  after(() => app.close());

  const listing = await createListing(app, {
    company: "Ghost Pitch",
    oneLiner: "Abandoned Polar checkout",
    url: "https://ghost-pitch.example/deck",
  });
  const started = await polar.createCheckout({
    listingId: listing.id,
    weekId: WEEK,
    chargeUsd: 5,
    nextUsd: 5,
  });
  assert.equal(polar.getCheckout(started.checkoutId)?.status, "pending");

  const pending = await app.inject({
    method: "GET",
    url: `/checkout/complete?checkoutId=${encodeURIComponent(started.checkoutId)}`,
  });
  assert.equal(pending.statusCode, 200);
  assert.match(pending.body, /data-return="pending"/);
  assert.match(pending.body, /Unpaid Polar checkout stays off the house until Polar reports paid/);
  assert.doesNotMatch(pending.body, /data-return="paid"/);
  assert.doesNotMatch(pending.body, /Ghost Pitch is on the house/);

  const house = (await app.inject({ method: "GET", url: "/" })).body;
  const unpaid = listingCard(house, "Ghost Pitch");
  assert.match(unpaid, /Not on the board/);
  assert.doesNotMatch(house, /data-occupied-raise/);
  assert.doesNotMatch(house, /Sunday pay raised Monday/);
  assert.equal(getBid(app.db, listing.id, WEEK), undefined);

  const cancel = await app.inject({
    method: "GET",
    url: `/checkout/complete?checkoutId=${encodeURIComponent(started.checkoutId)}&status=cancel`,
  });
  assert.equal(cancel.statusCode, 200);
  assert.match(cancel.body, /data-return="cancel"/);
  assert.match(cancel.body, /Unpaid Polar checkout stays off the house/);
  assert.match(cancel.body, /An abandoned Outbid is not the opening slot/);
  assert.doesNotMatch(cancel.body, /data-return="paid"/);
  assert.doesNotMatch(cancel.body, /data-raise-difference/);

  const unknown = await app.inject({
    method: "GET",
    url: "/checkout/complete",
  });
  assert.equal(unknown.statusCode, 200);
  assert.match(unknown.body, /data-return="pending"/);
  assert.match(unknown.body, /Unpaid Polar checkout stays off the house until Polar reports paid/);
  assert.match(unknown.body, /This page does not trust the query string alone/);
});

test("occupied /rules raise identity is last-7-days, not the UTC week label", async () => {
  const app = await buildApp({ databasePath: ":memory:", now: () => NOW });
  after(() => app.close());

  const rules = await app.inject({ method: "GET", url: "/rules" });
  assert.equal(rules.statusCode, 200);
  assert.match(rules.body, /Same listing still inside last 7 days/);
  assert.match(rules.body, /weekId<\/code> stays an audit label — not raise identity/);
  assert.doesNotMatch(rules.body, /Same listing, same week/);
  assert.doesNotMatch(rules.body, /same weekId/i);
  assert.match(rules.body, /Raise = difference/);
  assert.match(rules.body, /rolling last 7 days/i);
  assert.match(rules.body, /Monday 00:00 UTC/);

  const empty = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchNightChrome(empty);
  assert.match(empty, /<a class="outbid" data-first-click="claim" href="#write">Outbid<\/a>/);
  assert.match(empty, /class="bid-form later-write" data-later-write="true"/);
  assert.doesNotMatch(boardMarkup(empty), /class="bid-row"/);
  assert.doesNotMatch(empty, /data-occupied-raise/);
});
