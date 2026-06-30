import { approvedEntityTypes, policyVersion } from "@lead-gen/policy";
import type {
  EligibilityReasonCode,
  EntityType,
  MailboxType,
  OutreachChannel,
  OutreachDecisionOutcome,
} from "@lead-gen/shared";

export type ExpiringAssessment = {
  verified: boolean;
  expiresAt: Date | null;
};

export type SuppressionMatch = {
  id: string;
  scope: "platform" | "organisation";
  targetType: "company" | "domain" | "mailbox" | "person" | "phone" | "postal_address" | "charity";
  active: boolean;
};

export type EligibilityInput = {
  now: Date;
  clientApproved: boolean;
  campaignApproved: boolean;
  campaignPrincipalVerified: boolean;
  entityType: EntityType;
  companyVerification: ExpiringAssessment | null;
  listingMatch: ExpiringAssessment | null;
  domainMatch: ExpiringAssessment | null;
  mailboxAssessment: {
    type: MailboxType;
    mailboxDomain: string;
    verifiedDomain: string;
    expiresAt: Date | null;
  } | null;
  sourcesApproved: boolean;
  transparencyRecorded: boolean;
  suppressions: SuppressionMatch[];
};

export type EligibilityDecision = {
  eligible: boolean;
  reasonCodes: EligibilityReasonCode[];
  policyVersion: string;
  decidedAt: Date;
};

export type RecipientEntityAssessment = {
  entityType: EntityType;
  verified: boolean;
  expiresAt: Date | null;
};

export type PostalAddressAssessment = {
  verified: boolean;
  expiresAt: Date | null;
  sourceApproved: boolean;
  addressContext: "business" | "registered_office" | "likely_home" | "unknown";
  publicContextApproved: boolean;
  sensitiveTargetingRisk: boolean;
};

export type PreferenceServiceCheck = {
  service: "fps" | "mps" | "internal" | "other";
  matched: boolean;
  active: boolean;
};

export type ChannelDecisionInput = {
  now: Date;
  channel: OutreachChannel;
  charityPrincipal: ExpiringAssessment | null;
  campaignApproved: boolean;
  channelApproved: boolean;
  recipientEntity: RecipientEntityAssessment | null;
  domainMatch?: ExpiringAssessment | null;
  mailboxAssessment?: {
    type: MailboxType;
    mailboxDomain: string;
    verifiedDomain: string;
    expiresAt: Date | null;
  } | null;
  postalAddressAssessment?: PostalAddressAssessment | null;
  sourcesApproved: boolean;
  lawfulBasisRecorded: boolean;
  transparencyRecorded: boolean;
  letterTemplateApproved?: boolean;
  consentRecorded?: boolean;
  preferenceChecks: PreferenceServiceCheck[];
  suppressions: SuppressionMatch[];
};

export type ChannelDecision = {
  channel: OutreachChannel;
  outcome: OutreachDecisionOutcome;
  reasonCodes: EligibilityReasonCode[];
  policyVersion: string;
  decidedAt: Date;
};

function isStale(expiresAt: Date | null, now: Date): boolean {
  return expiresAt === null || expiresAt.getTime() <= now.getTime();
}

const emailEligibleEntityTypes = new Set<EntityType>([
  "uk_limited_company",
  "uk_plc",
  "uk_llp",
  "registered_charity",
  "charitable_company",
]);

const postalReviewEntityTypes = new Set<EntityType>([
  "sole_trader",
  "individual",
]);

export function evaluateEligibility(input: EligibilityInput): EligibilityDecision {
  const reasons = new Set<EligibilityReasonCode>();

  if (!input.clientApproved) reasons.add("CLIENT_NOT_APPROVED");
  if (!input.campaignApproved) reasons.add("CAMPAIGN_NOT_APPROVED");
  if (!input.campaignPrincipalVerified) {
    reasons.add("CAMPAIGN_PRINCIPAL_NOT_VERIFIED");
  }
  if (!approvedEntityTypes.has(input.entityType)) reasons.add("COMPANY_NOT_SUPPORTED");

  if (!input.companyVerification?.verified) {
    reasons.add("COMPANY_VERIFICATION_MISSING");
  } else if (isStale(input.companyVerification.expiresAt, input.now)) {
    reasons.add("COMPANY_VERIFICATION_STALE");
  }

  if (!input.listingMatch?.verified) {
    reasons.add("LISTING_MATCH_MISSING");
  } else if (isStale(input.listingMatch.expiresAt, input.now)) {
    reasons.add("LISTING_MATCH_STALE");
  }

  if (!input.domainMatch?.verified) {
    reasons.add("DOMAIN_MATCH_MISSING");
  } else if (isStale(input.domainMatch.expiresAt, input.now)) {
    reasons.add("DOMAIN_MATCH_STALE");
  }

  if (input.mailboxAssessment?.type !== "role") {
    reasons.add("MAILBOX_NOT_ROLE_BASED");
  }
  if (
    input.mailboxAssessment &&
    input.mailboxAssessment.mailboxDomain !== input.mailboxAssessment.verifiedDomain
  ) {
    reasons.add("MAILBOX_DOMAIN_MISMATCH");
  }
  if (
    !input.mailboxAssessment ||
    isStale(input.mailboxAssessment.expiresAt, input.now)
  ) {
    reasons.add("MAILBOX_ASSESSMENT_STALE");
  }

  if (!input.sourcesApproved) reasons.add("SOURCE_NOT_APPROVED");
  if (!input.transparencyRecorded) reasons.add("TRANSPARENCY_RECORD_MISSING");
  if (input.suppressions.some((suppression) => suppression.active)) {
    reasons.add("SUPPRESSED");
  }

  return {
    eligible: reasons.size === 0,
    reasonCodes: [...reasons],
    policyVersion,
    decidedAt: input.now,
  };
}

function addSharedOutreachReasons(
  reasons: Set<EligibilityReasonCode>,
  input: ChannelDecisionInput,
): void {
  if (!input.charityPrincipal?.verified) {
    reasons.add("CHARITY_PRINCIPAL_NOT_VERIFIED");
  } else if (isStale(input.charityPrincipal.expiresAt, input.now)) {
    reasons.add("CHARITY_PRINCIPAL_STALE");
  }
  if (!input.campaignApproved) reasons.add("CAMPAIGN_NOT_APPROVED");
  if (!input.channelApproved) reasons.add("CHANNEL_NOT_APPROVED");
  if (!input.sourcesApproved) reasons.add("SOURCE_NOT_APPROVED");
  if (!input.lawfulBasisRecorded) reasons.add("LAWFUL_BASIS_MISSING");
  if (!input.transparencyRecorded) reasons.add("TRANSPARENCY_RECORD_MISSING");
  if (input.suppressions.some((suppression) => suppression.active)) {
    reasons.add("DO_NOT_CONTACT_MATCH");
    reasons.add("SUPPRESSED");
  }
  for (const check of input.preferenceChecks) {
    if (!check.active || !check.matched) continue;
    reasons.add("PREFERENCE_SERVICE_MATCH");
    if (check.service === "fps") reasons.add("FPS_MATCH");
    if (check.service === "mps") reasons.add("MPS_MATCH");
  }
}

function addRecipientReasons(
  reasons: Set<EligibilityReasonCode>,
  input: ChannelDecisionInput,
): void {
  if (!input.recipientEntity) {
    reasons.add("RECIPIENT_VERIFICATION_MISSING");
    return;
  }
  if (!input.recipientEntity.verified) {
    reasons.add("RECIPIENT_VERIFICATION_MISSING");
  } else if (isStale(input.recipientEntity.expiresAt, input.now)) {
    reasons.add("RECIPIENT_VERIFICATION_STALE");
  }
}

function decideOutcome(
  reasons: Set<EligibilityReasonCode>,
  preferredFailure: OutreachDecisionOutcome,
): OutreachDecisionOutcome {
  if (reasons.size === 0) return "eligible";
  if (reasons.has("DO_NOT_CONTACT_MATCH") || reasons.has("SUPPRESSED")) {
    return "quarantine";
  }
  if (
    reasons.has("SENSITIVE_TARGETING_RISK") ||
    reasons.has("PREFERENCE_SERVICE_MATCH") ||
    reasons.has("FPS_MATCH") ||
    reasons.has("MPS_MATCH")
  ) {
    return "quarantine";
  }
  if (
    reasons.has("PUBLIC_ADDRESS_CONTEXT_UNAPPROVED") ||
    reasons.has("LIKELY_HOME_ADDRESS_REVIEW_REQUIRED")
  ) {
    return "review";
  }
  return preferredFailure;
}

export function evaluateOutreachChannel(
  input: ChannelDecisionInput,
): ChannelDecision {
  const reasons = new Set<EligibilityReasonCode>();
  addSharedOutreachReasons(reasons, input);
  addRecipientReasons(reasons, input);

  if (input.channel === "corporate_email") {
    if (
      !input.recipientEntity ||
      !emailEligibleEntityTypes.has(input.recipientEntity.entityType)
    ) {
      reasons.add("RECIPIENT_NOT_CORPORATE_SUBSCRIBER");
      reasons.add("RECIPIENT_ENTITY_UNSUPPORTED");
    }
    if (!input.domainMatch?.verified) {
      reasons.add("DOMAIN_MATCH_MISSING");
    } else if (isStale(input.domainMatch.expiresAt, input.now)) {
      reasons.add("DOMAIN_MATCH_STALE");
    }
    if (input.mailboxAssessment?.type !== "role") {
      reasons.add("MAILBOX_NOT_ROLE_BASED");
    }
    if (
      input.mailboxAssessment &&
      input.mailboxAssessment.mailboxDomain !== input.mailboxAssessment.verifiedDomain
    ) {
      reasons.add("MAILBOX_DOMAIN_MISMATCH");
    }
    if (
      !input.mailboxAssessment ||
      isStale(input.mailboxAssessment.expiresAt, input.now)
    ) {
      reasons.add("MAILBOX_ASSESSMENT_STALE");
    }
    return {
      channel: input.channel,
      outcome: decideOutcome(reasons, "ineligible"),
      reasonCodes: [...reasons],
      policyVersion,
      decidedAt: input.now,
    };
  }

  if (input.channel === "postal_letter") {
    const address = input.postalAddressAssessment;
    if (!address?.verified) {
      reasons.add("POSTAL_ADDRESS_MISSING");
    } else if (isStale(address.expiresAt, input.now)) {
      reasons.add("POSTAL_ADDRESS_STALE");
    }
    if (!address?.sourceApproved) {
      reasons.add("POSTAL_ADDRESS_SOURCE_NOT_APPROVED");
    }
    if (!input.letterTemplateApproved) {
      reasons.add("LETTER_TEMPLATE_NOT_APPROVED");
    }
    if (
      input.recipientEntity &&
      postalReviewEntityTypes.has(input.recipientEntity.entityType)
    ) {
      if (!address?.publicContextApproved) {
        reasons.add("PUBLIC_ADDRESS_CONTEXT_UNAPPROVED");
      }
      if (address?.addressContext === "likely_home" || address?.addressContext === "unknown") {
        reasons.add("LIKELY_HOME_ADDRESS_REVIEW_REQUIRED");
      }
      if (address?.sensitiveTargetingRisk) {
        reasons.add("SENSITIVE_TARGETING_RISK");
      }
    } else if (
      input.recipientEntity?.entityType === "unsupported" ||
      input.recipientEntity?.entityType === "unincorporated_association"
    ) {
      reasons.add("RECIPIENT_ENTITY_UNSUPPORTED");
    }
    return {
      channel: input.channel,
      outcome: decideOutcome(reasons, "review"),
      reasonCodes: [...reasons],
      policyVersion,
      decidedAt: input.now,
    };
  }

  if (input.channel === "individual_email") {
    if (!input.consentRecorded) {
      reasons.add("INDIVIDUAL_EMAIL_REQUIRES_CONSENT");
    }
    const blockedOutcome = decideOutcome(reasons, "consent_required");
    return {
      channel: input.channel,
      outcome: blockedOutcome === "eligible" ? "eligible" : blockedOutcome,
      reasonCodes: [...reasons],
      policyVersion,
      decidedAt: input.now,
    };
  }

  reasons.add("CHANNEL_NOT_APPROVED");
  return {
    channel: input.channel,
    outcome: "ineligible",
    reasonCodes: [...reasons],
    policyVersion,
    decidedAt: input.now,
  };
}
