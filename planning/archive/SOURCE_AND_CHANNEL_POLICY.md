# Source And Channel Policy

## 1. Purpose

This policy defines which sources and outreach channels Buttercup Lead Gen may
use. The app must fail closed when a source, field, use, channel, or review date
is missing.

## 2. Source Registry Fields

Each source policy must store:

- source class and hostname/register identifier;
- owner and reviewer;
- terms/licensing evidence reference;
- approved uses;
- approved fields;
- approved channels;
- attribution requirement;
- retention period;
- rate and volume limits;
- robots/technical restrictions where relevant;
- reviewed date and expiry date;
- enabled/disabled state;
- kill-switch reason when disabled.

## 3. MVP Source Classes

| Source class | Default state | Approved use before launch |
|---|---|---|
| `companies-house` | Disabled until configured | Corporate-recipient verification and Buttercup company verification. |
| `charity-commission` | Disabled until configured | Buttercup principal and registered-charity verification. |
| `oscr` | Disabled until configured | Buttercup principal verification; do not generate marketing lists from OSCR data. |
| `ccni` | Disabled until reviewed | Northern Ireland charity verification if needed. |
| `client-provided-prospect` | Disabled | Intake only with provenance declaration and channel approval. |
| `company-website` | Disabled | Verification evidence and role mailbox extraction after terms/robots review. |
| `charity-website` | Disabled | Verification evidence only unless separate approval exists. |
| `licensed-provider` | Disabled | Only fields and uses permitted by contract. |
| `print-mail-provider` | Disabled | Letter fulfilment only after data-processing, security, API, and template approval. |
| `preference-service` | Required for launch | Matching against relevant preference/suppression records. |
| `suppression-import` | Required for launch | Internal objections, FPS requests, and manual suppressions. |

## 4. Channel Policy

| Channel | Export file | Required decision |
|---|---|---|
| Corporate email | `export-email.csv` | `eligible` only. |
| Postal letter | `export-letters.csv` | `eligible` only, separated by organisation vs named-person address. |
| Consent required | `review-consent-required.csv` | Review list only; no outreach export. |
| Quarantine | `review-quarantine.csv` | Internal review only; no outreach export. |

The default export route must not mix channels. Every row must carry:

- campaign ID;
- prospect ID;
- channel;
- decision ID;
- decision policy version;
- source policy version;
- evidence IDs;
- suppression/preference result summary;
- export timestamp.

## 5. Letter Fallback Rule

If a prospect cannot be verified as a corporate subscriber or registered
business for electronic marketing, the app may consider postal-letter review
only when all of the following are true:

1. The postal address came from an approved source.
2. The source permits fundraising prospecting and the selected field.
3. The campaign has an approved lawful-basis record.
4. The letter template includes Buttercup identity and objection route.
5. Suppression and preference checks pass.
6. The record is not vulnerable, sensitive, deceptive, or prohibited by policy.

Otherwise the prospect remains quarantined.

## 6. Individual And Sole-Trader Postal Decision

Individuals and sole traders may be considered for postal contact only after a
review decision. The reviewer must answer:

1. Was the name/address published by the person, their business, a public
   register, a client-provided source, or a licensed provider?
2. Did the source context make fundraising contact reasonably expected, or was
   the address published for a narrow unrelated purpose?
3. Is the address a business/contact address, a registered-office-style address,
   or a likely home address?
4. Is the targeting based on sensitive, vulnerable, health, financial hardship,
   age, disability, bereavement, or other high-risk signals?
5. Is only the minimum data needed for one respectful postal approach being
   used?
6. Has the campaign LIA approved this audience and channel?
7. Do suppression, FPS, MPS, and internal Do Not Contact checks pass?
8. Does the letter clearly identify Buttercup and provide an easy Do Not Contact
   route?

If any answer is missing, negative, or unclear, the decision must be `review` or
`quarantine`, not `letter_eligible`.

## 7. Do Not Contact

Every outreach channel must offer a clear Do Not Contact route.

For email exports:

- include a Do Not Contact URL in the export manifest for mail-merge templates;
- generate a prospect/channel token for each exported row;
- record the token creation and use in audit events.

For postal-letter exports:

- include a short URL and QR code placeholder in the letter manifest;
- include a unique printed code that maps back to the exported prospect;
- allow manual entry by staff when someone phones or writes back.

When a person confirms Do Not Contact, the app must:

- create active suppression records for the strongest known identifiers;
- default to all-channel suppression for the person/address/mailbox/entity;
- supersede current channel decisions;
- prevent all future exports for matching identifiers;
- retain only the minimum data needed to honour the objection;
- keep an audit event with source, time, and actor or public token.

## 8. Source Kill-Switch Behaviour

Disabling a source must:

- stop new collection jobs;
- prevent pending jobs from using the source;
- supersede affected current channel decisions;
- block exports that depend on that source;
- write an audit event with actor, reason, and time.

## 9. Letter Fulfilment Providers

Self-print is the baseline fulfilment mode. It creates a downloadable
letter-ready file and manifest for Buttercup to print and post manually.

Provider API fulfilment is optional. Stannp is an example provider, not a
required dependency. Any provider must be configured as a disabled-by-default
`print-mail-provider` with:

- contract and data-processing evidence;
- security review and API-key secret storage;
- test-mode validation before live submission;
- approved template mapping;
- Do Not Contact code support;
- provider job/status tracking;
- webhook signature validation if webhooks are used;
- kill switch that blocks new submissions immediately.

Provider API mode must re-check Do Not Contact, suppression, source,
preference, template, and channel decision state immediately before submission.

## 10. Register API Unavailability

When a verification register API (Charity Commission, OSCR, Companies House)
is unavailable at verification or export time:

1. Fail closed. Do not proceed with stale or absent verification.
2. Affected prospects enter a `held` state with reason
   `REGISTER_API_UNAVAILABLE`.
3. The owner chooses one of:
   - **Hold and retry:** prospects remain held until the API recovers and
     verification succeeds (automatic retry at configurable interval, default
     15 minutes, with bounded retries).
   - **Route to postal review:** if the prospect has a verified postal address
     from an approved source, request postal-letter eligibility assessment
     instead. All postal requirements must still pass independently.
4. Held prospects must not appear in any export.
5. Audit events record the unavailability, hold, retries, and resolution.

## 11. Review Cadence

- Source policy review: at least quarterly.
- Charity principal verification: every 30 days and before export.
- Companies House recipient verification: every 30 days and before export.
- Postal-address assessment: every 90 days or sooner if source requires.
- Preference/suppression imports: before launch and before each export batch.

## 12. Launch Blockers

Production exports must remain disabled if:

- any enabled source has expired review;
- Buttercup principal verification is stale;
- channel policy is missing;
- Do Not Contact links/codes are not working;
- self-print manifest or provider API fulfilment is not approved for the
  selected campaign;
- FPS/internal suppression import process is not working;
- a compliance-corpus test produces a false or wrong-channel export;
- a source's terms become uncertain.
