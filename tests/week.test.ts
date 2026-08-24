import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ROLLING_WEEK_MS,
  bidInRollingWeek,
  currentWeekId,
  isWeekId,
  nextMondayUtc,
  nowUtc,
  rollingWeekStart,
  weekIdFor,
} from "../src/core/week.js";

test("weekId is the UTC Monday date of the open week", () => {
  assert.equal(weekIdFor(new Date("2026-08-17T00:00:00.000Z")), "2026-08-17");
  assert.equal(weekIdFor(new Date("2026-08-20T15:04:05.000Z")), "2026-08-17");
  assert.equal(weekIdFor(new Date("2026-08-23T23:59:59.999Z")), "2026-08-17");
});

test("Monday 00:00 UTC opens a new weekId label, not the house window", () => {
  assert.equal(weekIdFor(new Date("2026-08-16T23:59:59.999Z")), "2026-08-10");
  assert.equal(weekIdFor(new Date("2026-08-17T00:00:00.000Z")), "2026-08-17");
  assert.equal(weekIdFor(new Date("2026-08-24T00:00:00.000Z")), "2026-08-24");
});

test("next Monday 00:00 UTC is a label boundary, not rank expiry", () => {
  const monday = new Date("2026-08-17T00:00:00.000Z");
  const sunday = new Date("2026-08-23T12:00:00.000Z");
  assert.equal(nextMondayUtc(monday).toISOString(), "2026-08-24T00:00:00.000Z");
  assert.equal(nextMondayUtc(sunday).toISOString(), "2026-08-24T00:00:00.000Z");
});

test("WEEK_NOW injects the clock for currentWeekId", () => {
  const previous = process.env.WEEK_NOW;
  process.env.WEEK_NOW = "2026-08-19T08:00:00.000Z";
  try {
    assert.equal(nowUtc().toISOString(), "2026-08-19T08:00:00.000Z");
    assert.equal(currentWeekId(), "2026-08-17");
  } finally {
    if (previous === undefined) {
      delete process.env.WEEK_NOW;
    } else {
      process.env.WEEK_NOW = previous;
    }
  }
});

test("isWeekId accepts calendar dates only", () => {
  assert.equal(isWeekId("2026-08-17"), true);
  assert.equal(isWeekId("2026-W34"), false);
  assert.equal(isWeekId("2026-02-29"), false);
});

test("rolling last-7-days window is 7 * 24h, not Monday 00:00 UTC", () => {
  const now = new Date("2026-08-24T00:00:00.000Z");
  assert.equal(ROLLING_WEEK_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(
    rollingWeekStart(now).toISOString(),
    "2026-08-17T00:00:00.000Z",
  );
  assert.equal(bidInRollingWeek("2026-08-17T00:00:00.000Z", now), true);
  assert.equal(bidInRollingWeek("2026-08-16T23:59:59.000Z", now), false);
  assert.equal(bidInRollingWeek("2026-08-23T23:59:59.000Z", now), true);
  assert.equal(bidInRollingWeek("2026-08-24T00:00:01.000Z", now), false);
});

test("Monday 00:00 UTC does not drop a bid still inside the rolling week", () => {
  const sundayPay = "2026-08-16T12:00:00.000Z";
  const mondayMidnight = new Date("2026-08-17T00:00:00.000Z");
  assert.equal(bidInRollingWeek(sundayPay, mondayMidnight), true);
  assert.equal(
    bidInRollingWeek(sundayPay, new Date("2026-08-23T12:00:00.000Z")),
    true,
  );
  assert.equal(
    bidInRollingWeek(sundayPay, new Date("2026-08-23T12:00:01.000Z")),
    false,
  );
});
