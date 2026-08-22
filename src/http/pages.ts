import type { FastifyPluginAsync } from "fastify";
import { clickCountsByListing } from "../core/clicks.js";
import { listListings, type Listing } from "../core/listing.js";
import { rankedBoard, type RankedListing } from "../core/rank.js";
import { currentWeekId } from "../core/week.js";

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
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.title)}</title>
</head>
<body>
  <header>
    <a href="/">Pitch First Slot</a>
    <nav aria-label="Main">
      ${navLink("/", "Board", input.path)}
      ${navLink("/about", "About", input.path)}
      ${navLink("/rules", "Rules", input.path)}
    </nav>
  </header>
  <main>
    ${input.body}
  </main>
</body>
</html>
`;
}

function clickHref(listingId: string): string {
  return `/listings/${encodeURIComponent(listingId)}/clicks`;
}

function renderUnranked(listing: Listing, clicks: number): string {
  const company = escapeHtml(listing.company);
  const oneLiner = escapeHtml(listing.oneLiner);
  const url = escapeHtml(listing.url);
  return `<li class="listing" data-unranked="true" data-clicks="${clicks}">
  <p class="company">${company}</p>
  <p class="one-liner">${oneLiner}</p>
  <p><a class="listing-url" href="${clickHref(listing.id)}" rel="noopener noreferrer">${url}</a></p>
  <p class="clicks">${clicks} clicks</p>
  <p class="rank">Unranked — no paid bid yet</p>
</li>`;
}

function renderRanked(listing: RankedListing, clicks: number): string {
  const company = escapeHtml(listing.company);
  const oneLiner = escapeHtml(listing.oneLiner);
  const url = escapeHtml(listing.url);
  return `<li class="listing" data-rank="${listing.rank}" data-bid="${listing.bid.amountUsd}" data-clicks="${clicks}">
  <p class="rank">#${listing.rank} · $${listing.bid.amountUsd}</p>
  <p class="company">${company}</p>
  <p class="one-liner">${oneLiner}</p>
  <p><a class="listing-url" href="${clickHref(listing.id)}" rel="noopener noreferrer">${url}</a></p>
  <p class="clicks">${clicks} clicks</p>
</li>`;
}

export function renderBoard(
  listings: Listing[],
  ranked: RankedListing[] = [],
  clicksById: ReadonlyMap<string, number> = new Map(),
): string {
  const rankedIds = new Set(ranked.map((row) => row.id));
  const unranked = listings.filter((listing) => !rankedIds.has(listing.id));
  const clicksOf = (id: string): number => clicksById.get(id) ?? 0;
  const items = [
    ...ranked.map((row) => renderRanked(row, clicksOf(row.id))),
    ...unranked.map((row) => renderUnranked(row, clicksOf(row.id))),
  ];
  const rows =
    listings.length === 0
      ? `<p class="empty-board">The board is empty. No listings this week.</p>`
      : `<ul class="listings">
${items.join("\n")}
</ul>`;

  return renderLayout({
    title: "Pitch First Slot",
    path: "/",
    body: `<h1>Pitch First Slot</h1>
  <p>This week's first three minutes are for sale. The rest of the room is not.</p>
  ${rows}`,
  });
}

export function renderAbout(): string {
  return renderLayout({
    title: "About · Pitch First Slot",
    path: "/about",
    body: `<h1>About</h1>
<p>This week's first three minutes are for sale. The rest of the room is not.</p>
<p>Pitch First Slot is a public weekly auction for <strong>one</strong> scarce slot in front of angels and scouts: the <strong>opening 3-minute pitch</strong>, or <strong>#1 on that week's deal list</strong>. Rank is the bid. The room watches the price.</p>
<p>You <strong>cannot buy the show</strong>. You cannot buy the rest of the show, the remaining agenda, remaining pitch slots, a private lock on every pitch, hosting the whole show, pinning #1 for multiple weeks, or hiding other listings.</p>
<p>The window is one UTC week. Rank is a <strong>weekly reset</strong> at <strong>Monday 00:00 UTC</strong>. Last week's #1 does not carry rank into the new week.</p>
<p>The board is new. We do not invent companies, bids, clicks, or traction.</p>`,
  });
}

export function renderRules(): string {
  return renderLayout({
    title: "Rules · Pitch First Slot",
    path: "/rules",
    body: `<h1>Rules</h1>
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
<p>A bid becomes current only after a successful payment. Unpaid checkout sessions do not change rank.</p>`,
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
};
