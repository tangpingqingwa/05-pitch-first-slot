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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pitch First Slot</title>
</head>
<body>
  <h1>Pitch First Slot</h1>
  <p>This week's first three minutes are for sale. The rest of the room is not.</p>
  ${rows}
</body>
</html>
`;
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
};
