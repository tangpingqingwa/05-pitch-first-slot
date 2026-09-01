import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import { WaffoFixture } from "../src/billing/waffo-fixture.js";
import { openDatabase } from "../src/db.js";
import { HOUSE_CSS } from "../src/views/skin.js";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const FOOTER_MARKER = 'data-maker-contact=""';
const CONTACT_HREF = 'href="mailto:tangpingqingwa@gmail.com"';

async function makeApp() {
  const db = openDatabase(":memory:");
  const payment = new WaffoFixture(db, { now: () => NOW });
  const app = await buildApp({ db, payment, now: () => NOW });
  after(async () => {
    await app.close();
    db.close();
  });
  return app;
}

test("all public layouts include one exact maker contact footer", async () => {
  const app = await makeApp();
  const pages = ["/", "/about", "/rules", "/checkout/complete"];

  for (const path of pages) {
    const response = await app.inject({ method: "GET", url: path });
    assert.equal(response.statusCode, 200, path);
    assert.equal(
      (response.body.match(new RegExp(FOOTER_MARKER, "g")) ?? []).length,
      1,
      path,
    );
    assert.equal(
      (response.body.match(new RegExp(CONTACT_HREF, "g")) ?? []).length,
      1,
      path,
    );
    assert.match(
      response.body,
      /<footer class="maker-footer" data-maker-contact="">\s*<p>Built by <a href="mailto:tangpingqingwa@gmail\.com">tangpingqingwa@gmail\.com<\/a><\/p>/,
      path,
    );
    const mainEnd = response.body.indexOf("</main>");
    const footer = response.body.indexOf(FOOTER_MARKER);
    assert.ok(mainEnd >= 0 && footer > mainEnd, `${path} footer follows main`);
  }
});

test("maker contact keeps the stage credit restrained and reachable", () => {
  assert.match(HOUSE_CSS, /\.maker-footer\s*\{/);
  assert.match(HOUSE_CSS, /\.maker-footer a:hover\s*\{/);
  assert.match(HOUSE_CSS, /\.maker-footer a:focus-visible\s*\{/);
  assert.match(HOUSE_CSS, /max-width:\s*40rem/);
  assert.match(HOUSE_CSS, /overflow-wrap:\s*anywhere/);
});
