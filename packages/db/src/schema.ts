import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const campaignStatus = pgEnum("campaign_status", [
  "draft",
  "pending_approval",
  "approved",
  "running",
  "paused",
  "cancelled",
  "completed",
  "expired",
  "suspended",
]);

export const decisionOutcome = pgEnum("decision_outcome", [
  "verified",
  "review",
  "quarantine",
  "eligible",
  "ineligible",
]);

export const outreachChannel = pgEnum("outreach_channel", [
  "corporate_email",
  "postal_letter",
  "individual_email",
  "telephone",
]);

export const outreachDecisionOutcome = pgEnum("outreach_decision_outcome", [
  "eligible",
  "held",
  "review",
  "consent_required",
  "ineligible",
  "quarantine",
]);

export const charityRegister = pgEnum("charity_register", [
  "charity_commission",
  "oscr",
  "ccni",
  "companies_house",
]);

export const suppressionScope = pgEnum("suppression_scope", [
  "platform",
  "organisation",
]);

export const suppressionTargetType = pgEnum("suppression_target_type", [
  "company",
  "domain",
  "mailbox",
  "person",
  "phone",
  "postal_address",
  "charity",
]);

export const organisations = pgTable("organisations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  approved: boolean("approved").notNull().default(false),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  ...timestamps,
});

export const clientComplianceProfiles = pgTable("client_compliance_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  lawfulBasis: text("lawful_basis"),
  liaVersion: text("lia_version"),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("compliance_profiles_org_unique").on(table.organisationId),
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  sensitive: boolean("sensitive").notNull().default(false),
  updatedBy: uuid("updated_by").references(() => users.id),
  ...timestamps,
});

export const launchGates = pgTable("launch_gates", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  completed: boolean("completed").notNull().default(false),
  evidenceReference: text("evidence_reference"),
  completedBy: uuid("completed_by").references(() => users.id),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
});

export const userSessions = pgTable("user_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
}, (table) => [
  uniqueIndex("user_sessions_token_unique").on(table.tokenHash),
  index("user_sessions_user_idx").on(table.userId),
]);

export const organisationMemberships = pgTable("organisation_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: text("role").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("memberships_org_user_unique").on(table.organisationId, table.userId),
]);

export const campaignPrincipals = pgTable("campaign_principals", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  legalName: text("legal_name").notNull(),
  companyNumber: text("company_number"),
  intendedSender: text("intended_sender").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  ...timestamps,
});

export const charityPrincipals = pgTable("charity_principals", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  legalName: text("legal_name").notNull(),
  charityCommissionNumber: text("charity_commission_number"),
  oscrNumber: text("oscr_number"),
  ccniNumber: text("ccni_number"),
  companyNumber: text("company_number"),
  status: text("status").notNull().default("unverified"),
  registeredAddress: jsonb("registered_address"),
  publicWebsite: text("public_website"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verificationExpiresAt: timestamp("verification_expires_at", { withTimezone: true }),
  conflictAt: timestamp("conflict_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("charity_principals_org_idx").on(table.organisationId),
]);

export const charityVerifications = pgTable("charity_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  charityPrincipalId: uuid("charity_principal_id").notNull().references(() => charityPrincipals.id),
  register: charityRegister("register").notNull(),
  registerNumber: text("register_number").notNull(),
  outcome: decisionOutcome("outcome").notNull(),
  registerStatus: text("register_status").notNull(),
  sourceUrl: text("source_url").notNull(),
  evidenceHash: text("evidence_hash").notNull(),
  evidenceIds: jsonb("evidence_ids").notNull().default([]),
  reasonCodes: jsonb("reason_codes").notNull().default([]),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  index("charity_verifications_principal_idx").on(table.charityPrincipalId),
  index("charity_verifications_register_idx").on(table.register, table.registerNumber),
]);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  principalId: uuid("principal_id").notNull().references(() => campaignPrincipals.id),
  name: text("name").notNull(),
  purpose: text("purpose").notNull(),
  targetIndustry: text("target_industry"),
  targetLocation: text("target_location"),
  maxLeads: integer("max_leads").notNull().default(100),
  status: campaignStatus("status").notNull().default("draft"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [index("campaigns_organisation_idx").on(table.organisationId)]);

export const campaignAttestations = pgTable("campaign_attestations", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  version: text("version").notNull(),
  statement: text("statement").notNull(),
  attestedAt: timestamp("attested_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
});

export const sourcePolicies = pgTable("source_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: text("version").notNull(),
  sourceClass: text("source_class").notNull(),
  hostnamePattern: text("hostname_pattern"),
  owner: text("owner").notNull().default("platform owner"),
  evidenceReference: text("evidence_reference"),
  enabled: boolean("enabled").notNull().default(false),
  approvedUses: jsonb("approved_uses").notNull(),
  approvedFields: jsonb("approved_fields").notNull(),
  approvedChannels: jsonb("approved_channels").notNull().default([]),
  retentionDays: integer("retention_days").notNull().default(365),
  attributionRequired: boolean("attribution_required").notNull().default(true),
  prohibitedReuse: jsonb("prohibited_reuse").notNull().default([]),
  notes: text("notes"),
  rateLimit: integer("rate_limit"),
  volumeLimit: integer("volume_limit"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  index("source_policies_class_enabled_idx").on(table.sourceClass, table.enabled),
]);

export const sourceRecords = pgTable("source_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourcePolicyId: uuid("source_policy_id").notNull().references(() => sourcePolicies.id),
  sourceUrl: text("source_url").notNull(),
  fieldName: text("field_name").notNull(),
  fieldValueHash: text("field_value_hash").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  index("source_records_policy_idx").on(table.sourcePolicyId),
  index("source_records_value_hash_idx").on(table.fieldValueHash),
]);

export const evidenceArtifacts = pgTable("evidence_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourcePolicyId: uuid("source_policy_id").notNull().references(() => sourcePolicies.id),
  sourceUrl: text("source_url").notNull(),
  contentHash: text("content_hash").notNull(),
  storageKey: text("storage_key"),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [index("evidence_content_hash_idx").on(table.contentHash)]);

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyNumber: text("company_number").notNull(),
  legalName: text("legal_name").notNull(),
  entityType: text("entity_type").notNull(),
  companyStatus: text("company_status").notNull(),
  companyType: text("company_type"),
  registeredAddress: jsonb("registered_address"),
  sicCodes: jsonb("sic_codes").notNull().default([]),
  verifiedSource: text("verified_source"),
  ...timestamps,
}, (table) => [uniqueIndex("companies_number_unique").on(table.companyNumber)]);

export const companyVerifications = pgTable("company_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  outcome: decisionOutcome("outcome").notNull(),
  policyVersion: text("policy_version").notNull(),
  evidenceIds: jsonb("evidence_ids").notNull(),
  reasonCodes: jsonb("reason_codes").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [index("company_verifications_company_idx").on(table.companyId)]);

export const businessLocations = pgTable("business_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  addressHash: text("address_hash").notNull(),
  address: jsonb("address").notNull(),
  ...timestamps,
}, (table) => [index("business_locations_company_idx").on(table.companyId)]);

export const businessListings = pgTable("business_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceRecordId: uuid("source_record_id").notNull().references(() => sourceRecords.id),
  businessName: text("business_name").notNull(),
  websiteUrl: text("website_url"),
  addressHash: text("address_hash"),
  ...timestamps,
}, (table) => [index("business_listings_source_idx").on(table.sourceRecordId)]);

export const listingMatches = pgTable("listing_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessListingId: uuid("business_listing_id").notNull().references(() => businessListings.id),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  outcome: decisionOutcome("outcome").notNull(),
  policyVersion: text("policy_version").notNull(),
  evidenceIds: jsonb("evidence_ids").notNull(),
  reasonCodes: jsonb("reason_codes").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  index("listing_matches_listing_company_idx").on(table.businessListingId, table.companyId),
]);

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  registrableDomain: text("registrable_domain").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("domains_name_unique").on(table.registrableDomain)]);

export const domainVerifications = pgTable("domain_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  domainId: uuid("domain_id").notNull().references(() => domains.id),
  outcome: decisionOutcome("outcome").notNull(),
  policyVersion: text("policy_version").notNull(),
  evidenceIds: jsonb("evidence_ids").notNull(),
  reasonCodes: jsonb("reason_codes").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  index("domain_verifications_company_domain_idx").on(table.companyId, table.domainId),
]);

export const mailboxes = pgTable("mailboxes", {
  id: uuid("id").primaryKey().defaultRandom(),
  domainId: uuid("domain_id").notNull().references(() => domains.id),
  address: text("address").notNull(),
  localPart: text("local_part").notNull(),
  mailboxType: text("mailbox_type").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("mailboxes_address_unique").on(table.address)]);

export const mailboxAssessments = pgTable("mailbox_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  mailboxId: uuid("mailbox_id").notNull().references(() => mailboxes.id),
  outcome: decisionOutcome("outcome").notNull(),
  mailboxType: text("mailbox_type").notNull(),
  policyVersion: text("policy_version").notNull(),
  evidenceIds: jsonb("evidence_ids").notNull(),
  reasonCodes: jsonb("reason_codes").notNull(),
  assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [index("mailbox_assessments_mailbox_idx").on(table.mailboxId)]);

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  displayNameHash: text("display_name_hash").notNull(),
  exportEnabled: boolean("export_enabled").notNull().default(false),
  ...timestamps,
}, (table) => [index("contacts_company_idx").on(table.companyId)]);

export const campaignLeads = pgTable("campaign_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  domainId: uuid("domain_id").notNull().references(() => domains.id),
  mailboxId: uuid("mailbox_id").notNull().references(() => mailboxes.id),
  ...timestamps,
}, (table) => [
  uniqueIndex("campaign_leads_unique").on(table.campaignId, table.mailboxId),
  index("campaign_leads_org_idx").on(table.organisationId),
]);

export const prospectEntities = pgTable("prospect_entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  entityType: text("entity_type").notNull(),
  legalName: text("legal_name").notNull(),
  tradingName: text("trading_name"),
  companyNumber: text("company_number"),
  charityCommissionNumber: text("charity_commission_number"),
  oscrNumber: text("oscr_number"),
  ccniNumber: text("ccni_number"),
  status: text("status").notNull().default("unverified"),
  sourceRecordId: uuid("source_record_id").references(() => sourceRecords.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("prospect_entities_org_idx").on(table.organisationId),
  index("prospect_entities_company_idx").on(table.companyNumber),
  index("prospect_entities_charity_idx").on(table.charityCommissionNumber),
]);

export const campaignProspects = pgTable("campaign_prospects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  prospectEntityId: uuid("prospect_entity_id").notNull().references(() => prospectEntities.id),
  domainId: uuid("domain_id").references(() => domains.id),
  mailboxId: uuid("mailbox_id").references(() => mailboxes.id),
  sourceRecordId: uuid("source_record_id").references(() => sourceRecords.id),
  ...timestamps,
}, (table) => [
  uniqueIndex("campaign_prospects_entity_unique").on(table.campaignId, table.prospectEntityId),
  index("campaign_prospects_org_idx").on(table.organisationId),
]);

export const prospectAddresses = pgTable("prospect_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  prospectEntityId: uuid("prospect_entity_id").notNull().references(() => prospectEntities.id),
  sourceRecordId: uuid("source_record_id").references(() => sourceRecords.id),
  addressHash: text("address_hash").notNull(),
  address: jsonb("address").notNull(),
  addressContext: text("address_context").notNull().default("unknown"),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  index("prospect_addresses_entity_idx").on(table.prospectEntityId),
  index("prospect_addresses_hash_idx").on(table.addressHash),
]);

export const postalAddressAssessments = pgTable("postal_address_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  prospectAddressId: uuid("prospect_address_id").notNull().references(() => prospectAddresses.id),
  outcome: decisionOutcome("outcome").notNull(),
  policyVersion: text("policy_version").notNull(),
  sourceApproved: boolean("source_approved").notNull().default(false),
  publicContextApproved: boolean("public_context_approved").notNull().default(false),
  sensitiveTargetingRisk: boolean("sensitive_targeting_risk").notNull().default(false),
  reasonCodes: jsonb("reason_codes").notNull().default([]),
  evidenceIds: jsonb("evidence_ids").notNull().default([]),
  assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("postal_assessments_address_idx").on(table.prospectAddressId)]);

export const outreachChannelDecisions = pgTable("outreach_channel_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignProspectId: uuid("campaign_prospect_id").notNull().references(() => campaignProspects.id),
  channel: outreachChannel("channel").notNull(),
  outcome: outreachDecisionOutcome("outcome").notNull(),
  policyVersion: text("policy_version").notNull(),
  reasonCodes: jsonb("reason_codes").notNull().default([]),
  evidenceIds: jsonb("evidence_ids").notNull().default([]),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("outreach_decisions_prospect_idx").on(table.campaignProspectId),
  index("outreach_decisions_channel_outcome_idx").on(table.channel, table.outcome),
]);

export const preferenceServiceChecks = pgTable("preference_service_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  prospectEntityId: uuid("prospect_entity_id").references(() => prospectEntities.id),
  prospectAddressId: uuid("prospect_address_id").references(() => prospectAddresses.id),
  service: text("service").notNull(),
  targetType: suppressionTargetType("target_type").notNull(),
  targetHash: text("target_hash").notNull(),
  matched: boolean("matched").notNull().default(false),
  active: boolean("active").notNull().default(true),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  evidenceIds: jsonb("evidence_ids").notNull().default([]),
  ...timestamps,
}, (table) => [
  index("preference_checks_target_idx").on(table.targetType, table.targetHash, table.active),
  index("preference_checks_entity_idx").on(table.prospectEntityId),
]);

export const doNotContactTokens = pgTable("do_not_contact_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  campaignProspectId: uuid("campaign_prospect_id").references(() => campaignProspects.id),
  channel: outreachChannel("channel"),
  tokenHash: text("token_hash").notNull(),
  printedCodeHash: text("printed_code_hash"),
  suppressionScope: suppressionScope("suppression_scope").notNull().default("organisation"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("do_not_contact_tokens_token_unique").on(table.tokenHash),
  index("do_not_contact_tokens_org_idx").on(table.organisationId),
]);

export const letterTemplateManifests = pgTable("letter_template_manifests", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  version: text("version").notNull(),
  name: text("name").notNull(),
  subjectLine: text("subject_line"),
  bodyText: text("body_text").notNull().default(""),
  mergeFields: jsonb("merge_fields").$type<string[]>().notNull().default([]),
  controllerIdentity: text("controller_identity").notNull(),
  doNotContactRoute: text("do_not_contact_route").notNull(),
  approved: boolean("approved").notNull().default(false),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  evidenceReference: text("evidence_reference").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  index("letter_template_org_idx").on(table.organisationId, table.approved),
]);

export const emailTemplateManifests = pgTable("email_template_manifests", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  version: text("version").notNull(),
  name: text("name").notNull(),
  subjectLine: text("subject_line").notNull(),
  bodyText: text("body_text").notNull(),
  mergeFields: jsonb("merge_fields").$type<string[]>().notNull().default([]),
  controllerIdentity: text("controller_identity").notNull(),
  doNotContactRoute: text("do_not_contact_route").notNull(),
  approved: boolean("approved").notNull().default(false),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  evidenceReference: text("evidence_reference").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  index("email_template_org_idx").on(table.organisationId, table.approved),
]);

export const fulfilmentProviders = pgTable("fulfilment_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  name: text("name").notNull(),
  mode: text("mode").notNull().default("provider_api"),
  enabled: boolean("enabled").notNull().default(false),
  testMode: boolean("test_mode").notNull().default(true),
  contractReference: text("contract_reference"),
  dpaReference: text("dpa_reference"),
  securityReviewReference: text("security_review_reference"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("fulfilment_provider_org_idx").on(table.organisationId, table.enabled),
]);

export const letterFulfilmentBatches = pgTable("letter_fulfilment_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  templateManifestId: uuid("template_manifest_id").notNull().references(() => letterTemplateManifests.id),
  providerId: uuid("provider_id").references(() => fulfilmentProviders.id),
  mode: text("mode").notNull(),
  status: text("status").notNull().default("created"),
  recipientCount: integer("recipient_count").notNull().default(0),
  manifest: jsonb("manifest").notNull().default({}),
  createdBy: uuid("created_by").references(() => users.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("letter_batches_campaign_idx").on(table.campaignId),
  index("letter_batches_org_status_idx").on(table.organisationId, table.status),
]);

export const letterFulfilmentItems = pgTable("letter_fulfilment_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  batchId: uuid("batch_id").notNull().references(() => letterFulfilmentBatches.id),
  campaignProspectId: uuid("campaign_prospect_id").notNull().references(() => campaignProspects.id),
  outreachChannelDecisionId: uuid("outreach_channel_decision_id").notNull().references(() => outreachChannelDecisions.id),
  doNotContactTokenId: uuid("do_not_contact_token_id").references(() => doNotContactTokens.id),
  status: text("status").notNull().default("created"),
  providerItemId: text("provider_item_id"),
  failureReason: text("failure_reason"),
  ...timestamps,
}, (table) => [
  uniqueIndex("letter_items_batch_prospect_unique").on(table.batchId, table.campaignProspectId),
  index("letter_items_status_idx").on(table.status),
]);

export const eligibilityDecisions = pgTable("eligibility_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignLeadId: uuid("campaign_lead_id").notNull().references(() => campaignLeads.id),
  outcome: decisionOutcome("outcome").notNull(),
  policyVersion: text("policy_version").notNull(),
  reasonCodes: jsonb("reason_codes").notNull(),
  evidenceIds: jsonb("evidence_ids").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("eligibility_lead_idx").on(table.campaignLeadId)]);

export const manualReviews = pgTable("manual_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").references(() => organisations.id),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  status: text("status").notNull().default("pending"),
  decision: text("decision"),
  reasonCodes: jsonb("reason_codes").notNull(),
  evidenceIds: jsonb("evidence_ids").notNull(),
  reviewerId: uuid("reviewer_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("manual_reviews_status_idx").on(table.status),
  uniqueIndex("manual_reviews_pending_subject_unique").on(
    table.subjectType,
    table.subjectId,
  ).where(sql`${table.status} = 'pending'`),
]);

export const suppressionEntries = pgTable("suppression_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").references(() => organisations.id),
  scope: suppressionScope("scope").notNull(),
  targetType: suppressionTargetType("target_type").notNull(),
  targetHash: text("target_hash").notNull(),
  reason: text("reason").notNull(),
  active: boolean("active").notNull().default(true),
  suppressedAt: timestamp("suppressed_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
}, (table) => [
  index("suppression_lookup_idx").on(table.targetType, table.targetHash, table.active),
]);

export const rightsRequests = pgTable("rights_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestType: text("request_type").notNull(),
  requesterIdentifierHash: text("requester_identifier_hash").notNull(),
  details: text("details").notNull(),
  status: text("status").notNull().default("received"),
  identityVerifiedAt: timestamp("identity_verified_at", { withTimezone: true }),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [index("rights_requests_status_due_idx").on(table.status, table.dueAt)]);

export const complaints = pgTable("complaints", {
  id: uuid("id").primaryKey().defaultRandom(),
  complainantIdentifierHash: text("complainant_identifier_hash").notNull(),
  details: text("details").notNull(),
  status: text("status").notNull().default("received"),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  acknowledgementDueAt: timestamp("acknowledgement_due_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("complaints_status_ack_due_idx").on(table.status, table.acknowledgementDueAt),
]);

export const notificationLogs = pgTable("notification_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").references(() => organisations.id),
  notificationType: text("notification_type").notNull(),
  recipientHash: text("recipient_hash").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const exports = pgTable("exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id),
  purpose: text("purpose").notNull(),
  storageKey: text("storage_key"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [index("exports_org_idx").on(table.organisationId)]);

export const exportLeads = pgTable("export_leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  exportId: uuid("export_id").notNull().references(() => exports.id),
  campaignLeadId: uuid("campaign_lead_id").notNull().references(() => campaignLeads.id),
  eligibilityDecisionId: uuid("eligibility_decision_id").notNull().references(() => eligibilityDecisions.id),
  ...timestamps,
}, (table) => [
  uniqueIndex("export_leads_unique").on(table.exportId, table.campaignLeadId),
]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").references(() => organisations.id),
  actorId: uuid("actor_id"),
  eventType: text("event_type").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  payload: jsonb("payload").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobRuns = pgTable("job_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organisationId: uuid("organisation_id").references(() => organisations.id),
  queueName: text("queue_name").notNull(),
  jobName: text("job_name").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull(),
  traceId: text("trace_id").notNull(),
  payload: jsonb("payload").notNull().default({}),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  lastError: text("last_error"),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
  workerId: text("worker_id"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("job_runs_idempotency_unique").on(table.queueName, table.idempotencyKey),
  index("job_runs_claim_idx").on(table.queueName, table.status, table.availableAt),
]);
