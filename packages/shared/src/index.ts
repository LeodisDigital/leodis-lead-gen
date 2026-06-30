import { z } from "zod";

export const entityTypes = [
  "uk_limited_company",
  "uk_plc",
  "uk_llp",
  "registered_charity",
  "charitable_company",
  "public_body",
  "sole_trader",
  "individual",
  "unincorporated_association",
  "unsupported",
] as const;
export type EntityType = (typeof entityTypes)[number];

export const outreachChannels = [
  "corporate_email",
  "postal_letter",
  "individual_email",
  "telephone",
] as const;
export type OutreachChannel = (typeof outreachChannels)[number];

export const outreachDecisionOutcomes = [
  "eligible",
  "held",
  "review",
  "consent_required",
  "ineligible",
  "quarantine",
] as const;
export type OutreachDecisionOutcome = (typeof outreachDecisionOutcomes)[number];

export const sourceClasses = [
  "companies-house",
  "charity-commission",
  "oscr",
  "ccni",
  "client-provided-prospect",
  "client-provided-target",
  "google-places",
  "google-search",
  "company-website",
  "charity-website",
  "licensed-provider",
  "preference-service",
  "suppression-import",
] as const;
export type SourceClass = (typeof sourceClasses)[number];

export const approvedSourceUses = [
  "verification",
  "campaign_targeting",
  "corporate_email",
  "postal_fundraising",
  "preference_screening",
  "suppression",
] as const;
export type ApprovedSourceUse = (typeof approvedSourceUses)[number];

export const sourceFields = [
  "company_number",
  "company_name",
  "charity_number",
  "oscr_number",
  "ccni_number",
  "domain",
  "role_mailbox",
  "named_mailbox",
  "registered_address",
  "trading_address",
  "postal_address",
  "person_name",
  "phone",
] as const;
export type SourceField = (typeof sourceFields)[number];

export const mailboxTypes = [
  "role",
  "named_person",
  "personal_domain",
  "unknown",
] as const;
export type MailboxType = (typeof mailboxTypes)[number];

export const eligibilityReasonCodes = [
  "CLIENT_NOT_APPROVED",
  "CAMPAIGN_NOT_APPROVED",
  "CAMPAIGN_PRINCIPAL_NOT_VERIFIED",
  "COMPANY_NOT_SUPPORTED",
  "COMPANY_VERIFICATION_MISSING",
  "COMPANY_VERIFICATION_STALE",
  "LISTING_MATCH_MISSING",
  "LISTING_MATCH_STALE",
  "DOMAIN_MATCH_MISSING",
  "DOMAIN_MATCH_STALE",
  "MAILBOX_NOT_ROLE_BASED",
  "MAILBOX_DOMAIN_MISMATCH",
  "MAILBOX_ASSESSMENT_STALE",
  "SOURCE_NOT_APPROVED",
  "TRANSPARENCY_RECORD_MISSING",
  "SUPPRESSED",
  "CHARITY_PRINCIPAL_NOT_VERIFIED",
  "CHARITY_PRINCIPAL_STALE",
  "RECIPIENT_NOT_CORPORATE_SUBSCRIBER",
  "RECIPIENT_ENTITY_UNSUPPORTED",
  "RECIPIENT_VERIFICATION_MISSING",
  "RECIPIENT_VERIFICATION_STALE",
  "POSTAL_ADDRESS_MISSING",
  "POSTAL_ADDRESS_STALE",
  "POSTAL_ADDRESS_SOURCE_NOT_APPROVED",
  "PREFERENCE_SERVICE_MATCH",
  "FPS_MATCH",
  "MPS_MATCH",
  "LAWFUL_BASIS_MISSING",
  "CHANNEL_NOT_APPROVED",
  "INDIVIDUAL_EMAIL_REQUIRES_CONSENT",
  "LETTER_TEMPLATE_NOT_APPROVED",
  "PUBLIC_ADDRESS_CONTEXT_UNAPPROVED",
  "LIKELY_HOME_ADDRESS_REVIEW_REQUIRED",
  "SENSITIVE_TARGETING_RISK",
  "DO_NOT_CONTACT_MATCH",
  "REGISTER_API_UNAVAILABLE",
] as const;
export type EligibilityReasonCode = (typeof eligibilityReasonCodes)[number];

export const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://leadgen:leadgen@localhost:55432/leadgen"),
  REDIS_URL: z.string().min(1).default("redis://localhost:56379"),
  LIVE_COLLECTION_ENABLED: z.stringbool().default(false),
  PRODUCTION_EXPORTS_ENABLED: z.stringbool().default(false),
  COMPANIES_HOUSE_API_KEY: z.string().optional(),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  SESSION_SECRET: z
    .string()
    .min(32)
    .default("local-development-session-secret-change-me"),
});

export type Environment = z.infer<typeof environmentSchema>;

export const workerEnvironmentSchema = environmentSchema.pick({
  NODE_ENV: true,
  DATABASE_URL: true,
}).extend({
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(2_000),
  WORKER_LEASE_SECONDS: z.coerce.number().int().min(10).max(3_600).default(120),
});

export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export const requiredLaunchGates = [
  {
    key: "professional_legal_review",
    label: "Professional legal review",
    description: "Operating model, policies, notices, contracts, and rights workflows approved.",
  },
  {
    key: "source_approval",
    label: "Source approval",
    description: "Every enabled source has current documented permission and policy approval.",
  },
  {
    key: "security_review",
    label: "Security review",
    description: "Threat model, penetration test, and tenant-isolation testing passed.",
  },
  {
    key: "compliance_corpus",
    label: "Compliance corpus",
    description: "Eligibility and suppression corpus passes with zero false exports.",
  },
  {
    key: "recovery_exercise",
    label: "Recovery exercise",
    description: "Backup restoration and incident-response exercises passed.",
  },
  {
    key: "operational_ownership",
    label: "Operational ownership",
    description: "Named compliance owner and escalation rota recorded.",
  },
] as const;
