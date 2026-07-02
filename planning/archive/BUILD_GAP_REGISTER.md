# Build Gap Register

## 1. Purpose

This register tracks the gap between the current copied Lead Gen V2 foundation
and the Buttercup Lead Gen product described in the PRD/TDD.

Use this file as the build backlog guardrail. A feature is not build-complete
until its row here is implemented, tested, audited, and reflected in the launch
checklist.

## 2. Current State Summary

The current codebase has:

- authentication, owner/member roles, sessions, and account setup;
- campaigns, campaign principals, and manual target intake;
- Companies House configuration and company-status verification;
- source policy registry for a narrow B2B source set;
- suppression entries for company, domain, mailbox, person, and phone;
- public objection, rights-request, and complaint forms;
- launch gates and production export lock;
- deterministic company/listing/domain/mailbox review foundations;
- generic eligible-lead CSV export;
- package-level channel decision logic started in `packages/eligibility`.

It does not yet have the Buttercup-specific data model, API, UI, export routes,
Do Not Contact token flow, charity-register integrations, postal workflows, or
compliance corpus.

## 3. Gap Matrix

| ID | Gap | Current state | Required build outcome | Blocks launch |
|---|---|---|---|---|
| G01 | Charity principal data model | No `charity_principals` or `charity_verifications` tables | Store Buttercup Charity Commission, OSCR, CCNI if needed, Companies House, status, evidence, freshness, and conflicts | Yes |
| G02 | Charity principal verification integrations | Companies House only | Charity Commission and OSCR verification adapters, with current evidence and failure states | Yes |
| G03 | Prospect model | Existing `campaign_leads` assumes company/domain/mailbox | Channel-neutral `campaign_prospects` or equivalent entity/address/mailbox model | Yes |
| G04 | Postal address model | No prospect postal address table or assessment | `prospect_addresses` and `postal_address_assessments` with source, address context, freshness, and review outcome | Yes |
| G05 | Outreach channel decisions | Package function exists, but no persisted channel decision table | `outreach_channel_decisions` persisted and referenced by every export row | Yes |
| G06 | Preference-service checks | No FPS/MPS/import model | `preference_service_checks` and import workflow for FPS/MPS/internal lists where applicable | Yes |
| G07 | Do Not Contact token model | Public objection form exists, no token/code flow | `do_not_contact_tokens` for email URLs, letter QR/printed code, and manual entry | Yes |
| G08 | Suppression target coverage | DB enum lacks `postal_address`, `charity`, and all-channel scope | Expanded suppression target types and all-channel Do Not Contact behavior | Yes |
| G09 | Source policy breadth | UI/API only support `company-website` and `licensed-provider` | Source classes for Companies House, Charity Commission, OSCR, CCNI, client-provided prospect, charity website, preference service, suppression import | Yes |
| G10 | Source policy metadata | Source schema lacks approved channels, retention, attribution, reuse notes | Source registry captures channel, retention, attribution, prohibited reuse, owner, evidence, expiry | Yes |
| G11 | API uses old eligibility | Routes still use `evaluateEligibility()` and `campaign_leads` | Intake/review/export use `evaluateOutreachChannel()` and persisted channel decisions | Yes |
| G12 | Charity settings routes | No `/api/settings/charity-principal` | Owner routes to view, verify, refresh, and audit Buttercup principal | Yes |
| G13 | Channel policy routes | No channel-policy API | Owner routes for corporate email, postal letter, consent-required, and disabled channels | Yes |
| G14 | Prospect intake routes | `/targets` is company/email-only | `/prospects` accepts organisation, charity, sole trader, individual, email, domain, and postal address evidence | Yes |
| G15 | Review queue scope | Review queue covers listing/domain only | Review queue covers principal conflicts, entity, address context, postal fairness, preference matches, and Do Not Contact disputes | Yes |
| G16 | Export routes | Only `/export.csv` exists | Separate `/export-email.csv`, `/export-letters.csv`, `/review-consent-required.csv`, and `/review-quarantine.csv`; old route fails closed | Yes |
| G17 | Export manifests | CSV only, no channel manifest | Manifest includes channel, purpose, policy versions, source summary, Do Not Contact info, count, and evidence references | Yes |
| G18 | Letter export | No postal export | Letter CSV includes approved postal fields, printed Do Not Contact code, and template manifest reference | Yes |
| G19 | Email export update | Generic role-mailbox export | Corporate email export includes Do Not Contact URL/code and channel decision ID | Yes |
| G20 | Public Do Not Contact flow | Existing objection form only | Public token/code confirmation flow that suppresses all matching channels by default | Yes |
| G21 | UI branding/domain language | UI still says Lead Gen V2, leads, corporate B2B | Buttercup prospect operations language throughout UI | No, but required before pilot |
| G22 | Dashboard | No charity principal/channel status | Dashboard shows Buttercup verification, launch gates, email eligible, letter eligible, review, quarantine, Do Not Contact health | Yes |
| G23 | Campaign builder | Campaign captures B2B principal/company number | Builder captures fundraising purpose, appeal type, audience, channels, exclusions, LIA reference, expiry, owner attestation | Yes |
| G24 | Prospect review UI | Company/mailbox table only | UI shows entity type, address context, source evidence, channel decision, and reason codes | Yes |
| G25 | Source registry UI | Limited B2B source classes | UI supports all BCT source classes and channel/retention fields | Yes |
| G26 | Compliance operations UI | Rights/complaints/jobs only | UI adds Do Not Contact, preference imports, principal verification, channel policy, and postal review queues | Yes |
| G27 | Compliance corpus | Unit tests only for eligibility package | End-to-end corpus for principal, entities, email, postal, Do Not Contact, preference matches, disabled sources, wrong-channel exports | Yes |
| G28 | API tenant tests | Some API tests exist | Tenant isolation tests for new prospects, addresses, channel decisions, preferences, tokens, exports, and reviews | Yes |
| G29 | Export transaction tests | Existing export gate tests are limited | Tests prove every export re-evaluates channel decision, suppression, preference, freshness, and source state transactionally | Yes |
| G30 | Legal/professional evidence | Planning identifies review needs | Launch gates require evidence references for LIA, privacy notice, Fundraising Regulator review, source approvals, retention, FPS/MPS | Yes |
| G31 | Operational drills | Not performed | Backup restore, incident, source kill-switch, wrong-channel rollback, Do Not Contact, and preference import drills completed | Yes |
| G32 | Self-print letter fulfilment | No fulfilment mode | Owner can generate self-print letter files/manifests without sending data to a third party | Yes |
| G33 | Print/mail provider API fulfilment | No provider adapter | Optional disabled-by-default provider integration, e.g. Stannp, with approval evidence, test mode, submission, failure, and webhook status tracking | Yes |
| G34 | Cloudflare deployment architecture | Current app has no Cloudflare deployment plan | Cloudflare Pages frontend, Zero Trust access, local API/Postgres/Redis, and Cloudflare Tunnel/private origin architecture recorded | Yes |
| G35 | Local API private exposure | API is a local Fastify Node server | API reachable through Cloudflare Tunnel or equivalent private origin path without exposing Postgres/Redis publicly | Yes |
| G36 | Local storage and jobs operations | Current app assumes local PostgreSQL, Redis, worker, and generated files | Local Postgres, Redis, worker, backups, health checks, and export/evidence storage are operationally documented and tested | Yes |
| G37 | GitHub/Cloudflare Pages CI/CD | No GitHub workflows or Pages deploy config | GitHub PR checks and Cloudflare Pages preview/staging/production deploy workflows exist | Yes |
| G38 | Zero Trust routing | No Cloudflare Access policy plan in app config | Private frontend/API protected by Zero Trust; public rights/complaints/Do Not Contact/provider webhook routes explicitly bypassed and rate-limited | Yes |
| G39 | Data retention enforcement | No automated purge of expired prospect data, evidence, or channel decisions | Scheduled worker job purges or anonymises expired records per source `retentionDays`; separate audit and suppression retention schedules; dry-run mode; audit events for every purge | Yes |
| G40 | Monitoring and alerting | No alerting for tunnel disconnect, service downtime, backup failure, or anomalous exports | Alerts fire on tunnel disconnect, API/database/Redis downtime, backup failure, anomalous export volume, retention job failure, and suppression override attempts | Yes |
| G41 | DPIA | No Data Protection Impact Assessment | DPIA completed covering prospect research, individual/sole-trader postal processing, channel decision profiling, and any large-scale processing; reviewed by UK data-protection adviser | Yes |
| G42 | Public form accessibility | No WCAG compliance for public forms | Public Do Not Contact, objection, rights, and complaint forms meet WCAG 2.1 AA | No, but required before pilot |
| G43 | Disaster recovery beyond backups | Only PostgreSQL backup/restore planned | Redis loss recovery, local disk failure recovery for export/evidence/fulfilment files, and tunnel credential backup/restore are tested | Yes |
| G44 | Audit log governance | Audit events exist but no retention, access, or integrity policy | Audit logs have defined retention (longer than prospect data), access controls, append-only integrity, and interaction with erasure requests documented | Yes |
| G45 | Register API unavailability handling | No handling for Charity Commission, OSCR, or Companies House API downtime | Fail closed with `held` state, automatic retry with bounded retries, owner option to route to postal review, audit events for unavailability and resolution | Yes |
| G46 | Policy version staleness at export | No comparison of decision policy version against current policy at export time | Export gate compares `policyVersion` on each decision against current source/channel policy; stale decisions are re-evaluated before export | Yes |
| G47 | Backup encryption key management | No key management plan for encrypted PostgreSQL backups | Asymmetric encryption (age or GPG), private key stored separately from backups, key location and rotation in ops runbook, decryption tested in restore drill | Yes |
| G48 | Breach incident data for trustees | App does not surface incident data in a form trustees can use for ICO/Charity Commission reporting | App produces structured incident reports (what happened, affected records, timeline, remediation) that trustees can use as input to their own breach notification process; breach notification itself is a trustee/governance responsibility outside this app | Deferred — required before production |
| G49 | DSAR search screen | No way to pull all data held on a person or business | Admin-only DSAR screen: search by name, email, address, company number, or charity number; pulls all matching prospect entities, channel decisions, suppressions, exports, audit events, and Do Not Contact tokens into a downloadable report for admin review before responding; manual email/document search remains a separate process outside the app | Yes |

## 4. Build Order

The canonical phase ordering is in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). The mapping below shows which
gaps are addressed in each phase.

1. **Phase 0 — Documentation:** G41 (DPIA).
2. **Phase 1 — Schema and types:** G01 (schema), G03 (schema), G04 (schema),
   G05 (schema), G06 (schema), G07 (schema), G08 (schema), G09 (schema),
   G10 (schema).
3. **Phase 2 — Verification and decision services:** G02, G06 (logic), G07
   (logic), G11, G12, G13, G15.
4. **Phase 3 — API, exports, and fulfilment:** G06 (API), G14, G16, G17, G18,
   G19, G20, G29, G32, G33.
5. **Phase 4 — Cloudflare, CI/CD, and Zero Trust:** G34, G35, G36, G37, G38,
   G40, G43.
6. **Phase 5 — UI:** G21, G22, G23, G24, G25, G26, G42.
7. **Phase 6 — Corpus, security, and hardening:** G27, G28, G30, G31, G39,
   G44, G47.
8. **Phase 5 — UI (admin):** G49 (DSAR search screen).
9. **Deferred — required before production:** G48 (breach incident data for
   trustees).

Gaps that span multiple phases (G06, G07) have their scope noted in
parentheses: schema in Phase 1, logic/verification in Phase 2, API routes in
Phase 3. A gap is complete only when all phases are done.

G45 (register API unavailability) spans Phases 2 and 3: the `held` outcome
and retry logic in Phase 2, the API routes and owner routing option in
Phase 3. G46 (policy version staleness) is Phase 3 — it is enforced by the
export gate.

Phase 7 (Controlled Launch) has no gaps assigned — it is the launch process
itself, gated by all prior phases being complete.

## 5. Completion Rules

Each gap is complete only when:

- database migrations and rollback are present where data changes are involved;
- API and UI behavior are implemented where user-facing behavior is required;
- tenant, role, audit, and source-policy checks exist;
- stale, suppressed, preference-match, disabled-source, and wrong-channel cases
  are tested;
- launch checklist entries are updated with evidence requirements;
- production exports still fail closed by default.
