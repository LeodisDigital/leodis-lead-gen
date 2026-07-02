# Product Requirements Document: Buttercup Lead Gen

## 1. Document Status

**Product:** Buttercup Lead Gen  
**Charity principal:** Buttercup Children's Trust  
**Primary market:** United Kingdom  
**Status:** Product and compliance specification for adapting Lead Gen V2  
**Last reviewed:** 2026-06-30

This document is not legal advice. Fundraising, direct marketing, UK GDPR,
PECR, source licensing, and Charity Commission/OSCR/CCNI obligations must be
reviewed by a qualified UK data-protection and charity fundraising adviser
before production outreach.

## 2. Verified Principal

Buttercup Children's Trust must be verified before any campaign can start.

Current public-register evidence:

- Charity Commission for England and Wales: charity number `1128027`.
- OSCR: Scottish charity number `SC042679`.
- Companies House: company number `06666946`, active company.
- Public charity contact details and website must be rechecked before launch.

The app must store the charity-register source, retrieval time, register
number, status, address, website, and evidence hash. A campaign cannot start if
the charity principal is unverified, stale, or conflicting across registers.

## 3. Product Scope

Buttercup Lead Gen helps the charity research organisations and people who may
be appropriate donation prospects, then classifies each prospect into an
allowed outreach channel:

- **Email eligible:** verified corporate recipient only.
- **Letter eligible:** verified postal address with lawful-basis, source,
  transparency, and suppression checks complete.
- **Consent/soft-opt-in required:** individual electronic marketing records.
- **Held:** verification API unavailable; awaiting retry or owner routing
  decision.
- **Quarantine:** anything unsupported, suppressed, stale, or unproven.

The product exports campaign-ready prospect lists and may prepare approved
postal-letter fulfilment files. It does not send email, make calls, process
donations, or manage Gift Aid in the MVP.

## 4. Core Product Decision

The existing Lead Gen V2 architecture can be repurposed because its strongest
rule is still correct: fail closed unless the entity, source, channel, purpose,
and suppression state are proven.

The rules are not identical for charity fundraising. Fundraising asks are
direct marketing, and charitable fundraising also has Fundraising Regulator Code
requirements. The app must therefore add a charity-principal verification layer
and a channel-specific decision layer instead of treating every lead as a B2B
email export.

## 5. Users And Responsibilities

- **Charity owner:** verifies Buttercup's charity/company identity, approves
  campaigns, accepts compliance policies, and exports lists.
- **Fundraising user:** creates campaigns, reviews prospects, and prepares
  outreach using approved templates outside the app.
- **Compliance reviewer:** reviews ambiguous matches, lawful-basis evidence,
  suppression, rights requests, complaints, and Fundraising Preference Service
  requests.
- **Platform administrator:** manages source policies, launch gates, jobs,
  integrations, incidents, and access.

Buttercup remains responsible for the fundraising purpose, message content,
lawful basis, privacy information, and honouring objections. The platform must
operate as a controller for prospect research unless professional review
approves a different allocation.

## 6. Outreach Eligibility Invariant

A prospect may be exported only when all relevant requirements are true:

1. Buttercup is verified as an active charity or charitable company.
2. The campaign purpose, audience, appeal, and channel are approved.
3. The source policy permits the collected fields and intended reuse.
4. The recipient entity or person is verified to the level required for the
   selected channel.
5. The address, domain, or mailbox is linked to that recipient.
6. A lawful-basis decision and transparency plan exist.
7. Suppression, objection, FPS, MPS, and client-specific do-not-contact checks
   have passed where applicable.
8. Evidence and policy versions are current.
9. The prospect is not in a prohibited category.

Failure of any condition results in quarantine. There is no user override.

## 7. Channel Policy

| Channel | MVP status | Eligibility rule |
|---|---|---|
| Corporate role email | Allowed after launch gates | Recipient is a verified corporate subscriber, mailbox is role-based, domain is verified, and suppression checks pass. |
| Corporate named email | Deferred | Requires professional approval and stricter UK GDPR controls for employee personal data. |
| Individual email/text/DM | Not allowed for cold outreach | Requires valid consent or a documented charitable purposes soft opt-in. |
| Postal letter to organisation | Allowed after launch gates | Entity/address/source/lawful-basis/suppression checks pass. |
| Postal letter to named individual | Review-only | Requires LIA, transparency, MPS/FPS screening where applicable, and senior approval. |
| Telephone | Deferred | Requires TPS/CTPS rules, call scripting, and audit controls. |

If a record cannot be verified as a charity-relevant corporate subscriber or
registered business at Companies House, the system must not export it for
email. It may enter the postal-letter review queue only if the address source
and lawful-basis controls are complete.

For individuals and sole traders, public availability of a name or address is
not enough by itself. The app must decide whether postal contact is fair and
expected in context before export. A public business address published for
trading is lower risk than a home address, but both still require source
permission, minimisation, lawful-basis assessment, transparency, and
suppression/preference checks.

## 8. Functional Requirements

### 8.1 Charity Principal Verification

| ID | Requirement | Priority |
|---|---|---|
| CP-01 | Verify Buttercup against Charity Commission, OSCR, and Companies House where identifiers exist | P0 |
| CP-02 | Store charity number, OSCR number, company number, status, registered address, public website, source URLs, retrieval time, and evidence hashes | P0 |
| CP-03 | Reverify principal status at least every 30 days and immediately before export | P0 |
| CP-04 | Quarantine campaigns if register data conflicts or the charity/company becomes inactive | P0 |

### 8.2 Campaigns

| ID | Requirement | Priority |
|---|---|---|
| CA-01 | Capture campaign name, fundraising purpose, appeal type, target audience, geography, exclusions, channel, maximum prospects, and expiry | P0 |
| CA-02 | Require owner attestation that the appeal is legal, open, honest, respectful, and aligned to Buttercup's charitable purposes | P0 |
| CA-03 | Require channel-specific lawful-basis and transparency records before campaign approval | P0 |
| CA-04 | Support draft, pending approval, approved, running, paused, cancelled, completed, expired, and suspended states | P0 |
| CA-05 | Block sensitive, vulnerable, deceptive, political, or incompatible targeting | P0 |

### 8.3 Source Governance

| ID | Requirement | Priority |
|---|---|---|
| SG-01 | Maintain source policies for Companies House, charity registers, client-provided lists, public websites, licensed providers, MPS/FPS files, and suppression imports | P0 |
| SG-02 | Workers and imports must fail closed for disabled, expired, or unapproved sources | P0 |
| SG-03 | Store source URL, retrieval time, permitted fields/use, policy version, and evidence hash for every fact | P0 |
| SG-04 | Google Maps, social networks, commercial directories, and purchased lists remain disabled until written permission permits the exact use | P0 |
| SG-05 | OSCR downloaded register data must not be used to create direct-marketing lists of charities | P0 |

### 8.4 Prospect Verification

| ID | Requirement | Priority |
|---|---|---|
| PV-01 | Verify companies and LLPs through Companies House for corporate email eligibility | P0 |
| PV-02 | Verify charities through the relevant charity regulator when the prospect is a charity | P0 |
| PV-03 | Classify unknown, sole-trader, individual, unincorporated, dissolved, dormant, insolvent, and unsupported entities as not email eligible | P0 |
| PV-04 | Match business listings, websites, addresses, and mailboxes using deterministic evidence only | P0 |
| PV-05 | Use LLMs only to extract or rank evidence, never to approve eligibility | P0 |

### 8.5 Postal Letter Eligibility

| ID | Requirement | Priority |
|---|---|---|
| PL-01 | Export postal records only when address provenance, source permission, lawful basis, transparency text, and suppression screening are complete | P0 |
| PL-02 | Distinguish organisation-addressed letters from named-individual letters | P0 |
| PL-03 | Screen individual-addressed records against internal suppression and relevant preference services before export | P0 |
| PL-04 | Include required controller identity and objection route in the letter template manifest | P0 |
| PL-05 | Keep letter exports separate from email exports and audit the selected channel | P0 |
| PL-06 | For individuals and sole traders, require a documented fairness decision covering source context, business-vs-home address, vulnerability/sensitivity risk, and reasonable expectation before postal export | P0 |
| PL-07 | Treat public internet publication as source evidence only; it must not automatically make a record contactable | P0 |
| PL-08 | Support two fulfilment modes for eligible letters: self-print download and approved print/mail provider API | P0 |
| PL-09 | Provider API fulfilment must be disabled until vendor contract, data-processing terms, security review, template approval, and test-mode proof are recorded | P0 |
| PL-10 | Letter fulfilment must record whether each item was downloaded for self-print, submitted to a provider, accepted, failed, cancelled, or suppressed before send | P0 |

### 8.6 Do Not Contact, Suppression, Rights, And Complaints

| ID | Requirement | Priority |
|---|---|---|
| SR-01 | Support suppression by mailbox, domain, company, charity number, person, postal address, phone, and campaign | P0 |
| SR-02 | Check suppression during intake, review, display, and export | P0 |
| SR-03 | Import and honour Fundraising Preference Service requests for Buttercup | P0 |
| SR-04 | Provide public objection, data-rights, correction, and complaint forms | P0 |
| SR-05 | Keep minimal suppression records after erasure where needed to prevent future marketing | P0 |
| SR-06 | Use "Do not contact" as the user-facing opt-out language across email, letters, public forms, and admin workflows | P0 |
| SR-07 | Include a Do Not Contact link in every email export manifest and a short URL/QR/code in every letter template manifest | P0 |
| SR-08 | When a Do Not Contact request is confirmed, suppress the prospect across all channels unless a narrower lawful suppression scope is explicitly selected by compliance | P0 |
| SR-09 | Store only the minimum identifiers needed to honour Do Not Contact, using normalised hashes where possible | P0 |

### 8.7 Export

| ID | Requirement | Priority |
|---|---|---|
| EX-01 | Transactionally re-evaluate every prospect immediately before export | P0 |
| EX-02 | Produce separate CSV exports for email-eligible, letter-eligible, consent-required, and quarantined records | P0 |
| EX-03 | Neutralise CSV formula injection and expose only approved fields | P0 |
| EX-04 | Export manifests must include campaign purpose, channel, policy versions, source summary, count, and compliance-use notice | P0 |
| EX-05 | Production exports remain disabled until all launch gates are complete | P0 |
| EX-06 | Postal fulfilment exports must include a fulfilment manifest with mode, template version, Do Not Contact code, recipient count, provider job IDs where applicable, and failure handling | P0 |

## 9. Required Data Model Changes

The existing schema is a good foundation. Add or adapt:

```text
CharityPrincipal
CharityVerification
ProspectEntity
ProspectAddress
OutreachChannelDecision
PostalAddressAssessment
PreferenceServiceCheck
FundraisingSuppressionEntry
DoNotContactToken
LetterTemplateManifest
LetterFulfilmentBatch
LetterFulfilmentItem
FulfilmentProvider
```

`CampaignLead` should become a channel-neutral `CampaignProspect`, or it should
gain channel decisions that prevent email assumptions from leaking into postal
exports.

### 9.1 Known Product Gaps To Build

The current app is not yet launch-ready for Buttercup. The build must account
for these product gaps:

- Buttercup charity principal verification is not implemented in the app.
- Charity Commission and OSCR integrations are missing.
- Prospect records are still shaped around company/domain/mailbox leads.
- Postal address intake, address-context review, and postal-letter eligibility
  do not exist in the API or UI.
- Outreach channel decisions are not persisted or used by exports.
- Do Not Contact token/code confirmation is not implemented.
- Preference-service checks and FPS/MPS-style imports are not implemented.
- Source registry does not yet cover all BCT source classes or channel/retention
  metadata.
- Exports are not split by email, letter, review, and quarantine.
- Letter fulfilment is not modelled; self-print and provider API modes are not
  yet implemented.
- The UI still needs Buttercup prospect language and channel decision views.

The build backlog for these gaps is tracked in
[BUILD_GAP_REGISTER.md](BUILD_GAP_REGISTER.md).

## 10. Non-Functional Requirements

- DPIA completed and reviewed before production processing begins.
- Public-facing forms (Do Not Contact, objection, rights, complaints) must
  meet WCAG 2.1 AA accessibility requirements.
- Tenant isolation and audit coverage for every API endpoint and export.
- Secrets stored outside source code; charity-register and Companies House API
  keys encrypted at rest.
- Workers isolated against SSRF, unsafe redirects, private IP ranges, oversized
  pages, and malicious content.
- Idempotent jobs, bounded retries, dead-letter state, cancellation, and trace
  IDs.
- Daily encrypted PostgreSQL backups with quarterly restore tests.
- Disaster recovery covering Redis loss, local disk failure, and tunnel
  credential restore.
- Automated data retention enforcement with dry-run mode.
- Monitoring and alerting for tunnel health, local service health, backup
  failures, retention job failures, and anomalous export volumes.
- RPO 24 hours, RTO 8 hours for MVP.
- 10,000 candidate records per campaign without duplicate or wrong-channel
  exports.

## 11. Success Metrics

| Metric | Target |
|---|---|
| Suppressed prospect export rate | 0% |
| Wrong-channel export rate | 0% |
| Cold individual email export rate | 0% |
| Email exports with verified corporate-subscriber evidence | 100% |
| Postal exports with address provenance and LIA decision | 100% |
| Exports with complete evidence lineage | 100% |
| Rights/complaint SLA breaches | 0 |
| Launch-gate bypasses | 0 |

## 12. Acceptance Test Scenarios

The test corpus must include:

- Buttercup verified, stale, inactive, and conflicting principal records.
- Active companies, LLPs, Scottish partnerships, charities, public bodies,
  sole traders, unincorporated associations, individuals, dormant/dissolved
  companies, and unknown records.
- Role, named-person, personal-domain, third-party, malformed, and obfuscated
  email addresses.
- Organisation postal addresses, named-person postal addresses, stale
  addresses, and source-prohibited addresses.
- Suppression by email, domain, company, charity number, person, phone, and
  postal address.
- FPS/MPS-style preference matches.
- Source disabled while jobs are active.
- Stale verification immediately before export.
- Cross-tenant access attempts and CSV injection payloads.
- Old generic export route attempting to export mixed channels.
- Public Do Not Contact token/code confirmation for email and printed letters.
- Preference import matching a postal prospect before export.
- Charity principal verification conflict between registers.
- Postal letter export with missing letter-template manifest.
- Postal letter self-print manifest with Do Not Contact code.
- Postal provider API test-mode submission, provider failure, and suppression
  before provider send.

## 13. Deferred Features

- Built-in email sending, telephony, SMS, and social DM.
- Automated direct-mail provider fulfilment beyond approved provider API
  handoff and status tracking.
- Donation pages, payment processing, Gift Aid, CRM synchronisation, and donor
  stewardship.
- Named-person corporate email exports.
- Consumer cold email or text marketing.
- Automated prospect scoring using sensitive or inferred personal data.

## 14. Production Launch Gates

All gates are mandatory:

- DPIA completed, reviewed, and approved.
- UK data-protection and fundraising-code professional review completed.
- Buttercup principal verification completed and current.
- Privacy notice, LIA, channel policy, letter template, and objection route live.
- Self-print and any provider API fulfilment mode approved, tested, and
  configured; unapproved provider mode disabled.
- FPS/internal suppression workflow ready.
- Every enabled source has current documented permission and approved fields.
- Security review, tenant-isolation tests, SSRF tests, and export tests pass.
- Compliance corpus passes with zero false or wrong-channel exports.
- Backup restore and incident-response exercises pass.
- Named compliance owner and escalation rota recorded.
- Production exports enabled only by owner/admin launch flag after evidence is
  attached to every gate.
- Every critical gap in [BUILD_GAP_REGISTER.md](BUILD_GAP_REGISTER.md) is
  closed or explicitly deferred with production-safe feature flags.

## 15. Source References

- ICO, Business-to-business marketing: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/
- ICO, Electronic mail marketing: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/
- ICO, Plan direct marketing: https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/plan-direct-marketing/
- ICO, Legitimate interests: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/legitimate-interests/when-can-we-rely-on-legitimate-interests/
- Fundraising Regulator, charitable purposes soft opt-in and fundraising marketing: https://www.fundraisingregulator.org.uk/about-fundraising/resources/charitable-purposes-soft-opt-and-fundraising-marketing
- Charity Commission API documentation: https://register-of-charities.charitycommission.gov.uk/en/documentation-on-the-api
- OSCR public APIs and register download terms: https://www.oscr.org.uk/about-charities/search-the-register/download-the-scottish-charity-register/oscr-public-apis/
- Buttercup Charity Commission record: https://register-of-charities.charitycommission.gov.uk/en/charity-search/-/charity-details/4043784
- Buttercup Companies House record: https://find-and-update.company-information.service.gov.uk/company/06666946
- Stannp API documentation, example print/mail provider: https://www.stannp.com/uk/direct-mail-api
