# Fundraising Tracker Planning Pack

This folder is the single home for the BCT fundraising tracker and lead-gen appeal context planning docs.

Full local location:

```text
/home/karl/projects/lead-gen-bct/planning/fundraising-tracker
```

## Systems

| System | Local path | Responsibility |
|---|---|---|
| BCT admin | `/home/karl/leodis-clients/bct-admin` | Owns appeal intake, review, approval/rejection, source appeal records, donation attribution, outcome summaries, and the approved context API. |
| Lead-gen | `/home/karl/projects/lead-gen-bct` | Owns the working fundraising campaign after approval: wording, prospect discovery, verification, suppression, channel decisions, exports, and campaign execution. |

## Build Phase Locations

| Phase | Build location | Main directories/files |
|---|---|---|
| Phase 0: Planning and backup baseline | Planning docs in lead-gen; backup process in BCT admin | `/home/karl/projects/lead-gen-bct/planning/fundraising-tracker`, `/home/karl/leodis-clients/bct-admin/wrangler.jsonc` |
| Phase 1: Schema and query layer | BCT admin | `/home/karl/leodis-clients/bct-admin/migrations`, `/home/karl/leodis-clients/bct-admin/src/db` |
| Phase 2: Admin campaign CRUD | BCT admin | `/home/karl/leodis-clients/bct-admin/src/routes`, `/home/karl/leodis-clients/bct-admin/src/templates` |
| Phase 3: Applicant and donation linking | BCT admin | `/home/karl/leodis-clients/bct-admin/src/routes/applicants.js`, `/home/karl/leodis-clients/bct-admin/src/routes/donations.js` |
| Phase 4: Dashboard and reporting | BCT admin | `/home/karl/leodis-clients/bct-admin/src/routes/fundraising.js`, `/home/karl/leodis-clients/bct-admin/src/templates` |
| Phase 5: Lead-gen context API | BCT admin | `/home/karl/leodis-clients/bct-admin/src/routes/fundraising.js`, `/home/karl/leodis-clients/bct-admin/src/middleware` |
| Phase 6: Lead-gen integration | Lead-gen | `/home/karl/projects/lead-gen-bct/apps/api`, `/home/karl/projects/lead-gen-bct/apps/web`, `/home/karl/projects/lead-gen-bct/packages/db` |

## Documents

Read in this order:

1. [FUNDRAISING_TRACKER_PRD.md](FUNDRAISING_TRACKER_PRD.md)  
   Product requirements: what the fundraising tracker does and why.

2. [FUNDRAISING_TRACKER_TDD.md](FUNDRAISING_TRACKER_TDD.md)  
   Technical design: D1 schema, routes, query helpers, admin access, and lead-gen context API shape.

3. [FUNDRAISING_TRACKER_IMPLEMENTATION_PLAN.md](FUNDRAISING_TRACKER_IMPLEMENTATION_PLAN.md)  
   Delivery phases and acceptance criteria.

4. [FUNDRAISING_TRACKER_BUILD_GAP_REGISTER.md](FUNDRAISING_TRACKER_BUILD_GAP_REGISTER.md)  
   Build checklist and launch guardrail.

5. [FUNDRAISING_TRACKER_IMPLEMENTATION_GUIDE.md](FUNDRAISING_TRACKER_IMPLEMENTATION_GUIDE.md)  
   Tactical builder guide: exact files, route names, migration order, manual tests, deployment, and rollback.

6. [BCT_ADMIN_APPEAL_CONTEXT_INTEGRATION.md](BCT_ADMIN_APPEAL_CONTEXT_INTEGRATION.md)  
   Lead-gen boundary and future integration plan.

7. [AI_IDE_AGENT_HANDOFF_PROMPT.md](AI_IDE_AGENT_HANDOFF_PROMPT.md)  
   Ready-to-use prompt/instructions for an AI IDE agent taking over implementation.

## Current Decision

BCT admin is the source of truth for appeal intake, review, approval state, donation attribution, and outcome summaries. Lead-gen is the place where an approved appeal is turned into an active campaign and managed day to day.

Lead-gen may store a reference and context snapshot, but it owns the editable campaign wording and operational workflow once an appeal is approved.

## Completed Planning Work

- [x] Consolidated all fundraising tracker planning docs into this folder.
- [x] Created PRD.
- [x] Created TDD.
- [x] Created implementation plan.
- [x] Created build gap register.
- [x] Created implementation guide.
- [x] Created lead-gen appeal context integration plan.
- [x] Created AI IDE agent handoff prompt.
- [x] Documented BCT admin vs lead-gen ownership boundaries.
- [x] Added this folder to `/home/karl/projects/lead-gen-bct/.gitignore`.

## Not Yet Done

- [ ] Remote D1 backup/export procedure confirmed before production migration.
- [ ] BCT admin implementation.
- [ ] Lead-gen integration implementation.
