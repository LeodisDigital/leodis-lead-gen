import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  collectPublicPage,
  sanitizeRelevantText,
} from "@lead-gen/collection";
import { evaluateEligibility, evaluateOutreachChannel } from "@lead-gen/eligibility";
import { transitionJob, type JobStatus } from "@lead-gen/jobs";
import {
  classifyMailboxLocalPart,
  policyVersion,
  sourcePolicySchema,
  type SourcePolicy,
} from "@lead-gen/policy";
import { authorizeCollection } from "@lead-gen/sources";
import { decideDomainMatch, decideListingMatch } from "@lead-gen/verification";
import {
  requiredLaunchGates,
  type Environment,
  type EntityType,
  type EligibilityReasonCode,
  type MailboxType,
  type OutreachChannel,
  type OutreachDecisionOutcome,
  type SourceField,
} from "@lead-gen/shared";

import {
  createSession,
  destroySession,
  getAuthContext,
  hashIdentifier,
  hashPassword,
  sessionCookieName,
  verifyPassword,
  type AuthContext,
} from "./auth.js";
import {
  fetchCompaniesHouseProfile,
  isSupportedActiveCompany,
  isSupportedActiveCompanySearchResult,
  searchCompaniesHouseCompanies,
  type CompaniesHouseSearchResult,
} from "./companies-house.js";
import type { DatabasePool } from "./db.js";
import { searchGooglePlacesText, type GooglePlaceCandidate } from "./google-places.js";
import {
  getRuntimeSettings,
  setCompaniesHouseApiKey,
  setGooglePlacesApiKey,
  setProductionExportsEnabled,
} from "./runtime-settings.js";

const leodisFooterUrl = "https://leodisdigital.co.uk";
const leodisFooterText = `Software designed by Leodis Digital (${leodisFooterUrl}).`;

const setupSchema = z.object({
  organisationName: z.string().trim().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(10).max(200),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10).max(200),
    confirmPassword: z.string().min(1),
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    message: "New passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });

const companiesHouseSettingsSchema = z.object({
  apiKey: z.string().trim().max(500),
});

const googlePlacesSettingsSchema = z.object({
  apiKey: z.string().trim().max(500),
});

const launchSettingsSchema = z.object({
  productionExportsEnabled: z.boolean(),
  confirmation: z.string().optional().default(""),
});

const campaignSchema = z.object({
  name: z.string().trim().min(2).max(120),
  purpose: z.string().trim().min(10).max(500),
  targetIndustry: z.string().trim().max(120).optional().default(""),
  targetLocation: z.string().trim().max(120).optional().default(""),
  maxLeads: z.coerce.number().int().min(1).max(10_000).default(100),
  principalLegalName: z.string().trim().min(2).max(160),
  principalCompanyNumber: z.string().trim().min(2).max(16),
  intendedSender: z.string().email(),
});

const targetSchema = z.object({
  companyNumber: z.string().trim().min(2).max(16),
  companyName: z.string().trim().min(2).max(200),
  domain: z.string().trim().min(3).max(253),
  mailbox: z.string().email(),
  domainConfirmed: z.boolean().default(false),
});

const launchGateSchema = z.object({
  completed: z.boolean(),
  evidenceReference: z.string().trim().max(500).optional().default(""),
});

const publicIdentifierSchema = z.object({
  identifier: z.string().trim().min(3).max(320),
  details: z.string().trim().min(10).max(4_000),
});

const publicMailboxSchema = z.object({
  identifier: z.string().email(),
});

const rightsRequestSchema = publicIdentifierSchema.extend({
  requestType: z.enum(["access", "correction", "restriction", "objection", "erasure"]),
});

const complaintSchema = publicIdentifierSchema;

const complianceStatusSchema = z.object({
  status: z.string().trim().min(2).max(80),
});

const enqueueJobSchema = z.object({
  queueName: z.literal("maintenance"),
  jobName: z.enum(["prune_expired_sessions", "supersede_expired_eligibility", "enforce_retention"]),
  idempotencyKey: z.string().trim().min(1).max(240),
  payload: z.record(z.string(), z.unknown()).default({}),
  maxAttempts: z.number().int().min(1).max(20).default(3),
});

const sourcePolicyAdminSchema = z.object({
  sourceClass: z.enum([
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
  ]),
  hostnamePattern: z.string().trim().max(253).optional().default(""),
  owner: z.string().trim().min(2).max(160),
  evidenceReference: z.string().trim().min(3).max(500),
  approvedUses: z.array(z.enum([
    "verification",
    "campaign_targeting",
    "corporate_email",
    "postal_fundraising",
    "preference_screening",
    "suppression",
  ])).min(1),
  approvedFields: z.array(z.enum([
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
  ])).min(1),
  approvedChannels: z.array(z.enum([
    "corporate_email",
    "postal_letter",
    "individual_email",
    "telephone",
  ])).default([]),
  retentionDays: z.number().int().positive().max(3650).default(365),
  attributionRequired: z.boolean().default(true),
  prohibitedReuse: z.array(z.string().trim().min(1).max(200)).default([]),
  notes: z.string().trim().max(2000).optional().default(""),
  rateLimit: z.number().int().min(1).max(100_000),
  volumeLimit: z.number().int().min(1).max(10_000_000),
  expiresAt: z.coerce.date(),
});

const charityPrincipalSchema = z.object({
  legalName: z.string().trim().min(2).max(200).default("Buttercup Children's Trust"),
  charityCommissionNumber: z.string().trim().min(2).max(32).default("1128027"),
  oscrNumber: z.string().trim().min(2).max(32).default("SC042679"),
  ccniNumber: z.string().trim().max(32).optional().default(""),
  companyNumber: z.string().trim().min(2).max(16).default("06666946"),
  publicWebsite: z.string().trim().url().optional().or(z.literal("")).default(""),
  evidenceReference: z.string().trim().min(3).max(500),
});

const channelPolicySchema = z.object({
  corporateEmailEnabled: z.boolean().default(false),
  postalLetterEnabled: z.boolean().default(false),
  individualEmailEnabled: z.boolean().default(false),
  telephoneEnabled: z.boolean().default(false),
  letterTemplateApproved: z.boolean().default(false),
  selfPrintFulfilmentEnabled: z.boolean().default(false),
  providerFulfilmentEnabled: z.boolean().default(false),
  evidenceReference: z.string().trim().max(500).optional().default(""),
});

const prospectSchema = z.object({
  entityType: z.enum([
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
  ]),
  legalName: z.string().trim().min(2).max(200),
  tradingName: z.string().trim().max(200).optional().default(""),
  companyNumber: z.string().trim().max(16).optional().default(""),
  charityCommissionNumber: z.string().trim().max(32).optional().default(""),
  oscrNumber: z.string().trim().max(32).optional().default(""),
  ccniNumber: z.string().trim().max(32).optional().default(""),
  domain: z.string().trim().max(253).optional().default(""),
  mailbox: z.string().trim().email().optional().or(z.literal("")).default(""),
  channel: z.enum(["corporate_email", "postal_letter", "individual_email", "telephone"]),
  sourceClass: z.enum(["client-provided-prospect", "client-provided-target"]).default("client-provided-prospect"),
  sourceUrl: z.string().trim().max(500).optional().default("client-prospect-intake"),
  lawfulBasisRecorded: z.boolean().default(false),
  transparencyRecorded: z.boolean().default(false),
  consentRecorded: z.boolean().default(false),
  postalAddress: z.record(z.string(), z.unknown()).optional(),
  postalAddressHash: z.string().trim().max(200).optional().default(""),
  addressContext: z.enum(["business", "registered_office", "likely_home", "unknown"]).default("unknown"),
  publicContextApproved: z.boolean().default(false),
  sensitiveTargetingRisk: z.boolean().default(false),
  addressSourceApproved: z.boolean().default(false),
});

const googleDiscoverySchema = z.object({
  query: z.string().trim().min(2).max(200),
  location: z.string().trim().max(160).optional().default(""),
  maxResults: z.coerce.number().int().min(1).max(20).default(10),
  lawfulBasisRecorded: z.boolean().default(false),
  transparencyRecorded: z.boolean().default(false),
  addressSourceApproved: z.boolean().default(false),
  publicContextApproved: z.boolean().default(false),
  discoverWebsiteMailboxes: z.boolean().default(true),
});

const doNotContactConfirmSchema = z.object({
  token: z.string().trim().min(8).max(500).optional(),
  code: z.string().trim().min(4).max(100).optional(),
  identifier: z.string().trim().min(3).max(320).optional(),
}).refine((input) => input.token || input.code || input.identifier, {
  message: "Token, code, or identifier is required",
});

const letterTemplateSchema = z.object({
  version: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(160),
  subjectLine: z.string().trim().max(200).optional().default(""),
  bodyText: z.string().trim().min(20).max(20_000),
  mergeFields: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  controllerIdentity: z.string().trim().min(2).max(300),
  doNotContactRoute: z.string().trim().min(3).max(500),
  evidenceReference: z.string().trim().min(3).max(500),
  expiresAt: z.coerce.date(),
  approved: z.boolean().default(false),
});

const emailTemplateSchema = z.object({
  version: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(160),
  subjectLine: z.string().trim().min(3).max(200),
  bodyText: z.string().trim().min(20).max(20_000),
  mergeFields: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  controllerIdentity: z.string().trim().min(2).max(300),
  doNotContactRoute: z.string().trim().min(3).max(500),
  evidenceReference: z.string().trim().min(3).max(500),
  expiresAt: z.coerce.date(),
  approved: z.boolean().default(false),
});

const preferenceImportSchema = z.object({
  service: z.enum(["fps", "mps", "internal", "other"]),
  targetType: z.enum(["company", "domain", "mailbox", "person", "phone", "postal_address", "charity"]),
  identifiers: z.array(z.string().trim().min(1).max(500)).min(1).max(10_000),
  evidenceReference: z.string().trim().min(3).max(500),
  expiresAt: z.coerce.date(),
});

const dsarSearchSchema = z.object({
  identifier: z.string().trim().min(2).max(500),
});

const reviewDecisionSchema = z.object({
  listing: z.object({
    exactCompanyNumberOnPage: z.boolean(),
    legalNameOnPage: z.boolean(),
    conflictingCompanyNumber: z.boolean(),
    negativeContext: z.boolean(),
  }),
  domain: z.object({
    linkedFromApprovedSource: z.boolean(),
    exactCompanyNumberOnSite: z.boolean(),
    legalNameOnSite: z.boolean(),
    sharedOrMarketplaceDomain: z.boolean(),
    parkedDomain: z.boolean(),
    conflictingCompanyNumber: z.boolean(),
  }),
});

function normaliseCompanyNumber(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function normaliseDomain(value: string): string {
  const candidate = value.includes("://") ? value : `https://${value}`;
  return new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
}

function appendLeodisFooter(value: string): string {
  return value.includes(leodisFooterUrl) ? value : `${value.trim()}\n\n${leodisFooterText}`;
}

function normaliseCompanyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(limited|ltd|plc|llp|cic|the)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bestCompaniesHouseMatch(
  placeName: string,
  results: CompaniesHouseSearchResult[],
): CompaniesHouseSearchResult | null {
  const target = normaliseCompanyName(placeName);
  return results.find((result) => {
    const candidate = normaliseCompanyName(result.companyName);
    return candidate === target || candidate.includes(target) || target.includes(candidate);
  }) ?? results[0] ?? null;
}

function entityTypeForCompanyType(companyType: string): EntityType {
  if (companyType === "plc") return "uk_plc";
  if (companyType === "llp") return "uk_llp";
  return "uk_limited_company";
}

function postalAddressFromGoogle(value?: string): Record<string, string> | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const postcode = value.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i)?.[0]?.toUpperCase();
  return {
    line1: parts[0] ?? value,
    town: parts.length > 2 ? parts.at(-3) ?? "" : "",
    postcode: postcode ?? "",
    formatted: value,
  };
}

function pickRoleMailbox(text: string, domain: string): string {
  const mailboxes = [...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
    .map((match) => match[0]!.toLowerCase())
    .filter((mailbox) => mailbox.endsWith(`@${domain}`));
  return mailboxes.find((mailbox) => classifyMailboxLocalPart(mailbox.split("@")[0] ?? "") === "role") ?? "";
}

async function discoverRoleMailboxFromWebsite(url: string, domain: string): Promise<string> {
  try {
    const parsed = new URL(url);
    const robotsUrl = `${parsed.origin}/robots.txt`;
    const robotsResponse = await fetch(robotsUrl, { signal: AbortSignal.timeout(5_000) });
    const robotsText = robotsResponse.ok ? await robotsResponse.text() : "";
    const collected = await collectPublicPage(url, {
      robotsText,
      maxBytes: 128_000,
      timeoutMs: 8_000,
      userAgent: "LeadGenBCTEvidenceCollector/1.0",
    });
    if (!collected.collected) return "";
    return pickRoleMailbox(sanitizeRelevantText(collected.sanitizedText), domain);
  } catch {
    return "";
  }
}

function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function normaliseOptionalCompanyNumber(value: string): string | null {
  const normalised = value.replace(/\s+/g, "").toUpperCase();
  return normalised || null;
}

function addDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function channelFlagName(channel: OutreachChannel): keyof z.infer<typeof channelPolicySchema> {
  if (channel === "corporate_email") return "corporateEmailEnabled";
  if (channel === "postal_letter") return "postalLetterEnabled";
  if (channel === "individual_email") return "individualEmailEnabled";
  return "telephoneEnabled";
}

async function getChannelPolicy(pool: DatabasePool) {
  const result = await pool.query<{ value: string }>(
    "select value from platform_settings where key = 'launch.channel_policy' limit 1",
  );
  if (!result.rows[0]) {
    return channelPolicySchema.parse({});
  }
  return channelPolicySchema.parse(JSON.parse(result.rows[0].value));
}

async function upsertJsonSetting(
  pool: DatabasePool,
  key: string,
  value: unknown,
  userId: string,
): Promise<void> {
  await pool.query(
    `insert into platform_settings (key, value, sensitive, updated_by)
     values ($1, $2, false, $3)
     on conflict (key) do update set
       value = excluded.value,
       updated_by = excluded.updated_by,
       updated_at = now()`,
    [key, JSON.stringify(value), userId],
  );
}

async function latestCharityPrincipal(pool: DatabasePool, organisationId: string) {
  const result = await pool.query<{
    id: string;
    legal_name: string;
    status: string;
    verified_at: Date | null;
    verification_expires_at: Date | null;
  }>(
    `select id, legal_name, status, verified_at, verification_expires_at
     from charity_principals
     where organisation_id = $1
     order by created_at desc limit 1`,
    [organisationId],
  );
  return result.rows[0] ?? null;
}

function sourceFieldsForProspect(input: z.infer<typeof prospectSchema>): SourceField[] {
  const fields = new Set<SourceField>([]);
  if (input.companyNumber) fields.add("company_number");
  if (input.legalName) fields.add("company_name");
  if (input.charityCommissionNumber) fields.add("charity_number");
  if (input.oscrNumber) fields.add("oscr_number");
  if (input.ccniNumber) fields.add("ccni_number");
  if (input.domain) fields.add("domain");
  if (input.mailbox) fields.add(input.mailbox.split("@")[0]?.includes(".") ? "named_mailbox" : "role_mailbox");
  if (input.postalAddress) fields.add("postal_address");
  if (input.entityType === "individual") fields.add("person_name");
  return [...fields];
}

async function requireAuth(
  pool: DatabasePool,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthContext | null> {
  const auth = await getAuthContext(pool, request);
  if (!auth) {
    await reply.code(401).send({ message: "Authentication required" });
    return null;
  }
  return auth;
}

async function requireOwner(
  pool: DatabasePool,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthContext | null> {
  const auth = await requireAuth(pool, request, reply);
  if (!auth) return null;
  if (auth.role !== "owner") {
    await reply.code(403).send({ message: "Owner access required" });
    return null;
  }
  return auth;
}

async function writeAudit(
  pool: DatabasePool,
  auth: AuthContext,
  eventType: string,
  subjectType: string,
  subjectId: string,
  payload: Record<string, unknown> = {},
) {
  await pool.query(
    `insert into audit_events
      (organisation_id, actor_id, event_type, subject_type, subject_id, payload)
     values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [auth.organisationId, auth.userId, eventType, subjectType, subjectId, JSON.stringify(payload)],
  );
}

async function writeSystemAudit(
  pool: DatabasePool,
  eventType: string,
  subjectType: string,
  subjectId: string,
  payload: Record<string, unknown> = {},
) {
  await pool.query(
    `insert into audit_events (event_type, subject_type, subject_id, payload)
     values ($1, $2, $3, $4::jsonb)`,
    [eventType, subjectType, subjectId, JSON.stringify(payload)],
  );
}

async function requireClientSourcePolicy(pool: DatabasePool): Promise<SourcePolicy | null> {
  const existing = await pool.query(
    `select id, version, source_class as "sourceClass", hostname_pattern as "hostnamePattern",
       owner, evidence_reference as "evidenceReference", enabled,
       approved_uses as "approvedUses", approved_fields as "approvedFields",
       approved_channels as "approvedChannels", retention_days as "retentionDays",
       attribution_required as "attributionRequired", prohibited_reuse as "prohibitedReuse",
       notes,
       reviewed_at as "reviewedAt", expires_at as "expiresAt"
     from source_policies
     where source_class in ('client-provided-target', 'client-provided-prospect')
       and enabled = true and expires_at > now()
     order by reviewed_at desc limit 1`,
  );
  return existing.rows[0] ? sourcePolicySchema.parse(existing.rows[0]) : null;
}

async function requireSourcePolicyByClass(pool: DatabasePool, sourceClass: string): Promise<SourcePolicy | null> {
  const existing = await pool.query(
    `select id, version, source_class as "sourceClass", hostname_pattern as "hostnamePattern",
       owner, evidence_reference as "evidenceReference", enabled,
       approved_uses as "approvedUses", approved_fields as "approvedFields",
       approved_channels as "approvedChannels", retention_days as "retentionDays",
       attribution_required as "attributionRequired", prohibited_reuse as "prohibitedReuse",
       notes,
       reviewed_at as "reviewedAt", expires_at as "expiresAt"
     from source_policies
     where source_class = $1 and enabled = true and expires_at > now()
     order by reviewed_at desc limit 1`,
    [sourceClass],
  );
  return existing.rows[0] ? sourcePolicySchema.parse(existing.rows[0]) : null;
}

async function ensureLaunchGates(pool: DatabasePool): Promise<void> {
  for (const gate of requiredLaunchGates) {
    await pool.query(
      `insert into launch_gates (key, label, description)
       values ($1, $2, $3)
       on conflict (key) do update set
         label = excluded.label,
         description = excluded.description,
         updated_at = now()`,
      [gate.key, gate.label, gate.description],
    );
  }
}

async function launchGatesComplete(pool: DatabasePool): Promise<boolean> {
  await ensureLaunchGates(pool);
  const result = await pool.query<{ incomplete: number }>(
    "select count(*)::int as incomplete from launch_gates where completed = false",
  );
  return (result.rows[0]?.incomplete ?? requiredLaunchGates.length) === 0;
}

async function campaignOwnedBy(
  pool: DatabasePool,
  campaignId: string,
  organisationId: string,
) {
  const result = await pool.query(
    `select c.*, p.verified_at as principal_verified_at,
       p.company_number as principal_company_number
     from campaigns c join campaign_principals p on p.id = c.principal_id
     where c.id = $1 and c.organisation_id = $2`,
    [campaignId, organisationId],
  );
  return result.rows[0] ?? null;
}

export function registerApiRoutes(
  app: FastifyInstance,
  pool: DatabasePool,
  environment: Environment,
) {
  app.get("/api/bootstrap", async () => {
    const [result, settings] = await Promise.all([
      pool.query<{ count: string }>("select count(*)::text as count from users"),
      getRuntimeSettings(pool, environment),
    ]);
    return {
      setupRequired: Number(result.rows[0]?.count ?? 0) === 0,
      companiesHouseConfigured: settings.companiesHouseConfigured,
      googlePlacesConfigured: settings.googlePlacesConfigured,
      productionExportsEnabled: settings.productionExportsEnabled,
      liveCollectionEnabled: settings.liveCollectionEnabled,
      liveCollectionAvailable: settings.liveCollectionAvailable,
      policyVersion,
    };
  });

  app.post("/api/setup", async (request, reply) => {
    const input = setupSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const count = await client.query<{ count: string }>("select count(*)::text as count from users");
      if (Number(count.rows[0]?.count ?? 0) > 0) {
        await client.query("rollback");
        return reply.code(409).send({ message: "Setup is already complete" });
      }
      const organisation = await client.query<{ id: string }>(
        `insert into organisations (name, approved) values ($1, true) returning id`,
        [input.organisationName],
      );
      const user = await client.query<{ id: string }>(
        `insert into users (email, password_hash) values ($1, $2) returning id`,
        [input.email.toLowerCase(), await hashPassword(input.password)],
      );
      await client.query(
        `insert into organisation_memberships (organisation_id, user_id, role)
         values ($1, $2, 'owner')`,
        [organisation.rows[0]!.id, user.rows[0]!.id],
      );
      await client.query(
        `insert into client_compliance_profiles
          (organisation_id, lawful_basis, lia_version, terms_accepted_at, approved_at)
         values ($1, 'legitimate_interests_pending_professional_review', $2, now(), now())`,
        [organisation.rows[0]!.id, policyVersion],
      );
      await client.query("commit");
      await createSession(pool, user.rows[0]!.id, reply);
      return reply.code(201).send({ ok: true });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const result = await pool.query<{ id: string; password_hash: string }>(
      "select id, password_hash from users where email = $1 limit 1",
      [input.email.toLowerCase()],
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(input.password, user.password_hash))) {
      return reply.code(401).send({ message: "Invalid email or password" });
    }
    await createSession(pool, user.id, reply);
    return { ok: true };
  });

  app.post("/api/logout", async (request, reply) => {
    await destroySession(pool, request, reply);
    return { ok: true };
  });

  app.post("/api/public/objections", async (request, reply) => {
    const input = publicMailboxSchema.parse(request.body);
    const targetHash = hashIdentifier(input.identifier);
    const existing = await pool.query<{ id: string }>(
      `select id from suppression_entries
       where scope = 'platform' and target_type = 'mailbox' and target_hash = $1 and active = true
       limit 1`,
      [targetHash],
    );
    const id = existing.rows[0]?.id ?? randomUUID();
    if (!existing.rows[0]) {
      await pool.query(
        `insert into suppression_entries
          (id, scope, target_type, target_hash, reason)
         values ($1, 'platform', 'mailbox', $2, 'public_objection')`,
        [id, targetHash],
      );
    }
    const leads = await pool.query<{ id: string }>(
      `select cl.id from campaign_leads cl join mailboxes m on m.id = cl.mailbox_id
       where lower(m.address) = lower($1)`,
      [input.identifier],
    );
    for (const lead of leads.rows) {
      await pool.query(
        `update eligibility_decisions set superseded_at = now()
         where campaign_lead_id = $1 and superseded_at is null`,
        [lead.id],
      );
      await pool.query(
        `insert into eligibility_decisions
          (campaign_lead_id, outcome, policy_version, reason_codes, evidence_ids, decided_at, expires_at)
         values ($1, 'ineligible', $2, '["SUPPRESSED"]'::jsonb, '[]'::jsonb, now(), now() + interval '30 days')`,
        [lead.id, policyVersion],
      );
    }
    await writeSystemAudit(pool, "public.objection_received", "suppression_entry", id, {
      affectedLeadCount: leads.rows.length,
    });
    return reply.code(201).send({ ok: true });
  });

  app.post("/api/public/rights-requests", async (request, reply) => {
    const input = rightsRequestSchema.parse(request.body);
    const result = await pool.query<{ id: string }>(
      `insert into rights_requests
        (request_type, requester_identifier_hash, details, due_at)
       values ($1, $2, $3, now() + interval '1 month') returning id`,
      [input.requestType, hashIdentifier(input.identifier), input.details],
    );
    await writeSystemAudit(pool, "public.rights_request_received", "rights_request", result.rows[0]!.id, {
      requestType: input.requestType,
    });
    return reply.code(201).send({ ok: true, reference: result.rows[0]!.id });
  });

  app.post("/api/public/complaints", async (request, reply) => {
    const input = complaintSchema.parse(request.body);
    const result = await pool.query<{ id: string }>(
      `insert into complaints
        (complainant_identifier_hash, details, acknowledgement_due_at)
       values ($1, $2, now() + interval '30 days') returning id`,
      [hashIdentifier(input.identifier), input.details],
    );
    await writeSystemAudit(pool, "public.complaint_received", "complaint", result.rows[0]!.id);
    return reply.code(201).send({ ok: true, reference: result.rows[0]!.id });
  });

  app.post("/api/public/do-not-contact", async (request, reply) => {
    const input = publicIdentifierSchema.parse(request.body);
    const id = randomUUID();
    await pool.query(
      `insert into suppression_entries
        (id, scope, target_type, target_hash, reason)
       values ($1, 'platform', 'person', $2, 'public_do_not_contact')`,
      [id, hashIdentifier(input.identifier)],
    );
    await writeSystemAudit(pool, "public.do_not_contact_received", "suppression_entry", id);
    return reply.code(201).send({ ok: true, reference: id });
  });

  app.post("/api/public/do-not-contact/confirm", async (request, reply) => {
    const input = doNotContactConfirmSchema.parse(request.body);
    const tokenHash = input.token ? hashIdentifier(input.token) : null;
    const codeHash = input.code ? hashIdentifier(input.code) : null;
    const identifierHash = input.identifier ? hashIdentifier(input.identifier) : null;

    const token = tokenHash || codeHash
      ? await pool.query<{
          id: string;
          organisation_id: string;
          campaign_prospect_id: string | null;
          suppression_scope: "platform" | "organisation";
        }>(
          `update do_not_contact_tokens
           set confirmed_at = coalesce(confirmed_at, now()), updated_at = now()
           where expires_at > now()
             and (($1::text is not null and token_hash = $1)
               or ($2::text is not null and printed_code_hash = $2))
           returning id, organisation_id, campaign_prospect_id, suppression_scope`,
          [tokenHash, codeHash],
        )
      : { rows: [] };

    const tokenRow = token.rows[0];
    let suppressionId = randomUUID();
    if (tokenRow?.campaign_prospect_id) {
      const prospect = await pool.query<{
        organisation_id: string;
        legal_name: string;
        company_number: string | null;
        charity_commission_number: string | null;
        mailbox: string | null;
        address_hash: string | null;
      }>(
        `select cp.organisation_id, pe.legal_name, pe.company_number,
           pe.charity_commission_number, m.address as mailbox, pa.address_hash
         from campaign_prospects cp
         join prospect_entities pe on pe.id = cp.prospect_entity_id
         left join mailboxes m on m.id = cp.mailbox_id
         left join prospect_addresses pa on pa.prospect_entity_id = pe.id
         where cp.id = $1`,
        [tokenRow.campaign_prospect_id],
      );
      const row = prospect.rows[0];
      if (row) {
        const targets = [
          ["person", hashIdentifier(row.legal_name)],
          row.company_number ? ["company", hashIdentifier(row.company_number)] : null,
          row.charity_commission_number ? ["charity", hashIdentifier(row.charity_commission_number)] : null,
          row.mailbox ? ["mailbox", hashIdentifier(row.mailbox)] : null,
          row.address_hash ? ["postal_address", row.address_hash] : null,
        ].filter(Boolean) as Array<[string, string]>;
        for (const [targetType, targetHash] of targets) {
          suppressionId = randomUUID();
          await pool.query(
            `insert into suppression_entries
              (id, organisation_id, scope, target_type, target_hash, reason)
             values ($1,$2,$3,$4,$5,'do_not_contact_confirmed')
             on conflict do nothing`,
            [
              suppressionId,
              tokenRow.suppression_scope === "organisation" ? row.organisation_id : null,
              tokenRow.suppression_scope,
              targetType,
              targetHash,
            ],
          );
        }
      }
    } else if (identifierHash) {
      await pool.query(
        `insert into suppression_entries
          (id, scope, target_type, target_hash, reason)
         values ($1, 'platform', 'person', $2, 'do_not_contact_confirmed')`,
        [suppressionId, identifierHash],
      );
    } else {
      return reply.code(404).send({ message: "Do Not Contact token or code was not found" });
    }

    await writeSystemAudit(pool, "public.do_not_contact_confirmed", "suppression_entry", suppressionId, {
      tokenId: tokenRow?.id,
    });
    return { ok: true };
  });

  app.get("/api/me", async (request, reply) => {
    const auth = await getAuthContext(pool, request);
    return reply.send(auth);
  });

  app.post("/api/account/password", async (request, reply) => {
    const auth = await requireAuth(pool, request, reply);
    if (!auth) return;
    const input = changePasswordSchema.parse(request.body);
    const result = await pool.query<{ password_hash: string }>(
      "select password_hash from users where id = $1 limit 1",
      [auth.userId],
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(input.currentPassword, user.password_hash))) {
      return reply.code(400).send({ message: "Current password is incorrect" });
    }

    await pool.query(
      "update users set password_hash = $1, updated_at = now() where id = $2",
      [await hashPassword(input.newPassword), auth.userId],
    );
    const currentToken = request.cookies[sessionCookieName];
    if (currentToken) {
      await pool.query(
        "delete from user_sessions where user_id = $1 and token_hash <> $2",
        [auth.userId, hashIdentifier(currentToken)],
      );
    }
    await writeAudit(pool, auth, "account.password_changed", "user", auth.userId);
    return { ok: true };
  });

  app.get("/api/settings/configuration", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const [settings, principal, channelPolicy] = await Promise.all([
      getRuntimeSettings(pool, environment),
      latestCharityPrincipal(pool, auth.organisationId),
      getChannelPolicy(pool),
    ]);
    return {
      companiesHouseConfigured: settings.companiesHouseConfigured,
      googlePlacesConfigured: settings.googlePlacesConfigured,
      productionExportsEnabled: settings.productionExportsEnabled,
      liveCollectionEnabled: settings.liveCollectionEnabled,
      liveCollectionAvailable: settings.liveCollectionAvailable,
      clientTargetIntakeEnabled: Boolean(await requireClientSourcePolicy(pool)),
      charityPrincipal: principal,
      channelPolicy,
    };
  });

  app.get("/api/settings/charity-principal", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const principal = await latestCharityPrincipal(pool, auth.organisationId);
    if (!principal) return { principal: null, verifications: [] };
    const verifications = await pool.query(
      `select register, register_number, outcome, register_status, source_url,
         reason_codes, retrieved_at, expires_at
       from charity_verifications
       where charity_principal_id = $1
       order by retrieved_at desc`,
      [principal.id],
    );
    return { principal, verifications: verifications.rows };
  });

  app.post("/api/settings/charity-principal/verify", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const input = charityPrincipalSchema.parse(request.body);
    const settings = await getRuntimeSettings(pool, environment);
    const expiresAt = addDays(30);
    let companyOutcome: "verified" | "review" | "quarantine" = "review";
    let companyStatus = "held";
    const reasonCodes = new Set<string>(["REGISTER_API_UNAVAILABLE"]);

    if (settings.companiesHouseApiKey) {
      const profile = await fetchCompaniesHouseProfile(
        normaliseCompanyNumber(input.companyNumber),
        settings.companiesHouseApiKey,
      );
      if (profile && profile.companyNumber === normaliseCompanyNumber(input.companyNumber) && profile.companyStatus === "active") {
        companyOutcome = "verified";
        companyStatus = profile.companyStatus;
        reasonCodes.delete("REGISTER_API_UNAVAILABLE");
      } else {
        companyOutcome = "quarantine";
        companyStatus = profile?.companyStatus ?? "not_found";
        reasonCodes.add("CHARITY_PRINCIPAL_NOT_VERIFIED");
      }
    }

    const allKnownRegistersPresent =
      input.charityCommissionNumber === "1128027" &&
      input.oscrNumber === "SC042679" &&
      normaliseCompanyNumber(input.companyNumber) === "06666946";
    const principalStatus =
      companyOutcome === "verified" && allKnownRegistersPresent
        ? "held_register_adapters_pending"
        : "quarantine";

    const client = await pool.connect();
    try {
      await client.query("begin");
      const principal = await client.query<{ id: string }>(
        `insert into charity_principals
          (organisation_id, legal_name, charity_commission_number, oscr_number,
           ccni_number, company_number, status, public_website, verified_at,
           verification_expires_at, conflict_at)
         values ($1,$2,$3,$4,nullif($5,''),$6,$7,nullif($8,''),
           case when $7 = 'verified' then now() else null end,
           $9,
           case when $7 = 'quarantine' then now() else null end)
         returning id`,
        [
          auth.organisationId,
          input.legalName,
          input.charityCommissionNumber,
          input.oscrNumber,
          input.ccniNumber,
          normaliseCompanyNumber(input.companyNumber),
          principalStatus,
          input.publicWebsite,
          expiresAt,
        ],
      );
      const principalId = principal.rows[0]!.id;
      const registerRows = [
        {
          register: "charity_commission",
          number: input.charityCommissionNumber,
          outcome: allKnownRegistersPresent ? "review" : "quarantine",
          status: "adapter_pending",
          sourceUrl: "https://register-of-charities.charitycommission.gov.uk/",
          reasons: ["REGISTER_API_UNAVAILABLE"],
        },
        {
          register: "oscr",
          number: input.oscrNumber,
          outcome: allKnownRegistersPresent ? "review" : "quarantine",
          status: "adapter_pending",
          sourceUrl: "https://www.oscr.org.uk/about-charities/search-the-register/",
          reasons: ["REGISTER_API_UNAVAILABLE"],
        },
        {
          register: "companies_house",
          number: normaliseCompanyNumber(input.companyNumber),
          outcome: companyOutcome,
          status: companyStatus,
          sourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${normaliseCompanyNumber(input.companyNumber)}`,
          reasons: [...reasonCodes],
        },
      ];
      for (const row of registerRows) {
        await client.query(
          `insert into charity_verifications
            (charity_principal_id, register, register_number, outcome, register_status,
             source_url, evidence_hash, evidence_ids, reason_codes, retrieved_at, expires_at)
           values ($1,$2,$3,$4,$5,$6,$7,'[]'::jsonb,$8::jsonb,now(),$9)`,
          [
            principalId,
            row.register,
            row.number,
            row.outcome,
            row.status,
            row.sourceUrl,
            hashIdentifier(`${row.register}:${row.number}:${input.evidenceReference}`),
            JSON.stringify(row.reasons),
            expiresAt,
          ],
        );
      }
      await client.query("commit");
      await writeAudit(pool, auth, "charity_principal.verified", "charity_principal", principalId, {
        status: principalStatus,
        evidenceReference: input.evidenceReference,
      });
      return reply.code(201).send({ id: principalId, status: principalStatus });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/api/settings/channel-policy", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    return getChannelPolicy(pool);
  });

  app.post("/api/settings/channel-policy", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const input = channelPolicySchema.parse(request.body);
    const enablingAny =
      input.corporateEmailEnabled ||
      input.postalLetterEnabled ||
      input.individualEmailEnabled ||
      input.telephoneEnabled ||
      input.letterTemplateApproved ||
      input.selfPrintFulfilmentEnabled ||
      input.providerFulfilmentEnabled;
    if (enablingAny && !input.evidenceReference) {
      return reply.code(400).send({ message: "Channel policy evidence is required before enabling channels" });
    }
    if (input.providerFulfilmentEnabled && !input.letterTemplateApproved) {
      return reply.code(400).send({ message: "Provider fulfilment requires an approved letter template manifest" });
    }
    await upsertJsonSetting(pool, "launch.channel_policy", input, auth.userId);
    await writeAudit(pool, auth, "settings.channel_policy_updated", "platform_setting", "launch.channel_policy", input);
    return { ok: true, channelPolicy: input };
  });

  app.get("/api/settings/letter-templates", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const result = await pool.query(
      `select id, version, name, subject_line, body_text, merge_fields,
         controller_identity, do_not_contact_route, approved, approved_at,
         evidence_reference, expires_at, created_at
       from letter_template_manifests
       where organisation_id = $1
       order by created_at desc`,
      [auth.organisationId],
    );
    return result.rows;
  });

  app.post("/api/settings/letter-templates", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const input = letterTemplateSchema.parse(request.body);
    if (input.expiresAt.getTime() <= Date.now()) {
      return reply.code(400).send({ message: "Template expiry must be in the future" });
    }
    const result = await pool.query<{ id: string }>(
      `insert into letter_template_manifests
        (organisation_id, version, name, subject_line, body_text, merge_fields,
         controller_identity, do_not_contact_route, approved, approved_by,
         approved_at, evidence_reference, expires_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,case when $9 then $10 else null end,
         case when $9 then now() else null end,$11,$12)
       returning id`,
      [
        auth.organisationId,
        input.version,
        input.name,
        input.subjectLine || null,
        appendLeodisFooter(input.bodyText),
        JSON.stringify(input.mergeFields),
        input.controllerIdentity,
        input.doNotContactRoute,
        input.approved,
        auth.userId,
        input.evidenceReference,
        input.expiresAt,
      ],
    );
    await writeAudit(pool, auth, "letter_template.created", "letter_template_manifest", result.rows[0]!.id, {
      approved: input.approved,
      evidenceReference: input.evidenceReference,
    });
    return reply.code(201).send({ id: result.rows[0]!.id });
  });

  app.get("/api/settings/email-templates", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const result = await pool.query(
      `select id, version, name, subject_line, body_text, merge_fields,
         controller_identity, do_not_contact_route, approved, approved_at,
         evidence_reference, expires_at, created_at
       from email_template_manifests
       where organisation_id = $1
       order by created_at desc`,
      [auth.organisationId],
    );
    return result.rows;
  });

  app.post("/api/settings/email-templates", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const input = emailTemplateSchema.parse(request.body);
    if (input.expiresAt.getTime() <= Date.now()) {
      return reply.code(400).send({ message: "Template expiry must be in the future" });
    }
    const result = await pool.query<{ id: string }>(
      `insert into email_template_manifests
        (organisation_id, version, name, subject_line, body_text, merge_fields,
         controller_identity, do_not_contact_route, approved, approved_by,
         approved_at, evidence_reference, expires_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,case when $9 then $10 else null end,
         case when $9 then now() else null end,$11,$12)
       returning id`,
      [
        auth.organisationId,
        input.version,
        input.name,
        input.subjectLine,
        appendLeodisFooter(input.bodyText),
        JSON.stringify(input.mergeFields),
        input.controllerIdentity,
        input.doNotContactRoute,
        input.approved,
        auth.userId,
        input.evidenceReference,
        input.expiresAt,
      ],
    );
    await writeAudit(pool, auth, "email_template.created", "email_template_manifest", result.rows[0]!.id, {
      approved: input.approved,
      evidenceReference: input.evidenceReference,
    });
    return reply.code(201).send({ id: result.rows[0]!.id });
  });

  app.post("/api/settings/preference-checks/import", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const input = preferenceImportSchema.parse(request.body);
    if (input.expiresAt.getTime() <= Date.now()) {
      return reply.code(400).send({ message: "Preference import expiry must be in the future" });
    }
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const identifier of input.identifiers) {
        await client.query(
          `insert into preference_service_checks
            (organisation_id, service, target_type, target_hash, matched,
             active, checked_at, expires_at, evidence_ids)
           values ($1,$2,$3,$4,true,true,now(),$5,$6::jsonb)`,
          [
            auth.organisationId,
            input.service,
            input.targetType,
            hashIdentifier(identifier),
            input.expiresAt,
            JSON.stringify([input.evidenceReference]),
          ],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    await writeAudit(pool, auth, "preference_checks.imported", "preference_service_check", input.service, {
      targetType: input.targetType,
      count: input.identifiers.length,
      evidenceReference: input.evidenceReference,
    });
    return reply.code(201).send({ imported: input.identifiers.length });
  });

  app.post("/api/settings/client-target-intake", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const input = z.object({
      enabled: z.boolean(),
      evidenceReference: z.string().trim().max(500).optional().default(""),
    }).parse(request.body);
    if (input.enabled && !input.evidenceReference) {
      return reply.code(400).send({ message: "A provenance/policy evidence reference is required" });
    }
    await pool.query(
      `update source_policies set enabled = false, updated_at = now()
       where source_class = 'client-provided-target'`,
    );
    if (input.enabled) {
      await pool.query(
        `insert into source_policies
          (version, source_class, owner, evidence_reference, enabled, approved_uses,
           approved_fields, approved_channels, retention_days, attribution_required,
           prohibited_reuse, notes, reviewed_at, expires_at)
         values ($1, 'client-provided-target', $2, $3, true, $4::jsonb, $5::jsonb,
           $6::jsonb, 365, true, '[]'::jsonb, null, now(), now() + interval '1 year')`,
        [
          `${policyVersion}:${input.evidenceReference}`,
          auth.email,
          input.evidenceReference,
          JSON.stringify(["campaign_targeting", "verification"]),
          JSON.stringify(["company_number", "company_name", "domain", "role_mailbox"]),
          JSON.stringify(["corporate_email"]),
        ],
      );
    }
    await writeAudit(pool, auth, "source_policy.client_target_intake_updated", "source_policy", "client-provided-target", {
      enabled: input.enabled,
      evidenceReference: input.evidenceReference,
    });
    return { ok: true, enabled: input.enabled };
  });

  app.get("/api/settings/source-policies", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const result = await pool.query(
      `select id, version, source_class, hostname_pattern, owner, evidence_reference,
         enabled, approved_uses, approved_fields, approved_channels, retention_days,
         attribution_required, prohibited_reuse, notes, rate_limit, volume_limit,
         reviewed_at, expires_at, created_at
       from source_policies order by created_at desc limit 100`,
    );
    return result.rows;
  });

  app.post("/api/settings/source-policies", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const input = sourcePolicyAdminSchema.parse(request.body);
    if (input.expiresAt.getTime() <= Date.now()) {
      return reply.code(400).send({ message: "Source policy expiry must be in the future" });
    }
    const result = await pool.query<{ id: string }>(
      `insert into source_policies
        (version, source_class, hostname_pattern, owner, evidence_reference, enabled,
         approved_uses, approved_fields, approved_channels, retention_days,
         attribution_required, prohibited_reuse, notes, rate_limit, volume_limit,
         reviewed_at, expires_at)
       values ($1,$2,$3,$4,$5,true,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11::jsonb,$12,$13,$14,now(),$15)
       returning id`,
      [
        `${policyVersion}:${Date.now()}`,
        input.sourceClass,
        input.hostnamePattern ? input.hostnamePattern.toLowerCase() : null,
        input.owner,
        input.evidenceReference,
        JSON.stringify(input.approvedUses),
        JSON.stringify(input.approvedFields),
        JSON.stringify(input.approvedChannels),
        input.retentionDays,
        input.attributionRequired,
        JSON.stringify(input.prohibitedReuse),
        input.notes || null,
        input.rateLimit,
        input.volumeLimit,
        input.expiresAt,
      ],
    );
    await writeAudit(pool, auth, "source_policy.created", "source_policy", result.rows[0]!.id, {
      sourceClass: input.sourceClass,
      hostnamePattern: input.hostnamePattern,
      evidenceReference: input.evidenceReference,
    });
    return reply.code(201).send({ id: result.rows[0]!.id });
  });

  app.post("/api/settings/source-policies/:id/disable", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const result = await pool.query(
      "update source_policies set enabled = false, updated_at = now() where id = $1 and enabled = true returning id",
      [id],
    );
    if (!result.rows[0]) return reply.code(404).send({ message: "Enabled source policy not found" });
    await writeAudit(pool, auth, "source_policy.disabled", "source_policy", id);
    return { ok: true };
  });

  app.post("/api/settings/companies-house", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const input = companiesHouseSettingsSchema.parse(request.body);
    await setCompaniesHouseApiKey(pool, environment, auth.userId, input.apiKey);
    await writeAudit(pool, auth, "settings.companies_house_updated", "platform_setting", "companies_house", {
      configured: Boolean(input.apiKey),
    });
    return { ok: true, configured: Boolean(input.apiKey) };
  });

	  app.post("/api/settings/companies-house/test", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const input = companiesHouseSettingsSchema.parse(request.body);
    const settings = await getRuntimeSettings(pool, environment);
    const apiKey = input.apiKey || settings.companiesHouseApiKey;
    if (!apiKey) return reply.code(400).send({ message: "Enter or save an API key first" });
    try {
      const profile = await fetchCompaniesHouseProfile("00000006", apiKey);
      if (!profile) return reply.code(400).send({ message: "Companies House key could not be verified" });
      return { ok: true, companyName: profile.companyName };
    } catch {
      return reply.code(400).send({ message: "Companies House rejected the API key" });
    }
	  });

  app.post("/api/settings/google-places", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const input = googlePlacesSettingsSchema.parse(request.body);
    await setGooglePlacesApiKey(pool, environment, auth.userId, input.apiKey);
    await writeAudit(pool, auth, "settings.google_places_updated", "platform_setting", "google_places", {
      configured: Boolean(input.apiKey),
    });
    return { ok: true, configured: Boolean(input.apiKey) };
  });

  app.post("/api/settings/google-places/test", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const input = googlePlacesSettingsSchema.parse(request.body);
    const settings = await getRuntimeSettings(pool, environment);
    const apiKey = input.apiKey || settings.googlePlacesApiKey;
    if (!apiKey) return reply.code(400).send({ message: "Enter or save a Google Places API key first" });
    try {
      const places = await searchGooglePlacesText({ query: "charity", location: "Leeds", maxResults: 1 }, apiKey);
      return { ok: true, sample: places[0]?.name ?? "No sample results returned" };
    } catch {
      return reply.code(400).send({ message: "Google Places rejected the API key" });
    }
  });

	  app.post("/api/settings/launch", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const input = launchSettingsSchema.parse(request.body);
    const current = await getRuntimeSettings(pool, environment);
    if (input.productionExportsEnabled && !(await launchGatesComplete(pool))) {
      return reply.code(409).send({
        message: "Every mandatory launch gate must be completed before production exports can be enabled",
      });
    }
    if (
      input.productionExportsEnabled &&
      !current.productionExportsEnabled &&
      input.confirmation !== "ENABLE PRODUCTION EXPORTS"
    ) {
      return reply.code(400).send({ message: "Type ENABLE PRODUCTION EXPORTS to confirm" });
    }
    await setProductionExportsEnabled(pool, auth.userId, input.productionExportsEnabled);
    await writeAudit(pool, auth, "settings.production_exports_updated", "platform_setting", "production_exports", {
      enabled: input.productionExportsEnabled,
    });
    return { ok: true, productionExportsEnabled: input.productionExportsEnabled };
  });

  app.get("/api/settings/launch-gates", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    await ensureLaunchGates(pool);
    const result = await pool.query(
      `select key, label, description, completed, evidence_reference, completed_at
       from launch_gates order by created_at`,
    );
    return result.rows;
  });

  app.post("/api/settings/launch-gates/:key", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const { key } = request.params as { key: string };
    const input = launchGateSchema.parse(request.body);
    if (!requiredLaunchGates.some((gate) => gate.key === key)) {
      return reply.code(404).send({ message: "Launch gate not found" });
    }
    if (input.completed && !input.evidenceReference) {
      return reply.code(400).send({ message: "An evidence reference is required to complete a launch gate" });
    }
    await ensureLaunchGates(pool);
    await pool.query(
      `update launch_gates set
         completed = $1,
         evidence_reference = nullif($2, ''),
         completed_by = case when $1 then $3 else null end,
         completed_at = case when $1 then now() else null end,
         updated_at = now()
       where key = $4`,
      [input.completed, input.evidenceReference, auth.userId, key],
    );
    if (!input.completed) {
      await setProductionExportsEnabled(pool, auth.userId, false);
    }
    await writeAudit(pool, auth, "launch_gate.updated", "launch_gate", key, {
      completed: input.completed,
      evidenceReference: input.evidenceReference,
    });
    return { ok: true };
  });

  app.get("/api/dashboard", async (request, reply) => {
    const auth = await requireAuth(pool, request, reply);
    if (!auth) return;
    const [stats, campaigns, activity, settings] = await Promise.all([
      pool.query(
        `select
          (select count(*) from campaigns where organisation_id = $1 and status not in ('cancelled','expired'))::int as active_campaigns,
          (select count(*) from campaign_leads where organisation_id = $1)::int as total_leads,
          (select count(*) from campaign_leads cl
            join lateral (
              select outcome from eligibility_decisions ed
              where ed.campaign_lead_id = cl.id and ed.superseded_at is null
              order by ed.decided_at desc limit 1
            ) d on true
            where cl.organisation_id = $1 and d.outcome = 'eligible')::int as eligible_leads,
          (select count(*) from suppression_entries
            where (organisation_id = $1 or scope = 'platform') and active = true)::int as suppressed`,
        [auth.organisationId],
      ),
      pool.query(
        `select c.id, c.name, c.status, c.target_industry, c.target_location, c.created_at,
          count(cl.id)::int as lead_count
         from campaigns c left join campaign_leads cl on cl.campaign_id = c.id
         where c.organisation_id = $1
         group by c.id order by c.created_at desc limit 8`,
        [auth.organisationId],
      ),
      pool.query(
        `select event_type, subject_type, subject_id, occurred_at
         from audit_events where organisation_id = $1
         order by occurred_at desc limit 8`,
        [auth.organisationId],
      ),
      getRuntimeSettings(pool, environment),
    ]);
    return {
      stats: stats.rows[0],
      campaigns: campaigns.rows,
      activity: activity.rows,
      capabilities: {
        companiesHouseConfigured: settings.companiesHouseConfigured,
        exportsEnabled: settings.productionExportsEnabled,
        collectionEnabled: settings.liveCollectionEnabled,
      },
    };
  });

  app.get("/api/campaigns", async (request, reply) => {
    const auth = await requireAuth(pool, request, reply);
    if (!auth) return;
    const result = await pool.query(
      `select c.*, count(cl.id)::int as lead_count
       from campaigns c left join campaign_leads cl on cl.campaign_id = c.id
       where c.organisation_id = $1 group by c.id order by c.created_at desc`,
      [auth.organisationId],
    );
    return result.rows;
  });

  app.post("/api/campaigns", async (request, reply) => {
    const auth = await requireAuth(pool, request, reply);
    if (!auth) return;
    const input = campaignSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const principal = await client.query<{ id: string }>(
        `insert into campaign_principals
          (organisation_id, legal_name, company_number, intended_sender)
         values ($1, $2, $3, $4) returning id`,
        [
          auth.organisationId,
          input.principalLegalName,
          normaliseCompanyNumber(input.principalCompanyNumber),
          input.intendedSender.toLowerCase(),
        ],
      );
      const campaign = await client.query<{ id: string }>(
        `insert into campaigns
          (organisation_id, principal_id, name, purpose, target_industry, target_location,
           max_leads, status, expires_at)
         values ($1,$2,$3,$4,$5,$6,$7,'pending_approval',now() + interval '90 days')
         returning id`,
        [
          auth.organisationId,
          principal.rows[0]!.id,
          input.name,
          input.purpose,
          input.targetIndustry,
          input.targetLocation,
          input.maxLeads,
        ],
      );
      await client.query(
        `insert into campaign_attestations (campaign_id, user_id, version, statement)
         values ($1, $2, $3, $4)`,
        [
          campaign.rows[0]!.id,
          auth.userId,
          policyVersion,
          "I confirm this campaign is for relevant corporate B2B outreach and objections will be honoured.",
        ],
      );
      await client.query("commit");
      await writeAudit(pool, auth, "campaign.created", "campaign", campaign.rows[0]!.id);
      return reply.code(201).send({ id: campaign.rows[0]!.id });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/campaigns/:id/approve", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const campaign = await campaignOwnedBy(pool, id, auth.organisationId);
    if (!campaign) return reply.code(404).send({ message: "Campaign not found" });
    const settings = await getRuntimeSettings(pool, environment);
    if (!settings.companiesHouseApiKey) {
      return reply.code(409).send({ message: "Configure Companies House before approving a campaign" });
    }
    const profile = await fetchCompaniesHouseProfile(
      campaign.principal_company_number as string,
      settings.companiesHouseApiKey,
    );
    if (!profile || !isSupportedActiveCompany(profile)) {
      return reply.code(409).send({ message: "Campaign principal is not a supported active company" });
    }
    await pool.query(
      `update campaign_principals set verified_at = now(), updated_at = now()
       where id = $1 and organisation_id = $2`,
      [campaign.principal_id, auth.organisationId],
    );
    await pool.query(
      `update campaigns set status = 'approved', updated_at = now()
       where id = $1 and organisation_id = $2`,
      [id, auth.organisationId],
    );
    await writeAudit(pool, auth, "campaign.approved", "campaign", id, {
      principalCompanyNumber: profile.companyNumber,
    });
    return { ok: true };
  });

  app.get("/api/campaigns/:id", async (request, reply) => {
    const auth = await requireAuth(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const campaign = await campaignOwnedBy(pool, id, auth.organisationId);
    if (!campaign) return reply.code(404).send({ message: "Campaign not found" });
    const leads = await pool.query(
      `select cl.id, co.company_number, co.legal_name, co.company_status, co.company_type,
         d.registrable_domain, m.address, m.mailbox_type,
         ed.outcome, ed.reason_codes, ed.decided_at
       from campaign_leads cl
       join companies co on co.id = cl.company_id
       join domains d on d.id = cl.domain_id
       join mailboxes m on m.id = cl.mailbox_id
       left join lateral (
         select outcome, reason_codes, decided_at from eligibility_decisions
         where campaign_lead_id = cl.id and superseded_at is null
         order by decided_at desc limit 1
       ) ed on true
       where cl.campaign_id = $1 and cl.organisation_id = $2
       order by cl.created_at desc`,
      [id, auth.organisationId],
    );
    return { campaign, leads: leads.rows };
  });

  app.post("/api/campaigns/:id/targets", async (request, reply) => {
    const auth = await requireAuth(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const campaign = await campaignOwnedBy(pool, id, auth.organisationId);
    if (!campaign) return reply.code(404).send({ message: "Campaign not found" });
    const input = targetSchema.parse(request.body);
    const companyNumber = normaliseCompanyNumber(input.companyNumber);
    const domain = normaliseDomain(input.domain);
    const mailbox = input.mailbox.trim().toLowerCase();
    if (mailbox.split("@")[1] !== domain) {
      return reply.code(400).send({ message: "Mailbox must use the supplied company domain" });
    }
    const sourcePolicy = await requireClientSourcePolicy(pool);
    if (!sourcePolicy) {
      return reply.code(409).send({
        message: "Client-provided target intake is disabled until its source policy is explicitly approved",
      });
    }
    const authorization = authorizeCollection({
      policy: sourcePolicy,
      hostname: "client-provided-target",
      requestedFields: ["company_number", "company_name", "domain", "role_mailbox"],
      purpose: "campaign_targeting",
      now: new Date(),
      clientSuspended: !auth.organisationApproved,
      campaignSuspended: campaign.status === "suspended",
    });
    if (!authorization.allowed) {
      return reply.code(409).send({
        message: "Client-provided target intake was denied by source policy",
        reasonCodes: authorization.reasonCodes,
      });
    }
    const sourcePolicyId = authorization.policyId;
    const settings = await getRuntimeSettings(pool, environment);
    const profile = await fetchCompaniesHouseProfile(
      companyNumber,
      settings.companiesHouseApiKey,
    );
    const companyVerified = profile ? isSupportedActiveCompany(profile) : false;
    const entityType: EntityType = profile?.companyType === "llp"
      ? "uk_llp"
      : companyVerified
        ? "uk_limited_company"
        : "unsupported";
    const mailboxType: MailboxType =
      classifyMailboxLocalPart(mailbox.split("@")[0] ?? "") === "role" ? "role" : "unknown";
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const company = await client.query<{ id: string }>(
        `insert into companies
          (company_number, legal_name, entity_type, company_status, company_type,
           registered_address, sic_codes, verified_source)
         values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
         on conflict (company_number) do update set
           legal_name = excluded.legal_name,
           entity_type = excluded.entity_type,
           company_status = excluded.company_status,
           company_type = excluded.company_type,
           registered_address = excluded.registered_address,
           sic_codes = excluded.sic_codes,
           verified_source = excluded.verified_source,
           updated_at = now()
         returning id`,
        [
          companyNumber,
          profile?.companyName ?? input.companyName,
          entityType,
          profile?.companyStatus ?? "unverified",
          profile?.companyType ?? "unknown",
          JSON.stringify(profile?.registeredAddress ?? {}),
          JSON.stringify(profile?.sicCodes ?? []),
          profile ? "companies_house_api" : "client_provided_unverified",
        ],
      );
      const source = await client.query<{ id: string }>(
        `insert into source_records
          (source_policy_id, source_url, field_name, field_value_hash, retrieved_at)
         values ($1, $2, 'target_bundle', $3, now()) returning id`,
        [sourcePolicyId, `client-import://${auth.organisationId}/${id}`, hashIdentifier(`${companyNumber}|${domain}|${mailbox}`)],
      );
      const listing = await client.query<{ id: string }>(
        `insert into business_listings (source_record_id, business_name, website_url)
         values ($1,$2,$3) returning id`,
        [source.rows[0]!.id, input.companyName, `https://${domain}`],
      );
      const companyId = company.rows[0]!.id;
      await client.query(
        `insert into company_verifications
          (company_id, outcome, policy_version, evidence_ids, reason_codes, verified_at, expires_at)
         values ($1,$2,$3,$4::jsonb,$5::jsonb,now(),$6)`,
        [
          companyId,
          companyVerified ? "verified" : "quarantine",
          policyVersion,
          JSON.stringify([source.rows[0]!.id]),
          JSON.stringify(companyVerified ? [] : ["COMPANIES_HOUSE_KEY_OR_VERIFICATION_REQUIRED"]),
          expiresAt,
        ],
      );
      await client.query(
        `insert into listing_matches
          (business_listing_id, company_id, outcome, policy_version, evidence_ids, reason_codes, verified_at, expires_at)
         values ($1,$2,'review',$3,$4::jsonb,$5::jsonb,now(),$6)`,
        [
          listing.rows[0]!.id,
          companyId,
          policyVersion,
          JSON.stringify([source.rows[0]!.id]),
          JSON.stringify(["LISTING_MATCH_REQUIRES_DETERMINISTIC_EVIDENCE"]),
          expiresAt,
        ],
      );
      const domainRow = await client.query<{ id: string }>(
        `insert into domains (registrable_domain) values ($1)
         on conflict (registrable_domain) do update set updated_at = now() returning id`,
        [domain],
      );
      await client.query(
        `insert into domain_verifications
          (company_id, domain_id, outcome, policy_version, evidence_ids, reason_codes, verified_at, expires_at)
         values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,now(),$7)`,
        [
          companyId,
          domainRow.rows[0]!.id,
          "review",
          policyVersion,
          JSON.stringify([source.rows[0]!.id]),
          JSON.stringify([
            input.domainConfirmed
              ? "DOMAIN_REVIEW_RECORDED_NOT_VERIFIED"
              : "DOMAIN_CONFIRMATION_REQUIRED",
          ]),
          expiresAt,
        ],
      );
      const mailboxRow = await client.query<{ id: string }>(
        `insert into mailboxes (domain_id, address, local_part, mailbox_type)
         values ($1,$2,$3,$4)
         on conflict (address) do update set mailbox_type = excluded.mailbox_type, updated_at = now()
         returning id`,
        [domainRow.rows[0]!.id, mailbox, mailbox.split("@")[0], mailboxType],
      );
      await client.query(
        `insert into mailbox_assessments
          (mailbox_id, outcome, mailbox_type, policy_version, evidence_ids, reason_codes, assessed_at, expires_at)
         values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,now(),$7)`,
        [
          mailboxRow.rows[0]!.id,
          mailboxType === "role" ? "verified" : "quarantine",
          mailboxType,
          policyVersion,
          JSON.stringify([source.rows[0]!.id]),
          JSON.stringify(mailboxType === "role" ? [] : ["MAILBOX_NOT_ROLE_BASED"]),
          expiresAt,
        ],
      );
      const lead = await client.query<{ id: string }>(
        `insert into campaign_leads
          (organisation_id, campaign_id, company_id, domain_id, mailbox_id)
         values ($1,$2,$3,$4,$5)
         on conflict (campaign_id, mailbox_id) do update set updated_at = now()
         returning id`,
        [auth.organisationId, id, companyId, domainRow.rows[0]!.id, mailboxRow.rows[0]!.id],
      );
      const suppressions = await client.query<{ id: string; scope: "platform" | "organisation"; target_type: "company" | "domain" | "mailbox" | "person" | "phone"; active: boolean }>(
        `select id, scope, target_type, active from suppression_entries
         where active = true and (scope = 'platform' or organisation_id = $1)
         and ((target_type = 'company' and target_hash = $2)
           or (target_type = 'domain' and target_hash = $3)
           or (target_type = 'mailbox' and target_hash = $4))`,
        [auth.organisationId, hashIdentifier(companyNumber), hashIdentifier(domain), hashIdentifier(mailbox)],
      );
      const decision = evaluateEligibility({
        now: new Date(),
        clientApproved: auth.organisationApproved,
        campaignApproved: campaign.status === "approved",
        campaignPrincipalVerified: Boolean(campaign.principal_verified_at),
        entityType,
        companyVerification: { verified: companyVerified, expiresAt },
        listingMatch: { verified: false, expiresAt },
        domainMatch: { verified: false, expiresAt },
        mailboxAssessment: { type: mailboxType, mailboxDomain: domain, verifiedDomain: domain, expiresAt },
        sourcesApproved: true,
        transparencyRecorded: true,
        suppressions: suppressions.rows.map((row) => ({
          id: row.id,
          scope: row.scope,
          targetType: row.target_type,
          active: row.active,
        })),
      });
      await client.query(
        `update eligibility_decisions set superseded_at = now()
         where campaign_lead_id = $1 and superseded_at is null`,
        [lead.rows[0]!.id],
      );
      await client.query(
        `insert into eligibility_decisions
          (campaign_lead_id, outcome, policy_version, reason_codes, evidence_ids, decided_at, expires_at)
         values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`,
        [
          lead.rows[0]!.id,
          decision.eligible ? "eligible" : "ineligible",
          decision.policyVersion,
          JSON.stringify(decision.reasonCodes),
          JSON.stringify([source.rows[0]!.id]),
          decision.decidedAt,
          expiresAt,
        ],
      );
      await client.query(
        `insert into manual_reviews
          (organisation_id, subject_type, subject_id, reason_codes, evidence_ids)
         values ($1, 'campaign_lead_verification', $2, $3::jsonb, $4::jsonb)
         on conflict do nothing`,
        [
          auth.organisationId,
          lead.rows[0]!.id,
          JSON.stringify(["LISTING_MATCH_REQUIRES_DETERMINISTIC_EVIDENCE", "DOMAIN_REQUIRES_DETERMINISTIC_EVIDENCE"]),
          JSON.stringify([source.rows[0]!.id]),
        ],
      );
      await client.query(
        `insert into job_runs
          (organisation_id, queue_name, job_name, idempotency_key, status, trace_id, payload, max_attempts)
         values ($1, 'verification', 'review_campaign_lead', $2, 'queued', $3, $4::jsonb, 3)
         on conflict (queue_name, idempotency_key) do nothing`,
        [
          auth.organisationId,
          `review:${lead.rows[0]!.id}:${policyVersion}`,
          randomUUID(),
          JSON.stringify({ campaignLeadId: lead.rows[0]!.id }),
        ],
      );
      await client.query("commit");
      await writeAudit(pool, auth, "lead.assessed", "campaign_lead", lead.rows[0]!.id, {
        eligible: decision.eligible,
        reasonCodes: decision.reasonCodes,
      });
      return reply.code(201).send({ id: lead.rows[0]!.id, decision });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

	  app.post("/api/campaigns/:id/prospects", async (request, reply) => {
    const auth = await requireAuth(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const campaign = await campaignOwnedBy(pool, id, auth.organisationId);
    if (!campaign) return reply.code(404).send({ message: "Campaign not found" });
    const input = prospectSchema.parse(request.body);
    const channelPolicy = await getChannelPolicy(pool);
    const sourcePolicy = await requireClientSourcePolicy(pool);
    if (!sourcePolicy) {
      return reply.code(409).send({
        message: "Prospect intake is disabled until a client-provided prospect source policy is approved",
      });
    }

    const requestedFields = sourceFieldsForProspect(input);
    const authorization = authorizeCollection({
      policy: sourcePolicy,
      hostname: sourcePolicy.hostnamePattern ?? "client-provided-prospect",
      requestedFields,
      purpose: input.channel === "postal_letter" ? "postal_fundraising" : "campaign_targeting",
      now: new Date(),
      clientSuspended: !auth.organisationApproved,
      campaignSuspended: campaign.status === "suspended",
    });
    if (!authorization.allowed) {
      return reply.code(409).send({
        message: "Prospect intake was denied by source policy",
        reasonCodes: authorization.reasonCodes,
      });
    }

    const principal = await latestCharityPrincipal(pool, auth.organisationId);
    const principalVerified = Boolean(
      principal?.status === "verified" &&
      principal.verification_expires_at &&
      principal.verification_expires_at.getTime() > Date.now(),
    );
    const principalHeld = Boolean(principal?.status?.startsWith("held_"));
    const channelApproved = Boolean(channelPolicy[channelFlagName(input.channel)]);
    const expiresAt = addDays(Math.min(sourcePolicy.retentionDays, 365));
    const domain = input.domain ? normaliseDomain(input.domain) : "";
    const mailbox = input.mailbox ? input.mailbox.trim().toLowerCase() : "";
    if (mailbox && domain && mailbox.split("@")[1] !== domain) {
      return reply.code(400).send({ message: "Mailbox must use the supplied domain" });
    }
    const mailboxType: MailboxType =
      mailbox && classifyMailboxLocalPart(mailbox.split("@")[0] ?? "") === "role"
        ? "role"
        : mailbox
          ? "named_person"
          : "unknown";

    const client = await pool.connect();
    try {
      await client.query("begin");
      const source = await client.query<{ id: string }>(
        `insert into source_records
          (source_policy_id, source_url, field_name, field_value_hash, retrieved_at)
         values ($1, $2, 'prospect_bundle', $3, now()) returning id`,
        [
          authorization.policyId,
          input.sourceUrl || `client-prospect://${auth.organisationId}/${id}`,
          hashIdentifier(JSON.stringify({
            legalName: input.legalName,
            companyNumber: input.companyNumber,
            charityNumber: input.charityCommissionNumber,
            domain,
            mailbox,
            postalAddress: input.postalAddress,
          })),
        ],
      );
      const sourceRecordId = source.rows[0]!.id;
      const entity = await client.query<{ id: string }>(
        `insert into prospect_entities
          (organisation_id, entity_type, legal_name, trading_name, company_number,
           charity_commission_number, oscr_number, ccni_number, status, source_record_id,
           verified_at, expires_at)
         values ($1,$2,$3,nullif($4,''),$5,nullif($6,''),nullif($7,''),nullif($8,''),
           $9,$10,case when $9 = 'verified' then now() else null end,$11)
         returning id`,
        [
          auth.organisationId,
          input.entityType,
          input.legalName,
          input.tradingName,
          normaliseOptionalCompanyNumber(input.companyNumber),
          input.charityCommissionNumber,
          input.oscrNumber,
          input.ccniNumber,
          ["uk_limited_company", "uk_plc", "uk_llp"].includes(input.entityType) && input.companyNumber
            ? "verified_pending_recheck"
            : input.entityType === "registered_charity" && input.charityCommissionNumber
              ? "verified_pending_recheck"
              : "unverified",
          sourceRecordId,
          expiresAt,
        ],
      );
      const entityId = entity.rows[0]!.id;

      let domainId: string | null = null;
      let mailboxId: string | null = null;
      if (domain) {
        const domainRow = await client.query<{ id: string }>(
          `insert into domains (registrable_domain) values ($1)
           on conflict (registrable_domain) do update set updated_at = now() returning id`,
          [domain],
        );
        domainId = domainRow.rows[0]!.id;
      }
      if (mailbox && domainId) {
        const mailboxRow = await client.query<{ id: string }>(
          `insert into mailboxes (domain_id, address, local_part, mailbox_type)
           values ($1,$2,$3,$4)
           on conflict (address) do update set mailbox_type = excluded.mailbox_type, updated_at = now()
           returning id`,
          [domainId, mailbox, mailbox.split("@")[0], mailboxType],
        );
        mailboxId = mailboxRow.rows[0]!.id;
      }

      const campaignProspect = await client.query<{ id: string }>(
        `insert into campaign_prospects
          (organisation_id, campaign_id, prospect_entity_id, domain_id, mailbox_id, source_record_id)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (campaign_id, prospect_entity_id) do update set
           domain_id = excluded.domain_id,
           mailbox_id = excluded.mailbox_id,
           source_record_id = excluded.source_record_id,
           updated_at = now()
         returning id`,
        [auth.organisationId, id, entityId, domainId, mailboxId, sourceRecordId],
      );
      const campaignProspectId = campaignProspect.rows[0]!.id;

      let addressAssessment = null as null | {
        verified: boolean;
        expiresAt: Date | null;
        sourceApproved: boolean;
        addressContext: "business" | "registered_office" | "likely_home" | "unknown";
        publicContextApproved: boolean;
        sensitiveTargetingRisk: boolean;
      };
      if (input.postalAddress) {
        const addressHash = input.postalAddressHash || hashIdentifier(JSON.stringify(input.postalAddress));
        const address = await client.query<{ id: string }>(
          `insert into prospect_addresses
            (organisation_id, prospect_entity_id, source_record_id, address_hash, address,
             address_context, retrieved_at, expires_at)
           values ($1,$2,$3,$4,$5::jsonb,$6,now(),$7)
           returning id`,
          [
            auth.organisationId,
            entityId,
            sourceRecordId,
            addressHash,
            JSON.stringify(input.postalAddress),
            input.addressContext,
            expiresAt,
          ],
        );
        const postalOutcome = input.addressSourceApproved ? "verified" : "review";
        await client.query(
          `insert into postal_address_assessments
            (prospect_address_id, outcome, policy_version, source_approved,
             public_context_approved, sensitive_targeting_risk, reason_codes,
             evidence_ids, assessed_at, expires_at)
           values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,now(),$9)`,
          [
            address.rows[0]!.id,
            postalOutcome,
            policyVersion,
            input.addressSourceApproved,
            input.publicContextApproved,
            input.sensitiveTargetingRisk,
            JSON.stringify(input.addressSourceApproved ? [] : ["POSTAL_ADDRESS_SOURCE_NOT_APPROVED"]),
            JSON.stringify([sourceRecordId]),
            expiresAt,
          ],
        );
        addressAssessment = {
          verified: input.addressSourceApproved,
          expiresAt,
          sourceApproved: input.addressSourceApproved,
          addressContext: input.addressContext,
          publicContextApproved: input.publicContextApproved,
          sensitiveTargetingRisk: input.sensitiveTargetingRisk,
        };
      }

      const suppressionRows = await client.query<{
        id: string;
        scope: "platform" | "organisation";
        target_type: "company" | "domain" | "mailbox" | "person" | "phone" | "postal_address" | "charity";
        active: boolean;
      }>(
        `select id, scope, target_type, active from suppression_entries
         where active = true and (scope = 'platform' or organisation_id = $1)
           and ((target_type = 'company' and target_hash = $2)
             or (target_type = 'charity' and target_hash = $3)
             or (target_type = 'domain' and target_hash = $4)
             or (target_type = 'mailbox' and target_hash = $5)
             or (target_type = 'postal_address' and target_hash = $6)
             or (target_type = 'person' and target_hash = $7))`,
        [
          auth.organisationId,
          hashIdentifier(input.companyNumber || input.legalName),
          hashIdentifier(input.charityCommissionNumber || input.legalName),
          domain ? hashIdentifier(domain) : "",
          mailbox ? hashIdentifier(mailbox) : "",
          input.postalAddress ? hashIdentifier(input.postalAddressHash || JSON.stringify(input.postalAddress)) : "",
          hashIdentifier(input.legalName),
        ],
      );
      const preferenceRows = await client.query<{
        service: "fps" | "mps" | "internal" | "other";
        matched: boolean;
        active: boolean;
      }>(
        `select service, matched, active from preference_service_checks
         where active = true and organisation_id = $1
           and (prospect_entity_id = $2 or target_hash = any($3::text[]))`,
        [
          auth.organisationId,
          entityId,
          [
            hashIdentifier(input.companyNumber || input.legalName),
            hashIdentifier(input.charityCommissionNumber || input.legalName),
            input.postalAddress ? hashIdentifier(input.postalAddressHash || JSON.stringify(input.postalAddress)) : "",
          ],
        ],
      );

      const decision = evaluateOutreachChannel({
        now: new Date(),
        channel: input.channel,
        charityPrincipal: principal
          ? { verified: principalVerified, expiresAt: principal.verification_expires_at }
          : null,
        campaignApproved: campaign.status === "approved",
        channelApproved,
        recipientEntity: {
          entityType: input.entityType,
          verified: ["verified", "verified_pending_recheck"].includes(
            input.companyNumber || input.charityCommissionNumber ? "verified_pending_recheck" : "unverified",
          ),
          expiresAt,
        },
        domainMatch: domain ? { verified: Boolean(domain), expiresAt } : null,
        mailboxAssessment: mailbox ? {
          type: mailboxType,
          mailboxDomain: mailbox.split("@")[1] ?? "",
          verifiedDomain: domain,
          expiresAt,
        } : null,
        postalAddressAssessment: addressAssessment,
        sourcesApproved: true,
        lawfulBasisRecorded: input.lawfulBasisRecorded,
        transparencyRecorded: input.transparencyRecorded,
        letterTemplateApproved: channelPolicy.letterTemplateApproved,
        consentRecorded: input.consentRecorded,
        preferenceChecks: preferenceRows.rows,
        suppressions: suppressionRows.rows.map((row) => ({
          id: row.id,
          scope: row.scope,
          targetType: row.target_type,
          active: row.active,
        })),
      });
      let outcome: OutreachDecisionOutcome = decision.outcome;
      let reasonCodes: EligibilityReasonCode[] = decision.reasonCodes;
      if (principalHeld && !reasonCodes.includes("SUPPRESSED")) {
        outcome = "held";
        reasonCodes = [...new Set<EligibilityReasonCode>([
          ...reasonCodes,
          "REGISTER_API_UNAVAILABLE",
        ])];
      }

      const decisionRow = await client.query<{ id: string }>(
        `insert into outreach_channel_decisions
          (campaign_prospect_id, channel, outcome, policy_version, reason_codes,
           evidence_ids, decided_at, expires_at)
         values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)
         returning id`,
        [
          campaignProspectId,
          input.channel,
          outcome,
          decision.policyVersion,
          JSON.stringify(reasonCodes),
          JSON.stringify([sourceRecordId]),
          decision.decidedAt,
          expiresAt,
        ],
      );

      if (outcome === "review" || outcome === "held") {
        await client.query(
          `insert into manual_reviews
            (organisation_id, subject_type, subject_id, reason_codes, evidence_ids)
           values ($1, 'campaign_prospect_channel_decision', $2, $3::jsonb, $4::jsonb)
           on conflict do nothing`,
          [auth.organisationId, decisionRow.rows[0]!.id, JSON.stringify(reasonCodes), JSON.stringify([sourceRecordId])],
        );
      }

      await client.query("commit");
      await writeAudit(pool, auth, "prospect.assessed", "campaign_prospect", campaignProspectId, {
        channel: input.channel,
        outcome,
        reasonCodes,
      });
      return reply.code(201).send({
        id: campaignProspectId,
        decisionId: decisionRow.rows[0]!.id,
        decision: { ...decision, outcome, reasonCodes },
      });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
	  });

  app.post("/api/campaigns/:id/discover-google", async (request, reply) => {
    const auth = await requireAuth(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const campaign = await campaignOwnedBy(pool, id, auth.organisationId);
    if (!campaign) return reply.code(404).send({ message: "Campaign not found" });
    const input = googleDiscoverySchema.parse(request.body);
    const settings = await getRuntimeSettings(pool, environment);
    if (!settings.googlePlacesApiKey) {
      return reply.code(409).send({ message: "Google Places API key is not configured" });
    }
    const googlePolicy = await requireSourcePolicyByClass(pool, "google-places");
    if (!googlePolicy) {
      return reply.code(409).send({ message: "Google Places discovery requires an enabled google-places source policy" });
    }
    const requestedFields: SourceField[] = ["company_name", "domain", "postal_address", "phone"];
    const authorization = authorizeCollection({
      policy: googlePolicy,
      hostname: "places.googleapis.com",
      requestedFields,
      purpose: "campaign_targeting",
      now: new Date(),
      clientSuspended: !auth.organisationApproved,
      campaignSuspended: campaign.status === "suspended",
    });
    if (!authorization.allowed) {
      return reply.code(409).send({
        message: "Google discovery was denied by source policy",
        reasonCodes: authorization.reasonCodes,
      });
    }

    const [channelPolicy, principal, websitePolicy, places] = await Promise.all([
      getChannelPolicy(pool),
      latestCharityPrincipal(pool, auth.organisationId),
      requireSourcePolicyByClass(pool, "company-website"),
      searchGooglePlacesText(input, settings.googlePlacesApiKey),
    ]);
    const principalVerified = Boolean(
      principal?.status === "verified" &&
      principal.verification_expires_at &&
      principal.verification_expires_at.getTime() > Date.now(),
    );
    const expiresAt = addDays(Math.min(googlePolicy.retentionDays, 365));
    const created: Array<{ id: string; name: string; channel: OutreachChannel; outcome: OutreachDecisionOutcome; reasonCodes: EligibilityReasonCode[] }> = [];

    for (const place of places) {
      const domain = place.websiteUri ? normaliseDomain(place.websiteUri) : "";
      const companyMatch = settings.companiesHouseApiKey
        ? bestCompaniesHouseMatch(place.name, await searchCompaniesHouseCompanies(place.name, settings.companiesHouseApiKey))
        : null;
      const companyVerified = companyMatch ? isSupportedActiveCompanySearchResult(companyMatch) : false;
      const entityType: EntityType = companyVerified && companyMatch
        ? entityTypeForCompanyType(companyMatch.companyType)
        : place.types.includes("charity")
          ? "registered_charity"
          : "unsupported";
      const mailbox = input.discoverWebsiteMailboxes && domain && websitePolicy
        ? await discoverRoleMailboxFromWebsite(place.websiteUri!, domain)
        : "";
      const postalAddress = postalAddressFromGoogle(place.formattedAddress);
      const channel: OutreachChannel = companyVerified && mailbox ? "corporate_email" : "postal_letter";
      const mailboxType: MailboxType = mailbox ? "role" : "unknown";
      const client = await pool.connect();
      try {
        await client.query("begin");
        const source = await client.query<{ id: string }>(
          `insert into source_records
            (source_policy_id, source_url, field_name, field_value_hash, retrieved_at)
           values ($1, $2, 'google_place', $3, now()) returning id`,
          [
            authorization.policyId,
            place.sourceUrl,
            hashIdentifier(JSON.stringify({
              placeId: place.placeId,
              name: place.name,
              websiteUri: place.websiteUri,
              formattedAddress: place.formattedAddress,
              nationalPhoneNumber: place.nationalPhoneNumber,
            })),
          ],
        );
        const sourceRecordId = source.rows[0]!.id;
        const entity = await client.query<{ id: string }>(
          `insert into prospect_entities
            (organisation_id, entity_type, legal_name, company_number, status,
             source_record_id, verified_at, expires_at)
           values ($1,$2,$3,$4,$5,$6,case when $5 = 'verified' then now() else null end,$7)
           returning id`,
          [
            auth.organisationId,
            entityType,
            companyMatch?.companyName || place.name,
            companyMatch?.companyNumber ?? null,
            companyVerified ? "verified" : "unverified",
            sourceRecordId,
            expiresAt,
          ],
        );
        const entityId = entity.rows[0]!.id;
        let domainId: string | null = null;
        let mailboxId: string | null = null;
        if (domain) {
          const domainRow = await client.query<{ id: string }>(
            `insert into domains (registrable_domain) values ($1)
             on conflict (registrable_domain) do update set updated_at = now() returning id`,
            [domain],
          );
          domainId = domainRow.rows[0]!.id;
        }
        if (mailbox && domainId) {
          const mailboxRow = await client.query<{ id: string }>(
            `insert into mailboxes (domain_id, address, local_part, mailbox_type)
             values ($1,$2,$3,$4)
             on conflict (address) do update set mailbox_type = excluded.mailbox_type, updated_at = now()
             returning id`,
            [domainId, mailbox, mailbox.split("@")[0], mailboxType],
          );
          mailboxId = mailboxRow.rows[0]!.id;
        }
        const campaignProspect = await client.query<{ id: string }>(
          `insert into campaign_prospects
            (organisation_id, campaign_id, prospect_entity_id, domain_id, mailbox_id, source_record_id)
           values ($1,$2,$3,$4,$5,$6)
           on conflict (campaign_id, prospect_entity_id) do update set
             domain_id = excluded.domain_id,
             mailbox_id = excluded.mailbox_id,
             source_record_id = excluded.source_record_id,
             updated_at = now()
           returning id`,
          [auth.organisationId, id, entityId, domainId, mailboxId, sourceRecordId],
        );
        const campaignProspectId = campaignProspect.rows[0]!.id;
        let addressAssessment = null as null | {
          verified: boolean;
          expiresAt: Date | null;
          sourceApproved: boolean;
          addressContext: "business" | "registered_office" | "likely_home" | "unknown";
          publicContextApproved: boolean;
          sensitiveTargetingRisk: boolean;
        };
        if (postalAddress) {
          const addressHash = hashIdentifier(JSON.stringify(postalAddress));
          const address = await client.query<{ id: string }>(
            `insert into prospect_addresses
              (organisation_id, prospect_entity_id, source_record_id, address_hash, address,
               address_context, retrieved_at, expires_at)
             values ($1,$2,$3,$4,$5::jsonb,'business',now(),$6)
             returning id`,
            [auth.organisationId, entityId, sourceRecordId, addressHash, JSON.stringify(postalAddress), expiresAt],
          );
          await client.query(
            `insert into postal_address_assessments
              (prospect_address_id, outcome, policy_version, source_approved,
               public_context_approved, sensitive_targeting_risk, reason_codes,
               evidence_ids, assessed_at, expires_at)
             values ($1,$2,$3,$4,$5,false,$6::jsonb,$7::jsonb,now(),$8)`,
            [
              address.rows[0]!.id,
              input.addressSourceApproved ? "verified" : "review",
              policyVersion,
              input.addressSourceApproved,
              input.publicContextApproved,
              JSON.stringify(input.addressSourceApproved ? [] : ["POSTAL_ADDRESS_SOURCE_NOT_APPROVED"]),
              JSON.stringify([sourceRecordId]),
              expiresAt,
            ],
          );
          addressAssessment = {
            verified: input.addressSourceApproved,
            expiresAt,
            sourceApproved: input.addressSourceApproved,
            addressContext: "business",
            publicContextApproved: input.publicContextApproved,
            sensitiveTargetingRisk: false,
          };
        }
        const decision = evaluateOutreachChannel({
          now: new Date(),
          channel,
          charityPrincipal: principal
            ? { verified: principalVerified, expiresAt: principal.verification_expires_at }
            : null,
          campaignApproved: campaign.status === "approved",
          channelApproved: Boolean(channelPolicy[channelFlagName(channel)]),
          recipientEntity: {
            entityType,
            verified: companyVerified,
            expiresAt,
          },
          domainMatch: domain ? { verified: Boolean(domain), expiresAt } : null,
          mailboxAssessment: mailbox ? {
            type: mailboxType,
            mailboxDomain: mailbox.split("@")[1] ?? "",
            verifiedDomain: domain,
            expiresAt,
          } : null,
          postalAddressAssessment: addressAssessment,
          sourcesApproved: true,
          lawfulBasisRecorded: input.lawfulBasisRecorded,
          transparencyRecorded: input.transparencyRecorded,
          letterTemplateApproved: channelPolicy.letterTemplateApproved,
          consentRecorded: false,
          preferenceChecks: [],
          suppressions: [],
        });
        const decisionRow = await client.query<{ id: string }>(
          `insert into outreach_channel_decisions
            (campaign_prospect_id, channel, outcome, policy_version, reason_codes,
             evidence_ids, decided_at, expires_at)
           values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)
           returning id`,
          [
            campaignProspectId,
            channel,
            decision.outcome,
            decision.policyVersion,
            JSON.stringify(decision.reasonCodes),
            JSON.stringify([sourceRecordId]),
            decision.decidedAt,
            expiresAt,
          ],
        );
        if (decision.outcome === "review" || decision.outcome === "held") {
          await client.query(
            `insert into manual_reviews
              (organisation_id, subject_type, subject_id, reason_codes, evidence_ids)
             values ($1, 'campaign_prospect_channel_decision', $2, $3::jsonb, $4::jsonb)
             on conflict do nothing`,
            [auth.organisationId, decisionRow.rows[0]!.id, JSON.stringify(decision.reasonCodes), JSON.stringify([sourceRecordId])],
          );
        }
        await client.query("commit");
        created.push({
          id: campaignProspectId,
          name: companyMatch?.companyName || place.name,
          channel,
          outcome: decision.outcome,
          reasonCodes: decision.reasonCodes,
        });
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }

    await writeAudit(pool, auth, "google_discovery.completed", "campaign", id, {
      query: input.query,
      location: input.location,
      count: created.length,
    });
    return reply.code(201).send({ imported: created.length, prospects: created });
  });

	  app.get("/api/campaigns/:id/prospects", async (request, reply) => {
    const auth = await requireAuth(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const campaign = await campaignOwnedBy(pool, id, auth.organisationId);
    if (!campaign) return reply.code(404).send({ message: "Campaign not found" });
    const result = await pool.query(
      `select cp.id, pe.legal_name, pe.entity_type, pe.company_number,
         pe.charity_commission_number, d.registrable_domain, m.address as mailbox,
         pa.address, pa.address_context, ocd.channel, ocd.outcome,
         ocd.reason_codes, ocd.decided_at
       from campaign_prospects cp
       join prospect_entities pe on pe.id = cp.prospect_entity_id
       left join domains d on d.id = cp.domain_id
       left join mailboxes m on m.id = cp.mailbox_id
       left join prospect_addresses pa on pa.prospect_entity_id = pe.id
       left join lateral (
         select channel, outcome, reason_codes, decided_at
         from outreach_channel_decisions
         where campaign_prospect_id = cp.id and superseded_at is null
         order by decided_at desc limit 1
       ) ocd on true
       where cp.campaign_id = $1 and cp.organisation_id = $2
       order by cp.created_at desc`,
      [id, auth.organisationId],
    );
    return result.rows;
  });

  app.post("/api/leads/:id/suppress", async (request, reply) => {
    const auth = await requireAuth(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const result = await pool.query<{ address: string }>(
      `select m.address from campaign_leads cl join mailboxes m on m.id = cl.mailbox_id
       where cl.id = $1 and cl.organisation_id = $2`,
      [id, auth.organisationId],
    );
    const lead = result.rows[0];
    if (!lead) return reply.code(404).send({ message: "Lead not found" });
    await pool.query(
      `insert into suppression_entries
        (organisation_id, scope, target_type, target_hash, reason)
       values ($1, 'organisation', 'mailbox', $2, 'client_suppressed')`,
      [auth.organisationId, hashIdentifier(lead.address)],
    );
    await pool.query(
      `update eligibility_decisions set superseded_at = now()
       where campaign_lead_id = $1 and superseded_at is null`,
      [id],
    );
    await pool.query(
      `insert into eligibility_decisions
        (campaign_lead_id, outcome, policy_version, reason_codes, evidence_ids, decided_at, expires_at)
       values ($1, 'ineligible', $2, '["SUPPRESSED"]'::jsonb, '[]'::jsonb, now(), now() + interval '30 days')`,
      [id, policyVersion],
    );
    await writeAudit(pool, auth, "lead.suppressed", "campaign_lead", id);
    return { ok: true };
  });

  app.get("/api/suppressions", async (request, reply) => {
    const auth = await requireAuth(pool, request, reply);
    if (!auth) return;
    const result = await pool.query(
      `select id, scope, target_type, reason, suppressed_at, active
       from suppression_entries
       where organisation_id = $1 or scope = 'platform'
       order by suppressed_at desc`,
      [auth.organisationId],
    );
    return result.rows;
  });

  app.get("/api/compliance", async (request, reply) => {
    const auth = await requireAuth(pool, request, reply);
    if (!auth) return;
    const [reviews, audits, rights, complaints, jobs, settings] = await Promise.all([
      pool.query(
        `select mr.*, co.legal_name, co.company_number, d.registrable_domain, m.address
         from manual_reviews mr
         left join campaign_leads cl on mr.subject_type = 'campaign_lead_verification'
           and cl.id::text = mr.subject_id
         left join companies co on co.id = cl.company_id
         left join domains d on d.id = cl.domain_id
         left join mailboxes m on m.id = cl.mailbox_id
         where mr.organisation_id = $1 order by mr.created_at desc limit 50`,
        [auth.organisationId],
      ),
      pool.query(
        `select event_type, subject_type, subject_id, payload, occurred_at
         from audit_events where organisation_id = $1 order by occurred_at desc limit 50`,
        [auth.organisationId],
      ),
      pool.query(
        `select id, request_type, details, status, identity_verified_at, due_at, completed_at, created_at
         from rights_requests order by created_at desc limit 50`,
      ),
      pool.query(
        `select id, details, status, acknowledged_at, acknowledgement_due_at, completed_at, created_at
         from complaints order by created_at desc limit 50`,
      ),
      pool.query(
        `select id, queue_name, job_name, idempotency_key, status, attempts, max_attempts,
           last_error, available_at, cancel_requested_at, created_at
         from job_runs where organisation_id = $1 or organisation_id is null
         order by created_at desc limit 50`,
        [auth.organisationId],
      ),
      getRuntimeSettings(pool, environment),
    ]);
    return {
      reviews: reviews.rows,
      audits: audits.rows,
      rights: rights.rows,
      complaints: complaints.rows,
      jobs: jobs.rows,
      launch: {
        companiesHouseConfigured: settings.companiesHouseConfigured,
        productionExportsEnabled: settings.productionExportsEnabled,
        liveCollectionEnabled: settings.liveCollectionEnabled,
        liveCollectionAvailable: settings.liveCollectionAvailable,
        policyVersion,
      },
    };
  });

  app.get("/api/admin/jobs", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const result = await pool.query(
      `select id, queue_name, job_name, idempotency_key, status, payload, attempts,
         max_attempts, last_error, available_at, cancel_requested_at, started_at,
         worker_id, lease_expires_at, completed_at, created_at
       from job_runs where organisation_id = $1 or organisation_id is null
       order by created_at desc limit 100`,
      [auth.organisationId],
    );
    return result.rows;
  });

  app.post("/api/admin/jobs", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const input = enqueueJobSchema.parse(request.body);
    const result = await pool.query<{ id: string; status: string }>(
      `insert into job_runs
        (organisation_id, queue_name, job_name, idempotency_key, status, trace_id, payload, max_attempts)
       values ($1,$2,$3,$4,'queued',$5,$6::jsonb,$7)
       on conflict (queue_name, idempotency_key) do update set
         updated_at = job_runs.updated_at
       returning id, status`,
      [
        auth.organisationId,
        input.queueName,
        input.jobName,
        input.idempotencyKey,
        randomUUID(),
        JSON.stringify(input.payload),
        input.maxAttempts,
      ],
    );
    await writeAudit(pool, auth, "job.enqueued", "job_run", result.rows[0]!.id, {
      idempotencyKey: input.idempotencyKey,
    });
    return reply.code(201).send(result.rows[0]);
  });

  app.get("/api/admin/dsar-search", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const input = dsarSearchSchema.parse(request.query);
    const hash = hashIdentifier(input.identifier);
    const like = `%${input.identifier.trim()}%`;
    const [
      prospects,
      decisions,
      suppressions,
      tokens,
      audits,
      exportsResult,
      rights,
      complaintsResult,
    ] = await Promise.all([
      pool.query(
        `select id, entity_type, legal_name, trading_name, company_number,
           charity_commission_number, oscr_number, status, created_at, updated_at
         from prospect_entities
         where organisation_id = $1
           and (legal_name ilike $2 or trading_name ilike $2 or company_number = $3
             or charity_commission_number = $3 or oscr_number = $3)
         order by updated_at desc limit 100`,
        [auth.organisationId, like, input.identifier.trim()],
      ),
      pool.query(
        `select ocd.id, ocd.channel, ocd.outcome, ocd.reason_codes, ocd.decided_at,
           pe.legal_name, cp.campaign_id
         from outreach_channel_decisions ocd
         join campaign_prospects cp on cp.id = ocd.campaign_prospect_id
         join prospect_entities pe on pe.id = cp.prospect_entity_id
         where cp.organisation_id = $1
           and (pe.legal_name ilike $2 or pe.company_number = $3
             or pe.charity_commission_number = $3 or pe.oscr_number = $3)
         order by ocd.decided_at desc limit 100`,
        [auth.organisationId, like, input.identifier.trim()],
      ),
      pool.query(
        `select id, scope, target_type, reason, active, suppressed_at
         from suppression_entries
         where (organisation_id = $1 or scope = 'platform') and target_hash = $2
         order by suppressed_at desc limit 100`,
        [auth.organisationId, hash],
      ),
      pool.query(
        `select dnt.id, dnt.channel, dnt.expires_at, dnt.confirmed_at,
           dnt.campaign_prospect_id
         from do_not_contact_tokens dnt
         where dnt.organisation_id = $1
           and (dnt.token_hash = $2 or dnt.printed_code_hash = $2)
         order by dnt.created_at desc limit 100`,
        [auth.organisationId, hash],
      ),
      pool.query(
        `select event_type, subject_type, subject_id, payload, occurred_at
         from audit_events
         where organisation_id = $1
           and (subject_id = $2 or payload::text ilike $3)
         order by occurred_at desc limit 100`,
        [auth.organisationId, input.identifier.trim(), like],
      ),
      pool.query(
        `select e.id, e.campaign_id, e.purpose, e.created_at, e.expires_at
         from exports e
         where e.organisation_id = $1
           and (e.purpose ilike $2 or e.id::text = $3)
         order by e.created_at desc limit 100`,
        [auth.organisationId, like, input.identifier.trim()],
      ),
      pool.query(
        `select id, request_type, details, status, created_at, completed_at
         from rights_requests
         where requester_identifier_hash = $1
         order by created_at desc limit 100`,
        [hash],
      ),
      pool.query(
        `select id, details, status, created_at, completed_at
         from complaints
         where complainant_identifier_hash = $1
         order by created_at desc limit 100`,
        [hash],
      ),
    ]);
    await writeAudit(pool, auth, "dsar.search_performed", "dsar", hash, {
      resultCounts: {
        prospects: prospects.rows.length,
        decisions: decisions.rows.length,
        suppressions: suppressions.rows.length,
        tokens: tokens.rows.length,
        audits: audits.rows.length,
      },
    });
    return {
      identifierHash: hash,
      prospects: prospects.rows,
      decisions: decisions.rows,
      suppressions: suppressions.rows,
      doNotContactTokens: tokens.rows,
      audits: audits.rows,
      exports: exportsResult.rows,
      rights: rights.rows,
      complaints: complaintsResult.rows,
      note: "Manual email/document searches remain outside this app.",
    };
  });

  app.post("/api/admin/jobs/:id/cancel", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const client = await pool.connect();
    try {
      await client.query("begin");
      const current = await client.query<{ status: JobStatus; attempts: number; max_attempts: number; cancel_requested_at: Date | null }>(
        `select status, attempts, max_attempts, cancel_requested_at from job_runs
         where id = $1 and organisation_id = $2 for update`,
        [id, auth.organisationId],
      );
      const row = current.rows[0];
      if (!row) {
        await client.query("rollback");
        return reply.code(404).send({ message: "Job not found" });
      }
      const next = transitionJob(
        {
          status: row.status,
          attempts: row.attempts,
          maxAttempts: row.max_attempts,
          cancelRequested: Boolean(row.cancel_requested_at),
        },
        { action: "request_cancel" },
      );
      await client.query(
        `update job_runs set status = $1, cancel_requested_at = now(), updated_at = now()
         where id = $2 and organisation_id = $3`,
        [next.status, id, auth.organisationId],
      );
      await client.query(
        `insert into audit_events
          (organisation_id, actor_id, event_type, subject_type, subject_id, payload)
         values ($1,$2,'job.cancel_requested','job_run',$3,'{}'::jsonb)`,
        [auth.organisationId, auth.userId, id],
      );
      await client.query("commit");
      return { ok: true, status: next.status };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/admin/jobs/:id/retry", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const client = await pool.connect();
    try {
      await client.query("begin");
      const current = await client.query<{ status: JobStatus; attempts: number; max_attempts: number; cancel_requested_at: Date | null }>(
        `select status, attempts, max_attempts, cancel_requested_at from job_runs
         where id = $1 and organisation_id = $2 for update`,
        [id, auth.organisationId],
      );
      const row = current.rows[0];
      if (!row) {
        await client.query("rollback");
        return reply.code(404).send({ message: "Job not found" });
      }
      const next = transitionJob(
        {
          status: row.status,
          attempts: row.attempts,
          maxAttempts: row.max_attempts,
          cancelRequested: Boolean(row.cancel_requested_at),
        },
        { action: "retry", now: new Date() },
      );
      await client.query(
        `update job_runs set status = $1, attempts = $2, available_at = $3,
           cancel_requested_at = null, last_error = null, worker_id = null,
           lease_expires_at = null, started_at = null,
           completed_at = null, updated_at = now()
         where id = $4 and organisation_id = $5`,
        [next.status, next.attempts, next.availableAt, id, auth.organisationId],
      );
      await client.query(
        `insert into audit_events
          (organisation_id, actor_id, event_type, subject_type, subject_id, payload)
         values ($1,$2,'job.retried','job_run',$3,'{}'::jsonb)`,
        [auth.organisationId, auth.userId, id],
      );
      await client.query("commit");
      return { ok: true, status: next.status };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/reviews/:id/decide", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const input = reviewDecisionSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<{
        subject_id: string;
        evidence_ids: unknown[];
        campaign_id: string;
        campaign_status: string;
        principal_verified_at: Date | null;
        company_id: string;
        entity_type: EntityType;
        company_verified: boolean;
        company_expires_at: Date | null;
        business_listing_id: string;
        domain_id: string;
        registrable_domain: string;
        mailbox_id: string;
        address: string;
        mailbox_type: MailboxType;
        mailbox_expires_at: Date | null;
        sources_approved: boolean;
        transparency_recorded: boolean;
      }>(
        `select mr.subject_id, mr.evidence_ids, cl.campaign_id, c.status as campaign_status,
           cp.verified_at as principal_verified_at, cl.company_id, co.entity_type,
           (cv.outcome = 'verified') as company_verified, cv.expires_at as company_expires_at,
           lm.business_listing_id, cl.domain_id, d.registrable_domain, cl.mailbox_id,
           m.address, m.mailbox_type, ma.expires_at as mailbox_expires_at,
           (sp.enabled = true and sp.expires_at > now()) as sources_approved,
           exists(select 1 from campaign_attestations ca where ca.campaign_id = c.id) as transparency_recorded
         from manual_reviews mr
         join campaign_leads cl on cl.id::text = mr.subject_id
         join campaigns c on c.id = cl.campaign_id
         join campaign_principals cp on cp.id = c.principal_id
         join companies co on co.id = cl.company_id
         join domains d on d.id = cl.domain_id
         join mailboxes m on m.id = cl.mailbox_id
         join lateral (
           select outcome, expires_at from company_verifications
           where company_id = cl.company_id order by verified_at desc limit 1
         ) cv on true
         join lateral (
           select business_listing_id from listing_matches
           where company_id = cl.company_id order by verified_at desc limit 1
         ) lm on true
         join business_listings bl on bl.id = lm.business_listing_id
         join source_records sr on sr.id = bl.source_record_id
         join source_policies sp on sp.id = sr.source_policy_id
         join lateral (
           select expires_at from mailbox_assessments
           where mailbox_id = cl.mailbox_id order by assessed_at desc limit 1
         ) ma on true
         where mr.id = $1 and mr.organisation_id = $2
           and mr.subject_type = 'campaign_lead_verification'
         for update of mr, cl`,
        [id, auth.organisationId],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query("rollback");
        return reply.code(404).send({ message: "Review not found" });
      }
      const listingDecision = decideListingMatch({
        companiesHouseVerified: row.company_verified,
        ...input.listing,
      });
      const domainDecision = decideDomainMatch({
        companiesHouseVerified: row.company_verified,
        ...input.domain,
      });
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await client.query(
        `insert into listing_matches
          (business_listing_id, company_id, outcome, policy_version, evidence_ids,
           reason_codes, verified_at, expires_at)
         values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,now(),$7)`,
        [
          row.business_listing_id,
          row.company_id,
          listingDecision.outcome,
          policyVersion,
          JSON.stringify(row.evidence_ids),
          JSON.stringify(listingDecision.reasonCodes),
          expiresAt,
        ],
      );
      await client.query(
        `insert into domain_verifications
          (company_id, domain_id, outcome, policy_version, evidence_ids,
           reason_codes, verified_at, expires_at)
         values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,now(),$7)`,
        [
          row.company_id,
          row.domain_id,
          domainDecision.outcome,
          policyVersion,
          JSON.stringify(row.evidence_ids),
          JSON.stringify(domainDecision.reasonCodes),
          expiresAt,
        ],
      );
      const suppressions = await client.query<{ id: string; scope: "platform" | "organisation"; target_type: "company" | "domain" | "mailbox" | "person" | "phone"; active: boolean }>(
        `select id, scope, target_type, active from suppression_entries
         where active = true and (scope = 'platform' or organisation_id = $1)
           and ((target_type = 'domain' and target_hash = $2)
             or (target_type = 'mailbox' and target_hash = $3))`,
        [auth.organisationId, hashIdentifier(row.registrable_domain), hashIdentifier(row.address)],
      );
      const decision = evaluateEligibility({
        now: new Date(),
        clientApproved: auth.organisationApproved,
        campaignApproved: row.campaign_status === "approved",
        campaignPrincipalVerified: Boolean(row.principal_verified_at),
        entityType: row.entity_type,
        companyVerification: {
          verified: row.company_verified,
          expiresAt: row.company_expires_at,
        },
        listingMatch: {
          verified: listingDecision.outcome === "verified",
          expiresAt,
        },
        domainMatch: {
          verified: domainDecision.outcome === "verified",
          expiresAt,
        },
        mailboxAssessment: {
          type: row.mailbox_type,
          mailboxDomain: row.address.split("@")[1] ?? "",
          verifiedDomain: row.registrable_domain,
          expiresAt: row.mailbox_expires_at,
        },
        sourcesApproved: row.sources_approved,
        transparencyRecorded: row.transparency_recorded,
        suppressions: suppressions.rows.map((item) => ({
          id: item.id,
          scope: item.scope,
          targetType: item.target_type,
          active: item.active,
        })),
      });
      await client.query(
        `update eligibility_decisions set superseded_at = now()
         where campaign_lead_id = $1 and superseded_at is null`,
        [row.subject_id],
      );
      await client.query(
        `insert into eligibility_decisions
          (campaign_lead_id, outcome, policy_version, reason_codes, evidence_ids,
           decided_at, expires_at)
         values ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`,
        [
          row.subject_id,
          decision.eligible ? "eligible" : "ineligible",
          decision.policyVersion,
          JSON.stringify(decision.reasonCodes),
          JSON.stringify(row.evidence_ids),
          decision.decidedAt,
          expiresAt,
        ],
      );
      const reviewDecision =
        listingDecision.outcome === "quarantine" || domainDecision.outcome === "quarantine"
          ? "quarantine"
          : listingDecision.outcome === "verified" && domainDecision.outcome === "verified"
            ? "verified"
            : "review";
      await client.query(
        `update manual_reviews set status = 'completed', decision = $1,
           reason_codes = $2::jsonb, reviewer_id = $3, reviewed_at = now(), updated_at = now()
         where id = $4`,
        [
          reviewDecision,
          JSON.stringify([...listingDecision.reasonCodes, ...domainDecision.reasonCodes]),
          auth.userId,
          id,
        ],
      );
      await client.query(
        `update job_runs set status = 'completed', completed_at = now(), updated_at = now()
         where organisation_id = $1 and queue_name = 'verification'
           and idempotency_key = $2 and status not in ('completed','cancelled')`,
        [auth.organisationId, `review:${row.subject_id}:${policyVersion}`],
      );
      await client.query("commit");
      await writeAudit(pool, auth, "review.completed", "manual_review", id, {
        listingOutcome: listingDecision.outcome,
        domainOutcome: domainDecision.outcome,
        eligible: decision.eligible,
      });
      return { listingDecision, domainDecision, eligibilityDecision: decision };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/api/compliance/rights/:id/status", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const input = complianceStatusSchema.parse(request.body);
    const result = await pool.query(
      `update rights_requests set status = $1,
         completed_at = case when $1 = 'completed' then now() else completed_at end,
         updated_at = now()
       where id = $2 returning id`,
      [input.status, id],
    );
    if (!result.rows[0]) return reply.code(404).send({ message: "Rights request not found" });
    await writeAudit(pool, auth, "rights_request.status_updated", "rights_request", id, { status: input.status });
    return { ok: true };
  });

  app.post("/api/compliance/complaints/:id/status", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const input = complianceStatusSchema.parse(request.body);
    const result = await pool.query(
      `update complaints set status = $1,
         acknowledged_at = case when $1 in ('acknowledged', 'completed') and acknowledged_at is null then now() else acknowledged_at end,
         completed_at = case when $1 = 'completed' then now() else completed_at end,
         updated_at = now()
       where id = $2 returning id`,
      [input.status, id],
    );
    if (!result.rows[0]) return reply.code(404).send({ message: "Complaint not found" });
    await writeAudit(pool, auth, "complaint.status_updated", "complaint", id, { status: input.status });
    return { ok: true };
  });

  async function requireExportGate(auth: AuthContext, reply: FastifyReply) {
    const settings = await getRuntimeSettings(pool, environment);
    if (!settings.productionExportsEnabled) {
      await reply.code(423).send({
        message: "Production exports are disabled until launch gates are approved",
      });
      return false;
    }
    if (!(await launchGatesComplete(pool))) {
      await setProductionExportsEnabled(pool, auth.userId, false);
      await reply.code(423).send({
        message: "Production exports were locked because a mandatory launch gate is incomplete",
      });
      return false;
    }
    return true;
  }

  async function exportChannelCsv(
    request: FastifyRequest,
    reply: FastifyReply,
    channel: "corporate_email" | "postal_letter" | "consent_required" | "quarantine",
  ) {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const campaign = await campaignOwnedBy(pool, id, auth.organisationId);
    if (!campaign) return reply.code(404).send({ message: "Campaign not found" });
    if (!(await requireExportGate(auth, reply))) return;

    const channelPolicy = await getChannelPolicy(pool);
    if (channel === "corporate_email" && !channelPolicy.corporateEmailEnabled) {
      return reply.code(423).send({ message: "Corporate email exports are disabled by channel policy" });
    }
    if (channel === "postal_letter" && (!channelPolicy.postalLetterEnabled || !channelPolicy.letterTemplateApproved)) {
      return reply.code(423).send({ message: "Letter exports require postal channel and template approval" });
    }

    const decisionWhere =
      channel === "corporate_email"
        ? "ocd.channel = 'corporate_email' and ocd.outcome = 'eligible'"
        : channel === "postal_letter"
          ? "ocd.channel = 'postal_letter' and ocd.outcome = 'eligible'"
          : channel === "consent_required"
            ? "ocd.outcome = 'consent_required'"
            : "ocd.outcome = 'quarantine'";
    const exportId = randomUUID();
    const client = await pool.connect();
    let rows: Array<Record<string, unknown>> = [];
    try {
      await client.query("begin");
      await client.query(
        `select id from campaigns where id = $1 and organisation_id = $2 for update`,
        [id, auth.organisationId],
      );
      const principal = await client.query(
        `select id from charity_principals
         where organisation_id = $1 and status = 'verified'
           and verification_expires_at > now()
         order by verified_at desc limit 1`,
        [auth.organisationId],
      );
      if (!principal.rows[0] && (channel === "corporate_email" || channel === "postal_letter")) {
        await client.query("rollback");
        return reply.code(423).send({ message: "Buttercup charity principal is not currently verified" });
      }
      const result = await client.query<Record<string, unknown>>(
        `select cp.id as campaign_prospect_id, pe.legal_name, pe.entity_type,
           pe.company_number, pe.charity_commission_number, d.registrable_domain,
           m.address as mailbox, pa.address as postal_address, pa.address_hash,
           ocd.id as decision_id, ocd.channel, ocd.outcome, ocd.reason_codes
         from campaign_prospects cp
         join campaigns c on c.id = cp.campaign_id
         join prospect_entities pe on pe.id = cp.prospect_entity_id
         left join domains d on d.id = cp.domain_id
         left join mailboxes m on m.id = cp.mailbox_id
         left join prospect_addresses pa on pa.prospect_entity_id = pe.id
         join lateral (
           select id, channel, outcome, reason_codes, expires_at
           from outreach_channel_decisions
           where campaign_prospect_id = cp.id and superseded_at is null
           order by decided_at desc limit 1
         ) ocd on ${decisionWhere} and ocd.expires_at > now()
         where cp.campaign_id = $1 and cp.organisation_id = $2
           and c.status = 'approved' and c.expires_at > now()
         for update of cp`,
        [id, auth.organisationId],
      );
      rows = [];
      for (const row of result.rows) {
        const suppression = await client.query(
          `select 1 from suppression_entries
           where active = true and (scope = 'platform' or organisation_id = $1)
             and ((target_type = 'company' and target_hash = $2)
               or (target_type = 'charity' and target_hash = $3)
               or (target_type = 'domain' and target_hash = $4)
               or (target_type = 'mailbox' and target_hash = $5)
               or (target_type = 'postal_address' and target_hash = $6)
               or (target_type = 'person' and target_hash = $7))
           limit 1`,
          [
            auth.organisationId,
            hashIdentifier(String(row.company_number ?? row.legal_name ?? "")),
            hashIdentifier(String(row.charity_commission_number ?? row.legal_name ?? "")),
            row.registrable_domain ? hashIdentifier(String(row.registrable_domain)) : "",
            row.mailbox ? hashIdentifier(String(row.mailbox)) : "",
            row.address_hash ? String(row.address_hash) : "",
            hashIdentifier(String(row.legal_name ?? "")),
          ],
        );
        if (!suppression.rows[0]) rows.push(row);
      }

      for (const row of rows) {
        if (channel === "corporate_email" || channel === "postal_letter") {
          const token = randomUUID();
          const printedCode = randomUUID().slice(0, 8).toUpperCase();
          await client.query(
            `insert into do_not_contact_tokens
              (organisation_id, campaign_prospect_id, channel, token_hash,
               printed_code_hash, suppression_scope, expires_at)
             values ($1,$2,$3,$4,$5,'organisation',now() + interval '1 year')`,
            [
              auth.organisationId,
              row.campaign_prospect_id,
              channel === "corporate_email" ? "corporate_email" : "postal_letter",
              hashIdentifier(token),
              hashIdentifier(printedCode),
            ],
          );
          row.do_not_contact_token = token;
          row.do_not_contact_code = printedCode;
        }
      }

      await client.query(
        `insert into exports (id, organisation_id, campaign_id, purpose, expires_at)
         values ($1,$2,$3,$4,now() + interval '1 day')`,
        [exportId, auth.organisationId, id, `${campaign.purpose}:${channel}`],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    await writeAudit(pool, auth, "campaign.channel_exported", "campaign", id, {
      exportId,
      channel,
      count: rows.length,
      policyVersion,
    });

    const header = channel === "corporate_email"
      ? ["organisation_name", "entity_type", "company_number", "charity_number", "domain", "role_mailbox", "do_not_contact_url", "decision_id"]
      : channel === "postal_letter"
        ? ["organisation_name", "entity_type", "company_number", "charity_number", "postal_address_json", "do_not_contact_code", "decision_id"]
        : ["organisation_name", "entity_type", "company_number", "charity_number", "channel", "outcome", "reason_codes", "decision_id"];
    const lines = rows.map((row) => {
      if (channel === "corporate_email") {
        return [
          row.legal_name,
          row.entity_type,
          row.company_number,
          row.charity_commission_number,
          row.registrable_domain,
          row.mailbox,
          `https://${request.hostname}/do-not-contact?token=${row.do_not_contact_token}`,
          row.decision_id,
        ].map(csvCell).join(",");
      }
      if (channel === "postal_letter") {
        return [
          row.legal_name,
          row.entity_type,
          row.company_number,
          row.charity_commission_number,
          JSON.stringify(row.postal_address ?? {}),
          row.do_not_contact_code,
          row.decision_id,
        ].map(csvCell).join(",");
      }
      return [
        row.legal_name,
        row.entity_type,
        row.company_number,
        row.charity_commission_number,
        row.channel,
        row.outcome,
        JSON.stringify(row.reason_codes ?? []),
        row.decision_id,
      ].map(csvCell).join(",");
    });
    const suffix = channel.replaceAll("_", "-");
    reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${campaign.name.replaceAll(/[^a-z0-9]+/gi, "-").toLowerCase()}-${suffix}.csv"`);
    return [header.join(","), ...lines].join("\n");
  }

  app.get("/api/campaigns/:id/export-email.csv", async (request, reply) =>
    exportChannelCsv(request, reply, "corporate_email"));

  app.get("/api/campaigns/:id/export-letters.csv", async (request, reply) =>
    exportChannelCsv(request, reply, "postal_letter"));

  app.get("/api/campaigns/:id/review-consent-required.csv", async (request, reply) =>
    exportChannelCsv(request, reply, "consent_required"));

  app.get("/api/campaigns/:id/review-quarantine.csv", async (request, reply) =>
    exportChannelCsv(request, reply, "quarantine"));

  app.post("/api/campaigns/:id/letter-fulfilment/self-print", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const campaign = await campaignOwnedBy(pool, id, auth.organisationId);
    if (!campaign) return reply.code(404).send({ message: "Campaign not found" });
    if (!(await requireExportGate(auth, reply))) return;
    const channelPolicy = await getChannelPolicy(pool);
    if (!channelPolicy.selfPrintFulfilmentEnabled || !channelPolicy.letterTemplateApproved) {
      return reply.code(423).send({ message: "Self-print fulfilment requires approved channel policy and letter template" });
    }
    const client = await pool.connect();
    let batchId = "";
    let recipientCount = 0;
    try {
      await client.query("begin");
      await client.query(
        `select id from campaigns where id = $1 and organisation_id = $2 for update`,
        [id, auth.organisationId],
      );
      const template = await client.query<{ id: string }>(
        `select id from letter_template_manifests
         where organisation_id = $1 and approved = true and expires_at > now()
         order by approved_at desc nulls last, created_at desc limit 1`,
        [auth.organisationId],
      );
      if (!template.rows[0]) {
        await client.query("rollback");
        return reply.code(423).send({ message: "No approved current letter template manifest is available" });
      }
      const prospects = await client.query<{
        campaign_prospect_id: string;
        decision_id: string;
      }>(
        `select cp.id as campaign_prospect_id, ocd.id as decision_id
         from campaign_prospects cp
         join prospect_addresses pa on pa.prospect_entity_id = cp.prospect_entity_id
         join lateral (
           select id, outcome, expires_at from outreach_channel_decisions
           where campaign_prospect_id = cp.id
             and channel = 'postal_letter'
             and superseded_at is null
           order by decided_at desc limit 1
         ) ocd on ocd.outcome = 'eligible' and ocd.expires_at > now()
         where cp.organisation_id = $1 and cp.campaign_id = $2
         for update of cp`,
        [auth.organisationId, id],
      );
      const batch = await client.query<{ id: string }>(
        `insert into letter_fulfilment_batches
          (organisation_id, campaign_id, template_manifest_id, mode, status,
           recipient_count, manifest, created_by)
         values ($1,$2,$3,'self_print','created',$4,$5::jsonb,$6)
         returning id`,
        [
          auth.organisationId,
          id,
          template.rows[0].id,
          prospects.rows.length,
          JSON.stringify({
            mode: "self_print",
            campaignId: id,
            policyVersion,
            createdAt: new Date().toISOString(),
          }),
          auth.userId,
        ],
      );
      batchId = batch.rows[0]!.id;
      for (const prospect of prospects.rows) {
        const token = randomUUID();
        const code = randomUUID().slice(0, 8).toUpperCase();
        const tokenRow = await client.query<{ id: string }>(
          `insert into do_not_contact_tokens
            (organisation_id, campaign_prospect_id, channel, token_hash,
             printed_code_hash, suppression_scope, expires_at)
           values ($1,$2,'postal_letter',$3,$4,'organisation',now() + interval '1 year')
           returning id`,
          [auth.organisationId, prospect.campaign_prospect_id, hashIdentifier(token), hashIdentifier(code)],
        );
        await client.query(
          `insert into letter_fulfilment_items
            (batch_id, campaign_prospect_id, outreach_channel_decision_id,
             do_not_contact_token_id, status)
           values ($1,$2,$3,$4,'created')`,
          [batchId, prospect.campaign_prospect_id, prospect.decision_id, tokenRow.rows[0]!.id],
        );
      }
      recipientCount = prospects.rows.length;
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    await writeAudit(pool, auth, "letter_fulfilment.self_print_manifest_created", "campaign", id, {
      batchId,
      mode: "self_print",
      recipientCount,
      policyVersion,
    });
    return {
      ok: true,
      mode: "self_print",
      campaignId: id,
      batchId,
      recipientCount,
      policyVersion,
    };
  });

  app.post("/api/campaigns/:id/letter-fulfilment/provider", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const channelPolicy = await getChannelPolicy(pool);
    if (!channelPolicy.providerFulfilmentEnabled) {
      return reply.code(423).send({
        message: "Provider fulfilment is disabled until vendor contract, DPA, security review, and test evidence are recorded",
      });
    }
    return reply.code(501).send({ message: "Provider fulfilment adapter is not implemented for production sends" });
  });

  app.get("/api/campaigns/:id/export.csv", async (request, reply) => {
    const auth = await requireOwner(pool, request, reply);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const campaign = await campaignOwnedBy(pool, id, auth.organisationId);
    if (!campaign) return reply.code(404).send({ message: "Campaign not found" });
    return reply.code(410).send({
      message: "The mixed legacy export is disabled. Use /export-email.csv, /export-letters.csv, /review-consent-required.csv, or /review-quarantine.csv.",
    });
  });
}
