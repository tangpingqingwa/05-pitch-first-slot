import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
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
  assert.match(html, /This week's first slot is still open\. Outbid takes it after Polar lands\./);
  assert.doesNotMatch(html, /The board is empty/);
  assert.doesNotMatch(html, /No listings this week/);
  assert.match(html, /Opening three minutes/);
  assert.match(html, /Outbid/);
  assert.doesNotMatch(html, /class="listing"/);
  assert.doesNotMatch(html, /\$[0-9]/);
  assert.doesNotMatch(html, /#1 · \$/);
  assert.match(html, /Claim #1/);
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
