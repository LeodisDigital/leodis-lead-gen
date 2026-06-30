import { describe, expect, it } from "vitest";

import { decideDomainMatch, decideListingMatch } from "./index.js";

describe("deterministic verification", () => {
  it("verifies a listing only with exact positive evidence", () => {
    expect(decideListingMatch({
      companiesHouseVerified: true,
      exactCompanyNumberOnPage: true,
      legalNameOnPage: true,
      conflictingCompanyNumber: false,
      negativeContext: false,
    })).toEqual({ outcome: "verified", reasonCodes: [] });
  });

  it("quarantines unrelated or conflicting listing evidence", () => {
    expect(decideListingMatch({
      companiesHouseVerified: true,
      exactCompanyNumberOnPage: true,
      legalNameOnPage: true,
      conflictingCompanyNumber: true,
      negativeContext: true,
    })).toMatchObject({ outcome: "quarantine" });
  });

  it("verifies a domain from an approved-source link or strong legal evidence", () => {
    const base = {
      companiesHouseVerified: true,
      linkedFromApprovedSource: false,
      exactCompanyNumberOnSite: true,
      legalNameOnSite: true,
      sharedOrMarketplaceDomain: false,
      parkedDomain: false,
      conflictingCompanyNumber: false,
    };
    expect(decideDomainMatch(base)).toEqual({ outcome: "verified", reasonCodes: [] });
    expect(decideDomainMatch({
      ...base,
      linkedFromApprovedSource: true,
      exactCompanyNumberOnSite: false,
      legalNameOnSite: false,
    })).toEqual({ outcome: "verified", reasonCodes: [] });
  });

  it("quarantines shared, parked, or conflicting domains", () => {
    expect(decideDomainMatch({
      companiesHouseVerified: true,
      linkedFromApprovedSource: true,
      exactCompanyNumberOnSite: true,
      legalNameOnSite: true,
      sharedOrMarketplaceDomain: true,
      parkedDomain: false,
      conflictingCompanyNumber: false,
    })).toMatchObject({ outcome: "quarantine" });
  });
});
