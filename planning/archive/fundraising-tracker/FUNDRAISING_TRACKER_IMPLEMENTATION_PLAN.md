# Implementation Plan: Fundraising Tracker

**Product:** Buttercup Children's Trust Admin System  
**Feature:** Appeal fundraising tracker and lead-gen context source  
**Date:** 2026-07-01  
**Status:** Planning complete; implementation not started  

---

## 1. Delivery Strategy

Build the fundraising tracker in BCT admin first. Keep the work additive and admin-only. Once stable, expose a narrow context API for lead-gen.

| Phase | Name | Build location | Outcome | Status |
|---|---|---|---|---|
| 0 | Planning and backup baseline | `/home/karl/projects/lead-gen-bct/planning/fundraising-tracker` and BCT admin backup process | PRD/TDD accepted; remote D1 backup/export path confirmed. | Complete |
| 1 | Schema and query layer | `/home/karl/leodis-clients/bct-admin/migrations`, `/home/karl/leodis-clients/bct-admin/src/db` | New fundraising tables and helper queries exist. | Complete |
| 2 | Admin campaign CRUD | `/home/karl/leodis-clients/bct-admin/src/routes`, `/home/karl/leodis-clients/bct-admin/src/templates` | Admins can create, edit, list, and view fundraising campaigns. | Complete |
| 3 | Applicant and donation linking | `/home/karl/leodis-clients/bct-admin/src/routes/applicants.js`, `/home/karl/leodis-clients/bct-admin/src/routes/donations.js` | Admins can attach applicants and donations; totals calculate correctly. | Complete |
| 4 | Dashboard and reporting | `/home/karl/leodis-clients/bct-admin/src/routes/fundraising.js`, `/home/karl/leodis-clients/bct-admin/src/templates` | Admin-only fundraising dashboard and filters exist. | Complete |
| 5 | Lead-gen context API | `/home/karl/leodis-clients/bct-admin/src/routes/fundraising.js`, `/home/karl/leodis-clients/bct-admin/src/middleware` | Token-protected read-only context endpoint exists. | Complete |
| 6 | Lead-gen integration | `/home/karl/projects/lead-gen-bct/apps/api`, `/home/karl/projects/lead-gen-bct/apps/web`, `/home/karl/projects/lead-gen-bct/packages/db` | Lead-gen can reference/import selected fundraising campaign context. | Complete |

## 2. Phase 0: Planning And Backup Baseline

Deliverables:

- [x] `FUNDRAISING_TRACKER_PRD.md`
- [x] `FUNDRAISING_TRACKER_TDD.md`
- [x] `FUNDRAISING_TRACKER_BUILD_GAP_REGISTER.md`
- [x] `FUNDRAISING_TRACKER_IMPLEMENTATION_GUIDE.md`
- [x] `BCT_ADMIN_APPEAL_CONTEXT_INTEGRATION.md`
- [x] planning docs consolidated in `/home/karl/projects/lead-gen-bct/planning/fundraising-tracker`
- [x] planning directory added to `/home/karl/projects/lead-gen-bct/.gitignore`
- [x] implementation plan accepted;
- [x] D1 backup/export procedure confirmed: `wrangler d1 export bct-db --remote --output backup.sql`.

Exit criteria:

- [x] BCT admin remains source of truth for stats.
- [x] Lead-gen does not receive raw applicant records or donation records.
- [x] Build is confirmed as additive to existing tables.
- [x] Build gaps FT-G01 to FT-G22 have been reviewed and accepted as the backlog guardrail.
- [x] Remote D1 backup/export path confirmed.

## 3. Phase 1: Schema And Query Layer

Tasks:

1. Add migration `0005_fundraising_tracker.sql`.
2. Add `src/db/fundraising-queries.js`.
3. Implement campaign, applicant-link, donation-link, channel-link helpers.
4. Add basic safe wording helper.

Acceptance:

- Existing migrations still apply cleanly.
- Existing tables are not altered destructively.
- Query helpers use prepared statements.
- Duplicate campaign-applicant links show a warning and ask admin to confirm (may be intentional).
- Duplicate campaign-donation links are blocked by unique index.

## 4. Phase 2: Admin Campaign CRUD

Tasks:

1. Add `src/routes/fundraising.js`.
2. Mount route at `/fundraising`.
3. Add admin-only navigation item.
4. Build campaign list, detail, create, and edit screens.
5. Add status filtering.

Acceptance:

- Non-admin users receive `403` for fundraising routes.
- Admins can create and edit campaigns.
- Campaign detail shows title, status, town/city, wording, target, raised, remaining, linked applicants, linked donations, and channels.
- Audit events are written for create/update.

## 5. Phase 3: Applicant And Donation Linking

Tasks:

1. Add admin-only fundraising panel to applicant detail.
2. Add "Create fundraising campaign" from applicant.
3. Add "Attach to existing fundraising campaign" from applicant.
4. Add admin-only fundraising panel to donation detail.
5. Add donation attachment with attributed amount and note.
6. Add detach controls.

Acceptance:

- Creating from applicant pre-populates town/city and need wording.
- Admin can attach one applicant to multiple campaigns.
- Admin can attach one donation to multiple campaigns with split amounts.
- Campaign totals update immediately after attach/detach.
- Existing applicant and donation forms still behave unchanged.

## 6. Phase 4: Dashboard And Reporting

Tasks:

1. Build fundraising dashboard.
2. Add summary metrics: active campaigns, target, raised, remaining.
3. Add recent campaign activity.
4. Add filters by status, town/city, date range, and text.
5. Add simple income views by campaign, applicant, town/city, and channel.

Acceptance:

- Dashboard is admin-only.
- Cancelled campaigns are excluded from headline active totals by default.
- Filters preserve search state.
- Totals are calculated from attribution links, not duplicated stored summary fields.

## 7. Phase 5: Lead-Gen Context API

Tasks:

1. Add service-token middleware for `/api/fundraising/*`.
2. Add read-only endpoint for selected campaign context.
3. Add list/search endpoint if lead-gen needs a picker.
4. Document returned fields and explicitly excluded fields.

Candidate endpoints:

```text
GET /api/fundraising/campaigns?status=Active&q=leeds
GET /api/fundraising/campaigns/:id/context
```

Acceptance:

- Requests without valid token are rejected.
- Response includes only campaign context fields.
- Response excludes applicant contact details, exact address, raw notes, child full name, and donation details.
- Audit or access log records API reads if practical.

## 8. Phase 6: Lead-Gen Integration

Tasks in `lead-gen-bct`:

1. Store BCT admin URL and service token as encrypted/runtime settings.
2. Add appeal context picker to campaign create/edit.
3. Store selected `bctFundraisingCampaignId` and imported snapshot fields.
4. Use `townCity` as the default prospect discovery location.
5. Keep income/stats out of lead-gen.

Acceptance:

- Lead-gen campaign can reference a BCT fundraising campaign.
- Lead-gen can show selected context and suggested wording.
- Lead-gen exports/prospects remain governed by existing source, verification, suppression, and channel checks.
- Lead-gen does not become the fundraising financial source of truth.

## 9. Risk Register

| Risk | Mitigation |
|---|---|
| Existing database integrity is damaged | Use additive migrations only; backup before remote migration. |
| Fundraising stats leak to non-admins | Gate all routes and panels by `isAdmin`. |
| Wording becomes too identifying | Default town/city wording; manual fundraiser control; no automated publishing. |
| Donation totals become stale | Calculate raised totals from attribution links on read. |
| Lead-gen receives too much data | Expose a narrow context API; exclude raw applicant/donation fields. |
| Duplicate attribution | Unique link indexes; manual split amounts. |

## 10. Definition Of Done

The feature is complete when:

- migrations are applied successfully;
- admin-only campaign CRUD works;
- applicant and donation linking works;
- totals reconcile with attribution links;
- dashboard shows useful figures;
- existing admin workflows still pass regression checks;
- lead-gen boundary is documented and respected.
