# Build Gap Register: Fundraising Tracker

**Product:** Buttercup Children's Trust Admin System  
**Feature:** Appeal fundraising tracker and lead-gen context source  
**Date:** 2026-07-01  
**Status:** Planning complete; implementation not started  

---

## 1. Purpose

This register turns the fundraising tracker PRD/TDD into implementation checkpoints. A gap is complete only when the code, migration, admin access control, audit behavior, and regression checks are done.

## 2. Current State

BCT admin currently has:

- applicants, donations, enquiries, users, actions, documents, and audit logs;
- admin flag via `users.is_admin`;
- CSV exports for applicants, donations, and enquiries;
- search across applicants, donations, and enquiries;
- applicant fields that contain appeal location and need context;
- donation records that can be used for manual attribution.

BCT admin does not yet have:

- fundraising campaign records;
- links between campaigns and applicants;
- links between campaigns and donations;
- campaign-level income totals;
- admin fundraising dashboard;
- lead-gen context API.

## 2.1 Completed Planning Items

- [x] Planning pack consolidated at `/home/karl/projects/lead-gen-bct/planning/fundraising-tracker`.
- [x] Product requirements documented.
- [x] Technical design documented.
- [x] Implementation phases documented with build locations.
- [x] Tactical implementation guide documented.
- [x] Lead-gen integration boundary documented.
- [x] Consolidated planning directory added to `/home/karl/projects/lead-gen-bct/.gitignore`.

## 3. Gap Matrix

| ID | Gap | Current state | Required outcome | Blocks phase 1 |
|---|---|---|---|---|
| FT-G01 | Fundraising campaign schema | No campaign table | `fundraising_campaigns` table with status, title, town/city, wording, target, dates, notes, audit fields | Yes |
| FT-G02 | Applicant link schema | No campaign-applicant relation | `fundraising_campaign_applicants` with campaign/applicant links (no unique constraint; UI warns on duplicate and asks admin to confirm) | Yes |
| FT-G03 | Donation link schema | No campaign-donation relation | `fundraising_campaign_donations` with attributed amounts | Yes |
| FT-G04 | Channel tracking schema | No campaign channel records | `fundraising_campaign_channels` stores channel/reference notes | No |
| FT-G05 | Additive migration | Existing schema only | New migration applies without changing existing applicant/donation data | Yes |
| FT-G06 | Query helpers | Generic queries only | Fundraising-specific query helpers use D1 prepared statements | Yes |
| FT-G07 | Admin route gate | Admin flag exists | All `/fundraising/*` routes return 403 for non-admins | Yes |
| FT-G08 | Campaign CRUD UI | No screens | Admin list/detail/create/edit campaign screens exist | Yes |
| FT-G09 | Applicant prefill | Applicant data exists | Create-from-applicant pre-populates town/city and draft need wording | Yes |
| FT-G10 | Applicant detail panel | No fundraising panel | Admin-only panel lists linked campaigns and create/attach actions | Yes |
| FT-G11 | Donation detail panel | No fundraising panel | Admin-only panel lists campaign attributions and attach/detach actions | Yes |
| FT-G12 | Manual donation attribution | Donations are standalone | Admin can attach donation with attributed amount and note | Yes |
| FT-G13 | Derived totals | No campaign totals | Raised/remaining totals calculate from attribution links | Yes |
| FT-G14 | Dashboard | No fundraising dashboard | Admin dashboard shows active count, target, raised, remaining, recent campaigns | Yes |
| FT-G15 | Reporting filters | Search exists for old entities | Campaign filters by status, town/city, date range, and text | No |
| FT-G16 | Wording helper | No generated wording | Conservative editable suggested wording is generated from town/condition/need | No |
| FT-G17 | Audit events | Audit log exists | Create/update/attach/detach fundraising actions write audit entries | Yes |
| FT-G18 | Regression safety | Existing screens work | Applicant, donation, enquiry, export, and document flows still work | Yes |
| FT-G19 | Lead-gen context endpoint | No API | Token-protected read-only context endpoint exposes allowed fields only | No, phase 2 |
| FT-G20 | Integration secret handling | No service token | Service token held outside browser and source code | No, phase 2 |
| FT-G21 | Lead-gen snapshot | Lead-gen has no BCT context field | Lead-gen stores BCT campaign ID and context snapshot only | No, phase 3 |
| FT-G22 | Stats boundary | Lead-gen could be over-expanded | Lead-gen does not import donation records or fundraising dashboard totals | No, phase 3 |

## 4. Build Order

1. **Schema:** FT-G01 to FT-G05.
2. **Query layer:** FT-G06 and FT-G13.
3. **Admin access and CRUD:** FT-G07 and FT-G08.
4. **Applicant/donation linking:** FT-G09 to FT-G12.
5. **Dashboard/reporting:** FT-G14 to FT-G16.
6. **Audit/regression:** FT-G17 and FT-G18.
7. **Lead-gen context API:** FT-G19 and FT-G20.
8. **Lead-gen integration:** FT-G21 and FT-G22.

## 5. Completion Rules

Each gap is complete only when:

- migration or code changes are implemented;
- non-admin behavior is verified where relevant;
- admin happy path is verified;
- duplicate/invalid input behavior is handled;
- audit behavior is recorded where relevant;
- existing applicant and donation workflows still work.

## 6. Deferred Items

These are intentionally not phase 1:

- separate fundraising roles;
- automatic donation matching;
- AI extraction of illness/condition from notes;
- public donation/payment flow;
- automated comms sending;
- lead-gen display of fundraising income figures.
