import type { FastifyPluginAsync } from "fastify";
import { clickCountsByListing } from "../core/clicks.js";
import { listListings, type Listing } from "../core/listing.js";
import { MIN_BID_USD, rankedBoard, type RankedListing } from "../core/rank.js";
import { currentWeekId } from "../core/week.js";
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
}): string {
  const css = input.emptyHouse === true ? HOUSE_CSS : BOARD_CSS;
  const houseAttr = input.emptyHouse === true ? ' data-empty-house="true"' : "";
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
    ${input.body}
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
    return `<p class="deck">
        <a class="open-deck open-later" data-open-deck="true" data-open-later="true" href="${href}" rel="noopener noreferrer">
          Open deck
          <span class="deck-url">${url}</span>
        </a>
      </p>`;
  }
  if (paid && openOne) {
    const next = raiseAfter
      ? `\n        ${raiseAfterDeckHop(true)}\n        ${openAfterRaiseHop(listing)}\n        ${raiseAfterOpenHop()}`
      : "";
    return `<p class="deck">
        <a class="open-deck open-one open-after-raise-one open-after-raise-two open-after-raise-three open-after-raise-four open-after-raise-five" data-open-deck="true" data-open-one="true" data-open-after-raise-one="true" data-open-after-raise-two="true" data-open-after-raise-three="true" data-open-after-raise-four="true" data-open-after-raise-five="true" href="${href}" rel="noopener noreferrer">
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
  const body = later
    ? `<div class="cue later-cue">
    <div class="who">
      <p class="company">${company}</p>
      <p class="one-liner">${oneLiner}</p>
    </div>
    ${hop}
    <div class="seat">
      <span class="cue-label">Bid</span>
      <p class="rank">${input.rankHtml}</p>
      <p class="clicks">${input.clicks} clicks</p>
    </div>
  </div>`
    : openOne
      ? `<div class="cue open-one-cue">
    <div class="who">
      <p class="company">${company}</p>
      <p class="one-liner">${oneLiner}</p>
    </div>
    ${hop}
    <div class="seat">
      <span class="cue-label">Bid</span>
      <p class="rank">${input.rankHtml}</p>
      <p class="clicks">${input.clicks} clicks</p>
    </div>
  </div>`
    : input.paid
      ? `<div class="cue">
    <div class="who">
      <p class="company">${company}</p>
      <p class="one-liner">${oneLiner}</p>
    </div>
    <div class="seat">
      <span class="cue-label">Bid</span>
      <p class="rank">${input.rankHtml}</p>
      <p class="clicks">${input.clicks} clicks</p>
    </div>
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
</p>`;
    hint =
      "Company, deck URL, and a one-liner. Unpaid checkout does not rank.";
  } else if (topUsd !== undefined) {
    const raiseChargeUsd = Math.max(0, defaultBidUsd - topUsd);
    note = `<p class="claim-note" data-occupied-raise data-raise-difference="true">
  <span class="room">#1 is $${topUsd}.</span>
  The $ you type is the public bid.
  <span class="raise-charge" data-raise-charge="true" data-current-usd="${topUsd}">Polar charges $<span data-raise-charge-usd>${raiseChargeUsd}</span> to raise — only the difference, not a new bid.</span>
  New deck: Polar charges that full amount. Same deck already ranked: Polar charges only the difference.
</p>`;
    hint =
      "Same deck URL raises this row. Polar charges only the difference. Unpaid checkout does not rank.";
  } else {
    note = `<p class="claim-note">This week's first three minutes are for sale. The rest of the room is not. Rank is the bid after Polar lands.</p>`;
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
  <form id="bid-form" class="bid-form" method="post" action="/listings">
    <div class="bid-row">
      <div class="field"><input name="company" required maxlength="80" placeholder="Company"/></div>
      <div class="field"><input name="url" type="url" required placeholder="https://deck-or-site"/></div>
      <button type="submit" class="outbid">Outbid</button>
    </div>
    <div class="field"><input name="oneLiner" required maxlength="140" placeholder="One-liner for the room"/></div>
    <p class="form-hint">${hint}</p>
  </form>
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
  const board = ranked.map((row) =>
    renderRanked(row, clicksOf(row.id), laterDecksExist),
  );
  const offBoard = unranked.map((row) => renderUnranked(row, clicksOf(row.id)));
  const topUsd = ranked[0]?.bid.amountUsd;
  const defaultBid = topUsd === undefined ? MIN_BID_USD : topUsd + 1;
  const emptyRoom = listings.length === 0;
  const rankedRows =
    board.length === 0
      ? ""
      : `<ul class="listings">
${board.join("\n")}
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
  ${unpaidRows}`;

  return renderLayout({
    title: "Opening three minutes",
    path: "/",
    emptyHouse: emptyRoom,
    body: `${claimChrome(defaultBid, emptyRoom, topUsd)}
  ${rows}`,
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
<p>The window is one UTC week. Rank is a <strong>weekly reset</strong> at <strong>Monday 00:00 UTC</strong>. Last week's #1 does not carry rank into the new week.</p>
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
<p>Clone of outbid.lol economics, with a weekly reset and a single prize: this week's opening slot.</p>
<ol>
  <li><strong>Currency.</strong> USD. Integer dollars only. Store cents internally.</li>
  <li><strong>Minimum.</strong> First paid bid on a listing in a week is <strong>$5</strong>.</li>
  <li><strong>Rank = bid.</strong> Sort current-week bid descending. #1 is the opening slot.</li>
  <li><strong>Ties.</strong> Same bid amount: the <strong>older</strong> successful payment wins (earlier paidAt, then earlier listing.createdAt).</li>
  <li><strong>Raise = difference.</strong> If a listing is at $40 and the founder bids $55, Polar charges <strong>$15</strong>, not $55. The public bid becomes $55.</li>
  <li><strong>Below #1 is allowed.</strong> A $5 bid still lists, at the rank that amount buys.</li>
  <li><strong>Same listing, same week.</strong> One current bid per listing. A raise updates that row; it does not create a second row.</li>
  <li><strong>New week / weekly reset.</strong> All current bids expire at <strong>Monday 00:00 UTC</strong>. The ranked board starts empty. Listings may remain; they are unranked until a new paid bid in the new weekId.</li>
  <li><strong>No retract.</strong> A paid bid is not refundable because someone else raised.</li>
</ol>
<p>You <strong>cannot buy the show</strong>. You cannot buy the rest of the show. There is no product for the remaining pitch slots, hosting the whole show, pinning #1 for multiple weeks, or hiding other listings. A request to buy more than the opening slot is 400 <code>cannot_buy_show</code>.</p>
<p>A bid becomes current only after a successful payment. Unpaid checkout sessions do not change rank.</p>
</article>`,
  });
}

export const pageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (_request, reply) => {
    const weekId = currentWeekId(app.now());
    const listings = listListings(app.db);
    const ranked = rankedBoard(app.db, weekId);
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

  app.get("/checkout/complete", async (_request, reply) => {
    return reply.redirect("/", 303);
  });
};
