import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";

import { authorizeResolvedUrl } from "./index.js";

export const collectionFailureReasons = [
  "URL_NOT_AUTHORIZED",
  "ROBOTS_NOT_CHECKED",
  "ROBOTS_DISALLOWED",
  "REDIRECT_LIMIT_EXCEEDED",
  "RESPONSE_TIMEOUT",
  "RESPONSE_TOO_LARGE",
  "CONTENT_TYPE_NOT_ALLOWED",
  "HTTP_ERROR",
] as const;

export type CollectionFailureReason = (typeof collectionFailureReasons)[number];

export type CollectionResult =
  | {
      collected: true;
      finalUrl: string;
      contentType: string;
      contentHash: string;
      sanitizedText: string;
      redirectChain: string[];
      pinnedAddresses: string[];
    }
  | { collected: false; reason: CollectionFailureReason; detail?: string };

type RawResponse = {
  status: number;
  headers: Record<string, string | undefined>;
  body: Buffer;
};

export type CollectorOptions = {
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  userAgent?: string;
  resolver?: (hostname: string) => Promise<string[]>;
  transport?: (url: URL, pinnedAddress: string, options: Required<Pick<CollectorOptions, "maxBytes" | "timeoutMs" | "userAgent">>) => Promise<RawResponse>;
  robotsText?: string;
};

const allowedContentTypes = new Set(["text/html", "text/plain", "application/xhtml+xml"]);

export function sanitizeRelevantText(value: string, maxCharacters = 100_000): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxCharacters);
}

export function robotsAllows(robotsText: string, path: string, userAgent: string): boolean {
  const relevant: string[] = [];
  let applies = false;
  for (const sourceLine of robotsText.split(/\r?\n/)) {
    const line = sourceLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [rawField, ...rawValue] = line.split(":");
    const field = rawField?.trim().toLowerCase();
    const value = rawValue.join(":").trim();
    if (field === "user-agent") {
      const normal = value.toLowerCase();
      applies = normal === "*" || userAgent.toLowerCase().includes(normal);
    } else if (applies && (field === "allow" || field === "disallow")) {
      if (value && path.startsWith(value)) relevant.push(`${field}:${value}`);
    }
  }
  if (relevant.length === 0) return true;
  relevant.sort((a, b) => b.slice(b.indexOf(":") + 1).length - a.slice(a.indexOf(":") + 1).length);
  return relevant[0]?.startsWith("allow:") ?? true;
}

async function defaultResolver(hostname: string): Promise<string[]> {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
}

async function defaultTransport(
  url: URL,
  pinnedAddress: string,
  options: Required<Pick<CollectorOptions, "maxBytes" | "timeoutMs" | "userAgent">>,
): Promise<RawResponse> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request({
      protocol: url.protocol,
      hostname: pinnedAddress,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      servername: url.hostname,
      headers: {
        host: url.host,
        "user-agent": options.userAgent,
        accept: "text/html,text/plain,application/xhtml+xml;q=0.9",
      },
      timeout: options.timeoutMs,
    }, (response) => {
      const chunks: Buffer[] = [];
      let received = 0;
      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > options.maxBytes) {
          request.destroy(new Error("RESPONSE_TOO_LARGE"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        status: response.statusCode ?? 500,
        headers: Object.fromEntries(
          Object.entries(response.headers).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.join(", ") : value,
          ]),
        ),
        body: Buffer.concat(chunks),
      }));
    });
    request.on("timeout", () => request.destroy(new Error("RESPONSE_TIMEOUT")));
    request.on("error", reject);
    request.end();
  });
}

export async function collectPublicPage(
  input: string,
  options: CollectorOptions = {},
): Promise<CollectionResult> {
  const maxBytes = options.maxBytes ?? 256_000;
  const maxRedirects = options.maxRedirects ?? 3;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const userAgent = options.userAgent ?? "LeadGenV2EvidenceCollector/1.0";
  const resolver = options.resolver ?? defaultResolver;
  const transport = options.transport ?? defaultTransport;
  const redirectChain: string[] = [];
  let current = input;
  let lastPinned: string[] = [];

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return { collected: false, reason: "URL_NOT_AUTHORIZED", detail: "URL_INVALID" };
    }
    const addresses = await resolver(parsed.hostname).catch(() => []);
    const authorization = authorizeResolvedUrl(parsed.toString(), addresses);
    if (!authorization.allowed) {
      return { collected: false, reason: "URL_NOT_AUTHORIZED", detail: authorization.reasonCodes.join(",") };
    }
    lastPinned = authorization.pinnedAddresses;
    if (options.robotsText === undefined) {
      return { collected: false, reason: "ROBOTS_NOT_CHECKED" };
    }
    if (!robotsAllows(options.robotsText, `${parsed.pathname}${parsed.search}`, userAgent)) {
      return { collected: false, reason: "ROBOTS_DISALLOWED" };
    }

    let response: RawResponse;
    try {
      response = await transport(parsed, authorization.pinnedAddresses[0]!, { maxBytes, timeoutMs, userAgent });
    } catch (error) {
      const detail = String(error);
      if (detail.includes("RESPONSE_TOO_LARGE")) return { collected: false, reason: "RESPONSE_TOO_LARGE" };
      if (detail.includes("RESPONSE_TIMEOUT")) return { collected: false, reason: "RESPONSE_TIMEOUT" };
      return { collected: false, reason: "HTTP_ERROR", detail };
    }
    if (response.body.length > maxBytes) {
      return { collected: false, reason: "RESPONSE_TOO_LARGE" };
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location) return { collected: false, reason: "HTTP_ERROR", detail: "Redirect missing location" };
      if (redirectCount === maxRedirects) return { collected: false, reason: "REDIRECT_LIMIT_EXCEEDED" };
      redirectChain.push(parsed.toString());
      current = new URL(location, parsed).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      return { collected: false, reason: "HTTP_ERROR", detail: `HTTP ${response.status}` };
    }
    const contentType = (response.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
    if (!allowedContentTypes.has(contentType)) {
      return { collected: false, reason: "CONTENT_TYPE_NOT_ALLOWED", detail: contentType };
    }
    const sanitizedText = sanitizeRelevantText(response.body.toString("utf8"));
    return {
      collected: true,
      finalUrl: parsed.toString(),
      contentType,
      contentHash: createHash("sha256").update(sanitizedText).digest("hex"),
      sanitizedText,
      redirectChain,
      pinnedAddresses: lastPinned,
    };
  }
  return { collected: false, reason: "REDIRECT_LIMIT_EXCEEDED" };
}
