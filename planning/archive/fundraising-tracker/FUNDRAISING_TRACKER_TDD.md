# Technical Design Document: Fundraising Tracker

**Product:** Buttercup Children's Trust Admin System  
**Feature:** Appeal fundraising tracker and lead-gen context source  
**Version:** 1.0  
**Date:** 2026-07-01  
**Status:** Planning  
**Companion:** `FUNDRAISING_TRACKER_PRD.md`

---

## TLDR

Implement fundraising tracking as additive BCT admin tables and admin-only Hono routes. Existing applicant and donation tables remain the source records and are not rewritten. New link tables connect fundraising campaigns to applicants and donations.

---

## 1. Architecture

```text
Admin browser
  |
  | Cloudflare Zero Trust
  v
BCT admin Worker
  |
  | Hono routes:
  | /fundraising/*
  | /applicants/show/:id additions
  | /donations/show/:id additions
  |
  v
Cloudflare D1
  |
  | existing tables:
  | applicants, donations, actions, audit_log
  |
  | new tables:
  | fundraising_campaigns
  | fundraising_campaign_applicants
  | fundraising_campaign_donations
  | fundraising_campaign_channels
```

## 2. Design Principles

1. **Additive schema only.** Do not change existing applicant or donation rows to make this feature work.
2. **BCT admin owns fundraising stats.** Lead-gen may reference campaigns later but does not own income data.
3. **Admin-only money views.** Use the existing `isAdmin` check in phase 1.
4. **Manual attribution first.** Do not infer donations automatically.
5. **Editable extracted wording.** Any extracted condition/need text is a draft, not a locked decision.

## 3. Database Schema

### 3.1 `fundraising_campaigns`

```sql
CREATE TABLE IF NOT EXISTS fundraising_campaigns (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    internal_title          TEXT NOT NULL,
    public_title            TEXT,
    status                  TEXT NOT NULL DEFAULT 'Draft',
    town_city               TEXT,
    condition_wording       TEXT,
    need_wording            TEXT,
    suggested_wording       TEXT,
    final_wording           TEXT,
    target_amount           REAL DEFAULT 0,
    start_date              TEXT,
    end_date                TEXT,
    notes                   TEXT,
    created_by              TEXT NOT NULL,
    updated_by              TEXT,
    created_at              TEXT DEFAULT (datetime('now')),
    updated_at              TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fundraising_campaigns_status
    ON fundraising_campaigns(status);

CREATE INDEX IF NOT EXISTS idx_fundraising_campaigns_town_city
    ON fundraising_campaigns(town_city);
```

Allowed statuses:

- `Draft`
- `Active`
- `Paused`
- `Completed`
- `Cancelled`

### 3.1.1 Backup Before Remote Migration

Use `wrangler d1 export bct-db --remote --output backup.sql` before applying any remote migration. Store the backup file locally and verify it is readable before proceeding.

### 3.2 `fundraising_campaign_applicants`

```sql
CREATE TABLE IF NOT EXISTS fundraising_campaign_applicants (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    fundraising_campaign_id INTEGER NOT NULL,
    applicant_id            INTEGER NOT NULL,
    relationship            TEXT NOT NULL DEFAULT 'Primary',
    attached_by             TEXT NOT NULL,
    attached_at             TEXT DEFAULT (datetime('now')),
    notes                   TEXT,
    FOREIGN KEY (fundraising_campaign_id)
        REFERENCES fundraising_campaigns(id)
        ON DELETE CASCADE,
    FOREIGN KEY (applicant_id)
        REFERENCES applicants(id)
);

-- Note: unique index removed. An applicant may legitimately appear on the same
-- campaign more than once (e.g. different relationship types over time).
-- The UI should warn on duplicate and ask the admin to confirm.

CREATE INDEX IF NOT EXISTS idx_fundraising_campaign_applicants_applicant
    ON fundraising_campaign_applicants(applicant_id);
```

`relationship` values:

- `Primary`
- `Related`
- `Grouped`

### 3.3 `fundraising_campaign_donations`

```sql
CREATE TABLE IF NOT EXISTS fundraising_campaign_donations (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    fundraising_campaign_id INTEGER NOT NULL,
    donation_id             INTEGER NOT NULL,
    attributed_amount       REAL NOT NULL DEFAULT 0,
    attribution_note        TEXT,
    attached_by             TEXT NOT NULL,
    attached_at             TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (fundraising_campaign_id)
        REFERENCES fundraising_campaigns(id)
        ON DELETE CASCADE,
    FOREIGN KEY (donation_id)
        REFERENCES donations(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fundraising_campaign_donation_unique
    ON fundraising_campaign_donations(fundraising_campaign_id, donation_id);

CREATE INDEX IF NOT EXISTS idx_fundraising_campaign_donations_donation
    ON fundraising_campaign_donations(donation_id);
```

`attributed_amount` allows one donation to be split across several campaigns.

**Over-allocation rule:** If the sum of `attributed_amount` across all campaigns for a single donation exceeds the donation's total amount, the UI must show a warning so the admin can deal with it correctly. The save is not blocked — the warning is informational.

### 3.4 `fundraising_campaign_channels`

```sql
CREATE TABLE IF NOT EXISTS fundraising_campaign_channels (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    fundraising_campaign_id INTEGER NOT NULL,
    channel                 TEXT NOT NULL,
    campaign_reference      TEXT,
    notes                   TEXT,
    created_by              TEXT NOT NULL,
    created_at              TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (fundraising_campaign_id)
        REFERENCES fundraising_campaigns(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fundraising_campaign_channels_campaign
    ON fundraising_campaign_channels(fundraising_campaign_id);
```

Channel values (enforced via UI dropdown, not DB constraint):

- `Lead-gen`
- `Email`
- `Letter`
- `Social`
- `Phone`
- `Event`
- `Other`

## 4. Derived Totals

Do not store `raised_amount` on `fundraising_campaigns` in phase 1. Calculate it from attached donations:

```sql
SELECT
  fc.*,
  COALESCE(SUM(fcd.attributed_amount), 0) AS raised_amount,
  MAX(0, fc.target_amount - COALESCE(SUM(fcd.attributed_amount), 0)) AS remaining_amount
FROM fundraising_campaigns fc
LEFT JOIN fundraising_campaign_donations fcd
  ON fcd.fundraising_campaign_id = fc.id
WHERE fc.id = ?
GROUP BY fc.id;
```

This avoids stale totals when an attribution is changed.

## 5. Routes

All `/fundraising/*` routes require `c.get('isAdmin') === true` in phase 1.

| Route | Method | Purpose |
|---|---|---|
| `/fundraising` | GET | Dashboard. |
| `/fundraising/campaigns` | GET | Campaign list/search/filter. |
| `/fundraising/campaigns/new` | GET | New campaign form. |
| `/fundraising/campaigns/new/:applicantId` | GET | New campaign form prefilled from applicant. |
| `/fundraising/campaigns` | POST | Create campaign. |
| `/fundraising/campaigns/:id` | GET | Campaign detail. |
| `/fundraising/campaigns/:id/edit` | GET | Edit form. |
| `/fundraising/campaigns/:id` | POST | Save campaign updates. |
| `/fundraising/campaigns/:id/applicants` | POST | Attach applicant. |
| `/fundraising/campaigns/:id/applicants/:linkId/delete` | POST | Detach applicant. |
| `/fundraising/campaigns/:id/donations` | POST | Attach donation with amount. |
| `/fundraising/campaigns/:id/donations/:linkId/delete` | POST | Detach donation. |
| `/fundraising/campaigns/:id/channels` | POST | Add channel/reference note. |

## 6. Query Helpers

Add a helper module:

```text
src/db/fundraising-queries.js
```

Suggested functions:

- `listFundraisingCampaigns(db, filters)`
- `getFundraisingCampaign(db, id)`
- `getFundraisingCampaignTotals(db, id)`
- `getFundraisingCampaignApplicants(db, campaignId)`
- `getFundraisingCampaignDonations(db, campaignId)`
- `createFundraisingCampaign(db, input, actorEmail)`
- `updateFundraisingCampaign(db, id, input, actorEmail)`
- `attachApplicantToCampaign(db, campaignId, applicantId, actorEmail, relationship)`
- `attachDonationToCampaign(db, campaignId, donationId, amount, note, actorEmail)`
- `detachCampaignApplicant(db, linkId)`
- `detachCampaignDonation(db, linkId)`

Use D1 prepared statements for every query.

## 7. Wording Prefill

### 7.1 Source Fields

From applicants:

- `post_town` -> `town_city`
- `reason_for_grant` -> `need_wording` draft
- `chk_funding_category` -> fallback need/category
- `childs_name` -> admin display only, not default public wording

From actions:

- Optional phase 1.1: latest applicant actions can be shown beside the form for manual copy/edit.

### 7.2 Suggested Wording

Generate initial text using a conservative template:

```text
A child in [town_city] is living with [condition_wording] and needs [need_wording].
```

If `condition_wording` is blank:

```text
A child in [town_city] needs help with [need_wording].
```

The form must allow manual editing before save.

## 8. Admin UI Integration

### 8.1 Navigation

Add `Fundraising` to the main navigation only for admins.

### 8.2 Applicant Detail

On applicant show pages, add an admin-only panel:

- linked fundraising campaigns;
- campaign status and raised/target summary;
- "Create fundraising campaign" link;
- "Attach to existing campaign" control.

### 8.3 Donation Detail

On donation show pages, add an admin-only panel:

- linked fundraising campaigns;
- attributed amount per campaign;
- "Attach to campaign" control.

## 9. Audit Logging

Use the existing `logAudit()` for campaign create/update (field-level diff). For link/unlink events, write a dedicated `logFundraisingEvent(db, eventType, payload, actorEmail)` helper that inserts directly into `audit_log` with the event type as `action_type` and a small JSON payload as `changes`.

Recommended event names:

- `fundraising_campaign.created`
- `fundraising_campaign.updated`
- `fundraising_campaign.applicant_attached`
- `fundraising_campaign.applicant_detached`
- `fundraising_campaign.donation_attached`
- `fundraising_campaign.donation_detached`
- `fundraising_campaign.channel_added`

Payloads should include campaign ID and linked applicant/donation IDs, but avoid storing full free-text notes in audit payloads unless already present in the changed record.

## 10. Lead-Gen API Phase 2

Phase 2 can add a token-protected JSON endpoint:

```text
GET /api/fundraising/campaigns/:id/context
```

Example response:

```json
{
  "id": 12,
  "internalTitle": "Leeds mobility appeal",
  "publicTitle": "Leeds mobility appeal",
  "townCity": "Leeds",
  "conditionWording": "cerebral palsy",
  "needWording": "specialist mobility equipment",
  "suggestedWording": "A child in Leeds is living with cerebral palsy and needs specialist mobility equipment.",
  "status": "Active",
  "updatedAt": "2026-07-01T10:00:00Z"
}
```

Do not include:

- full child name;
- applicant address;
- parent/carer contact details;
- raw applicant notes;
- linked donation details;
- dashboard totals, unless explicitly approved later.

## 11. Migration Plan

1. Add new migration file, e.g. `migrations/0005_fundraising_tracker.sql`.
2. Apply locally with Wrangler/D1.
3. Verify existing applicant, donation, enquiry screens still load.
4. Seed one test fundraising campaign manually in local/dev only.
5. Deploy behind existing Zero Trust.
6. Apply remote migration after backup/export.

## 12. Test Plan

### 12.1 Unit / Helper Tests

- Safe wording generation with full, partial, and missing fields.
- Campaign total calculation from multiple donation links.
- Donation split attribution across campaigns.

### 12.2 Route Tests

- Non-admin cannot access `/fundraising`.
- Admin can create, edit, attach applicant, attach donation, and detach links.
- Duplicate applicant attachment shows a friendly warning and asks admin to confirm.
- Duplicate donation attachment is blocked by unique index.
- CSRF applies to all POST routes.

### 12.3 Regression Tests

- Applicant list/detail/edit still works.
- Donation list/detail/edit still works.
- Existing export routes still work.
- Existing audit log still works.

## 13. Rollback

Because the feature is additive, rollback is straightforward:

1. Remove fundraising nav/route mounting.
2. Leave new tables in place to avoid data loss.
3. If absolutely required, export the new tables before dropping them.

Do not drop fundraising tables in an emergency rollback unless explicitly approved.

