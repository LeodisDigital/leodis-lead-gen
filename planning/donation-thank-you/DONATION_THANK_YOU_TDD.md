# Technical Design: Donation Thank-You Letters and Emails

**Product:** Buttercup Children's Trust Admin System
**Feature:** Donation thank-you correspondence
**Date:** 2026-07-01
**Status:** Planning

---

## 1. Architecture Overview

All work is in BCT admin (Cloudflare Workers + Hono + D1). No changes to lead-gen.

```
Donation record
  ├── "Send Thank-You Email" → email API (Resend/Mailgun) → donor inbox
  ├── "Print Thank-You Letter" → printable HTML page → browser print/PDF
  └── Correspondence log (D1 table) ← records all sends
```

## 2. Database Changes

### Migration: `0006_thank_you_correspondence.sql`

```sql
-- Thank-you templates (admin-editable)
CREATE TABLE IF NOT EXISTS thank_you_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',  -- 'email' or 'letter'
  subject TEXT,                            -- email subject line (email only)
  body TEXT NOT NULL,                      -- template body with {{merge_tags}}
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Correspondence log
CREATE TABLE IF NOT EXISTS donation_correspondence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  donation_id INTEGER NOT NULL REFERENCES donations(id),
  channel TEXT NOT NULL,                   -- 'email' or 'letter'
  template_id INTEGER REFERENCES thank_you_templates(id),
  recipient_email TEXT,                    -- email address used (email only)
  subject TEXT,                            -- rendered subject
  body TEXT NOT NULL,                      -- rendered body (as sent/printed)
  donation_amount_noted TEXT,              -- free-text amount if admin entered one
  status TEXT NOT NULL DEFAULT 'sent',     -- 'sent', 'printed', 'failed'
  error_message TEXT,                      -- if failed
  sent_by TEXT NOT NULL,                   -- admin email from Zero Trust
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_correspondence_donation ON donation_correspondence(donation_id);
CREATE INDEX idx_correspondence_sent_at ON donation_correspondence(sent_at);

-- Flag on donations table for quick filtering
ALTER TABLE donations ADD COLUMN thank_you_sent_at TEXT;
```

## 3. Email Provider Integration

### Recommended: Resend

- Simple HTTP API, good free tier (100 emails/day), UK-friendly.
- Single `fetch()` call per email, no SDK needed.
- API key stored as Wrangler secret: `RESEND_API_KEY`.
- From address configurable in a `thank_you_settings` platform setting or hardcoded initially.

### Send Helper: `src/helpers/thank-you-email.js`

```javascript
export async function sendThankYouEmail({ to, from, subject, body, apiKey }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: body,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Email send failed: ${response.status} ${err}`);
  }
  return response.json();
}
```

### Merge Field Renderer: `src/helpers/thank-you-merge.js`

```javascript
export function renderMergeFields(template, fields) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return fields[key] !== undefined && fields[key] !== null ? fields[key] : match;
  });
}

export function buildMergeFields(donation, { amountNoted } = {}) {
  const today = new Date();
  return {
    donor_name: donation.donors_name || 'Supporter',
    charity_name: donation.charity || '',
    donor_email: donation.email || '',
    address: donation.address || '',
    post_town: donation.post_town || '',
    post_code: donation.post_code || '',
    county: donation.county || '',
    donation_id: `DO${String(donation.id).padStart(4, '0')}`,
    amount: amountNoted || '',
    today: today.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    }),
  };
}
```

## 4. Routes

All routes admin-only, mounted under the existing donation routes or a new `/thank-you` prefix.

### Email and Letter Actions (on donation detail)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/donations/show/:id/thank-you` | Thank-you form: choose template, preview, optionally enter amount |
| `POST` | `/donations/show/:id/thank-you/send-email` | Send email, log correspondence, set flag |
| `GET` | `/donations/show/:id/thank-you/print-letter` | Render printable letter HTML (clean layout, no nav) |
| `POST` | `/donations/show/:id/thank-you/log-letter` | Log that a letter was printed/posted |

### Template Management

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/thank-you/templates` | List templates |
| `GET` | `/thank-you/templates/new` | Create template form |
| `POST` | `/thank-you/templates/save` | Save template |
| `GET` | `/thank-you/templates/:id/edit` | Edit template form |

### Bulk Actions

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/donations/bulk-thank-you` | Show donations not yet thanked, with email addresses |
| `POST` | `/donations/bulk-thank-you/send` | Send to selected, log each, show results |

### Correspondence Log

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/donations/show/:id/correspondence` | View all correspondence for a donation |

## 5. UI Components

### Donation Detail — Thank-You Panel

A new panel on the donation show page (similar to fundraising panel):

- Shows last thank-you date if sent, or "No thank-you sent yet" with a prominent button.
- "Send Email" button (disabled if no email address on record).
- "Print Letter" button (always available).
- Recent correspondence log entries.

### Thank-You Send Form (`/donations/show/:id/thank-you`)

- Template selector (dropdown of email or letter templates).
- Live preview of rendered template with merge fields filled.
- Optional "Donation amount" free-text field (for inclusion in the message).
- "Send Email" or "Print Letter" button depending on template channel.

### Printable Letter Page

- Clean HTML page with no navigation, header, or footer.
- BCT letterhead area (charity name, address, charity number, logo placeholder).
- Donor address block.
- Date.
- Letter body from template.
- Signature area.
- `@media print` styles for clean A4 output.
- Auto-triggers `window.print()` on load (same as Meeting Pack pattern).

### Donation List — Thank-You Column

- Add a "Thanked" column showing a tick/date or empty.
- Add filter option: "Not yet thanked" to quickly find donations needing attention.

## 6. Default Templates

### Default Email Template

```
Subject: Thank you for your donation — Buttercup Children's Trust

Dear {{donor_name}},

Thank you so much for your generous donation to the Buttercup Children's Trust.

Your support makes a real difference to the lives of children and families across the region. Every contribution helps us provide essential support to those who need it most.

If you are a UK taxpayer and have not already done so, please consider completing a Gift Aid declaration, which allows us to claim an additional 25p for every £1 you donate at no extra cost to you.

With grateful thanks,

The Trustees
Buttercup Children's Trust
Registered Charity No. 1163981

Email services provided by Leodis Digital — Helping you connect with the people who matter.
```

### Default Letter Template

```
{{today}}

{{donor_name}}
{{address}}
{{post_town}}
{{post_code}}

Dear {{donor_name}},

Thank you so much for your generous donation to the Buttercup Children's Trust.

Your support makes a real difference to the lives of children and families across the region. Every contribution helps us provide essential support to those who need it most.

If you are a UK taxpayer and have not already done so, please consider completing a Gift Aid declaration, which allows us to claim an additional 25p for every £1 you donate at no extra cost to you.

With grateful thanks,


______________________________
The Trustees
Buttercup Children's Trust
Registered Charity No. 1163981

leodisdigital.co.uk
```

## 7. File Inventory

### New Files

| File | Purpose |
|---|---|
| `migrations/0006_thank_you_correspondence.sql` | Schema for templates, correspondence log, thank_you_sent_at flag |
| `src/helpers/thank-you-email.js` | Email send via Resend/Mailgun HTTP API |
| `src/helpers/thank-you-merge.js` | Merge field rendering and field builder |
| `src/routes/thank-you.js` | All thank-you routes (send, print, templates, bulk, log) |
| `src/templates/components/thank-you-panel.js` | Panel for donation detail page |
| `src/templates/thank-you-letter.js` | Printable letter HTML layout |

### Modified Files

| File | Change |
|---|---|
| `src/index.js` | Mount thank-you routes |
| `src/routes/donations.js` | Add thank-you panel to show page, add "thanked" column to list |
| `public/styles.css` | Print styles for letter layout, thank-you panel styles |

## 8. Security Considerations

- All routes gated by `c.get('isAdmin')`.
- Email API key stored as Wrangler secret, never exposed to client.
- Correspondence log stores the rendered body (what was actually sent) for audit.
- Recipient email is stored in the correspondence log (necessary for audit — donors have already provided their email to the charity).
- No PII is sent to any third party beyond the email provider (which receives only the to-address and message body).
- Bulk send requires confirmation with preview count.

## 9. Testing Checklist

- [ ] Send thank-you email to a donor with email address — email arrives, log entry created, flag set.
- [ ] Attempt to send email to donor without email — button disabled, appropriate message shown.
- [ ] Print thank-you letter — clean A4 layout, merge fields rendered, log entry created on "mark as printed".
- [ ] Edit a template — changes reflected in next send/preview.
- [ ] Bulk send — correct count shown, emails sent, all logged individually.
- [ ] Duplicate send — correspondence log shows multiple entries, admin can see previous sends before sending again.
- [ ] Donation list shows "thanked" indicator correctly.
- [ ] Non-admin user cannot access any thank-you routes.
- [ ] Audit log captures all send events.
