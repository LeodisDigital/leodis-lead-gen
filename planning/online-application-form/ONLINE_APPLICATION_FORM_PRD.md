# Product Requirements: Online Application Form and Contact Form

**Product:** Buttercup Children's Trust Public Website + Admin System
**Feature:** Online grant application submission and general contact form
**Date:** 2026-07-01
**Status:** Planning

---

## 1. Problem Statement

BCT's current application process requires families to download a PDF/DOCX form from the website, complete it offline, and return it by post or email. This creates friction:

- Families in crisis may not have a printer or know how to fill in a DOCX file.
- Manual data entry by trustees from paper/email forms is time-consuming and error-prone.
- There is no confirmation to the applicant that their application was received.
- There is no online contact form — the website only lists an email address.

## 2. Goal

Replace the download-and-return process with an online form that submits directly into the BCT admin database, sends a confirmation email to the applicant, and provides a general contact form for non-application enquiries.

## 3. Scope

### In Scope

- **Online grant application form** on the public BCT website (`buttercupchildrenstrust.org.uk/apply-for-funding`).
- **Confirmation email** sent to the applicant on successful submission.
- **General contact form** on the contact page, submitting to a designated BCT email address.
- **Spam/bot protection** using Cloudflare Turnstile (invisible challenge) — free, privacy-friendly, does not block AI crawlers from reading page content.
- **Rate limiting** to prevent abuse.
- **Application appears in BCT admin** as a new applicant record with status "New" and source marked as "Online".
- **Admin notification** email or in-app indicator when a new online application arrives.
- **Accessibility** — form must be usable with assistive technology and on mobile devices.

### Out of Scope

- User accounts or applicant login/tracking portal.
- File uploads (photos, documents) — these can be added later.
- Payment processing.
- Changes to the admin applicant workflow beyond receiving online submissions.
- Auto-assessment or eligibility screening (trustees review all applications manually).

## 4. User Stories

### Application Form

1. As a parent/carer, I want to apply for a grant online so that I don't need to print and post a paper form.
2. As a parent/carer, I want to receive a confirmation email so that I know my application was received.
3. As a parent/carer, I want to understand what information is needed before I start so that I can gather it in advance.
4. As a trustee, I want online applications to appear in the admin system automatically so that I don't have to re-type them.
5. As a trustee, I want to know when a new application arrives so that I can review it promptly.
6. As a trustee, I want to distinguish online applications from manually entered ones so that I can track the source.

### Contact Form

7. As a visitor, I want to send a message to BCT without opening my email client so that I can ask a question quickly.
8. As a trustee, I want contact form messages to arrive at the right email address so that enquiries are handled by the appropriate person.

## 5. Application Form Fields

Based on the existing applicant schema, split into clear sections for the public form. Only fields relevant to the applicant are included — internal admin fields (checklist, meeting dates, grant outcome) are excluded.

### Section 1: About You (the applicant/carer)

| Field | Required | Notes |
|---|---|---|
| Your full name | Yes | Maps to `applicants_name` |
| Email address | Yes | Maps to `email` — needed for confirmation |
| Phone number | No | Maps to `telephone` |
| Mobile number | No | Maps to `mobile` |
| Address | Yes | Maps to `address` |
| Town/City | Yes | Maps to `post_town` |
| Postcode | Yes | Maps to `post_code` |
| County | No | Maps to `county` |

### Section 2: Professional Referrer (if applicable)

| Field | Required | Notes |
|---|---|---|
| Name of social worker, health visitor, or professional supporting this application | No | Maps to `carer_name` |
| Their phone number | No | Maps to `carer_phone` |
| Their email address | No | Maps to `carer_email` |

### Section 3: About the Child

| Field | Required | Notes |
|---|---|---|
| Child's first name | Yes | Maps to `childs_name` — first name only for privacy |
| Child's date of birth | Yes | Maps to `childs_dob` |

### Section 4: Your Application

| Field | Required | Notes |
|---|---|---|
| What are you applying for and why? | Yes | Maps to `reason_for_grant` — textarea |
| How would you like us to contact you? | No | Maps to `contact_method` — Email / Phone / Post |

### Section 5: Confirmation

| Field | Required | Notes |
|---|---|---|
| "I confirm the information provided is accurate" | Yes | Checkbox, not stored — validation only |
| Turnstile challenge | Invisible | Cloudflare Turnstile widget |

### Contact Form Fields

| Field | Required | Notes |
|---|---|---|
| Your name | Yes | |
| Email address | Yes | For reply |
| Subject | No | Defaults to "Website enquiry" |
| Message | Yes | Textarea |
| Turnstile challenge | Invisible | |

## 6. Bot Protection Strategy

### Cloudflare Turnstile (recommended)

- Free, privacy-preserving CAPTCHA alternative from Cloudflare.
- **Invisible mode** — no user interaction required in most cases; only shows a challenge if behaviour is suspicious.
- Does not affect page content crawlability — AI crawlers (Google, ChatGPT, Perplexity) index the page HTML normally; Turnstile only activates on form submission.
- Site key embedded in form HTML; secret key stored as Wrangler secret.
- Server-side verification via `POST https://challenges.cloudflare.com/turnstile/v0/siteverify`.

### Additional Layers

- **Honeypot field** — hidden field that real users won't fill in; bots that auto-fill all fields are rejected.
- **Rate limiting** — Cloudflare Workers rate limiting or simple IP-based throttle (e.g. max 3 submissions per IP per hour).
- **No `robots.txt` block on the page** — the form page content remains fully crawlable and citable by AI systems. Only the POST submission endpoint requires Turnstile verification.

## 7. AI Citation Considerations

The apply-for-funding page should remain fully indexable:

- Page content (eligibility criteria, what BCT does, how to apply) is standard HTML — crawlable by all search engines and AI systems.
- Turnstile is JavaScript-only and activates on form interaction, not page load.
- The `<form>` element is standard HTML — AI systems can describe the form fields without triggering Turnstile.
- No JavaScript rendering required to read the page content.
- Consider adding structured data (FAQPage schema) for common questions about eligibility.

## 8. Confirmation Email Content

Subject: **We've received your application — Buttercup Children's Trust**

```
Dear {{applicants_name}},

Thank you for submitting your application to the Buttercup Children's Trust.

Your application has been received and will be reviewed by our trustees. We aim to review all applications at our next trustees meeting. We will contact you once a decision has been made.

If you need to provide any additional information or have any questions, please contact us at [BCT email address].

Your reference number is {{application_id}}.

Kind regards,

The Trustees
Buttercup Children's Trust
Registered Charity No. 1163981
```

## 9. Open Questions

| # | Question | Options | Decision |
|---|---|---|---|
| 1 | Where should the form POST endpoint live? | (a) Public API route on bct-admin worker (needs unauthenticated path), (b) Endpoint on bct-site worker with shared D1 binding, (c) Separate API worker | **Option (a)** — public API on bct-admin, proxied via Service Binding from bct-site. |
| 2 | Should the contact form go to a single email or route by subject? | Single inbox / Route to specific trustees | **Single inbox** — appeals@buttercupchildrenstrust.org.uk (may change, user confirming with office staff). |
| 3 | Should applicants be able to save and return to a draft? | Yes (adds complexity) / No (single session) | **No** — single session for now. Monitor feedback and add later if needed. |
| 4 | Should the form collect the child's full name or first name only? | Full name (matches admin) / First name only (privacy) | **Full name** — data goes to a secure database, not publicly visible. |
| 5 | Which email provider for confirmation emails? | Same as thank-you feature (Resend) / Separate | **Gmail API** — same as thank-you feature. Google Workspace service account with domain-wide delegation. Setup guide in `planning/GMAIL_API_SETUP_GUIDE.md`. |
| 6 | Should there be a GDPR/privacy consent checkbox? | Yes (links to privacy policy) / No (covered by existing site privacy policy) | **Yes** — required. Privacy policy must be live on the public site before implementation. |
| 7 | Should the PDF/DOCX download remain as an alternative? | Yes (keep for those who prefer it) / No (remove to simplify) | **Yes** — keep for those who prefer paper. |
| 8 | Contact form destination email address? | | **appeals@buttercupchildrenstrust.org.uk** (provisional, may change). |
