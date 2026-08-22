import type { FastifyPluginAsync } from "fastify";
import { listListings, type Listing } from "../core/listing.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderListing(listing: Listing): string {
  const company = escapeHtml(listing.company);
  const oneLiner = escapeHtml(listing.oneLiner);
  const url = escapeHtml(listing.url);
  return `<li class="listing" data-unranked="true">
  <p class="company">${company}</p>
  <p class="one-liner">${oneLiner}</p>
  <p><a class="listing-url" href="${url}" rel="noopener noreferrer">${url}</a></p>
  <p class="rank">Unranked — no paid bid yet</p>
</li>`;
}

export function renderBoard(listings: Listing[]): string {
  const rows =
    listings.length === 0
      ? `<p class="empty-board">The board is empty. No listings this week.</p>`
      : `<ul class="listings">
${listings.map(renderListing).join("\n")}
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
    const listings = listListings(app.db);
    return reply.type("text/html; charset=utf-8").send(renderBoard(listings));
  });
};
