# Launch Checklist

## 1. Governance

- [ ] Build gap register reviewed; every launch-blocking gap is closed or
      explicitly deferred behind a disabled feature flag.
- [ ] DPIA completed covering prospect research, individual/sole-trader postal
      processing, channel decision profiling, provider data sharing, and
      retention lifecycle; reviewed by UK data-protection adviser.
- [ ] Buttercup charity principal verified against Charity Commission.
- [ ] Buttercup OSCR record verified if Scottish registration remains active.
- [ ] Buttercup Companies House record verified.
- [ ] Controller/processor allocation approved.
- [ ] Fundraising campaign LIA approved.
- [ ] Privacy notice and Article 14 process approved.
- [ ] Fundraising Regulator Code review completed.
- [ ] Retention and suppression retention schedule approved, including separate
      schedules for prospect data, audit logs, and suppression records.
- [ ] Do Not Contact wording, confirmation flow, and suppression retention approved.
- [ ] Named compliance owner and escalation rota recorded.

## 2. Source Approval

- [ ] Companies House source policy approved.
- [ ] Charity Commission source policy approved.
- [ ] OSCR source policy approved, including no marketing-list generation from OSCR data.
- [ ] Client-provided prospect source policy approved or disabled.
- [ ] Website source-class policy approved or disabled.
- [ ] Licensed provider policy approved or disabled.
- [ ] Print/mail provider policy approved or disabled.
- [ ] Preference-service/suppression import policy approved.
- [ ] Every enabled source has evidence reference, approved fields, approved uses, retention, review date, and expiry.

## 3. Channel Approval

- [ ] Corporate email policy approved.
- [ ] Postal organisation-letter policy approved.
- [ ] Postal named-person review policy approved or disabled.
- [ ] Individual/sole-trader postal fairness checklist approved.
- [ ] Individual electronic marketing disabled unless consent/soft-opt-in evidence workflow is approved.
- [ ] Telephone disabled.
- [ ] Letter template manifest approved.
- [ ] Letter template includes short Do Not Contact URL, QR placeholder, and printed code.
- [ ] Self-print fulfilment manifest approved.
- [ ] Provider API fulfilment disabled unless contract, DPA, security review,
      test mode, template mapping, and webhook/status handling are approved.
- [ ] Email template/export manifest includes Do Not Contact URL.
- [ ] Export manifests include channel-specific compliance notice.

## 4. Product Readiness

- [ ] UI no longer uses old Lead Gen V2/B2B lead language for Buttercup
      workflows. (Required before pilot, not a launch blocker.)
- [ ] Dashboard shows charity principal status.
- [ ] Campaign builder captures fundraising purpose, appeal, channel, audience, and expiry.
- [ ] Review queue shows entity, address, mailbox, source, and channel reason codes.
- [ ] Suppression workflows cover mailbox, domain, company, charity number, person, phone, postal address, and campaign.
- [ ] Do Not Contact confirmation suppresses all matching channels by default.
- [ ] Public objection, rights, correction, and complaint forms are live.
- [ ] Public forms (Do Not Contact, objection, rights, complaints) meet
      WCAG 2.1 AA accessibility requirements. (Required before pilot, not a
      launch blocker.)
- [ ] Production export flags default to disabled.
- [ ] Old generic export route fails closed or is removed.
- [ ] Owner can choose self-print or approved provider API mode for letter
      fulfilment.

## 5. Technical Readiness

- [ ] Cloudflare Pages + Zero Trust + local API/Postgres/Redis decision recorded.
- [ ] Cloudflare Pages project configured from GitHub.
- [ ] Cloudflare Tunnel or equivalent private origin path configured for the
      local API.
- [ ] PostgreSQL and Redis are not publicly exposed.
- [ ] Local storage configured for exports, evidence, and fulfilment artifacts.
- [ ] Local worker/Redis/Postgres operations documented and health-checked.
- [ ] Local secrets configured outside GitHub/source for all API keys and token
      secrets.
- [ ] Preview, staging, and production environments are separated.
- [ ] Zero Trust protects private app/admin/API routes.
- [ ] Public rights, complaints, Do Not Contact, and provider webhook routes
      bypass Zero Trust intentionally and have abuse controls.
- [ ] Charity principal tables and migrations are applied.
- [ ] Prospect entity/address/channel-decision tables and migrations are
      applied.
- [ ] Preference-service and Do Not Contact token tables and migrations are
      applied.
- [ ] Database migrations applied and rollback tested.
- [ ] Channel-aware eligibility unit tests pass.
- [ ] Charity principal settings routes (`/api/settings/charity-principal`)
      are implemented and owner-only.
- [ ] Channel policy routes (`/api/settings/channel-policy`) are implemented
      and owner-only.
- [ ] Prospect intake routes (`/api/campaigns/:id/prospects`) are implemented
      with source-policy and tenant checks.
- [ ] API uses persisted outreach channel decisions for exports.
- [ ] API tenant-isolation tests pass.
- [ ] Export re-evaluation transaction tests pass.
- [ ] Do Not Contact token/code endpoints do not expose prospect data.
- [ ] Self-print fulfilment creates a manifest and sends no third-party data.
- [ ] Provider API fulfilment re-checks suppression and refuses unapproved
      providers/templates.
- [ ] Provider webhook/status handling is authenticated and audited.
- [ ] GitHub PR checks and Cloudflare deploy workflows pass.
- [ ] Source kill-switch supersedes affected channel decisions and blocks
      exports.
- [ ] SSRF/DNS-rebinding tests pass for website collection.
- [ ] CSV formula-injection tests pass.
- [ ] Backup restore test passes.
- [ ] Disaster recovery drill passes covering Redis loss, local disk failure,
      and tunnel credential restore.
- [ ] Data retention enforcement worker is running with correct purge scope,
      dry-run verified, and producing audit events.
- [ ] Audit logs are append-only, access-restricted to owner/admin/compliance,
      and not deletable through the API.
- [ ] Monitoring alerts verified for tunnel disconnect, API/database/Redis
      downtime, backup failure, anomalous export volume, and retention job
      failure.
- [ ] Public endpoint rate limits enforced at Cloudflare WAF layer for Do Not
      Contact, objection/rights/complaint forms, and provider webhooks.
- [ ] Provider webhook handlers are idempotent and deduplicate by provider
      job ID.
- [ ] Concurrent export requests for the same campaign-channel are serialised
      or rejected with a conflict error.
- [ ] Register API unavailability produces `held` state with automatic retry;
      owner can route held prospects to postal review; held prospects cannot
      export.
- [ ] Export gate rejects channel decisions made under a stale policy version
      and re-evaluates before export.
- [ ] Backup encryption uses asymmetric keys; private decryption key stored
      separately from backups; decryption tested in restore drill.
- [ ] App produces structured incident reports (affected records, timeline,
      remediation) that trustees can use for ICO/Charity Commission breach
      reporting. (Deferred — required before production.)
- [ ] Admin-only DSAR search screen implemented: search by name, email,
      address, company number, or charity number; generates downloadable
      report of all matching records for admin review before responding.
- [ ] Incident-response exercise completed.

## 6. Compliance Corpus

The corpus must pass with zero false exports:

- [ ] Verified corporate role email.
- [ ] Named-person corporate email.
- [ ] Sole trader.
- [ ] Individual email.
- [ ] Unincorporated association.
- [ ] Registered charity.
- [ ] Unsupported partnership.
- [ ] Dormant/dissolved company.
- [ ] Stale domain match.
- [ ] Stale postal address.
- [ ] Suppressed mailbox.
- [ ] Suppressed postal address.
- [ ] Do Not Contact token from email.
- [ ] Do Not Contact printed code from letter.
- [ ] Individual/sole-trader public business address approved for postal review.
- [ ] Individual/sole-trader likely home address rejected or escalated.
- [ ] Public address from unrelated context rejected.
- [ ] FPS/MPS-style preference match.
- [ ] Source disabled during active jobs.
- [ ] Wrong-channel export attempt.
- [ ] Self-print letter batch with Do Not Contact printed code.
- [ ] Provider API test submission, provider failure, and webhook/status update.
- [ ] Old `/api/campaigns/:id/export.csv` route cannot export mixed-channel
      prospects.

## 7. Launch Decision

Production exports may be enabled only when every mandatory item above is
complete and has an evidence reference in the app's launch gates.

If any wrong-channel, suppressed, or unsupported prospect is exported, disable
all production exports immediately and run incident review before re-enabling.
