/**
 * Rolling last-7-days house window. Tests may set `WEEK_NOW`.
 * Raise identity is the listing still inside this window. `weekId` is an audit label only.
 */

export type WeekId = string;

const WEEK_ID_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Duration of the public week window. Not a Monday midnight bucket. */
export const ROLLING_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function nowUtc(env: NodeJS.ProcessEnv = process.env): Date {
  const raw = env.WEEK_NOW;
  if (raw === undefined || raw.trim() === "") {
    return new Date();
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`invalid WEEK_NOW: ${raw}`);
  }
  return parsed;
}

/** Lower bound of the rolling last-7-days window; the exact boundary is expired. */
export function rollingWeekStart(now: Date = nowUtc()): Date {
  return new Date(now.getTime() - ROLLING_WEEK_MS);
}

export function bidInRollingWeek(
  paidAt: string,
  now: Date = nowUtc(),
): boolean {
  const paid = Date.parse(paidAt);
  if (Number.isNaN(paid)) {
    return false;
  }
  const t = now.getTime();
  return paid > t - ROLLING_WEEK_MS && paid <= t;
}

/**
 * Monday 00:00 UTC calendar date label for checkout/audit (`YYYY-MM-DD`).
 * Rank does not use this as the house window. Raise identity does not use this.
 */
export function weekIdFor(now: Date): WeekId {
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const daysFromMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - daysFromMonday);
  return day.toISOString().slice(0, 10);
}

export function currentWeekId(now: Date = nowUtc()): WeekId {
  return weekIdFor(now);
}

export function isWeekId(value: string): value is WeekId {
  if (!WEEK_ID_RE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Next Monday 00:00 UTC. Not the public rank expiry. */
export function nextMondayUtc(now: Date = nowUtc()): Date {
  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const dayMs = 86_400_000;
  if (now.getUTCDay() === 1) {
    return new Date(startOfToday + 7 * dayMs);
  }
  const daysUntilMonday = (8 - now.getUTCDay()) % 7;
  return new Date(startOfToday + daysUntilMonday * dayMs);
}
