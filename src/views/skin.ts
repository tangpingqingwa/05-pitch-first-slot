/** Pitch-night house: warm dark room, follow-spot, cream cue cards. Not a night-blue dashboard. */
export const BOARD_CSS = /* css */ `
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
  text-decoration: underline dashed;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.28em;
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
.listing[data-later-deck] .deck {
  margin: 0.2rem 0 0;
  padding-top: 0;
  border-top: 0;
}
.listing[data-later-deck] .open-later {
  display: inline-block;
  font-family: var(--sans);
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: 0.01em;
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
.listing[data-open-one-first] .open-one-cue {
  grid-template-columns: minmax(0, 1fr);
  gap: 0.4rem;
}
.listing[data-open-one-first] .open-one-cue .deck {
  margin: 0.15rem 0 0;
  padding-top: 0;
  border-top: 0;
}
.listing[data-open-one-first] .open-one {
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
.listing[data-open-one-first] .open-one .deck-url {
  margin-top: 0.25rem;
}
.listing[data-open-one-first] .seat {
  justify-items: start;
  text-align: left;
  min-width: 0;
}
.listing[data-raise-one-first] .raise-one {
  display: inline-block;
  margin-top: 0.45rem;
  padding-top: 0.2rem;
  border-top: 0;
  font-family: var(--serif);
  font-size: 1.55rem;
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: -0.02em;
  color: rgb(138, 75, 18);
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.14em;
}
.listing[data-raise-one-first] .raise-one .raise-after-note {
  margin-top: 0.2rem;
  color: var(--ink-soft);
}
.listing[data-raise-after-open-two-first] .raise-after-open-two {
  display: inline-block;
  margin-top: 0.45rem;
  padding-top: 0.2rem;
  border-top: 0;
  font-family: var(--serif);
  font-size: 2.15rem;
  font-weight: 400;
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: rgb(138, 75, 18);
  text-decoration: underline;
  text-decoration-thickness: 3px;
  text-underline-offset: 0.12em;
}
.listing[data-raise-after-open-two-first] .raise-after-open-two .raise-after-note {
  margin-top: 0.22rem;
  color: var(--ink-soft);
}
.listing[data-open-after-raise-one-first] .open-after-raise-one {
  display: inline-block;
  font-family: var(--serif);
  font-size: 1.95rem;
  font-weight: 400;
  line-height: 1.05;
  letter-spacing: -0.03em;
  text-decoration: underline;
  text-decoration-thickness: 3px;
  text-underline-offset: 0.12em;
  color: rgb(138, 75, 18);
}
.listing[data-open-after-raise-one-first] .open-after-raise-one .deck-url {
  margin-top: 0.28rem;
}
.listing[data-open-after-raise-two-first] .open-after-raise-two {
  display: inline-block;
  font-family: var(--serif);
  font-size: 2.35rem;
  font-weight: 400;
  line-height: 1.02;
  letter-spacing: -0.03em;
  text-decoration: underline;
  text-decoration-thickness: 4px;
  text-underline-offset: 0.1em;
  color: rgb(138, 75, 18);
}
.listing[data-open-after-raise-two-first] .open-after-raise-two .deck-url {
  margin-top: 0.3rem;
}
.listing[data-raise-after-open-three-first] .raise-after-open-three {
  display: inline-block;
  margin-top: 0.5rem;
  padding-top: 0.2rem;
  border-top: 0;
  font-family: var(--serif);
  font-size: 2.55rem;
  font-weight: 400;
  line-height: 1.02;
  letter-spacing: -0.03em;
  color: rgb(138, 75, 18);
  text-decoration: underline;
  text-decoration-thickness: 4px;
  text-underline-offset: 0.1em;
}
.listing[data-raise-after-open-three-first] .raise-after-open-three .raise-after-note {
  margin-top: 0.24rem;
  color: var(--ink-soft);
}
.listing[data-open-after-raise-three-first] .open-after-raise-three {
  display: inline-block;
  font-family: var(--serif);
  font-size: 2.75rem;
  font-weight: 400;
  line-height: 1.02;
  letter-spacing: -0.03em;
  text-decoration: underline;
  text-decoration-thickness: 5px;
  text-underline-offset: 0.1em;
  color: rgb(138, 75, 18);
}
.listing[data-open-after-raise-three-first] .open-after-raise-three .deck-url {
  margin-top: 0.32rem;
}
.listing[data-raise-after-open-four-first] .raise-after-open-four {
  display: inline-block;
  margin-top: 0.55rem;
  padding-top: 0.2rem;
  border-top: 0;
  font-family: var(--serif);
  font-size: 2.95rem;
  font-weight: 400;
  line-height: 1.02;
  letter-spacing: -0.03em;
  color: rgb(138, 75, 18);
  text-decoration: underline;
  text-decoration-thickness: 6px;
  text-underline-offset: 0.1em;
}
.listing[data-raise-after-open-four-first] .raise-after-open-four .raise-after-note {
  margin-top: 0.26rem;
  color: var(--ink-soft);
}
.listing[data-open-after-raise-four-first] .open-after-raise-four {
  display: inline-block;
  font-family: var(--serif);
  font-size: 3.15rem;
  font-weight: 400;
  line-height: 1.02;
  letter-spacing: -0.03em;
  text-decoration: underline;
  text-decoration-thickness: 7px;
  text-underline-offset: 0.1em;
  color: rgb(138, 75, 18);
}
.listing[data-open-after-raise-four-first] .open-after-raise-four .deck-url {
  margin-top: 0.34rem;
}
.listing[data-raise-after-open-five-first] .raise-after-open-five {
  display: inline-block;
  margin-top: 0.6rem;
  padding-top: 0.2rem;
  border-top: 0;
  font-family: var(--serif);
  font-size: 3.35rem;
  font-weight: 400;
  line-height: 1.02;
  letter-spacing: -0.03em;
  color: rgb(138, 75, 18);
  text-decoration: underline;
  text-decoration-thickness: 8px;
  text-underline-offset: 0.1em;
}
.listing[data-raise-after-open-five-first] .raise-after-open-five .raise-after-note {
  margin-top: 0.28rem;
  color: var(--ink-soft);
}
.listing[data-open-after-raise-five-first] .open-after-raise-five {
  display: inline-block;
  font-family: var(--serif);
  font-size: 3.55rem;
  font-weight: 400;
  line-height: 1.02;
  letter-spacing: -0.03em;
  text-decoration: underline;
  text-decoration-thickness: 9px;
  text-underline-offset: 0.1em;
  color: rgb(138, 75, 18);
}
.listing[data-open-after-raise-five-first] .open-after-raise-five .deck-url {
  margin-top: 0.36rem;
}
.listing[data-raise-after-open-six-first] .raise-after-open-six {
  display: inline-block;
  margin-top: 0.65rem;
  padding-top: 0.2rem;
  border-top: 0;
  font-family: var(--serif);
  font-size: 3.75rem;
  font-weight: 400;
  line-height: 1.02;
  letter-spacing: -0.03em;
  color: rgb(138, 75, 18);
  text-decoration: underline;
  text-decoration-thickness: 10px;
  text-underline-offset: 0.1em;
}
.listing[data-raise-after-open-six-first] .raise-after-open-six .raise-after-note {
  margin-top: 0.3rem;
  color: var(--ink-soft);
}
.listing[data-open-one-first] .open-after-raise,
.listing[data-open-one-first] .raise-after-open {
  font-size: 1rem;
  color: var(--ink-soft);
}
.raise-after-deck {
  display: block;
  margin: 0.65rem 0 0;
  padding-top: 0.45rem;
  border-top: 1px dashed rgb(26 18 12 / 0.12);
  color: rgb(138, 75, 18);
  font-family: var(--serif);
  font-size: 1.15rem;
  font-weight: 400;
  line-height: 1.15;
}
.raise-after-deck:hover { text-decoration: underline; }
.raise-after-note {
  display: block;
  margin: 0.15rem 0 0;
  color: var(--ink-soft);
  font-family: var(--sans);
  font-size: 0.78rem;
  font-weight: 600;
}
.open-after-raise {
  display: block;
  margin: 0.55rem 0 0;
  color: var(--ink);
  font-family: var(--serif);
  font-size: 1.25rem;
  font-weight: 400;
  line-height: 1.15;
  text-decoration: underline;
  text-underline-offset: 0.16em;
}
.open-after-raise:hover { text-decoration-thickness: 2px; }
.open-after-note {
  display: block;
  margin: 0.15rem 0 0;
  color: var(--ink-soft);
  font-family: var(--sans);
  font-size: 0.78rem;
  font-weight: 600;
}
.raise-after-open {
  display: block;
  margin: 0.65rem 0 0;
  padding-top: 0.45rem;
  border-top: 1px dashed rgb(26 18 12 / 0.12);
  color: rgb(138, 75, 18);
  font-family: var(--serif);
  font-size: 1.35rem;
  font-weight: 400;
  line-height: 1.15;
}
.raise-after-open:hover { text-decoration: underline; }
.raise-after-open-note {
  display: block;
  margin: 0.15rem 0 0;
  color: var(--ink-soft);
  font-family: var(--sans);
  font-size: 0.78rem;
  font-weight: 600;
}
.seat .rank {
  margin: 0;
  font-family: var(--serif);
  font-size: 1.2rem;
  line-height: 1.15;
  color: var(--ink);
  max-width: 10rem;
}
.listing[data-unranked] .seat .rank {
  font-family: var(--sans);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--ink-soft);
  max-width: 8.5rem;
}
.seat .clicks { margin: 0; color: var(--ink-soft); font-size: 0.82rem; }
.listing.top .seat .rank { color: rgb(138, 75, 18); font-weight: 700; }
.listing[data-prize-first] .cue {
  grid-template-columns: minmax(0, 1fr);
  gap: 0.45rem;
}
.listing[data-prize-first] .seat {
  justify-items: start;
  text-align: left;
  min-width: 0;
}
.listing[data-prize-first] .company {
  font-size: 2.15rem;
  line-height: 1.05;
  letter-spacing: -0.03em;
}
.listing[data-prize-first] .one-liner {
  font-size: 1.05rem;
  line-height: 1.35;
}
.listing[data-prize-first] .seat .rank,
.listing.top[data-prize-first] .seat .rank {
  font-size: 1rem;
  font-weight: 400;
  color: var(--ink-soft);
}
.listing[data-prize-first] .seat .clicks { font-size: 0.75rem; }
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
`;
