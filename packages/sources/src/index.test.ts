import { describe, expect, it } from "vitest";

import type { SourcePolicy } from "@lead-gen/policy";

import { authorizeCollection } from "./index.js";

const now = new Date("2026-06-12T12:00:00Z");
const policy: SourcePolicy = {
  id: "8ef056d5-1ca4-4ed7-a339-37a1634029a2",
  version: "approved-v1",
  sourceClass: "company-website",
  hostnamePattern: "*.example.com",
  owner: "source owner",
  evidenceReference: "source-register/company-website/1",
  enabled: true,
  approvedUses: ["verification"],
  approvedFields: ["company_number", "role_mailbox"],
  approvedChannels: ["corporate_email"],
  retentionDays: 365,
  attributionRequired: true,
  prohibitedReuse: [],
  notes: null,
  reviewedAt: new Date("2026-06-01T00:00:00Z"),
  expiresAt: new Date("2027-06-01T00:00:00Z"),
};

describe("authorizeCollection", () => {
  it("allows only a current policy with approved hostname, purpose, and fields", () => {
    expect(authorizeCollection({
      policy,
      hostname: "www.example.com",
      requestedFields: ["company_number", "role_mailbox"],
      purpose: "verification",
      now,
    })).toMatchObject({ allowed: true, policyVersion: "approved-v1" });
  });

  it("returns every applicable fail-closed reason", () => {
    const result = authorizeCollection({
      policy: { ...policy, enabled: false, expiresAt: now },
      hostname: "unapproved.test",
      requestedFields: ["person_name"],
      purpose: "campaign_targeting",
      now,
      clientSuspended: true,
      campaignSuspended: true,
      requestsInWindow: 10,
      rateLimit: 10,
      recordsCollected: 100,
      volumeLimit: 100,
    });
    expect(result).toMatchObject({ allowed: false });
    if (result.allowed) throw new Error("Expected collection to be denied");
    expect(result.reasonCodes).toEqual(expect.arrayContaining([
      "SOURCE_DISABLED",
      "SOURCE_POLICY_EXPIRED",
      "SOURCE_HOSTNAME_NOT_APPROVED",
      "SOURCE_PURPOSE_NOT_APPROVED",
      "SOURCE_FIELD_NOT_APPROVED",
      "CLIENT_SUSPENDED",
      "CAMPAIGN_SUSPENDED",
      "RATE_LIMIT_EXCEEDED",
      "VOLUME_LIMIT_EXCEEDED",
    ]));
  });
});
