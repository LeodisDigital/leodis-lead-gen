# Technical Design Document: Buttercup Lead Gen

## 1. Purpose

This TDD describes how to adapt Lead Gen V2 into a charity fundraising prospect
research and export app for Buttercup Children's Trust.

The existing architecture should be retained:

- TypeScript pnpm monorepo.
- Fastify API.
- React/Vite web app.
- PostgreSQL with Drizzle migrations.
- Policy, verification, eligibility, source, collection, job, and shared
  packages.
- Fail-closed launch gates.

The main technical change is to separate **recipient verification** from
**outreach channel eligibility**. The current code assumes a lead is only useful
if it is an email-eligible UK company/LLP. Buttercup needs corporate email,
postal-letter, consent-required, and quarantine outcomes.

## 2. Existing System Map

| Area | Current package/file | Reuse decision |
|---|---|---|
| Launch flags and source policy | `packages/policy` | Reuse and extend source classes and channel policy. |
| Eligibility engine | `packages/eligibility` | Refactor from boolean email eligibility to channel decisions. |
| Entity/domain verification | `packages/verification` | Reuse deterministic evidence pattern; add charity/address decisions. |
| Shared reason codes | `packages/shared` | Extend with charity and postal reason codes. |
| Database schema | `packages/db/src/schema.ts` | Add charity principal, prospect address, channel decision, and preference checks. |
| API | `apps/api/src/routes.ts` | Add principal verification and channel exports; keep owner-only settings. |
| Web app | `apps/web/src/App.tsx` | Rename views and add channel review/export state. |
| Worker | `apps/worker` | Reuse leased maintenance jobs; add verification/suppression sync jobs later. |
| Deployment | Cloudflare Pages + Zero Trust + local API | Frontend deploys to Pages; API/Postgres/Redis stay local behind Cloudflare Tunnel or equivalent private origin. |

### 2.1 Current Implementation Gaps

The current repository is not yet aligned with this TDD. The following gaps are
tracked in [BUILD_GAP_REGISTER.md](BUILD_GAP_REGISTER.md) and must be closed
during implementation:

- database migrations for charity principal, prospect, postal address, channel
  decision, preference, and Do Not Contact token tables;
- Charity Commission and OSCR verification adapters;
- API routes for charity principal, channel policy, prospects, preference
  imports, Do Not Contact confirmation, and channel exports;
- replacement of old `campaign_leads`/`evaluateEligibility()` export flow with
  persisted `outreach_channel_decisions`;
- UI conversion from Lead Gen V2 B2B lead language to Buttercup prospect
  operations;
- Cloudflare Pages, GitHub CI/CD, local API tunnel/private origin, local
  storage/jobs, and Zero Trust deployment architecture;
- compliance corpus and API/export integration tests.

## 3. Target Architecture

```text
Campaign setup
  -> Buttercup principal verification
  -> Source-authorised prospect intake/research
  -> Recipient/entity/address/mailbox verification
  -> Channel decision engine
       email_eligible
       letter_eligible
       consent_required
       quarantine
  -> Review queue
  -> Transactional export gate
  -> CSV manifest and audit
```

No export path may read directly from raw candidate tables. Every exported row
must reference a current channel decision.

## 4. Data Model

Add these tables or equivalent migrations.

```text
charity_principals
  id
  organisation_id
  legal_name
  charity_number
  oscr_number
  ccni_number
  company_number
  website_url
  registered_address_hash
  status
  verified_at
  expires_at

charity_verifications
  id
  charity_principal_id
  source_register
  register_number
  outcome
  policy_version
  evidence_ids
  reason_codes
  verified_at
  expires_at

prospect_entities
  id
  organisation_id
  entity_kind
  legal_name
  companies_house_number
  charity_number
  oscr_number
  ccni_number
  status
  source_record_id

prospect_addresses
  id
  prospect_entity_id
  address_hash
  address_json
  address_type
  source_record_id
  assessed_at
  expires_at

outreach_channel_decisions
  id
  campaign_id
  prospect_entity_id
  mailbox_id nullable
  address_id nullable
  channel
  outcome
  policy_version
  reason_codes
  evidence_ids
  decided_at
  expires_at
  superseded_at

preference_service_checks
  id
  target_type
  target_hash
  service_name
  outcome
  checked_at
  expires_at

do_not_contact_tokens
  id
  organisation_id
  campaign_id
  prospect_entity_id
  mailbox_id nullable
  address_id nullable
  channel
  token_hash
  printed_code_hash
  status
  created_at
  used_at nullable
  expires_at

letter_template_manifests
  id
  organisation_id
  campaign_id nullable
  version
  channel
  template_name
  controller_identity_text
  do_not_contact_url
  qr_code_required
  printed_code_required
  approved_by
  approved_at
  superseded_at nullable

fulfilment_providers
  id
  organisation_id
  provider_key
  display_name
  enabled
  test_mode
  api_key_secret_ref
  contract_evidence_ref
  data_processing_evidence_ref
  reviewed_at
  expires_at

letter_fulfilment_batches
  id
  organisation_id
  campaign_id
  mode
  provider_id nullable
  template_manifest_id
  status
  item_count
  submitted_at nullable
  completed_at nullable
  evidence_ids

letter_fulfilment_items
  id
  batch_id
  prospect_entity_id
  address_id
  channel_decision_id
  do_not_contact_token_id
  provider_job_id nullable
  status
  failure_reason nullable
  created_at
  updated_at
```

Rename is optional, but the domain language should move from `CampaignLead` to
`CampaignProspect` in the UI and API. A lead can have multiple channel decisions
over time.

Suppression storage must also be extended. The current enum is not sufficient.
Add `postal_address`, `charity`, and `campaign` target types, and model
all-channel Do Not Contact as a suppression reason that can generate multiple
normalised target hashes from one confirmed request.

## 5. Policy Package Changes

Extend `packages/policy/src/index.ts`.

```ts
export const outreachChannels = [
  "corporate_email",
  "postal_letter",
  "individual_email",
  "telephone",
] as const;

export const defaultLaunchFlags = Object.freeze({
  liveCollectionEnabled: false,
  productionExportsEnabled: false,
  postalExportsEnabled: false,
  corporateEmailExportsEnabled: false,
});
```

Add approved source classes:

- `companies-house`
- `charity-commission`
- `oscr`
- `ccni`
- `client-provided-prospect`
- `company-website`
- `charity-website`
- `licensed-provider`
- `print-mail-provider`
- `preference-service`
- `suppression-import`

Keep all sources disabled by default except local test fixtures. Source-policy
approval must include channel, fields, retention, attribution, and prohibited
reuse notes.

The source-policy API and UI must persist:

- `approvedChannels`;
- `retentionDays`;
- `attributionRequirement`;
- `prohibitedReuseNotes`;
- `reviewOwner`;
- `evidenceReference`;
- `expiresAt`;
- enabled/disabled and kill-switch metadata.

## 6. Shared Types And Reason Codes

Add entity kinds:

```ts
"uk_limited_company"
"uk_llp"
"registered_charity"
"charitable_company"
"public_body"
"sole_trader"
"individual"
"unincorporated_association"
"unsupported"
```

Add channel outcomes:

```ts
"eligible"
"review"
"consent_required"
"ineligible"
"quarantine"
"held"
```

Add reason codes:

```text
CHARITY_PRINCIPAL_NOT_VERIFIED
CHARITY_PRINCIPAL_STALE
RECIPIENT_NOT_CORPORATE_SUBSCRIBER
RECIPIENT_ENTITY_UNSUPPORTED
RECIPIENT_VERIFICATION_MISSING
POSTAL_ADDRESS_MISSING
POSTAL_ADDRESS_STALE
POSTAL_ADDRESS_SOURCE_NOT_APPROVED
PREFERENCE_SERVICE_MATCH
FPS_MATCH
MPS_MATCH
LAWFUL_BASIS_MISSING
TRANSPARENCY_PLAN_MISSING
CHANNEL_NOT_APPROVED
INDIVIDUAL_EMAIL_REQUIRES_CONSENT
LETTER_TEMPLATE_NOT_APPROVED
PUBLIC_ADDRESS_CONTEXT_UNAPPROVED
LIKELY_HOME_ADDRESS_REVIEW_REQUIRED
SENSITIVE_TARGETING_RISK
DO_NOT_CONTACT_MATCH
DO_NOT_CONTACT_TOKEN_INVALID
REGISTER_API_UNAVAILABLE
POLICY_VERSION_STALE
```

## 7. Eligibility Engine

Replace the single `evaluateEligibility` decision with a channel-aware function.

```ts
type ChannelDecisionInput = {
  now: Date;
  channel: "corporate_email" | "postal_letter";
  charityPrincipal: ExpiringAssessment | null;
  campaignApproved: boolean;
  recipientEntity: RecipientEntityAssessment | null;
  domainMatch?: ExpiringAssessment | null;
  mailboxAssessment?: MailboxAssessment | null;
  postalAddressAssessment?: PostalAddressAssessment | null;
  sourceApproved: boolean;
  lawfulBasisRecorded: boolean;
  transparencyRecorded: boolean;
  preferenceChecks: PreferenceCheck[];
  suppressions: SuppressionMatch[];
};

type ChannelDecision = {
  channel: string;
  outcome: "eligible" | "review" | "consent_required" | "ineligible" | "quarantine" | "held";
  reasonCodes: string[];
  policyVersion: string;
  decidedAt: Date;
};
```

Rules:

- `corporate_email` requires a verified active company/LLP, current domain
  match, role mailbox, matching mailbox domain, approved source, lawful-basis
  record, transparency record, and no suppression.
- `postal_letter` requires verified or review-approved address provenance,
  approved source, lawful-basis record, transparency record, approved letter
  template, applicable preference-service checks, and no suppression.
- `postal_letter` for individuals and sole traders also requires a fairness
  decision covering source context, business-vs-home address, sensitivity risk,
  reasonable expectation, and minimisation.
- Individual electronic marketing returns `consent_required` unless consent or
  professional-approved charitable soft opt-in evidence exists.
- Unknown entity plus verified postal address may be `review`, never
  email-eligible.

### 7.1 Policy Version Staleness

Every channel decision records the `policyVersion` under which it was made.
When a source policy or channel policy is updated (not just disabled via
kill-switch), the new policy version is stored.

At export time, the transactional re-evaluation step (Section 11) must compare
each decision's `policyVersion` against the current source and channel policy
versions. If they do not match, the decision is stale and must be re-evaluated
before that row can export. The re-evaluation uses the current policy and
produces a new `outreach_channel_decisions` row with the updated version.

This approach avoids eagerly invalidating existing decisions on every policy
edit. Staleness is caught naturally by the export gate, which already
re-evaluates every prospect transactionally.

A policy version change must also produce an audit event recording the old
version, new version, actor, and reason for the change.

## 8. Verification Package

Add deterministic decisions:

```ts
decideCharityPrincipalVerification(input): VerificationDecision
decideRecipientEntityVerification(input): VerificationDecision
decidePostalAddressAssessment(input): VerificationDecision
decidePreferenceServiceCheck(input): VerificationDecision
```

Keep the current rule: LLM output can suggest evidence but cannot decide.

### 8.1 Register API Unavailability

When Charity Commission, OSCR, Companies House, or any other verification API
is unavailable at verification or export time:

1. The system must not proceed with stale or absent verification. Fail closed.
2. The campaign or affected prospects enter a `held` state with reason code
   `REGISTER_API_UNAVAILABLE`.
3. The owner is notified that verification is blocked and given two options:
   - **Hold and retry:** prospects remain held until the API recovers and
     verification succeeds. The system should retry automatically at a
     configurable interval (default: 15 minutes) with bounded retries.
   - **Route to postal review:** if the prospect has a verified postal address
     from an approved source, the owner may request postal-letter eligibility
     assessment instead. The postal decision must still pass all postal
     requirements independently — API unavailability does not waive any postal
     check.
4. Held prospects must not appear in any export until verification succeeds or
   the owner explicitly routes them to an alternative channel.
5. An audit event records the API unavailability, hold start, retry attempts,
   and resolution (verified, routed to postal, or expired).

## 9. API Changes

Add owner/admin routes:

```text
GET  /api/settings/charity-principal
POST /api/settings/charity-principal/verify
GET  /api/settings/channel-policy
POST /api/settings/channel-policy
POST /api/settings/preference-checks/import
GET  /api/settings/fulfilment-providers
POST /api/settings/fulfilment-providers
POST /api/public/do-not-contact
POST /api/public/do-not-contact/confirm
```

The public Do Not Contact endpoints must not reveal whether a person exists in
the database. Token/code validation should return generic confirmation states
and write audit events without exposing prospect details.

Public endpoints must have explicit rate limits to prevent enumeration and
abuse:

| Endpoint group | Rate limit | Additional protection |
|---|---|---|
| Do Not Contact confirmation | 10 requests/minute per IP | Turnstile or equivalent challenge on the confirmation form |
| Public objection/rights/complaint forms | 10 requests/minute per IP | Turnstile or equivalent challenge |
| Provider webhooks | 60 requests/minute per provider IP allowlist | Signature verification; reject requests from non-allowlisted IPs |

Rate limits should be enforced at the Cloudflare WAF/rate-limiting layer
before traffic reaches the local API. Responses for rate-limited or invalid
requests must remain generic to avoid leaking record existence.

Adapt campaign routes:

```text
POST /api/campaigns
POST /api/campaigns/:id/prospects
GET  /api/campaigns/:id/prospects
GET  /api/campaigns/:id/export-email.csv
GET  /api/campaigns/:id/export-letters.csv
GET  /api/campaigns/:id/review-consent-required.csv
GET  /api/campaigns/:id/review-quarantine.csv
POST /api/campaigns/:id/letter-fulfilment/self-print
POST /api/campaigns/:id/letter-fulfilment/provider
GET  /api/letter-fulfilment/:batchId
POST /api/webhooks/fulfilment/:providerKey
POST /api/admin/dsar-search
GET  /api/admin/dsar-report/:id
```

The current `/api/campaigns/:id/export.csv` should remain disabled or become a
compatibility wrapper that refuses unless exactly one approved channel is
requested.

## 10. Web App Changes

Rename the workspace from B2B lead export to Buttercup prospect operations.

Required views:

- Dashboard with principal verification, launch gates, eligible email count,
  eligible letter count, review count, and suppression alerts.
- Campaign builder with fundraising purpose, appeal, channel, audience, and
  owner attestation.
- Prospect intake/review with channel decision chips.
- Compliance operations for rights, complaints, suppression, FPS/MPS checks,
  and audit.
- Source registry and launch controls.

## 11. Export Gate

Every export must:

1. Load campaign and channel policy.
2. Acquire an advisory lock per campaign-channel pair to prevent concurrent
   exports for the same campaign and channel from interleaving. A second
   export request for the same campaign-channel must wait or fail with a
   conflict error rather than producing duplicate or inconsistent rows.
3. Lock candidate prospect rows or use an equivalent transaction-safe pattern.
4. Re-run source, suppression, preference-service, freshness, and eligibility
   checks.
5. Persist the exact `outreach_channel_decisions` row used for export.
6. Create Do Not Contact tokens/codes for every exported row.
7. Insert export rows in the same transaction.
8. Exclude failures and record reason codes.
9. Produce a channel-specific manifest.

Letter fulfilment has two modes:

- `self_print`: creates downloadable CSV/PDF-ready data and a fulfilment
  manifest. No recipient data is sent to a third party.
- `provider_api`: sends approved letter items to a configured print/mail
  provider, such as Stannp, only after provider approval, test-mode validation,
  and current Do Not Contact checks.

Provider API mode must use a provider adapter interface:

```ts
type LetterFulfilmentProvider = {
  providerKey: string;
  createLetters(input: LetterFulfilmentRequest): Promise<LetterFulfilmentResult>;
  verifyWebhook(input: WebhookRequest): Promise<WebhookVerification>;
};
```

The adapter must never bypass channel eligibility. It receives only rows that
passed the transactional letter gate.

Provider webhook handlers must be idempotent. Deduplicate by provider job ID
so that replayed or duplicate webhook deliveries do not create duplicate status
updates, spurious audit events, or inconsistent fulfilment state.

## 12. Do Not Contact Flow

Email and letter templates must use the same suppression concept: Do Not
Contact.

Flow:

1. Export creates a random token and optional short printed code per row.
2. Email templates use a URL containing the token.
3. Letter templates use a short URL, QR placeholder, and printed code.
4. Public route validates the token/code without exposing prospect data.
5. Confirmation creates suppression records for the strongest known identifiers.
6. Current channel decisions are superseded.
7. Future exports exclude matching identifiers across every channel.

Default suppression scope is all-channel for the person/address/mailbox/entity.
Compliance may narrow the scope only when a professional-approved workflow
requires it.

## 13. Security And Privacy

- Continue CSV formula-injection protection.
- Hash suppression and preference-service identifiers.
- Hash Do Not Contact tokens and printed codes at rest.
- Do not expose raw evidence or named-person data in client-style views.
- Add audit events for every principal verification, source-policy change,
  channel decision, preference import, Do Not Contact confirmation,
  launch-gate update, self-print batch, provider submission, provider webhook,
  and export.
- Keep raw website evidence minimised and time-limited.
- Maintain SSRF/DNS-rebinding protections for any website research.
- Audit logs must be append-only within their retention window. Audit
  retention must be longer than prospect data retention so that compliance
  reviews can verify past decisions after prospect records are purged. Define
  separate retention schedules for: prospect data (per source
  `retentionDays`), audit events (minimum 2 years or as approved), and
  suppression records (retained as long as needed to honour objections).
- Audit log access must be restricted to owner/admin/compliance roles. Audit
  records must not be editable or deletable through the API.
- Erasure requests must not delete audit events. When prospect data is erased,
  audit events should retain the event type, timestamps, policy versions, and
  anonymised identifiers sufficient to demonstrate compliance, but must remove
  or anonymise any directly identifying personal data from the audit record.
- Implement a scheduled retention enforcement worker that purges or anonymises
  expired prospect data, stale evidence, and expired channel decisions. The
  worker must support dry-run mode and produce audit events for every purge.

## 14. DPIA Requirement

A Data Protection Impact Assessment must be completed before production
processing begins. The DPIA must cover:

- prospect research and profiling for fundraising purposes;
- processing individual and sole-trader personal data for postal outreach;
- channel decision logic as automated decision-making;
- large-scale processing of charity-register and Companies House data;
- data sharing with print/mail providers when provider API mode is enabled;
- retention and suppression lifecycle.

The DPIA is a Phase 0 deliverable and a launch gate. It must be reviewed by a
UK data-protection adviser and updated when processing activities change
materially.

## 15. Migration Plan

1. Add new docs and launch gates.
2. Add shared channel/entity/reason-code types.
3. Add database migrations for charity principal, channel decisions, address
   assessment, preference checks, and Do Not Contact tokens.
4. Refactor eligibility tests first.
5. Implement channel-aware eligibility.
6. Add API routes and update existing export route to fail closed.
7. Update web labels and campaign/prospect UI.
8. Add import/review workflows for postal-letter records.
9. Add self-print fulfilment manifests.
10. Add optional fulfilment provider adapter behind disabled-by-default config.
11. Add compliance corpus tests.
12. Enable exports only after launch gates pass.

## 16. Test Plan

Unit tests:

- Charity principal verification accepts matching active register records.
- Charity principal verification rejects stale, inactive, or conflicting data.
- Corporate email rejects individuals, sole traders, personal domains, named
  mailboxes, stale domains, and missing lawful basis.
- Postal-letter decision rejects missing address provenance, missing source
  permission, preference-service matches, and missing transparency text.
- Individual/sole-trader postal decision rejects unapproved public-address
  context, likely home-address risk, and sensitive targeting risk.
- Suppression always overrides eligibility.
- Do Not Contact confirmation suppresses future email, postal, phone, and
  review exports for matching identifiers.

API tests:

- Owner-only principal verification and launch controls.
- Cross-tenant denial for campaigns, prospects, suppressions, exports, and
  reviews.
- Export routes fail when launch gates are incomplete.
- Export routes re-evaluate decisions inside the transaction.
- Do Not Contact token and printed-code routes do not expose prospect data.
- Old generic export route fails closed.
- Source disablement supersedes affected channel decisions and blocks export.
- Preference imports cannot create visible personal-data lists for ordinary
  users.
- Self-print fulfilment produces a manifest but sends no third-party data.
- Provider fulfilment refuses to run when provider approval, test mode,
  template, Do Not Contact, or channel decision is missing.
- Provider webhook signatures are verified before status updates.

Corpus tests:

- Mixed companies, charities, individuals, unsupported entities, stale records,
  suppressions, and wrong-channel records produce zero false exports.

Browser QA:

- Dashboard renders principal and launch state.
- Campaign builder cannot start without channel policy.
- Review queue shows reason codes and no override for quarantine.
- Mobile views do not hide suppression or launch-gate warnings.

## 17. Rollback

Disable `corporateEmailExportsEnabled` and `postalExportsEnabled` independently.
If any wrong-channel or suppressed export occurs, disable all production exports,
preserve audit/evidence, notify the compliance owner, and run incident review
before re-enabling.

Cloudflare deployment rollback must also disable production export and provider
fulfilment flags if Zero Trust policies expose private routes, the frontend
points at the wrong API/tunnel target, local origin health fails, or provider
webhook validation fails.
