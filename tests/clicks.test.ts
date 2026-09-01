import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import { getClickCount } from "../src/core/clicks.js";

async function createListing(
  app: Awaited<ReturnType<typeof buildApp>>,
  body: { company: string; oneLiner: string; url: string },
): Promise<{ id: string; url: string }> {
  const created = await app.inject({
    method: "POST",
    url: "/listings",
    payload: body,
  });
  assert.equal(created.statusCode, 200);
  return created.json() as { id: string; url: string };
}

test("SPEC 9: public click increments 0 → 1 and redirects to canonical URL", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const listing = await createListing(app, {
    company: "Helix Labs",
    oneLiner: "Benchtop instruments for small labs",
    url: "https://helix.example/deck?utm_source=board&fbclid=1",
  });
  assert.equal(listing.url, "https://helix.example/deck");
  assert.equal(getClickCount(app.db, listing.id), 0);

  const boardBefore = await app.inject({ method: "GET", url: "/" });
  assert.match(boardBefore.body, /data-clicks="0"/);
  assert.match(boardBefore.body, /0 clicks/);

  const clicked = await app.inject({
    method: "POST",
    url: `/listings/${listing.id}/clicks`,
  });
  assert.equal(clicked.statusCode, 302);
  assert.equal(clicked.headers.location, "https://helix.example/deck");
  assert.equal(getClickCount(app.db, listing.id), 1);

  const boardAfter = await app.inject({ method: "GET", url: "/" });
  assert.match(boardAfter.body, /data-clicks="1"/);
  assert.match(boardAfter.body, /1 clicks/);
  assert.doesNotMatch(boardAfter.body, /utm_/);
});

test("clicks start at 0 and never copy another listing", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const popular = await createListing(app, {
    company: "Popular",
    oneLiner: "Already clicked",
    url: "https://popular.example/deck",
  });
  const quiet = await createListing(app, {
    company: "Quiet",
    oneLiner: "Never clicked",
    url: "https://quiet.example/deck",
  });

  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/listings/${popular.id}/clicks`,
      })
    ).statusCode,
    302,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/listings/${popular.id}/clicks`,
      })
    ).statusCode,
    302,
  );
  assert.equal(getClickCount(app.db, popular.id), 2);
  assert.equal(getClickCount(app.db, quiet.id), 0);

  const board = await app.inject({ method: "GET", url: "/" });
  assert.match(board.body, /Popular[\s\S]*2 clicks/);
  assert.match(board.body, /Quiet[\s\S]*0 clicks/);
});

test("GET paid-card click links increment and redirect to the canonical URL", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const listing = await createListing(app, {
    company: "Paid Deck",
    oneLiner: "A visible paid-card deck link",
    url: "https://readonly.example/deck",
  });
  const paid = await app.inject({
    method: "POST",
    url: `/listings/${listing.id}/bids`,
    payload: { amountUsd: 5 },
  });
  assert.equal(paid.statusCode, 200);
  assert.equal(getClickCount(app.db, listing.id), 0);

  const paidBoard = await app.inject({ method: "GET", url: "/" });
  assert.match(
    paidBoard.body,
    /class="open-deck"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/,
  );

  const opened = await app.inject({
    method: "GET",
    url: `/listings/${listing.id}/clicks`,
  });
  assert.equal(opened.statusCode, 302);
  assert.equal(opened.headers.location, listing.url);
  assert.equal(getClickCount(app.db, listing.id), 1);

  const openedAgain = await app.inject({
    method: "GET",
    url: `/listings/${listing.id}/clicks`,
  });
  assert.equal(openedAgain.statusCode, 302);
  assert.equal(openedAgain.headers.location, listing.url);
  assert.equal(getClickCount(app.db, listing.id), 2);
});

test("GET unavailable deck links redirect without incrementing", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const listing = await createListing(app, {
    company: "Unpaid Deck",
    oneLiner: "Not visible as a paid card",
    url: "https://unpaid.example/deck",
  });
  const opened = await app.inject({
    method: "GET",
    url: `/listings/${listing.id}/clicks`,
  });
  assert.equal(opened.statusCode, 302);
  assert.equal(opened.headers.location, listing.url);
  assert.equal(getClickCount(app.db, listing.id), 0);
});

test("unknown listing click is 404", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const missing = await app.inject({
    method: "POST",
    url: "/listings/does-not-exist/clicks",
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error, "listing_not_found");

  const missingGet = await app.inject({
    method: "GET",
    url: "/listings/does-not-exist/clicks",
  });
  assert.equal(missingGet.statusCode, 404);
  assert.equal(missingGet.json().error, "listing_not_found");
});
