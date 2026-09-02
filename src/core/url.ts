/** Canonical https URL: infer a scheme for bare pitch domains, strip tracking, reject chat/NSFW. */

export class UrlError extends Error {
  readonly code: "invalid_url" | "no_chat" | "nsfw";
  readonly statusCode = 400;

  constructor(code: "invalid_url" | "no_chat" | "nsfw", message: string) {
    super(message);
    this.name = "UrlError";
    this.code = code;
  }
}

/** Query keys dropped on write (SPEC §7). `utm_*` is prefix-matched. */
export const TRACKING_QUERY_KEYS: readonly string[] = [
  "fbclid",
  "gclid",
  "gbraid",
  "wbraid",
  "msclkid",
  "mc_eid",
  "igshid",
  "ref",
  "ref_src",
  "ref_url",
  "yclid",
];

const TRACKING_KEY_SET = new Set(TRACKING_QUERY_KEYS);

/** Chat / invite hosts. Subdomains match. `discord.com` only `/invite`. */
export const CHAT_HOSTS: readonly string[] = [
  "t.me",
  "telegram.me",
  "discord.gg",
  "wa.me",
  "chat.whatsapp.com",
  "m.me",
];

/** Operator adult-host list. Subdomains match. */
export const NSFW_HOSTS: readonly string[] = [
  "onlyfans.com",
  "fansly.com",
  "pornhub.com",
  "pornhub.org",
  "pornhubpremium.com",
  "xvideos.com",
  "xnxx.com",
  "xhamster.com",
  "chaturbate.com",
  "stripchat.com",
  "manyvids.com",
  "redtube.com",
  "youporn.com",
  "brazzers.com",
  "adultfriendfinder.com",
];

function hostMatches(host: string, listed: string): boolean {
  return host === listed || host.endsWith(`.${listed}`);
}

function hostnameOf(parsed: URL): string {
  return parsed.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

/**
 * Treat a host entered without a scheme as a website URL while preserving
 * explicit schemes for the normal HTTPS-only validation below. A port is
 * allowed in a bare host (`example.com:8443`) and must not be mistaken for a
 * custom URL scheme.
 */
function withHttpsScheme(raw: string): string {
  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }
  // A slash-delimited scheme typo (for example `https//example.com`) is not
  // a bare host and must remain invalid rather than becoming an HTTPS path.
  if (/^[a-z][a-z\d+.-]*\/\//i.test(raw)) {
    return raw;
  }

  const explicitScheme = /^([a-z][a-z\d+.-]*):/i.exec(raw)?.[1].toLowerCase();
  const looksLikeBareHostWithPort =
    /^(?:[a-z0-9](?:[a-z0-9-]*\.)+[a-z]{2,}|localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:]+\]):\d+(?:[/?#]|$)/i.test(raw);
  if (explicitScheme === undefined || (looksLikeBareHostWithPort && explicitScheme !== "http" && explicitScheme !== "https")) {
    return `https://${raw}`;
  }
  return raw;
}

export function isTrackingQueryKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return lowered.startsWith("utm_") || TRACKING_KEY_SET.has(lowered);
}

export function isChatUrl(parsed: URL): boolean {
  const host = hostnameOf(parsed);
  if (CHAT_HOSTS.some((listed) => hostMatches(host, listed))) {
    return true;
  }
  if (hostMatches(host, "discord.com")) {
    const path = parsed.pathname.toLowerCase();
    return path === "/invite" || path.startsWith("/invite/");
  }
  return false;
}

export function isNsfwHost(host: string): boolean {
  const lowered = host.toLowerCase().replace(/\.$/, "");
  return NSFW_HOSTS.some((listed) => hostMatches(lowered, listed));
}

/**
 * Require HTTPS after normalizing bare hosts, lowercase host, drop fragment
 * and tracking query keys. Empty `?` is dropped. Chat and NSFW hosts are 400.
 */
export function canonicalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length < 1) {
    throw new UrlError("invalid_url", "url must be an https URL");
  }

  let parsed: URL;
  try {
    parsed = new URL(withHttpsScheme(trimmed));
  } catch {
    throw new UrlError("invalid_url", "url must be an https URL");
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "https:") {
    throw new UrlError("invalid_url", "url must be an https URL");
  }

  const host = hostnameOf(parsed);
  if (!host) {
    throw new UrlError("invalid_url", "url must be an https URL");
  }

  if (isChatUrl(parsed)) {
    throw new UrlError("no_chat", "chat and invite links are not allowed");
  }
  if (isNsfwHost(host)) {
    throw new UrlError("nsfw", "adult platforms are not allowed");
  }

  const kept = new URLSearchParams();
  for (const [key, value] of parsed.searchParams.entries()) {
    if (!isTrackingQueryKey(key)) {
      kept.append(key, value);
    }
  }
  const query = kept.toString();
  const path = parsed.pathname === "/" ? "" : parsed.pathname;
  const port = parsed.port && parsed.port !== "443" ? `:${parsed.port}` : "";
  const hostForUrl = host.includes(":") ? `[${host}]` : host;
  return `https://${hostForUrl}${port}${path}${query ? `?${query}` : ""}`;
}
