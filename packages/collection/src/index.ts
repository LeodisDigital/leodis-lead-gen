import { isIP } from "node:net";

export * from "./collector.js";

export const urlDenialReasons = [
  "URL_INVALID",
  "URL_PROTOCOL_NOT_ALLOWED",
  "URL_CREDENTIALS_NOT_ALLOWED",
  "URL_PORT_NOT_ALLOWED",
  "URL_RESOLUTION_REQUIRED",
  "URL_RESOLVES_TO_BLOCKED_ADDRESS",
] as const;

export type UrlDenialReason = (typeof urlDenialReasons)[number];

export type UrlAuthorization =
  | { allowed: true; url: URL; pinnedAddresses: string[] }
  | { allowed: false; reasonCodes: UrlDenialReason[] };

const blockedIpv4Ranges: Array<[number, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
].map(([address, prefix]) => [ipv4ToNumber(address as string), prefix as number]);

function ipv4ToNumber(address: string): number {
  return address
    .split(".")
    .reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);
}

function ipv4InRange(address: string, base: number, prefix: number): boolean {
  const value = ipv4ToNumber(address);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return blockedIpv4Ranges.some(([base, prefix]) => ipv4InRange(address, base, prefix));
  }
  if (version !== 6) return true;
  const normal = address.toLowerCase();
  if (normal === "::" || normal === "::1") return true;
  if (normal.startsWith("fc") || normal.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normal)) return true;
  if (normal.startsWith("ff")) return true;
  if (normal.startsWith("2001:db8:") || normal === "2001:db8::") return true;
  const mapped = normal.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mapped ? isBlockedAddress(mapped) : false;
}

export function authorizeResolvedUrl(
  value: string,
  resolvedAddresses: string[],
): UrlAuthorization {
  const reasons = new Set<UrlDenialReason>();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { allowed: false, reasonCodes: ["URL_INVALID"] };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    reasons.add("URL_PROTOCOL_NOT_ALLOWED");
  }
  if (url.username || url.password) reasons.add("URL_CREDENTIALS_NOT_ALLOWED");
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (port !== "80" && port !== "443") reasons.add("URL_PORT_NOT_ALLOWED");
  if (resolvedAddresses.length === 0) reasons.add("URL_RESOLUTION_REQUIRED");
  if (resolvedAddresses.some(isBlockedAddress)) {
    reasons.add("URL_RESOLVES_TO_BLOCKED_ADDRESS");
  }
  if (reasons.size > 0) return { allowed: false, reasonCodes: [...reasons] };
  return { allowed: true, url, pinnedAddresses: [...new Set(resolvedAddresses)] };
}
