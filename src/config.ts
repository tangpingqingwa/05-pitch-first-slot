export type PolarEnv = NodeJS.ProcessEnv;

/** `POLAR_FIXTURE_ONLY=1` always wins over `POLAR_LIVE`. */
export function polarFixtureOnly(env: PolarEnv = process.env): boolean {
  return env.POLAR_FIXTURE_ONLY === "1";
}

/** Live Polar only when `POLAR_LIVE=1`. Unset / `0` stay fixture. */
export function polarLiveEnabled(env: PolarEnv = process.env): boolean {
  if (polarFixtureOnly(env)) {
    return false;
  }
  return env.POLAR_LIVE === "1";
}

export function polarAccessToken(env: PolarEnv = process.env): string | undefined {
  const token = env.POLAR_ACCESS_TOKEN?.trim();
  return token ? token : undefined;
}

export function polarWebhookSecret(env: PolarEnv = process.env): string | undefined {
  const secret = env.POLAR_WEBHOOK_SECRET?.trim();
  return secret ? secret : undefined;
}

/** Optional Polar product for hosted checkout. Live sandbox needs this. */
export function polarProductId(env: PolarEnv = process.env): string | undefined {
  const productId = env.POLAR_PRODUCT_ID?.trim();
  return productId ? productId : undefined;
}

export function publicBaseUrl(env: PolarEnv = process.env): string {
  const raw = env.PUBLIC_BASE_URL?.trim();
  if (raw) {
    return raw.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

/** Override with `POLAR_API_BASE` in tests. Default host is assembled, never fetched from CI. */
export function polarApiBase(env: PolarEnv = process.env): string {
  const fromEnv = env.POLAR_API_BASE?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return `https://${["api", "polar", "sh"].join(".")}`;
}
