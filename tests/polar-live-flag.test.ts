import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import { createPolarPort, polarLiveEnabled } from "../src/billing/polar.js";
import { PolarFixture } from "../src/billing/polar_fixture.js";
import { PolarLive } from "../src/billing/polar_live.js";
import {
  polarAccessToken,
  polarApiBase,
  polarFixtureOnly,
  polarProductId,
  polarWebhookSecret,
} from "../src/config.js";
import { getBid, rankedBoard } from "../src/core/rank.js";
import { openDatabase } from "../src/db.js";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const WEEK = "2026-08-17";
const LIVE_ENV = {
  POLAR_LIVE: "1",
  POLAR_ACCESS_TOKEN: "polar_tok_test",
  POLAR_WEBHOOK_SECRET: "whsec_test",
};

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

function signedHeaders(rawBody: string, secret: string): Record<string, string> {
  const id = "wh_test_1";
  const timestamp = "1710000000";
  const signature = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
  };
}

test("unset / 0 / fixture-only never hits Polar", () => {
  assert.equal(polarLiveEnabled({}), false);
  assert.equal(polarLiveEnabled({ POLAR_LIVE: "0" }), false);
  assert.equal(polarLiveEnabled({ POLAR_LIVE: "true" }), false);
  assert.equal(polarLiveEnabled({ POLAR_LIVE: "1" }), true);
  assert.equal(
    polarLiveEnabled({ POLAR_LIVE: "1", POLAR_FIXTURE_ONLY: "1" }),
    false,
  );
  assert.equal(polarFixtureOnly({ POLAR_FIXTURE_ONLY: "1" }), true);
  assert.equal(polarAccessToken({ POLAR_ACCESS_TOKEN: "  " }), undefined);
  assert.equal(polarWebhookSecret({}), undefined);
  assert.equal(polarProductId({}), undefined);
  assert.equal(polarProductId({ POLAR_PRODUCT_ID: " prod_test " }), "prod_test");
  assert.match(polarApiBase({}), /^https:\/\/[a-z.]+$/);
  assert.equal(
    polarApiBase({ POLAR_API_BASE: "https://polar-api.test/" }),
    "https://polar-api.test",
  );

  const db = openDatabase(":memory:");
  after(() => db.close());

  assert.ok(createPolarPort(db, { env: {} }) instanceof PolarFixture);
  assert.ok(createPolarPort(db, { env: { POLAR_LIVE: "0" } }) instanceof PolarFixture);
  assert.ok(
    createPolarPort(db, {
      env: {
        POLAR_LIVE: "1",
        POLAR_FIXTURE_ONLY: "1",
        POLAR_ACCESS_TOKEN: "polar_tok_unused",
      },
    }) instanceof PolarFixture,
  );

  assert.throws(
    () => createPolarPort(db, { env: { POLAR_LIVE: "1" } }),
    /BLOCKED-SECRET: POLAR_ACCESS_TOKEN/,
  );
  assert.throws(
    () =>
      new PolarLive(db, {
        env: { POLAR_LIVE: "1", POLAR_FIXTURE_ONLY: "1", POLAR_ACCESS_TOKEN: "x" },
      }),
    /POLAR_FIXTURE_ONLY/,
  );
  assert.throws(() => new PolarLive(db, { env: {} }), /POLAR_LIVE=1/);
  assert.throws(
    () => new PolarLive(db, { env: { POLAR_LIVE: "1" } }),
    /BLOCKED-SECRET: POLAR_ACCESS_TOKEN/,
  );
});

test("POLAR_LIVE unset in test — no live Polar host", () => {
  assert.notEqual(process.env.POLAR_LIVE, "1");
  assert.equal(process.env.POLAR_FIXTURE_ONLY, "1");
  assert.equal(polarLiveEnabled(process.env), false);
  const db = openDatabase(":memory:");
  after(() => db.close());
  const polar = createPolarPort(db);
  assert.equal(polar.kind, "fixture");
  assert.ok(polar instanceof PolarFixture);
});

test("PolarLive createCheckout uses POLAR_API_BASE override", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const app = await buildApp({ db, now: () => NOW });
  after(() => app.close());
  const listing = await createListing(app, {
    company: "Sandbox Override",
    oneLiner: "API base must be overridable",
    url: "https://sandbox-override.example",
  });

  const seen: string[] = [];
  const live = new PolarLive(db, {
    env: {
      ...LIVE_ENV,
      POLAR_API_BASE: "https://polar-api.test",
      POLAR_PRODUCT_ID: "prod_test",
    },
    fetch: (async (input, init) => {
      seen.push(String(input));
      const body = typeof init?.body === "string" ? init.body : "";
      assert.match(body, /checkout\/complete\?checkoutId=\{CHECKOUT_ID\}/);
      return new Response(
        JSON.stringify({
          id: "chk_sandbox_override",
          url: "https://polar-checkout.test/c/chk_sandbox_override",
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch,
  });
  const started = await live.createCheckout({
    listingId: listing.id,
    weekId: WEEK,
    chargeUsd: 5,
    nextUsd: 5,
  });
  assert.deepEqual(seen, ["https://polar-api.test/v1/checkouts/"]);
  assert.equal(started.checkoutId, "chk_sandbox_override");
  assert.equal(started.url, "https://polar-checkout.test/c/chk_sandbox_override");
  assert.equal(getBid(db, listing.id, WEEK), undefined);
});

test("PolarLive constructor does not fetch Polar", () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  let fetched = false;
  const stubFetch = (async () => {
    fetched = true;
    throw new Error("live Polar must not fetch in tests");
  }) as typeof fetch;
  const live = new PolarLive(db, { env: LIVE_ENV, fetch: stubFetch });
  const viaFactory = createPolarPort(db, { env: LIVE_ENV, fetch: stubFetch });
  assert.equal(live.kind, "live");
  assert.ok(viaFactory instanceof PolarLive);
  assert.equal(fetched, false);
});

test("live Polar missing webhook secret fails closed", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const live = new PolarLive(db, {
    env: { POLAR_LIVE: "1", POLAR_ACCESS_TOKEN: "polar_tok_test" },
    fetch: (async () => {
      throw new Error("live Polar must not fetch in tests");
    }) as typeof fetch,
  });
  await assert.rejects(
    () => live.handleWebhook("{}", {}, NOW.toISOString()),
    /BLOCKED-SECRET: POLAR_WEBHOOK_SECRET/,
  );
});

test("webhook applies payment; unpaid checkout does not rank", async () => {
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
    company: "Helix Labs",
    oneLiner: "Benchtop instruments for small labs",
    url: "https://helix.example/deck",
  });
  const started = await polar.createCheckout({
    listingId: listing.id,
    weekId: WEEK,
    chargeUsd: 5,
    nextUsd: 5,
  });
  assert.equal(polar.getCheckout(started.checkoutId)?.status, "pending");
  assert.equal(getBid(db, listing.id, WEEK), undefined);

  const missing = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    payload: { checkoutId: "does-not-exist" },
  });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.json(), { error: "unknown_checkout" });
  assert.deepEqual(rankedBoard(db, NOW), []);

  const paid = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    payload: { checkoutId: started.checkoutId },
  });
  assert.equal(paid.statusCode, 200);
  assert.deepEqual(paid.json(), {
    ok: true,
    status: "paid",
    checkoutId: started.checkoutId,
  });
  assert.equal(getBid(db, listing.id, WEEK)?.amountUsd, 5);
  assert.equal(rankedBoard(db, NOW)[0]?.rank, 1);

  const again = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    payload: { checkoutId: started.checkoutId },
  });
  assert.equal(again.statusCode, 200);
  assert.equal(rankedBoard(db, NOW).length, 1);
});

test("signed live webhook applies payment without Polar HTTP", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  let fetched = false;
  const live = new PolarLive(db, {
    env: LIVE_ENV,
    fetch: (async () => {
      fetched = true;
      throw new Error("live Polar must not fetch in tests");
    }) as typeof fetch,
  });
  const app = await buildApp({
    db,
    polar: live,
    now: () => NOW,
  });
  after(() => app.close());

  const listing = await createListing(app, {
    company: "Northwind",
    oneLiner: "Invoice tools for wholesalers",
    url: "https://northwind.example",
  });
  const rawBody = JSON.stringify({
    type: "order.paid",
    data: {
      id: "chk_live_1",
      status: "paid",
      metadata: {
        listingId: listing.id,
        weekId: WEEK,
        chargeUsd: "5",
        nextUsd: "5",
      },
    },
  });
  const hook = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    headers: {
      "content-type": "application/json",
      ...signedHeaders(rawBody, LIVE_ENV.POLAR_WEBHOOK_SECRET),
    },
    payload: rawBody,
  });
  assert.equal(hook.statusCode, 200);
  assert.equal(fetched, false);
  assert.equal(getBid(db, listing.id, WEEK)?.amountUsd, 5);
  assert.match(
    (await app.inject({ method: "GET", url: "/" })).body,
    /#1 · \$5/,
  );
});

test("invalid live webhook signature fails closed", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const live = new PolarLive(db, {
    env: LIVE_ENV,
    fetch: (async () => {
      throw new Error("live Polar must not fetch in tests");
    }) as typeof fetch,
  });
  const app = await buildApp({ db, polar: live, now: () => NOW });
  after(() => app.close());

  const listing = await createListing(app, {
    company: "Open Bid Co",
    oneLiner: "Bad signature stays unranked",
    url: "https://open-bid.example",
  });
  const rawBody = JSON.stringify({
    type: "order.paid",
    data: {
      id: "chk_bad_sig",
      status: "paid",
      metadata: {
        listingId: listing.id,
        weekId: WEEK,
        chargeUsd: "5",
        nextUsd: "5",
      },
    },
  });
  const hook = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    headers: {
      "content-type": "application/json",
      "webhook-id": "wh_bad",
      "webhook-timestamp": "1",
      "webhook-signature": "v1,not-a-real-signature",
    },
    payload: rawBody,
  });
  assert.equal(hook.statusCode, 400);
  assert.deepEqual(hook.json(), { error: "invalid_webhook" });
  assert.equal(getBid(db, listing.id, WEEK), undefined);
});
