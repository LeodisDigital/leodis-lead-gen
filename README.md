# Buttercup Lead Gen

Compliance-first UK charity fundraising prospect research and export platform,
adapted from Lead Gen V2 for Buttercup Children's Trust.

The current implementation is still the original internal compliance-operations
milestone. Live collection and production exports remain disabled by default.
The docs now define the Buttercup charity-fundraising adaptation: corporate
email only when the recipient is verified as eligible, postal-letter review for
records that are not email eligible, and quarantine for anything unproven.

## Requirements

- Node.js 22+
- Corepack
- Docker with Docker Compose

## Start

```bash
corepack pnpm install
docker compose up -d postgres redis
corepack pnpm db:migrate
corepack pnpm dev:api
```

Development services use isolated host ports:

- API: `http://localhost:3001`
- PostgreSQL: `localhost:55432`
- Redis: `localhost:56379`

Check the fail-closed launch state:

```bash
curl http://localhost:3001/readiness
```

## PM2 LAN Service

The built API is configured in `ecosystem.config.cjs` to run as
`lead-gen-bct-api` on the LAN-only address:

```text
http://192.168.1.207:30156
```

Useful commands:

```bash
corepack pnpm build
pm2 restart lead-gen-bct-api
pm2 logs lead-gen-bct-api
pm2 save
```

UFW permits TCP port `30156` only from `192.168.1.0/24`. PostgreSQL and Redis
are published on loopback only.

The local owner credentials created during deployment are stored in
`.local-admin-credentials` with mode `0600`.

## Companies House

Without a Companies House API key, the app remains useful for campaign
definition, target intake, lead review, suppression, and audit, but new
companies are correctly quarantined as unverified.

Owners can configure and test the Companies House API key in **Settings →
Integrations**. The key is encrypted at rest and is never returned to the
browser. `COMPANIES_HOUSE_API_KEY` remains available as a deployment fallback.

Production eligible-lead exports are separately controlled in **Settings →
Launch controls** and must not be enabled before the PRD launch gates are
complete. Live source collection is not implemented in the foundation
milestone and cannot be enabled from Settings.

## Verify

```bash
corepack pnpm check
docker compose ps
node scripts/browser-qa.mjs
```

## Current Packages

- `apps/api`: authenticated application, compliance intake, settings, and export API
- `apps/web`: Leodis-styled campaign and compliance workspace
- `apps/worker`: leased PostgreSQL worker for allowlisted maintenance jobs
- `packages/db`: Drizzle schema and migrations
- `packages/policy`: versioned source, entity, mailbox, and launch policy
- `packages/sources`: mandatory fail-closed source collection authorization
- `packages/collection`: bounded, DNS-pinned, redirect-revalidated public page collector
- `packages/jobs`: idempotent job state, bounded retries, cancellation, and dead-letter rules
- `packages/verification`: deterministic listing and domain verification decisions
- `packages/eligibility`: pure fail-closed export eligibility engine
- `packages/shared`: shared schemas and reason codes

## Documentation

- [PRD](planning/PRD.md): product requirements for the Buttercup charity fundraising app
- [TDD](planning/TDD.md): technical design for adapting the existing monorepo
- [Implementation plan](planning/IMPLEMENTATION_PLAN.md): phased build sequence
- [Compliance decisions](planning/COMPLIANCE_DECISIONS.md): conservative legal/product assumptions
- [Source and channel policy](planning/SOURCE_AND_CHANNEL_POLICY.md): allowed sources, channels, and fallback rules
- [Launch checklist](planning/LAUNCH_CHECKLIST.md): launch gates and evidence checklist
- [Build gap register](planning/BUILD_GAP_REGISTER.md): current implementation gaps to close during build
- [Cloudflare deployment plan](planning/CLOUDFLARE_DEPLOYMENT_PLAN.md): Pages, local API, GitHub, and Zero Trust deployment requirements

## Current Safety Posture

- campaigns require owner approval and Companies House principal verification;
- client-provided target intake requires explicit source-policy approval;
- user-confirmed listing/domain links remain in review until deterministic
  verification exists;
- production exports require every mandatory launch gate and recheck current
  verification, freshness, and suppression in a transaction;
- public objection, rights-request, and complaint intake is available;
- the background worker only executes allowlisted maintenance jobs; live website
  collection and automated website/domain verification are not yet implemented.

Read the documentation section above before enabling any collection or exports.
The code still needs the TDD changes before it can safely run Buttercup
campaigns.
