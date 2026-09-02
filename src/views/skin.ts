/**
 * Shared visual parity treatment for the pitch-house surface.
 *
 * The old house rules below are kept as a compatibility layer for the
 * existing pitch-specific selectors. This final layer gives the public board
 * a warm paper surface and measured shell geometry without introducing any
 * new data, routes, or assets.
 */
const FIND_CSS = /* css */ `
.header-inner { position: relative; }
.find-toggle {
  display: inline-flex;
  flex: 0 0 auto;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--ink-soft);
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}
.find-toggle:hover,
.find-toggle:focus-visible {
  border-color: var(--spot);
  background: var(--soft-coral);
  color: var(--ink);
  outline: 2px solid var(--soft-coral);
  outline-offset: 2px;
}
.find-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 20;
  width: min(360px, calc(100vw - 32px));
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--card);
  color: var(--ink);
  box-shadow: 0 16px 32px rgb(86 62 52 / 0.14);
}
.find-popover[hidden] { display: none; }
.find-popover-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 8px;
}
.find-popover-head strong { color: var(--ink); font-size: 13px; line-height: 18px; }
.find-close {
  border: 0;
  background: transparent;
  color: var(--ink-soft);
  padding: 2px 4px;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
}
.find-close:hover,
.find-close:focus-visible { color: var(--spot); outline: 2px solid var(--soft-coral); outline-offset: 2px; }
.find-form { display: grid; gap: 4px; }
.find-form label { color: var(--ink-soft); font-size: 11px; line-height: 16px; }
.find-form input {
  width: 100%;
  height: 40px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--house);
  color: var(--ink);
  padding: 0 11px;
  font-size: 13px;
  line-height: 18px;
}
.find-form input::placeholder { color: var(--ink-soft); opacity: 1; }
.find-form input:focus-visible { border-color: var(--spot); outline: 3px solid rgb(217 119 95 / 0.2); outline-offset: 1px; }
.find-empty { margin: 10px 0 0; color: var(--ink-soft); font-size: 12px; line-height: 18px; }
.find-results { display: grid; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; }
.find-result {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 10px;
  padding: 8px 9px;
  border: 1px solid var(--soft-line);
  border-radius: 11px;
  background: var(--house-deep);
}
.find-result[hidden] { display: none; }
.find-result-copy { display: grid; min-width: 0; gap: 1px; }
.find-result-company { overflow: hidden; color: var(--ink); font-size: 12px; font-weight: 700; line-height: 17px; text-overflow: ellipsis; white-space: nowrap; }
.find-result-summary,
.find-result-host { overflow: hidden; color: var(--ink-soft); font-size: 11px; line-height: 15px; text-overflow: ellipsis; white-space: nowrap; }
.find-result-host { color: var(--spot); }
.find-result-fact { color: var(--spot); font-size: 11px; font-weight: 700; line-height: 17px; white-space: nowrap; }
.find-result-link { grid-column: 1 / -1; color: var(--spot); font-size: 11px; font-weight: 700; line-height: 16px; }
.find-result-link:hover,
.find-result-link:focus-visible { text-decoration: underline; outline: 0; }
@media (max-width: 640px) {
  .find-popover { right: 0; }
}
`;

const VISUAL_CSS = /* css */ `
:root {
  --house: #fbfaf8;
  --house-deep: #f8f5f2;
  --spot: #d9775f;
  --lamp: #e39a86;
  --curtain: #d9775f;
  --card: #fffdfb;
  --ink: rgb(47 45 44);
  --ink-soft: #746d69;
  --cream: rgb(47 45 44);
  --line: #e8e1dd;
  --soft-line: #f0e9e5;
  --soft-coral: #f8dfd7;
  --sans: "DM Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --serif: "DM Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

html, body { background: var(--house); color: var(--ink); }
/* Keep the document scrollable without reserving a platform scrollbar gutter. */
html {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
html::-webkit-scrollbar,
body::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}
body {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
body {
  min-height: 100%;
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.5;
  letter-spacing: -0.005em;
}
body::before { display: none; }
a { color: inherit; text-decoration: none; }
button, input { font-family: var(--sans); }
button:disabled { cursor: not-allowed; }

.site-header {
  width: 100%;
  max-width: none;
  height: 76px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
}
.header-inner {
  width: 100%;
  max-width: 992px;
  height: 76px;
  margin: 0 auto;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 18px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  color: var(--ink);
  font-family: var(--sans);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.045em;
  line-height: 1;
}
.brand-mark { display: block; width: 28px; height: 28px; flex: 0 0 28px; border-radius: 8px; }
.brand em { color: var(--spot); font-style: normal; }
.header-context {
  flex: 0 0 auto;
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
nav[aria-label="Main"] {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-left: auto;
  font-size: 13px;
}
nav[aria-label="Main"] a { color: var(--ink-soft); font-weight: 600; }
nav[aria-label="Main"] a:hover,
nav[aria-label="Main"] a:focus-visible,
nav[aria-label="Main"] a[aria-current="page"] { color: var(--ink); }
.theme-toggle {
  display: inline-flex;
  flex: 0 0 auto;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--ink-soft);
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}
.theme-toggle:hover,
.theme-toggle:focus-visible {
  border-color: var(--spot);
  background: var(--soft-coral);
  color: var(--ink);
  outline: 2px solid var(--soft-coral);
  outline-offset: 2px;
}

.page {
  width: 100%;
  max-width: 992px;
  margin: 0 auto;
  padding: 16px 0 64px;
}
.page[data-slot="home-shell"] { min-width: 0; }
.pitch-home {
  display: block;
  width: 100%;
  min-width: 0;
}
.pitch-home > .home-context,
.pitch-home > #claim,
.pitch-home > .claim-after-slot,
.pitch-home > .function-rail,
.pitch-home > .board-section,
.pitch-home > .secondary-section,
.pitch-home > .listings,
.pitch-home > .off-board,
.pitch-home > .pitch-details { min-width: 0; }
.home-context {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 32px;
}
.context-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 310px;
  min-height: 32px;
  padding: 6px 12px;
  border-radius: 999px;
  background: #f7f2ef;
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 20px;
}
.context-pill:hover,
.context-pill:focus-visible { color: var(--ink); outline: 2px solid var(--soft-coral); outline-offset: 2px; }
.context-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #4aa45d;
  box-shadow: 0 0 0 3px #e1f1e2;
}
.context-separator { color: #b5aaa4; }
.period-tabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: rgb(255 253 251 / 0.84);
}
.period-tabs-header {
  flex: 0 0 auto;
  width: 173px;
  min-width: 173px;
  height: 40px;
  min-height: 40px;
  margin-top: 4px;
  margin-left: 36px;
  box-sizing: border-box;
  padding: 4px;
}
.period-tabs-header .period-tab {
  flex: 1 1 0;
  justify-content: center;
  min-height: 30px;
  padding: 5px 11px;
}
.period-tabs-mobile { display: none; }
.period-tab {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 600;
}
.period-tab-active { background: var(--soft-coral); color: var(--ink); }
.period-tab-muted { color: #a69a94; }

#claim { margin: 20px 0 0; }
.stage-head[data-hero] { text-align: center; }
.hero-kicker {
  margin: 0 0 6px;
  color: var(--spot);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 18px;
  text-transform: uppercase;
}
h1.headline {
  margin: 0;
  color: var(--ink-soft);
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.03em;
  line-height: 20px;
  text-transform: uppercase;
}
.hero-kicker,
h1.headline,
.hero-subtitle { display: none; }
.hero-line {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 0;
}
.hero-title {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0;
  color: var(--ink);
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -0.06em;
  line-height: 60px;
  white-space: nowrap;
}
.hero-title-copy { min-width: 0; }
.hero-subtitle {
  max-width: 560px;
  margin: 4px auto 0;
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 20px;
}
.claim {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 0;
}
.step {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  border: 0;
  border-radius: 50%;
  background: var(--soft-coral);
  color: var(--spot);
  font-size: 15px;
  font-weight: 700;
  line-height: 24px;
}
.step:hover,
.step:focus-visible { background: #f0c4b8; outline: 2px solid var(--spot); outline-offset: 2px; }
.bid-field {
  display: inline-flex;
  align-items: baseline;
  color: var(--spot);
  font-family: var(--sans);
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -0.07em;
  line-height: 60px;
  text-decoration: none;
}
.bid-field .currency { margin-right: 1px; }
.bid-field input {
  width: 5ch;
  height: 60px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  outline: none;
}
.bid-field input:focus-visible {
  outline: 2px solid var(--spot);
  outline-offset: 4px;
  border-radius: 4px;
}

.bid-form {
  width: 100%;
  max-width: 992px;
  margin: 22px auto 0;
  display: grid;
  gap: 8px;
}
.bid-form > div,
.bid-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 256px 115px;
  align-items: center;
  gap: 8px;
}
.field { min-width: 0; flex: 1 1 0; }
.field-company { flex-basis: 0.9; }
.field-url { flex-basis: 1.4; }
.field-one-liner { flex-basis: 1.25; }
.field input,
.function-choice {
  width: 100%;
  height: 44px;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--card);
  color: var(--ink);
  padding: 0 14px;
  font-size: 14px;
  line-height: 20px;
}
.field input::placeholder { color: #9a8f89; opacity: 1; }
.field input:hover,
.function-choice:hover { border-color: #d8c9c2; }
.field input:focus-visible {
  border-color: var(--spot);
  outline: 3px solid rgb(217 119 95 / 0.2);
  outline-offset: 1px;
}
.function-choice {
  display: flex;
  min-width: 154px;
  width: 100%;
  flex: none;
  align-items: center;
  justify-content: space-between;
  color: var(--ink-soft);
  white-space: nowrap;
}
.function-choice-detail { color: var(--spot); font-size: 12px; font-weight: 700; }
.outbid {
  min-width: 112px;
  height: 44px;
  flex: 0 0 auto;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--spot);
  color: #fff;
  padding: 0 20px;
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
}
.outbid:hover,
.outbid:focus-visible { background: #c96550; outline: 3px solid rgb(217 119 95 / 0.24); outline-offset: 1px; }
.outbid:disabled,
.outbid[aria-disabled="true"] { background: #edb9ab; color: #fff; opacity: 0.96; outline: 0; }
.form-hint {
  margin: 0;
  color: #998e88;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
  display: none;
}
.pitch-details {
  width: 100%;
  border: 1px solid var(--soft-line);
  border-radius: 16px;
  background: rgb(255 253 251 / 0.58);
  color: var(--ink-soft);
}
.pitch-details summary {
  display: flex;
  min-height: 32px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  list-style: none;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
}
.pitch-details summary::-webkit-details-marker { display: none; }
.pitch-details summary span { color: #9a8f89; font-weight: 500; }
.pitch-details summary:hover,
.pitch-details summary:focus-visible { color: var(--ink); outline: 2px solid var(--soft-coral); outline-offset: -2px; }
.pitch-detail-fields {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.25fr);
  gap: 8px;
  padding: 0 8px 8px;
}
.pitch-detail-fields .field input { height: 40px; }
.claim-note {
  max-width: 620px;
  margin: 10px auto 0;
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 20px;
  text-align: center;
}
.claim-note .room { display: block; color: var(--ink); font-family: var(--sans); font-size: 14px; font-weight: 700; }
.claim-note .week-window[data-rolling-week] { display: inline; margin-left: 6px; color: #9b908a; font-size: 12px; }

.function-rail {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  margin: 28px 0 24px;
  padding: 0 0 4px;
  border-bottom: 1px solid var(--soft-line);
  overflow: hidden;
  white-space: nowrap;
}
.rail-scroll {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
  gap: 4px;
}
.rail-item,
.rail-more {
  display: inline-flex;
  flex: 0 0 auto;
  min-height: 32px;
  align-items: center;
  gap: 5px;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--ink-soft);
  padding: 4px 11px;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}
.rail-item:hover,
.rail-item:focus-visible { border-color: var(--line); color: var(--ink); outline: 0; }
.rail-item-active { background: var(--spot); color: #fff; }
.rail-item-active:hover,
.rail-item-active:focus-visible { border-color: var(--spot); background: #c96550; color: #fff; }
.rail-more { margin-left: auto; border-color: var(--line); background: var(--card); color: var(--ink); }
.rail-more:disabled { opacity: 1; }
.function-rail {
  position: relative;
  overflow: visible;
}

@media (min-width: 641px) {
  .bid-form { margin-top: 24.5px; }
  .function-rail {
    height: 32px;
    min-height: 32px;
    margin: 32px 0 20px;
    padding: 0;
  }
}

.rail-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 10;
  display: grid;
  min-width: 180px;
  gap: 2px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--card);
  color: var(--ink);
  box-shadow: 0 12px 28px rgb(86 62 52 / 0.12);
}
.rail-menu[hidden] { display: none; }
.rail-menu-item {
  display: flex;
  min-height: 32px;
  align-items: center;
  border-radius: 9px;
  color: var(--ink-soft);
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}
.rail-menu-item:hover,
.rail-menu-item:focus-visible {
  background: var(--soft-coral);
  color: var(--ink);
  outline: 0;
}

.board-section { width: 100%; }
.board-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin: 0 0 10px;
}
.board-heading h2 { margin: 0; color: var(--ink); font-size: 18px; font-weight: 700; letter-spacing: -0.025em; line-height: 26px; }
.section-kicker { margin: 0 0 2px; color: var(--spot); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; line-height: 16px; text-transform: uppercase; }
.board-key { margin: 0; color: #9a8f89; font-size: 11px; line-height: 16px; text-align: right; }
.listings {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.listing {
  position: relative;
  min-height: 86px;
  padding: 16px 18px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--card);
  color: var(--ink);
  box-shadow: 0 7px 18px rgb(86 62 52 / 0.05);
  transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
}
.listing[data-top-three="true"] { box-sizing: border-box; height: 110px; min-height: 110px; overflow: hidden; padding: 16px 18px 14px 66px; border-radius: 25.2px; }
.listing[data-top-three="true"]::before {
  content: "#" attr(data-rank);
  position: absolute;
  top: 50%;
  left: 16px;
  display: inline-flex;
  width: 36px;
  height: 28px;
  align-items: center;
  justify-content: center;
  transform: translateY(-50%);
  border-radius: 999px;
  background: var(--spot);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}
.listing[data-top-three="true"] .cue {
  position: relative;
  display: block;
  height: 100%;
  min-height: 0;
}
.listing[data-top-three="true"] .who { min-width: 0; padding-right: 150px; }
.listing[data-top-three="true"] .company { overflow: hidden; color: var(--ink); font-family: var(--sans); font-size: 16px; font-weight: 700; letter-spacing: -0.025em; line-height: 20px; text-overflow: ellipsis; white-space: nowrap; }
.listing[data-top-three="true"] .one-liner { display: -webkit-box; overflow: hidden; color: var(--ink-soft); font-size: 14px; line-height: 20px; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.listing[data-top-three="true"] .rank.later-fact,
.listing[data-top-three="true"] .seat .rank { margin: 0; color: var(--spot); font-family: var(--sans); font-size: 14px; font-weight: 700; line-height: 20px; text-align: right; }
.listing[data-top-three="true"] .clicks { margin: 0; color: #9b908a; font-size: 12px; line-height: 16px; }
.listing[data-top-three="true"] .deck,
.listing[data-top-three="true"] .later-open-foot { position: absolute; top: 0; right: 0; margin: 0; padding: 0; border: 0; }
.listing[data-top-three="true"] .open-deck,
.listing[data-top-three="true"] .open-later { display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--ink); padding: 7px 11px; font-family: var(--sans); font-size: 12px; font-weight: 700; line-height: 16px; text-decoration: none; }
.listing[data-top-three="true"] .open-deck:hover,
.listing[data-top-three="true"] .open-deck:focus-visible,
.listing[data-top-three="true"] .open-later:hover,
.listing[data-top-three="true"] .open-later:focus-visible { border-color: var(--spot); color: var(--spot); outline: 0; }
.listing[data-top-three="true"] .open-deck .deck-url,
.listing[data-top-three="true"] .open-later .deck-url { display: none; }
.listing[data-top-three="true"][data-open-first] .open-first-cue {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 18px;
}
.listing[data-top-three="true"][data-open-first] .open-first-cue .deck {
  grid-column: 2;
  grid-row: 1 / span 2;
  margin: 0;
  padding: 0;
  border: 0;
}
.listing[data-top-three="true"][data-open-first] .open-first-cue .open-deck[data-first-click="open"] {
  display: inline-flex;
  align-items: center;
  padding: 7px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
  color: var(--ink);
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 700;
  line-height: 18px;
  letter-spacing: 0;
  text-decoration: none;
}
.listing[data-top-three="true"][data-open-first] .open-first-cue .open-deck[data-first-click="open"]:hover,
.listing[data-top-three="true"][data-open-first] .open-first-cue .open-deck[data-first-click="open"]:focus-visible {
  border-color: var(--spot);
  color: var(--spot);
  outline: 0;
}
.listing[data-top-three="true"][data-later-deck] .later-cue {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 18px;
}
.listing[data-top-three="true"][data-later-deck] .later-open-foot {
  grid-column: 2;
  grid-row: 1 / span 2;
  margin: 0;
  padding: 0;
  border: 0;
}
.listing[data-top-three="true"] .rank.later-fact { position: absolute; right: 0; bottom: 18px; text-align: right; }
.listing[data-top-three="true"] .clicks { position: absolute; left: 0; bottom: 0; }
.listing[data-top-three="true"] .seat { display: contents; }
.listing[data-top-three="true"] .seat .cue-label { display: none; }
.listing[data-top-three="true"] .seat .rank { position: absolute; top: 0; right: 0; }
.listing[data-top-three="true"] .seat .clicks { left: 0; bottom: 0; }
.house-occupied[data-occupied-house] .listing[data-top-three="true"] .company {
  font-size: 16px;
  line-height: 20px;
}
.house-occupied[data-occupied-house] .listing[data-top-three="true"] .one-liner {
  font-size: 14px;
  line-height: 20px;
}
.house-occupied[data-occupied-house] .listing[data-top-three="true"] .rank.later-fact,
.house-occupied[data-occupied-house] .listing[data-top-three="true"] .seat .rank {
  font-size: 14px;
  line-height: 20px;
}
.house-occupied[data-occupied-house] .listing[data-top-three="true"] .clicks {
  font-size: 12px;
  line-height: 16px;
}
.listing[data-top-three="true"]:hover,
.listing[data-top-three="true"]:focus-within { border-color: var(--spot); box-shadow: 0 10px 24px rgb(217 119 95 / 0.14); transform: translateY(-1px); }
.listing[data-rank='1'] { border: 2px solid var(--spot); background: #f6dfd8; }
.listing[data-rank='1']::before { background: var(--spot); color: #fff; }
.listing[data-rank='2'] { background: #fcf3ee; }
.listing[data-rank='3'] { background: #fdf9f6; }
.house-occupied[data-occupied-house] .listings-later[data-later-seats] .listing[data-top-three='true'][data-rank='2'],
.house-occupied[data-occupied-house] .listings-later[data-later-seats] .listing[data-top-three='true'][data-rank='3'] {
  background: #fcf3ee;
  border: 1px solid #f0d8d0;
  outline: 0;
  box-shadow: 0 5px 14px rgb(217 119 95 / 0.05);
}
.house-occupied[data-occupied-house] .listings-later[data-later-seats] .listing[data-top-three='true'][data-rank='3'] {
  background: #fdf9f6;
}
.listing[data-rank='1'] .rank.later-fact { color: var(--spot); }
.listings-later { margin-top: 15px; gap: 16px; }
.listings-later .listing { min-height: 72px; padding: 12px 16px; border-radius: 18px; box-shadow: none; background: #fffdfa; }
.listings-later .listing[data-top-three="true"] { min-height: 106px; padding: 16px 18px 14px 66px; border-radius: 25.2px; box-shadow: 0 7px 18px rgb(86 62 52 / 0.05); }
.listings-later .listing[data-top-three="true"] .later-open-foot { top: auto; bottom: 0; right: 0; }
.listing[data-top-three="true"] > .deck { top: 0; right: 0; margin: 0; padding: 0; border: 0; }
.listings-later .listing:not([data-top-three]) .company { font-family: var(--sans); font-size: 15px; font-weight: 700; }
.listings-later .listing:not([data-top-three]) .one-liner { color: var(--ink-soft); font-size: 12px; }
.listings-later .listing:not([data-top-three]) .later-cue { grid-template-columns: minmax(0, 1fr) auto; }
.listings-later .listing:not([data-top-three]) .later-open-foot { grid-column: 2; grid-row: 1 / span 2; margin: 0; padding: 0; border: 0; }
.listings-beyond { margin-top: 37px; gap: 8px; }
.secondary-section { margin: 28px 0 0; }
.secondary-section + .secondary-section { margin-top: 27px; }
.secondary-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  min-height: 26px;
  margin: 0;
}
.secondary-heading h2 { margin: 0; color: var(--ink); font-size: 18px; font-weight: 700; letter-spacing: -0.025em; line-height: 26px; }
.secondary-window { color: #9a8f89; font-size: 11px; line-height: 16px; white-space: nowrap; }
.secondary-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.secondary-ranking .secondary-list { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.secondary-ranking .secondary-row {
  height: 64px;
  min-height: 64px;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  padding: 10px 12px;
  border: 1px solid #f0d8d0;
  border-radius: 16px;
  background: #fffdfb;
  box-shadow: 0 7px 16px rgb(217 119 95 / 0.05);
}
.secondary-row {
  display: grid;
  min-height: 22px;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 0 2px;
  border-bottom: 1px solid var(--soft-line);
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 18px;
}
.secondary-row:last-child { border-bottom: 0; }
.secondary-rank { color: var(--spot); font-weight: 700; }
.secondary-company,
.activity-company { overflow: hidden; color: var(--ink); font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.secondary-bid,
.activity-detail { color: var(--spot); font-size: 12px; font-weight: 700; white-space: nowrap; }
.secondary-activity .secondary-list { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.secondary-activity .secondary-row {
  height: 50px;
  min-height: 50px;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto auto;
  align-content: center;
  gap: 0;
  padding: 8px 10px;
  border: 1px solid #ece4df;
  border-radius: 12px;
  background: #f8f5f2;
}
.secondary-ranking .secondary-row:last-child { border: 1px solid #f0d8d0; }
.secondary-activity .secondary-row:last-child { border: 1px solid #ece4df; }
.activity-row { grid-template-columns: 92px minmax(0, 1fr) auto; }
.activity-kind { color: var(--ink-soft); font-size: 11px; font-weight: 600; }
.activity-detail { color: var(--ink-soft); font-size: 11px; font-weight: 600; }
.off-board { margin: 24px 0 0; }
.board-heading-quiet { margin-bottom: 8px; }
.off-board-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.listing[data-off-board] { min-height: 64px; padding: 13px 16px; border: 1px dashed #dfd2cb; border-radius: 16px; background: transparent; box-shadow: none; color: var(--ink-soft); }
.listing[data-off-board] .company { color: var(--ink); font-family: var(--sans); font-size: 15px; font-weight: 700; }
.listing[data-off-board] .one-liner,
.listing[data-off-board] .rank,
.listing[data-off-board] .clicks { color: var(--ink-soft); font-size: 12px; }
.listing[data-off-board] .listing-url { color: var(--spot); font-size: 12px; }

.house-occupied[data-occupied-house] .listings { margin-top: 0; }
.house-occupied[data-occupied-house] .listings-later[data-later-seats] { margin-top: 15px; gap: 16px; }
.leaderboard[data-top-three-list="true"] { margin: 0; gap: 12px; }
.house-occupied[data-occupied-house] .leaderboard[data-top-three-list="true"] { margin-top: 0; gap: 12px; }
.house-occupied[data-occupied-house] .leaderboard[data-top-three-list="true"] .listing[data-top-three="true"][data-rank='2'],
.house-occupied[data-occupied-house] .leaderboard[data-top-three-list="true"] .listing[data-top-three="true"][data-rank='3'] {
  background: #fffdfb;
  border: 1px solid #f0d8d0;
  outline: 0;
  box-shadow: 0 5px 14px rgb(217 119 95 / 0.05);
}
.house-occupied[data-occupied-house] .listings-beyond[data-later-seats] { margin-top: 37px; gap: 8px; }
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--soft-line);
}
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .stage-head[data-quiet-headline] .hero-kicker,
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .stage-head[data-quiet-headline] .headline,
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .hero-subtitle { color: #a1958e; font-size: 11px; line-height: 16px; }
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .hero-title { font-size: 25px; line-height: 36px; }
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .bid-field { font-size: 25px; line-height: 36px; }
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .bid-field input { height: 36px; }
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .claim { margin-top: 0; }
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .bid-form { margin-top: 14px; }
.house-occupied[data-occupied-house] .claim-note[data-after-outbid] { margin-top: 10px; }
.house-occupied[data-occupied-house] .claim-after-slot.claim-primary[data-claim-after-slot] {
  margin: 0;
  padding: 0;
  border: 0;
}
.house-occupied[data-occupied-house] #claim .bid-row[data-after-action] {
  padding-right: 0;
}
.house-occupied[data-occupied-house] .claim-after-slot.claim-primary[data-claim-after-slot] .hero-title {
  font-size: 40px;
  line-height: 60px;
}
.house-occupied[data-occupied-house] .claim-after-slot.claim-primary[data-claim-after-slot] .bid-field {
  font-size: 40px;
  line-height: 60px;
}
.house-occupied[data-occupied-house] .claim-after-slot.claim-primary[data-claim-after-slot] .bid-field input {
  height: 60px;
}
.house-occupied[data-occupied-house] .claim-after-slot.claim-primary[data-claim-after-slot] .bid-form {
  margin-top: 22px;
}
@media (min-width: 641px) {
  .house-occupied[data-occupied-house] .claim-after-slot.claim-primary[data-claim-after-slot] .bid-form {
    margin-top: 24.5px;
  }
}
.house-occupied[data-occupied-house] #claim .claim-note[data-after-outbid],
.house-occupied[data-occupied-house] .board-heading { display: none; }

.program { background: var(--card); color: var(--ink); border: 1px solid var(--line); border-radius: 20px; box-shadow: 0 8px 24px rgb(86 62 52 / 0.06); }
.program h1 { font-family: var(--sans); font-weight: 700; }
.program p, .program li { color: var(--ink-soft); }
.program strong { color: var(--ink); }
.program a { color: var(--spot); }

/* r10: make every highlighted pitch share one bounded card anatomy. */
.listing[data-top-three="true"].top { outline: 0; outline-offset: 0; }
.listing[data-top-three="true"] .cue {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  grid-template-rows: auto minmax(0, 1fr) auto;
  align-items: start;
  column-gap: 18px;
  row-gap: 2px;
  height: 100%;
  min-height: 0;
}
.listing[data-top-three="true"] .who {
  display: grid;
  grid-column: 1;
  grid-row: 1 / span 2;
  grid-template-rows: auto minmax(0, 1fr);
  align-content: start;
  min-width: 0;
  height: 100%;
  padding-right: 0;
  gap: 2px;
}
.listing[data-top-three="true"] .company {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
}
.listing[data-top-three="true"] .one-liner {
  grid-column: 1;
  grid-row: 2;
  min-width: 0;
  max-width: none;
  align-self: start;
}
.listing[data-top-three="true"] .rank.later-fact,
.listing[data-top-three="true"] .seat .rank {
  grid-column: 2;
  grid-row: 1;
  position: static;
  align-self: start;
  min-width: max-content;
  margin: 0;
  padding: 0;
  color: transparent;
  font-size: 0;
  line-height: 20px;
  text-align: right;
}
.listing[data-top-three="true"] .rank[data-card-price]::after {
  content: attr(data-card-price);
  color: var(--spot);
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
}
.listing[data-top-three="true"] .seat { display: contents; }
.listing[data-top-three="true"] .clicks {
  grid-column: 1;
  grid-row: 3;
  position: static;
  align-self: end;
  margin: 0;
}
.listing[data-top-three="true"] .deck,
.listing[data-top-three="true"] .later-open-foot {
  grid-column: 2;
  grid-row: 3;
  position: static;
  align-self: end;
  justify-self: end;
  margin: 0;
  padding: 0;
  border: 0;
}
.house-occupied[data-occupied-house] .listing[data-top-three="true"] .later-open-foot[data-later-open-foot] {
  border: 0;
}
.listing[data-top-three="true"] .open-deck,
.listing[data-top-three="true"] .open-later {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  width: max-content;
  padding: 5px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 700;
  line-height: 16px;
  text-decoration: none;
}

/* r11: finish the shared card tracks after the legacy occupied skin. */
.house-occupied[data-occupied-house] .listings-later[data-later-seats]:not(.listings-beyond) {
  margin-top: 6px;
  gap: 6px;
}
.listing[data-top-three="true"]::before {
  top: 40px;
  transform: none;
}
.listing[data-top-three="true"] .rank .rank-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.listing[data-top-three="true"] .deck,
.listing[data-top-three="true"] .later-open-foot {
  width: max-content;
  min-width: max-content;
}
.listing[data-top-three="true"][data-open-first] .open-first-cue .deck {
  grid-column: 2;
  grid-row: 3;
  position: static;
  top: auto;
  right: auto;
  align-self: end;
  justify-self: end;
  margin: 0;
  padding: 0;
  border: 0;
}

/* r13: normalize later-card padding and keep the rank column after legacy skin rules. */
.house-occupied[data-occupied-house] .listings-later[data-later-seats]:not(.listings-beyond) .listing[data-top-three="true"] {
  padding: 16px 18px 14px 66px;
}
.listing[data-top-three="true"] .clicks[data-card-facts="true"] {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.listing[data-top-three="true"] .card-host {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.listing[data-top-three="true"] .card-clicks {
  flex: 0 0 auto;
  white-space: nowrap;
}

/* r14: keep the mobile shell and each paid card on the shared tracks. */
.listing[data-top-three="true"] {
  box-sizing: border-box;
}
.listing[data-top-three="true"] .one-liner {
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.listing[data-top-three="true"] .deck[data-card-action="true"],
.listing[data-top-three="true"] .later-open-foot[data-card-action="true"] {
  position: static;
  grid-column: 2;
  grid-row: 3;
  align-self: end;
  justify-self: end;
  margin: 0;
  padding: 0;
  border: 0;
}
.listing[data-top-three="true"][data-open-first] .open-first-cue,
.listing[data-top-three="true"][data-later-deck] .later-cue {
  grid-template-columns: minmax(0, 1fr) max-content;
}
.listing[data-top-three="true"][data-open-first] .open-first-cue .deck[data-card-action="true"],
.listing[data-top-three="true"][data-later-deck] .later-cue .later-open-foot[data-card-action="true"] {
  position: static;
  grid-column: 2;
  grid-row: 3;
  align-self: end;
  justify-self: end;
  margin: 0;
  padding: 0;
  border: 0;
}

@media (max-width: 640px) {
  .site-header { height: 69px; }
  .header-inner { height: 69px; padding: 0 16px; gap: 12px; }
  .brand { font-size: 19px; }
  .period-tabs-header { display: none; }
  .header-context { display: none; }
  nav[aria-label="Main"] { gap: 12px; font-size: 12px; }
  .theme-toggle { min-height: 32px; padding: 4px 9px; font-size: 11px; }
  nav[aria-label="Main"] a:first-child,
  nav[aria-label="Main"] a:nth-of-type(3) { display: none; }
  .page { max-width: none; padding: 16px 16px 48px; }
  .home-context { flex-direction: column; gap: 22px; min-height: 88px; }
  .context-pill { width: 306px; font-size: 12px; justify-content: center; }
  .period-tabs-mobile {
    display: inline-flex;
    width: 173px;
    min-width: 173px;
    height: 40px;
    min-height: 40px;
    box-sizing: border-box;
  }
  .period-tabs-mobile .period-tab {
    flex: 1 1 0;
    justify-content: center;
  }
  #claim { margin-top: 18px; }
  .period-tab { min-height: 32px; }
  #claim { margin-top: 24px; }
  .hero-kicker { margin-bottom: 4px; font-size: 10px; line-height: 16px; }
  .hero-line { gap: 6px; margin-top: 2px; }
  .hero-title { font-size: 28px; line-height: 42px; letter-spacing: -0.055em; }
  .hero-subtitle { margin-top: 2px; font-size: 12px; line-height: 18px; }
  .claim { gap: 6px; }
  .step { width: 22px; height: 22px; flex-basis: 22px; line-height: 22px; }
  .bid-field { font-size: 28px; line-height: 42px; }
  .bid-field input { height: 42px; }
  .bid-form { margin-top: 4px; gap: 8px; }
  .bid-form > div,
  .bid-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .bid-form > div[data-primary-form-row],
  .bid-row[data-primary-form-row] { grid-template-columns: minmax(0, 1fr); }
  .field, .function-choice { width: 100%; min-width: 0; flex: none; }
  .field input, .function-choice, .outbid { height: 44px; }
  .function-choice { min-width: 0; }
  .outbid { width: 100%; }
  .form-hint { font-size: 11px; }
  .claim-note { font-size: 12px; line-height: 18px; }
  .claim-note .week-window[data-rolling-week] { display: block; margin: 2px 0 0; }
  .function-rail {
    height: 32px;
    min-height: 32px;
    margin: 32px 0 20px;
    padding: 0;
    gap: 2px;
    overflow: visible;
  }
  .rail-item, .rail-more { min-height: 32px; padding: 4px 9px; font-size: 11px; }
  .rail-scroll { flex: 1 1 auto; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
  .rail-scroll::-webkit-scrollbar { display: none; }
  .rail-more { margin-left: 0; }
  .board-heading { align-items: start; margin-bottom: 8px; }
  .board-heading h2 { font-size: 16px; line-height: 23px; }
  .board-key { max-width: 120px; font-size: 10px; line-height: 14px; }
  .listings { gap: 8px; }
  .leaderboard[data-top-three-list="true"],
  .house-occupied[data-occupied-house] .leaderboard[data-top-three-list="true"] { margin-top: 0; gap: 6px; }
  .listing[data-top-three="true"] { box-sizing: border-box; height: 123px; min-height: 123px; overflow: hidden; padding: 13px 12px 12px 54px; border-radius: 20px; }
  .listings-later .listing[data-top-three="true"] { box-sizing: border-box; height: 123px; min-height: 123px; overflow: hidden; padding: 13px 12px 12px 54px; border-radius: 20px; }
  .listing[data-top-three="true"]::before { left: 12px; width: 32px; height: 25px; font-size: 11px; }
  .listing[data-top-three="true"] .cue { grid-template-columns: minmax(0, 1fr) max-content; gap: 2px 8px; }
  .listing[data-top-three="true"] .who { padding-right: 105px; }
  .listing[data-top-three="true"] .company { font-size: 16px; line-height: 20px; }
  .listing[data-top-three="true"] .one-liner { max-width: 208px; font-size: 14px; line-height: 20px; }
  .listing[data-top-three="true"] .rank.later-fact,
  .listing[data-top-three="true"] .seat .rank { font-size: 12px; line-height: 17px; }
  .listing[data-top-three="true"] .clicks { font-size: 12px; line-height: 16px; }
  .house-occupied[data-occupied-house] .listing[data-top-three="true"] .company { font-size: 16px; line-height: 20px; }
  .house-occupied[data-occupied-house] .listing[data-top-three="true"] .one-liner { max-width: 208px; font-size: 14px; line-height: 20px; }
  .house-occupied[data-occupied-house] .listing[data-top-three="true"] .rank.later-fact,
  .house-occupied[data-occupied-house] .listing[data-top-three="true"] .seat .rank { font-size: 12px; line-height: 17px; }
  .house-occupied[data-occupied-house] .listing[data-top-three="true"] .clicks { font-size: 12px; line-height: 16px; }
  .listing[data-top-three="true"] .open-deck,
  .listing[data-top-three="true"] .open-later { padding: 5px 8px; font-size: 10px; line-height: 16px; }
  .listing[data-top-three="true"][data-open-first] .open-first-cue .open-deck[data-first-click="open"] {
    padding: 5px 8px;
    font-size: 10px;
    line-height: 16px;
  }
  .listing[data-top-three="true"] .deck { grid-column: 2; grid-row: 2 / span 2; }
  .listing[data-top-three="true"] .rank.later-fact { grid-column: 1; grid-row: 2; }
  .listing[data-top-three="true"] .clicks { grid-column: 1; grid-row: 3; }
  .listing[data-top-three="true"] .who { padding-right: 0; }
  .listing[data-top-three="true"] .one-liner { max-width: none; }
  .listing[data-top-three="true"] .rank.later-fact,
  .listing[data-top-three="true"] .seat .rank {
    grid-column: 2;
    grid-row: 1;
    line-height: 17px;
  }
  .listing[data-top-three="true"] .rank[data-card-price]::after {
    font-size: 12px;
    line-height: 17px;
  }
  .listing[data-top-three="true"] .deck,
  .listing[data-top-three="true"] .later-open-foot {
    grid-column: 2;
    grid-row: 3;
    position: static;
    align-self: end;
    justify-self: end;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .house-occupied[data-occupied-house] .listing[data-top-three="true"] .later-open-foot[data-later-open-foot] {
    border: 0;
  }
  .listing[data-top-three="true"]::before {
    top: 24px;
    transform: none;
  }
  .listings-later { margin-top: 8px; gap: 8px; }
  .listings-later .listing { min-height: 84px; padding: 11px 12px; border-radius: 16px; }
  .listings-beyond { margin-top: 5px; gap: 8px; }
  .house-occupied[data-occupied-house] .listings-later[data-later-seats]:not(.listings-beyond) { margin-top: 6px; gap: 6px; }
  .house-occupied[data-occupied-house] .listings-later[data-later-seats]:not(.listings-beyond) .listing[data-top-three="true"] { padding: 13px 12px 12px 54px; }
  .house-occupied[data-occupied-house] .listings-beyond[data-later-seats] { margin-top: 5px; gap: 8px; }
  .secondary-section { display: block; }
  .secondary-section { margin-top: 24px; }
  .secondary-section + .secondary-section { margin-top: 10px; }
  .secondary-heading { gap: 10px; min-height: 23px; margin-bottom: 6px; }
  .secondary-heading h2 { font-size: 16px; line-height: 23px; }
  .secondary-window { font-size: 10px; line-height: 14px; }
  .secondary-row { min-height: 22px; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 7px; font-size: 11px; }
  .activity-row { grid-template-columns: 74px minmax(0, 1fr) auto; }
  .off-board { margin-top: 18px; }
  .listing[data-off-board] { min-height: 70px; padding: 11px 12px; }
  .house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] { margin-top: 22px; padding-top: 16px; }
  .house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .hero-line { flex-wrap: wrap; }
  .house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .bid-form > div { display: grid; }
  .house-occupied[data-occupied-house] #claim .bid-row[data-after-action] { padding-right: 0; }
  .house-occupied[data-occupied-house] .claim-after-slot.claim-primary[data-claim-after-slot] .hero-line { flex-wrap: nowrap; }
  .house-occupied[data-occupied-house] .claim-after-slot.claim-primary[data-claim-after-slot] .hero-title {
    font-size: 28px;
    line-height: 42px;
  }
  .house-occupied[data-occupied-house] .claim-after-slot.claim-primary[data-claim-after-slot] .bid-field {
    font-size: 28px;
    line-height: 42px;
  }
  .house-occupied[data-occupied-house] .claim-after-slot.claim-primary[data-claim-after-slot] .bid-field input { height: 42px; }
  .house-occupied[data-occupied-house] .claim-after-slot.claim-primary[data-claim-after-slot] .bid-form { margin-top: 20px; }
  .house-occupied[data-occupied-house] .claim-after-slot.claim-primary[data-claim-after-slot] .bid-row[data-after-action] .field input,
  .house-occupied[data-occupied-house] .claim-after-slot.claim-primary[data-claim-after-slot] .bid-row[data-after-action] .function-choice,
  .house-occupied[data-occupied-house] .claim-after-slot.claim-primary[data-claim-after-slot] .bid-row[data-after-action] .outbid { height: 44px; }
  .house-occupied[data-occupied-house] .listings-later[data-later-seats] .listing[data-top-three='true'][data-rank='2'],
  .house-occupied[data-occupied-house] .listings-later[data-later-seats] .listing[data-top-three='true'][data-rank='3'] {
    background: #fcf3ee;
    border: 1px solid #f0d8d0;
    outline: 0;
  }
  .house-occupied[data-occupied-house] .listings-later[data-later-seats] .listing[data-top-three='true'][data-rank='3'] {
    background: #fdf9f6;
  }
  .pitch-details summary { min-height: 28px; padding: 4px 10px; font-size: 11px; }
  .pitch-detail-fields { grid-template-columns: minmax(0, 1fr); }
  .program { border-radius: 16px; padding: 20px 16px 24px; }
}

:root[data-theme='dark'] {
  --house: rgb(27 23 21);
  --house-deep: rgb(23 19 17);
  --spot: #ed8b73;
  --lamp: #f1a38d;
  --curtain: #5b302a;
  --card: rgb(42 35 33);
  --ink: #fff5f1;
  --ink-soft: #bbaaa3;
  --cream: #fff5f1;
  --line: #4b3a36;
  --soft-line: #382d2a;
  --soft-coral: #54332e;
}

html[data-theme='dark'] { color-scheme: dark; }
html[data-theme='dark'],
html[data-theme='dark'] body,
html[data-theme='dark'] .site-header,
html[data-theme='dark'] .header-inner {
  background: var(--house);
  color: var(--ink);
}
html[data-theme='dark'] .theme-toggle {
  border-color: var(--line);
  background: rgb(38 32 30);
  color: var(--ink-soft);
}
html[data-theme='dark'] .theme-toggle:hover,
html[data-theme='dark'] .theme-toggle:focus-visible {
  border-color: var(--spot);
  background: var(--soft-coral);
  color: var(--ink);
  outline-color: var(--soft-coral);
}
html[data-theme='dark'] .context-pill {
  border: 1px solid var(--line);
  background: rgb(42 35 33);
  color: var(--ink-soft);
}
html[data-theme='dark'] .context-dot {
  box-shadow: 0 0 0 3px rgb(46 58 49);
}
html[data-theme='dark'] .context-separator { color: #8d7770; }
html[data-theme='dark'] .period-tabs {
  border-color: var(--line);
  background: rgb(36 30 28);
}
html[data-theme='dark'] .period-tab-muted { color: #98847e; }
html[data-theme='dark'] .step:hover,
html[data-theme='dark'] .step:focus-visible { background: #75463e; }
html[data-theme='dark'] .field input,
html[data-theme='dark'] .function-choice {
  border-color: var(--line);
  background: var(--card);
  color: var(--ink);
}
html[data-theme='dark'] .field input::placeholder { color: #9d8982; }
html[data-theme='dark'] .field input:hover,
html[data-theme='dark'] .function-choice:hover { border-color: #8a5b50; }
html[data-theme='dark'] .field input:focus-visible {
  border-color: var(--spot);
  outline-color: rgb(237 139 115 / 0.24);
}
html[data-theme='dark'] .outbid:hover,
html[data-theme='dark'] .outbid:focus-visible {
  background: #bf624f;
  outline-color: rgb(237 139 115 / 0.28);
}
html[data-theme='dark'] .outbid:disabled,
html[data-theme='dark'] .outbid[aria-disabled="true"] {
  background: #995548;
  color: #f8e4de;
}
html[data-theme='dark'] .form-hint,
html[data-theme='dark'] .pitch-details summary span,
html[data-theme='dark'] .claim-note .week-window[data-rolling-week],
html[data-theme='dark'] .secondary-window,
html[data-theme='dark'] .board-key {
  color: #aa928b;
}
html[data-theme='dark'] .pitch-details {
  border-color: var(--soft-line);
  background: rgb(48 40 39 / 0.72);
  color: var(--ink-soft);
}
html[data-theme='dark'] .function-rail { border-color: var(--soft-line); }
html[data-theme='dark'] .rail-item:hover,
html[data-theme='dark'] .rail-item:focus-visible { border-color: var(--line); }
html[data-theme='dark'] .rail-item-active:hover,
html[data-theme='dark'] .rail-item-active:focus-visible {
  border-color: var(--spot);
  background: #bf624f;
}
html[data-theme='dark'] .rail-more {
  border-color: var(--line);
  background: var(--card);
  color: var(--ink);
}
html[data-theme='dark'] .rail-menu {
  border-color: var(--line);
  background: var(--card);
  color: var(--ink);
  box-shadow: 0 12px 28px rgb(0 0 0 / 0.32);
}
html[data-theme='dark'] .rail-menu-item { color: var(--ink-soft); }
html[data-theme='dark'] .rail-menu-item:hover,
html[data-theme='dark'] .rail-menu-item:focus-visible {
  background: var(--soft-coral);
  color: var(--ink);
}
html[data-theme='dark'] .listing,
html[data-theme='dark'] .listings-later .listing {
  border-color: var(--line);
  background: var(--card);
  color: var(--ink);
}
html[data-theme='dark'] .listing[data-rank='1'] {
  border-color: var(--spot);
  background: #4c2e29;
}
html[data-theme='dark'] .listing[data-rank='1']::before {
  background: var(--spot);
  color: #fff5f1;
}
html[data-theme='dark'] .listing[data-rank='2'],
html[data-theme='dark'] .listing[data-rank='3'] {
  background: #342a28;
}
html[data-theme='dark'] .house-occupied[data-occupied-house] .listings-later[data-later-seats] .listing[data-top-three='true'][data-rank='2'],
html[data-theme='dark'] .house-occupied[data-occupied-house] .listings-later[data-later-seats] .listing[data-top-three='true'][data-rank='3'] {
  border-color: #754b43;
  background: #342a28;
  box-shadow: 0 5px 14px rgb(0 0 0 / 0.18);
}
html[data-theme='dark'] .listing[data-top-three='true'] .open-deck,
html[data-theme='dark'] .listing[data-top-three='true'] .open-later {
  border-color: var(--line);
  background: #3a302e;
  color: var(--ink);
}
html[data-theme='dark'] .listing[data-top-three='true'][data-open-first] .open-first-cue .open-deck[data-first-click='open'] {
  border-color: var(--line);
  background: #3a302e;
  color: var(--ink);
}
html[data-theme='dark'] .listing[data-top-three='true'] .clicks,
html[data-theme='dark'] .listing[data-off-board] .one-liner,
html[data-theme='dark'] .listing[data-off-board] .rank,
html[data-theme='dark'] .listing[data-off-board] .clicks {
  color: var(--ink-soft);
}
html[data-theme='dark'] .listing[data-off-board] { border-color: #634a44; }
html[data-theme='dark'] .secondary-ranking .secondary-row {
  border-color: #754b43;
  background: #342a28;
  box-shadow: 0 7px 16px rgb(0 0 0 / 0.18);
}
html[data-theme='dark'] .secondary-ranking .secondary-row:last-child { border-color: #754b43; }
html[data-theme='dark'] .secondary-activity .secondary-row {
  border-color: #51403d;
  background: rgb(46 39 38);
  box-shadow: none;
}
html[data-theme='dark'] .secondary-activity .secondary-row:last-child { border-color: #51403d; }
html[data-theme='dark'] .program {
  border-color: var(--line);
  background: var(--card);
}
html[data-theme='dark'] .find-toggle {
  border-color: var(--line);
  background: rgb(38 32 30);
  color: var(--ink-soft);
}
html[data-theme='dark'] .find-toggle:hover,
html[data-theme='dark'] .find-toggle:focus-visible {
  border-color: var(--spot);
  background: var(--soft-coral);
  color: var(--ink);
}
html[data-theme='dark'] .find-popover {
  border-color: var(--line);
  background: var(--card);
  color: var(--ink);
  box-shadow: 0 16px 32px rgb(0 0 0 / 0.32);
}
html[data-theme='dark'] .find-form input {
  border-color: var(--line);
  background: var(--house);
  color: var(--ink);
}
html[data-theme='dark'] .find-result {
  border-color: var(--soft-line);
  background: rgb(36 30 28);
}
/* Keep the lower-fold summaries on the desktop rhythm without moving the
 * canonical form, rail, or top-three anchors (mobile keeps its existing flow). */
@media (min-width: 641px) {
  .secondary-section { margin-top: 23.5px; }
  .secondary-section + .secondary-section { margin-top: 25px; }
}
/* Keep the mobile deck action as a lightweight, reachable text track. */
@media (max-width: 640px) {
  .listing[data-top-three="true"] .open-deck,
  .listing[data-top-three="true"] .open-later,
  .listing[data-top-three="true"][data-open-first] .open-first-cue .open-deck[data-first-click="open"],
  .listing[data-top-three="true"][data-later-deck] .later-cue .later-open-foot .open-later {
    min-height: 0;
    width: max-content;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--spot);
    font-size: 11px;
    font-weight: 700;
    line-height: 16px;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
  }
  .listing[data-top-three="true"] .open-deck:hover,
  .listing[data-top-three="true"] .open-later:hover,
  .listing[data-top-three="true"] .open-deck:focus-visible,
  .listing[data-top-three="true"] .open-later:focus-visible,
  .listing[data-top-three="true"][data-open-first] .open-first-cue .open-deck[data-first-click="open"]:hover,
  .listing[data-top-three="true"][data-open-first] .open-first-cue .open-deck[data-first-click="open"]:focus-visible {
    border: 0;
    background: transparent;
    color: #c96550;
  }
  .listing[data-top-three="true"] .open-deck:focus-visible,
  .listing[data-top-three="true"] .open-later:focus-visible,
  .listing[data-top-three="true"][data-open-first] .open-first-cue .open-deck[data-first-click="open"]:focus-visible {
    outline: 2px solid var(--soft-coral);
    outline-offset: 3px;
  }
  html[data-theme='dark'] .listing[data-top-three="true"] .open-deck,
  html[data-theme='dark'] .listing[data-top-three="true"] .open-later,
  html[data-theme='dark'] .listing[data-top-three="true"][data-open-first] .open-first-cue .open-deck[data-first-click="open"],
  html[data-theme='dark'] .listing[data-top-three="true"][data-later-deck] .later-cue .later-open-foot .open-later {
    border: 0;
    background: transparent;
    color: var(--spot);
  }
}
/* r9: keep the mobile card body on bounded, shared tracks. The fixed middle
 * track leaves the real description flexible while giving metadata/actions a
 * common footer anchor across the lead and later paid rows. */
@media (max-width: 640px) {
  .listing[data-top-three="true"] .cue {
    grid-template-rows: 20px minmax(0, 48px) 16px;
    align-content: start;
    row-gap: 2px;
  }
  .listing[data-top-three="true"] .who {
    height: auto;
    min-height: 0;
    align-content: start;
    grid-template-rows: 20px minmax(0, 48px);
    gap: 2px;
  }
  .listing[data-top-three="true"] .company {
    align-self: start;
    font-size: 16px;
    line-height: 20px;
  }
  .listing[data-top-three="true"] .one-liner {
    align-self: start;
    max-height: 40px;
    line-height: 20px;
  }
  .listing[data-top-three="true"] .clicks,
  .listing[data-top-three="true"] .deck,
  .listing[data-top-three="true"] .later-open-foot {
    grid-row: 3;
    align-self: start;
  }
}
/* r9.1: the lead facts and later-seat facts use different wrappers. Pin only
 * those local footer tracks to the same cue coordinate so one/two-line copy
 * cannot move the real metadata or deck action independently. */
@media (max-width: 640px) {
  .listing[data-top-three="true"][data-open-first] .clicks[data-card-facts="true"],
  .listing[data-top-three="true"][data-later-deck] .clicks[data-card-facts="true"] {
    position: absolute;
    top: 72px;
    left: 0;
    grid-row: auto;
    align-self: auto;
  }
  .listing[data-top-three="true"][data-open-first] .deck[data-card-action="true"],
  .listing[data-top-three="true"][data-later-deck] .later-open-foot[data-card-action="true"] {
    position: absolute;
    top: 72px;
    right: 0;
    grid-row: auto;
    align-self: auto;
  }
}
/* r9.2: the lead link's inline text box has a distinct baseline from the
 * later footer link; lift only that real action into the shared anchor. */
@media (max-width: 640px) {
  .listing[data-top-three="true"][data-open-first] .open-first-cue .open-deck[data-first-click="open"] {
    transform: translateY(-5px);
  }
}
`;

/** Product identity layer. Keep the stage narrow, editorial, and data-light. */
const STAGE_CSS = /* css */ `
:root {
  --house: rgb(20 12 8);
  --house-deep: rgb(11 7 5);
  --spot: rgb(232 177 90);
  --lamp: rgb(243 201 122);
  --curtain: rgb(90 27 36);
  --card: rgb(244 234 214);
  --ink: rgb(26 18 12);
  --ink-soft: rgb(92 74 58);
  --cream: rgb(246 234 212);
  --line: rgb(232 177 90 / 0.28);
  --soft-line: rgb(232 177 90 / 0.15);
  --soft-coral: rgb(232 177 90 / 0.16);
  --sans: "Figtree", ui-sans-serif, system-ui, sans-serif;
  --serif: "Instrument Serif", "Iowan Old Style", Georgia, serif;
}

html {
  height: 100%;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
html::-webkit-scrollbar,
body::-webkit-scrollbar { width: 0; height: 0; display: none; }
body {
  min-height: 100%;
  font-family: var(--sans);
  color: var(--cream);
  background:
    radial-gradient(ellipse 80% 42% at 50% 8%, rgb(232 177 90 / 0.28), transparent 58%),
    radial-gradient(ellipse 70% 28% at 50% 100%, rgb(90 27 36 / 0.42), transparent 70%),
    linear-gradient(180deg, rgb(28 17 12) 0%, var(--house) 38%, var(--house-deep) 100%);
  line-height: 1.5;
}
body::before {
  content: "";
  position: fixed;
  inset: 0 auto auto 0;
  width: 100%;
  height: 0.35rem;
  background: linear-gradient(90deg, transparent, var(--curtain), var(--spot), var(--curtain), transparent);
  pointer-events: none;
}
a { color: inherit; text-decoration: none; }
button, input { font: inherit; color: inherit; }
button { cursor: pointer; }
.sr-only {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}

.site-header, .page {
  width: 100%;
  max-width: 40rem;
  margin: 0 auto;
  padding-left: 1.15rem;
  padding-right: 1.15rem;
}
.site-header {
  display: block;
  padding-top: 1.4rem;
  padding-bottom: 0.4rem;
}
.header-inner {
  position: relative;
  display: flex;
  width: 100%;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}
.brand {
  flex: 0 0 auto;
  font-family: var(--serif);
  font-size: 1.35rem;
  letter-spacing: -0.03em;
}
.brand em { color: var(--spot); font-style: italic; }
.header-context {
  margin-left: auto;
  color: rgb(203 183 154);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
nav[aria-label="Main"] {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  font-size: 0.82rem;
}
nav[aria-label="Main"] a { color: rgb(203 183 154); font-weight: 600; }
nav[aria-label="Main"] a[aria-current="page"],
nav[aria-label="Main"] a:hover,
nav[aria-label="Main"] a:focus-visible { color: var(--cream); }
.find-toggle, .theme-toggle {
  min-height: 2rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: rgb(203 183 154);
  padding: 0.2rem 0.65rem;
  font-size: 0.72rem;
  font-weight: 600;
}
.find-toggle:hover, .find-toggle:focus-visible,
.theme-toggle:hover, .theme-toggle:focus-visible {
  border-color: var(--spot);
  color: var(--cream);
  outline: 2px solid rgb(232 177 90 / 0.22);
  outline-offset: 2px;
}

.page { flex: 1; padding-top: 1.6rem; padding-bottom: 4rem; }
.pitch-home { min-width: 0; }
.pitch-home > * { min-width: 0; }
.home-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  min-height: 2rem;
}
.context-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: rgb(203 183 154);
  font-size: 0.76rem;
  letter-spacing: 0.04em;
}
.context-pill:hover, .context-pill:focus-visible {
  color: var(--cream);
  outline: 2px solid rgb(232 177 90 / 0.22);
  outline-offset: 4px;
}
.context-dot { width: 0.45rem; height: 0.45rem; border-radius: 50%; background: var(--spot); }
.context-separator { color: var(--spot); }
.period-tabs {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--soft-line);
  border-radius: 999px;
  padding: 0.18rem;
}
.period-tabs-header { min-height: 2rem; }
.period-tabs-mobile { display: none; }
.period-tab {
  min-height: 1.6rem;
  padding: 0.15rem 0.65rem;
  border-radius: 999px;
  color: rgb(143 122 98);
  font-size: 0.72rem;
  font-weight: 600;
}
.period-tab:hover, .period-tab:focus-visible { color: var(--cream); outline: 2px solid var(--spot); outline-offset: 1px; }
.period-tab-active { background: rgb(232 177 90 / 0.17); color: var(--lamp); }

#claim { margin-top: 2rem; }
.stage-head { text-align: center; }
.hero-kicker {
  margin: 0 0 0.65rem;
  color: var(--spot);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
h1.headline {
  margin: 0;
  font-family: var(--serif);
  font-size: clamp(2.4rem, 8vw, 4.1rem);
  font-weight: 400;
  line-height: 0.92;
  letter-spacing: -0.03em;
  text-wrap: balance;
}
.hero-subtitle {
  max-width: 28rem;
  margin: 0.8rem auto 0;
  color: rgb(203 183 154);
  font-size: 0.9rem;
}
.hero-line {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
}
.hero-title {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
  margin: 1rem 0 0;
  color: var(--cream);
  font-family: var(--serif);
  font-size: 1.7rem;
  font-weight: 400;
  line-height: 1.1;
}
.hero-title-copy {
  min-width: 0;
  flex: 0 1 auto;
  white-space: nowrap;
}
.claim {
  display: inline-flex;
  flex: 0 0 auto;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  margin: 0;
  white-space: nowrap;
}
.step {
  width: 2rem;
  height: 2rem;
  flex: 0 0 2rem;
  border: 1px solid rgb(232 177 90 / 0.3);
  border-radius: 999px;
  background: rgb(232 177 90 / 0.12);
  color: var(--lamp);
  font-weight: 700;
  line-height: 1;
}
.step:hover, .step:focus-visible {
  border-color: var(--spot);
  background: rgb(232 177 90 / 0.24);
  outline: 2px solid rgb(232 177 90 / 0.24);
  outline-offset: 2px;
}
.bid-field {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: baseline;
  color: var(--spot);
  font-family: var(--serif);
  font-size: 2.25rem;
  line-height: 1;
  text-decoration: none;
}
.bid-field input {
  width: 5.2ch;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  outline: none;
  font-variant-numeric: tabular-nums;
}
.bid-field input:focus-visible {
  outline: 2px solid var(--lamp);
  outline-offset: 0.2rem;
  border-radius: 0.12rem;
}
.bid-form { display: grid; gap: 0.6rem; margin-top: 1.35rem; }
.bid-row {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) 9rem auto;
  gap: 0.5rem;
  align-items: center;
}
.field { min-width: 0; }
.field input, .function-choice {
  width: 100%;
  min-height: 2.75rem;
  border: 1px solid rgb(232 177 90 / 0.28);
  border-radius: 0.25rem;
  background: rgb(11 7 5 / 0.45);
  padding: 0 0.8rem;
  color: var(--cream);
}
.bid-row[data-primary-form-row] > .field input,
.bid-row[data-primary-form-row] > .function-choice,
.bid-row[data-primary-form-row] > .outbid {
  height: 2.75rem;
  min-height: 2.75rem;
  align-self: center;
}
.field input::placeholder { color: rgb(143 122 98); opacity: 1; }
.field input:hover, .function-choice:hover { border-color: var(--spot); }
.field input:focus-visible, .function-choice:focus-visible {
  border-color: var(--lamp);
  outline: 3px solid rgb(232 177 90 / 0.22);
  outline-offset: 1px;
}
.function-choice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  color: var(--cream);
  font-size: 0.8rem;
  font-weight: 600;
}
.function-choice-detail { color: var(--spot); font-size: 0.7rem; }
.outbid {
  min-height: 2.75rem;
  border: 0;
  border-radius: 999px;
  background: var(--spot);
  color: var(--ink);
  padding: 0 1.25rem;
  font-weight: 700;
  white-space: nowrap;
}
.outbid:hover, .outbid:focus-visible {
  background: var(--lamp);
  outline: 3px solid rgb(232 177 90 / 0.24);
  outline-offset: 1px;
}
.outbid:disabled, .outbid[aria-disabled="true"] { background: rgb(232 177 90 / 0.35); color: rgb(26 18 12 / 0.58); }
.form-hint { margin: 0; color: rgb(143 122 98); font-size: 0.74rem; text-align: center; }
.claim-note {
  max-width: 29rem;
  margin: 1rem auto 0;
  color: rgb(203 183 154);
  font-size: 0.88rem;
  text-align: center;
}
.claim-note .room { display: block; margin-bottom: 0.15rem; color: var(--cream); font-family: var(--serif); font-size: 1.15rem; }
.claim-note .week-window[data-rolling-week] { display: block; margin-top: 0.35rem; color: rgb(143 122 98); font-size: 0.76rem; }
.pitch-details {
  margin-top: 1.8rem;
  border-top: 1px dashed rgb(232 177 90 / 0.22);
  border-bottom: 1px dashed rgb(232 177 90 / 0.22);
  color: var(--cream);
}
.pitch-details summary { cursor: pointer; padding: 0.8rem 0; font-size: 0.8rem; font-weight: 700; list-style: none; }
.pitch-details summary::-webkit-details-marker { display: none; }
.pitch-details summary span { margin-left: 0.4rem; color: rgb(143 122 98); font-weight: 400; }
.pitch-details summary:focus-visible { outline: 2px solid var(--spot); outline-offset: 3px; }
.pitch-detail-fields { display: grid; gap: 0.55rem; padding: 0 0 0.9rem; }
.pitch-detail-fields .field input { min-height: 2.75rem; }

.function-rail {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 2rem 0 1.35rem;
  padding: 0.7rem 0;
  border-top: 1px dashed rgb(232 177 90 / 0.22);
  border-bottom: 1px dashed rgb(232 177 90 / 0.22);
  overflow: visible;
}
.rail-scroll { display: flex; flex: 1 1 auto; flex-wrap: wrap; min-width: 0; gap: 0.95rem; }
.rail-item, .rail-more {
  min-height: 1.9rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: rgb(203 183 154);
  padding: 0.25rem 0;
  font-size: 0.74rem;
  font-weight: 600;
}
.rail-item:hover, .rail-item:focus-visible, .rail-more:hover, .rail-more:focus-visible { color: var(--cream); outline: 2px solid var(--spot); outline-offset: 3px; }
.rail-item-active { color: var(--spot); text-decoration: underline; text-decoration-style: dashed; text-underline-offset: 0.35rem; }
.rail-more { display: none; margin-left: auto; }
.rail-menu { position: absolute; z-index: 10; }
.rail-menu[hidden] { display: none; }

.board-section { width: 100%; margin-top: 2.5rem; }
.board-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.9rem;
  border-bottom: 1px solid rgb(232 177 90 / 0.24);
  padding-bottom: 0.65rem;
}
.board-heading h2 { margin: 0; color: var(--cream); font-family: var(--serif); font-size: 1.55rem; font-weight: 400; line-height: 1.1; }
.section-kicker { margin: 0 0 0.2rem; color: var(--spot); font-size: 0.67rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
.board-key { max-width: 13rem; margin: 0; color: rgb(143 122 98); font-size: 0.72rem; line-height: 1.35; text-align: right; }
.archive-empty-copy { margin: 0; color: rgb(203 183 154); }
.off-board { margin: 2.2rem 0 0; }
.board-heading-quiet { border-bottom-color: rgb(232 177 90 / 0.14); }
.off-board-list { display: grid; gap: 0.6rem; margin: 0; padding: 0; list-style: none; }

html[data-theme="dark"] {
  --house: rgb(8 5 4);
  --house-deep: rgb(3 2 2);
  --spot: rgb(239 188 101);
  --lamp: rgb(255 216 145);
  --curtain: rgb(68 20 29);
  --card: rgb(232 220 198);
}

@media (min-width: 641px) {
  .bid-form { margin-top: 1.55rem; }
}
@media (max-width: 640px) {
  .site-header, .page { padding-left: 1rem; padding-right: 1rem; }
  .site-header { padding-top: 1.1rem; }
  .header-inner { align-items: center; flex-wrap: wrap; }
  .header-context { display: none; }
  nav[aria-label="Main"] { gap: 0.55rem; font-size: 0.74rem; }
  nav[aria-label="Main"] .find-toggle, nav[aria-label="Main"] .theme-toggle { padding-left: 0.5rem; padding-right: 0.5rem; }
  .page { padding-top: 1.3rem; padding-bottom: 3rem; }
  .home-context { flex-direction: column; align-items: stretch; gap: 0.8rem; }
  .context-pill { justify-content: center; }
  .period-tabs-header { display: none; }
  .period-tabs-mobile { display: inline-flex; align-self: center; }
  #claim { margin-top: 1.55rem; }
  .hero-kicker { font-size: 0.62rem; }
  h1.headline { font-size: 2.65rem; }
  .hero-title { font-size: 1.45rem; gap: 0.45rem; row-gap: 0.2rem; }
  .hero-title-copy { white-space: nowrap; }
  .claim { gap: 0.45rem; }
  .bid-field { font-size: 2rem; }
  .step { width: 2.75rem; height: 2.75rem; flex: 0 0 2.75rem; }
  .bid-form { margin-top: 1.1rem; }
  .bid-row { grid-template-columns: minmax(0, 1fr); gap: 0.55rem; }
  .field input, .function-choice, .outbid { min-height: 2.75rem; height: 2.75rem; }
  .outbid { width: 100%; }
  .function-rail { margin-top: 1.5rem; margin-bottom: 1.1rem; }
  .rail-scroll { gap: 0.65rem 0.9rem; }
  .rail-item { min-height: 2rem; }
  .board-section { margin-top: 2rem; }
  .board-heading { align-items: start; flex-direction: column; gap: 0.35rem; }
  .board-key { max-width: none; text-align: left; }
  .pitch-details { margin-top: 1.4rem; }
}
`;

/** First.slot stage language: a warm dark room, one follow-spot, and paper cue cards. */
export const HOUSE_CSS = /* css */ `
:root {
  --house: rgb(20, 12, 8);
  --house-deep: rgb(11, 7, 5);
  --spot: rgb(232, 177, 90);
  --lamp: rgb(243, 201, 122);
  --curtain: rgb(90, 27, 36);
  --card: rgb(244, 234, 214);
  --ink: rgb(26, 18, 12);
  --ink-soft: rgb(92, 74, 58);
  --cream: rgb(246, 234, 212);
  --sans: "Figtree", ui-sans-serif, system-ui, sans-serif;
  --serif: "Instrument Serif", "Iowan Old Style", Georgia, serif;
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
html { height: 100%; }
body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  font-family: var(--sans);
  color: var(--cream);
  background:
    radial-gradient(ellipse 80% 42% at 50% 8%, rgb(232 177 90 / 0.28), transparent 58%),
    radial-gradient(ellipse 70% 28% at 50% 100%, rgb(90 27 36 / 0.42), transparent 70%),
    linear-gradient(180deg, rgb(28, 17, 12) 0%, var(--house) 38%, var(--house-deep) 100%);
  line-height: 1.5;
}
body::before {
  content: "";
  position: fixed;
  inset: 0 auto auto 0;
  width: 100%;
  height: 0.35rem;
  background: linear-gradient(90deg, transparent, var(--curtain), var(--spot), var(--curtain), transparent);
  pointer-events: none;
}
a { color: inherit; text-decoration: none; }
button, input { font: inherit; color: inherit; }
button { cursor: pointer; }
.sr-only {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
.site-header, .page {
  width: 100%;
  max-width: 40rem;
  margin: 0 auto;
  padding: 0 1.15rem;
}
.site-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 1.4rem;
  padding-bottom: 0.4rem;
}
.brand {
  font-family: var(--serif);
  font-size: 1.35rem;
  letter-spacing: -0.03em;
}
.brand em {
  font-style: italic;
  color: var(--spot);
}
nav[aria-label="Main"] { display: flex; gap: 1rem; font-size: 0.82rem; }
nav[aria-label="Main"] a { color: rgb(203, 183, 154); font-weight: 600; }
nav[aria-label="Main"] a[aria-current="page"],
nav[aria-label="Main"] a:hover { color: var(--cream); }
.page { flex: 1; padding-top: 1.6rem; padding-bottom: 4rem; }
.maker-footer {
  width: 100%;
  max-width: 40rem;
  margin: 0 auto;
  padding: 1rem 1.15rem 1.8rem;
  border-top: 1px dashed rgb(232 177 90 / 0.2);
  color: rgb(143 122 98);
  font-family: var(--sans);
  font-size: 0.72rem;
  line-height: 1.5;
  letter-spacing: 0.04em;
  text-align: center;
}
.maker-footer p { margin: 0; }
.maker-footer a {
  color: var(--spot);
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 0.18em;
  overflow-wrap: anywhere;
}
.maker-footer a:hover { color: var(--lamp); }
.maker-footer a:focus-visible {
  color: var(--lamp);
  outline: 2px solid var(--lamp);
  outline-offset: 4px;
  border-radius: 0.12rem;
}
@media (max-width: 640px) {
  .maker-footer { padding: 0.9rem 1.15rem 1.35rem; font-size: 0.68rem; }
}
.stage-head { text-align: center; }
h1.headline {
  margin: 0;
  font-family: var(--serif);
  font-size: clamp(2.4rem, 8vw, 4.1rem);
  font-weight: 400;
  line-height: 0.92;
  letter-spacing: -0.03em;
  text-wrap: balance;
}
.claim {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0.55rem;
  margin: 1.15rem 0 0;
}
.step {
  width: 1.7rem;
  height: 1.7rem;
  border: 0;
  border-radius: 999px;
  background: rgb(232 177 90 / 0.16);
  color: var(--lamp);
  font-weight: 700;
  line-height: 1;
}
.bid-field {
  display: inline-flex;
  align-items: baseline;
  color: var(--spot);
  font-family: var(--serif);
  font-size: 2.1rem;
  line-height: 1;
  text-decoration: none;
}
.bid-field .currency { margin-right: 0.08em; }
.bid-field input {
  width: 5.2ch;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  outline: none;
  font-variant-numeric: tabular-nums;
}
.bid-field input:focus-visible {
  outline: 2px solid var(--lamp);
  outline-offset: 0.2rem;
  border-radius: 0.12rem;
}
.claim-note {
  margin: 1rem auto 0;
  max-width: 26rem;
  text-align: center;
  color: rgb(203, 183, 154);
  font-size: 0.95rem;
}
.claim-note .room {
  display: block;
  margin: 0 0 0.15rem;
  font-family: var(--serif);
  font-size: 1.15rem;
  color: var(--cream);
}
.claim-note .week-window[data-rolling-week] {
  display: block;
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  color: rgb(203, 183, 154);
}
.bid-form { margin-top: 1.25rem; display: grid; gap: 0.55rem; }
.bid-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.field { flex: 1; min-width: 11rem; }
.field input {
  width: 100%;
  height: 2.7rem;
  border: 1px solid rgb(232 177 90 / 0.28);
  border-radius: 0.2rem;
  background: rgb(11 7 5 / 0.45);
  padding: 0 0.8rem;
  color: var(--cream);
}
.field input::placeholder { color: rgb(143, 122, 98); }
.outbid {
  height: 2.7rem;
  border: 0;
  border-radius: 999px;
  background: var(--spot);
  color: var(--ink);
  font-weight: 700;
  padding: 0 1.25rem;
}
.form-hint {
  margin: 0.15rem 0 0;
  text-align: center;
  color: rgb(143, 122, 98);
  font-size: 0.75rem;
}
.program {
  background: var(--card);
  color: var(--ink);
  padding: 1.4rem 1.3rem 1.6rem;
  border-radius: 0.15rem 0.15rem 0.8rem 0.8rem;
  box-shadow: 0 18px 40px rgb(0 0 0 / 0.28);
}
.program h1 {
  margin: 0 0 0.8rem;
  font-family: var(--serif);
  font-weight: 400;
  letter-spacing: -0.03em;
}
.program p, .program li { color: var(--ink-soft); }
.program strong { color: var(--ink); }
.program a { color: rgb(138, 75, 18); text-decoration: underline; }
.program ol { padding-left: 1.2rem; }
.house-empty[data-empty-house] [data-prize-first],
.house-empty[data-empty-house] [data-later-fact],
.house-empty[data-empty-house] .later-fact,
.house-empty[data-empty-house] [data-later-seat],
.house-empty[data-empty-house] [data-later-seats],
.house-empty[data-empty-house] .listings-later,
.house-empty[data-empty-house] [data-later-open-foot],
.house-empty[data-empty-house] .later-open-foot,
.house-empty[data-empty-house] [data-first-click="open"],
.house-empty[data-empty-house] [data-claim-after-slot] {
  display: none;
}
.house-empty[data-empty-house] .later-write[data-later-write] {
  margin-top: 1.6rem;
  padding-top: 1.1rem;
  border-top: 1px dashed rgb(232 177 90 / 0.22);
}
.house-empty[data-empty-house] .later-write[data-later-write] .outbid {
  height: 2.4rem;
  font-weight: 600;
  margin-top: 0.15rem;
}
${STAGE_CSS}
${FIND_CSS}
`;

/** Occupied / unpaid cue chrome. Empty house must not ship this. */
export const OCCUPIED_CSS = /* css */ `
.listings {
  list-style: none;
  margin: 1.8rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.7rem;
}
.listing {
  padding: 1rem 1.05rem 0.9rem;
  background: var(--card);
  color: var(--ink);
  border-radius: 0.15rem 0.15rem 0.7rem 0.7rem;
  box-shadow: 0 18px 40px rgb(0 0 0 / 0.28);
}
.listing.top {
  outline: 2px solid var(--spot);
  outline-offset: 2px;
}
.cue {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.35rem 1.1rem;
  align-items: start;
}
.who { min-width: 0; display: grid; gap: 0.15rem; }
.seat {
  display: grid;
  justify-items: end;
  text-align: right;
  gap: 0.15rem;
  min-width: 7.2rem;
}
.cue-label {
  display: block;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.company {
  margin: 0;
  font-family: var(--serif);
  font-size: 1.45rem;
  line-height: 1.15;
}
.one-liner { margin: 0; color: var(--ink-soft); }
.deck { margin: 0.25rem 0 0; }
.listing[data-rank] > .deck {
  margin: 0.7rem 0 0;
  padding-top: 0.55rem;
  border-top: 1px dashed rgb(26 18 12 / 0.18);
}
.listing-url {
  color: rgb(138, 75, 18);
  font-weight: 600;
  word-break: break-all;
}
.listing-url:hover { text-decoration: underline; }
.open-deck {
  display: block;
  color: rgb(138, 75, 18);
  font-family: var(--serif);
  font-size: 1.35rem;
  font-weight: 400;
  line-height: 1.15;
  text-decoration: underline;
  text-underline-offset: 0.16em;
}
.open-deck:hover { text-decoration-thickness: 2px; }
.open-deck .deck-url {
  display: block;
  margin: 0.2rem 0 0;
  color: var(--ink-soft);
  font-family: var(--sans);
  font-size: 0.78rem;
  font-weight: 600;
  text-decoration: none;
  word-break: break-all;
}
.listing[data-later-deck] .later-cue {
  grid-template-columns: minmax(0, 1fr);
  gap: 0.35rem;
}
.listing[data-later-deck] .later-open-foot {
  margin: 0.35rem 0 0;
  padding-top: 0.35rem;
  border-top: 1px dashed rgb(26 18 12 / 0.14);
}
.listing[data-later-deck] .open-later {
  display: inline-block;
  padding: 0.12rem 0.45rem;
  border: 1px solid rgb(26 18 12 / 0.28);
  border-radius: 0.15rem;
  background: transparent;
  color: var(--ink-soft);
  font-family: var(--sans);
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-decoration: none;
}
.listing[data-later-deck] .open-later .deck-url {
  display: block;
  margin: 0.12rem 0 0;
  color: rgb(143, 122, 98);
  font-size: 0.68rem;
  font-weight: 600;
  word-break: break-all;
}
.listing[data-later-deck] .seat {
  justify-items: start;
  text-align: left;
  min-width: 0;
}
.listing[data-later-deck] .seat .rank {
  font-size: 1rem;
  font-weight: 400;
  color: var(--ink-soft);
}
.listing[data-open-first] .open-first-cue {
  grid-template-columns: minmax(0, 1fr);
  gap: 0.4rem;
}
.listing[data-open-first] .open-first-cue .deck {
  margin: 0.15rem 0 0;
  padding-top: 0;
  border-top: 0;
}
.listing[data-open-first] .open-first-cue .open-deck[data-first-click="open"] {
  display: inline-block;
  font-family: var(--serif);
  font-size: 1.7rem;
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: -0.02em;
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.14em;
}
.listing[data-open-first] .open-first-cue .open-deck .deck-url {
  margin-top: 0.25rem;
}
.listing[data-open-first] .open-first-cue .seat {
  justify-items: start;
  text-align: left;
  min-width: 0;
}
.seat .rank {
  margin: 0;
  font-family: var(--serif);
  font-size: 1.2rem;
  line-height: 1.15;
  color: var(--ink);
  max-width: 10rem;
}
.off-board {
  margin: 1.1rem 0 0;
}
.off-board-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
.listing[data-off-board] {
  padding: 0.85rem 1.05rem 0.8rem;
  background: transparent;
  color: var(--cream);
  box-shadow: none;
  outline: 1px dashed rgb(232 177 90 / 0.35);
  outline-offset: 0;
  border-radius: 0.2rem;
}
.listing[data-off-board] .off-board-cue {
  grid-template-columns: minmax(0, 1fr);
}
.listing[data-off-board] .company,
.listing[data-off-board] .one-liner,
.listing[data-off-board] .listing-url,
.listing[data-off-board] .rank,
.listing[data-off-board] .clicks {
  color: rgb(203, 183, 154);
}
.listing[data-off-board] .company {
  font-size: 1.15rem;
}
.listing[data-off-board] .rank {
  margin: 0.2rem 0 0;
  font-family: var(--sans);
  font-size: 0.82rem;
  font-weight: 600;
  max-width: none;
}
.listing[data-off-board] .cue-label {
  margin-top: 0.45rem;
  color: rgb(143, 122, 98);
}
.seat .clicks { margin: 0; color: var(--ink-soft); font-size: 0.82rem; }
.listing.top .seat .rank { color: rgb(138, 75, 18); font-weight: 700; }
.house-occupied[data-occupied-house] .listing[data-prize-first] .cue {
  grid-template-columns: minmax(0, 1fr);
  gap: 0.45rem;
}
.house-occupied[data-occupied-house] .listing[data-prize-first] .company {
  font-size: 2.15rem;
  line-height: 1.05;
  letter-spacing: -0.03em;
}
.house-occupied[data-occupied-house] .listing[data-prize-first] .one-liner {
  font-size: 1.05rem;
  line-height: 1.35;
}
.house-occupied[data-occupied-house] .listing[data-prize-first] .rank.later-fact[data-later-fact],
.house-occupied[data-occupied-house] .listing.top[data-prize-first] .rank.later-fact[data-later-fact] {
  margin: 0.2rem 0 0;
  font-size: 1.2rem;
  font-weight: 400;
  color: var(--ink-soft);
  max-width: none;
}
.house-occupied[data-occupied-house] .listing[data-prize-first] .clicks { margin: 0; color: var(--ink-soft); font-size: 0.82rem; }
.house-occupied[data-occupied-house] .listing[data-open-first] .open-deck[data-first-click="open"] {
  display: inline-block;
  font-family: var(--serif);
  font-size: 1.7rem;
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: -0.02em;
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.14em;
}
.house-occupied[data-occupied-house] .listings-later[data-later-seats] {
  margin-top: 0.85rem;
  gap: 0.45rem;
}
.house-occupied[data-occupied-house] .listings-later[data-later-seats] .listing {
  padding: 0.7rem 0.9rem 0.65rem;
  background: rgb(244 234 214 / 0.72);
  box-shadow: none;
  outline: 1px dashed rgb(26 18 12 / 0.16);
}
.house-occupied[data-occupied-house] .listings-later[data-later-seats] .company {
  font-size: 1.05rem;
  letter-spacing: 0;
}
.house-occupied[data-occupied-house] .listings-later[data-later-seats] .one-liner {
  font-size: 0.88rem;
}
.house-occupied[data-occupied-house] .listings-later[data-later-seats] .later-open-foot[data-later-open-foot] {
  margin-top: 0.3rem;
  padding-top: 0.28rem;
  border-top: 1px dashed rgb(26 18 12 / 0.12);
}
.house-occupied[data-occupied-house] .listings-later[data-later-seats] .later-open-foot[data-later-open-foot] .open-later {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  border: 1px solid rgb(26 18 12 / 0.22);
  background: transparent;
  box-shadow: none;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ink-soft);
  text-decoration: none;
}
.house-occupied[data-occupied-house] .listings-later[data-later-seats] .seat.later-seat[data-later-seat] {
  justify-items: start;
  text-align: left;
  min-width: 0;
  gap: 0.08rem;
}
.house-occupied[data-occupied-house] .listings-later[data-later-seats] .seat.later-seat[data-later-seat] .cue-label {
  font-size: 0.58rem;
  letter-spacing: 0.1em;
  color: rgb(143, 122, 98);
}
.house-occupied[data-occupied-house] .listings-later[data-later-seats] .seat.later-seat[data-later-seat] .rank {
  font-size: 0.88rem;
  font-weight: 400;
  color: var(--ink-soft);
}
.house-occupied[data-occupied-house] .listings-later[data-later-seats] .seat.later-seat[data-later-seat] .clicks {
  font-size: 0.72rem;
}
/* Occupied checkout: Waffo charges the difference on a raise. Unpaid stays off. */
.house-occupied[data-occupied-house] .claim-note .raise-charge[data-raise-charge] {
  display: block;
  margin: 0.2rem 0 0;
  font-family: var(--sans);
  font-size: 0.75rem;
  font-weight: 400;
  color: rgb(143, 122, 98);
}
/* Occupied rolling-week cue recedes so dashed $amount and Outbid stay the action. */
.house-occupied[data-occupied-house] .claim-note .week-window[data-rolling-week] {
  margin-top: 0.2rem;
  font-family: var(--sans);
  font-size: 0.75rem;
  font-weight: 400;
  color: rgb(143, 122, 98);
}
/* Occupied room line recedes so dashed $amount and Outbid stay the action. */
.house-occupied[data-occupied-house] .claim-note .room[data-quiet-room] {
  font-family: var(--sans);
  font-size: 0.75rem;
  font-weight: 400;
  color: rgb(143, 122, 98);
}
.house-occupied[data-occupied-house] .listings {
  margin-top: 0;
}
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] {
  margin-top: 1.6rem;
  padding-top: 1.1rem;
  border-top: 1px dashed rgb(232 177 90 / 0.22);
}
/* Occupied claim-after-slot headline recedes so ± Outbid stay the action cluster. */
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .stage-head[data-quiet-headline] .headline {
  font-family: var(--sans);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: 0.02em;
  color: rgb(143, 122, 98);
}
/* Occupied claim-after-slot stage-head collapses so ± Outbid open the claim. */
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .claim {
  margin-top: 0;
}
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .claim + .stage-head[data-quiet-headline] {
  text-align: start;
  width: fit-content;
  max-width: 100%;
  margin: 0.35rem auto 0;
}
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .bid-field {
  font-size: 1.45rem;
}
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .outbid {
  height: 2.4rem;
  font-weight: 600;
}
/* Occupied claim-note sits after Outbid so dashed $amount and Outbid stay adjacent. */
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .bid-form {
  margin-top: 0.5rem;
}
.house-occupied[data-occupied-house] .claim-note[data-after-outbid] {
  margin-top: 0.7rem;
  margin-bottom: 0.2rem;
}
/* Occupied Outbid sits beside ± so dashed $amount and Outbid are one cluster. */
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .claim .outbid[data-beside-plus] {
  flex: 0 0 auto;
  height: 2.4rem;
  font-weight: 700;
  padding: 0 1.15rem;
}
/* Occupied company/url recede after the ± Outbid action. */
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .bid-row[data-after-action] {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .bid-row[data-after-action] .field {
  min-width: 8rem;
}
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .bid-row[data-after-action] .field input {
  height: 2.4rem;
  font-size: 0.88rem;
}
/* Occupied one-liner recedes with company/url so ± Outbid stay the action cluster. */
.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] .bid-row[data-after-action] .field[data-oneliner] {
  flex: 1 1 100%;
  min-width: 100%;
}
`;

const BOARD_IDENTITY_CSS = /* css */ `
/* One lead cue, then a vertical cue sheet. No uniform marketplace grid. */
.leaderboard[data-stage-list="on-stage"],
.listings[data-stage-list="later-cues"] {
  margin: 0;
  gap: 0.85rem;
}
.listing[data-stage-card="lead-cue"] {
  min-height: 0;
  padding: 1.35rem 1.4rem 1.2rem;
  border: 1px solid rgb(232 177 90 / 0.72);
  border-radius: 0.25rem 0.25rem 1rem 1rem;
  background: var(--card);
  box-shadow: 0 20px 44px rgb(0 0 0 / 0.34), 0 0 0 0.3rem rgb(232 177 90 / 0.07);
}
.listing[data-stage-card="lead-cue"] .cue,
.listing[data-stage-card="lead-cue"] .open-first-cue {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(8rem, auto);
  gap: 0.7rem 1.4rem;
  align-items: start;
}
.listing[data-stage-card="lead-cue"] .company {
  color: var(--ink);
  font-family: var(--serif);
  font-size: 2.25rem;
  font-weight: 400;
  line-height: 1.02;
  letter-spacing: -0.03em;
}
.listing[data-stage-card="lead-cue"] .one-liner { color: var(--ink-soft); font-size: 1rem; line-height: 1.35; }
.listing[data-stage-card="lead-cue"] .seat {
  display: grid;
  min-width: 8rem;
  justify-items: end;
  gap: 0.15rem;
  text-align: right;
}
.listing[data-stage-card="lead-cue"] .seat .rank,
.listing[data-stage-card="lead-cue"] .rank.later-fact {
  max-width: none;
  color: rgb(138 75 18);
  font-family: var(--serif);
  font-size: 1.35rem;
  font-weight: 400;
  line-height: 1.1;
}
.listing[data-stage-card="lead-cue"] .seat .clicks,
.listing[data-stage-card="lead-cue"] .clicks { color: var(--ink-soft); font-size: 0.8rem; }
.listing[data-stage-card="lead-cue"] .clicks[data-card-facts="true"] .card-fact-separator,
.listing[data-stage-card="later-cue"] .clicks[data-card-facts="true"] .card-fact-separator {
  display: inline-block;
  margin: 0 0.3rem;
  color: rgb(138 75 18 / 0.68);
}
.listing[data-stage-card="lead-cue"] .deck,
.listing[data-stage-card="lead-cue"] .open-deck { grid-column: 1 / -1; }
.listing[data-stage-card="lead-cue"] .deck {
  margin: 0.15rem 0 0;
  padding-top: 0.7rem;
  border-top: 1px dashed rgb(26 18 12 / 0.24);
}
.listing[data-stage-card="lead-cue"] .open-deck {
  min-height: 2.75rem;
  color: rgb(138 75 18);
  font-family: var(--serif);
  font-size: 1.65rem;
  line-height: 1.1;
  text-decoration: underline;
  text-underline-offset: 0.15em;
}
.listing[data-stage-card="lead-cue"] .open-deck .deck-url { margin-top: 0.2rem; font-family: var(--sans); font-size: 0.75rem; }
.listing[data-stage-card="lead-cue"] .open-deck:focus-visible,
.listing[data-stage-card="lead-cue"] .open-deck:hover { outline: 2px solid rgb(138 75 18 / 0.55); outline-offset: 3px; }

.listing[data-stage-card="later-cue"] {
  min-height: 0;
  padding: 0.85rem 1rem 0.8rem;
  border: 1px dashed rgb(232 177 90 / 0.3);
  border-radius: 0.18rem 0.18rem 0.6rem 0.6rem;
  background: rgb(244 234 214 / 0.82);
  box-shadow: none;
}
.listing[data-stage-card="later-cue"] .later-cue {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(7rem, auto);
  gap: 0.45rem 1rem;
  align-items: start;
}
.listing[data-stage-card="later-cue"] .company { color: var(--ink); font-family: var(--serif); font-size: 1.25rem; line-height: 1.05; }
.listing[data-stage-card="later-cue"] .one-liner { color: var(--ink-soft); font-size: 0.86rem; }
.listing[data-stage-card="later-cue"] .seat {
  display: grid;
  min-width: 7rem;
  justify-items: end;
  gap: 0.1rem;
  text-align: right;
}
.listing[data-stage-card="later-cue"] .seat .cue-label { color: var(--ink-soft); font-size: 0.62rem; }
.listing[data-stage-card="later-cue"] .seat .rank { max-width: none; color: rgb(138 75 18); font-family: var(--serif); font-size: 1rem; }
.listing[data-stage-card="later-cue"] .seat .clicks { color: var(--ink-soft); font-size: 0.72rem; }
.listing[data-stage-card="later-cue"] .later-open-foot {
  grid-column: 1 / -1;
  margin-top: 0.25rem;
  padding-top: 0.35rem;
  border-top: 1px dashed rgb(26 18 12 / 0.18);
}
.listing[data-stage-card="later-cue"] .open-later {
  display: inline-block;
  min-height: 2rem;
  color: var(--ink-soft);
  font-size: 0.78rem;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 0.18em;
}
.listing[data-stage-card="later-cue"] .open-later .deck-url { display: block; margin-top: 0.1rem; color: rgb(143 122 98); font-size: 0.68rem; }

.listing[data-stage-card="in-wings"] {
  min-height: 0;
  padding: 0.85rem 1rem 0.8rem;
  border: 1px dashed rgb(232 177 90 / 0.34);
  border-radius: 0.2rem;
  background: transparent;
  color: rgb(203 183 154);
  box-shadow: none;
}
.listing[data-stage-card="in-wings"] .off-board-cue { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.2rem; }
.listing[data-stage-card="in-wings"] .company { color: var(--cream); font-family: var(--serif); font-size: 1.15rem; }
.listing[data-stage-card="in-wings"] .one-liner,
.listing[data-stage-card="in-wings"] .listing-url,
.listing[data-stage-card="in-wings"] .rank,
.listing[data-stage-card="in-wings"] .clicks { color: rgb(203 183 154); font-size: 0.78rem; }
.listing[data-stage-card="in-wings"] .listing-url { word-break: break-all; }
.listing[data-stage-card="in-wings"] .cue-label { margin-top: 0.35rem; color: rgb(143 122 98); font-size: 0.65rem; letter-spacing: 0.09em; text-transform: uppercase; }
.listing[data-stage-card="in-wings"] .rank { margin: 0.05rem 0 0; font-family: var(--sans); font-weight: 600; }

.house-occupied[data-occupied-house] .claim-after-slot[data-claim-after-slot] {
  margin-top: 1.6rem;
  padding-top: 1.1rem;
  border-top: 1px dashed rgb(232 177 90 / 0.22);
}
.house-occupied[data-occupied-house] .claim-after-slot .stage-head[data-quiet-headline] .hero-kicker,
.house-occupied[data-occupied-house] .claim-after-slot .stage-head[data-quiet-headline] .headline,
.house-occupied[data-occupied-house] .claim-after-slot .stage-head[data-quiet-headline] .hero-subtitle {
  color: rgb(143 122 98);
  font-size: 0.76rem;
  line-height: 1.25;
}
.house-occupied[data-occupied-house] .claim-after-slot .stage-head[data-quiet-headline] .headline { font-family: var(--sans); font-weight: 400; letter-spacing: 0.02em; }
.house-occupied[data-occupied-house] .claim-after-slot .hero-title { font-size: 1.6rem; }
.house-occupied[data-occupied-house] .claim-after-slot .bid-field { font-size: 1.7rem; }
.house-occupied[data-occupied-house] .claim-after-slot .bid-form { margin-top: 0.7rem; }
.house-occupied[data-occupied-house] .claim-after-slot .field input,
.house-occupied[data-occupied-house] .claim-after-slot .function-choice,
.house-occupied[data-occupied-house] .claim-after-slot .outbid { min-height: 2.75rem; }
.house-occupied[data-occupied-house] .claim-note[data-after-outbid] { margin-top: 0.7rem; }

html[data-theme="dark"] .listing[data-stage-card="lead-cue"] { background: var(--card); }
html[data-theme="dark"] .listing[data-stage-card="later-cue"] { background: rgb(232 220 198 / 0.78); }

@media (max-width: 640px) {
  .listing[data-stage-card="lead-cue"] { padding: 1.05rem 1rem 1rem; box-shadow: 0 14px 28px rgb(0 0 0 / 0.3), 0 0 0 0.22rem rgb(232 177 90 / 0.07); }
  .listing[data-stage-card="lead-cue"] .cue,
  .listing[data-stage-card="lead-cue"] .open-first-cue,
  .listing[data-stage-card="later-cue"] .later-cue { grid-template-columns: minmax(0, 1fr); gap: 0.5rem; }
  .listing[data-stage-card="lead-cue"] .company { font-size: 1.85rem; }
  .listing[data-stage-card="lead-cue"] .one-liner { font-size: 0.92rem; }
  .listing[data-stage-card="lead-cue"] .seat,
  .listing[data-stage-card="later-cue"] .seat { justify-items: start; min-width: 0; text-align: left; }
  .listing[data-stage-card="lead-cue"] .seat .rank,
  .listing[data-stage-card="later-cue"] .seat .rank { font-size: 1.05rem; }
  .listing[data-stage-card="lead-cue"] .deck { margin-top: 0.2rem; padding-top: 0.6rem; }
  .listing[data-stage-card="lead-cue"] .open-deck { min-height: 2.75rem; font-size: 1.45rem; }
  .listing[data-stage-card="later-cue"] { padding: 0.85rem 0.9rem; }
  .listing[data-stage-card="later-cue"] .later-open-foot { margin-top: 0.2rem; }
  .listing[data-stage-card="later-cue"] .open-later { min-height: 2.75rem; }
  .listing[data-stage-card="in-wings"] { padding: 0.8rem 0.9rem; }
  .off-board { margin-top: 1.7rem; }
}
`;

export const BOARD_CSS = `${HOUSE_CSS}
${OCCUPIED_CSS}
${BOARD_IDENTITY_CSS}`;
