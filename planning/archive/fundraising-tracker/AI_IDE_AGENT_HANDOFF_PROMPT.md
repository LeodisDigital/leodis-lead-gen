# AI IDE Agent Handoff Prompt

You are implementing the BCT fundraising tracker and later lead-gen appeal context integration.

## Start Here

First read:

```text
/home/karl/projects/lead-gen-bct/planning/fundraising-tracker/README.md
```

Then read every linked document in that folder, especially:

```text
/home/karl/projects/lead-gen-bct/planning/fundraising-tracker/FUNDRAISING_TRACKER_IMPLEMENTATION_GUIDE.md
/home/karl/projects/lead-gen-bct/planning/fundraising-tracker/FUNDRAISING_TRACKER_TDD.md
/home/karl/projects/lead-gen-bct/planning/fundraising-tracker/FUNDRAISING_TRACKER_BUILD_GAP_REGISTER.md
```

## Build Repositories

Primary build repo:

```text
/home/karl/leodis-clients/bct-admin
```

Secondary integration repo, only after BCT admin phases are complete:

```text
/home/karl/projects/lead-gen-bct
```

## Implementation Rules

1. Build BCT admin first.
2. Keep the implementation additive. Do not alter or damage existing applicant, donation, enquiry, user, action, document, or audit data.
3. Start with Phase 1 from the implementation guide:
   - create `migrations/0005_fundraising_tracker.sql`
   - create `src/db/fundraising-queries.js`
   - create `src/helpers/fundraising-wording.js`
4. Continue through the BCT admin phases:
   - admin-only appeal intake and approval routes
   - approval dashboard and outcome summary
   - donation attribution
   - audit events
5. Then implement the lead-gen handoff:
   - approved appeal context API in BCT admin
   - BCT admin URL/token settings in lead-gen
   - appeal context picker in lead-gen
   - editable campaign wording and execution flow in lead-gen
6. All approval and outcome stats must be admin-only for now.
7. BCT admin remains the source of truth for appeal intake, approval state, donation attribution, and outcome summaries.
8. Lead-gen must not import raw applicant records, child full names, exact addresses, parent/carer contact details, raw notes, or donation records.
9. Lead-gen integration should only happen after the BCT admin approval flow works.
10. Before any remote D1 migration or deploy, confirm/export/backup the current database.
11. Run or manually verify the regression checklist from the implementation guide:
    - applicant list/detail/edit still works
    - donation list/detail/edit still works
    - enquiry flows still work
    - documents still work
    - CSV exports still work
    - non-admin users cannot access fundraising routes
    - campaign totals update correctly after attaching/detaching donations

## After Implementation

Update the planning docs in:

```text
/home/karl/projects/lead-gen-bct/planning/fundraising-tracker
```

Mark completed phases/gaps as done and note any deviations or follow-up work.

## Expected Deliverables

- implemented BCT admin appeal intake/approval flow;
- additive D1 migration;
- approved appeal context API;
- lead-gen appeal context picker and working campaign flow;
- donation attribution;
- dashboard/reporting;
- audit events;
- regression verification notes;
- updated planning docs showing completed work.
