import { describe, expect, it } from "vitest";

import {
  authorizeResolvedUrl,
  collectPublicPage,
  isBlockedAddress,
  robotsAllows,
  sanitizeRelevantText,
} from "./index.js";

describe("secure collection URL authorization", () => {
  it("allows public HTTP(S) URLs resolved to public addresses", () => {
    expect(authorizeResolvedUrl("https://example.com/contact", ["93.184.216.34"]))
      .toMatchObject({ allowed: true, pinnedAddresses: ["93.184.216.34"] });
  });

  it.each([
    "127.0.0.1",
    "10.0.0.4",
    "169.254.169.254",
    "192.168.1.1",
    "100.64.0.1",
    "203.0.113.10",
    "::1",
    "fd00::1",
    "fe80::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
  ])("blocks private, metadata, reserved, and mapped address %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it("blocks unsafe schemes, credentials, ports, and mixed DNS answers", () => {
    expect(authorizeResolvedUrl(
      "ftp://user:pass@example.com:22/file",
      ["93.184.216.34", "127.0.0.1"],
    )).toMatchObject({
      allowed: false,
      reasonCodes: expect.arrayContaining([
        "URL_PROTOCOL_NOT_ALLOWED",
        "URL_CREDENTIALS_NOT_ALLOWED",
        "URL_PORT_NOT_ALLOWED",
        "URL_RESOLVES_TO_BLOCKED_ADDRESS",
      ]),
    });
  });

  it("fails closed without DNS resolution", () => {
    expect(authorizeResolvedUrl("https://example.com", [])).toEqual({
      allowed: false,
      reasonCodes: ["URL_RESOLUTION_REQUIRED"],
    });
  });
});

describe("bounded public page collection", () => {
  const resolver = async () => ["93.184.216.34"];

  it("revalidates redirects and stores only sanitised text with a hash", async () => {
    const transport = async (url: URL) => url.pathname === "/start"
      ? { status: 302, headers: { location: "/contact" }, body: Buffer.alloc(0) }
      : {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
          body: Buffer.from("<script>secret()</script><h1>Contact &amp; legal</h1>"),
        };
    const result = await collectPublicPage("https://example.com/start", { resolver, transport, robotsText: "" });
    expect(result).toMatchObject({
      collected: true,
      finalUrl: "https://example.com/contact",
      sanitizedText: "Contact & legal",
      redirectChain: ["https://example.com/start"],
    });
    if (!result.collected) throw new Error("Expected collection success");
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when a redirect resolves to a blocked address", async () => {
    const result = await collectPublicPage("https://example.com/start", {
      resolver: async (hostname) => hostname === "internal.example" ? ["127.0.0.1"] : ["93.184.216.34"],
      transport: async () => ({
        status: 302,
        headers: { location: "https://internal.example/admin" },
        body: Buffer.alloc(0),
      }),
      robotsText: "",
    });
    expect(result).toMatchObject({ collected: false, reason: "URL_NOT_AUTHORIZED" });
  });

  it("enforces robots rules and relevant text sanitisation", async () => {
    expect(robotsAllows("User-agent: *\nDisallow: /private\nAllow: /private/public", "/private/data", "LeadGenV2")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /private\nAllow: /private/public", "/private/public/info", "LeadGenV2")).toBe(true);
    expect(sanitizeRelevantText("<style>x</style><p>Hello&nbsp;world</p>")).toBe("Hello world");
  });

  it("refuses unsafe content types", async () => {
    const result = await collectPublicPage("https://example.com/file", {
      resolver,
      transport: async () => ({
        status: 200,
        headers: { "content-type": "application/pdf" },
        body: Buffer.from("pdf"),
      }),
      robotsText: "",
    });
    expect(result).toEqual({
      collected: false,
      reason: "CONTENT_TYPE_NOT_ALLOWED",
      detail: "application/pdf",
    });
  });

  it("fails closed until robots rules have been checked", async () => {
    const result = await collectPublicPage("https://example.com", {
      resolver,
      transport: async () => ({
        status: 200,
        headers: { "content-type": "text/plain" },
        body: Buffer.from("ignored"),
      }),
    });
    expect(result).toEqual({ collected: false, reason: "ROBOTS_NOT_CHECKED" });
  });
});
