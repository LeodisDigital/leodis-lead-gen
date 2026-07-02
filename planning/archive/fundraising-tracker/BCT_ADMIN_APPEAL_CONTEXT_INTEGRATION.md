# BCT Admin Appeal Context Integration

**Product:** Buttercup Lead Gen  
**Integration:** BCT admin fundraising tracker  
**Date:** 2026-07-01  
**Status:** Planning  

---

## TLDR

Lead-gen should receive approved appeal context from BCT admin and own the live working campaign from that point onward. BCT admin remains the source of truth for appeal intake, review, approval state, donation attribution, and outcome summaries.

Lead-gen uses the imported context to run the campaign, refine wording, and drive prospect searches.

---

## 1. Ownership Boundary

| Data / Workflow | System of record |
|---|---|
| Appeal intake and review | BCT admin |
| Appeal approval state | BCT admin |
| Donation attribution and totals | BCT admin |
| Outcome summary back to BCT admin | BCT admin |
| Working campaign wording | Lead-gen |
| Prospect discovery | Lead-gen |
| Prospect verification and suppression | Lead-gen |
| Outreach channel decisions | Lead-gen |
| Exports | Lead-gen |

Lead-gen should store the BCT appeal reference and a point-in-time context snapshot. The editable campaign workspace belongs in lead-gen.

## 2. Imported Context

Lead-gen may import:

- BCT fundraising campaign ID;
- campaign title;
- town/city;
- condition wording;
- need wording;
- suggested/final campaign wording;
- status;
- retrieved timestamp.

Lead-gen must not import:

- child full name;
- applicant full address;
- applicant email/phone;
- parent/carer details;
- raw notes;
- linked donation records;
- admin dashboard totals in phase 1.

## 3. Lead-Gen Campaign Fields

Add fields to lead-gen campaign storage in a future migration:

```text
bct_fundraising_campaign_id text
bct_context_snapshot jsonb
bct_context_retrieved_at timestamp with time zone
```

The snapshot prevents campaign history from changing invisibly if BCT admin wording is later edited.

## 4. Source Policy

Add a source policy class:

```text
bct-admin-appeal-context
```

Allowed use:

- `campaign_targeting`

Allowed fields:

- `campaign_name`
- `location`
- `fundraising_need`
- `appeal_wording`

Prohibited use:

- treating BCT applicant records as contactable prospects;
- using raw applicant contact data;
- using donation records for prospecting;
- bypassing lead-gen source/verification/suppression checks.

## 5. API Shape

BCT admin should expose the lead-gen API on `https://admin-api.bctrust.uk`, separate from the human admin UI at `https://admin.bctrust.uk`:

```text
GET /fundraising/api/campaigns?status=Active&q=leeds
GET /fundraising/api/campaigns/:id/context
```

Lead-gen calls these with a service token.

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

## 6. Product Flow

1. A new appeal is entered in BCT admin.
2. BCT staff review and approve or reject it.
3. If approved, BCT admin publishes the approved appeal context to lead-gen.
4. Lead-gen creates or opens the working fundraising campaign.
5. Lead-gen shows the imported context and lets the fundraiser refine wording.
6. `townCity` becomes the default discovery location.
7. Prospect discovery, verification, suppression, channel decisions, and exports happen in lead-gen.
8. BCT admin receives the resulting campaign summary and outcome record.

## 7. API Security

Requirements:

- service token stored encrypted or as an environment secret;
- HTTPS only;
- the human admin UI remains behind Cloudflare Access;
- the API host only serves `/fundraising/api/*` and returns 404 for other paths;
- BCT admin allowlists only context fields;
- no browser-side exposure of the service token;
- failed API calls fail closed with manual campaign entry still possible.

## 8. Failure Modes

| Failure | Behaviour |
|---|---|
| BCT admin API unavailable | Lead-gen allows manual campaign creation without imported context. |
| Token invalid | Show configuration error to owner/admin only. |
| Campaign not found | Keep existing snapshot but flag source as unavailable. |
| BCT campaign edited later | Existing lead-gen campaigns keep their snapshot until manually refreshed. |
| BCT campaign cancelled | Lead-gen should warn on refresh but not delete prior campaign history. |

## 9. Implementation Phases

### Phase 1: Manual Reference

Before API integration, lead-gen can support manual fields:

- BCT campaign ID/reference;
- town/city;
- campaign wording.

### Phase 2: API Picker

Add BCT admin token settings and picker.

### Phase 3: Snapshot Refresh

Allow a user to refresh the snapshot from BCT admin.

### Phase 4: Reporting Links

Optionally show a link back to BCT admin for admins. Do not bring stats into lead-gen unless explicitly approved later.

## 10. Acceptance Criteria

- Lead-gen never imports raw applicant or donation records.
- Lead-gen can create a campaign using approved BCT appeal context.
- Lead-gen owns the editable campaign wording after approval.
- Lead-gen uses town/city as the default prospect search location.
- Lead-gen records source policy evidence for the imported context.
- Existing lead-gen compliance gates still control exports.
