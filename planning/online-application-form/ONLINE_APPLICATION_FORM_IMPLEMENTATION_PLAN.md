# Implementation Plan: Online Application Form and Contact Form

**Product:** Buttercup Children's Trust Public Website + Admin System
**Feature:** Online grant application and general contact form
**Date:** 2026-07-01
**Status:** Planning complete; implementation not started

---

## 1. Delivery Strategy

Work spans two repos: `bct-admin` (API endpoints, database, email) and `bct` (public site forms). Build backend first, then frontend.

| Phase | Name | Build Location | Outcome |
|---|---|---|---|
| 0 | Prerequisites | Cloudflare dashboard, bct-admin | Turnstile widget created, email provider configured, Wrangler secrets set |
| 1 | Schema and security helpers | bct-admin | Migration applied, Turnstile/honeypot/rate-limit helpers working |
| 2 | Public API endpoints | bct-admin | Application and contact submission endpoints accepting and processing requests |
| 3 | Service binding and proxy | bct-site | Form submissions proxy from public site to bct-admin |
| 4 | Application form page | bct-site | Online form replaces download-only page |
| 5 | Contact form page | bct-site | Contact form added to contact page |
| 6 | Admin enhancements | bct-admin | Source badges, contact submissions admin page, notifications |
| 7 | Privacy and compliance | bct-site, bct-admin | Privacy policy updated, GDPR consent, data retention |

## 2. Phase 0: Prerequisites

Tasks:

1. Create Cloudflare Turnstile widget for `buttercupchildrenstrust.org.uk` — get site key and secret key.
2. Set up email provider (Resend) if not already done for thank-you feature.
3. Store secrets: `wrangler secret put TURNSTILE_SECRET_KEY`, verify `RESEND_API_KEY` exists.
4. Decide on trustee notification email address — store as `TRUSTEE_NOTIFICATION_EMAIL` secret or D1 setting.
5. Decide on contact form destination email address.

Acceptance:

- Turnstile site key and secret key available.
- Email sending tested from Worker context.
- All open questions from PRD answered.

## 3. Phase 1: Schema and Security Helpers

Tasks:

1. Write and apply migration `0007_online_applications.sql` (source column, contact_submissions, rate_limits).
2. Create `src/helpers/turnstile.js` — `verifyTurnstile(token, ip, secretKey)`.
3. Create `src/helpers/public-api-security.js` — honeypot check, rate limit check, input sanitiser.
4. Apply migration to local and remote D1.

Acceptance:

- Migration applies cleanly.
- Existing applicant records get `source = 'manual'` default.
- Turnstile verification works against test keys.
- Rate limiter correctly counts and blocks.
- Input sanitiser strips HTML and enforces max lengths.

## 4. Phase 2: Public API Endpoints

Tasks:

1. Create `src/routes/public-api.js` with two POST endpoints.
2. `POST /api/public/apply` — full validation, Turnstile, honeypot, rate limit, D1 insert, confirmation email, notification email.
3. `POST /api/public/contact` — validation, Turnstile, honeypot, rate limit, D1 insert, email to BCT.
4. Mount in `src/index.js` **before** the auth middleware so these routes are publicly accessible.
5. Add CORS headers as fallback (in case service binding isn't used).

Acceptance:

- Valid application submission creates applicant record with `source = 'online'`.
- Confirmation email sent to applicant.
- Notification email sent to trustees.
- Invalid/spam submissions are rejected with appropriate error codes.
- Contact submission is stored and emailed.
- Existing authenticated routes are unaffected.

## 5. Phase 3: Service Binding and Proxy

Tasks:

1. Add service binding to `bct-site/wrangler.jsonc`: `BCT_ADMIN` → `bct-admin`.
2. Add proxy routes in bct-site Worker: `/apply-for-funding/submit` → bct-admin, `/contact/submit` → bct-admin.
3. Deploy bct-site.

Acceptance:

- Form submissions from the public site reach bct-admin without CORS issues.
- The bct-admin URL is not exposed to the public.

## 6. Phase 4: Application Form Page

Tasks:

1. Redesign `apply-for-funding.html` with the online form.
2. Include Turnstile script and invisible widget.
3. Include honeypot field (CSS-hidden).
4. Add client-side validation (required fields, email format, date format).
5. Add form submission handling (fetch POST, show success/error).
6. Keep PDF/DOCX download link as alternative.
7. Ensure mobile responsiveness and accessibility.

Acceptance:

- Form works on desktop, tablet, and mobile.
- Required fields are validated before submission.
- Successful submission shows confirmation with reference number.
- Failed submission shows clear error message.
- PDF download still available.
- Page content is crawlable without JavaScript.

## 7. Phase 5: Contact Form Page

Tasks:

1. Add contact form to `contact.html`.
2. Include Turnstile and honeypot.
3. Add client-side validation.
4. Add form submission handling.
5. Keep existing contact details (address, phone, email) visible.

Acceptance:

- Contact form submits successfully.
- Existing contact information remains visible.

## 8. Phase 6: Admin Enhancements

Tasks:

1. Add "Source" column/badge to applicant list view.
2. Add source filter option.
3. Create `src/routes/contact-submissions.js` — list, detail, mark read, mark replied.
4. Add "Contact Submissions" to admin navigation.
5. Add unread count indicator to dashboard or nav.

Acceptance:

- Online applications are visually distinct in the list.
- Admins can filter to online-only applications.
- Contact submissions are viewable and manageable.

## 9. Phase 7: Privacy and Compliance

Tasks:

1. Update privacy policy page to cover online form data collection.
2. Add GDPR consent checkbox to both forms.
3. Add data retention job for contact submissions (auto-delete after configurable period).
4. Verify no PII in Worker logs or error responses.

Acceptance:

- Privacy policy accurately describes data handling.
- Consent is required before submission.
- Old contact submissions are cleaned up automatically.

## 10. Risk Register

| Risk | Mitigation |
|---|---|
| Spam applications overwhelm admin | Turnstile + honeypot + rate limiting; admin can filter by source |
| Email provider blocked/bouncing | Monitor delivery; use verified sending domain |
| Sensitive child data in transit | All HTTPS; notification email excludes child details |
| Turnstile blocks legitimate users | Use invisible mode (minimal friction); provide PDF alternative |
| Service binding adds coupling | bct-site falls back to CORS-based direct POST if binding fails |
| Applicant enters wrong email | Confirmation email serves as verification; admin has phone as backup |
| Form used for harassment/abuse | Rate limiting; admin review before any action taken |
| Existing PDF workflow breaks | Keep PDF download available alongside online form |

## 11. Dependencies

- Cloudflare Turnstile widget (free, same Cloudflare account).
- Email provider (Resend recommended — shared with thank-you feature).
- Decision on all PRD open questions.
- Thank-you feature (Phase 1) should ideally be built first so email infrastructure is shared.

## 12. Definition of Done

- Online application form is live and submitting to D1.
- Contact form is live and emailing BCT.
- Confirmation emails arrive reliably.
- Trustee notification emails arrive.
- Bot protection is active and effective.
- Admin can view online applications and contact submissions.
- Privacy policy is updated.
- PDF alternative remains available.
- AI crawlers can still read and cite page content.
