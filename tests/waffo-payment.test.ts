import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import { createPaymentPort } from "../src/billing/index.js";
import { WaffoLive } from "../src/billing/waffo.js";
import { createListing } from "../src/core/listing.js";
import { getBid, rankedBoard } from "../src/core/rank.js";
import { openDatabase, type AppDb } from "../src/db.js";
import { checkoutReturnKind } from "../src/http/pages.js";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const WEEK = "2026-08-17";
const MERCHANT = `MER_${"M".repeat(22)}`;
const STORE = `STO_${"S".repeat(22)}`;
const PRODUCT = `PROD_${"P".repeat(22)}`;
const CHECKOUT_SLUG = "pitch-first-slot";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();

type FetchMode =
  | "success"
  | "timeout"
  | "bad-response"
  | "bad-url"
  | "unapproved-url"
  | "insecure-url"
  | "root-url"
  | "query-url"
  | "default-port-url"
  | "legacy-url"
  | "wrong-session-url"
  | "expired"
  | "rejected"
  | "non-json"
  | "body-timeout"
  | "ambiguous-408"
  | "ambiguous-409"
  | "ambiguous-425"
  | "ambiguous-429";

function env(mode = "waffo-test", databasePath?: string): Record<string, string> {
  return {
    WAFFO_MODE: mode,
    WAFFO_MERCHANT_ID: MERCHANT,
    WAFFO_STORE_ID: STORE,
    WAFFO_PRODUCT_ID: PRODUCT,
    WAFFO_PRIVATE_KEY: privateKey,
    WAFFO_WEBHOOK_TEST_PUBLIC_KEY: publicKey,
    WAFFO_WEBHOOK_PROD_PUBLIC_KEY: publicKey,
    WAFFO_API_BASE: mode === "waffo-prod" ? "https://api.waffo.ai" : "https://waffo.test",
    PUBLIC_BASE_URL: mode === "waffo-prod" ? "https://pitch-first-slot.app" : "https://pitch.test",
    ...(databasePath ? { DATABASE_PATH: databasePath } : {}),
  };
}

function providerFetch(
  calls: Array<{ url: string; body: Record<string, unknown> }>,
  mode: FetchMode = "success",
): typeof fetch {
  return (async (input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url: String(input), body });
    if (mode === "timeout") throw new Error("connection reset");
    if (mode === "bad-response") {
      return new Response(JSON.stringify({ data: { sessionId: "only-id" } }), { status: 200 });
    }
    if (mode === "bad-url") {
      return new Response(
        JSON.stringify({
          data: {
            sessionId: `SES_${calls.length}`,
            checkoutUrl: "not-a-checkout-url",
            expiresAt: "2026-08-20T12:00:00.000Z",
          },
        }),
        { status: 200 },
      );
    }
    if (mode === "unapproved-url") {
      return new Response(
        JSON.stringify({
          data: {
            sessionId: `SES_${calls.length}`,
            checkoutUrl: "https://attacker.example/session",
            expiresAt: "2026-08-20T12:00:00.000Z",
          },
        }),
        { status: 200 },
      );
    }
    if (mode === "insecure-url") {
      return new Response(
        JSON.stringify({
          data: {
            sessionId: `SES_${calls.length}`,
            checkoutUrl: "http://pancake.waffo.ai/session",
            expiresAt: "2026-08-20T12:00:00.000Z",
          },
        }),
        { status: 200 },
      );
    }
    if (
      mode === "root-url" ||
      mode === "query-url" ||
      mode === "default-port-url" ||
      mode === "legacy-url" ||
      mode === "wrong-session-url" ||
      mode === "expired"
    ) {
      const sessionId = `SES_${calls.length}`;
      const checkoutUrl =
        mode === "root-url"
          ? "https://pancake.waffo.ai/"
          : mode === "query-url"
            ? `https://pancake.waffo.ai/store/${CHECKOUT_SLUG}/checkout/${sessionId}?next=1`
            : mode === "default-port-url"
              ? `https://pancake.waffo.ai:443/store/${CHECKOUT_SLUG}/checkout/${sessionId}`
              : mode === "legacy-url"
                ? `https://pancake.waffo.ai/session/${sessionId}`
                : mode === "wrong-session-url"
                  ? `https://pancake.waffo.ai/store/${CHECKOUT_SLUG}/checkout/SES_other`
                  : `https://pancake.waffo.ai/store/${CHECKOUT_SLUG}/checkout/${sessionId}`;
      return new Response(
        JSON.stringify({
          data: {
            sessionId,
            checkoutUrl,
            expiresAt:
              mode === "expired"
                ? "2026-08-18T12:00:00.000Z"
                : "2026-08-20T12:00:00.000Z",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (mode === "body-timeout") {
      return new Response(
        new ReadableStream<Uint8Array>({
          pull: () => new Promise<void>(() => undefined),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (mode === "non-json") {
      return new Response("provider unavailable", { status: 400 });
    }
    const ambiguousStatus = /^ambiguous-(408|409|425|429)$/.exec(mode)?.[1];
    if (ambiguousStatus) {
      return new Response(JSON.stringify({ errors: [{ message: "try again" }] }), {
        status: Number(ambiguousStatus),
        headers: { "content-type": "application/json" },
      });
    }
    if (mode === "rejected") {
      return new Response(JSON.stringify({ errors: [{ message: "bad product" }] }), { status: 400 });
    }
    const n = calls.length;
    return new Response(
      JSON.stringify({
        data: {
          sessionId: `SES_${n}`,
          checkoutUrl: `https://pancake.waffo.ai/store/${CHECKOUT_SLUG}/checkout/SES_${n}`,
          expiresAt: "2026-08-20T12:00:00.000Z",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
}

function signedWebhook(
  body: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
  deliveryId = `del_${Math.random().toString(36).slice(2)}`,
  signatureTimestamp = String(Date.now()),
): { raw: string; headers: Record<string, string> } {
  const event = {
    id: deliveryId,
    timestamp: NOW.toISOString(),
    eventType: "order.completed",
    eventId: "PAY_1",
    storeId: STORE,
    storeName: "Pitch",
    mode: "test",
    data: {
      orderId: "ORD_1",
      orderStatus: "completed",
      buyerEmail: "founder@example.com",
      currency: "USD",
      amount: "5.00",
      taxAmount: "0.00",
      subtotal: "5.00",
      productId: PRODUCT,
      productName: "Rank",
      paymentId: "PAY_1",
      paymentStatus: "succeeded",
      orderMerchantExternalId: "",
      orderMetadata: {},
      ...body,
    },
    ...overrides,
  };
  const raw = JSON.stringify(event);
  const signature = createSign("RSA-SHA256")
    .update(`${signatureTimestamp}.${raw}`)
    .sign(privateKey, "base64");
  return {
    raw,
    headers: { "X-Waffo-Signature": `t=${signatureTimestamp},v1=${signature}` },
  };
}

function makeListing(db: AppDb, suffix: string) {
  return createListing(
    db,
    {
      company: `Waffo ${suffix}`,
      oneLiner: `Offline ${suffix}`,
      url: `https://waffo-${suffix.toLowerCase().replaceAll(" ", "-")}.test`,
    },
    NOW,
  );
}

function metadataFromCreate(call: { body: Record<string, unknown> }): Record<string, string> {
  return call.body.metadata as Record<string, string>;
}

function eventForCreate(
  call: { body: Record<string, unknown> },
  ids: { delivery?: string; order?: string; payment?: string } = {},
  dataOverrides: Record<string, unknown> = {},
  eventOverrides: Record<string, unknown> = {},
) {
  const metadata = metadataFromCreate(call);
  const amount = (call.body.priceSnapshot as { amount: string }).amount;
  return signedWebhook(
    {
      orderId: ids.order ?? "ORD_1",
      paymentId: ids.payment ?? "PAY_1",
      amount,
      subtotal: amount,
      orderMerchantExternalId: call.body.orderMerchantExternalId,
      orderMetadata: metadata,
      ...dataOverrides,
    },
    { eventId: ids.payment ?? "PAY_1", ...eventOverrides },
    ids.delivery ?? `del_${metadata.intentId}`,
  );
}

async function rejectsCode(action: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(action, (error: unknown) =>
    error instanceof Error && (error as Error & { code?: string }).code === code,
  );
}

function makePort(
  db: AppDb,
  calls: Array<{ url: string; body: Record<string, unknown> }>,
  mode: FetchMode = "success",
  databasePath?: string,
  timeoutMs?: number,
): WaffoLive {
  return createPaymentPort(db, {
    env: env("waffo-test", databasePath),
    fetch: providerFetch(calls, mode),
    now: () => NOW,
    timeoutMs,
    databasePath,
  }) as WaffoLive;
}

test("Waffo factory is explicit and fixture has zero provider calls", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  assert.throws(
    () => createPaymentPort(db, { env: { WAFFO_LIVE: "1" } }),
    /WAFFO_LIVE is obsolete/,
  );
  let calls = 0;
  const fixture = createPaymentPort(db, {
    env: { WAFFO_MODE: "fixture" },
    fetch: (async () => {
      calls += 1;
      throw new Error("fixture must not fetch");
    }) as typeof fetch,
  });
  assert.equal(fixture.kind, "fixture");
  const listing = makeListing(db, "Fixture");
  await fixture.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
  assert.equal(calls, 0);
});

test("Waffo test/prod startup fails closed for missing or conflicting live config", () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  assert.throws(
    () => createPaymentPort(db, { env: env("waffo-prod") }),
    /waffo-prod requires an explicit durable DATABASE_PATH/,
  );
  assert.throws(
    () =>
      createPaymentPort(db, {
        env: { ...env("waffo-test"), WAFFO_PRIVATE_KEY: "", WAFFO_PRIVATE_KEY_FILE: "" },
      }),
    /BLOCKED-SECRET: WAFFO_PRIVATE_KEY/,
  );
  assert.throws(
    () =>
      createPaymentPort(db, {
        env: { ...env("waffo-test"), POLAR_FIXTURE_ONLY: "1" },
      }),
    /POLAR_FIXTURE_ONLY is obsolete/,
  );
  assert.throws(
    () => createPaymentPort(db, { env: { WAFFO_MODE: "staging" } }),
    /WAFFO_MODE must be fixture, waffo-test, or waffo-prod/,
  );
  assert.throws(
    () =>
      createPaymentPort(db, {
        env: { ...env("waffo-test"), PAYMENT_MODE: "fixture" },
      }),
    /PAYMENT_MODE is obsolete/,
  );
  assert.throws(
    () => createPaymentPort(db, { env: { ...env("waffo-test"), POLAR_LIVE: "1" } }),
    /POLAR_LIVE is obsolete/,
  );
});

test("Waffo webhook readiness is mode-scoped and parses the configured RSA key", () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const genericOnly = env("waffo-test");
  delete genericOnly.WAFFO_WEBHOOK_TEST_PUBLIC_KEY;
  delete genericOnly.WAFFO_WEBHOOK_PROD_PUBLIC_KEY;
  genericOnly.WAFFO_WEBHOOK_PUBLIC_KEY = publicKey;
  assert.throws(
    () => createPaymentPort(db, { env: genericOnly }),
    /BLOCKED-SECRET: WAFFO_WEBHOOK_TEST_PUBLIC_KEY/,
  );
  assert.throws(
    () => createPaymentPort(db, { env: { ...env("waffo-test"), WAFFO_WEBHOOK_TEST_PUBLIC_KEY: "not-a-key" } }),
    /BLOCKED-SECRET: WAFFO_WEBHOOK_TEST_PUBLIC_KEY/,
  );
});

test("Waffo checkout persists intent before exact SDK params and never ranks from return", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  const listing = makeListing(db, "First");
  const started = await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
  assert.equal(calls[0]?.url, "https://waffo.test/v1/actions/checkout/create-session");
  assert.equal(
    started.url,
    `https://pancake.waffo.ai/store/${CHECKOUT_SLUG}/checkout/${started.checkoutId}`,
  );
  assert.deepEqual(calls[0]?.body.priceSnapshot, { amount: "5.00", taxCategory: "digital_goods" });
  assert.equal(calls[0]?.body.productId, PRODUCT);
  assert.equal(calls[0]?.body.currency, "USD");
  assert.equal(calls[0]?.body.orderMerchantExternalId, waffo.getCheckout(started.checkoutId)?.intentId);
  assert.match(String(calls[0]?.body.successUrl), /\/checkout\/complete\?intent=/);
  const metadata = metadataFromCreate(calls[0]!);
  assert.equal(metadata.intentId, waffo.getCheckout(started.checkoutId)?.intentId);
  assert.equal(metadata.chargeCents, "500");
  assert.equal(metadata.targetBidCents, "500");
  assert.equal(metadata.productId, PRODUCT);
  assert.equal(metadata.mode, "waffo-test");
  assert.equal(getBid(db, listing.id, WEEK), undefined);
  const app = await buildApp({ db, payment: waffo, now: () => NOW });
  after(() => app.close());
  const returnPage = checkoutReturnKind(waffo, { intent: waffo.getCheckout(started.checkoutId)?.intentId });
  assert.equal(returnPage.kind, "pending");
  assert.equal(getBid(db, listing.id, WEEK), undefined);
});

test("Waffo only accepts a hosted session URL bound to a usable future expiry", async () => {
  for (const mode of [
    "root-url",
    "query-url",
    "default-port-url",
    "legacy-url",
    "wrong-session-url",
    "expired",
  ] as const) {
    const db = openDatabase(":memory:");
    after(() => db.close());
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const waffo = makePort(db, calls, mode);
    const listing = makeListing(db, `Checkout response ${mode}`);
    await rejectsCode(
      () => waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 }),
      "waffo_unavailable",
    );
    const row = db
      .prepare<{ id: string }, { status: string }>(
        "SELECT status FROM waffo_checkout_intents WHERE listing_id = @id",
      )
      .get({ id: listing.id });
    assert.equal(row?.status, "unknown", mode);
  }
});

test("canonical Waffo webhook route accepts raw signed delivery and Polar route is inert", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  const listing = makeListing(db, "Canonical webhook route");
  await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
  const hook = eventForCreate(calls[0]!, { delivery: "del_canonical_route" });
  const app = await buildApp({ db, payment: waffo, now: () => NOW });
  after(() => app.close());
  const canonical = await app.inject({
    method: "POST",
    url: "/api/webhooks/waffo",
    headers: { ...hook.headers, "content-type": "application/json" },
    payload: hook.raw,
  });
  assert.equal(canonical.statusCode, 200);
  assert.equal(canonical.json().status, "paid");
  assert.equal(getBid(db, listing.id, WEEK)?.amountUsd, 5);

  const obsolete = await app.inject({
    method: "POST",
    url: "/webhooks/polar",
    payload: hook.raw,
  });
  assert.equal(obsolete.statusCode, 404);
});

test("Waffo verified order.completed settles atomically and exact replay is a no-op", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  const listing = makeListing(db, "Paid");
  const started = await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
  const hook = eventForCreate(calls[0]!, { delivery: "del_paid" });
  const paid = await waffo.handleWebhook(hook.raw, hook.headers, NOW.toISOString());
  assert.equal(paid.status, "paid");
  assert.equal(getBid(db, listing.id, WEEK)?.amountUsd, 5);
  assert.equal(rankedBoard(db, NOW)[0]?.id, listing.id);
  const replay = await waffo.handleWebhook(hook.raw, hook.headers, NOW.toISOString());
  assert.equal(replay.status, "duplicate");
  assert.equal(rankedBoard(db, NOW).length, 1);
  const event = db.prepare<{ id: string }, { outcome: string }>("SELECT outcome FROM waffo_checkout_events WHERE delivery_id = @id").get({ id: "del_paid" });
  assert.equal(event?.outcome, "accepted");
  assert.equal(started.checkoutId, waffo.getCheckout(started.checkoutId)?.checkoutId);
});

test("Waffo rejects altered replay, wrong metadata, wrong amount, and unknown intent without rank", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  const listing = makeListing(db, "Negatives");
  await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
  const first = eventForCreate(calls[0]!, { delivery: "del_negative" }, { orderMetadata: { ...metadataFromCreate(calls[0]!), company: "forged" } });
  await rejectsCode(() => waffo.handleWebhook(first.raw, first.headers, NOW.toISOString()), "checkout_mismatch");
  assert.equal(getBid(db, listing.id, WEEK), undefined);
  const altered = eventForCreate(calls[0]!, { delivery: "del_negative" }, { orderMetadata: metadataFromCreate(calls[0]!) });
  await rejectsCode(() => waffo.handleWebhook(altered.raw, altered.headers, NOW.toISOString()), "replay_rejected");
  const unknown = signedWebhook(
    { orderMerchantExternalId: "not-a-local-intent", orderMetadata: {}, orderId: "ORD_UNKNOWN", paymentId: "PAY_UNKNOWN" },
    { eventId: "PAY_UNKNOWN" },
    "del_unknown",
  );
  await rejectsCode(() => waffo.handleWebhook(unknown.raw, unknown.headers, NOW.toISOString()), "unknown_checkout");
  assert.equal(getBid(db, listing.id, WEEK), undefined);
  const attempts = db.prepare<{ id: string }, { count: number }>("SELECT count(*) AS count FROM waffo_webhook_attempts WHERE delivery_id = @id").get({ id: "del_negative" });
  assert.equal(attempts?.count, 2);
});

test("Waffo rejects wrong event mode, store, status, payment, currency, and type", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  const cases: Array<{
    label: string;
    data?: Record<string, unknown>;
    event?: Record<string, unknown>;
    reconcile?: boolean;
  }> = [
    { label: "mode", event: { mode: "prod" } },
    { label: "store", event: { storeId: `STO_${"T".repeat(22)}` } },
    { label: "type", event: { eventType: "order.created" } },
    { label: "order-status", data: { orderStatus: "pending" } },
    { label: "payment-status", data: { paymentStatus: "failed" } },
    { label: "currency", data: { currency: "EUR" } },
    { label: "amount", data: { amount: "6.00", subtotal: "6.00" }, reconcile: true },
    { label: "metadata", data: { orderMetadata: { company: "forged" } } },
  ];
  for (const item of cases) {
    const listing = makeListing(db, `Mismatch ${item.label}`);
    await waffo.createCheckout({
      listingId: listing.id,
      weekId: WEEK,
      chargeUsd: 5,
      nextUsd: 5,
    });
    const call = calls.at(-1)!;
    const hook = eventForCreate(
      call,
      {
        delivery: `del_mismatch_${item.label}`,
        order: `ORD_MISMATCH_${item.label}`,
        payment: `PAY_MISMATCH_${item.label}`,
      },
      item.data ?? {},
      item.event ?? {},
    );
    if (item.reconcile) {
      assert.equal(
        (await waffo.handleWebhook(hook.raw, hook.headers, NOW.toISOString())).status,
        "needs_reconciliation",
      );
    } else {
      await rejectsCode(
        () => waffo.handleWebhook(hook.raw, hook.headers, NOW.toISOString()),
        "checkout_mismatch",
      );
    }
    assert.equal(getBid(db, listing.id, WEEK), undefined, item.label);
  }
});

test("Waffo SDK verification rejects a bad signature and stale timestamp before ledger/rank", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  const listing = makeListing(db, "Signature");
  await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
  const call = calls[0]!;
  const valid = eventForCreate(call, { delivery: "del_signature" });
  await rejectsCode(
    () =>
      waffo.handleWebhook(
        valid.raw,
        { ...valid.headers, "X-Waffo-Signature": "t=1,v1=not-a-signature" },
        NOW.toISOString(),
      ),
    "invalid_webhook",
  );
  const body = JSON.parse(valid.raw) as { data: Record<string, unknown>; eventId: string };
  const stale = signedWebhook(
    body.data,
    { eventId: body.eventId },
    "del_stale_signature",
    "1",
  );
  await rejectsCode(
    () => waffo.handleWebhook(stale.raw, stale.headers, NOW.toISOString()),
    "invalid_webhook",
  );
  assert.equal(getBid(db, listing.id, WEEK), undefined);
  const rows = db
    .prepare<[], { count: number }>("SELECT count(*) AS count FROM waffo_checkout_events")
    .get();
  assert.equal(rows?.count, 0);
});

test("Waffo ambiguous provider outcomes remain recoverable, while definitive 4xx is rejected", async () => {
  for (const mode of [
    "timeout",
    "bad-response",
    "bad-url",
    "non-json",
    "ambiguous-408",
    "ambiguous-409",
    "ambiguous-425",
    "ambiguous-429",
    "rejected",
  ] as const) {
    const db = openDatabase(":memory:");
    after(() => db.close());
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const waffo = makePort(db, calls, mode);
    const listing = makeListing(db, `Create ${mode}`);
    await rejectsCode(
      () => waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 }),
      mode === "rejected" ? "waffo_rejected" : "waffo_unavailable",
    );
    const row = db.prepare<{ id: string }, { status: string }>("SELECT status FROM waffo_checkout_intents WHERE listing_id = @id").get({ id: listing.id });
    assert.equal(row?.status, mode === "rejected" ? "rejected" : "unknown");
  }
});

test("Waffo provider deadline covers a response body that never completes", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls, "body-timeout", undefined, 25);
  const listing = makeListing(db, "Body timeout");
  const started = Date.now();
  await rejectsCode(
    () => waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 }),
    "waffo_unavailable",
  );
  assert.ok(Date.now() - started < 500, "provider body deadline should be bounded");
  const row = db
    .prepare<{ id: string }, { status: string }>(
      "SELECT status FROM waffo_checkout_intents WHERE listing_id = @id",
    )
    .get({ id: listing.id });
  assert.equal(row?.status, "unknown");
});

test("Waffo restart repairs an interrupted creating intent without releasing or ranking", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "waffo-pitch-orphan-")), "state.sqlite");
  const dbOne = openDatabase(path);
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const interruptedFetch = (async (input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url: String(input), body });
    return new Promise<Response>(() => {});
  }) as typeof fetch;
  const waffoOne = createPaymentPort(dbOne, {
    env: env("waffo-test", path),
    fetch: interruptedFetch,
    now: () => NOW,
    timeoutMs: 5,
    databasePath: path,
  }) as WaffoLive;
  const listing = makeListing(dbOne, "Interrupted");
  const pending = waffoOne.createCheckout({
    listingId: listing.id,
    weekId: WEEK,
    chargeUsd: 5,
    nextUsd: 5,
  });
  assert.equal(calls.length, 1);
  const intent = dbOne
    .prepare<{ id: string }, { intentId: string; status: string; fingerprint: string }>(
      "SELECT intent_id AS intentId, status, intent_fingerprint AS fingerprint FROM waffo_checkout_intents WHERE listing_id = @id",
    )
    .get({ id: listing.id });
  assert.ok(intent);
  assert.equal(intent.status, "creating");
  assert.ok(intent.fingerprint.length > 0);

  const dbTwo = openDatabase(path);
  const waffoTwo = makePort(dbTwo, [], "success", path);
  after(async () => {
    dbTwo.close();
    dbOne.close();
  });
  const recovered = dbTwo
    .prepare<{ id: string }, { status: string; checkoutId: string | null; reason: string | null }>(
      "SELECT status, provider_checkout_id AS checkoutId, failure_reason AS reason FROM waffo_checkout_intents WHERE listing_id = @id",
    )
    .get({ id: listing.id });
  assert.equal(recovered?.status, "unknown");
  assert.equal(recovered?.checkoutId, null);
  assert.match(recovered?.reason ?? "", /interrupted/);
  assert.equal(rankedBoard(dbTwo, NOW).length, 0);

  await rejectsCode(
    () => waffoTwo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 }),
    "checkout_in_progress",
  );

  const hook = eventForCreate(calls[0]!, {
    delivery: "del_orphan_recovered",
    order: "ORD_ORPHAN_RECOVERED",
    payment: "PAY_ORPHAN_RECOVERED",
  });
  const settled = await waffoTwo.handleWebhook(hook.raw, hook.headers, NOW.toISOString());
  assert.equal(settled.status, "paid");
  assert.equal(getBid(dbTwo, listing.id, WEEK)?.amountUsd, 5);

  await rejectsCode(() => pending, "waffo_unavailable");
});

test("Waffo stale captured raise becomes reconciliation and never compounds to $19", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  const listing = makeListing(db, "Stale");
  await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
  const first = eventForCreate(calls[0]!, { delivery: "del_stale_first", order: "ORD_STALE_1", payment: "PAY_STALE_1" });
  await waffo.handleWebhook(first.raw, first.headers, NOW.toISOString());
  const raise = await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 7, nextUsd: 12 });
  const raiseCall = calls[1]!;
  // Release the first pending raise only to model two previously-created
  // provider intents; the immutable quote still records base=$5.
  const raiseIntent = waffo.getCheckout(raise.checkoutId)?.intentId;
  const released = db.prepare("UPDATE waffo_checkout_intents SET status = 'rejected' WHERE intent_id = ?").run(raiseIntent);
  assert.equal(released.changes, 1);
  const duplicateRaise = await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 7, nextUsd: 12 });
  const secondCall = calls[2]!;
  db.prepare("UPDATE waffo_checkout_intents SET status = 'rejected' WHERE intent_id = ?").run(waffo.getCheckout(duplicateRaise.checkoutId)!.intentId);
  db.prepare("UPDATE waffo_checkout_intents SET status = 'open' WHERE intent_id = ?").run(raiseIntent);
  const firstRaise = eventForCreate(raiseCall, { delivery: "del_stale_raise_1", order: "ORD_STALE_2", payment: "PAY_STALE_2" });
  assert.equal((await waffo.handleWebhook(firstRaise.raw, firstRaise.headers, NOW.toISOString())).status, "paid");
  db.prepare("UPDATE waffo_checkout_intents SET status = 'open' WHERE intent_id = ?").run(waffo.getCheckout(duplicateRaise.checkoutId)!.intentId);
  const secondRaise = eventForCreate(secondCall, { delivery: "del_stale_raise_2", order: "ORD_STALE_3", payment: "PAY_STALE_3" });
  const needs = await waffo.handleWebhook(secondRaise.raw, secondRaise.headers, NOW.toISOString());
  assert.equal(needs.status, "needs_reconciliation");
  assert.equal(getBid(db, listing.id, WEEK)?.amountUsd, 12);
  const secondRow = db.prepare<{ id: string }, { status: string }>("SELECT status FROM waffo_checkout_intents WHERE intent_id = @id").get({ id: waffo.getCheckout(duplicateRaise.checkoutId)!.intentId! });
  assert.equal(secondRow?.status, "needs_reconciliation");
});

test("Waffo rank rollback is durable reconciliation, and DB reopen settles once", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "waffo-pitch-")), "state.sqlite");
  const db = openDatabase(path);
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls, "success", path);
  const listing = makeListing(db, "Restart");
  const started = await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
  db.exec("CREATE TRIGGER reject_waffo_bid BEFORE INSERT ON bids BEGIN SELECT RAISE(ABORT, 'injected rollback'); END");
  const failed = eventForCreate(calls[0]!, { delivery: "del_rollback", order: "ORD_ROLLBACK", payment: "PAY_ROLLBACK" });
  const result = await waffo.handleWebhook(failed.raw, failed.headers, NOW.toISOString());
  assert.equal(result.status, "needs_reconciliation");
  assert.equal(getBid(db, listing.id, WEEK), undefined);
  const failedIntent = db.prepare<{ id: string }, { status: string }>("SELECT status FROM waffo_checkout_intents WHERE intent_id = @id").get({ id: waffo.getCheckout(started.checkoutId)!.intentId! });
  assert.equal(failedIntent?.status, "needs_reconciliation");
  db.exec("DROP TRIGGER reject_waffo_bid");
  const dbTwo = openDatabase(path);
  after(() => {
    dbTwo.close();
    db.close();
  });
  const waffoTwo = makePort(dbTwo, calls, "success", path);
  const replay = await waffoTwo.handleWebhook(failed.raw, failed.headers, NOW.toISOString());
  assert.equal(replay.status, "needs_reconciliation");
  assert.equal(rankedBoard(dbTwo, NOW).length, 0);
});

test("Waffo shared DB serializes two-instance delivery and canonicalizes offset timestamps", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "waffo-pitch-two-")), "state.sqlite");
  const dbOne = openDatabase(path);
  const dbTwo = openDatabase(path);
  after(() => {
    dbTwo.close();
    dbOne.close();
  });
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffoOne = makePort(dbOne, calls, "success", path);
  const waffoTwo = makePort(dbTwo, calls, "success", path);
  const listing = makeListing(dbOne, "Two instances");
  const started = await waffoOne.createCheckout({
    listingId: listing.id,
    weekId: WEEK,
    chargeUsd: 5,
    nextUsd: 5,
  });
  const original = eventForCreate(calls[0]!, {
    delivery: "del_two_instances",
    order: "ORD_TWO_INSTANCES",
    payment: "PAY_TWO_INSTANCES",
  });
  const originalBody = JSON.parse(original.raw) as {
    data: Record<string, unknown>;
    eventId: string;
  };
  const offset = signedWebhook(
    originalBody.data,
    {
      eventId: originalBody.eventId,
      timestamp: "2026-08-19T14:00:00+02:00",
    },
    "del_two_instances",
  );
  const results = await Promise.all([
    waffoOne.handleWebhook(offset.raw, offset.headers, NOW.toISOString()),
    waffoTwo.handleWebhook(offset.raw, offset.headers, NOW.toISOString()),
  ]);
  assert.deepEqual(
    results.map((result) => result.status).sort(),
    ["duplicate", "paid"],
  );
  assert.equal(getBid(dbTwo, listing.id, WEEK)?.amountUsd, 5);
  assert.equal(getBid(dbTwo, listing.id, WEEK)?.paidAt, NOW.toISOString());
  assert.equal(rankedBoard(dbTwo, NOW).length, 1);
  const eventCount = dbTwo
    .prepare<[], { count: number }>("SELECT count(*) AS count FROM waffo_checkout_events")
    .get();
  assert.equal(eventCount?.count, 1);
  assert.equal(started.checkoutId, waffoTwo.getCheckout(started.checkoutId)?.checkoutId);
});

test("Waffo business replay ignores only the signed delivery id", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  const listing = makeListing(db, "Fresh delivery replay");
  await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
  const first = eventForCreate(calls[0]!, {
    delivery: "del_fresh_delivery",
    order: "ORD_FRESH_DELIVERY",
    payment: "PAY_FRESH_DELIVERY",
  });
  assert.equal((await waffo.handleWebhook(first.raw, first.headers, NOW.toISOString())).status, "paid");

  const original = JSON.parse(first.raw) as {
    data: Record<string, unknown>;
    eventId: string;
    timestamp: string;
  };
  const retry = signedWebhook(
    original.data,
    { eventId: original.eventId, timestamp: original.timestamp },
    "del_fresh_delivery_retry",
  );
  assert.equal(
    (await waffo.handleWebhook(retry.raw, retry.headers, NOW.toISOString())).status,
    "duplicate",
  );
  const eventCount = db
    .prepare<[], { count: number }>("SELECT count(*) AS count FROM waffo_checkout_events")
    .get();
  assert.equal(eventCount?.count, 1);
  assert.equal(rankedBoard(db, NOW).length, 1);
});

test("Waffo reserves rejected identities so a corrected payload cannot settle", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  const listing = makeListing(db, "Rejected identity");
  await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
  const metadata = metadataFromCreate(calls[0]!);
  const rejected = eventForCreate(
    calls[0]!,
    { delivery: "del_rejected_identity", order: "ORD_REJECTED_ID", payment: "PAY_REJECTED_ID" },
    { orderMetadata: { ...metadata, company: "forged" } },
  );
  await rejectsCode(
    () => waffo.handleWebhook(rejected.raw, rejected.headers, NOW.toISOString()),
    "checkout_mismatch",
  );
  const corrected = eventForCreate(
    calls[0]!,
    { delivery: "del_corrected_identity", order: "ORD_REJECTED_ID", payment: "PAY_REJECTED_ID" },
    { orderMetadata: metadata },
  );
  await rejectsCode(
    () => waffo.handleWebhook(corrected.raw, corrected.headers, NOW.toISOString()),
    "replay_rejected",
  );
  assert.equal(getBid(db, listing.id, WEEK), undefined);
  const event = db
    .prepare<{ id: string }, { outcome: string }>(
      "SELECT outcome FROM waffo_checkout_events WHERE delivery_id = @id",
    )
    .get({ id: "del_rejected_identity" });
  assert.equal(event?.outcome, "rejected");
  const attempt = db
    .prepare<{ id: string }, { outcome: string; reason: string | null }>(
      "SELECT outcome, reason FROM waffo_webhook_attempts WHERE delivery_id = @id ORDER BY attempt_id DESC LIMIT 1",
    )
    .get({ id: "del_corrected_identity" });
  assert.equal(attempt?.outcome, "rejected");
  assert.match(attempt?.reason ?? "", /altered provider identity replay/);
});

test("Waffo durably rejects incomplete product facts and extra metadata", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  for (const label of [
    "missing product name",
    "missing direct product",
    "wrong direct product",
    "extra metadata",
  ] as const) {
    const listing = makeListing(db, `Provider fact ${label}`);
    await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
    const call = calls.at(-1)!;
    const data = label === "extra metadata"
      ? { orderMetadata: { ...metadataFromCreate(call), extra: "not-configured" } }
      : label === "missing direct product"
        ? { productId: undefined }
        : label === "wrong direct product"
          ? { productId: `PROD_${"X".repeat(22)}` }
          : { productName: undefined };
    const ids = {
      delivery: `del_provider_fact_${label.replaceAll(" ", "_")}`,
      order: `ORD_PROVIDER_FACT_${label.replaceAll(" ", "_")}`,
      payment: `PAY_PROVIDER_FACT_${label.replaceAll(" ", "_")}`,
    };
    const hook = eventForCreate(
      call,
      ids,
      data,
    );
    await rejectsCode(
      () => waffo.handleWebhook(hook.raw, hook.headers, NOW.toISOString()),
      "checkout_mismatch",
    );
    const event = db
      .prepare<{ id: string }, { outcome: string }>(
        "SELECT outcome FROM waffo_checkout_events WHERE delivery_id = @id",
      )
      .get({ id: ids.delivery });
    assert.equal(event?.outcome, "rejected", label);
    if (label === "missing direct product" || label === "wrong direct product") {
      const corrected = eventForCreate(call, { ...ids, delivery: `${ids.delivery}_corrected` }, { productId: PRODUCT });
      await rejectsCode(
        () => waffo.handleWebhook(corrected.raw, corrected.headers, NOW.toISOString()),
        "replay_rejected",
      );
      assert.equal(getBid(db, listing.id, WEEK), undefined, `${label} corrected payload`);
    }
  }
});

test("Waffo reserves a signed partial identity before refusing a corrected replay", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  const listing = makeListing(db, "Partial identity");
  await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
  const partial = eventForCreate(
    calls[0]!,
    { delivery: "del_partial_identity", order: "ORD_PARTIAL", payment: "PAY_PARTIAL" },
    {},
    { eventId: undefined },
  );
  await rejectsCode(
    () => waffo.handleWebhook(partial.raw, partial.headers, NOW.toISOString()),
    "checkout_mismatch",
  );
  const corrected = eventForCreate(
    calls[0]!,
    { delivery: "del_partial_corrected", order: "ORD_PARTIAL", payment: "PAY_PARTIAL" },
  );
  await rejectsCode(
    () => waffo.handleWebhook(corrected.raw, corrected.headers, NOW.toISOString()),
    "replay_rejected",
  );
  assert.equal(getBid(db, listing.id, WEEK), undefined);
  const eventCount = db
    .prepare<[], { count: number }>("SELECT count(*) AS count FROM waffo_checkout_events")
    .get();
  assert.equal(eventCount?.count, 1);
  const event = db
    .prepare<{ id: string }, { outcome: string; event_id: string }>(
      "SELECT outcome, event_id FROM waffo_checkout_events WHERE delivery_id = @id",
    )
    .get({ id: "del_partial_identity" });
  assert.equal(event?.outcome, "rejected");
  assert.match(event?.event_id ?? "", /^invalid-event-/);
});

test("Waffo reconciles inconsistent or malformed captured money before ranking", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  const cases: Array<{ label: string; data: Record<string, unknown> }> = [
    {
      label: "inflated amount and total",
      data: { amount: "999.00", subtotal: "5.00", taxAmount: "0.00", total: "999.00" },
    },
    {
      label: "malformed total",
      data: { amount: "5.00", subtotal: "5.00", taxAmount: "0.00", total: "not-money" },
    },
  ];
  for (const item of cases) {
    const listing = makeListing(db, `Money ${item.label}`);
    await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
    const hook = eventForCreate(
      calls.at(-1)!,
      {
        delivery: `del_money_${item.label.replaceAll(" ", "_")}`,
        order: `ORD_MONEY_${item.label.replaceAll(" ", "_")}`,
        payment: `PAY_MONEY_${item.label.replaceAll(" ", "_")}`,
      },
      item.data,
    );
    assert.equal(
      (await waffo.handleWebhook(hook.raw, hook.headers, NOW.toISOString())).status,
      "needs_reconciliation",
    );
    assert.equal(getBid(db, listing.id, WEEK), undefined, item.label);
    const intent = db
      .prepare<{ id: string }, { status: string }>(
        "SELECT status FROM waffo_checkout_intents WHERE listing_id = @id",
      )
      .get({ id: listing.id });
    assert.equal(intent?.status, "needs_reconciliation", item.label);
  }
});

test("Waffo accepts a fully consistent taxed subtotal without ranking the tax", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  const listing = makeListing(db, "Taxed");
  await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
  const hook = eventForCreate(
    calls[0]!,
    { delivery: "del_taxed", order: "ORD_TAXED", payment: "PAY_TAXED" },
    { subtotal: "5.00", taxAmount: "0.50", amount: "5.50", total: "5.50" },
  );
  assert.equal((await waffo.handleWebhook(hook.raw, hook.headers, NOW.toISOString())).status, "paid");
  assert.equal(getBid(db, listing.id, WEEK)?.amountUsd, 5);
});

test("Waffo accepts tax-exclusive subtotal and keeps buyer tax out of the bid", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  const listing = makeListing(db, "Tax exclusive");
  await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
  const hook = eventForCreate(
    calls[0]!,
    { delivery: "del_tax_exclusive", order: "ORD_TAX_EXCLUSIVE", payment: "PAY_TAX_EXCLUSIVE" },
    { subtotal: "5.00", taxAmount: "1.00", amount: "5.00", total: "6.00" },
  );
  assert.equal((await waffo.handleWebhook(hook.raw, hook.headers, NOW.toISOString())).status, "paid");
  assert.equal(getBid(db, listing.id, WEEK)?.amountUsd, 5);
});

test("Waffo keeps out-of-window provider timestamps off the ranking", async () => {
  for (const [label, timestamp] of [
    ["old", "2000-01-01T00:00:00.000Z"],
    ["future", "2099-01-01T00:00:00.000Z"],
  ] as const) {
    const db = openDatabase(":memory:");
    after(() => db.close());
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const waffo = makePort(db, calls);
    const listing = makeListing(db, `Timestamp ${label}`);
    await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
    const hook = eventForCreate(
      calls[0]!,
      { delivery: `del_timestamp_${label}`, order: `ORD_TIMESTAMP_${label}`, payment: `PAY_TIMESTAMP_${label}` },
      {},
      { timestamp },
    );
    await rejectsCode(
      () => waffo.handleWebhook(hook.raw, hook.headers, NOW.toISOString()),
      "checkout_mismatch",
    );
    assert.equal(getBid(db, listing.id, WEEK), undefined, label);
    const event = db
      .prepare<{ id: string }, { outcome: string }>(
        "SELECT outcome FROM waffo_checkout_events WHERE delivery_id = @id",
      )
      .get({ id: `del_timestamp_${label}` });
    assert.equal(event?.outcome, "rejected", label);
  }
});

test("Waffo reconciles an in-window provider timestamp before intent creation", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  const listing = makeListing(db, "Causal timestamp");
  await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
  const hook = eventForCreate(
    calls[0]!,
    { delivery: "del_timestamp_before_intent", order: "ORD_TIMESTAMP_BEFORE", payment: "PAY_TIMESTAMP_BEFORE" },
    {},
    { timestamp: "2026-08-19T11:59:00.000Z" },
  );
  const result = await waffo.handleWebhook(hook.raw, hook.headers, NOW.toISOString());
  assert.equal(result.status, "needs_reconciliation");
  assert.equal(getBid(db, listing.id, WEEK), undefined);
  const state = db
    .prepare<{ id: string }, { status: string; reason: string | null }>(
      "SELECT status, failure_reason AS reason FROM waffo_checkout_intents WHERE listing_id = @id",
    )
    .get({ id: listing.id });
  assert.equal(state?.status, "needs_reconciliation");
  assert.match(state?.reason ?? "", /predates the local checkout intent/);
});

test("Waffo exact replay of a rejected delivery is a durable no-op", async () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = makePort(db, calls);
  const listing = makeListing(db, "Rejected replay");
  await waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 });
  const hook = eventForCreate(
    calls[0]!,
    { delivery: "del_rejected_replay", order: "ORD_REJECTED_REPLAY", payment: "PAY_REJECTED_REPLAY" },
    { orderMetadata: { ...metadataFromCreate(calls[0]!), company: "forged" } },
  );
  await rejectsCode(
    () => waffo.handleWebhook(hook.raw, hook.headers, NOW.toISOString()),
    "checkout_mismatch",
  );
  const retry = await waffo.handleWebhook(hook.raw, hook.headers, NOW.toISOString());
  assert.equal(retry.status, "duplicate");
  assert.equal(getBid(db, listing.id, WEEK), undefined);
});

test("Waffo production and legacy selectors fail closed without creating fixture rank", () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const listing = makeListing(db, "Production selector");
  const cases: Array<{ label: string; env: Record<string, string>; message: RegExp }> = [
    {
      label: "production fixture",
      env: { NODE_ENV: "production", WAFFO_MODE: "fixture" },
      message: /production requires WAFFO_MODE=waffo-prod/,
    },
    {
      label: "production test",
      env: { NODE_ENV: "production", WAFFO_MODE: "waffo-test" },
      message: /production requires WAFFO_MODE=waffo-prod/,
    },
    {
      label: "legacy selector",
      env: { NODE_ENV: "production", WAFFO_MODE: "fixture", POLAR_FIXTURE_ONLY: "1" },
      message: /POLAR_FIXTURE_ONLY is obsolete/,
    },
  ];
  for (const item of cases) {
    assert.throws(() => createPaymentPort(db, { env: item.env }), item.message, item.label);
  }
  assert.equal(getBid(db, listing.id, WEEK), undefined);
});

test("Waffo production requires durable DB, safe origins, and one product before network", () => {
  const db = openDatabase(":memory:");
  after(() => db.close());
  const production = env("waffo-prod", join(mkdtempSync(join(tmpdir(), "waffo-prod-")), "state.sqlite"));
  assert.throws(
    () => createPaymentPort(db, { env: { ...production, DATABASE_PATH: "" } }),
    /explicit durable DATABASE_PATH/,
  );
  assert.throws(
    () => createPaymentPort(db, { env: { ...production, WAFFO_API_BASE: "http://api.waffo.ai" } }),
    /official HTTPS Waffo API origin/,
  );
  assert.throws(
    () => createPaymentPort(db, { env: { ...production, PUBLIC_BASE_URL: "http://pitch.example.com" } }),
    /public HTTPS URL/,
  );
  assert.throws(
    () => createPaymentPort(db, { env: { ...production, PUBLIC_BASE_URL: "https://localhost:3000" } }),
    /public HTTPS URL/,
  );
  assert.throws(
    () => createPaymentPort(db, { env: { ...production, PUBLIC_BASE_URL: "https://localhost." } }),
    /public HTTPS URL/,
  );
  assert.throws(
    () => createPaymentPort(db, { env: { ...production, PUBLIC_BASE_URL: "https://pitch-first-slot.app:443" } }),
    /public HTTPS URL/,
  );
  assert.throws(
    () => createPaymentPort(db, { env: { ...production, PUBLIC_BASE_URL: "https://pitch-first-slot.app/return" } }),
    /public HTTPS URL/,
  );
  assert.throws(
    () => createPaymentPort(db, { env: { ...production, PUBLIC_BASE_URL: "https://127.0.0.1:3000" } }),
    /public HTTPS URL/,
  );
  assert.throws(
    () => createPaymentPort(db, { env: { ...production, PUBLIC_BASE_URL: "https://pitch.example.com" } }),
    /approved/,
  );
  assert.throws(
    () => createPaymentPort(db, { env: { ...production, DATABASE_PATH: "file::memory:?cache=shared" } }),
    /explicit durable DATABASE_PATH/,
  );
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  assert.throws(
    () => createPaymentPort(db, {
      env: { ...env("waffo-test"), WAFFO_PRODUCT_ID: "" },
      fetch: providerFetch(calls),
    }),
    /WAFFO_PRODUCT_ID/,
  );
  assert.equal(calls.length, 0);
});

test("Waffo production never redirects to an unapproved hosted-checkout origin", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "waffo-checkout-origin-")), "state.sqlite");
  const db = openDatabase(path);
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = createPaymentPort(db, {
    env: env("waffo-prod", path),
    fetch: providerFetch(calls, "unapproved-url"),
    now: () => NOW,
    databasePath: path,
  });
  const listing = makeListing(db, "Unsafe checkout origin");
  await rejectsCode(
    () => waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 }),
    "waffo_unavailable",
  );
  assert.equal(calls.length, 1);
  const row = db
    .prepare<{ id: string }, { status: string }>(
      "SELECT status FROM waffo_checkout_intents WHERE listing_id = @id",
    )
    .get({ id: listing.id });
  assert.equal(row?.status, "unknown");
});

test("Waffo never redirects to a cleartext hosted-checkout origin", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "waffo-insecure-checkout-")), "state.sqlite");
  const db = openDatabase(path);
  after(() => db.close());
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const waffo = createPaymentPort(db, {
    env: env("waffo-prod", path),
    fetch: providerFetch(calls, "insecure-url"),
    now: () => NOW,
    databasePath: path,
  });
  const listing = makeListing(db, "Cleartext checkout origin");
  await rejectsCode(
    () => waffo.createCheckout({ listingId: listing.id, weekId: WEEK, chargeUsd: 5, nextUsd: 5 }),
    "waffo_unavailable",
  );
  assert.equal(calls.length, 1);
  const row = db
    .prepare<{ id: string }, { status: string }>(
      "SELECT status FROM waffo_checkout_intents WHERE listing_id = @id",
    )
    .get({ id: listing.id });
  assert.equal(row?.status, "unknown");
});
