import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildApp } from "../src/app.js";
import { WaffoFixture } from "../src/billing/waffo-fixture.js";
import { getBid } from "../src/core/rank.js";
import { openDatabase } from "../src/db.js";

const NOW = new Date("2026-08-19T12:00:00.000Z");
const WEEK = "2026-08-17";

type TestContext = {
  app: Awaited<ReturnType<typeof buildApp>>;
  db: ReturnType<typeof openDatabase>;
  payment: WaffoFixture;
};

async function makeApp(autoSettle = true): Promise<TestContext> {
  const db = openDatabase(":memory:");
  const payment = new WaffoFixture(db, { autoSettle, now: () => NOW });
  const app = await buildApp({ db, payment, now: () => NOW });
  after(async () => {
    await app.close();
    db.close();
  });
  return { app, db, payment };
}

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

async function payBid(
  app: Awaited<ReturnType<typeof buildApp>>,
  listingId: string,
  amountUsd: number,
): Promise<void> {
  const response = await app.inject({
    method: "POST",
    url: `/listings/${listingId}/bids`,
    payload: { amountUsd },
  });
  assert.equal(response.statusCode, 200);
}

function boardMarkup(html: string): string {
  const styleEnd = html.indexOf("</style>");
  return styleEnd === -1 ? html : html.slice(styleEnd);
}

function listingCard(html: string, company: string): string {
  const items = [...html.matchAll(/<li class="listing[\s\S]*?<\/li>/g)].map(
    (match) => match[0],
  );
  const card = items.find((item) => item.includes(company));
  assert.ok(card, `missing cue for ${company}`);
  return card;
}

function count(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function assertSharedParityCssLegacy(html: string, occupied: boolean): void {
  // Keep a small visual contract in the ordinary page suite while screenshot
  // capture is unavailable: stage hierarchy, action cluster, and card anatomy.
  assert.match(html, /\.stage-head \{ text-align: center; \}/);
  assert.match(
    html,
    /h1\.headline \{[\s\S]*font-family: var\(--serif\)[\s\S]*font-size: clamp\(2\.4rem/,
  );
  assert.match(html, /\.claim \{[\s\S]*justify-content: center/);
  assert.match(html, /\.bid-field \{[\s\S]*text-decoration: none/);
  assert.match(html, /\.bid-field input:focus-visible \{[\s\S]*outline: 2px solid var\(--lamp\)/);
  assert.match(html, /\.outbid \{[\s\S]*background: var\(--spot\)/);
  assert.match(html, /\.home-context \{[\s\S]*align-items: center/);
  assert.match(html, /html \{[\s\S]*scrollbar-width: none;[\s\S]*-ms-overflow-style: none;/);
  assert.match(html, /html::\-webkit-scrollbar,[\s\S]*body::\-webkit-scrollbar \{[\s\S]*width: 0;[\s\S]*height: 0;[\s\S]*display: none;/);
  assert.match(html, /@media \(min-width: 641px\) \{[\s\S]*\.bid-form \{ margin-top: 24\.5px; \}[\s\S]*\.function-rail \{[\s\S]*height: 32px;[\s\S]*min-height: 32px;[\s\S]*margin: 32px 0 20px;[\s\S]*padding: 0;/);
  assert.match(html, /<header class="site-header" data-slot="site-header">/);
  assert.match(html, /<div class="header-inner" data-slot="shell">/);
  assert.match(html, /<a class="brand" data-slot="brand" href="\/">/);
  assert.match(html, /<nav data-slot="primary-nav" aria-label="Main">/);
  assert.match(html, /<main class="page" data-slot="home-shell">/);
  assert.match(html, /<div class="pitch-home" data-pitch-home="true" data-period="(?:open|archive)">/);
  assert.match(html, /data-slot="stats-pill" data-context-pill="rolling-week"/);
  assert.match(html, /<section id="claim" data-slot="claim-hero">/);
  assert.match(html, /class="bid-form (?:claim-form(?: later-write)?|later-write(?: claim-form)?)" data-slot="claim-form"/);
  assert.match(html, /data-slot="category-rail" data-function-rail="true"/);
  assert.match(
    html,
    /class="period-tabs period-tabs-header" data-period-tabs="true" data-period-placement="header" data-slot="period-tabs" role="tablist" aria-label="Ranking period"/,
  );
  assert.match(
    html,
    /class="period-tabs period-tabs-mobile" data-period-tabs="true" data-period-placement="mobile" aria-hidden="true" inert>/,
  );
  assert.doesNotMatch(html, /class="period-tabs period-tabs-mobile"[^>]*role="tablist"/);
  assert.equal(count(boardMarkup(html), /data-slot="period-tabs"/g), 1);
  assert.match(html, /\.period-tabs-header \{[\s\S]*min-height: 40px/);
  assert.match(
    html,
    /\.period-tabs-header \{[\s\S]*width: 173px;[\s\S]*height: 40px;[\s\S]*margin-top: 4px;[\s\S]*margin-left: 36px;/,
  );
  assert.match(html, /\.period-tabs-mobile \{ display: none; \}/);
  assert.match(
    html,
    /\.period-tabs-header \{ display: none; \}[\s\S]*\.home-context \{[\s\S]*\.period-tabs-mobile \{[\s\S]*display: inline-flex;/,
  );
  assert.match(html, /\.context-pill \{[\s\S]*width: 310px;[\s\S]*min-height: 32px/);
  assert.match(html, /\.context-pill \{ width: 306px; font-size: 12px; justify-content: center; \}/);
  assert.match(html, /\.hero-line \{[\s\S]*width: 100%;/);
  assert.match(html, /\.hero-title \{[\s\S]*display: flex;[\s\S]*width: 100%;[\s\S]*min-width: 0;/);
  assert.match(html, /\.hero-title-copy \{ min-width: 0; \}/);
  assert.match(html, /<h2 class="hero-title" data-slot="claim-heading"><span class="hero-title-copy">/);
  assert.match(html, /var periodTabs = Array\.prototype\.slice\.call\(document\.querySelectorAll\("\[data-period-tabs\]"\)\)/);
  assert.match(html, /tabs\.setAttribute\("data-slot", "period-tabs"\)/);
  assert.match(html, /tabs\.removeAttribute\("inert"\)/);
  assert.match(html, /window\.addEventListener\("resize", syncPeriodTabs\)/);
  assert.match(html, /\.hero-title \{[\s\S]*font-size: 40px/);
  assert.match(html, /\.function-rail \{[\s\S]*overflow: hidden/);
  assert.match(html, /class="rail-scroll" data-rail-scroll="true"/);
  assert.match(html, /\.rail-scroll \{[\s\S]*flex: 1 1 auto[\s\S]*min-width: 0/);
  assert.match(html, /\.rail-scroll \{ flex: 1 1 auto; overflow-x: auto; overflow-y: hidden/);
  assert.match(
    html,
    /<button class="rail-more" type="button" aria-expanded="false" aria-controls="rail-menu" aria-haspopup="true" data-rail-more="true">More<\/button>/,
  );
  assert.doesNotMatch(html, /class="rail-more"[^>]*disabled/);
  assert.match(
    html,
    /<div class="rail-menu" id="rail-menu" data-rail-menu="true" role="menu" aria-label="More pitch house sections" hidden>/,
  );
  assert.match(html, /class="rail-menu-item" role="menuitem" data-rail-menu-item="opening" href="#claim">Opening slot<\/a>/);
  assert.match(html, /class="rail-menu-item" role="menuitem" data-rail-menu-item="rules" href="\/rules">House rules<\/a>/);
  assert.match(html, /\.rail-menu\[hidden\] \{ display: none; \}/);
  assert.match(html, /railMenu\.hidden = !open/);
  assert.match(html, /railToggle\.setAttribute\("aria-expanded", String\(open\)\)/);
  assert.match(html, /event\.key === "Escape"/);
  assert.match(html, /\.listing\[data-top-three="true"\] \{[\s\S]*box-sizing: border-box;[\s\S]*height: 110px[\s\S]*min-height: 110px/);
  assert.match(html, /\.leaderboard\[data-top-three-list="true"\] \{ margin: 0; gap: 12px; \}/);
  assert.match(
    html,
    /\.listing\[data-top-three="true"\] \.cue \{[\s\S]*display: grid;[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) auto/,
  );
  assert.match(
    html,
    /@media \(max-width: 640px\)[\s\S]*\.listing\[data-top-three="true"\] \.cue \{[\s\S]*grid-template-rows: 20px minmax\(0, 48px\) 16px;[\s\S]*align-content: start;[\s\S]*row-gap: 2px;/,
  );
  assert.match(
    html,
    /\.listing\[data-top-three="true"\] \.cue \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) max-content;/,
  );
  assert.match(html, /\.listing\[data-top-three="true"\]\.top \{ outline: 0; outline-offset: 0; \}/);
  assert.match(html, /\.listing\[data-top-three="true"\] \.one-liner \{[\s\S]*-webkit-line-clamp: 2/);
  assert.match(
    html,
    /@media \(max-width: 640px\)[\s\S]*\.listing\[data-top-three="true"\] \.who \{[\s\S]*height: auto;[\s\S]*grid-template-rows: 20px minmax\(0, 48px\);[\s\S]*gap: 2px;/,
  );
  assert.match(
    html,
    /\.listing\[data-top-three="true"\] \.one-liner \{[\s\S]*min-width: 0;[\s\S]*overflow: hidden;[\s\S]*-webkit-line-clamp: 2/,
  );
  assert.match(
    html,
    /@media \(max-width: 640px\)[\s\S]*\.listing\[data-top-three="true"\] \.one-liner \{[\s\S]*max-height: 40px;[\s\S]*line-height: 20px;/,
  );
  assert.match(
    html,
    /@media \(max-width: 640px\)[\s\S]*\.listing\[data-top-three="true"\] \.clicks,[\s\S]*\.listing\[data-top-three="true"\] \.deck,[\s\S]*\.listing\[data-top-three="true"\] \.later-open-foot \{[\s\S]*grid-row: 3;[\s\S]*align-self: start;/,
  );
  assert.match(
    html,
    /@media \(max-width: 640px\)[\s\S]*\.listing\[data-top-three="true"\]\[data-open-first\] \.clicks\[data-card-facts="true"\],[\s\S]*\.listing\[data-top-three="true"\]\[data-later-deck\] \.clicks\[data-card-facts="true"\] \{[\s\S]*position: absolute;[\s\S]*top: 72px;[\s\S]*left: 0;[\s\S]*grid-row: auto;/,
  );
  assert.match(
    html,
    /@media \(max-width: 640px\)[\s\S]*\.listing\[data-top-three="true"\]\[data-open-first\] \.deck\[data-card-action="true"\],[\s\S]*\.listing\[data-top-three="true"\]\[data-later-deck\] \.later-open-foot\[data-card-action="true"\] \{[\s\S]*position: absolute;[\s\S]*top: 72px;[\s\S]*right: 0;[\s\S]*grid-row: auto;/,
  );
  assert.match(
    html,
    /@media \(max-width: 640px\)[\s\S]*\.listing\[data-top-three="true"\]\[data-open-first\] \.open-first-cue \.open-deck\[data-first-click="open"\] \{[\s\S]*transform: translateY\(-5px\);/,
  );
  assert.match(
    html,
    /\.listing\[data-top-three="true"\] \.deck\[data-card-action="true"\],[\s\S]*\.later-open-foot\[data-card-action="true"\] \{[\s\S]*position: static;[\s\S]*grid-row: 3/,
  );
  assert.match(
    html,
    /\.listing\[data-top-three="true"\]\[data-open-first\] \.open-first-cue,[\s\S]*\.listing\[data-top-three="true"\]\[data-later-deck\] \.later-cue \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) max-content;/,
  );
  assert.match(
    html,
    /\.listing\[data-top-three="true"\]\[data-later-deck\] \.later-cue \.later-open-foot\[data-card-action="true"\] \{[\s\S]*position: static;[\s\S]*grid-row: 3/,
  );
  assert.match(html, /\.listing\[data-top-three="true"\] \.rank\[data-card-price\]::after \{[\s\S]*content: attr\(data-card-price\)/);
  assert.match(html, /\.listing\[data-top-three="true"\] \.open-deck,[\s\S]*\.open-later \{[\s\S]*min-height: 28px/);
  assert.match(html, /\.house-occupied\[data-occupied-house\] \.listing\[data-top-three="true"\] \.later-open-foot\[data-later-open-foot\] \{[\s\S]*border: 0/);
  assert.match(html, /\.listing\[data-top-three="true"\]::before \{[\s\S]*top: 40px;[\s\S]*transform: none;/);
  assert.match(html, /@media \(max-width: 640px\)[\s\S]*\.listing\[data-top-three="true"\]::before \{[\s\S]*top: 24px;[\s\S]*transform: none;/);
  assert.match(
    html,
    /@media \(max-width: 640px\)[\s\S]*\.listing\[data-top-three="true"\] \.open-deck,[\s\S]*\.open-later,[\s\S]*min-height: 0;[\s\S]*padding: 0;[\s\S]*border: 0;[\s\S]*background: transparent;[\s\S]*text-decoration: underline;/,
  );
  assert.match(
    html,
    /\.listing\[data-top-three="true"\] \.open-deck:focus-visible,[\s\S]*outline: 2px solid var\(--soft-coral\);[\s\S]*outline-offset: 3px;/,
  );
  assert.match(
    html,
    /html\[data-theme='dark'\] \.listing\[data-top-three="true"\] \.open-deck,[\s\S]*border: 0;[\s\S]*background: transparent;/,
  );
  assert.match(html, /\.listing\[data-top-three="true"\] \.rank \.rank-label \{[\s\S]*clip: rect\(0 0 0 0\)/);
  assert.match(html, /\.listing\[data-top-three="true"\]\[data-open-first\] \.open-first-cue \.deck \{[\s\S]*grid-row: 3/);
  assert.match(html, /\.listing\[data-top-three="true"\] \.deck,[\s\S]*\.later-open-foot \{[\s\S]*min-width: max-content/);
  assert.match(
    html,
    /\.house-occupied\[data-occupied-house\] \.listings-later\[data-later-seats\]:not\(\.listings-beyond\) \.listing\[data-top-three="true"\] \{[\s\S]*padding: 16px 18px 14px 66px;/,
  );
  assert.match(html, /\.listing\[data-top-three="true"\] \.clicks\[data-card-facts="true"\] \{[\s\S]*display: flex/);
  assert.match(html, /\.listing\[data-top-three="true"\] \.card-host \{[\s\S]*text-overflow: ellipsis/);
  assert.match(html, /\.listing\[data-top-three="true"\] \{[\s\S]*border-radius: 25\.2px;/);
  assert.match(html, /\.listings-later \.listing\[data-top-three="true"\] \{[\s\S]*border-radius: 25\.2px;/);
  assert.match(html, /\.listing\[data-top-three="true"\] \.one-liner \{[\s\S]*font-size: 14px;[\s\S]*line-height: 20px;/);
  assert.match(html, /\.listing\[data-top-three="true"\] \.clicks \{[\s\S]*font-size: 12px;[\s\S]*line-height: 16px;/);
  assert.match(html, /\.listing\[data-rank='1'\] \{[\s\S]*background: #f6dfd8;/);
  assert.match(html, /\.listing\[data-rank='2'\] \{ background: #fcf3ee; \}/);
  assert.match(html, /\.listing\[data-rank='3'\] \{ background: #fdf9f6; \}/);
  assert.match(html, /@media \(max-width: 640px\)[\s\S]*\.listing\[data-top-three="true"\] \.company \{ font-size: 16px; line-height: 20px; \}/);
  assert.match(html, /@media \(max-width: 640px\)[\s\S]*\.listing\[data-top-three="true"\] \.clicks \{ font-size: 12px; line-height: 16px; \}/);
  assert.match(html, /\.home-context \{ flex-direction: column; gap: 22px; min-height: 88px; \}/);
  assert.match(html, /\.period-tabs-mobile \{[\s\S]*width: 173px;[\s\S]*height: 40px;[\s\S]*min-height: 40px;/);
  assert.match(html, /#claim \{ margin-top: 18px; \}/);
  assert.match(html, /\.function-rail \{[\s\S]*height: 32px;[\s\S]*min-height: 32px;[\s\S]*margin: 32px 0 20px;[\s\S]*padding: 0;[\s\S]*gap: 2px;[\s\S]*overflow: visible;/);
  assert.match(
    html,
    /\.listing\[data-top-three="true"\] \{ box-sizing: border-box; height: 123px; min-height: 123px; overflow: hidden;/,
  );
  assert.match(html, /\.listing\[data-top-three="true"\] \.cue \{ grid-template-columns: minmax\(0, 1fr\) max-content; gap: 2px 8px; \}/);
  assert.match(html, /@media \(max-width: 640px\)/);
  assert.match(html, /\.leaderboard\[data-top-three-list="true"\],[\s\S]*gap: 6px;/);
  assert.match(html, /\.secondary-section \{ display: block; \}/);
  assert.match(
    html,
    /@media \(min-width: 641px\) \{\n  \.secondary-section \{ margin-top: 23\.5px; \}\n  \.secondary-section \+ \.secondary-section \{ margin-top: 25px; \}\n\}/,
  );
  assert.match(html, /\.listing\[data-top-three="true"\] \{ box-sizing: border-box; height: 123px; min-height: 123px; overflow: hidden;/);
  assert.match(html, /\.field input,\s*\.function-choice \{[\s\S]*height: 44px/);
  assert.match(html, /\.bid-form > div,\s*\.bid-row \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 256px 115px/);
  assert.match(html, /\.pitch-details \{/);
  assert.match(html, /\.outbid:disabled,[\s\S]*background: #edb9ab/);
  assert.match(
    html,
    /<button class="theme-toggle" type="button" data-theme-toggle="true" aria-pressed="false" aria-label="Toggle color theme">Theme<\/button>/,
  );
  assert.match(
    html,
    /<button class="find-toggle" type="button" data-find-toggle="true" aria-expanded="false" aria-controls="find-popover" aria-haspopup="dialog" aria-label="Find paid pitches">Find<\/button>/,
  );
  assert.match(
    html,
    /<div class="find-popover" id="find-popover" data-find-popover="true" role="search" aria-labelledby="find-title" hidden>/,
  );
  assert.match(html, /<button class="find-close" type="button" data-find-close="true">Close<\/button>/);
  assert.match(html, /<input id="find-query" data-find-input="true" type="search"/);
  assert.match(html, /\.find-popover\[hidden\] \{ display: none; \}/);
  assert.match(html, /findPopover\.hidden = !open/);
  assert.match(html, /findToggle\.setAttribute\("aria-expanded", String\(open\)\)/);
  assert.match(html, /findPopover\.contains\(event\.target\)/);
  assert.match(html, /findPopover\.addEventListener\("keydown"/);
  assert.match(html, /findClose\.addEventListener\("click"/);
  assert.match(html, /event\.preventDefault\(\)/);
  assert.match(html, /\.theme-toggle \{[\s\S]*min-height: 32px[\s\S]*background: transparent/);
  assert.match(
    html,
    /nav\[aria-label="Main"\] a:first-child,[\s\S]*nav\[aria-label="Main"\] a:nth-of-type\(3\) \{ display: none; \}/,
  );
  assert.match(
    html,
    /:root\[data-theme='dark'\] \{[\s\S]*--house: rgb\(27 23 21\)[\s\S]*--spot: #ed8b73[\s\S]*--card: rgb\(42 35 33\)/,
  );
  assert.match(
    html,
    /html\[data-theme='dark'\] \.secondary-ranking \.secondary-row \{[\s\S]*background: #342a28/,
  );
  assert.match(
    html,
    /html\[data-theme='dark'\] \.secondary-activity \.secondary-row \{[\s\S]*background: rgb\(46 39 38\)/,
  );
  assert.match(
    html,
    /document\.documentElement\.setAttribute\("data-theme", dark \? "light" : "dark"\)/,
  );
  assert.match(html, /toggle\.setAttribute\("aria-pressed", String\(!dark\)\)/);
  assert.match(html, /<img class="brand-mark" src="\/icons\/brand-mark\.svg"[^>]*>/);
  assert.doesNotMatch(html, /▰|⌕|◐|More <span|header-tool/);
  if (occupied) {
    assert.match(html, /<ol class="listings leaderboard" data-slot="top-three" data-top-three-list="true"/);
    assert.equal(count(boardMarkup(html), /data-top-three-list="true"/g), 1);
    assert.match(html, /\.listing \{[\s\S]*background: var\(--card\)/);
    assert.match(
      html,
      /\.listing\[data-open-first\] \.open-first-cue \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/,
    );
    assert.match(
      html,
      /\.house-occupied\[data-occupied-house\] \.listing\[data-prize-first\] \.company \{[\s\S]*font-size: 2\.15rem/,
    );
    assert.match(
      html,
      /\.house-occupied\[data-occupied-house\] \.listings-later\[data-later-seats\] \.seat\.later-seat\[data-later-seat\] \.rank \{[\s\S]*font-size: 0\.88rem/,
    );
    assert.match(
      html,
      /\.house-occupied\[data-occupied-house\] \.listings-later\[data-later-seats\] \.later-open-foot\[data-later-open-foot\] \.open-later \{[\s\S]*background: transparent/,
    );
    assert.match(
      html,
      /\.house-occupied\[data-occupied-house\] \.claim-after-slot\[data-claim-after-slot\] \.stage-head\[data-quiet-headline\] \.headline \{[\s\S]*font-size: 0\.75rem/,
    );
    assert.match(
      html,
      /\.house-occupied\[data-occupied-house\] \.listings-later\[data-later-seats\] \.listing\[data-top-three='true'\]\[data-rank='2'\],[\s\S]*background: #fcf3ee[\s\S]*border: 1px solid #f0d8d0/,
    );
    assert.match(
      html,
      /\.house-occupied\[data-occupied-house\] \.listings-later\[data-later-seats\] \.listing\[data-top-three='true'\]\[data-rank='3'\] \{[\s\S]*background: #fdf9f6/,
    );
    assert.match(
      html,
      /\.house-occupied\[data-occupied-house\] \.claim-after-slot\.claim-primary\[data-claim-after-slot\] \.bid-form \{ margin-top: 20px; \}/,
    );
    assert.match(
      html,
      /@media \(max-width: 640px\)[\s\S]*\.house-occupied\[data-occupied-house\] \.claim-after-slot\.claim-primary\[data-claim-after-slot\] \.bid-form \{ margin-top: 20px; \}/,
    );
    assert.match(
      html,
      /\.house-occupied\[data-occupied-house\] \.claim-after-slot\.claim-primary\[data-claim-after-slot\] \.bid-row\[data-after-action\] \.field input,[\s\S]*height: 44px/,
    );
    assert.match(
      html,
      /\.house-occupied\[data-occupied-house\] \.listings-later\[data-later-seats\] \{ margin-top: 15px; gap: 16px; \}/,
    );
    assert.match(
      html,
      /\.house-occupied\[data-occupied-house\] \.listings-later\[data-later-seats\]:not\(\.listings-beyond\) \{[\s\S]*margin-top: 6px;[\s\S]*gap: 6px;/,
    );
    assert.match(html, /\.house-occupied\[data-occupied-house\] \.listings-later\[data-later-seats\]:not\(\.listings-beyond\) \{ margin-top: 6px; gap: 6px; \}/);
    assert.match(html, /\.house-occupied\[data-occupied-house\] \.listings-later\[data-later-seats\]:not\(\.listings-beyond\) \.listing\[data-top-three="true"\] \{ padding: 13px 12px 12px 54px; \}/);
    assert.match(html, /\.secondary-ranking \.secondary-list \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); gap: 8px; \}/);
    assert.match(html, /\.secondary-ranking \.secondary-row \{[\s\S]*height: 64px[\s\S]*border: 1px solid #f0d8d0/);
    assert.match(html, /\.secondary-activity \.secondary-list \{ grid-template-columns: repeat\(5, minmax\(0, 1fr\)\); gap: 8px; \}/);
    assert.match(html, /\.secondary-activity \.secondary-row \{[\s\S]*height: 50px[\s\S]*border: 1px solid #ece4df/);
    assert.match(html, /\.secondary-section \{ display: block; \}/);
  } else {
    assert.match(
      html,
      /\.house-empty\[data-empty-house\] \[data-prize-first\],[\s\S]*display: none/,
    );
    assert.match(
      html,
      /\.house-empty\[data-empty-house\] \.later-write\[data-later-write\] \{[\s\S]*border-top: 1px dashed/,
    );
  }
}

function assertPitchHouseCss(html: string, occupied: boolean): void {
  // Identity contract: the real product is a narrow pitch house, not the
  // shared Outbid fixture board. Keep this contract semantic and resilient to
  // intentional spacing changes in the stage CSS.
  assert.match(html, /--house: rgb\(20[ ,]+12[ ,]+8\)/);
  assert.match(html, /--spot: rgb\(232[ ,]+177[ ,]+90\)/);
  assert.match(html, /--curtain: rgb\(90[ ,]+27[ ,]+36\)/);
  assert.match(html, /--serif: "Instrument Serif"/);
  assert.match(html, /radial-gradient\(ellipse 80% 42% at 50% 8%/);
  assert.match(html, /max-width: 40rem/);
  assert.match(html, /\.stage-head \{ text-align: center; \}/);
  assert.match(html, /h1\.headline \{[\s\S]*font-family: var\(--serif\)/);
  assert.match(html, /\.bid-field \{[\s\S]*text-decoration: none/);
  assert.match(html, /\.outbid \{[\s\S]*background: var\(--spot\)/);
  assert.match(html, /@media \(max-width: 640px\)/);
  assert.match(html, /\.bid-row \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(html, /<header class="site-header" data-slot="site-header">/);
  assert.match(
    html,
    /<a class="brand" data-slot="brand" href="\/"><img class="brand-mark" src="\/icons\/brand-mark\.svg"[^>]*>first\.<em>slot<\/em><\/a>/,
  );
  assert.match(html, /data-stage-section="opening-cue"/);
  assert.match(html, /data-pitch-taxonomy="stage-state"/);
  assert.doesNotMatch(html, /data-reference-fixture|picks\.daily|DTC Picks Daily|outbid\.lol|This morning's cover|Test this today|118 online|1,404,927 visitors|\/icons\/outbid-mark/);
  if (occupied) {
    assert.match(html, /\.listing\[data-stage-card="lead-cue"\]/);
    assert.match(html, /\.listing\[data-stage-card="later-cue"\]/);
    assert.match(html, /\.listing\[data-stage-card="in-wings"\]/);
    assert.match(
      html,
      /\.listing\[data-stage-card="lead-cue"\] \.clicks\[data-card-facts="true"\] \.card-fact-separator,[\s\S]*\.listing\[data-stage-card="later-cue"\] \.clicks\[data-card-facts="true"\] \.card-fact-separator \{[\s\S]*margin: 0 0\.3rem;/,
    );
    assert.match(html, /data-stage-section="on-stage"/);
    assert.match(html, /data-stage-card="lead-cue"/);
  } else {
    assert.doesNotMatch(boardMarkup(html), /data-stage-section="on-stage"|data-stage-card="lead-cue"/);
  }
}

const obsoleteHopMarkup =
  /Then Outbid|after (?:Open deck|Then Outbid)|data-(?:raise-after|open-after-raise|raise-after-open)|(?:raise-after-deck|open-after-raise|raise-after-open)/i;

const inventedTractionOrSocialProof =
  /\b(?:arr|mrr|revenue|users|growth(?:\s+rate)?|waitlist(?:\s+size)?|traction|hot(?:\s|-)+deal|traction(?:\s|-)+(?:meter|badge)|fake(?:\s|-)+(?:logo|logos|score|scores|rating|ratings|quote|quotes)|scout(?:\s|-)+(?:score|scores|rating|ratings|quote|quotes)|star(?:\s|-)+ratings?|social(?:\s|-)+proof|backed\s+by|typical(?:\s|-)+(?:raise|price))\b/i;

function assertNoInventedTractionOrSocialProof(html: string): void {
  assert.doesNotMatch(html, inventedTractionOrSocialProof);
}

test("unpaid and empty states stay honest", async () => {
  const { app } = await makeApp();

  const emptyResponse = await app.inject({ method: "GET", url: "/" });
  assert.equal(emptyResponse.statusCode, 200);
  const empty = emptyResponse.body;
  assertPitchHouseCss(empty, false);
  assert.match(empty, /<h1 class="headline">Opening three minutes<\/h1>/);
  assert.match(empty, /class="house house-empty" data-empty-house="true"/);
  assert.match(empty, /data-home-context="true"/);
  assert.match(empty, /data-context-pill="rolling-week"/);
  assert.match(empty, /data-period-tabs="true"/);
  const headerTabsAt = empty.indexOf('class="period-tabs period-tabs-header"');
  const headerContextAt = empty.indexOf('class="header-context"');
  const contextAt = empty.indexOf('class="context-pill"');
  const mobileTabsAt = empty.indexOf('class="period-tabs period-tabs-mobile"');
  const claimAt = empty.indexOf('<section id="claim"');
  assert.ok(headerTabsAt > empty.indexOf('class="brand"') && headerTabsAt < headerContextAt);
  assert.ok(mobileTabsAt > contextAt && mobileTabsAt < claimAt);
  assert.match(empty, /data-function-rail="true"/);
  assert.match(empty, /data-function-choice="opening-slot"/);
  assert.match(empty, /data-pitch-details="true"/);
  assert.match(empty, /data-find-empty="true"/);
  assert.doesNotMatch(empty, /data-find-result="true"/);
  assert.match(empty, /data-claim-submit="true" disabled/);
  assert.match(empty, /class="outbid">Outbid<\/button>/);
  assert.match(empty, /class="claim-note" data-empty-room/);
  assert.match(empty, /This week's first slot is still open\. A confirmed bid takes it\./);
  assert.match(empty, /class="bid-form claim-form later-write" data-slot="claim-form" data-later-write="true"/);
  assert.match(empty, /Company, deck URL, and a one-liner\. Unpaid checkout does not rank\./);
  assert.match(empty, /data-bid-step="-1"/);
  assert.match(empty, /data-bid-step="1"/);
  assert.match(empty, /class="bid-field"/);
  assert.match(empty, /name="company"/);
  assert.match(empty, /name="url"/);
  assert.match(empty, /name="oneLiner"/);
  assert.match(empty, /data-slot="url-input"/);
  assert.match(empty, /data-slot="category-control" data-function-choice="opening-slot"/);
  assert.match(empty, /data-slot="claim-button" data-claim-submit="true"/);
  assert.match(empty, /<label class="sr-only" for="company">Company<\/label><input id="company" name="company"/);
  assert.match(empty, /<label class="sr-only" for="url">Deck or site<\/label><input id="url" name="url"/);
  assert.match(empty, /<label class="sr-only" for="oneLiner">One-line pitch<\/label><input id="oneLiner" name="oneLiner"/);
  assert.match(empty, /id="company" name="company" form="bid-form" data-required-field="true"/);
  assert.match(empty, /id="oneLiner" name="oneLiner" form="bid-form" data-required-field="true"/);
  assert.doesNotMatch(empty, /<a class="outbid"/);
  assert.equal(count(empty, /class="outbid">Outbid<\/button>/g), 1);
  const emptyUrlAt = empty.indexOf('name="url"');
  const emptySubmitAt = empty.indexOf('class="outbid">Outbid</button>');
  const emptyCompanyAt = empty.indexOf('name="company"');
  const emptyOneLinerAt = empty.indexOf('name="oneLiner"');
  assert.ok(emptyUrlAt > -1 && emptySubmitAt > emptyUrlAt);
  assert.ok(emptyCompanyAt > emptySubmitAt && emptyOneLinerAt > emptyCompanyAt);
  assert.doesNotMatch(empty, /#(?:1|2)\b/);
  assert.doesNotMatch(empty, /Open deck/);
  assert.doesNotMatch(empty, obsoleteHopMarkup);
  assert.doesNotMatch(boardMarkup(empty), /class="listing/);
  assert.doesNotMatch(boardMarkup(empty), /data-first-click="open"/);
  assert.doesNotMatch(boardMarkup(empty), /data-occupied-house|data-prize-first|data-later-seat/);

  const listing = await createListing(app, {
    company: "Helix Labs",
    oneLiner: "Benchtop instruments for small labs",
    url: "https://helix.example/deck",
  });
  const unpaid = (await app.inject({ method: "GET", url: "/" })).body;
  const card = listingCard(unpaid, "Helix Labs");
  assert.match(card, /data-unranked="true"/);
  assert.match(card, /data-off-board="true"/);
  assert.match(card, /Unranked — no paid bid yet/);
  assert.match(card, /Not on the board/);
  assert.match(card, /Deck or site/);
  assert.match(card, /https:\/\/helix\.example\/deck/);
  assert.doesNotMatch(card, /Open deck|data-open-deck|data-first-click="open"/);
  assert.doesNotMatch(card, obsoleteHopMarkup);
  assert.doesNotMatch(card, /data-prize-first|data-later-deck|class="seat"/);
  assert.doesNotMatch(unpaid, /#1 ·/);
  assert.equal(getBid(app.db, listing.id, WEEK), undefined);
});

test("rendered pages never invent traction or social proof", async () => {
  const { app } = await makeApp();

  const empty = await app.inject({ method: "GET", url: "/" });
  assertNoInventedTractionOrSocialProof(empty.body);

  const listing = await createListing(app, {
    company: "Honest Pitch",
    oneLiner: "A real product story without fabricated proof",
    url: "https://honest.example/deck",
  });
  const unpaid = await app.inject({ method: "GET", url: "/" });
  assertNoInventedTractionOrSocialProof(unpaid.body);

  await payBid(app, listing.id, 5);
  const occupied = await app.inject({ method: "GET", url: "/" });
  assertNoInventedTractionOrSocialProof(occupied.body);

  const about = await app.inject({ method: "GET", url: "/about" });
  const rules = await app.inject({ method: "GET", url: "/rules" });
  assertNoInventedTractionOrSocialProof(about.body);
  assertNoInventedTractionOrSocialProof(rules.body);
});

test("product contract: one Open deck per paid card and one #1 Outbid entry", async () => {
  const { app } = await makeApp();
  const leader = await createListing(app, {
    company: "Stage Co",
    oneLiner: "Opens the room",
    url: "https://stage.example/deck",
  });
  await payBid(app, leader.id, 20);

  const later = await createListing(app, {
    company: "Helix Labs",
    oneLiner: "Benchtop instruments for small labs",
    url: "https://helix.example/deck",
  });
  await payBid(app, later.id, 8);

  await createListing(app, {
    company: "Cue Only",
    oneLiner: "Still waiting on Waffo",
    url: "https://cue.example/deck",
  });

  const response = await app.inject({ method: "GET", url: "/" });
  assert.equal(response.statusCode, 200);
  const html = response.body;
  assertPitchHouseCss(html, true);
  const leaderCard = listingCard(html, "Stage Co");
  const laterCard = listingCard(html, "Helix Labs");
  const unpaidCard = listingCard(html, "Cue Only");

  assert.match(html, /class="house house-occupied" data-occupied-house="true"/);
  assert.match(html, /data-claim-after-slot="true"/);
  assert.match(leaderCard, /data-rank="1"/);
  assert.match(leaderCard, /data-slot="paid-card"/);
  assert.match(leaderCard, /data-slot="card-body"/);
  assert.match(leaderCard, /data-slot="card-title"/);
  assert.match(leaderCard, /data-slot="card-description"/);
  assert.match(leaderCard, /data-slot="card-price"/);
  assert.match(leaderCard, /data-slot="card-meta"/);
  assert.match(leaderCard, /data-slot="card-action"/);
  assert.match(leaderCard, /data-bid="20"/);
  assert.match(leaderCard, /data-clicks="0"/);
  assert.match(html, /<label class="sr-only" for="company">Company<\/label><input id="company" name="company"/);
  assert.match(html, /<label class="sr-only" for="url">Deck or site<\/label><input id="url" name="url"/);
  assert.match(html, /<label class="sr-only" for="oneLiner">One-line pitch<\/label><input id="oneLiner" name="oneLiner"/);
  assert.match(leaderCard, /data-prize-first="true"/);
  assert.match(leaderCard, /data-open-first="true"/);
  assert.match(leaderCard, /data-top-three="true"/);
  assert.match(leaderCard, /class="cue open-first-cue"/);
  assert.match(leaderCard, /#1 · \$20/);
  assert.match(leaderCard, /data-card-price="\$20"/);
  assert.match(leaderCard, /data-later-fact="true"/);
  assert.match(leaderCard, /data-card-facts="true"/);
  assert.match(leaderCard, /class="card-host">stage\.example<\/span>/);
  assert.match(leaderCard, /class="card-host">stage\.example<\/span><span class="card-fact-separator" aria-hidden="true">·<\/span><span class="card-clicks">0 clicks<\/span>/);
  assert.match(leaderCard, /0 clicks/);
  assert.match(leaderCard, /data-open-deck="true"/);
  assert.match(leaderCard, /<p class="deck" data-slot="card-action" data-card-action="true">/);
  assert.match(leaderCard, /data-first-click="open"/);
  assert.equal(count(leaderCard, /Open deck/g), 1);
  assert.equal(count(leaderCard, /data-open-deck="true"/g), 1);

  assert.match(laterCard, /data-rank="2"/);
  assert.match(laterCard, /data-slot="paid-card"/);
  assert.match(laterCard, /data-bid="8"/);
  assert.match(laterCard, /data-clicks="0"/);
  assert.match(laterCard, /data-later-deck="true"/);
  assert.match(laterCard, /data-later-seat="true"/);
  assert.match(laterCard, /data-later-open-foot="true"/);
  assert.match(laterCard, /data-later-open-foot="true" data-card-action="true"/);
  assert.match(laterCard, /data-top-three="true"/);
  assert.match(laterCard, /data-card-price="\$8"/);
  assert.match(laterCard, /data-card-facts="true"/);
  assert.match(laterCard, /class="card-host">helix\.example<\/span>/);
  assert.match(laterCard, /class="card-host">helix\.example<\/span><span class="card-fact-separator" aria-hidden="true">·<\/span><span class="card-clicks">0 clicks<\/span>/);
  assert.match(leaderCard, /target="_blank"/);
  assert.match(laterCard, /target="_blank"/);
  assert.match(laterCard, /data-open-later="true"/);
  assert.equal(count(laterCard, /Open deck/g), 1);
  assert.equal(count(laterCard, /data-open-later="true"/g), 1);
  assert.doesNotMatch(laterCard, /data-prize-first|data-open-first|data-first-click="open"|data-open-deck/);
  assert.doesNotMatch(laterCard, /#1 ·/);

  assert.match(unpaidCard, /data-off-board="true"/);
  assert.doesNotMatch(unpaidCard, /data-rank=|data-bid=/);
  assert.match(unpaidCard, /data-clicks="0"/);
  assert.match(unpaidCard, /Unranked — no paid bid yet/);
  assert.doesNotMatch(unpaidCard, /Open deck|data-open-deck|data-open-later|data-first-click="open"/);
  assert.doesNotMatch(unpaidCard, /#1 ·|#2 ·|class="seat"/);
  assert.doesNotMatch(html, obsoleteHopMarkup);
  const markup = boardMarkup(html);
  assert.equal(count(markup, /data-first-click="open"/g), 1);
  assert.equal(count(markup, /data-open-deck="true"/g), 1);
  assert.equal(count(markup, /data-open-later="true"/g), 1);
  assert.equal(count(html, /class="outbid">Outbid<\/button>/g), 1);
  assert.match(html, /data-bid-step="-1"/);
  assert.match(html, /data-bid-step="1"/);
  assert.match(html, /class="bid-field"/);
  assert.match(html, /class="bid-row" data-after-action="true"/);
  assert.match(html, /data-beside-plus="true"/);
  assert.match(html, /Raise charge: \$<span data-raise-charge-usd>1<\/span> — only the difference/);
  const minusAt = markup.indexOf('data-bid-step="-1"');
  const amountAt = markup.indexOf('class="bid-field"');
  const plusAt = markup.indexOf('data-bid-step="1"');
  const occupiedOutbidAt = markup.indexOf('class="outbid">Outbid<\/button>');
  const afterActionAt = markup.indexOf('data-after-action="true"');
  assert.ok(minusAt > -1 && amountAt > minusAt && plusAt > amountAt);
  assert.ok(occupiedOutbidAt > plusAt && occupiedOutbidAt > afterActionAt);
  const leaderTitleAt = leaderCard.indexOf('class="company"');
  const leaderLineAt = leaderCard.indexOf('class="one-liner"');
  const leaderOpenAt = leaderCard.indexOf('data-first-click="open"');
  const leaderFactAt = leaderCard.indexOf('data-later-fact="true"');
  const leaderBidAt = leaderCard.indexOf("#1 · $20");
  const leaderClicksAt = leaderCard.indexOf("0 clicks");
  assert.ok(leaderTitleAt > -1 && leaderLineAt > leaderTitleAt);
  assert.ok(leaderOpenAt > leaderLineAt && leaderFactAt > leaderOpenAt);
  assert.ok(leaderBidAt > leaderFactAt && leaderClicksAt > leaderBidAt);
  assert.doesNotMatch(boardMarkup(html), /class="raise-after|class="open-after|data-(?:raise-after|open-after-raise|raise-after-open)/);

  const click = await app.inject({
    method: "POST",
    url: `/listings/${leader.id}/clicks`,
  });
  assert.equal(click.statusCode, 302);
  assert.equal(click.headers.location, "https://stage.example/deck");
  const afterClick = listingCard(
    (await app.inject({ method: "GET", url: "/" })).body,
    "Stage Co",
  );
  assert.match(afterClick, /data-clicks="1"/);
  assert.match(afterClick, /1 clicks/);
});

test("occupied cue sheet keeps later ranks as real paid stage cards", async () => {
  const { app } = await makeApp();
  const rows = [
    ["Alpha Room", "First pitch", "https://alpha.example/deck", 30],
    ["Bravo Room", "Second pitch", "https://bravo.example/deck", 20],
    ["Charlie Room", "Third pitch", "https://charlie.example/deck", 15],
    ["Delta Room", "Fourth pitch", "https://delta.example/deck", 10],
    ["Echo Room", "Fifth pitch", "https://echo.example/deck", 5],
  ] as const;
  for (const [company, oneLiner, url, amountUsd] of rows) {
    const listing = await createListing(app, { company, oneLiner, url });
    await payBid(app, listing.id, amountUsd);
  }

  const html = (await app.inject({ method: "GET", url: "/" })).body;
  const markup = boardMarkup(html);
  assert.match(markup, /data-stage-section="on-stage"/);
  assert.match(markup, /data-stage-list="on-stage"/);
  assert.match(markup, /data-stage-list="later-cues"/);
  assert.equal(count(markup, /data-stage-card="lead-cue"/g), 1);
  assert.equal(count(markup, /data-stage-card="later-cue"/g), 4);
  assert.doesNotMatch(markup, /data-todays-ranking|data-latest-activity|secondary-row|Today's top ranking|Listing and payment facts/);
  for (const [company, , , amountUsd] of rows) {
    const card = listingCard(html, company);
    assert.match(card, new RegExp(`data-bid="${amountUsd}"`));
    assert.match(card, /data-card-facts="true"/);
    assert.match(card, /0 clicks/);
  }
  const leadAt = markup.indexOf('data-stage-card="lead-cue"');
  const laterAt = markup.indexOf('data-stage-card="later-cue"');
  assert.ok(leadAt > -1 && laterAt > leadAt);
  const rankFourCard = listingCard(html, "Delta Room");
  assert.match(rankFourCard, /data-rank="4"/);
  assert.doesNotMatch(rankFourCard, /data-top-three="true"/);
});

test("period tabs navigate to a truthful paid archive", async () => {
  const { app, db } = await makeApp();

  const emptyArchive = await app.inject({
    method: "GET",
    url: "/?period=archive",
  });
  assert.equal(emptyArchive.statusCode, 200);
  assert.match(emptyArchive.body, /data-period="archive"/);
  assert.match(emptyArchive.body, /data-period-tab="open"[^>]*aria-selected="false"[^>]*href="\/"/);
  assert.match(emptyArchive.body, /data-period-tab="archive"[^>]*aria-selected="true"[^>]*href="\/\?period=archive"/);
  assert.match(emptyArchive.body, /data-archive-empty="true"/);
  assert.match(emptyArchive.body, /No historical paid pitches yet\./);
  assert.doesNotMatch(emptyArchive.body, /data-archive-board="true"|data-find-result="true"/);

  const listing = await createListing(app, {
    company: "Archive Pitch",
    oneLiner: "A real paid pitch from an earlier window",
    url: "https://archive.example/deck",
  });
  await payBid(app, listing.id, 14);
  db.prepare("UPDATE bids SET paid_at = ? WHERE listing_id = ?").run(
    "2026-08-10T12:00:00.000Z",
    listing.id,
  );

  const archive = await app.inject({
    method: "GET",
    url: "/?period=archive",
  });
  assert.equal(archive.statusCode, 200);
  assert.match(archive.body, /data-archive-board="true"/);
  assert.match(archive.body, /Past paid pitches/);
  assert.match(archive.body, /Archive Pitch/);
  assert.match(archive.body, /#1 · \$14/);
  assert.match(archive.body, /data-find-result="true"/);
  assert.match(archive.body, /class="find-result-host">archive\.example<\/span>/);
  assert.doesNotMatch(archive.body, /data-unranked="true"|No historical paid pitches yet\./);

  const open = await app.inject({ method: "GET", url: "/" });
  assert.match(open.body, /data-period="open"/);
  assert.match(open.body, /data-period-tab="open"[^>]*aria-selected="true"[^>]*href="\/"/);
  assert.match(open.body, /data-period-tab="archive"[^>]*aria-selected="false"[^>]*href="\/\?period=archive"/);
  assert.doesNotMatch(open.body, /data-archive-board="true"/);
});

test("HTML Outbid form creates a paid listing and preserves difference raise", async () => {
  const { app, db } = await makeApp();
  const posted = await app.inject({
    method: "POST",
    url: "/listings",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html",
    },
    payload: new URLSearchParams({
      company: "Stage Co",
      oneLiner: "Opens the room",
      url: "https://stage.example/deck",
      amountUsd: "5",
    }).toString(),
  });
  assert.equal(posted.statusCode, 303);
  assert.match(String(posted.headers.location), /^\/checkout\/complete\?checkoutId=fix_/);

  const listing = (await app.inject({ method: "GET", url: "/" })).body;
  assert.match(listing, /#1 · \$5/);
  assert.match(listing, /Stage Co/);
  assert.match(listing, /data-prize-first="true"/);
  assert.match(listing, /data-open-deck="true"/);
  assert.match(listing, /data-first-click="open"/);
  assert.equal(count(listing, /Open deck/g), 1);
  assert.doesNotMatch(listing, obsoleteHopMarkup);

  const raised = await app.inject({
    method: "POST",
    url: "/listings",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "text/html",
    },
    payload: new URLSearchParams({
      company: "Stage Co",
      oneLiner: "Opens the room",
      url: "https://stage.example/deck",
      amountUsd: "12",
    }).toString(),
  });
  assert.equal(raised.statusCode, 303);
  const id = [...(await app.inject({ method: "GET", url: "/" })).body.matchAll(/data-rank="1"/g)].length;
  assert.equal(id, 1);
  const existing = (await app.inject({ method: "GET", url: "/" })).body;
  assert.match(existing, /#1 · \$12/);
  assert.doesNotMatch(existing, /#2 ·/);
  assert.equal(count(listingCard(existing, "Stage Co"), /Stage Co/g), 1);
  assert.equal(count(existing, /data-find-result="true"/g), 1);
  assert.match(existing, /class="find-result-company">(?:&#\d+;)+ (?:&#\d+;)+<\/span>/);
  assert.match(existing, /class="find-result-summary">Opens the room<\/span>/);
  assert.match(existing, /class="find-result-host">stage\.example<\/span>/);
  assert.match(existing, /class="find-result-link" href="\/listings\/[^\"]+\/clicks"/);
  assert.match(existing, /#1 is \$12/);
  assert.match(existing, /Raise charge: \$<span data-raise-charge-usd>1<\/span> — only the difference/);
  assert.equal(getBid(db, "missing-listing", WEEK), undefined);
});

test("rolling house expiry keeps empty, occupied, and unranked surfaces separate", async () => {
  let now = new Date("2026-08-16T12:00:00.000Z");
  const db = openDatabase(":memory:");
  const payment = new WaffoFixture(db, { now: () => now });
  const app = await buildApp({ db, payment, now: () => now });
  after(async () => {
    await app.close();
    db.close();
  });

  const empty = (await app.inject({ method: "GET", url: "/" })).body;
  assertPitchHouseCss(empty, false);
  assert.match(empty, /class="house house-empty" data-empty-house="true"/);
  assert.doesNotMatch(boardMarkup(empty), /data-occupied-house|data-prize-first|data-first-click="open"/);

  const listing = await createListing(app, {
    company: "Sunday Pitch",
    oneLiner: "Paid before the calendar label rolls",
    url: "https://sunday.example/deck",
  });
  await payBid(app, listing.id, 20);

  now = new Date("2026-08-17T00:00:00.000Z");
  const monday = (await app.inject({ method: "GET", url: "/" })).body;
  assert.match(monday, /class="house house-occupied" data-occupied-house="true"/);
  assert.match(monday, /#1 · \$20/);
  assert.match(monday, /data-first-click="open"/);
  assert.doesNotMatch(boardMarkup(monday), /data-empty-house|house-empty|The room is empty/);

  now = new Date("2026-08-23T12:00:00.001Z");
  const agedResponse = await app.inject({ method: "GET", url: "/" });
  assert.equal(agedResponse.statusCode, 200);
  const aged = agedResponse.body;
  const agedBoard = boardMarkup(aged);
  assert.doesNotMatch(agedBoard, /data-occupied-house|house-occupied|data-prize-first|data-first-click="open"/);
  assert.doesNotMatch(aged, /#1 · \$20/);
  const unranked = listingCard(aged, "Sunday Pitch");
  assert.match(unranked, /data-unranked="true"/);
  assert.match(unranked, /data-off-board="true"/);
  assert.match(unranked, /Not on the board/);
  assert.doesNotMatch(unranked, /data-rank=|data-bid=|Open deck|class="seat"/);
});

test("checkout return is read-only and truthful for pending, paid, and cancel", async () => {
  const { app, db, payment } = await makeApp(false);
  const listing = await createListing(app, {
    company: "Pending Pitch",
    oneLiner: "Waiting for a signed payment",
    url: "https://pending.example/deck",
  });
  const checkout = await payment.createCheckout({
    listingId: listing.id,
    weekId: WEEK,
    chargeUsd: 5,
    nextUsd: 5,
  });
  assert.equal(payment.getCheckout(checkout.checkoutId)?.status, "pending");

  const pending = await app.inject({
    method: "GET",
    url: `/checkout/complete?checkoutId=${encodeURIComponent(checkout.checkoutId)}`,
  });
  assert.equal(pending.statusCode, 200);
  assert.match(pending.body, /data-return="pending"/);
  assert.match(pending.body, /checkout has not been confirmed/i);
  assert.match(pending.body, /No rank changes until confirmation arrives/);
  assert.doesNotMatch(pending.body, /Pending Pitch is on the house/);
  assert.equal(getBid(db, listing.id, WEEK), undefined);

  const forged = await app.inject({
    method: "GET",
    url: `/checkout/complete?checkoutId=${encodeURIComponent(checkout.checkoutId)}&status=paid`,
  });
  assert.match(forged.body, /data-return="pending"/);
  assert.equal(getBid(db, listing.id, WEEK), undefined);

  await payment.applyPaid(checkout.checkoutId, NOW.toISOString());
  const paid = await app.inject({
    method: "GET",
    url: `/checkout/complete?checkoutId=${encodeURIComponent(checkout.checkoutId)}`,
  });
  assert.match(paid.body, /data-return="paid"/);
  assert.match(paid.body, /Payment received/);
  assert.match(paid.body, /Pending Pitch is on the house at \$5/);
  assert.equal(getBid(db, listing.id, WEEK)?.amountUsd, 5);

  const cancel = await app.inject({
    method: "GET",
    url: `/checkout/complete?checkoutId=${encodeURIComponent(checkout.checkoutId)}&status=cancel`,
  });
  assert.match(cancel.body, /data-return="cancel"/);
  assert.match(cancel.body, /No rank was claimed/);
  assert.doesNotMatch(cancel.body, /data-return="paid"/);
});

test("exact local fixture uses the first.slot pitch house without a reference bypass", async () => {
  const { app } = await makeApp();
  const rows = [
    ["Open Take", "A rehearsal desk for founders to sharpen the first three minutes.", "https://open-take.example", 17_000],
    ["Signal Room", "Turn scattered product notes into a pitch the room can follow.", "https://signal-room.example", 16_000],
    ["First Sentence", "Find the one sentence that makes a new product worth hearing.", "https://first-sentence.example", 14_028],
  ] as const;

  for (const [company, oneLiner, url, amountUsd] of rows) {
    const listing = await createListing(app, { company, oneLiner, url });
    await payBid(app, listing.id, amountUsd);
  }

  const page = await app.inject({ method: "GET", url: "/" });
  assert.equal(page.statusCode, 200);
  assertPitchHouseCss(page.body, true);
  assert.match(page.body, /data-stage-section="opening-cue"/);
  assert.match(page.body, /data-stage-section="on-stage"/);
  assert.match(page.body, /data-stage-card="lead-cue"/);
  assert.match(page.body, /data-stage-card="later-cue"/);
  assert.match(page.body, /Open Take/);
  assert.match(page.body, /A rehearsal desk for founders to sharpen the first three minutes\./);
  assert.match(page.body, /Signal Room/);
  assert.match(page.body, /Turn scattered product notes into a pitch the room can follow\./);
  assert.match(page.body, /First Sentence/);
  assert.match(page.body, /Find the one sentence that makes a new product worth hearing\./);
  assert.match(page.body, /open-take\.example/);
  assert.match(page.body, /signal-room\.example/);
  assert.match(page.body, /first-sentence\.example/);
  assert.doesNotMatch(page.body, /see\.io|tutti\.so|joni\.ai|AI-powered website builder|Creator campaigns|Personal AI computer/);
  assert.match(page.body, /action="\/listings"/);
  assert.match(page.body, /name="url"/);
  assert.match(page.body, /name="amountUsd"/);
  assert.match(page.body, /data-bid="17000"/);
  assert.match(page.body, /data-bid="16000"/);
  assert.match(page.body, /data-bid="14028"/);
  assert.equal(count(boardMarkup(page.body), /data-first-click="open"/g), 1);
  assert.equal(count(boardMarkup(page.body), /data-open-deck="true"/g), 1);
  assert.equal(count(boardMarkup(page.body), /data-open-later="true"/g), 2);
  assert.equal(count(boardMarkup(page.body), /class="card-fact-separator" aria-hidden="true">·<\/span>/g), 3);
  assert.doesNotMatch(page.body, /(?:see\.io|tutti\.so|joni\.ai)0 clicks/);
  assert.doesNotMatch(page.body, /(?:href|data-target)="\/r\//);
  assert.doesNotMatch(page.body, /data-reference-fixture|outbid\.lol|DTC Picks Daily|118 online|1,404,927 visitors|New pitch|Outbid-aligned/);
  assert.doesNotMatch(page.body, /Polar/);
});

test("about and rules keep the rolling slot and raise-difference contract", async () => {
  const { app } = await makeApp();
  const about = await app.inject({ method: "GET", url: "/about" });
  assert.equal(about.statusCode, 200);
  assert.match(about.body, /opening 3-minute pitch/);
  assert.match(about.body, /cannot buy the show/i);
  assert.match(about.body, /eligible for <strong>seven days<\/strong>/i);

  const rules = await app.inject({ method: "GET", url: "/rules" });
  assert.equal(rules.statusCode, 200);
  assert.match(rules.body, /Raise = difference/);
  assert.match(rules.body, /Same listing inside seven days/i);
  assert.match(rules.body, /does not reset for everyone at Monday midnight/i);
  assert.match(rules.body, /Unpaid checkout sessions do not change rank/);
  const aboutContent = about.body.slice(about.body.indexOf('<article class="program"'));
  const rulesContent = rules.body.slice(rules.body.indexOf('<article class="program"'));
  assert.doesNotMatch(
    `${aboutContent}\n${rulesContent}`,
    /outbid\.lol|clone of|\bv1\b|fixture|Waffo|API keys|weekId|createdAt|paidAt|BLOCKED-/i,
  );
});
