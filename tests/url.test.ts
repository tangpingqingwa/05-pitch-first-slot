import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import {
  canonicalizeUrl,
  UrlError,
} from "../src/core/url.js";

test("SPEC 7: URL with utm_source and fbclid is stored stripped", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const created = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      company: "Tracked Co",
      oneLiner: "Deck arrived with campaign junk",
      url: "https://Deck.Example/pitch?utm_source=x&utm_campaign=launch&fbclid=1&keep=yes#frag",
    },
  });
  assert.equal(created.statusCode, 200);
  const listing = created.json() as { url: string };
  assert.equal(listing.url, "https://deck.example/pitch?keep=yes");
  assert.doesNotMatch(listing.url, /utm_/);
  assert.doesNotMatch(listing.url, /fbclid/);
  assert.doesNotMatch(listing.url, /#/);
});

test("canonicalizeUrl drops tracking keys and empty query", () => {
  assert.equal(
    canonicalizeUrl("https://helix.example/deck?utm_source=x&fbclid=1#top"),
    "https://helix.example/deck",
  );
  assert.equal(
    canonicalizeUrl(
      "https://HELIX.EXAMPLE/deck?gclid=1&gbraid=2&wbraid=3&msclkid=4&mc_eid=5&igshid=6&ref=twitter&ref_src=tw&ref_url=x&yclid=9",
    ),
    "https://helix.example/deck",
  );
});

test("bare pitch domains are normalized to https before storage", async () => {
  assert.equal(
    canonicalizeUrl("PitchSlot.LOL/deck?utm_source=launch#top"),
    "https://pitchslot.lol/deck",
  );
  assert.equal(
    canonicalizeUrl("example.com:8443/deck"),
    "https://example.com:8443/deck",
  );
  assert.equal(
    canonicalizeUrl("//example.com/deck"),
    "https://example.com/deck",
  );
  assert.equal(
    canonicalizeUrl("[2001:db8::1]:8443/deck"),
    "https://[2001:db8::1]:8443/deck",
  );

  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());
  const created = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      company: "Bare Domain Pitch",
      oneLiner: "A pitch entered without a scheme",
      url: "PitchSlot.LOL/deck?utm_source=launch#top",
    },
  });
  assert.equal(created.statusCode, 200);
  assert.equal(created.json().url, "https://pitchslot.lol/deck");
});

test("protocol-relative URLs require a plausible authority without backslashes", () => {
  assert.equal(
    canonicalizeUrl("//hartevo.com/path"),
    "https://hartevo.com/path",
  );
  for (const raw of [
    "//\\evil.com",
    "//evil.com\\path",
    "//hartevo.com\n/path",
  ]) {
    assert.throws(() => canonicalizeUrl(raw), (err: unknown) => {
      assert.ok(err instanceof UrlError);
      assert.equal(err.code, "invalid_url");
      return true;
    });
  }
});

test("obfuscated schemes and path-only inputs fail closed", () => {
  for (const raw of [
    "javascript\n://example.com",
    "data\r://example.com",
    "ftp\t://example.com",
    "http\r://example.com",
    "http\t://example.com",
    "java\nscript:123",
    "java\rscript:123",
    "java\tscript:123",
    "/path",
    "///example.com",
  ]) {
    assert.throws(() => canonicalizeUrl(raw), (err: unknown) => {
      assert.ok(err instanceof UrlError);
      assert.equal(err.code, "invalid_url");
      return true;
    });
  }
});

test("SPEC 8: https://t.me/foo is 400 no_chat", async () => {
  const app = await buildApp({ databasePath: ":memory:" });
  after(() => app.close());

  const telegram = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      company: "Chat Pitch",
      oneLiner: "Please message us",
      url: "https://t.me/foo",
    },
  });
  assert.equal(telegram.statusCode, 400);
  assert.equal(telegram.json().error, "no_chat");

  const discord = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      company: "Discord Pitch",
      oneLiner: "Join the server",
      url: "https://discord.com/invite/abc",
    },
  });
  assert.equal(discord.statusCode, 400);
  assert.equal(discord.json().error, "no_chat");

  const whatsapp = await app.inject({
    method: "POST",
    url: "/listings",
    payload: {
      company: "WA Pitch",
      oneLiner: "Text the founder",
      url: "https://wa.me/15555550100",
    },
  });
  assert.equal(whatsapp.statusCode, 400);
  assert.equal(whatsapp.json().error, "no_chat");
});

test("javascript, data, and http URLs are 400 invalid_url", () => {
  for (const raw of [
    "javascript:alert(1)",
    "data:text/html,hi",
    "http://ok.example",
    "https//ok.example",
    "not a url",
  ]) {
    assert.throws(() => canonicalizeUrl(raw), (err: unknown) => {
      assert.ok(err instanceof UrlError);
      assert.equal(err.code, "invalid_url");
      return true;
    });
  }
});

test("operator NSFW hosts are 400 nsfw", () => {
  assert.throws(
    () => canonicalizeUrl("https://pornhub.com/view"),
    (err: unknown) => {
      assert.ok(err instanceof UrlError);
      assert.equal(err.code, "nsfw");
      return true;
    },
  );
});

test("repeated trailing dots cannot bypass chat or NSFW host policy", () => {
  for (const [raw, code] of [
    ["//t.me..", "no_chat"],
    ["//pornhub.com...", "nsfw"],
  ] as const) {
    assert.throws(() => canonicalizeUrl(raw), (err: unknown) => {
      assert.ok(err instanceof UrlError);
      assert.equal(err.code, code);
      return true;
    });
  }
});
