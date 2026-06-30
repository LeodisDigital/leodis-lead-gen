export type VerificationDecision = {
  outcome: "verified" | "review" | "quarantine";
  reasonCodes: string[];
};

export type ListingEvidence = {
  companiesHouseVerified: boolean;
  exactCompanyNumberOnPage: boolean;
  legalNameOnPage: boolean;
  conflictingCompanyNumber: boolean;
  negativeContext: boolean;
};

export type DomainEvidence = {
  companiesHouseVerified: boolean;
  linkedFromApprovedSource: boolean;
  exactCompanyNumberOnSite: boolean;
  legalNameOnSite: boolean;
  sharedOrMarketplaceDomain: boolean;
  parkedDomain: boolean;
  conflictingCompanyNumber: boolean;
};

export function decideListingMatch(input: ListingEvidence): VerificationDecision {
  const reasons: string[] = [];
  if (!input.companiesHouseVerified) reasons.push("COMPANY_VERIFICATION_REQUIRED");
  if (input.conflictingCompanyNumber) reasons.push("CONFLICTING_COMPANY_NUMBER");
  if (input.negativeContext) reasons.push("NEGATIVE_CONTEXT");
  if (!input.exactCompanyNumberOnPage) reasons.push("EXACT_COMPANY_NUMBER_NOT_ON_PAGE");
  if (!input.legalNameOnPage) reasons.push("LEGAL_NAME_NOT_ON_PAGE");

  if (
    input.companiesHouseVerified &&
    input.exactCompanyNumberOnPage &&
    input.legalNameOnPage &&
    !input.conflictingCompanyNumber &&
    !input.negativeContext
  ) {
    return { outcome: "verified", reasonCodes: [] };
  }
  if (input.conflictingCompanyNumber || input.negativeContext) {
    return { outcome: "quarantine", reasonCodes: reasons };
  }
  return { outcome: "review", reasonCodes: reasons };
}

export function decideDomainMatch(input: DomainEvidence): VerificationDecision {
  const reasons: string[] = [];
  if (!input.companiesHouseVerified) reasons.push("COMPANY_VERIFICATION_REQUIRED");
  if (input.sharedOrMarketplaceDomain) reasons.push("SHARED_OR_MARKETPLACE_DOMAIN");
  if (input.parkedDomain) reasons.push("PARKED_DOMAIN");
  if (input.conflictingCompanyNumber) reasons.push("CONFLICTING_COMPANY_NUMBER");
  if (!input.linkedFromApprovedSource) reasons.push("DOMAIN_NOT_LINKED_FROM_APPROVED_SOURCE");
  if (!input.exactCompanyNumberOnSite) reasons.push("EXACT_COMPANY_NUMBER_NOT_ON_SITE");
  if (!input.legalNameOnSite) reasons.push("LEGAL_NAME_NOT_ON_SITE");

  const strongOnSiteEvidence =
    input.exactCompanyNumberOnSite &&
    input.legalNameOnSite &&
    !input.conflictingCompanyNumber;
  if (
    input.companiesHouseVerified &&
    (input.linkedFromApprovedSource || strongOnSiteEvidence) &&
    !input.sharedOrMarketplaceDomain &&
    !input.parkedDomain &&
    !input.conflictingCompanyNumber
  ) {
    return { outcome: "verified", reasonCodes: [] };
  }
  if (input.sharedOrMarketplaceDomain || input.parkedDomain || input.conflictingCompanyNumber) {
    return { outcome: "quarantine", reasonCodes: reasons };
  }
  return { outcome: "review", reasonCodes: reasons };
}
