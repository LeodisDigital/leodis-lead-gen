import { describe, expect, it } from "vitest";

import {
  charitySourceClasses,
  classifyMailboxLocalPart,
  defaultLaunchFlags,
  sourcePolicySchema,
} from "./index.js";

describe("policy defaults", () => {
  it("fails closed for live collection and production exports", () => {
    expect(defaultLaunchFlags).toEqual({
      liveCollectionEnabled: false,
      productionExportsEnabled: false,
      corporateEmailExportsEnabled: false,
      postalExportsEnabled: false,
    });
  });

  it("allows only explicit role mailbox local parts", () => {
    expect(classifyMailboxLocalPart("INFO")).toBe("role");
    expect(classifyMailboxLocalPart("jane.smith")).toBe("unknown");
  });

  it("rejects source policies without approved fields", () => {
    const result = sourcePolicySchema.safeParse({
      id: "6db46d2c-c10e-4cce-bc2a-46acc81c82db",
      version: "1",
      sourceClass: "company-website",
      hostnamePattern: null,
      enabled: true,
      approvedUses: ["verification"],
      approvedFields: [],
      reviewedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(result.success).toBe(false);
  });

  it("captures Buttercup source governance metadata", () => {
    const result = sourcePolicySchema.parse({
      id: "6db46d2c-c10e-4cce-bc2a-46acc81c82db",
      version: "2026-06-30.1",
      sourceClass: "charity-commission",
      hostnamePattern: null,
      owner: "compliance owner",
      evidenceReference: "policy-register/cc/1",
      enabled: false,
      approvedUses: ["verification"],
      approvedFields: ["charity_number", "registered_address"],
      approvedChannels: ["postal_letter"],
      retentionDays: 180,
      attributionRequired: true,
      prohibitedReuse: ["oscr-download-direct-marketing"],
      reviewedAt: new Date("2026-06-30T10:00:00.000Z"),
      expiresAt: new Date("2026-12-30T10:00:00.000Z"),
    });

    expect(result.sourceClass).toBe("charity-commission");
    expect(result.approvedChannels).toEqual(["postal_letter"]);
    expect(result.retentionDays).toBe(180);
    expect(charitySourceClasses.has(result.sourceClass)).toBe(true);
  });
});
