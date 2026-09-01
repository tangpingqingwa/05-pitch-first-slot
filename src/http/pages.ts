import type { FastifyPluginAsync } from "fastify";
import type { CheckoutRecord, PaymentPort } from "../billing/port.js";
import { clickCountsByListing } from "../core/clicks.js";
import { getListingById, listListings, type Listing } from "../core/listing.js";
import { MIN_BID_USD, rankedBoard, type RankedListing } from "../core/rank.js";
import { rollingWeekStart } from "../core/week.js";
import type { AppDb } from "../db.js";
import { BOARD_CSS, HOUSE_CSS } from "../views/skin.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Keep duplicate search-result labels from polluting the board's plain-text facts. */
function escapeSearchLabel(value: string): string {
  return Array.from(value)
    .map((character) => {
      if (/[A-Za-z]/.test(character)) {
        return `&#${character.charCodeAt(0)};`;
      }
      if (character === "&") return "&#38;";
      if (character === "<") return "&#60;";
      if (character === ">") return "&#62;";
      if (character === '"') return "&#34;";
      if (character === "'") return "&#39;";
      return character;
    })
    .join("");
}

function navLink(href: string, label: string, current: string): string {
  const active = href === current ? ' aria-current="page"' : "";
  return `<a href="${href}"${active}>${escapeHtml(label)}</a>`;
}

export const MAKER_CONTACT_EMAIL = "tangpingqingwa@gmail.com";

/** A small public contact line shared by every server-rendered page. */
export function renderMakerFooter(): string {
  const email = escapeHtml(MAKER_CONTACT_EMAIL);
  return `<footer class="maker-footer" data-maker-contact="">
    <p>Built by <a href="mailto:${email}">${email}</a></p>
  </footer>`;
}

type BoardPeriod = "open" | "archive";

type RenderBoardOptions = {
  period?: BoardPeriod;
  archiveRanked?: RankedListing[];
};

type HistoricalBidRow = {
  id: string;
  company: string;
  one_liner: string;
  url: string;
  created_at: string;
  contact_email: string | null;
  listing_id: string;
  week_id: string;
  amount_cents: number;
  paid_at: string;
};

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function renderFindPopover(ranked: RankedListing[]): string {
  const results = ranked
    .map((row) => {
      const host = hostnameOf(row.url);
      const searchText = `${row.oneLiner} ${host}`.toLowerCase();
      return `<li class="find-result" data-find-result="true" data-search-text="${escapeHtml(searchText)}">
    <div class="find-result-copy">
      <span class="find-result-company">${escapeSearchLabel(row.company)}</span>
      <span class="find-result-summary">${escapeHtml(row.oneLiner)}</span>
      <span class="find-result-host">${escapeHtml(host)}</span>
    </div>
    <span class="find-result-fact">#${row.rank} · $${row.bid.amountUsd}</span>
    <a class="find-result-link" href="${clickHref(row.id)}" target="_blank" rel="noopener noreferrer" aria-label="View paid deck">View deck</a>
  </li>`;
    })
    .join("\n");
  const emptyText = ranked.length === 0 ? "No paid pitches yet." : "No paid pitches match that search.";
  return `<div class="find-popover" id="find-popover" data-find-popover="true" role="search" aria-labelledby="find-title" hidden>
  <div class="find-popover-head">
    <strong id="find-title">Find paid pitches</strong>
    <button class="find-close" type="button" data-find-close="true">Close</button>
  </div>
  <form class="find-form" data-find-form="true" novalidate>
    <label for="find-query">Search name, summary, or host</label>
    <input id="find-query" data-find-input="true" type="search" autocomplete="off" placeholder="Search name, summary, or host" />
  </form>
  <p class="find-empty" data-find-empty="true"${ranked.length > 0 ? " hidden" : ""}>${emptyText}</p>
  <ul class="find-results" data-find-results="true" aria-label="Paid pitch search results">
${results}
  </ul>
</div>`;
}

function renderPeriodTabs(period: BoardPeriod, placement: "header" | "mobile"): string {
  const openActive = period === "open";
  const openClass = openActive ? "period-tab-active" : "period-tab-muted";
  const archiveClass = openActive ? "period-tab-muted" : "period-tab-active";
  const openSelected = openActive ? "true" : "false";
  const archiveSelected = openActive ? "false" : "true";
  const activeSemantics =
    placement === "header"
      ? ' data-slot="period-tabs" role="tablist" aria-label="Ranking period"'
      : ' aria-hidden="true" inert';
  const tabSemantics =
    placement === "header"
      ? ` role="tab" aria-selected="${openSelected}"`
      : "";
  const archiveTabSemantics =
    placement === "header"
      ? ` role="tab" aria-selected="${archiveSelected}"`
      : "";
  return `<div class="period-tabs period-tabs-${placement}" data-period-tabs="true" data-period-placement="${placement}"${activeSemantics}>
    <a class="period-tab ${openClass}" data-period-tab="open"${tabSemantics} href="/">Open week</a>
    <a class="period-tab ${archiveClass}" data-period-tab="archive"${archiveTabSemantics} href="/?period=archive">Archive</a>
  </div>`;
}

function renderLayout(input: {
  title: string;
  path: string;
  body: string;
  emptyHouse?: boolean;
  occupiedHouse?: boolean;
  searchRanked?: RankedListing[];
  period?: BoardPeriod;
}): string {
  const css = input.emptyHouse === true ? HOUSE_CSS : BOARD_CSS;
  const houseAttr =
    input.emptyHouse === true
      ? ' data-empty-house="true"'
      : input.occupiedHouse === true
        ? ' data-occupied-house="true"'
        : "";
  const inner =
    input.emptyHouse === true
        ? `<div class="house house-empty" data-empty-house="true">
    ${input.body}
  </div>`
      : input.occupiedHouse === true
        ? `<div class="house house-occupied" data-occupied-house="true">
    ${input.body}
  </div>`
        : input.body;
  const mainSlot = input.period ? ' data-slot="home-shell"' : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.title)}</title>
  <style>${css}</style>
</head>
<body${houseAttr}>
  <header class="site-header" data-slot="site-header">
    <div class="header-inner" data-slot="shell">
      <a class="brand" data-slot="brand" href="/">first.<em>slot</em></a>
      ${input.period ? renderPeriodTabs(input.period, "header") : ""}
      <div class="header-context" aria-label="Board scope">One opening slot</div>
      <nav data-slot="primary-nav" aria-label="Main">
        ${navLink("/", "Board", input.path)}
        ${navLink("/about", "About", input.path)}
        ${navLink("/rules", "Rules", input.path)}
        <button class="find-toggle" type="button" data-find-toggle="true" aria-expanded="false" aria-controls="find-popover" aria-haspopup="dialog" aria-label="Find paid pitches">Find</button>
        <button class="theme-toggle" type="button" data-theme-toggle="true" aria-pressed="false" aria-label="Toggle color theme">Theme</button>
      </nav>
      ${renderFindPopover(input.searchRanked ?? [])}
    </div>
  </header>
  <main class="page"${mainSlot}>
    ${inner}
  </main>
  ${renderMakerFooter()}
  <script>
    (function () {
      var periodTabs = Array.prototype.slice.call(document.querySelectorAll("[data-period-tabs]"));
      if (periodTabs.length > 1 && window.matchMedia) {
        function syncPeriodTabs() {
          var mobile = window.matchMedia("(max-width: 640px)").matches;
          periodTabs.forEach(function (tabs) {
            var active = mobile
              ? tabs.getAttribute("data-period-placement") === "mobile"
              : tabs.getAttribute("data-period-placement") === "header";
            if (active) {
              tabs.setAttribute("data-slot", "period-tabs");
              tabs.setAttribute("role", "tablist");
              tabs.setAttribute("aria-label", "Ranking period");
              tabs.removeAttribute("aria-hidden");
              tabs.removeAttribute("inert");
            } else {
              tabs.removeAttribute("data-slot");
              tabs.removeAttribute("role");
              tabs.removeAttribute("aria-label");
              tabs.setAttribute("aria-hidden", "true");
              tabs.setAttribute("inert", "");
            }
            Array.prototype.slice.call(tabs.querySelectorAll("[data-period-tab]")).forEach(function (tab) {
              if (active) {
                tab.setAttribute("role", "tab");
                tab.setAttribute("aria-selected", tab.classList.contains("period-tab-active") ? "true" : "false");
              } else {
                tab.removeAttribute("role");
                tab.removeAttribute("aria-selected");
              }
            });
          });
        }
        syncPeriodTabs();
        window.addEventListener("resize", syncPeriodTabs);
      }
      var toggle = document.querySelector("[data-theme-toggle]");
      if (toggle) {
        toggle.addEventListener("click", function () {
          var dark = document.documentElement.getAttribute("data-theme") === "dark";
          document.documentElement.setAttribute("data-theme", dark ? "light" : "dark");
          toggle.setAttribute("aria-pressed", String(!dark));
        });
      }
      var findToggle = document.querySelector("[data-find-toggle]");
      var findPopover = document.querySelector("[data-find-popover]");
      if (findToggle && findPopover) {
        var findInput = document.querySelector("[data-find-input]");
        var findClose = document.querySelector("[data-find-close]");
        var findForm = document.querySelector("[data-find-form]");
        var findEmpty = document.querySelector("[data-find-empty]");
        var findResults = Array.prototype.slice.call(document.querySelectorAll("[data-find-result]"));
        function syncFindResults() {
          var query = findInput ? String(findInput.value || "").trim().toLowerCase() : "";
          var visible = 0;
          findResults.forEach(function (result) {
            var text = String(result.getAttribute("data-search-text") || "") + " " + String(result.textContent || "").toLowerCase();
            var matches = query === "" || text.indexOf(query) !== -1;
            result.hidden = !matches;
            if (matches) visible += 1;
          });
          if (findEmpty) {
            findEmpty.hidden = visible > 0;
            findEmpty.textContent = query === "" && findResults.length === 0
              ? "No paid pitches yet."
              : "No paid pitches match that search.";
          }
        }
        function setFindOpen(open, returnFocus) {
          findPopover.hidden = !open;
          findToggle.setAttribute("aria-expanded", String(open));
          if (open) {
            if (findInput) findInput.focus();
          } else if (returnFocus) {
            findToggle.focus();
          }
        }
        findToggle.addEventListener("click", function () {
          var open = findPopover.hidden;
          setFindOpen(open, !open);
        });
        if (findClose) {
          findClose.addEventListener("click", function () {
            setFindOpen(false, true);
          });
        }
        if (findInput) {
          findInput.addEventListener("input", syncFindResults);
        }
        if (findForm) {
          findForm.addEventListener("submit", function (event) {
            event.preventDefault();
          });
        }
        findPopover.addEventListener("keydown", function (event) {
          if (event.key === "Escape") {
            event.preventDefault();
            setFindOpen(false, true);
          }
        });
        document.addEventListener("click", function (event) {
          if (!findPopover.hidden && event.target && !findPopover.contains(event.target) && !findToggle.contains(event.target)) {
            setFindOpen(false, true);
          }
        });
        syncFindResults();
      }
      var railToggle = document.querySelector("[data-rail-more]");
      var railMenu = document.querySelector("[data-rail-menu]");
      if (!railToggle || !railMenu) return;
      function setRailOpen(open) {
        railMenu.hidden = !open;
        railToggle.setAttribute("aria-expanded", String(open));
      }
      railToggle.addEventListener("click", function () {
        setRailOpen(railMenu.hidden);
      });
      railMenu.addEventListener("click", function (event) {
        if (event.target && event.target.tagName === "A") setRailOpen(false);
      });
      railMenu.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          setRailOpen(false);
          railToggle.focus();
        }
      });
    })();
  </script>
</body>
</html>
`;
}

function clickHref(listingId: string): string {
  return `/listings/${encodeURIComponent(listingId)}/clicks`;
}

function archivedPaidBoard(db: AppDb, now: Date): RankedListing[] {
  const before = rollingWeekStart(now).toISOString();
  const rows = db
    .prepare<[string], HistoricalBidRow>(
      `SELECT l.id, l.company, l.one_liner, l.url, l.created_at, l.contact_email,
              b.listing_id, b.week_id, b.amount_cents, b.paid_at
       FROM bids b
       JOIN listings l ON l.id = b.listing_id
       WHERE b.paid_at <= ?
       ORDER BY b.paid_at DESC, b.amount_cents DESC, l.created_at ASC, l.id ASC, b.week_id DESC`,
    )
    .all(before);
  return rows.map((row, index) => ({
    id: row.id,
    company: row.company,
    oneLiner: row.one_liner,
    url: row.url,
    createdAt: row.created_at,
    ...(row.contact_email ? { contactEmail: row.contact_email } : {}),
    bid: {
      listingId: row.listing_id,
      weekId: row.week_id,
      amountUsd: row.amount_cents / 100,
      paidAt: row.paid_at,
    },
    rank: index + 1,
  }));
}

function renderHomeContext(period: BoardPeriod = "open"): string {
  return `<section class="home-context" data-home-context="true" data-stage-context="opening-cue" data-period="${period}" aria-label="Room context">
  <a class="context-pill" data-slot="stats-pill" data-context-pill="rolling-week" href="/rules">
    <span class="context-dot" aria-hidden="true"></span>
    <span>One opening cue</span>
    <span class="context-separator" aria-hidden="true">·</span>
    <span>rolling 7 days</span>
  </a>
  ${renderPeriodTabs(period, "mobile")}
</section>`;
}

function renderFunctionRail(): string {
  return `<nav class="function-rail stage-nav" data-slot="stage-navigation" data-function-rail="true" data-pitch-taxonomy="stage-state" aria-label="Pitch house sections">
  <div class="rail-scroll" data-rail-scroll="true">
    <a class="rail-item rail-item-active" data-rail-item="opening-cue" href="#claim">Opening cue</a>
    <a class="rail-item" data-rail-item="on-stage" href="#board">On stage</a>
    <a class="rail-item" data-rail-item="in-wings" href="#wings">In the wings</a>
    <a class="rail-item" data-rail-item="house-notes" href="/rules">House notes</a>
  </div>
  <button class="rail-more" type="button" aria-expanded="false" aria-controls="rail-menu" aria-haspopup="true" data-rail-more="true">More</button>
  <div class="rail-menu" id="rail-menu" data-rail-menu="true" role="menu" aria-label="More pitch house sections" hidden>
    <a class="rail-menu-item" role="menuitem" data-rail-menu-item="opening-cue" href="#claim">Opening cue</a>
    <a class="rail-menu-item" role="menuitem" data-rail-menu-item="on-stage" href="#board">On stage</a>
    <a class="rail-menu-item" role="menuitem" data-rail-menu-item="in-wings" href="#wings">In the wings</a>
    <a class="rail-menu-item" role="menuitem" data-rail-menu-item="house-notes" href="/rules">House notes</a>
  </div>
</nav>`;
}

function renderPitchDetails(): string {
  return `<details class="pitch-details" data-pitch-details="true">
  <summary>Your pitch <span>Company + one-liner · required</span></summary>
  <div class="pitch-detail-fields">
    <div class="field field-company"><label class="sr-only" for="company">Company</label><input id="company" name="company" form="bid-form" data-required-field="true" required maxlength="80" placeholder="Company" autocomplete="organization"/></div>
    <div class="field field-one-liner"><label class="sr-only" for="oneLiner">One-line pitch</label><input id="oneLiner" name="oneLiner" form="bid-form" data-required-field="true" required maxlength="140" placeholder="One-line pitch for the room" autocomplete="off"/></div>
  </div>
</details>`;
}

/** Occupied #1 money after the pitch title. Not a Bid .seat. */
function cardFacts(listing: Listing, clicks: number): string {
  const host = escapeHtml(hostnameOf(listing.url));
  return `<p class="clicks" data-slot="card-meta" data-card-facts="true"><span class="card-host">${host}</span><span class="card-fact-separator" aria-hidden="true">·</span><span class="card-clicks">${clicks} clicks</span></p>`;
}

function prizeLaterFact(listing: Listing, rankHtml: string, clicks: number, cardPrice?: string): string {
  const priceAttr = cardPrice ? ` data-card-price="${escapeHtml(cardPrice)}"` : "";
  return `<p class="rank later-fact" data-slot="card-price" data-later-fact="true"${priceAttr}><span class="rank-label">${rankHtml}</span></p>
      ${cardFacts(listing, clicks)}`;
}

function bidSeat(listing: Listing, rankHtml: string, clicks: number, cardPrice?: string): string {
  const priceAttr = cardPrice ? ` data-card-price="${escapeHtml(cardPrice)}"` : "";
  return `<div class="seat" data-slot="card-price-track">
      <span class="cue-label">Bid</span>
      <p class="rank" data-slot="card-price"${priceAttr}><span class="rank-label">${rankHtml}</span></p>
      ${cardFacts(listing, clicks)}
    </div>`;
}

/** Later Bid .seat after occupied #1 Open. Same Bid DNA, quieter than the prize hop. */
function laterBidSeat(listing: Listing, rankHtml: string, clicks: number, cardPrice?: string): string {
  return bidSeat(listing, rankHtml, clicks, cardPrice).replace(
    'class="seat"',
    'class="seat later-seat" data-later-seat="true"',
  );
}

/** Later-rank Open as a foot hop. Not the filled #1 hop. */
function laterOpenFoot(listing: Listing): string {
  const url = escapeHtml(listing.url);
  const href = clickHref(listing.id);
  return `<footer class="later-open-foot" data-slot="card-action" data-later-open-foot="true" data-card-action="true">
        <a class="open-later" data-open-later="true" href="${href}" target="_blank" rel="noopener noreferrer">
          Open deck
          <span class="deck-url">${url}</span>
        </a>
      </footer>`;
}

function deckHop(
  listing: Listing,
  paid: boolean,
  later: boolean,
  firstAction: boolean,
): string {
  const url = escapeHtml(listing.url);
  const href = clickHref(listing.id);
  if (paid && later) {
    return laterOpenFoot(listing);
  }
  if (paid) {
    const firstAttr = firstAction ? ' data-first-click="open"' : "";
    return `<p class="deck" data-slot="card-action" data-card-action="true">
        <a class="open-deck" data-open-deck="true"${firstAttr} href="${href}" target="_blank" rel="noopener noreferrer">
          Open deck
          <span class="deck-url">${url}</span>
        </a>
      </p>`;
  }
  return `<p class="deck">
        <span class="cue-label">Deck or site</span>
        <a class="listing-url" href="${href}" rel="noopener noreferrer">${url}</a>
      </p>`;
}

function renderCueCard(input: {
  listing: Listing;
  clicks: number;
  rankHtml: string;
  attrs: string;
  extraClass?: string;
  paid: boolean;
  later?: boolean;
  cardPrice?: string;
  firstAction?: boolean;
  openFirstLayout?: boolean;
  prizeFirst?: boolean;
}): string {
  const company = escapeHtml(input.listing.company);
  const oneLiner = escapeHtml(input.listing.oneLiner);
  const later = input.later === true;
  const openFirstLayout = input.openFirstLayout === true;
  const prizeFirst = input.prizeFirst === true;
  const klass = input.extraClass ? `listing ${input.extraClass}` : "listing";
  const hop = deckHop(
    input.listing,
    input.paid,
    later,
    input.firstAction === true,
  );
  const attrs = later
    ? `${input.attrs} data-later-deck="true"`
    : openFirstLayout
      ? `${input.attrs} data-open-first="true" data-prize-first="true"`
      : prizeFirst
        ? `${input.attrs} data-prize-first="true"`
        : input.attrs;
  const prizeTitle = `<div class="who" data-slot="card-copy">
      <p class="company" data-slot="card-title">${company}</p>
      <p class="one-liner" data-slot="card-description">${oneLiner}</p>
    </div>`;
  const laterMoney = prizeLaterFact(input.listing, input.rankHtml, input.clicks, input.cardPrice);
  const body = later
    ? `<div class="cue later-cue" data-slot="card-body">
    ${prizeTitle}
    ${laterBidSeat(input.listing, input.rankHtml, input.clicks, input.cardPrice)}
    ${hop}
  </div>`
    : prizeFirst && openFirstLayout
      ? `<div class="cue open-first-cue" data-slot="card-body">
    ${prizeTitle}
    ${hop}
    ${laterMoney}
  </div>`
      : prizeFirst
        ? `<div class="cue" data-slot="card-body">
    ${prizeTitle}
    ${laterMoney}
  </div>
  ${hop}`
        : `<div class="cue off-board-cue" data-slot="card-body">
      <div class="who" data-slot="card-copy">
      <p class="company" data-slot="card-title">${company}</p>
      <p class="one-liner" data-slot="card-description">${oneLiner}</p>
      ${hop}
      <span class="cue-label">Not on the board</span>
      <p class="rank">${input.rankHtml}</p>
      <p class="clicks">${input.clicks} clicks</p>
    </div>
  </div>`;
  const cardSlot = input.paid ? "paid-card" : "unranked-card";
  const stageRole = input.paid ? (later ? "later-cue" : "lead-cue") : "in-wings";
  return `<li class="${klass}" data-slot="${cardSlot}" data-stage-card="${stageRole}"${attrs} data-clicks="${input.clicks}">
  ${body}
</li>`;
}

function renderUnranked(listing: Listing, clicks: number): string {
  return renderCueCard({
    listing,
    clicks,
    rankHtml: "Unranked — no paid bid yet",
    attrs: ' data-unranked="true" data-off-board="true"',
    paid: false,
  });
}

function renderRanked(
  listing: RankedListing,
  clicks: number,
  laterDecksExist: boolean,
): string {
  const topThree = listing.rank <= 3;
  return renderCueCard({
    listing,
    clicks,
    rankHtml: `#${listing.rank} · $${listing.bid.amountUsd}`,
    attrs: ` data-rank="${listing.rank}" data-bid="${listing.bid.amountUsd}"${topThree ? ' data-top-three="true"' : ""}`,
    extraClass: listing.rank === 1 ? "top top-three-card" : topThree ? "top-three-card" : undefined,
    paid: true,
    later: listing.rank > 1,
    cardPrice: `$${listing.bid.amountUsd}`,
    firstAction: listing.rank === 1,
    openFirstLayout: listing.rank === 1 && laterDecksExist,
    prizeFirst: listing.rank === 1,
  });
}

function activityStamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}`;
}

function renderTodaysRanking(ranked: RankedListing[]): string {
  const topRows = ranked.filter((row) => row.rank <= 3);
  if (topRows.length === 0) {
    return "";
  }
  return `<section class="secondary-section secondary-ranking" data-slot="today-strip" data-todays-ranking="true" aria-labelledby="todays-ranking-title">
  <div class="secondary-heading">
    <h2 id="todays-ranking-title">Today's top ranking</h2>
    <span class="secondary-window" data-ranking-window="rolling-7-days">Rolling 7 days</span>
  </div>
  <ol class="secondary-list" aria-label="Current opening-slot ranking">
${topRows
  .map(
    (row) => `<li class="secondary-row ranking-tile" data-secondary-rank="${row.rank}" data-secondary-tile="true">
    <span class="secondary-rank">#${row.rank}</span>
    <span class="secondary-company">${escapeHtml(row.company)}</span>
    <strong class="secondary-bid">$${row.bid.amountUsd}</strong>
  </li>`,
  )
  .join("\n")}
  </ol>
</section>`;
}

function renderLatestActivity(
  listings: Listing[],
  ranked: RankedListing[],
  clicksOf: (id: string) => number,
): string {
  const rankedIds = new Set(ranked.map((row) => row.id));
  const facts = [
    ...ranked.map((row) => {
      const clicks = clicksOf(row.id);
      return {
        listing: row,
        at: row.bid.paidAt,
        source: "paid-bid",
        label: "Paid bid",
        detail: `$${row.bid.amountUsd}${clicks > 0 ? ` · ${clicks} clicks` : ""}`,
      };
    }),
    ...listings
      .filter((listing) => !rankedIds.has(listing.id))
      .map((listing) => ({
        listing,
        at: listing.createdAt,
        source: "listing-created",
        label: "Listed",
        detail: "",
      })),
  ];
  facts.sort((left, right) => {
    const rightTime = Date.parse(right.at);
    const leftTime = Date.parse(left.at);
    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }
    return left.listing.id.localeCompare(right.listing.id);
  });
  const recent = facts.slice(0, 5);
  if (recent.length === 0) {
    return "";
  }
  return `<section class="secondary-section secondary-activity" data-slot="activity-strip" data-latest-activity="true" aria-labelledby="latest-activity-title">
  <div class="secondary-heading">
    <h2 id="latest-activity-title">Latest activity</h2>
    <span class="secondary-window" data-activity-facts="true">Listing and payment facts</span>
  </div>
  <ul class="secondary-list" aria-label="Latest pitch activity">
${recent
  .map(
    (fact) => `<li class="secondary-row activity-row" data-activity-source="${fact.source}" data-activity-at="${escapeHtml(fact.at)}">
    <span class="activity-kind">${fact.label}</span>
    <span class="activity-company">${escapeHtml(fact.listing.company)}</span>
    <span class="activity-detail">${escapeHtml(fact.detail)}${activityStamp(fact.at) ? ` · ${activityStamp(fact.at)}` : ""}</span>
  </li>`,
  )
  .join("\n")}
  </ul>
</section>`;
}

function claimChrome(
  defaultBidUsd: number,
  emptyRoom: boolean,
  topUsd?: number,
): string {
  let note: string;
  let hint: string;
  if (emptyRoom) {
    note = `<p class="claim-note" data-empty-room>
  <span class="room">The room is empty.</span>
  This week's first slot is still open. A confirmed bid takes it.
  <span class="week-window" data-rolling-week="true">Rolling last 7 days. Not Monday 00:00 UTC.</span>
</p>`;
    hint =
      "Company, deck URL, and a one-liner. Unpaid checkout does not rank.";
  } else if (topUsd !== undefined) {
    const raiseChargeUsd = Math.max(0, defaultBidUsd - topUsd);
    note = `<p class="claim-note" data-occupied-raise data-raise-difference="true" data-after-outbid="true">
  <span class="room" data-quiet-room="true">#1 is $${topUsd}.</span>
  <span class="week-window" data-rolling-week="true" data-quiet-window="true">Rolling last 7 days. Not Monday 00:00 UTC.</span>
  <span class="raise-charge" data-raise-charge="true" data-quiet-charge="true" data-current-usd="${topUsd}">Raise charge: $<span data-raise-charge-usd>${raiseChargeUsd}</span> — only the difference.</span>
</p>`;
    hint = "An incomplete checkout stays off the house.";
  } else {
    note = `<p class="claim-note">This week's first three minutes are for sale. The rest of the room is not. Rank updates after payment is confirmed.
  <span class="week-window" data-rolling-week="true">Rolling last 7 days. Not Monday 00:00 UTC.</span>
</p>`;
    hint =
      "Company, deck URL, and a one-liner. Unpaid checkout does not rank.";
  }
  const raiseScript =
    topUsd === undefined
      ? `    document.querySelectorAll("[data-bid-step]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        input.value = String(parseBid(input.value) + Number(btn.getAttribute("data-bid-step")));
      });
    });`
      : `    var current = ${topUsd};
    var chargeUsd = document.querySelector("[data-raise-charge-usd]");
    function syncCharge() {
      if (!chargeUsd) return;
      var next = parseBid(input.value);
      chargeUsd.textContent = String(next > current ? next - current : 0);
    }
    document.querySelectorAll("[data-bid-step]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        input.value = String(parseBid(input.value) + Number(btn.getAttribute("data-bid-step")));
        syncCharge();
      });
    });
    input.addEventListener("input", syncCharge);`;
  const occupiedNoteAfterOutbid = emptyRoom === false && topUsd !== undefined;
  const occupiedOutbidBesidePlus = occupiedNoteAfterOutbid;
  const heroTitle = topUsd === undefined ? "Claim the opening slot" : "Claim #1 for";
  // Keep the Outbid action hook for the public Claim rank control. The amount
  // and +/- stepper remain the primary action cluster for both room states.
  const claimCluster = `<span class="claim">
    <button type="button" class="step" data-bid-step="-1" aria-label="Decrease bid by one">−</button>
    <label class="bid-field" data-amount-field="true">
      <span class="sr-only">Amount in dollars</span>
      <span class="currency">$</span><input id="bid" name="amountUsd" form="bid-form" inputmode="numeric" pattern="[0-9]*" value="${defaultBidUsd}" aria-label="Bid amount in dollars"/>
    </label>
    <button type="button" class="step" data-bid-step="1" aria-label="Increase bid by one">+</button>
  </span>`;
  const stageHead = `<div class="stage-head"${occupiedOutbidBesidePlus ? ' data-quiet-headline="true"' : ""} data-hero="true" data-stage-cue="opening">
    <p class="hero-kicker">Opening cue · one scarce slot</p>
    <h1 class="headline">Opening three minutes</h1>
    <div class="hero-line">
      <h2 class="hero-title" data-slot="claim-heading"><span class="hero-title-copy">${heroTitle}</span>${claimCluster}</h2>
    </div>
    <p class="hero-subtitle">The first three minutes of this week's room go to the highest paid bid.</p>
  </div>`;
  return `<section id="claim" data-slot="claim-hero" data-stage-section="opening-cue" data-pitch-role="opening-cue">
  ${stageHead}
  ${
    emptyRoom === true
      ? `<form id="bid-form" class="bid-form claim-form later-write" data-slot="claim-form" data-later-write="true" data-stage-form="opening-cue" method="post" action="/listings">
    <div class="bid-row" data-primary-form-row="true">
      <div class="field field-url" data-slot="url-input"><label class="sr-only" for="url">Deck or site</label><input id="url" name="url" data-slot="url-input" data-required-field="true" type="url" required placeholder="https://deck-or-site" autocomplete="url"/></div>
      <div class="function-choice" data-slot="category-control" data-function-choice="opening-slot" aria-label="Pitch function"><span>Opening slot</span><span class="function-choice-detail">3 minutes</span></div>
      <button type="submit" data-slot="claim-button" data-claim-submit="true" disabled aria-disabled="true" aria-label="Claim rank" data-action="outbid" class="outbid">Outbid</button>
    </div>
    <p class="form-hint">${hint}</p>
  </form>`
      : `<form id="bid-form" class="bid-form claim-form" data-slot="claim-form" data-stage-form="opening-cue" method="post" action="/listings">
    <div class="bid-row"${occupiedOutbidBesidePlus ? ' data-after-action="true"' : ""} data-primary-form-row="true">
      <div class="field field-url" data-slot="url-input"><label class="sr-only" for="url">Deck or site</label><input id="url" name="url" data-slot="url-input" data-required-field="true" type="url" required placeholder="https://deck-or-site" autocomplete="url"/></div>
      <div class="function-choice" data-slot="category-control" data-function-choice="opening-slot" aria-label="Pitch function"><span>Opening slot</span><span class="function-choice-detail">3 minutes</span></div>
      <button type="submit" data-slot="claim-button" data-claim-submit="true"${occupiedOutbidBesidePlus ? ' data-beside-plus="true"' : ""} disabled aria-disabled="true" aria-label="Claim rank" data-action="outbid" class="outbid">Outbid</button>
    </div>
    ${occupiedNoteAfterOutbid ? note : ""}
    <p class="form-hint">${hint}</p>
  </form>`
  }
  ${occupiedNoteAfterOutbid ? "" : note}
</section>
<script>
  (function () {
    function init() {
      var min = ${MIN_BID_USD};
      var input = document.getElementById("bid");
      if (!input) return;
      function parseBid(raw) {
        var n = parseInt(String(raw).replace(/[^0-9]/g, ""), 10);
        return Number.isFinite(n) ? Math.max(min, n) : min;
      }
      var requiredFields = document.querySelectorAll("[data-required-field]");
      var submitters = document.querySelectorAll("[data-claim-submit]");
      function syncReady() {
        var ready = requiredFields.length > 0;
        requiredFields.forEach(function (field) {
          var value = String(field.value || "").trim();
          if (!value) ready = false;
          if (field.id === "url" && value.toLowerCase().indexOf("https://") !== 0) ready = false;
        });
        submitters.forEach(function (button) {
          button.disabled = !ready;
          button.setAttribute("aria-disabled", String(!ready));
          button.setAttribute("data-ready", String(ready));
        });
      }
      requiredFields.forEach(function (field) {
        field.addEventListener("input", syncReady);
        field.addEventListener("change", syncReady);
      });
      syncReady();
${raiseScript}
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  })();
</script>`;
}

function renderArchiveChrome(): string {
  return `<section id="claim" data-slot="claim-hero" data-stage-section="house-archive" data-pitch-role="house-archive">
  <div class="stage-head stage-archive" data-hero="true">
    <p class="hero-kicker">House archive · paid cues outside the room</p>
    <h1 class="headline">Past paid pitches</h1>
    <p class="hero-subtitle">The rolling room is live for seven days. These paid cues are kept here as history.</p>
  </div>
</section>`;
}

export function renderBoard(
  listings: Listing[],
  ranked: RankedListing[] = [],
  clicksById: ReadonlyMap<string, number> = new Map(),
  options: RenderBoardOptions = {},
): string {
  const period: BoardPeriod = options.period === "archive" ? "archive" : "open";
  const boardRanked = period === "archive" ? options.archiveRanked ?? [] : ranked;
  const boardListings = period === "archive" ? boardRanked : listings;
  const rankedIds = new Set(boardRanked.map((row) => row.id));
  const unranked = boardListings.filter((listing) => !rankedIds.has(listing.id));
  const clicksOf = (id: string): number => clicksById.get(id) ?? 0;
  const laterDecksExist = boardRanked.some((row) => row.rank > 1);
  const lead = boardRanked.filter((row) => row.rank === 1);
  const laterSeats = boardRanked.filter((row) => row.rank > 1);
  const topLaterSeats = laterSeats.filter((row) => row.rank <= 3);
  const lowerSeats = laterSeats.filter((row) => row.rank > 3);
  const board = lead.map((row) =>
    renderRanked(row, clicksOf(row.id), laterDecksExist),
  );
  const laterBoard = topLaterSeats.map((row) =>
    renderRanked(row, clicksOf(row.id), laterDecksExist),
  );
  const topBoard = [...board, ...laterBoard];
  const lowerBoard = lowerSeats.map((row) =>
    renderRanked(row, clicksOf(row.id), laterDecksExist),
  );
  const offBoard = unranked.map((row) => renderUnranked(row, clicksOf(row.id)));
  const topUsd = period === "open" ? ranked[0]?.bid.amountUsd : undefined;
  const defaultBid = topUsd === undefined ? MIN_BID_USD : topUsd + 1;
  const emptyRoom = period === "open" && listings.length === 0;
  const occupiedHouse = boardRanked.length > 0;
  const archiveEmpty = period === "archive" && boardRanked.length === 0;
  const boardKicker = period === "archive" ? "House archive" : "On stage";
  const boardTitle = period === "archive" ? "Past paid pitches" : "The opening cue";
  const boardLabel = period === "archive" ? "Historical paid pitches" : "Paid pitches on stage";
  const rankedRows =
    topBoard.length === 0
      ? ""
      : `<section class="board-section stage-section" id="board" data-board-section="true" data-stage-section="on-stage" aria-labelledby="board-title">
  <div class="board-heading">
    <div>
      <p class="section-kicker">${boardKicker}</p>
      <h2 id="board-title">${boardTitle}</h2>
    </div>
    <p class="board-key">${period === "archive" ? "Paid bids outside the rolling window" : "Rank = bid · older ties stay above"}</p>
  </div>
  <ol class="listings leaderboard" data-slot="top-three" data-stage-list="on-stage" data-top-three-list="true" aria-label="${boardLabel}"${period === "open" ? ' data-rolling-week="true"' : ' data-archive-board="true"'}>
${topBoard.join("\n")}
</ol>
</section>`;
  const lowerRows =
    lowerBoard.length === 0
      ? ""
      : `<ol class="listings listings-later listings-beyond" data-slot="later-rows" data-stage-list="later-cues" data-later-seats="true" aria-label="Later paid cues, ranks four and below">
${lowerBoard.join("\n")}
</ol>`;
  const unpaidRows =
    offBoard.length === 0
      ? ""
      : `<aside class="off-board" id="wings" data-stage-section="in-wings" data-off-board-list="true" aria-label="In the wings">
<div class="board-heading board-heading-quiet">
  <div>
    <p class="section-kicker">In the wings</p>
    <h2>Waiting on payment</h2>
  </div>
</div>
<ul class="off-board-list">
${offBoard.join("\n")}
</ul>
</aside>`;
  const archiveEmptyRows = archiveEmpty
    ? `<section class="board-section archive-empty" id="board" data-board-section="true" data-archive-empty="true" aria-labelledby="board-title">
  <div class="board-heading">
    <div>
      <p class="section-kicker">Archive</p>
      <h2 id="board-title">Past paid pitches</h2>
    </div>
  </div>
  <p class="archive-empty-copy">No historical paid pitches yet.</p>
</section>`
    : "";
  const rows =
    period === "archive"
      ? `${archiveEmptyRows}${archiveEmpty ? "" : `${rankedRows}\n  ${lowerRows}`}`
      : emptyRoom
        ? ""
        : `${rankedRows}
  ${lowerRows}
  ${unpaidRows}`;
  const claim = period === "archive"
    ? renderArchiveChrome()
    : claimChrome(defaultBid, emptyRoom, topUsd);
  const context = renderHomeContext(period);
  const rail = renderFunctionRail();
  const details = renderPitchDetails();
  // Empty house: Claim #1 leads directly into the visible write fields.
  // Occupied house: the claim action leads the room; the compatibility marker
  // keeps the occupied claim anatomy discoverable without changing rank data.
  const homeBody =
    occupiedHouse === true
      ? `${context}
  <div class="claim-after-slot claim-primary" data-claim-after-slot="true">
  ${claim}
  </div>
  ${rail}
  ${rows}
  ${details}`
      : `${context}
  ${claim}
  ${rail}
  ${rows}
  ${details}`;
  const body = `<div class="pitch-home" data-pitch-home="true" data-period="${period}">
  ${homeBody}
</div>`;

  return renderLayout({
    title: "Opening three minutes",
    path: "/",
    emptyHouse: emptyRoom,
    occupiedHouse,
    searchRanked: boardRanked,
    period,
    body,
  });
}

export function renderAbout(): string {
  return renderLayout({
    title: "About · Pitch First Slot",
    path: "/about",
    body: `<article class="program">
<h1>About</h1>
<p>This week's first three minutes are for sale. The rest of the room is not.</p>
<p>Pitch First Slot is a public weekly auction for <strong>one</strong> scarce slot in front of angels and scouts: the <strong>opening 3-minute pitch</strong>, or <strong>#1 on that week's deal list</strong>. Rank is the bid. The room watches the price.</p>
<p>You <strong>cannot buy the show</strong>. You cannot buy the rest of the show, the remaining agenda, remaining pitch slots, a private lock on every pitch, hosting the whole show, pinning #1 for multiple weeks, or hiding other listings.</p>
<p>Each paid placement remains eligible for <strong>seven days</strong>. The window follows the payment time instead of resetting for everyone at Monday midnight. Last week's #1 does not carry rank after seven days.</p>
<p>Anyone can watch the room without an account. A pitch appears only after payment is confirmed, and public click counts never affect rank.</p>
</article>`,
  });
}

export function renderRules(): string {
  return renderLayout({
    title: "Rules · Pitch First Slot",
    path: "/rules",
    body: `<article class="program">
<h1>Rules</h1>
<p>One opening cue, one rolling last-7-days window, and one prize: this week's opening slot.</p>
<ol>
  <li><strong>Currency.</strong> Whole US dollars only.</li>
  <li><strong>Minimum.</strong> First paid bid on a listing in a week is <strong>$5</strong>.</li>
  <li><strong>Rank = bid.</strong> Sort paid bids in the rolling last 7 days descending. #1 is the opening slot.</li>
  <li><strong>Ties.</strong> Same bid amount: the listing placed first keeps the higher rank.</li>
  <li><strong>Raise = difference.</strong> If a listing is at $40 and the founder bids $55, the original payer is charged <strong>$15</strong>, not $55. The public bid becomes $55.</li>
  <li><strong>Below #1 is allowed.</strong> A $5 bid still lists, at the rank that amount buys.</li>
  <li><strong>Same listing inside seven days.</strong> A raise updates the current listing instead of creating a duplicate. A founder who paid Sunday can still raise on Monday while that placement is active. After seven days, the same pitch requires a new full bid.</li>
  <li><strong>Rolling window.</strong> Paid bids expire seven days after placement. The board does not reset for everyone at Monday midnight, and it remains empty when no active paid bids exist.</li>
  <li><strong>No retract.</strong> A paid bid is not refundable because someone else raised.</li>
</ol>
<p>You <strong>cannot buy the show</strong>. The remaining pitch slots, hosting, multiweek pinning, and hiding other listings are not for sale.</p>
<p>A bid becomes current only after a successful payment. Unpaid checkout sessions do not change rank.</p>
</article>`,
  });
}

function firstQuery(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  return undefined;
}

export function checkoutReturnKind(
  payment: PaymentPort,
  query: { checkoutId?: unknown; intent?: unknown; status?: unknown },
): {
  kind: "cancel" | "pending" | "paid";
  session?: CheckoutRecord;
} {
  const rawStatus = (firstQuery(query.status) ?? "").toLowerCase();
  if (
    rawStatus === "cancel" ||
    rawStatus === "canceled" ||
    rawStatus === "cancelled"
  ) {
    return { kind: "cancel" };
  }
  const checkoutId = firstQuery(query.checkoutId) ?? firstQuery(query.intent);
  if (!checkoutId) {
    return { kind: "pending" };
  }
  const session = payment.getCheckout(checkoutId);
  if (!session) {
    return { kind: "pending" };
  }
  if (session.status === "paid") {
    return { kind: "paid", session };
  }
  return { kind: "pending", session };
}

/** Checkout return is read-only. It never applies payment or changes rank. */
export function renderCheckoutReturn(
  payment: PaymentPort,
  db: AppDb,
  query: { checkoutId?: unknown; intent?: unknown; status?: unknown },
): string {
  const result = checkoutReturnKind(payment, query);
  let body: string;
  if (result.kind === "cancel") {
    body = `<article class="program" data-return="cancel">
<h1>Checkout canceled</h1>
<p>No rank was claimed. A canceled or incomplete checkout never becomes the opening slot.</p>
<p><a href="/">Back to the room</a></p>
</article>`;
  } else if (result.kind === "paid" && result.session) {
    const listing = getListingById(db, result.session.listingId);
    const company = listing ? escapeHtml(listing.company) : "This listing";
    const isRaise = result.session.chargeUsd < result.session.nextUsd;
    if (isRaise) {
      body = `<article class="program" data-return="paid" data-raise-difference="true">
<h1>Raise confirmed</h1>
<p>$${result.session.chargeUsd} was charged to raise the bid to $${result.session.nextUsd} — only the difference, not a new full bid.</p>
<p>${company} is on the house at $${result.session.nextUsd}. Rank is the bid.</p>
<p><a href="/">Back to the room</a></p>
</article>`;
    } else {
      body = `<article class="program" data-return="paid">
<h1>Payment received</h1>
<p>${company} is on the house at $${result.session.nextUsd}. Rank is the bid.</p>
<p><a href="/">Back to the room</a></p>
</article>`;
    }
  } else {
    body = `<article class="program" data-return="pending">
<h1>Payment pending</h1>
<p>The checkout has not been confirmed. No rank changes until confirmation arrives.</p>
<p><a href="/">Back to the room</a></p>
</article>`;
  }
  return renderLayout({
    title: "Checkout · Pitch First Slot",
    path: "/checkout/complete",
    body,
  });
}

export const pageRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => {
    const query = request.query as { period?: unknown };
    const period: BoardPeriod =
      (firstQuery(query.period) ?? "").toLowerCase() === "archive"
        ? "archive"
        : "open";
    const listings = listListings(app.db);
    const ranked = rankedBoard(app.db, app.now());
    const clicks = clickCountsByListing(app.db);
    const archiveRanked = period === "archive" ? archivedPaidBoard(app.db, app.now()) : [];
    return reply
      .type("text/html; charset=utf-8")
      .send(renderBoard(listings, ranked, clicks, { period, archiveRanked }));
  });

  app.get("/about", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(renderAbout());
  });

  app.get("/rules", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(renderRules());
  });

  app.get("/checkout/complete", async (request, reply) => {
    const query = request.query as {
      checkoutId?: string;
      intent?: string;
      status?: string;
    };
    return reply
      .type("text/html; charset=utf-8")
      .send(renderCheckoutReturn(app.payment, app.db, query));
  });
};
