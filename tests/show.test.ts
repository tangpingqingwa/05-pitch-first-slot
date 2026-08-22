import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import { assertOpeningSlotOnly, ShowError } from "../src/core/show.js";

async function createListing(
  app: Awaited<ReturnType<typeof buildApp>>,
): Promise<{ id: string }> {
  const created = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      company: "Helix Labs",
      oneLiner: "Benchtop instruments for small labs",
      url: "https://helix.example/deck",
    },
  });
  assert.equal(created.statusCode, 200);
  return created.json() as { id: string };
}

test("SPEC 11: checkout all remaining slots is 400 cannot_buy_show", async () => {
  const app = await buildApp({
    databasePath: ":memory:",
    now: () => new Date("2026-08-19T12:00:00.000Z"),
  });
  after(() => app.close());

  const listing = await createListing(app);

  const remaining = await app.inject({
    method: "POST",
    url: `/listings/${listing.id}/bids`,
    payload: { amountUsd: 50, sku: "all remaining slots" },
  });
  assert.equal(remaining.statusCode, 400);
  assert.equal(remaining.json().error, "cannot_buy_show");

  const wholeShow = await app.inject({
    method: "POST",
    url: `/listings/${listing.id}/bids`,
    payload: { amountUsd: 50, sku: "host the whole show" },
  });
  assert.equal(wholeShow.statusCode, 400);
  assert.equal(wholeShow.json().error, "cannot_buy_show");

  const pinWeeks = await app.inject({
    method: "POST",
    url: `/listings/${listing.id}/bids`,
    payload: { amountUsd: 50, pinWeeks: 4 },
  });
  assert.equal(pinWeeks.statusCode, 400);
  assert.equal(pinWeeks.json().error, "cannot_buy_show");

  const opening = await app.inject({
    method: "POST",
    url: `/listings/${listing.id}/bids`,
    payload: { amountUsd: 5, sku: "opening_slot" },
  });
  assert.equal(opening.statusCode, 200);
  assert.equal((opening.json() as { amountUsd: number }).amountUsd, 5);
});

test("assertOpeningSlotOnly allows a missing or opening-slot SKU", () => {
  assert.doesNotThrow(() => assertOpeningSlotOnly(undefined));
  assert.doesNotThrow(() => assertOpeningSlotOnly({ amountUsd: 5 }));
  assert.doesNotThrow(() =>
    assertOpeningSlotOnly({ amountUsd: 5, sku: "opening_slot" }),
  );
  assert.throws(
    () => assertOpeningSlotOnly({ sku: "all_remaining_slots" }),
    (err: unknown) => {
      assert.ok(err instanceof ShowError);
      assert.equal(err.code, "cannot_buy_show");
      return true;
    },
  );
});
