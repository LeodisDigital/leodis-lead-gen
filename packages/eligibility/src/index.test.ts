import { describe, expect, it } from "vitest";

import type { ChannelDecisionInput, EligibilityInput } from "./index.js";
import { evaluateEligibility, evaluateOutreachChannel } from "./index.js";

const now = new Date("2026-06-11T12:00:00.000Z");
const fresh = new Date("2026-07-11T12:00:00.000Z");

function eligibleInput(): EligibilityInput {
  return {
    now,
    clientApproved: true,
    campaignApproved: true,
    campaignPrincipalVerified: true,
    entityType: "uk_limited_company",
    companyVerification: { verified: true, expiresAt: fresh },
    listingMatch: { verified: true, expiresAt: fresh },
    domainMatch: { verified: true, expiresAt: fresh },
    mailboxAssessment: {
      type: "role",
      mailboxDomain: "example.co.uk",
      verifiedDomain: "example.co.uk",
      expiresAt: fresh,
    },
    sourcesApproved: true,
    transparencyRecorded: true,
    suppressions: [],
  };
}

describe("evaluateEligibility", () => {
  it("approves only when every invariant is satisfied", () => {
    expect(evaluateEligibility(eligibleInput())).toMatchObject({
      eligible: true,
      reasonCodes: [],
    });
  });

  it("fails closed when assessments are missing", () => {
    const input = eligibleInput();
    input.companyVerification = null;
    input.domainMatch = null;
    input.mailboxAssessment = null;

    expect(evaluateEligibility(input)).toMatchObject({
      eligible: false,
      reasonCodes: expect.arrayContaining([
        "COMPANY_VERIFICATION_MISSING",
        "DOMAIN_MATCH_MISSING",
        "MAILBOX_NOT_ROLE_BASED",
        "MAILBOX_ASSESSMENT_STALE",
      ]),
    });
  });

  it("rejects named-person mailboxes and domain mismatches", () => {
    const input = eligibleInput();
    input.mailboxAssessment = {
      type: "named_person",
      mailboxDomain: "gmail.com",
      verifiedDomain: "example.co.uk",
      expiresAt: fresh,
    };

    expect(evaluateEligibility(input).reasonCodes).toEqual(
      expect.arrayContaining(["MAILBOX_NOT_ROLE_BASED", "MAILBOX_DOMAIN_MISMATCH"]),
    );
  });

  it("rejects any active suppression immediately", () => {
    const input = eligibleInput();
    input.suppressions = [
      {
        id: "suppression-1",
        scope: "platform",
        targetType: "mailbox",
        active: true,
      },
    ];

    expect(evaluateEligibility(input)).toMatchObject({
      eligible: false,
      reasonCodes: ["SUPPRESSED"],
    });
  });

  it("rejects stale verification", () => {
    const input = eligibleInput();
    input.companyVerification = {
      verified: true,
      expiresAt: new Date("2026-06-11T11:59:59.000Z"),
    };

    expect(evaluateEligibility(input).reasonCodes).toContain(
      "COMPANY_VERIFICATION_STALE",
    );
  });
});

function outreachInput(
  overrides: Partial<ChannelDecisionInput> = {},
): ChannelDecisionInput {
  return {
    now,
    channel: "corporate_email",
    charityPrincipal: { verified: true, expiresAt: fresh },
    campaignApproved: true,
    channelApproved: true,
    recipientEntity: {
      entityType: "uk_limited_company",
      verified: true,
      expiresAt: fresh,
    },
    domainMatch: { verified: true, expiresAt: fresh },
    mailboxAssessment: {
      type: "role",
      mailboxDomain: "example.co.uk",
      verifiedDomain: "example.co.uk",
      expiresAt: fresh,
    },
    postalAddressAssessment: {
      verified: true,
      expiresAt: fresh,
      sourceApproved: true,
      addressContext: "business",
      publicContextApproved: true,
      sensitiveTargetingRisk: false,
    },
    sourcesApproved: true,
    lawfulBasisRecorded: true,
    transparencyRecorded: true,
    letterTemplateApproved: true,
    consentRecorded: false,
    preferenceChecks: [],
    suppressions: [],
    ...overrides,
  };
}

describe("evaluateOutreachChannel", () => {
  it("allows easy-win corporate role email for verified companies, PLCs, LLPs, and charities", () => {
    for (const entityType of [
      "uk_limited_company",
      "uk_plc",
      "uk_llp",
      "registered_charity",
      "charitable_company",
    ] as const) {
      expect(evaluateOutreachChannel(outreachInput({
        recipientEntity: { entityType, verified: true, expiresAt: fresh },
      }))).toMatchObject({
        channel: "corporate_email",
        outcome: "eligible",
        reasonCodes: [],
      });
    }
  });

  it("does not allow individuals or sole traders to be cold emailed", () => {
    for (const entityType of ["individual", "sole_trader"] as const) {
      expect(evaluateOutreachChannel(outreachInput({
        recipientEntity: { entityType, verified: true, expiresAt: fresh },
      }))).toMatchObject({
        outcome: "ineligible",
        reasonCodes: expect.arrayContaining([
          "RECIPIENT_NOT_CORPORATE_SUBSCRIBER",
          "RECIPIENT_ENTITY_UNSUPPORTED",
        ]),
      });
    }
  });

  it("allows sole-trader postal letters only when the address context is approved", () => {
    expect(evaluateOutreachChannel(outreachInput({
      channel: "postal_letter",
      recipientEntity: {
        entityType: "sole_trader",
        verified: true,
        expiresAt: fresh,
      },
    }))).toMatchObject({
      outcome: "eligible",
      reasonCodes: [],
    });
  });

  it("puts likely-home individual addresses into review instead of automatic postal export", () => {
    expect(evaluateOutreachChannel(outreachInput({
      channel: "postal_letter",
      recipientEntity: {
        entityType: "individual",
        verified: true,
        expiresAt: fresh,
      },
      postalAddressAssessment: {
        verified: true,
        expiresAt: fresh,
        sourceApproved: true,
        addressContext: "likely_home",
        publicContextApproved: true,
        sensitiveTargetingRisk: false,
      },
    }))).toMatchObject({
      outcome: "review",
      reasonCodes: ["LIKELY_HOME_ADDRESS_REVIEW_REQUIRED"],
    });
  });

  it("quarantines sensitive individual postal targeting", () => {
    expect(evaluateOutreachChannel(outreachInput({
      channel: "postal_letter",
      recipientEntity: {
        entityType: "individual",
        verified: true,
        expiresAt: fresh,
      },
      postalAddressAssessment: {
        verified: true,
        expiresAt: fresh,
        sourceApproved: true,
        addressContext: "business",
        publicContextApproved: true,
        sensitiveTargetingRisk: true,
      },
    }))).toMatchObject({
      outcome: "quarantine",
      reasonCodes: ["SENSITIVE_TARGETING_RISK"],
    });
  });

  it("quarantines all channels when Do Not Contact or preference suppression matches", () => {
    expect(evaluateOutreachChannel(outreachInput({
      channel: "postal_letter",
      suppressions: [
        {
          id: "do-not-contact-1",
          scope: "platform",
          targetType: "postal_address",
          active: true,
        },
      ],
    }))).toMatchObject({
      outcome: "quarantine",
      reasonCodes: expect.arrayContaining(["DO_NOT_CONTACT_MATCH", "SUPPRESSED"]),
    });

    expect(evaluateOutreachChannel(outreachInput({
      channel: "postal_letter",
      preferenceChecks: [{ service: "fps", matched: true, active: true }],
    }))).toMatchObject({
      outcome: "quarantine",
      reasonCodes: expect.arrayContaining(["PREFERENCE_SERVICE_MATCH", "FPS_MATCH"]),
    });
  });

  it("requires consent for individual email unless consent is recorded", () => {
    expect(evaluateOutreachChannel(outreachInput({
      channel: "individual_email",
      recipientEntity: {
        entityType: "individual",
        verified: true,
        expiresAt: fresh,
      },
      consentRecorded: false,
    }))).toMatchObject({
      outcome: "consent_required",
      reasonCodes: expect.arrayContaining(["INDIVIDUAL_EMAIL_REQUIRES_CONSENT"]),
    });

    expect(evaluateOutreachChannel(outreachInput({
      channel: "individual_email",
      recipientEntity: {
        entityType: "individual",
        verified: true,
        expiresAt: fresh,
      },
      consentRecorded: true,
    }))).toMatchObject({
      outcome: "eligible",
      reasonCodes: [],
    });
  });

  it("keeps Do Not Contact absolute even when individual email consent exists", () => {
    expect(evaluateOutreachChannel(outreachInput({
      channel: "individual_email",
      recipientEntity: {
        entityType: "individual",
        verified: true,
        expiresAt: fresh,
      },
      consentRecorded: true,
      suppressions: [
        {
          id: "do-not-contact-email",
          scope: "platform",
          targetType: "person",
          active: true,
        },
      ],
    }))).toMatchObject({
      outcome: "quarantine",
      reasonCodes: expect.arrayContaining(["DO_NOT_CONTACT_MATCH", "SUPPRESSED"]),
    });
  });
});
