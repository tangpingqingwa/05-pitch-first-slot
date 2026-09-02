import { isIP } from "node:net";

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
    .replace(/\.+$/, "");
}

const HOST_LABEL_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N}_-]{0,61}[\p{L}\p{N}_])?$/u;
const RAW_URL_WHITESPACE_OR_CONTROL_RE = /[\u0000-\u0020\u007f]|\s/u;

/**
 * Return true only for a plausible bare authority. This lexical check keeps
 * path-only input from being turned into a host by the WHATWG URL parser, and
 * lets a dotted host with a numeric port (`example.com:8443`) be distinguished
 * from a custom scheme such as `javascript:123`.
 */
function looksLikeBareAuthority(raw: string): boolean {
  if (raw.startsWith("/")) {
    return false;
  }

  const authorityEnd = raw.search(/[/?#]/);
  const authority = authorityEnd === -1 ? raw : raw.slice(0, authorityEnd);
  if (!authority || authority.includes("@") || authority.includes("\\")) {
    return false;
  }

  let host = authority;
  if (authority.startsWith("[")) {
    const closingBracket = authority.indexOf("]");
    if (closingBracket === -1) {
      return false;
    }
    host = authority.slice(0, closingBracket + 1);
    const suffix = authority.slice(closingBracket + 1);
    if (!/^\[[0-9a-f:]+\]$/i.test(host) || (suffix !== "" && !/^:\d+$/.test(suffix))) {
      return false;
    }
    try {
      return new URL(`https://${authority}`).hostname !== "";
    } catch {
      return false;
    }
  }

  const portSeparator = authority.lastIndexOf(":");
  if (portSeparator !== -1) {
    const port = authority.slice(portSeparator + 1);
    if (!/^\d+$/.test(port)) {
      return false;
    }
    host = authority.slice(0, portSeparator);
  }
  if (!host || host.includes(":") || host.includes("[") || host.includes("]")) {
    return false;
  }

  const normalizedHost = host.replace(/\.+$/, "");
  if (!normalizedHost) {
    return false;
  }
  const loweredHost = normalizedHost.toLowerCase();
  if (loweredHost !== "localhost" && !normalizedHost.includes(".")) {
    return false;
  }
  const labels = normalizedHost.split(".");
  if (loweredHost !== "localhost" && labels.length < 2) {
    return false;
  }
  if (labels.length === 0 || labels.some((label) => !HOST_LABEL_RE.test(label))) {
    return false;
  }
  try {
    return new URL(`https://${authority}`).hostname !== "";
  } catch {
    return false;
  }
}

function looksLikeProtocolRelativeAuthority(raw: string): boolean {
  return (
    raw.startsWith("//") &&
    !raw.startsWith("///") &&
    !raw.includes("\\") &&
    looksLikeBareAuthority(raw.slice(2))
  );
}

function isPrivateIpv4(host: string): boolean {
  const octets = host.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51) ||
    (first === 203 && second === 0) ||
    first >= 224
  );
}

function ipv4FromMappedIpv6(host: string): string | undefined {
  if (!host.startsWith("::ffff:")) {
    return undefined;
  }
  const suffix = host.slice("::ffff:".length);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(suffix)) {
    return suffix;
  }
  const pieces = suffix.split(":");
  if (pieces.length !== 2 || pieces.some((piece) => !/^[0-9a-f]{1,4}$/.test(piece))) {
    return undefined;
  }
  const high = Number.parseInt(pieces[0]!, 16);
  const low = Number.parseInt(pieces[1]!, 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "local" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  const version = isIP(host);
  if (version === 4) {
    return isPrivateIpv4(host);
  }
  if (version !== 6) {
    return false;
  }

  const mappedIpv4 = ipv4FromMappedIpv6(host);
  if (mappedIpv4 !== undefined) {
    return isPrivateIpv4(mappedIpv4);
  }

  const firstHextet = Number.parseInt(host.split(":")[0] || "0", 16);
  return (
    host === "::" ||
    host === "::1" ||
    (firstHextet & 0xfe00) === 0xfc00 ||
    (firstHextet & 0xffc0) === 0xfe80 ||
    (firstHextet & 0xffc0) === 0xfec0 ||
    (firstHextet & 0xff00) === 0xff00
  );
}

/**
 * Infer HTTPS only for a validated bare authority or an exact protocol-relative
 * authority. Explicit schemes are left intact for the HTTPS-only check below.
 */
function withHttpsScheme(raw: string): string {
  if (raw.startsWith("//")) {
    return looksLikeProtocolRelativeAuthority(raw) ? `https:${raw}` : raw;
  }
  // A slash-delimited scheme typo (for example `https//example.com`) is not
  // a bare host and must remain invalid rather than becoming an HTTPS path.
  if (/^[a-z][a-z\d+.-]*\/\//i.test(raw)) {
    return raw;
  }
  return looksLikeBareAuthority(raw) ? `https://${raw}` : raw;
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
  const lowered = host.toLowerCase().replace(/\.+$/, "");
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
  if (RAW_URL_WHITESPACE_OR_CONTROL_RE.test(trimmed) || trimmed.startsWith("///")) {
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
  if (isPrivateHost(host)) {
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
