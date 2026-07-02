# Implementation Plan: Buttercup Lead Gen

## 1. Delivery Strategy

Adapt the existing Lead Gen V2 app in place. Keep the fail-closed compliance
foundation, but change the product from B2B email lead export to charity
fundraising prospect research with channel-specific decisions.

| Phase | Name | Outcome |
|---|---|---|
| 0 | Documentation and policy baseline | PRD, TDD, DPIA, compliance register, source/channel policy, launch checklist approved. |
| 1 | Data model and policy types | Charity principal, prospect entities, addresses, channels, and reason codes exist. |
| 2 | Channel-aware eligibility | Email, letter, consent-required, and quarantine decisions are deterministic and tested. |
| 3 | API and export gates | Principal verification, prospect intake, review, and channel exports fail closed. |
| 4 | Cloudflare deployment foundation | Pages, local API tunnel/private origin, GitHub CI/CD, local operations, Zero Trust architecture, and monitoring/alerting are implemented. |
| 5 | Web app adaptation | Buttercup dashboard, campaign builder, review, compliance, and launch controls work. Public forms target WCAG 2.1 AA before pilot. |
| 6 | Corpus, security, and operations | Zero wrong-channel exports, tenant isolation, source controls, backup, retention enforcement, disaster recovery, monitoring, and incident controls pass. |
| 7 | Controlled launch | Legal/fundraising approval, pilot, manual audit, then limited production export. |

Note: Section numbers are offset from phase numbers by +2 (Section 3 = Phase 1,
Section 6 = Phase 4, etc.) because Sections 1 and 2 are preamble. Use phase
numbers when referencing work.

## 2. Phase 0: Documentation And Policy Baseline

Deliverables:

- PRD approved by product/compliance owner.
- TDD approved by engineering owner.
- DPIA completed and reviewed by UK data-protection adviser.
- Compliance decision register reviewed by UK data-protection/fundraising adviser.
- Source and channel policy approved.
- Launch checklist mapped into app launch gates.
- Build gap register reviewed and accepted as the implementation backlog.
- Test corpus defined before implementation.

Exit criteria:

- No production build task depends on an unresolved legal assumption.
- DPIA is completed and signed off, including individual/sole-trader postal
  processing and any profiling or large-scale processing.
- Letter fallback policy is explicitly approved or remains disabled.
- Every source and channel has a named owner.
- Every gap in [BUILD_GAP_REGISTER.md](BUILD_GAP_REGISTER.md) is assigned to a
  phase and has acceptance evidence.

### 2.1 Current Build Gap Baseline

The current codebase is not yet the Buttercup product. It is a copied Lead Gen
V2 foundation with some package-level channel decision logic. The build must
close the gaps tracked in [BUILD_GAP_REGISTER.md](BUILD_GAP_REGISTER.md).

Critical current gaps:

- no charity principal tables or Charity Commission/OSCR verification routes;
- no channel-neutral prospect/address model;
- no persisted outreach channel decisions;
- no preference-service checks or Do Not Contact token/code flow;
- no postal-letter assessment or letter export;
- no self-print fulfilment manifest or print/mail provider API path;
- no Cloudflare Pages deployment, local API tunnel/private origin, GitHub
  workflows, or Zero Trust route plan;
- API routes still use the old company/mailbox lead model;
- UI still uses old B2B lead language and views;
- source registry does not yet cover BCT source classes or channel metadata;
- compliance corpus and launch evidence are not complete.

## 3. Phase 1: Data Model And Policy Types

### 3.1 Shared Types

Extend `packages/shared` with:

- recipient entity kinds;
- outreach channels;
- channel outcomes;
- charity/principal/postal/preference reason codes.

### 3.2 Policy Package

Extend `packages/policy` with:

- charity-source classes;
- channel launch flags;
- role-mailbox allowlist retained from Lead Gen V2;
- source policy schema fields for approved channels and retention;
- letter template policy version.

### 3.3 Database

Add Drizzle migrations for:

- `charity_principals`;
- `charity_verifications`;
- `prospect_entities`;
- `prospect_addresses`;
- `postal_address_assessments`;
- `outreach_channel_decisions`;
- `preference_service_checks`;
- `do_not_contact_tokens`;
- expanded suppression target types.

Retain current tables where useful, but do not rely on `campaign_leads` as the
only export decision surface.

### 3.4 Tests

- Type/schema tests for new reason codes and source policy fields.
- Migration smoke test.
- Backward compatibility test proving old generic export path stays disabled.
- Gap-register test coverage map showing which tests cover G01-G31.

## 4. Phase 2: Channel-Aware Eligibility

### 4.1 Eligibility Engine

Replace or wrap `evaluateEligibility` with:

```ts
evaluateOutreachChannel(input): ChannelDecision
```

The function must return all failed requirements, not only the first failure.

Corporate email requires:

- verified Buttercup principal;
- approved campaign;
- verified active company/LLP;
- current listing/domain/mailbox assessment;
- role mailbox on verified domain;
- approved source;
- lawful-basis and transparency records;
- no active suppression.

Postal letter requires:

- verified Buttercup principal;
- approved campaign;
- address provenance;
- approved source for postal fundraising;
- individual/sole-trader fairness decision when the recipient is a person,
  sole trader, or likely home address;
- lawful-basis and transparency records;
- approved letter template manifest;
- preference/suppression checks;
- working Do Not Contact token/code generation;
- selected fulfilment mode: self-print or approved provider API;
- no prohibited targeting flags.

### 4.2 Verification

Add deterministic verification helpers for:

- charity-principal verification;
- charity-recipient verification;
- postal-address assessment;
- preference-service matching.
- Do Not Contact token confirmation and all-channel suppression.

### 4.3 Tests

- Unit tests for every reason code.
- Corpus tests for zero false email exports and zero wrong postal exports.
- Suppression tests proving every active suppression overrides channel
  eligibility.

## 5. Phase 3: API And Export Gates

### 5.1 Settings And Principal Routes

Implement:

```text
GET  /api/settings/charity-principal
POST /api/settings/charity-principal/verify
GET  /api/settings/channel-policy
POST /api/settings/channel-policy
POST /api/settings/preference-checks/import
```

### 5.2 Campaign And Prospect Routes

Adapt:

```text
POST /api/campaigns
POST /api/campaigns/:id/prospects
GET  /api/campaigns/:id/prospects
POST /api/reviews/:id/decide
```

Campaign creation must capture fundraising purpose, appeal type, audience,
channel, expiry, and owner attestation.

### 5.3 Export Routes

Implement separate exports:

```text
GET /api/campaigns/:id/export-email.csv
GET /api/campaigns/:id/export-letters.csv
GET /api/campaigns/:id/review-consent-required.csv
GET /api/campaigns/:id/review-quarantine.csv
POST /api/campaigns/:id/letter-fulfilment/self-print
POST /api/campaigns/:id/letter-fulfilment/provider
POST /api/public/do-not-contact
POST /api/public/do-not-contact/confirm
```

The existing generic `/api/campaigns/:id/export.csv` should return a
fail-closed error unless a future migration fully removes it.

### 5.4 Transactional Gate

Before writing any export row:

1. lock the prospect or use an equivalent transaction-safe pattern;
2. re-run principal, source, freshness, suppression, preference, and channel
   eligibility checks;
3. persist the exact channel decision;
4. create Do Not Contact tokens/codes for exportable rows;
5. create a fulfilment manifest for self-print or provider API mode;
6. write the export/fulfilment rows in the same transaction;
7. exclude and audit failures.

Phase 3 is not complete until the old `/api/campaigns/:id/export.csv` route
cannot export mixed-channel data. It must either return a fail-closed error or
delegate to a channel-specific export only after the requested channel is
explicit and verified.

## 6. Phase 4: Cloudflare Deployment Foundation

### 6.1 Architecture Decision

Architecture decision:

- Cloudflare Pages hosts the frontend.
- Fastify API, PostgreSQL, Redis, and background worker stay local.
- Cloudflare Tunnel or equivalent private origin path exposes the API to
  Cloudflare without exposing PostgreSQL/Redis.
- Zero Trust protected routes and public bypass routes.

The detailed decision is recorded in
[CLOUDFLARE_DEPLOYMENT_PLAN.md](CLOUDFLARE_DEPLOYMENT_PLAN.md).

### 6.2 Deliverables

- Cloudflare Pages project for the web app.
- Cloudflare Tunnel or equivalent private origin path to the local API.
- GitHub Actions for PR checks and deploys.
- Environment separation for preview, staging, and production.
- Local secrets management for API keys and token secrets.
- Local PostgreSQL, Redis, worker, and storage runbooks.
- Automated local PostgreSQL backups and restore tests.
- Zero Trust Access policy for private app/admin/API routes.
- Explicit public route policy for rights, complaints, Do Not Contact, and
  provider webhooks.
- Monitoring and alerting for tunnel health, local service health, backup
  failures, and anomalous export volumes.

### 6.3 Exit Criteria

- Preview deploy runs from GitHub.
- Local API is reachable only through approved Cloudflare/private route.
- PostgreSQL and Redis are not publicly exposed.
- Private routes require Zero Trust Access.
- Public routes are reachable without Access but do not leak record existence.
- Local API/database/worker health checks and backups are working.
- Monitoring alerts fire on tunnel disconnect, API/database/Redis downtime,
  backup failure, and anomalous export volume.
- Production export and provider fulfilment flags remain disabled by default.

## 7. Phase 5: Web App Adaptation

Required screens:

- Buttercup dashboard with principal verification and launch state.
- Campaign builder for fundraising purpose, appeal, audience, channel, cap,
  and expiry.
- Prospect review with entity/address/mailbox/source evidence.
- Channel decision views: email eligible, letter eligible, consent required,
  review, held, quarantine.
- Compliance operations for suppression, rights, complaints, and preference
  checks.
- Public Do Not Contact confirmation flow for email links, letter QR codes,
  printed letter codes, and manual staff entry.
- Letter fulfilment screen where owner chooses self-print download or approved
  provider API submission.
- Provider settings screen for disabled-by-default print/mail integrations.
- Source registry and launch controls.
- Admin-only DSAR search: single input for name, email, address, company
  number, or charity number; pulls all matching prospect entities, channel
  decisions, suppressions, exports, audit events, and Do Not Contact tokens
  into a downloadable report for admin review before responding. Manual
  email/document search outside the app is the admin's responsibility.

UI copy must not imply that a quarantined or consent-required record can be
contacted.

Public-facing forms (Do Not Contact, objection, rights, complaints) should
target WCAG 2.1 AA accessibility. This is required before pilot, not a launch
blocker.

## 8. Phase 6: Corpus, Security, And Operations

### 8.1 Corpus

Build fixtures for:

- Buttercup verified/stale/conflicting;
- companies, LLPs, charities, public bodies, sole traders, individuals,
  unincorporated associations, dormant/dissolved companies, and unknowns;
- role/named/personal-domain mailboxes;
- postal addresses with valid, stale, and prohibited source provenance;
- individual/sole-trader public address contexts, including business address,
  likely home address, unrelated publication context, and sensitive targeting
  risk;
- suppression and preference matches;
- Do Not Contact token/code confirmations;
- self-print letter fulfilment;
- provider API fulfilment in test mode, provider failure, webhook status update,
  and suppression-before-submit;
- disabled source policies.
- export route attempts for every wrong channel and stale-decision path;
- tenant-crossing attempts for prospects, addresses, tokens, channel decisions,
  preferences, reviews, and exports.

### 8.2 Security

Run and pass:

- tenant isolation tests;
- owner/admin privilege tests;
- SSRF, DNS rebinding, unsafe redirect, and oversized-page tests;
- CSV formula-injection tests;
- secret-redaction and audit tests.
- Cloudflare Pages and tunnel/private-origin config tests;
- Zero Trust route policy tests or documented manual verification.

### 8.3 Data Retention Enforcement

Implement automated retention enforcement:

- scheduled worker job that purges or anonymises expired prospect data,
  stale evidence, expired channel decisions, and old export records according
  to each source policy's `retentionDays`;
- separate retention schedule for audit logs (append-only, longer retention
  than prospect data, not subject to prospect erasure);
- separate retention schedule for suppression records (retained as long as
  needed to honour objections, even after prospect erasure);
- dry-run mode that reports what would be purged before enabling live
  deletion;
- audit event for every retention purge with counts, policy version, and
  actor.

### 8.4 Disaster Recovery

Beyond PostgreSQL backup/restore, verify:

- Redis data loss recovery: confirm that all Redis-dependent state (job
  queues, leases, rate-limit counters) can be rebuilt or safely lost without
  data corruption or silent export failures;
- local disk failure: export files, evidence files, and fulfilment manifests
  are recoverable from database records or a secondary storage location;
- tunnel credential and config backup: Cloudflare Tunnel credentials and
  config are backed up separately from the database and can be restored
  without re-provisioning;
- backup encryption key management: use asymmetric encryption (age or GPG) so
  the backup server holds only the public key; private decryption key stored
  separately (password manager, offline USB, or equivalent); key location and
  rotation documented in ops runbook; decryption tested in quarterly restore
  drill.

### 8.5 Operations

Complete:

- backup restore test;
- disaster recovery drill covering Redis loss, disk failure, and tunnel
  credential restore;
- incident-response exercise;
- source kill-switch drill;
- wrong-channel export rollback drill;
- preference/suppression import dry run;
- retention enforcement dry run proving correct purge scope and audit;
- Do Not Contact link/code drill for email, post, and manual entry;
- self-print production dry run;
- provider API test-mode dry run if a provider is enabled;
- Cloudflare Pages preview/staging/production deployment dry run;
- local API tunnel/private-origin failover and recovery drill;
- Zero Trust public/private route verification;
- monitoring alert verification proving alerts fire for tunnel disconnect,
  API/database/Redis downtime, backup failure, anomalous export volume, and
  retention job failure;
- launch-gate evidence review proving each mandatory gate has an attached
  evidence reference before export flags can be enabled.

## 9. Phase 7: Controlled Launch

1. Complete every launch checklist item.
2. Enable only manually approved sources.
3. Run a pilot with exports disabled and manually audit channel decisions.
4. Enable one channel for one pilot campaign.
5. Manually audit every exported row.
6. Review objections, complaints, source behaviour, and false positives.
7. Expand channels or volume only after compliance owner sign-off.

## 10. Rollback Triggers

Immediately disable production exports if:

- a suppressed prospect is exported;
- a cold individual email export is possible;
- a wrong-channel export occurs;
- Do Not Contact links/codes fail or suppression is not applied;
- self-print manifest omits required Do Not Contact details;
- provider API sends a suppressed or wrong-channel item;
- provider webhook validation fails or provider terms become uncertain;
- Zero Trust exposes a private route publicly;
- Cloudflare deployment uses the wrong frontend environment or tunnel target;
- PostgreSQL, Redis, local API, or tunnel health cannot be maintained;
- Buttercup principal verification becomes stale/conflicting;
- source terms become uncertain;
- tenant isolation or export transaction safety fails;
- rights, complaints, or suppression operations cannot meet obligations.

## 11. Definition Of Done

A feature is done only when:

- source and channel policy impact is identified;
- tenant and role checks are implemented;
- audit events and metrics exist;
- stale, suppressed, wrong-channel, and source-disabled cases are tested;
- rights and complaint impacts are considered;
- documentation and launch checklist are updated;
- no launch gate is weakened or bypassed.
