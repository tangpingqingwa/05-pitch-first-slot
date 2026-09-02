import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import { WaffoFixture } from "../src/billing/waffo-fixture.js";
import type { PaymentPort } from "../src/billing/port.js";
import { openDatabase, type AppDb } from "../src/db.js";

const SAMPLE_COMPANIES = [
  "Acme",
  "OpenAI",
  "Stripe",
  "Y Combinator",
  "sample startup",
];

const TRACTION_KEYS = ["arr", "mrr", "users", "traction", "growth"];

test("GET / empty week is 200 with zero listings and no sample companies", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/" });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /text\/html/);
  const html = response.body;
  assert.match(html, /The room is empty\./);
  assert.match(html, /This week's first slot is still open\. A confirmed bid takes it\./);
  assert.doesNotMatch(html, /The board is empty/);
  assert.doesNotMatch(html, /No listings this week/);
  assert.match(html, /Opening three minutes/);
  assert.match(html, /Claim rank/);
  assert.doesNotMatch(html, /class="outbid">Outbid<\/button>/);
  assert.doesNotMatch(html, /class="listing"/);
  assert.doesNotMatch(html, /\$[0-9]/);
  assert.doesNotMatch(html, /#1/);
  for (const name of SAMPLE_COMPANIES) {
    assert.doesNotMatch(html, new RegExp(name, "i"));
  }
});

test("POST /listings company + one-liner + https URL appears unranked", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const payload = {
    company: "Helix Labs",
    oneLiner: "Benchtop instruments for small labs",
    url: "https://helix.example/deck",
  };
  const created = await app.inject({
    method: "POST",
    url: "/listings",
    payload,
  });

  assert.equal(created.statusCode, 200);
  const listing = created.json() as {
    id: string;
    company: string;
    oneLiner: string;
    url: string;
    createdAt: string;
  };
  assert.equal(listing.company, payload.company);
  assert.equal(listing.oneLiner, payload.oneLiner);
  assert.equal(listing.url, payload.url);
  assert.ok(listing.id);
  assert.match(listing.createdAt, /Z$/);
  assert.equal("arr" in listing, false);
  assert.equal("users" in listing, false);

  const board = await app.inject({ method: "GET", url: "/" });
  assert.equal(board.statusCode, 200);
  const html = board.body;
  assert.match(html, /Helix Labs/);
  assert.match(html, /Benchtop instruments for small labs/);
  assert.match(html, /https:\/\/helix\.example\/deck/);
  assert.match(html, /Unranked — no paid bid yet/);
  assert.doesNotMatch(html, /The board is empty/);
  assert.doesNotMatch(html, /first slot is still open/);
  assert.doesNotMatch(html, /\$[0-9]/);
  assert.doesNotMatch(html, /#1/);
});

test("POST /listings ignores arr and users and never renders them", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const created = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      company: "Northwind",
      oneLiner: "Invoice tools for wholesalers",
      url: "https://northwind.example",
      arr: "$1.2M",
      users: "10k",
      mrr: 88000,
      traction: "hot",
    },
  });

  assert.equal(created.statusCode, 200);
  const listing = created.json() as Record<string, unknown>;
  assert.equal(listing.company, "Northwind");
  assert.equal(listing.arr, undefined);
  assert.equal(listing.users, undefined);
  assert.equal(listing.mrr, undefined);
  assert.equal(listing.traction, undefined);

  const board = await app.inject({ method: "GET", url: "/" });
  assert.equal(board.statusCode, 200);
  const html = board.body;
  assert.match(html, /Northwind/);
  assert.doesNotMatch(html, /\$1\.2M/);
  assert.doesNotMatch(html, /10k/);
  assert.doesNotMatch(html, /88000/);
  assert.doesNotMatch(html, /\bhot\b/);
  assert.doesNotMatch(html, /\barr\b/i);
  assert.doesNotMatch(html, /\busers\b/i);
  assert.doesNotMatch(html, /\bmrr\b/i);
  assert.doesNotMatch(html, /traction/i);
});

test("POST /listings rejects invalid company, one-liner, and non-https URL", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const tooLongCompany = "x".repeat(81);
  const tooLongOneLiner = "y".repeat(141);

  const missing = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {},
  });
  assert.equal(missing.statusCode, 400);
  assert.equal(missing.json().error, "invalid_company");

  const longCompany = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      company: tooLongCompany,
      oneLiner: "Does a thing",
      url: "https://ok.example",
    },
  });
  assert.equal(longCompany.statusCode, 400);
  assert.equal(longCompany.json().error, "invalid_company");

  const longOneLiner = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      company: "Ok Co",
      oneLiner: tooLongOneLiner,
      url: "https://ok.example",
    },
  });
  assert.equal(longOneLiner.statusCode, 400);
  assert.equal(longOneLiner.json().error, "invalid_one_liner");

  const httpUrl = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      company: "Ok Co",
      oneLiner: "Does a thing",
      url: "http://ok.example",
    },
  });
  assert.equal(httpUrl.statusCode, 400);
  assert.equal(httpUrl.json().error, "invalid_url");
});

test("HTML /listings validates bid and SKU before inserting or starting checkout", async () => {
  const db = openDatabase(":memory:");
  const fixture = new WaffoFixture(db, { autoSettle: false });
  const checkoutInputs: Array<{ chargeUsd: number; nextUsd: number }> = [];
  const payment: PaymentPort = {
    kind: "fixture",
    createCheckout: async (input) => {
      checkoutInputs.push({ chargeUsd: input.chargeUsd, nextUsd: input.nextUsd });
      return fixture.createCheckout(input);
    },
    applyPaid: fixture.applyPaid.bind(fixture),
    getCheckout: fixture.getCheckout.bind(fixture),
    handleWebhook: fixture.handleWebhook.bind(fixture),
    database: () => db,
  };
  const app = await buildApp({ db, payment });
  after(async () => {
    await app.close();
    db.close();
  });

  const postForm = (fields: Record<string, string>) =>
    app.inject({
      method: "POST",
      url: "/listings",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "text/html",
      },
      payload: new URLSearchParams(fields).toString(),
    });
  const listingCount = () =>
    (db.prepare("SELECT COUNT(*) AS count FROM listings").get() as { count: number }).count;

  const rejected = [
    {
      company: "Unsafe Amount",
      amountUsd: "9007199254740993",
      message: "bid must be a whole-dollar USD amount",
    },
    {
      company: "Below Minimum",
      amountUsd: "4",
      message: "first bid must be at least $5",
    },
    {
      company: "Unknown Product",
      amountUsd: "5",
      sku: "all remaining slots",
      message: "cannot buy the rest of the show",
    },
  ];
  for (const [index, input] of rejected.entries()) {
    const before = listingCount();
    const response = await postForm({
      company: input.company,
      oneLiner: "No invalid row",
      url: `https://${index}.invalid.example/deck`,
      amountUsd: input.amountUsd,
      ...(input.sku ? { sku: input.sku } : {}),
    });
    assert.equal(response.statusCode, 400);
    assert.ok(response.body.includes(input.message));
    assert.equal(listingCount(), before);
    assert.equal(checkoutInputs.length, 0);
  }

  const valid = await postForm({
    company: "Valid Pitch",
    oneLiner: "Starts one checkout",
    url: "https://valid.example/deck",
    amountUsd: "5",
    sku: "opening_slot",
  });
  assert.equal(valid.statusCode, 303);
  assert.equal(listingCount(), 1);
  assert.deepEqual(checkoutInputs, [{ chargeUsd: 5, nextUsd: 5 }]);
});

test("HTML checkout rejects obfuscated schemes and path-only URLs before checkout, including unsafe protocol-relative URLs", async () => {
  const db = openDatabase(":memory:");
  const fixture = new WaffoFixture(db, { autoSettle: false });
  const checkoutInputs: Array<{ chargeUsd: number; nextUsd: number }> = [];
  const payment: PaymentPort = {
    kind: "fixture",
    createCheckout: async (input) => {
      checkoutInputs.push({ chargeUsd: input.chargeUsd, nextUsd: input.nextUsd });
      return fixture.createCheckout(input);
    },
    applyPaid: fixture.applyPaid.bind(fixture),
    getCheckout: fixture.getCheckout.bind(fixture),
    handleWebhook: fixture.handleWebhook.bind(fixture),
    database: () => db,
  };
  const app = await buildApp({ db, payment });
  after(async () => {
    await app.close();
    db.close();
  });

  const postForm = (fields: Record<string, string>) =>
    app.inject({
      method: "POST",
      url: "/listings",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "text/html",
      },
      payload: new URLSearchParams(fields).toString(),
    });
  const listingCount = () =>
    (db.prepare("SELECT COUNT(*) AS count FROM listings").get() as { count: number }).count;

  const validProtocolRelative = await postForm({
    company: "Protocol Relative Pitch",
    oneLiner: "A safe protocol-relative pitch",
    url: "//hartevo.com/path",
    amountUsd: "5",
    sku: "opening_slot",
  });
  assert.equal(validProtocolRelative.statusCode, 303);
  assert.equal(listingCount(), 1);
  assert.equal(checkoutInputs.length, 1);

  const invalidUrls = [
    "javascript\n://example.com",
    "data\r://example.com",
    "ftp\t://example.com",
    "http\r://example.com",
    "http\t://example.com",
    "java\nscript:123",
    "/path",
    "///example.com",
    "//\\evil.com",
    "//evil.com\\path",
    "https://\\evil.com",
    "https://evil.com\\path",
    "https:\\evil.com",
    "https://[fec0::1]/path",
    "https://[::ffff:192.168.1.1]/path",
    "//hartevo.com\n/path",
  ];
  for (const [index, url] of invalidUrls.entries()) {
    const before = listingCount();
    const response = await postForm({
      company: `Rejected URL ${index}`,
      oneLiner: "No unsafe checkout",
      url,
      amountUsd: "5",
      sku: "opening_slot",
    });
    assert.equal(response.statusCode, 400);
    assert.match(response.body, /url must be an https URL/);
    assert.equal(listingCount(), before);
    assert.equal(checkoutInputs.length, 1);
  }
});

test("listings schema has no traction columns", () => {
  const db = openDatabase(":memory:");
  after(() => db.close());

  const columns = columnNames(db, "listings");
  assert.deepEqual(columns, [
    "id",
    "company",
    "one_liner",
    "url",
    "created_at",
    "contact_email",
  ]);
  for (const key of TRACTION_KEYS) {
    assert.equal(columns.includes(key), false);
  }
});

function columnNames(db: AppDb, table: string): string[] {
  const rows = db
    .prepare<[], { name: string }>(`PRAGMA table_info(${table})`)
    .all();
  return rows.map((row) => row.name);
}
