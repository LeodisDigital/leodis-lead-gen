# Technical Design: Online Application Form and Contact Form

**Product:** Buttercup Children's Trust Public Website + Admin System
**Feature:** Online grant application and contact form
**Date:** 2026-07-01
**Status:** Planning

---

## 1. Architecture Overview

The public website (`bct-site` Worker) serves the form pages. Form submissions POST to the `bct-admin` Worker via a public API endpoint, which writes to D1 and sends confirmation/notification emails.

```
Browser (public)
  │
  ├── GET /apply-for-funding     → bct-site Worker → static HTML form
  ├── GET /contact               → bct-site Worker → static HTML form
  │
  └── POST /api/public/apply     → bct-admin Worker (unauthenticated)
  │     ├── Verify Turnstile token
  │     ├── Validate + sanitise input
  │     ├── Check honeypot
  │     ├── Rate limit check
  │     ├── Insert into D1 applicants table
  │     ├── Send confirmation email to applicant
  │     ├── Send notification email to trustees
  │     └── Return success/error JSON
  │
  └── POST /api/public/contact   → bct-admin Worker (unauthenticated)
        ├── Verify Turnstile token
        ├── Validate + sanitise
        ├── Send email to BCT contact address
        └── Return success/error JSON
```

### Why POST to bct-admin, Not bct-site?

- bct-admin already has the D1 binding (`DB`) for the applicants table.
- Avoids duplicating the database binding across workers.
- Keeps all write operations in one worker for auditability.
- bct-site remains a simple static/asset worker.

### Cross-Origin

- bct-site serves the form pages from `buttercupchildrenstrust.org.uk`.
- bct-admin is at `bct-admin.trustees-633.workers.dev` (or a subdomain).
- The public API endpoints on bct-admin need CORS headers allowing the public site origin.
- Alternatively, bct-site can proxy the POST to bct-admin using a Service Binding (Worker-to-Worker, no CORS needed).

**Recommended: Service Binding.** Add bct-admin as a service binding in bct-site's wrangler config. The form POSTs to bct-site (same origin), which forwards to bct-admin internally. No CORS, no exposed admin URL.

```jsonc
// bct-site wrangler.jsonc addition
"services": [
  {
    "binding": "BCT_ADMIN",
    "service": "bct-admin"
  }
]
```

## 2. Database Changes

### Migration: `0007_online_applications.sql` (bct-admin)

```sql
-- Track submission source on applicants
ALTER TABLE applicants ADD COLUMN source TEXT DEFAULT 'manual';
-- Values: 'manual' (admin-entered), 'online' (public form)

-- Contact form: email forwarding only, no database storage.

-- Applicant document metadata (files stored in R2)
CREATE TABLE IF NOT EXISTS applicant_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  applicant_id INTEGER NOT NULL REFERENCES applicants(id),
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,                      -- R2 object key
  content_type TEXT,
  size_bytes INTEGER,
  description TEXT,                          -- admin note, e.g. "medical letter"
  uploaded_by TEXT NOT NULL,                 -- admin email
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_applicant_documents ON applicant_documents(applicant_id);

-- Rate limiting tracker (lightweight, in-memory is better but D1 works for low volume)
CREATE TABLE IF NOT EXISTS submission_rate_limits (
  ip_hash TEXT NOT NULL,
  form_type TEXT NOT NULL,                   -- 'apply' or 'contact'
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_rate_limits_lookup ON submission_rate_limits(ip_hash, form_type, submitted_at);
```

### Existing applicants table — no schema change needed

All form fields map directly to existing columns. The only addition is the `source` column to distinguish online from manual entries.

## 3. Turnstile Integration

### Setup

1. Create a Turnstile widget in Cloudflare dashboard for `buttercupchildrenstrust.org.uk`.
2. Get site key (public, embedded in HTML) and secret key (server-side verification).
3. Store secret key as Wrangler secret on bct-admin: `TURNSTILE_SECRET_KEY`.

### Client-Side (bct-site form HTML)

```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

<form id="apply-form" method="POST" action="/apply-for-funding/submit">
  <!-- form fields -->

  <!-- Honeypot (hidden from real users via CSS) -->
  <div style="position:absolute;left:-9999px" aria-hidden="true">
    <input type="text" name="website" tabindex="-1" autocomplete="off">
  </div>

  <!-- Turnstile (invisible mode) -->
  <div class="cf-turnstile" data-sitekey="SITE_KEY_HERE" data-theme="light"></div>

  <button type="submit">Submit Application</button>
</form>
```

### Server-Side Verification (bct-admin)

```javascript
async function verifyTurnstile(token, ip, secretKey) {
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: secretKey,
      response: token,
      remoteip: ip,
    }),
  });
  const result = await response.json();
  return result.success === true;
}
```

## 4. Public API Endpoints (bct-admin)

### Middleware: Public API Security

New middleware for `/api/public/*` routes — no Zero Trust auth required, but:

1. **Turnstile verification** — reject if token invalid.
2. **Honeypot check** — reject if honeypot field is filled.
3. **Rate limiting** — check D1 rate limit table; reject if threshold exceeded (e.g. 3 applications per IP per hour, 5 contact submissions per IP per hour).
4. **Input sanitisation** — strip HTML tags, trim whitespace, enforce max lengths.

### `POST /api/public/apply`

Request body (JSON or form-encoded):

```json
{
  "applicants_name": "...",
  "email": "...",
  "telephone": "...",
  "mobile": "...",
  "address": "...",
  "post_town": "...",
  "post_code": "...",
  "county": "...",
  "carer_name": "...",
  "carer_phone": "...",
  "carer_email": "...",
  "childs_name": "...",
  "childs_dob": "...",
  "reason_for_grant": "...",
  "contact_method": "Email",
  "cf-turnstile-response": "...",
  "website": ""
}
```

Processing:

1. Verify Turnstile token.
2. Check honeypot (`website` field must be empty).
3. Check rate limit.
4. Validate required fields: `applicants_name`, `email`, `address`, `post_town`, `post_code`, `childs_name`, `childs_dob`, `reason_for_grant`.
5. Sanitise all inputs.
6. Get next applicant ID via `getNextId(db, 'applicants')`.
7. Insert into `applicants` with `source = 'online'`, `status = 'New'`, `appeal_received = datetime('now')`.
8. Send confirmation email to applicant.
9. Send notification email to trustees.
10. Return `{ success: true, reference: 'AP0801' }`.

### `POST /api/public/contact`

Request body:

```json
{
  "name": "...",
  "email": "...",
  "subject": "...",
  "message": "...",
  "cf-turnstile-response": "...",
  "website": ""
}
```

Processing:

1. Verify Turnstile, honeypot, rate limit.
2. Validate required fields: `name`, `email`, `message`.
3. Sanitise all inputs.
4. Send email to BCT contact address (appeals@buttercupchildrenstrust.org.uk) with the message content and reply-to set to the visitor's email.
5. Return `{ success: true }`.
6. No database storage — email forwarding only.

## 5. Service Binding Proxy (bct-site)

Add a thin proxy in bct-site's Worker to forward form submissions to bct-admin:

```javascript
// In bct-site Worker
if (url.pathname === '/apply-for-funding/submit' && request.method === 'POST') {
  const adminRequest = new Request('https://bct-admin/api/public/apply', {
    method: 'POST',
    headers: request.headers,
    body: request.body,
  });
  const response = await env.BCT_ADMIN.fetch(adminRequest);
  return response;
}

if (url.pathname === '/contact/submit' && request.method === 'POST') {
  const adminRequest = new Request('https://bct-admin/api/public/contact', {
    method: 'POST',
    headers: request.headers,
    body: request.body,
  });
  const response = await env.BCT_ADMIN.fetch(adminRequest);
  return response;
}
```

## 6. Email Sending

Uses the same email provider as the thank-you feature (Resend recommended). Same `RESEND_API_KEY` Wrangler secret.

### Confirmation Email (to applicant)

- From: `applications@buttercupchildrenstrust.org.uk` (or Resend default)
- To: applicant's email
- Subject: "We've received your application — Buttercup Children's Trust"
- Body: plain-text confirmation with reference number

### Notification Email (to trustees)

- From: same sender
- To: configured trustee email address (stored as Wrangler secret `TRUSTEE_NOTIFICATION_EMAIL` or in D1 settings)
- Subject: "New online application received — {{reference}}"
- Body: summary of applicant name, town, reason (no child details in email for privacy)

### Contact Form Email (to BCT)

- From: same sender
- Reply-To: visitor's email address
- To: configured contact email address
- Subject: visitor's subject or "Website enquiry"
- Body: visitor's message with their name and email

## 7. Public Form Pages (bct-site)

### Apply for Funding Page Redesign

Replace the current download-links page with a multi-section HTML form:

- **Introduction section** — what BCT does, eligibility summary, what information is needed.
- **Progressive disclosure** — sections expand as the user progresses (or all visible with clear headings).
- **Inline validation** — required fields highlighted before submission.
- **Mobile-responsive** — must work well on phones (families in crisis may only have mobile).
- **Accessible** — proper labels, ARIA attributes, keyboard navigation, colour contrast.
- **Keep PDF/DOCX download** as an alternative at the top: "Prefer to apply by post? Download our application form."

### Contact Page

Replace email-address-only contact section with a form:

- Name, email, subject (optional), message.
- Turnstile widget.
- Success message on submission.
- Keep existing contact details (address, email, phone) visible alongside the form.

### Success Pages

After form submission (via JavaScript fetch or standard form redirect):

- **Application:** "Thank you — your application has been received. Your reference is AP0801. We've sent a confirmation to your email address."
- **Contact:** "Thank you — your message has been sent. We'll aim to respond within 5 working days."

## 8. Admin Enhancements (bct-admin)

### Applicant List

- Add "Source" indicator — show "Online" badge for `source = 'online'` submissions.
- Consider a filter: "Online applications" to see only web submissions.

### Applicant Documents

- Documents panel on applicant detail page (admin-only).
- Upload form: file picker + description field.
- Files stored in R2 (existing `DOCS` bucket).
- Metadata stored in `applicant_documents` table.
- Download/delete actions per document.
- BCT admin already has R2 binding — same bucket used for existing document storage.

### Dashboard Indicator

- Show count of new online applications as a simple notification/badge.

## 9. File Inventory

### bct-admin — New Files

| File | Purpose |
|---|---|
| `migrations/0007_online_applications.sql` | Source column, applicant documents table, rate limits |
| `src/routes/public-api.js` | Public API endpoints for apply + contact |
| `src/helpers/turnstile.js` | Turnstile token verification |
| `src/helpers/public-api-security.js` | Honeypot check, rate limiting, input sanitisation |
| `src/templates/components/applicant-documents-panel.js` | Documents panel for applicant detail page |

### bct-admin — Modified Files

| File | Change |
|---|---|
| `src/index.js` | Mount public API routes (before auth middleware) |
| `src/routes/applicants.js` | Add "Source" column to list, add source filter, add documents panel to show page |
| `public/styles.css` | Source badge styles |

### bct-site — Modified Files

| File | Change |
|---|---|
| `wrangler.jsonc` | Add service binding to bct-admin |
| `src/index.js` (or worker entry) | Add proxy routes for form submission |
| `public/apply-for-funding.html` | Replace with online form |
| `public/contact.html` | Add contact form |
| `public/styles.css` | Form styles, validation styles |

## 10. Security Considerations

| Concern | Mitigation |
|---|---|
| Spam submissions | Turnstile (invisible CAPTCHA) + honeypot + rate limiting |
| Bot abuse | Rate limiting per IP hash (3 applications/hour, 5 contacts/hour) |
| XSS in submitted data | Sanitise all inputs on server; escape on render in admin |
| Injection via form fields | Use parameterised D1 queries (prepared statements) |
| Email header injection | Validate email format; strip newlines from all fields before use in email headers |
| PII in transit | All traffic over HTTPS (Cloudflare edge) |
| PII in logs | IP stored as SHA-256 hash only; no PII in Worker logs |
| Child safeguarding | Notification email includes applicant name and town only — no child details. Full record only visible in authenticated admin |
| AI crawlability preserved | Turnstile is JS-only on form interaction; page content remains standard HTML. No JS rendering required for content |
| Denial of service | Cloudflare's built-in DDoS protection + application-level rate limiting |

## 11. GDPR / Privacy

- Add a privacy consent checkbox: "I have read and agree to the privacy policy" with a link.
- The privacy policy page should be updated to cover: what data is collected via the form, how it's stored, retention period, who has access, right to request deletion.
- Application data follows existing BCT retention policy.
- Uploaded documents follow same retention policy as application records.

## 12. Testing Checklist

### Application Form

- [ ] Submit valid application — record appears in admin with source "Online" and status "New".
- [ ] Confirmation email arrives at applicant's email with correct reference number.
- [ ] Notification email arrives at trustee email with applicant summary (no child details).
- [ ] Missing required fields — validation errors shown, no submission.
- [ ] Honeypot filled — submission rejected silently (shows generic error).
- [ ] Turnstile fails — submission rejected with "please try again" message.
- [ ] Rate limit exceeded — submission rejected with "please wait" message.
- [ ] Duplicate applicant (same name + email + postcode) — still accepted (duplicates handled by admin, not blocked on public form).
- [ ] Mobile form submission — works correctly on small screens.
- [ ] Screen reader — form is navigable and all fields are labelled.
- [ ] AI crawler — page content is readable without JavaScript.

### Contact Form

- [ ] Submit valid message — email arrives at appeals@ with correct reply-to.
- [ ] Rate limiting works independently from application form.

### Documents

- [ ] Admin can upload a document to an applicant record.
- [ ] Document stored in R2, metadata in D1.
- [ ] Admin can download and delete documents.
- [ ] Non-admin cannot see documents panel.

### Admin

- [ ] Applicant list shows "Online" source badge.
- [ ] Source filter works.
