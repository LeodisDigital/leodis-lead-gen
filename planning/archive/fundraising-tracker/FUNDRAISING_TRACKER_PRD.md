# Product Requirements Document: Fundraising Tracker

**Product:** Buttercup Children's Trust Admin System  
**Feature:** Appeal fundraising tracker and lead-gen context source  
**Version:** 1.0  
**Date:** 2026-07-01  
**Status:** Planning  
**Owner:** Leodis Digital / Buttercup Children's Trust

---

## TLDR

Add an admin-only appeal intake and approval surface inside BCT admin. BCT admin staff review new appeals, approve or reject them, and maintain the source appeal record and donation attribution.

Once approved, lead-gen becomes the working campaign vehicle. It owns the campaign wording, prospecting, compliance checks, outreach decisions, and execution. BCT admin later receives the result summary.

---

## ELI10

Buttercup already stores families and children who need help. The new system answers:

- Which children or appeals have we fundraised for?
- What wording did we use?
- What town or city did we mention?
- How much were we trying to raise?
- Which donations came in for that appeal?
- How much is still needed?

Only admins can see the money stats for now.

---

## 1. Goals

1. Track fundraising campaigns linked to existing applicant records.
2. Preserve the current applicant, donation, enquiry, action, and document data exactly as-is.
3. Give admins a clear fundraising dashboard without exposing stats to ordinary users.
4. Support manual donation attribution first.
5. Capture appeal approval and source appeal details in BCT admin.
6. Hand approved appeals into lead-gen for campaign wording, targeting, and execution.

## 2. Non-Goals

- No automatic donation matching in phase 1.
- No new public donation/payment processing.
- No role overhaul beyond using the existing admin flag.
- No approval workflow for comms wording.
- No automated AI extraction in phase 1 unless added as an optional helper later.
- No prospect or lead ownership inside BCT admin.

## 3. Users

| User | Needs |
|---|---|
| Admin | Review appeals, approve/reject them, attach donations, view summary/outcome records. |
| Lead fundraiser | Run approved campaigns in lead-gen, draft wording, manage targeting and progress. |
| Non-admin staff | No access to fundraising stats in phase 1. |
| Lead-gen user | Later: import approved appeal context, not raw appeal records or donation data. |

## 4. Key Product Decisions

| Decision | Outcome |
|---|---|
| Condition/illness source | Capture in BCT admin at approval time; fundraiser can manually confirm/edit in lead-gen after handoff. |
| Comms location | Use town/city wording such as "Leeds"; avoid postcode-level wording in comms. |
| Stats visibility | Admin-only for phase 1. |
| Donation attribution | Manual attachment by admins in BCT admin. |
| Source of truth | BCT admin owns appeal intake, approval state, donation attribution, and outcome summaries. Lead-gen owns the working campaign after approval. |
| Build order | Build BCT admin intake/approval first, then lead-gen execution integration. |

## 5. Functional Requirements

### 5.1 Appeal Fundraising Campaigns

| ID | Requirement |
|---|---|
| FT-01 | BCT admins can record a new appeal and approve or reject it. |
| FT-02 | Approved appeals can be handed off to lead-gen as campaign-ready context. |
| FT-03 | BCT admin records the source appeal metadata needed for the handoff. |
| FT-04 | Lead-gen campaign records must store an internal title, public/comms title, status, target amount, start date, end date, town/city, and notes. |
| FT-05 | Lead-gen campaign records must store the wording used or proposed for comms. |
| FT-06 | Lead-gen campaign records must store condition/illness wording and item/need wording as editable text. |
| FT-07 | Lead-gen campaigns can link to multiple approved appeals when fundraising around a grouped need. |
| FT-08 | Lead-gen campaigns show total attached donations, target amount, and remaining amount. |

### 5.2 Appeal Context Extraction

| ID | Requirement |
|---|---|
| FT-09 | Approved appeal handoff should prefill town/city from BCT admin appeal data. |
| FT-10 | Approved appeal handoff should prefill need wording from BCT admin appeal data where available. |
| FT-11 | Lead fundraisers can manually edit all imported wording before saving the campaign. |
| FT-12 | The UI should offer safe draft wording such as "A child in [town] is living with [condition] and needs [item]." |
| FT-13 | The app must make clear the wording is editable campaign text, not a legal approval state. |

### 5.3 Donation Attribution

| ID | Requirement |
|---|---|
| FT-14 | BCT admin can attribute donations to the source appeal. |
| FT-15 | Lead-gen can reference those attributions without becoming the financial source of truth. |
| FT-16 | Attachment can store an attributed amount, because one donation may support several appeals. |
| FT-17 | BCT admin donation detail pages should show linked appeals to admins. |
| FT-18 | Lead-gen campaign detail pages should show the imported appeal context and any approved outcome summary. |

### 5.4 Admin Reporting

| ID | Requirement |
|---|---|
| FT-19 | BCT admins can view an appeal approval and outcome dashboard. |
| FT-20 | Dashboard shows approval queue, active campaigns, total target, total raised, total remaining, and recently updated campaigns. |
| FT-21 | BCT admins can filter appeals and outcomes by status, town/city, date range, and need/condition text. |
| FT-22 | BCT admins can see outcome summaries by appeal, applicant/child, town/city, and channel. |
| FT-23 | Approval and outcome stats are hidden from non-admin users. |

### 5.5 Lead-Gen Context Readiness

| ID | Requirement |
|---|---|
| FT-24 | Approved appeals must have stable IDs that lead-gen can reference later. |
| FT-25 | BCT admin should expose only selected approved context to lead-gen in phase 2: appeal ID, title, town/city, need wording, condition wording, suggested comms wording, and approval state. |
| FT-26 | Lead-gen must not receive applicant contact details, child full names, exact addresses, or raw notes. |
| FT-27 | BCT admin remains the source of truth for appeal approval and outcome summaries. |

## 6. Data Requirements

### 6.1 New Data

The system needs new tables for:

- appeal intake and approval records;
- campaign/workspace records in lead-gen;
- campaign-donation links or attribution records;
- campaign channel entries;
- optional extraction/audit notes.

### 6.2 Existing Data

The feature reads existing:

- `applicants.id`, `applicants.childs_name`, `applicants.post_town`, `applicants.post_code`, `applicants.reason_for_grant`, `applicants.grant_amount`, `applicants.final_total`, `applicants.status`;
- `donations.id`, `donations.charity`, `donations.donors_name`, `donations.post_town`, `donations.region`, `donations.status`;
- `actions` for contextual notes, where useful.

Existing records should not be destructively changed. Approved appeal data can be copied into lead-gen as a snapshot.

## 7. Privacy And Safety Requirements

| ID | Requirement |
|---|---|
| PS-01 | Campaign comms location defaults to town/city, not postcode. |
| PS-02 | Suggested wording should avoid child full name and exact address. |
| PS-03 | Admins can override wording because the fundraiser manually controls final comms. |
| PS-04 | The system should not automatically publish or send comms. |
| PS-05 | Lead-gen integration must be allowlisted and token-protected before use. |
| PS-06 | Audit logs should record create/update/link/unlink actions. |

## 8. Admin Screens

| Screen | Purpose |
|---|---|
| Approval dashboard | Admin-only summary of approvals, outcomes, targets, raised amounts, and active campaigns. |
| Appeal list | Search/filter all appeals and their approval state. |
| Campaign detail | View imported appeal context, wording, totals, notes, and actions. |
| Campaign form | Create/edit campaign fields and suggested wording in lead-gen. |
| Applicant detail addition | BCT admin panel showing appeal review and approval controls. |
| Donation detail addition | BCT admin panel showing attached appeals and attribution controls. |

## 9. Success Measures

- Admins can answer "has this appeal been approved?" from BCT admin.
- Lead-gen can run the approved appeal without owning the source appeal record.
- Donations can be attributed in BCT admin without changing the base donation record.
- No current applicant/donation/enquiry workflows are broken.
- Lead-gen has a clear approved source for campaign context without owning the appeal intake record.

## 10. Implementation Decisions (Resolved)

1. **Attributed donation amount default:** Leave blank. Admin enters the amount manually.
2. **Grouped campaigns:** An applicant may appear on the same campaign more than once. The UI warns on duplicate and asks the admin to confirm.
3. **Condition/need extraction:** Phase 1 reads `reason_for_grant` only. Actions can be shown alongside the form for manual copy/edit in phase 1.1.
4. **Dashboard and cancelled campaigns:** Cancelled campaigns are excluded from headline active totals by default.
