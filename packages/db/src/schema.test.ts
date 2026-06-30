import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  campaignProspects,
  charityPrincipals,
  charityVerifications,
  doNotContactTokens,
  emailTemplateManifests,
  fulfilmentProviders,
  letterFulfilmentBatches,
  letterFulfilmentItems,
  letterTemplateManifests,
  outreachChannelDecisions,
  postalAddressAssessments,
  preferenceServiceChecks,
  prospectAddresses,
  prospectEntities,
} from "./schema.js";

describe("Buttercup schema surface", () => {
  it("exports the Phase 1 channel-neutral and compliance tables", () => {
    expect([
      charityPrincipals,
      charityVerifications,
      prospectEntities,
      campaignProspects,
      prospectAddresses,
      postalAddressAssessments,
      outreachChannelDecisions,
      preferenceServiceChecks,
      doNotContactTokens,
      letterTemplateManifests,
      emailTemplateManifests,
      fulfilmentProviders,
      letterFulfilmentBatches,
      letterFulfilmentItems,
    ].map(getTableName)).toEqual([
      "charity_principals",
      "charity_verifications",
      "prospect_entities",
      "campaign_prospects",
      "prospect_addresses",
      "postal_address_assessments",
      "outreach_channel_decisions",
      "preference_service_checks",
      "do_not_contact_tokens",
      "letter_template_manifests",
      "email_template_manifests",
      "fulfilment_providers",
      "letter_fulfilment_batches",
      "letter_fulfilment_items",
    ]);
  });
});
