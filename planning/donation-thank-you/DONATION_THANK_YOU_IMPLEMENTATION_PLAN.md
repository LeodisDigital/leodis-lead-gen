# Implementation Plan: Donation Thank-You Correspondence

**Product:** Buttercup Children's Trust Admin System
**Feature:** Thank-you letters and emails for donations
**Date:** 2026-07-01
**Status:** Planning complete; implementation not started

---

## 1. Delivery Strategy

Build in BCT admin only. No lead-gen changes required.

| Phase | Name | Outcome |
|---|---|---|
| 1 | Email provider setup and send helper | Resend (or chosen provider) API key configured; email helper tested |
| 2 | Schema and merge helpers | Migration applied; merge field renderer and field builder working |
| 3 | Template management | Admins can create, edit, and list thank-you templates; defaults seeded |
| 4 | Single donation thank-you (email + letter) | Send email or print letter from donation detail page; correspondence logged |
| 5 | Donation list enhancements | "Thanked" column and "not yet thanked" filter on donation list |
| 6 | Bulk thank-you | Send thank-you emails to multiple un-thanked donations at once |

## 2. Phase 1: Email Provider Setup

Tasks:

1. Choose and sign up for email provider (recommended: Resend).
2. Verify a sending domain or use Resend's default shared domain for testing.
3. Store API key as Wrangler secret: `wrangler secret put RESEND_API_KEY`.
4. Create `src/helpers/thank-you-email.js` with `sendThankYouEmail()`.
5. Test with a manual fetch call to confirm delivery.

Acceptance:

- API key is set as a secret.
- A test email can be sent from a Worker context.

## 3. Phase 2: Schema and Merge Helpers

Tasks:

1. Write and apply migration `0006_thank_you_correspondence.sql`.
2. Create `src/helpers/thank-you-merge.js` with `renderMergeFields()` and `buildMergeFields()`.
3. Create `src/db/thank-you-queries.js` with CRUD for templates and correspondence log.

Acceptance:

- Migration applies cleanly without altering existing tables.
- Merge fields render correctly with donation data.
- Correspondence log entries can be inserted and queried by donation ID.

## 4. Phase 3: Template Management

Tasks:

1. Create `src/routes/thank-you.js` with template CRUD routes.
2. Build template list, create, and edit screens.
3. Seed default email and letter templates on first access (or via migration INSERT).
4. Mount routes in `src/index.js`.

Acceptance:

- Admins can create, edit, and view templates.
- Templates support `{{merge_tag}}` syntax.
- Default templates are available without manual setup.

## 5. Phase 4: Single Donation Thank-You

Tasks:

1. Add thank-you panel to donation show page (`src/templates/components/thank-you-panel.js`).
2. Build thank-you send form with template selector, preview, and optional amount field.
3. Implement email send route — render template, call email API, log correspondence, set `thank_you_sent_at`.
4. Build printable letter page (`src/templates/thank-you-letter.js`) with BCT letterhead and print styles.
5. Implement letter log route — mark letter as printed in correspondence log.
6. Add correspondence log view to donation detail.

Acceptance:

- Email sends and arrives with correct merge fields.
- Letter prints cleanly on A4 with correct layout.
- Correspondence log shows all sends with timestamps and admin name.
- `thank_you_sent_at` flag is set on first send.
- Sending again is allowed but previous correspondence is visible.

## 6. Phase 5: Donation List Enhancements

Tasks:

1. Add "Thanked" column to donation list showing date or empty.
2. Add filter option to show only un-thanked donations.
3. Style the thanked indicator.

Acceptance:

- Admins can quickly see which donations need thanking.
- Filter reduces the list to only un-thanked records.

## 7. Phase 6: Bulk Thank-You

Tasks:

1. Build bulk thank-you page showing un-thanked donations with email addresses.
2. Add select-all/individual checkboxes.
3. Show confirmation with count and template preview before sending.
4. Send emails in sequence, logging each result.
5. Show results summary (sent/failed counts).

Acceptance:

- Bulk send only targets donations with email addresses.
- Each send is individually logged.
- Failed sends are reported without stopping the batch.
- Confirmation step prevents accidental bulk sends.

## 8. Risk Register

| Risk | Mitigation |
|---|---|
| Email provider rate limits | Bulk sends in sequence with small delay; Resend free tier is 100/day |
| Donor email bounces | Log failure status; don't retry automatically |
| Template wording inappropriate | Admin reviews preview before every send |
| Duplicate thank-yous | Show previous correspondence prominently; allow but don't encourage |
| Email lands in spam | Use verified sending domain; plain-text format has good deliverability |

## 9. Dependencies

- Email API provider account and verified sending domain.
- BCT charity details (registered number, address) for letterhead.
- Decision on open questions in PRD (provider, Gift Aid section, templates in DB vs code).

## 10. Definition of Done

- Migration applied to local and remote D1.
- Email sends work from donation detail.
- Letter prints cleanly.
- Templates are admin-editable.
- Correspondence log is complete and auditable.
- Bulk send works for un-thanked donations.
- Donation list shows thanked status.
- All routes are admin-only.
