import type { FastifyPluginAsync } from "fastify";
import type { PolarCheckoutRecord, PolarPort } from "../billing/polar.js";
import { clickCountsByListing } from "../core/clicks.js";
import { getListingById, listListings, type Listing } from "../core/listing.js";
import { MIN_BID_USD, rankedBoard, type RankedListing } from "../core/rank.js";
import type { AppDb } from "../db.js";
import { BOARD_CSS, HOUSE_CSS } from "../views/skin.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function navLink(href: string, label: string, current: string): string {
  const active = href === current ? ' aria-current="page"' : "";
  return `<a href="${href}"${active}>${escapeHtml(label)}</a>`;
}

function renderLayout(input: {
  title: string;
  path: string;
  body: string;
  emptyHouse?: boolean;
  occupiedHouse?: boolean;
}): string {
  const css = input.emptyHouse === true ? HOUSE_CSS : BOARD_CSS;
  const houseAttr =
    input.emptyHouse === true
      ? ' data-empty-house="true"'
      : input.occupiedHouse === true
        ? ' data-occupied-house="true"'
        : "";
  const inner =
    input.emptyHouse === true
      ? `<div class="house house-empty" data-empty-house="true">
    ${input.body}
  </div>`
      : input.occupiedHouse === true
        ? `<div class="house house-occupied" data-occupied-house="true">
    ${input.body}
  </div>`
        : input.body;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet"/>
  <style>${css}</style>
</head>
<body${houseAttr}>
  <header class="site-header">
    <a class="brand" href="/">first.<em>slot</em></a>
    <nav aria-label="Main">
      ${navLink("/", "Board", input.path)}
      ${navLink("/about", "About", input.path)}
      ${navLink("/rules", "Rules", input.path)}
    </nav>
  </header>
  <main class="page">
    ${inner}
  </main>
</body>
</html>
`;
}

function clickHref(listingId: string): string {
  return `/listings/${encodeURIComponent(listingId)}/clicks`;
}

function raiseAfterDeckHop(raiseOne: boolean): string {
  if (raiseOne) {
    return `<a class="raise-after-deck raise-one raise-after-open-two raise-after-open-three raise-after-open-four raise-after-open-five raise-after-open-six" data-raise-after-deck="true" data-raise-one="true" data-raise-after-open-two="true" data-raise-after-open-three="true" data-raise-after-open-four="true" data-raise-after-open-five="true" data-raise-after-open-six="true" href="#claim">
          Then Outbid
          <span class="raise-after-note">Polar charges only the difference</span>
        </a>`;
  }
  return `<a class="raise-after-deck" data-raise-after-deck="true" href="#claim">
          Then Outbid
          <span class="raise-after-note">Polar charges only the difference</span>
        </a>`;
}

function openAfterRaiseHop(listing: Listing): string {
  const href = clickHref(listing.id);
  return `<a class="open-after-raise" data-open-after-raise="true" href="${href}" rel="noopener noreferrer">
          Open deck
          <span class="open-after-note">after Then Outbid</span>
        </a>`;
}

function raiseAfterOpenHop(): string {
  return `<a class="raise-after-open" data-raise-after-open="true" href="#claim">
          Then Outbid
          <span class="raise-after-open-note">after Open deck</span>
        </a>`;
}

/** Occupied #1 money after the pitch title. Not a Bid .seat. */
function prizeLaterFact(rankHtml: string, clicks: number): string {
  return `<p class="rank later-fact" data-later-fact="true">${rankHtml}</p>
      <p class="clicks">${clicks} clicks</p>`;
}

function bidSeat(rankHtml: string, clicks: number): string {
  return `<div class="seat">
      <span class="cue-label">Bid</span>
      <p class="rank">${rankHtml}</p>
      <p class="clicks">${clicks} clicks</p>
    </div>`;
}

/** Later Bid .seat after occupied #1 Open. Same Bid DNA, quieter than the prize hop. */
function laterBidSeat(rankHtml: string, clicks: number): string {
  return bidSeat(rankHtml, clicks).replace(
    'class="seat"',
    'class="seat later-seat" data-later-seat="true"',
  );
}

/** Later-rank Open as a foot hop. Not the filled #1 hop. */
function laterOpenFoot(listing: Listing): string {
  const url = escapeHtml(listing.url);
  const href = clickHref(listing.id);
  return `<footer class="later-open-foot" data-later-open-foot="true">
        <a class="open-later" data-open-later="true" href="${href}" rel="noopener noreferrer">
          Open deck
          <span class="deck-url">${url}</span>
        </a>
      </footer>`;
}

function deckHop(
  listing: Listing,
  paid: boolean,
  raiseAfter: boolean,
  later: boolean,
  openOne: boolean,
): string {
  const url = escapeHtml(listing.url);
  const href = clickHref(listing.id);
  if (paid && later) {
    return laterOpenFoot(listing);
  }
  if (paid && openOne) {
    const next = raiseAfter
      ? `\n        ${raiseAfterDeckHop(true)}\n        ${openAfterRaiseHop(listing)}\n        ${raiseAfterOpenHop()}`
      : "";
    return `<p class="deck">
        <a class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five" data-open-deck="true" data-open-one="true" data-open-after-raise-one="true" data-open-after-raise-two="true" data-open-after-raise-three="true" data-open-after-raise-four="true" data-open-after-raise-five="true" data-first-click="open" href="${href}" rel="noopener noreferrer">
          Open deck
          <span class="deck-url">${url}</span>
        </a>${next}
      </p>`;
  }
  if (paid) {
    const next = raiseAfter
      ? `\n        ${raiseAfterDeckHop(false)}\n        ${openAfterRaiseHop(listing)}\n        ${raiseAfterOpenHop()}`
      : "";
    return `<p class="deck">
        <a class="open-deck" data-open-deck="true" href="${href}" rel="noopener noreferrer">
          Open deck
          <span class="deck-url">${url}</span>
        </a>${next}
      </p>`;
  }
  return `<p class="deck">
        <span class="cue-label">Deck or site</span>
        <a class="listing-url" href="${href}" rel="noopener noreferrer">${url}</a>
      </p>`;
}

function renderCueCard(input: {
  listing: Listing;
  clicks: number;
  rankHtml: string;
  attrs: string;
  extraClass?: string;
  paid: boolean;
  raiseAfter?: boolean;
  later?: boolean;
  openOne?: boolean;
  prizeFirst?: boolean;
}): string {
  const company = escapeHtml(input.listing.company);
  const oneLiner = escapeHtml(input.listing.oneLiner);
  const later = input.later === true;
  const openOne = input.openOne === true;
  const prizeFirst = input.prizeFirst === true;
  const klass = input.extraClass ? `listing ${input.extraClass}` : "listing";
  const hop = deckHop(
    input.listing,
    input.paid,
    input.raiseAfter === true,
    later,
    openOne,
  );
  const attrs = later
    ? `${input.attrs} data-later-deck="true"`
    : openOne
      ? `${input.attrs} data-open-one-first="true" data-raise-one-first="true" data-open-after-raise-one-first="true" data-raise-after-open-two-first="true" data-open-after-raise-two-first="true" data-raise-after-open-three-first="true" data-open-after-raise-three-first="true" data-raise-after-open-four-first="true" data-open-after-raise-four-first="true" data-raise-after-open-five-first="true" data-open-after-raise-five-first="true" data-raise-after-open-six-first="true" data-prize-first="true"`
      : prizeFirst
        ? `${input.attrs} data-prize-first="true"`
        : input.attrs;
  const prizeTitle = `<div class="who">
      <p class="company">${company}</p>
      <p class="one-liner">${oneLiner}</p>
    </div>`;
  const laterMoney = prizeLaterFact(input.rankHtml, input.clicks);
  const body = later
    ? `<div class="cue later-cue">
    ${prizeTitle}
    ${laterBidSeat(input.rankHtml, input.clicks)}
    ${hop}
  </div>`
    : prizeFirst && openOne
      ? `<div class="cue open-one-cue">
    ${prizeTitle}
    ${hop}
    ${laterMoney}
  </div>`
      : prizeFirst
        ? `<div class="cue">
    ${prizeTitle}
    ${laterMoney}
  </div>
  ${hop}`
        : `<div class="cue off-board-cue">
    <div class="who">
      <p class="company">${company}</p>
      <p class="one-liner">${oneLiner}</p>
      ${hop}
      <span class="cue-label">Not on the board</span>
      <p class="rank">${input.rankHtml}</p>
      <p class="clicks">${input.clicks} clicks</p>
    </div>
  </div>`;
  return `<li class="${klass}"${attrs} data-clicks="${input.clicks}">
  ${body}
</li>`;
}

function renderUnranked(listing: Listing, clicks: number): string {
  return renderCueCard({
    listing,
    clicks,
    rankHtml: "Unranked — no paid bid yet",
    attrs: ' data-unranked="true" data-off-board="true"',
    paid: false,
  });
}

function renderRanked(
  listing: RankedListing,
  clicks: number,
  laterDecksExist: boolean,
): string {
  return renderCueCard({
    listing,
    clicks,
    rankHtml: `#${listing.rank} · $${listing.bid.amountUsd}`,
    attrs: ` data-rank="${listing.rank}" data-bid="${listing.bid.amountUsd}"`,
    extraClass: listing.rank === 1 ? "top" : undefined,
    paid: true,
    raiseAfter: listing.rank === 1,
    later: listing.rank > 1,
    openOne: listing.rank === 1 && laterDecksExist,
    prizeFirst: listing.rank === 1,
  });
}

function claimChrome(
  defaultBidUsd: number,
  emptyRoom: boolean,
  topUsd?: number,
): string {
  let note: string;
  let hint: string;
  if (emptyRoom) {
    note = `<p class="claim-note" data-empty-room>
  <span class="room">The room is empty.</span>
  This week's first slot is still open. Outbid takes it after Polar lands.
  <span class="week-window" data-rolling-week="true">Rolling last 7 days. Not Monday 00:00 UTC.</span>
</p>`;
    hint =
      "Outbid first. Company, deck URL, and a one-liner after that hop. Unpaid checkout does not rank.";
  } else if (topUsd !== undefined) {
    const raiseChargeUsd = Math.max(0, defaultBidUsd - topUsd);
    note = `<p class="claim-note" data-occupied-raise data-raise-difference="true">
  <span class="room">#1 is $${topUsd}.</span>
  <span class="week-window" data-rolling-week="true" data-quiet-window="true">Rolling last 7 days. Not Monday 00:00 UTC.</span>
  <span class="raise-charge" data-raise-charge="true" data-quiet-charge="true" data-current-usd="${topUsd}">Polar charges $<span data-raise-charge-usd>${raiseChargeUsd}</span> — only the difference.</span>
</p>`;
    hint = "Unpaid Polar checkout stays off the house.";
  } else {
    note = `<p class="claim-note">This week's first three minutes are for sale. The rest of the room is not. Rank is the bid after Polar lands.
  <span class="week-window" data-rolling-week="true">Rolling last 7 days. Not Monday 00:00 UTC.</span>
</p>`;
    hint =
      "Company, deck URL, and a one-liner. Unpaid checkout does not rank.";
  }
  const raiseScript =
    topUsd === undefined
      ? `    document.querySelectorAll("[data-bid-step]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        input.value = String(parseBid(input.value) + Number(btn.getAttribute("data-bid-step")));
      });
    });`
      : `    var current = ${topUsd};
    var chargeUsd = document.querySelector("[data-raise-charge-usd]");
    function syncCharge() {
      if (!chargeUsd) return;
      var next = parseBid(input.value);
      chargeUsd.textContent = String(next > current ? next - current : 0);
    }
    document.querySelectorAll("[data-bid-step]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        input.value = String(parseBid(input.value) + Number(btn.getAttribute("data-bid-step")));
        syncCharge();
      });
    });
    input.addEventListener("input", syncCharge);`;
  return `<section id="claim">
  <div class="stage-head">
    <h1 class="headline">Opening three minutes</h1>
  </div>
  <div class="claim">
    <button type="button" class="step" data-bid-step="-1" aria-label="Decrease bid by one">−</button>
    <label class="bid-field">
      <span class="sr-only">Amount in dollars</span>
      <span class="currency">$</span><input id="bid" name="amountUsd" form="bid-form" inputmode="numeric" pattern="[0-9]*" value="${defaultBidUsd}"/>
    </label>
    <button type="button" class="step" data-bid-step="1" aria-label="Increase bid by one">+</button>
  </div>
  ${note}
  ${
    emptyRoom === true
      ? `<a class="outbid" data-first-click="claim" href="#write">Outbid</a>
  <form id="bid-form" class="bid-form later-write" data-later-write="true" method="post" action="/listings">
    <div id="write">
      <div class="field"><input name="company" required maxlength="80" placeholder="Company"/></div>
      <div class="field"><input name="url" type="url" required placeholder="https://deck-or-site"/></div>
      <div class="field"><input name="oneLiner" required maxlength="140" placeholder="One-liner for the room"/></div>
      <button type="submit" class="outbid">Outbid</button>
    </div>
    <p class="form-hint">${hint}</p>
  </form>`
      : `<form id="bid-form" class="bid-form" method="post" action="/listings">
    <div class="bid-row">
      <div class="field"><input name="company" required maxlength="80" placeholder="Company"/></div>
      <div class="field"><input name="url" type="url" required placeholder="https://deck-or-site"/></div>
      <button type="submit" class="outbid">Outbid</button>
    </div>
    <div class="field"><input name="oneLiner" required maxlength="140" placeholder="One-liner for the room"/></div>
    <p class="form-hint">${hint}</p>
  </form>`
  }
</section>
<script>
  (function () {
    var min = ${MIN_BID_USD};
    var input = document.getElementById("bid");
    if (!input) return;
    function parseBid(raw) {
      var n = parseInt(String(raw).replace(/[^0-9]/g, ""), 10);
      return Number.isFinite(n) ? Math.max(min, n) : min;
    }
${raiseScript}
  })();
</script>`;
}

export function renderBoard(
  listings: Listing[],
  ranked: RankedListing[] = [],
  clicksById: ReadonlyMap<string, number> = new Map(),
): string {
  const rankedIds = new Set(ranked.map((row) => row.id));
  const unranked = listings.filter((listing) => !rankedIds.has(listing.id));
  const clicksOf = (id: string): number => clicksById.get(id) ?? 0;
  const laterDecksExist = ranked.some((row) => row.rank > 1);
  const lead = ranked.filter((row) => row.rank === 1);
  const laterSeats = ranked.filter((row) => row.rank > 1);
  const board = lead.map((row) =>
    renderRanked(row, clicksOf(row.id), laterDecksExist),
  );
  const laterBoard = laterSeats.map((row) =>
    renderRanked(row, clicksOf(row.id), laterDecksExist),
  );
  const offBoard = unranked.map((row) => renderUnranked(row, clicksOf(row.id)));
  const topUsd = ranked[0]?.bid.amountUsd;
  const defaultBid = topUsd === undefined ? MIN_BID_USD : topUsd + 1;
  const emptyRoom = listings.length === 0;
  const occupiedHouse = ranked.length > 0;
  const rankedRows =
    board.length === 0
      ? ""
      : `<ul class="listings" aria-label="This week's opening slot" data-rolling-week="true">
${board.join("\n")}
</ul>`;
  const laterRows =
    laterBoard.length === 0
      ? ""
      : `<ul class="listings listings-later" data-later-seats="true" aria-label="Later seats this week">
${laterBoard.join("\n")}
</ul>`;
  const unpaidRows =
    offBoard.length === 0
      ? ""
      : `<aside class="off-board" data-off-board-list="true" aria-label="Not on the board">
<ul class="off-board-list">
${offBoard.join("\n")}
</ul>
</aside>`;
  const rows = emptyRoom ? "" : `${rankedRows}
  ${laterRows}
  ${unpaidRows}`;
  const claim = claimChrome(defaultBid, emptyRoom, topUsd);
  // Empty house: Claim / Outbid is the first click. Company / deck URL / one-liner
  // are a later write after that hop. Occupied house: Open #1 is the first click.
  // Claim #1 is a later write after the slot.
  const body =
    occupiedHouse === true
      ? `${rows}
  <div class="claim-after-slot" data-claim-after-slot="true">
  ${claim}
  </div>`
      : `${claim}
  ${rows}`;

  return renderLayout({
    title: "Opening three minutes",
    path: "/",
    emptyHouse: emptyRoom,
    occupiedHouse,
    body,
  });
}

export function renderAbout(): string {
  return renderLayout({
    title: "About · Pitch First Slot",
    path: "/about",
    body: `<article class="program">
<h1>About</h1>
<p>This week's first three minutes are for sale. The rest of the room is not.</p>
<p>Pitch First Slot is a public weekly auction for <strong>one</strong> scarce slot in front of angels and scouts: the <strong>opening 3-minute pitch</strong>, or <strong>#1 on that week's deal list</strong>. Rank is the bid. The room watches the price.</p>
<p>You <strong>cannot buy the show</strong>. You cannot buy the rest of the show, the remaining agenda, remaining pitch slots, a private lock on every pitch, hosting the whole show, pinning #1 for multiple weeks, or hiding other listings.</p>
<p>The window is the <strong>rolling last 7 days</strong>. Rank is a <strong>weekly reset</strong> as paid bids age out of that window. Not <strong>Monday 00:00 UTC</strong> — a founder outside that civil midnight does not lose the opening slot on a timezone tax. Last week's #1 does not carry rank after seven days.</p>
<p>The board is new. We do not invent companies, bids, clicks, or traction.</p>
</article>`,
  });
}

export function renderRules(): string {
  return renderLayout({
    title: "Rules · Pitch First Slot",
    path: "/rules",
    body: `<article class="program">
<h1>Rules</h1>
<p>Clone of outbid.lol economics, with a rolling last-7-days window and a single prize: this week's opening slot.</p>
<ol>
  <li><strong>Currency.</strong> USD. Integer dollars only. Store cents internally.</li>
  <li><strong>Minimum.</strong> First paid bid on a listing in a week is <strong>$5</strong>.</li>
  <li><strong>Rank = bid.</strong> Sort paid bids in the rolling last 7 days descending. #1 is the opening slot.</li>
  <li><strong>Ties.</strong> Same bid amount: the <strong>older</strong> successful payment wins (earlier paidAt, then earlier listing.createdAt).</li>
  <li><strong>Raise = difference.</strong> If a listing is at $40 and the founder bids $55, Polar charges <strong>$15</strong>, not $55. The public bid becomes $55.</li>
  <li><strong>Below #1 is allowed.</strong> A $5 bid still lists, at the rank that amount buys.</li>
  <li><strong>Same listing still inside last 7 days.</strong> One current bid per listing in the rolling window. A raise updates that row; it does not create a second row. <code>weekId</code> stays an audit label — not raise identity. A founder who paid Sunday still raises on Monday if that listing is inside last 7 days. After 7 days the same listing is a new full bid.</li>
  <li><strong>New week / weekly reset.</strong> Paid bids expire after <strong>7 days</strong> from <code>paidAt</code>. Not Monday 00:00 UTC. The ranked board starts empty when the window is empty. Listings may remain; they are unranked until a new paid bid in the rolling last 7 days.</li>
  <li><strong>No retract.</strong> A paid bid is not refundable because someone else raised.</li>
</ol>
<p>You <strong>cannot buy the show</strong>. You cannot buy the rest of the show. There is no product for the remaining pitch slots, hosting the whole show, pinning #1 for multiple weeks, or hiding other listings. A request to buy more than the opening slot is 400 <code>cannot_buy_show</code>.</p>
<p>A bid becomes current only after a successful payment. Unpaid checkout sessions do not change rank.</p>
</article>`,
  });
}

function firstQuery(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  return undefined;
}

export function checkoutReturnKind(
  polar: PolarPort,
  query: { checkoutId?: unknown; status?: unknown },
): {
  kind: "cancel" | "pending" | "paid";
  session?: PolarCheckoutRecord;
} {
  const rawStatus = (firstQuery(query.status) ?? "").toLowerCase();
  if (
    rawStatus === "cancel" ||
    rawStatus === "canceled" ||
    rawStatus === "cancelled"
  ) {
    return { kind: "cancel" };
  }
  const checkoutId = firstQuery(query.checkoutId);
  if (!checkoutId) {
    return { kind: "pending" };
  }
  const session = polar.getCheckout(checkoutId);
  if (!session) {
    return { kind: "pending" };
  }
  if (session.status === "paid") {
    return { kind: "paid", session };
  }
  return { kind: "pending", session };
}

/** Occupied Polar return. Does not apply payment. Unpaid stays off the house. */
export function renderCheckoutReturn(
  polar: PolarPort,
  db: AppDb,
  query: { checkoutId?: unknown; status?: unknown },
): string {
  const result = checkoutReturnKind(polar, query);
  let body: string;
  if (result.kind === "cancel") {
    body = `<article class="program" data-return="cancel">
<h1>Checkout canceled</h1>
<p>Unpaid Polar checkout stays off the house. Rank updates only after Polar reports paid. An abandoned Outbid is not the opening slot.</p>
<p><a href="/">Back to the room</a></p>
</article>`;
  } else if (result.kind === "paid" && result.session) {
    const listing = getListingById(db, result.session.listingId);
    const company = listing ? escapeHtml(listing.company) : "This listing";
    const isRaise = result.session.chargeUsd < result.session.nextUsd;
    if (isRaise) {
      body = `<article class="program" data-return="paid" data-raise-difference="true">
<h1>Polar charged the difference</h1>
<p>Polar charged $${result.session.chargeUsd} to raise to $${result.session.nextUsd} — only the difference, not a new bid. Sunday pay raised Monday still pays the difference.</p>
<p>${company} is on the house at $${result.session.nextUsd}. Rank is the bid after Polar reports paid.</p>
<p><a href="/">Back to the room</a></p>
</article>`;
    } else {
      body = `<article class="program" data-return="paid">
<h1>Polar reports paid</h1>
<p>${company} is on the house at $${result.session.nextUsd}. Rank is the bid. Unpaid Polar checkout would have stayed off the house.</p>
<p><a href="/">Back to the room</a></p>
</article>`;
    }
  } else {
    body = `<article class="program" data-return="pending">
<h1>Checkout is not paid</h1>
<p>Unpaid Polar checkout stays off the house until Polar reports paid. This page does not trust the query string alone.</p>
<p><a href="/">Back to the room</a></p>
</article>`;
  }
  return renderLayout({
    title: "Checkout · Pitch First Slot",
    path: "/checkout/complete",
    body,
  });
}

export const pageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (_request, reply) => {
    const listings = listListings(app.db);
    const ranked = rankedBoard(app.db, app.now());
    const clicks = clickCountsByListing(app.db);
    return reply
      .type("text/html; charset=utf-8")
      .send(renderBoard(listings, ranked, clicks));
  });

  app.get("/about", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(renderAbout());
  });

  app.get("/rules", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(renderRules());
  });

  app.get("/checkout/complete", async (request, reply) => {
    const query = request.query as { checkoutId?: string; status?: string };
    return reply
      .type("text/html; charset=utf-8")
      .send(renderCheckoutReturn(app.polar, app.db, query));
  });
};
