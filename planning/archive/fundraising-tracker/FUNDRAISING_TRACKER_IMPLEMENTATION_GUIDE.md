# Implementation Guide: Fundraising Tracker

**Product:** Buttercup Children's Trust Admin System  
**Feature:** Appeal fundraising tracker  
**Date:** 2026-07-01  
**Status:** Builder guide  

---

## 1. Purpose

This is the step-by-step build guide for the fundraising tracker. Use it alongside:

- `FUNDRAISING_TRACKER_PRD.md`
- `FUNDRAISING_TRACKER_TDD.md`
- `FUNDRAISING_TRACKER_IMPLEMENTATION_PLAN.md`
- `FUNDRAISING_TRACKER_BUILD_GAP_REGISTER.md`

The phase-one rule is simple: add new fundraising functionality without damaging the existing applicant, donation, enquiry, action, document, user, or audit workflows.

## 2. Build Order

1. Create the D1 migration.
2. Add query helpers.
3. Add wording helper.
4. Add admin-only fundraising routes.
5. Mount routes and add admin navigation.
6. Add applicant detail fundraising panel.
7. Add donation detail fundraising panel.
8. Add dashboard/reporting.
9. Add tests/manual regression checklist.
10. Deploy after remote backup/export.

## 3. Files To Add

```text
migrations/0005_fundraising_tracker.sql
src/db/fundraising-queries.js
src/helpers/fundraising-wording.js
src/helpers/fundraising-audit.js
src/routes/fundraising.js
src/templates/components/fundraising-panel.js
```

Optional if the route grows too large:

```text
src/templates/fundraising/campaign-form.js
src/templates/fundraising/campaign-detail.js
src/templates/fundraising/dashboard.js
```

## 4. Files To Edit

```text
src/index.js
src/templates/layout.js
src/routes/applicants.js
src/routes/donations.js
```

Only edit applicant/donation routes to add admin-only panels and links. Do not change existing save/update SQL unless absolutely necessary.

## 5. Step 1: Add Migration

Create:

```text
migrations/0005_fundraising_tracker.sql
```

Use the schema from `FUNDRAISING_TRACKER_TDD.md`:

- `fundraising_campaigns`
- `fundraising_campaign_applicants`
- `fundraising_campaign_donations`
- `fundraising_campaign_channels`

Important implementation details:

- Use `CREATE TABLE IF NOT EXISTS`.
- Use `CREATE INDEX IF NOT EXISTS`.
- Keep foreign keys to existing `applicants(id)` and `donations(id)`.
- Do not alter existing tables.
- Do not add fundraising columns to `applicants` or `donations`.

Local check:

```bash
npm run dev
```

Apply locally through Wrangler/D1 in the same style as existing migrations.

Remote rule:

```bash
wrangler d1 export bct-db --remote --output backup.sql
```

Run this before applying the migration remotely. Verify the backup file is readable before proceeding.

## 6. Step 2: Add Query Helpers

Create:

```text
src/db/fundraising-queries.js
```

Implement:

```js
export async function listFundraisingCampaigns(db, filters) {}
export async function getFundraisingCampaign(db, id) {}
export async function getFundraisingCampaignApplicants(db, campaignId) {}
export async function getFundraisingCampaignDonations(db, campaignId) {}
export async function getFundraisingCampaignChannels(db, campaignId) {}
export async function createFundraisingCampaign(db, input, actorEmail) {}
export async function updateFundraisingCampaign(db, id, input, actorEmail) {}
export async function attachApplicantToCampaign(db, campaignId, applicantId, actorEmail, relationship, notes) {}
export async function detachApplicantFromCampaign(db, linkId) {}
export async function attachDonationToCampaign(db, campaignId, donationId, amount, note, actorEmail) {}
export async function detachDonationFromCampaign(db, linkId) {}
export async function addFundraisingCampaignChannel(db, campaignId, channel, reference, notes, actorEmail) {}
```

Rules:

- Use `db.prepare(...).bind(...).first()`, `.all()`, or `.run()`.
- Sanitize sort columns if list sorting is added.
- Return plain objects/arrays, not HTML.
- Calculate `raised_amount` from `fundraising_campaign_donations`.
- Treat missing campaign/applicant/donation rows as errors at route level.

## 7. Step 3: Add Wording Helper

Create:

```text
src/helpers/fundraising-wording.js
```

Implement:

```js
export function suggestFundraisingWording({ townCity, conditionWording, needWording }) {
  if (townCity && conditionWording && needWording) {
    return `A child in ${townCity} is living with ${conditionWording} and needs ${needWording}.`;
  }
  if (townCity && needWording) {
    return `A child in ${townCity} needs help with ${needWording}.`;
  }
  if (needWording) {
    return `A child needs help with ${needWording}.`;
  }
  return "";
}
```

Keep this deterministic. AI extraction can be added later, but phase one should work with manual editing.

## 8. Step 4: Add Admin-Only Routes

Create:

```text
src/routes/fundraising.js
```

Skeleton:

```js
import { Hono } from 'hono';
import { layout } from '../templates/layout.js';

export const fundraisingRoutes = new Hono();

fundraisingRoutes.use('*', async (c, next) => {
  if (!c.get('isAdmin')) return c.text('Forbidden', 403);
  await next();
});
```

Add routes:

```text
GET  /fundraising
GET  /fundraising/campaigns
GET  /fundraising/campaigns/new
GET  /fundraising/campaigns/new/:applicantId
POST /fundraising/campaigns
GET  /fundraising/campaigns/:id
GET  /fundraising/campaigns/:id/edit
POST /fundraising/campaigns/:id
POST /fundraising/campaigns/:id/applicants
POST /fundraising/campaigns/:id/applicants/:linkId/delete
POST /fundraising/campaigns/:id/donations
POST /fundraising/campaigns/:id/donations/:linkId/delete
POST /fundraising/campaigns/:id/channels
```

Every POST must use the existing CSRF protection flow.

## 9. Step 5: Mount Routes

Edit:

```text
src/index.js
```

Add:

```js
import { fundraisingRoutes } from './routes/fundraising.js';
```

Mount:

```js
app.route('/fundraising', fundraisingRoutes);
```

Place it with the other app routes, before the 404 handler.

## 10. Step 6: Add Admin Navigation

Edit:

```text
src/templates/layout.js
```

Add a `Fundraising` nav item only when `isAdmin` is true.

Target URL:

```text
/fundraising
```

Keep styling consistent with existing nav.

## 11. Step 7: Campaign Form

Fields:

- `internal_title` required
- `public_title`
- `status`
- `town_city`
- `condition_wording`
- `need_wording`
- `suggested_wording`
- `final_wording`
- `target_amount`
- `start_date`
- `end_date`
- `notes`

Status select values:

- `Draft`
- `Active`
- `Paused`
- `Completed`
- `Cancelled`

Prefill from applicant when route includes `:applicantId`:

- `town_city` from `applicants.post_town`
- `need_wording` from `applicants.reason_for_grant`
- `internal_title` from applicant ID plus need/location
- `suggested_wording` from helper

Do not prefill final public wording with child full name by default.

## 12. Step 8: Campaign Detail

Show:

- title/status;
- town/city;
- condition and need wording;
- suggested/final wording;
- target, raised, remaining;
- linked applicants table;
- linked donations table;
- channel/reference notes;
- edit button;
- attach applicant form;
- attach donation form.

Linked applicant row:

- applicant ID;
- applicant name;
- child first/name as existing admin data;
- town;
- reason for grant;
- relationship;
- detach action.

Linked donation row:

- donation ID;
- charity/donor;
- attributed amount;
- attribution note;
- detach action.

## 13. Step 9: Applicant Detail Panel

Edit:

```text
src/routes/applicants.js
```

On show page:

1. If `isAdmin`, load fundraising campaigns linked to that applicant.
2. Render an admin-only panel in the side panel area.
3. Include:
   - linked campaigns;
   - raised/target summary;
   - create fundraising campaign link;
   - attach to existing campaign form or link.

Do not show this panel to non-admin users.

## 14. Step 10: Donation Detail Panel

Edit:

```text
src/routes/donations.js
```

On show page:

1. If `isAdmin`, load campaign attributions linked to that donation.
2. Render an admin-only panel.
3. Include:
   - linked campaigns;
   - attributed amount per campaign;
   - attach to campaign form/link.

Do not alter donation save behavior.

## 15. Step 11: Dashboard

Route:

```text
GET /fundraising
```

Show:

- active campaigns count;
- total target for active campaigns;
- total raised for active campaigns;
- total remaining for active campaigns;
- recently updated campaigns (updated within the last 7 days);
- campaigns needing donation attribution (active campaigns with £0 raised);
- quick links to all campaigns and new campaign.

Default excludes:

- `Cancelled`

## 16. Step 12: Audit Events

Use existing audit helper for campaign create/update (field-level diff via `logAudit()`).

For link/unlink events, create a dedicated helper:

```text
src/helpers/fundraising-audit.js
```

```js
export async function logFundraisingEvent(db, eventType, payload, actorEmail) {
  // Inserts directly into audit_log with eventType as action_type
  // and payload as changes JSON
}
```

Write events for:

- campaign created (use `logAudit()`);
- campaign updated (use `logAudit()`);
- applicant attached (use `logFundraisingEvent()`);
- applicant detached (use `logFundraisingEvent()`);
- donation attached (use `logFundraisingEvent()`);
- donation detached (use `logFundraisingEvent()`);
- channel added (use `logFundraisingEvent()`).

Keep payloads small:

```js
{
  fundraisingCampaignId,
  applicantId,
  donationId,
  attributedAmount
}
```

## 17. Step 13: Manual Test Checklist

Run these locally before remote deployment:

- Non-admin cannot open `/fundraising`.
- Admin can open `/fundraising`.
- Admin can create a campaign manually.
- Admin can create a campaign from an applicant.
- Applicant prefill uses town/city and reason for grant.
- Admin can edit campaign wording.
- Admin can attach an applicant.
- Duplicate applicant attach shows a friendly warning and asks admin to confirm (may be intentional).
- Admin can attach a donation (attributed amount field starts blank, admin enters the amount).
- Admin can attach same donation to a second campaign with split amount.
- Over-allocated donation (sum of attributions > donation total) shows a warning but does not block save.
- Campaign totals update after attach/detach.
- Applicant detail still loads for existing records.
- Donation detail still loads for existing records.
- Applicant edit/save still works.
- Donation edit/save still works.
- Existing CSV exports still work.
- Existing document panels still work.

## 18. Step 14: Remote Deployment Checklist

Before remote migration:

1. Export/backup D1 database.
2. Confirm current production admin app is healthy.
3. Apply migration.
4. Deploy Worker.
5. Smoke test admin login through Zero Trust.
6. Smoke test applicant list/detail.
7. Smoke test donation list/detail.
8. Smoke test fundraising dashboard.
9. Create one test campaign only if agreed.
10. Remove test data if it should not remain.

## 19. Rollback

Fast rollback:

1. Revert route mounting in `src/index.js`.
2. Remove/hide fundraising nav item.
3. Redeploy Worker.

Do not drop the new tables during fast rollback. Leaving unused tables is safer than losing manually entered fundraising records.

Data rollback, only if explicitly approved:

1. Export new fundraising tables.
2. Confirm export file is readable.
3. Drop new fundraising tables.

## 20. Lead-Gen Later

Do not build lead-gen integration in phase one.

When ready, implement:

- token-protected BCT admin context endpoint;
- lead-gen encrypted setting for BCT admin URL/token;
- lead-gen campaign appeal context picker;
- lead-gen `bct_fundraising_campaign_id` and context snapshot fields.

Keep income and donation attribution in BCT admin.

