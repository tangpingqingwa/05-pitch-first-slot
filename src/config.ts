export type WaffoEnv = NodeJS.ProcessEnv;
export type PaymentMode = "fixture" | "waffo-test" | "waffo-prod";
export type WaffoEnvironment = "test" | "prod";

function trimmed(env: WaffoEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function rejectLegacySelectors(env: WaffoEnv): void {
  const legacy = [
    "PAYMENT_MODE",
    "WAFFO_LIVE",
    "POLAR_LIVE",
    "POLAR_FIXTURE_ONLY",
  ];
  const present = legacy.find((key) => trimmed(env, key) !== undefined);
  if (present) {
    throw new Error(
      `BLOCKED-CONFIG: ${present} is obsolete; set the canonical WAFFO_MODE only`,
    );
  }
}

/** Only WAFFO_MODE selects a rail. Missing mode never falls back to fixture. */
export function waffoMode(env: WaffoEnv = process.env): PaymentMode | undefined {
  rejectLegacySelectors(env);
  const raw = trimmed(env, "WAFFO_MODE");
  if (!raw) return undefined;
  if (raw === "fixture" || raw === "waffo-test" || raw === "waffo-prod") {
    return raw;
  }
  throw new Error(
    "BLOCKED-CONFIG: WAFFO_MODE must be fixture, waffo-test, or waffo-prod",
  );
}

export function paymentMode(env: WaffoEnv = process.env): PaymentMode {
  const mode = waffoMode(env);
  if (!mode) {
    throw new Error("BLOCKED-CONFIG: WAFFO_MODE must be explicit");
  }
  if (env.NODE_ENV === "production" && mode !== "waffo-prod") {
    throw new Error("BLOCKED-CONFIG: production requires WAFFO_MODE=waffo-prod");
  }
  return mode;
}

export function waffoEnvironment(mode: PaymentMode): WaffoEnvironment | undefined {
  if (mode === "waffo-test") return "test";
  if (mode === "waffo-prod") return "prod";
  return undefined;
}

export function waffoMerchantId(env: WaffoEnv = process.env): string | undefined {
  return trimmed(env, "WAFFO_MERCHANT_ID");
}

export function waffoStoreId(env: WaffoEnv = process.env): string | undefined {
  return trimmed(env, "WAFFO_STORE_ID");
}

export function waffoProductId(env: WaffoEnv = process.env): string | undefined {
  return trimmed(env, "WAFFO_PRODUCT_ID");
}

export function waffoPrivateKey(env: WaffoEnv = process.env): string | undefined {
  return trimmed(env, "WAFFO_PRIVATE_KEY");
}

export function waffoPrivateKeyFile(env: WaffoEnv = process.env): string | undefined {
  return trimmed(env, "WAFFO_PRIVATE_KEY_FILE");
}

export function waffoWebhookPublicKey(
  env: WaffoEnv = process.env,
  environment?: WaffoEnvironment,
): string | undefined {
  const specific =
    environment === "test"
      ? trimmed(env, "WAFFO_WEBHOOK_TEST_PUBLIC_KEY")
      : environment === "prod"
        ? trimmed(env, "WAFFO_WEBHOOK_PROD_PUBLIC_KEY")
        : undefined;
  // A live rail must never silently select a key for the other environment or
  // inherit the obsolete generic key. WaffoLive always supplies the mode.
  return specific;
}

export function waffoApiBase(env: WaffoEnv = process.env): string {
  return (trimmed(env, "WAFFO_API_BASE") ?? "https://api.waffo.ai").replace(
    /\/+$/,
    "",
  );
}

export function isMemoryDatabasePath(value: string): boolean {
  const path = value.trim();
  return (
    path === ":memory:" ||
    /^file::memory(?::|\?|$)/i.test(path) ||
    /^file:[^?]*(?:\?|&)mode=memory(?:&|$)/i.test(path)
  );
}
