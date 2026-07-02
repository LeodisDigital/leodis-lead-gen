# Gmail API Setup Guide for BCT Admin

**Purpose:** Send transactional emails (thank-you letters, application confirmations, contact form forwarding) from BCT admin via the Gmail API.
**When:** After the email-sending features are built and ready to deploy.

---

## Overview

BCT admin runs on Cloudflare Workers, which can only make HTTP requests (no SMTP). The Gmail API works over HTTPS, so it's a good fit. We'll use a **Google Cloud service account** with **domain-wide delegation** so the Worker can send emails as any BCT address (e.g. appeals@, applications@) without a human logging in each time.

---

## Step-by-Step Setup

### 1. Set Up Google Workspace

If not already done:

- Sign up at workspace.google.com with `buttercupchildrenstrust.org.uk`.
- Verify domain ownership (usually a DNS TXT record — you can add this via Cloudflare).
- Create the email addresses you'll need:
  - `appeals@buttercupchildrenstrust.org.uk` (contact form)
  - `applications@buttercupchildrenstrust.org.uk` (application confirmations / thank-you letters — or use an existing address)

### 2. Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Click **Select a project** > **New Project**.
3. Name it something like `bct-admin-email`.
4. Click **Create**.

### 3. Enable the Gmail API

1. In the Google Cloud console, go to **APIs & Services** > **Library**.
2. Search for **Gmail API**.
3. Click **Enable**.

### 4. Create a Service Account

A service account is like a robot user — it can send emails on behalf of real users without needing a password or login prompt.

1. Go to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** > **Service Account**.
3. Name it `bct-email-sender`.
4. Click **Done** (skip the optional permissions steps).
5. Click on the new service account to open it.
6. Go to the **Keys** tab.
7. Click **Add Key** > **Create new key** > **JSON**.
8. Save the downloaded JSON file somewhere safe. It contains:
   - `client_email` — the service account's email address
   - `private_key` — the key used to sign authentication tokens

**Keep this file safe and never commit it to git.** You'll paste specific values into Cloudflare secrets.

### 5. Set Up Domain-Wide Delegation

This allows the service account to send emails as any user in your Workspace domain.

1. In the Google Cloud console, on the service account details page, note the **Client ID** (a long number like `1234567890123456789`).
2. Go to [admin.google.com](https://admin.google.com) (Google Workspace Admin).
3. Navigate to **Security** > **Access and data control** > **API controls**.
4. Click **Manage Domain-wide Delegation**.
5. Click **Add new**.
6. Enter:
   - **Client ID:** the number from step 1
   - **OAuth Scopes:** `https://www.googleapis.com/auth/gmail.send`
7. Click **Authorise**.

This grants the service account permission to send emails as any user in the `buttercupchildrenstrust.org.uk` domain — but only send, nothing else.

### 6. Store Credentials as Cloudflare Secrets

The Worker needs three pieces of information from the service account JSON file:

```bash
# The service account's email (from the JSON file's "client_email" field)
wrangler secret put GMAIL_SERVICE_ACCOUNT_EMAIL
# Paste: bct-email-sender@bct-admin-email.iam.gserviceaccount.com

# The private key (from the JSON file's "private_key" field — the whole thing including BEGIN/END lines)
wrangler secret put GMAIL_PRIVATE_KEY
# Paste the full private key

# The email address to send FROM (the Workspace user the service account impersonates)
wrangler secret put GMAIL_SEND_AS
# Paste: applications@buttercupchildrenstrust.org.uk (or whichever address)
```

### 7. DNS Records for Email Deliverability

Google Workspace setup will guide you through most of this, but make sure these are in place:

**MX Records** (so Workspace receives email):
- Google provides these during Workspace setup.

**SPF Record** (so sent emails aren't marked as spam):
- Add/update a TXT record on `buttercupchildrenstrust.org.uk`:
  ```
  v=spf1 include:_spf.google.com ~all
  ```

**DKIM Record** (email signing):
- In Google Workspace Admin > **Apps** > **Google Workspace** > **Gmail** > **Authenticate email**.
- Generate DKIM key and add the TXT record it gives you to Cloudflare DNS.

**DMARC Record** (optional but recommended):
- Add a TXT record for `_dmarc.buttercupchildrenstrust.org.uk`:
  ```
  v=DMARC1; p=none; rua=mailto:admin@buttercupchildrenstrust.org.uk
  ```
  Start with `p=none` (monitor mode), move to `p=quarantine` once you're confident everything's working.

### 8. Test

Once the features are deployed and secrets are set:

1. Go to the BCT admin donations page.
2. Open any donation with an email address.
3. Send a test thank-you email.
4. Check the recipient inbox (and spam folder).
5. Check the "from" address shows correctly.

If emails land in spam, check:
- SPF, DKIM, and DMARC records are set up correctly (use [mxtoolbox.com](https://mxtoolbox.com) to verify).
- The "from" address matches a real Workspace user.

---

## How It Works Technically

The Worker sends emails by:

1. **Creating a signed JWT** using the service account's private key (all done in the Worker using Web Crypto API — no Node.js needed).
2. **Exchanging the JWT for an access token** via `POST https://oauth2.googleapis.com/token`.
3. **Calling the Gmail API** via `POST https://gmail.googleapis.com/gmail/v1/users/{sendAs}/messages/send` with the access token.
4. The email body is a base64url-encoded RFC 2822 message (plain text with headers).

This is all HTTP — no SMTP, no sockets, fully compatible with Cloudflare Workers.

---

## Costs

- **Google Workspace:** starts at £5.52/user/month (Business Starter). You only need one user for sending if budget is tight.
- **Gmail API:** free for Workspace users. No per-email charge. Sending limit is 2,000 emails/day per user — more than enough for BCT.

---

## Checklist

- [ ] Google Workspace account set up with BCT domain
- [ ] Email addresses created (appeals@, applications@, or as decided)
- [ ] Google Cloud project created
- [ ] Gmail API enabled
- [ ] Service account created with JSON key downloaded
- [ ] Domain-wide delegation configured with `gmail.send` scope
- [ ] Three Wrangler secrets set (`GMAIL_SERVICE_ACCOUNT_EMAIL`, `GMAIL_PRIVATE_KEY`, `GMAIL_SEND_AS`)
- [ ] SPF record added/updated in Cloudflare DNS
- [ ] DKIM record added in Cloudflare DNS
- [ ] DMARC record added in Cloudflare DNS
- [ ] Test email sent and received successfully
