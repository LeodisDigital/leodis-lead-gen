# Cloudflare Deployment Plan

## 1. Purpose

Buttercup Lead Gen should deploy the frontend through GitHub to Cloudflare
Pages, protect private/admin surfaces with Cloudflare Zero Trust, and keep the
API, PostgreSQL, Redis, and background worker local.

This is a deployment architecture requirement. It is not implemented yet.

## 2. Target Cloudflare Shape

| Concern | Planned Cloudflare service | Notes |
|---|---|---|
| Frontend app | Cloudflare Pages | Static React/Vite build deployed from GitHub. |
| API | Local Fastify API behind Cloudflare Tunnel or private origin | Keep the current Node API local. Do not expose Postgres directly to the internet. |
| Background jobs | Local worker plus local Redis/PostgreSQL | Keep current worker shape unless a future migration changes it. |
| Relational data | Local PostgreSQL | Current PostgreSQL/Drizzle path remains the source of truth. |
| Evidence/export files | Local storage first; optional R2 later | If R2 is added, it must be a separate approved storage decision. |
| Secrets | Local secrets plus Cloudflare Tunnel/Access config | Provider/API keys stay local unless explicitly moved to Cloudflare. |
| Access control | Cloudflare Zero Trust Access | Protect Pages app and tunneled API routes. Public rights/complaint/Do Not Contact endpoints need explicit bypass rules. |
| DNS/WAF | Cloudflare DNS/WAF | WAF and bot controls for public forms/API. |
| CI/CD | GitHub connected to Cloudflare Pages | Pull requests should run build/typecheck/test before Pages deploy. Local API deploy remains a separate controlled process. |
| Observability | Local API/worker logs and audit events in DB | Structured logs and audit records must not leak personal data. |

## 3. Architecture Decisions Required

### Cloudflare Pages + Local API Decision

Chosen direction:

- Cloudflare Pages hosts the frontend.
- Cloudflare Zero Trust protects the private frontend/app and API routes.
- Cloudflare Tunnel or an equivalent private origin path exposes the local API
  to Cloudflare without opening arbitrary inbound ports.
- PostgreSQL and Redis remain local.
- The API remains Fastify/Node for this build.

This avoids the D1/Workers rewrite for the initial build, but it makes local
uptime, backups, patching, and tunnel health launch-critical.

### Public vs protected routes

Zero Trust Access should protect the private app/admin/API surfaces. These
routes must remain publicly reachable without Access login:

- Do Not Contact token/code confirmation;
- public objection form;
- public rights request form;
- public complaint form;
- provider webhooks, if enabled, with signature verification.

Public routes need route-specific bypass rules, rate limiting, WAF rules,
Turnstile or equivalent abuse protection where appropriate, and careful
no-enumeration responses.

### Rate limits for public endpoints

| Endpoint group | Rate limit | Additional protection |
|---|---|---|
| Do Not Contact confirmation | 10 req/min per IP | Turnstile challenge on form |
| Public objection/rights/complaint forms | 10 req/min per IP | Turnstile challenge |
| Provider webhooks | 60 req/min per provider IP allowlist | Signature verification |

Rate limits must be enforced at the Cloudflare WAF/rate-limiting layer before
traffic reaches the local API.

## 4. Local API And Tunnel Requirements

The local API/database path must:

- expose only the API through Cloudflare Tunnel or an equivalent private route;
- keep PostgreSQL and Redis bound to localhost/private network only;
- enforce HTTPS from user to Cloudflare and authenticated private routing from
  Cloudflare to the local origin;
- use Cloudflare Access policies for private routes;
- keep public routes path-specific and abuse-protected;
- monitor tunnel health and local service health;
- back up PostgreSQL automatically and test restores;
- keep secrets out of GitHub and source;
- keep public form responses generic to avoid record enumeration;
- have a local rollback plan if the tunnel or origin fails;
- back up tunnel credentials and config separately from the database so that
  tunnel access can be restored without re-provisioning.

## 5. Required Config And Files

Add during implementation:

```text
.cloudflare/access-policy-notes.md
apps/web/Pages build config
.github/workflows/ci.yml
cloudflare-tunnel/
cloudflare-tunnel/config.example.yml
ops/backup-restore-runbook.md
ops/tunnel-runbook.md
```

## 6. Deployment Environments

Use separate Cloudflare environments:

- `preview`: Pages pull-request/branch deployments pointing at a non-production
  or mocked API only.
- `staging`: Pages staging plus local/staging API and test data only.
- `production`: Pages production plus production tunnel/origin, with exports
  disabled until launch gates pass.

Production exports, provider API fulfilment, and live collection must remain
disabled by default in every environment.

## 7. GitHub Workflow Requirements

Every pull request must run:

- install from lockfile;
- build;
- typecheck;
- tests;
- migration check;
- secret scan;
- deployment config validation;
- optionally preview deploy to Cloudflare Pages.

Main branch deployment must require passing checks.

## 8. Zero Trust Requirements

Access policies must be documented for:

- Buttercup owner/admin users;
- fundraising users;
- compliance reviewers;
- provider webhook bypass;
- public rights/complaints/Do Not Contact bypass.

Access bypass rules must be path-specific. Do not bypass the whole API domain.
Public bypass routes should be hosted on a separate hostname or exact path rules
where possible.

## 9. Monitoring And Alerting

The local infrastructure path (tunnel, API, PostgreSQL, Redis, worker) is a
critical dependency. Monitoring must alert on:

- Cloudflare Tunnel disconnect or degraded health;
- local API process crash or unresponsive health check;
- PostgreSQL connection failure or replication lag;
- Redis connection failure or memory pressure;
- worker process crash or job queue backlog;
- PostgreSQL backup job failure or missed schedule;
- retention enforcement job failure;
- anomalous export volume (configurable threshold);
- Zero Trust policy change events.

Alerting should use a channel that reaches the platform administrator promptly
(email, Slack, PagerDuty, or equivalent). Silent failures in the local
infrastructure path must not result in silent export failures.

## 10. Disaster Recovery

Beyond PostgreSQL backup/restore:

- **Redis loss:** all Redis-dependent state (job queues, rate-limit counters,
  leases) must be safely recoverable or safely losable. Jobs must be
  idempotent or restartable; losing Redis must not corrupt database state or
  silently skip exports.
- **Local disk failure:** export files, evidence files, and fulfilment
  manifests must be recoverable from database records or a secondary storage
  location (e.g. optional R2 sync).
- **Tunnel credential loss:** tunnel credentials and config must be backed up
  separately and restorable without Cloudflare re-provisioning.
- **Backup encryption key management:** use asymmetric encryption (age or GPG)
  for PostgreSQL backups. The backup server holds only the public key for
  encryption. The private decryption key is stored in a separate location
  (password manager, offline USB, or equivalent) — never on the same machine
  as the backups. Key location and rotation schedule must be documented in the
  ops runbook. Decryption must be tested as part of the quarterly restore
  drill.

## 11. Launch Blockers

Cloudflare deployment is not launch-ready until:

- Cloudflare Pages deploys from GitHub;
- Cloudflare Tunnel or equivalent private origin path is configured and
  monitored;
- local API, PostgreSQL, Redis, and worker services have health checks;
- Pages deploys from GitHub;
- Zero Trust protects private routes and leaves only intended public routes open;
- public routes have WAF/rate-limit/abuse protections;
- PostgreSQL backups and restore test are complete;
- secrets are stored outside GitHub/source;
- preview/staging/production environments are separated;
- provider webhooks are authenticated and audited;
- production export flags remain disabled by default.

## 12. References

- Cloudflare Pages: https://developers.cloudflare.com/pages/
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Cloudflare Zero Trust Access: https://developers.cloudflare.com/cloudflare-one/applications/
- Cloudflare Tunnel: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
