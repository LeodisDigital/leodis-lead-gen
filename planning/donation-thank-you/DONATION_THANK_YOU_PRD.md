# Product Requirements: Donation Thank-You Letters and Emails

**Product:** Buttercup Children's Trust Admin System
**Feature:** Automated and manual thank-you correspondence for donations
**Date:** 2026-07-01
**Status:** Planning

---

## 1. Problem Statement

When BCT receives a donation, there is no system support for sending a thank-you letter or email. Trustees must manually compose and send correspondence outside the system with no record kept of what was sent or when. This risks:

- Donors not being thanked at all (especially when workload is high).
- Inconsistent messaging and tone.
- No audit trail of donor correspondence.
- Missed opportunity to include Gift Aid declarations or charity details.

## 2. Goal

Give BCT admins the ability to send a thank-you letter (printable) or email directly from a donation record, with templates, merge fields, a correspondence log, and a printable letter layout.

## 3. Scope

### In Scope

- Thank-you email sending from a donation record (using an HTTP email API).
- Thank-you letter generation as a printable HTML page (browser print-to-PDF).
- Configurable email templates with merge fields (donor name, charity name, date, etc.).
- Configurable letter templates with merge fields and BCT letterhead.
- Correspondence log on the donation record (what was sent, when, by whom, via which channel).
- Bulk "send thank-you" action from the donation list (email only).
- "Thank-you sent" flag/date visible on the donation list for quick triage.
- Audit trail of all correspondence events.

### Out of Scope

- Automated sending on donation creation (all sends are admin-initiated).
- Postal delivery integration (letters are printed locally by trustees).
- Payment/amount tracking (the donations table has no amount field — this feature thanks the donor, not the donation amount).
- Integration with lead-gen (this is purely a BCT admin feature).
- Rich HTML email (plain-text email is simpler, more deliverable, and consistent with BCT's communication style).

## 4. User Stories

1. As an admin, I want to send a thank-you email to a donor from their donation record so that I can acknowledge their contribution promptly.
2. As an admin, I want to generate a printable thank-you letter for a donor so that I can post it when they have no email address.
3. As an admin, I want to see whether a thank-you has already been sent for a donation so that I don't send duplicates.
4. As an admin, I want to customise the thank-you message templates so that I can update the wording without code changes.
5. As an admin, I want to send thank-you emails to multiple donors at once so that I can clear a backlog efficiently.
6. As an admin, I want a record of all correspondence sent to a donor so that I have a full audit trail.

## 5. Data Available for Merge Fields

From the `donations` table:

| Field | Merge Tag | Notes |
|---|---|---|
| `donors_name` | `{{donor_name}}` | May be a person or organisation |
| `charity` | `{{charity_name}}` | The charity/organisation the donor represents |
| `email` | `{{donor_email}}` | May be empty — email not possible without this |
| `address` | `{{address}}` | Street address |
| `post_town` | `{{post_town}}` | Town/city |
| `post_code` | `{{post_code}}` | Postcode |
| `county` | `{{county}}` | County |
| Current date | `{{today}}` | Formatted as e.g. "1 July 2026" |
| Donation ID | `{{donation_id}}` | Formatted as DO0001 |

Note: there is no donation amount field. If amount is needed in the letter, it must be typed manually by the admin at send time or pulled from fundraising campaign attribution if linked.

## 6. Constraints

- **Cloudflare Workers runtime** — no Node.js APIs, no native modules, no filesystem.
- **Email sending** — must use an HTTP-based email API (e.g. Resend, Mailgun, Postmark) called via `fetch()`. API key stored as a Wrangler secret.
- **Letter/PDF generation** — server-side PDF is impractical in Workers. Use a clean HTML print layout with `window.print()` (same pattern as the existing Meeting Pack feature).
- **D1 (SQLite)** — all new tables/columns via additive migration.
- **No external template engine** — use simple string replacement for merge fields (same pattern as fundraising wording helper).

## 7. Open Questions

| # | Question | Options | Decision |
|---|---|---|---|
| 1 | Which email API provider? | Resend (simple, cheap), Mailgun, Postmark, Amazon SES via HTTP, Google Workspace Gmail API | **Gmail API** via Google Workspace service account with domain-wide delegation. Setup guide in `planning/GMAIL_API_SETUP_GUIDE.md`. |
| 2 | Should templates be stored in the database or as code? | DB (editable by admin) vs code (simpler, version-controlled) | **DB** — admin-editable with draft preview before sending. |
| 3 | Should the letter include a Gift Aid declaration section? | Yes (common for UK charities) / No (keep it simple) | **Yes** — signpost Gift Aid and encourage declarations. |
| 4 | Should there be a "donation amount" free-text field on the thank-you form for the admin to type in? | Yes / No (just thank without mentioning amount) | **Yes** — add an `amount` field to the donations table. Include in thank-you. Backfill historical amounts where data exists. |
| 5 | Should bulk email require confirmation? | Yes (show preview + count) / No (just send) | **Deprioritised** — the workflow is: attribute donation to campaign → send thank-you. This is a per-donation action, not bulk. |
