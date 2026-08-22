import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentWeekId,
  isWeekId,
  nextMondayUtc,
  nowUtc,
  weekIdFor,
} from "../src/core/week.js";

test("weekId is the UTC Monday date of the open week", () => {
  assert.equal(weekIdFor(new Date("2026-08-17T00:00:00.000Z")), "2026-08-17");
  assert.equal(weekIdFor(new Date("2026-08-20T15:04:05.000Z")), "2026-08-17");
  assert.equal(weekIdFor(new Date("2026-08-23T23:59:59.999Z")), "2026-08-17");
});

test("Monday 00:00 UTC opens a new weekId", () => {
  assert.equal(weekIdFor(new Date("2026-08-16T23:59:59.999Z")), "2026-08-10");
  assert.equal(weekIdFor(new Date("2026-08-17T00:00:00.000Z")), "2026-08-17");
  assert.equal(weekIdFor(new Date("2026-08-24T00:00:00.000Z")), "2026-08-24");
});

test("next reset is the following Monday 00:00 UTC", () => {
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
