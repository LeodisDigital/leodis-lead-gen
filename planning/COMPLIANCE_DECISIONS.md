# Compliance And Product Decision Register

## 1. Purpose

This register records the conservative assumptions for adapting Lead Gen V2
into Buttercup Lead Gen. It is not legal advice. Decisions marked
`approval required` must be confirmed by a UK data-protection and charity
fundraising professional before production use.

**Last reviewed:** 2026-06-30

## 2. Product Decisions

| ID | Decision | Reason | Status |
|---|---|---|---|
| PD-01 | MVP exports lists only; it does not send email, print letters, call prospects, or collect donations | Keeps message delivery, unsubscribe handling, print fulfilment, telephony, and payment compliance outside the first build | Default for build |
| PD-02 | Buttercup must be verified as charity principal before any campaign starts | The charity identity, controller identity, and charitable purpose drive every lawful-basis and transparency decision | Default for build |
| PD-03 | Corporate email exports are limited to verified active companies/LLPs and role mailboxes on verified domains | Preserves the existing PECR corporate-subscriber safety boundary | Default for build |
| PD-04 | Records that cannot be verified as email-eligible may enter postal-letter review, not email export | Postal direct marketing can be assessed separately, but uncertainty cannot become electronic marketing | Default for build |
| PD-05 | Cold individual email/text/social-DM outreach is not supported | Individuals generally need consent or a professional-approved charitable soft opt-in route | Default for build |
| PD-06 | Postal letters require source permission, LIA, transparency text, address provenance, and suppression/preference checks | Postal marketing still processes personal data and can trigger objections | Approval required |
| PD-07 | Suppression overrides every channel decision | Direct marketing objections must be honoured regardless of commercial or fundraising value | Approval required |
| PD-08 | LLM output cannot approve eligibility, identity, source permission, lawful basis, or channel | LLM output is not register evidence, legal advice, or consent evidence | Default for build |
| PD-09 | Source classes are disabled until documented approval exists | Public accessibility does not establish permission for collection and reuse | Default for build |
| PD-10 | The platform assumes controller responsibilities for prospect research unless reviewed otherwise | The platform determines material purposes and means for research and export | Approval required |
| PD-11 | The product language is "Do not contact", not only "unsubscribe" | The request must suppress every relevant outreach channel, including email, post, phone, and future imports | Default for build |
| PD-12 | Publicly posted individual or sole-trader addresses are not automatically contactable | Public availability supports provenance, but fairness, context, lawful basis, and suppression still decide postal eligibility | Approval required |
| PD-13 | Postal fulfilment supports self-print first and provider API second | Self-print avoids third-party data sharing; provider API is useful but needs contract, DPA, security, and status controls | Default for build |
| PD-14 | A DPIA must be completed before production processing | Prospect research for fundraising, individual/sole-trader postal outreach, and channel decision profiling are likely to meet the DPIA threshold under UK GDPR Article 35 | Approval required |
| PD-15 | Audit logs have a longer retention period than prospect data and are not subject to prospect erasure | Compliance reviews must be able to verify past decisions after prospect records are purged; suppression records also have independent retention | Default for build |
| PD-16 | Breach notification is a trustee/governance responsibility outside this app | ICO 72-hour notification and Charity Commission serious incident reporting are trustee duties that span the whole charity; the app must provide structured incident data (affected records, timeline, remediation) as input to the trustee process | Deferred — required before production launch |
| PD-17 | DSAR response uses an admin-only search screen inside the app plus manual review outside | Data subjects may request access under UK GDPR Article 15; the app provides a search-and-export tool for all held data; manual email/document search outside the app is the admin's responsibility; response timeframe is 1 calendar month | Default for build |

## 3. Legal And Operational Assumptions

| ID | Assumption | Product consequence | Status |
|---|---|---|---|
| LA-01 | Charity fundraising communications are direct marketing when they promote the charity's aims or ask for support | Campaigns need direct-marketing controls even if no product is sold | Approval required |
| LA-02 | PECR allows different treatment for corporate subscribers, but UK GDPR still applies where personal data is processed | Corporate email eligibility is necessary but not sufficient | Approval required |
| LA-03 | Sole traders, some partnerships, and individuals are not safe cold-email targets | These records are never email-eligible in the MVP | Approval required |
| LA-04 | Legitimate interests may support some fundraising prospecting only after a documented purpose, necessity, and balancing test | Every campaign and channel needs an LIA or approved equivalent | Approval required |
| LA-05 | Postal direct marketing may be possible without electronic-marketing consent, but still requires fairness, source, suppression, and objection controls | The app separates postal-letter eligibility from email eligibility | Approval required |
| LA-06 | Individuals have an absolute right to object to direct marketing | Suppression is P0 and checked immediately before export | Approval required |
| LA-07 | Fundraising Preference Service requests must be honoured for charity fundraising | FPS intake/import and suppression are launch gates | Approval required |
| LA-08 | Minimal suppression data may be retained after erasure where needed to honour objections | Suppression has a separate retention policy | Approval required |
| LA-09 | Charity-register and Companies House verification alone does not prove a mailbox, website, or postal address belongs to the intended prospect | Domain/address/mailbox linkage remains mandatory | Default for build |
| LA-10 | A public business address is generally lower risk than a home address, but both can identify an individual | The app must classify address context and require review for individuals and sole traders | Approval required |

## 4. Source Decisions

| Source | MVP status | Requirement before enabling |
|---|---|---|
| Companies House | Candidate corporate verification allowed subject to current terms and limits | Record approved fields/use, attribution, limits, review owner/date |
| Charity Commission register/API | Buttercup principal and charity-prospect verification allowed subject to current terms | Record API terms, attribution, permitted fields, and rate limits |
| OSCR public register/API | Buttercup principal verification allowed; direct-marketing list creation from OSCR data prohibited | Follow OSCR terms, especially restrictions on marketing-list generation |
| CCNI register | Charity-prospect verification only after terms/source review | Record allowed fields and reuse basis |
| Company/charity-owned public websites | Disabled until source-class policy approved | Robots/terms review, field minimisation, rate limits, evidence retention, and per-domain deny controls |
| Client-provided prospect lists | Disabled by default | Provenance declaration, source permission, LIA, suppression screen, and channel mapping |
| Licensed data provider | Disabled until contracted | Contract must permit exact fields, storage, verification, fundraising use, and onward export |
| Print/mail provider API, for example Stannp | Disabled until contracted and tested | Contract/DPA, API security review, template approval, test-mode proof, webhook/status validation, and suppression-before-submit controls |
| Preference services and suppression imports | Required before postal/named-person launch | Define matching rules, retention, audit, and update cadence |
| Google Maps, social networks, Yell, other directories | Prohibited for MVP | Written permission/licensing for intended extraction, storage, and reuse |

## 5. Channel Decisions

| Channel | Product decision | Required evidence |
|---|---|---|
| Corporate role email | Allowed after launch gates | Active company/LLP, verified domain, role mailbox, approved source, LIA/transparency, no suppression |
| Postal organisation letter | Allowed after launch gates | Verified organisation/address provenance, approved source, LIA/transparency, no suppression/preference match |
| Postal named-person letter | Review-only | Address/person source permission, context/fairness decision, LIA, transparency, preference checks, senior approval |
| Individual/sole-trader postal letter | Review-only | Public or supplied address provenance is not enough; approve only after source context, business/home address, sensitivity, LIA, preference, and Do Not Contact checks |
| Individual email/text/social DM | Not supported for cold outreach | Valid consent or approved charitable soft opt-in before any future feature |
| Telephone | Deferred | TPS/CTPS, script, call recording policy, and complaint workflow |

## 6. Required Professional Review Pack

Prepare and obtain approval for:

- DPIA covering prospect research, individual/sole-trader postal processing,
  channel decision profiling, provider data sharing, and retention lifecycle;
- controller/processor allocation and Buttercup controller identity;
- fundraising campaign LIA and channel-specific balancing tests;
- privacy notice and Article 14 transparency process;
- Fundraising Regulator Code alignment;
- FPS, internal suppression, objection, and complaint processes;
- Do Not Contact wording, token links/codes, confirmation flow, and retention;
- source-by-source terms/licensing register;
- recipient entity/channel policy;
- postal-letter template compliance notes;
- self-print process and any print/mail provider API contract, DPA, and
  operational status process;
- retention, suppression retention, audit retention, and legal holds;
- breach incident data requirements so trustees can fulfil ICO 72-hour and
  Charity Commission serious incident reporting obligations;
- DSAR response scope, format, and timeframe (1 calendar month), including
  interaction with hashed and suppression records;
- security, tenant isolation, and export launch evidence.

## 7. Primary References

- ICO, Business-to-business marketing:  
  https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/
- ICO, Electronic mail marketing:  
  https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/
- ICO, Plan direct marketing:  
  https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/direct-marketing-guidance/plan-direct-marketing/
- ICO, Legitimate interests:  
  https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/legitimate-interests/when-can-we-rely-on-legitimate-interests/
- Fundraising Regulator, Charitable purposes soft opt-in and fundraising marketing:  
  https://www.fundraisingregulator.org.uk/about-fundraising/resources/charitable-purposes-soft-opt-and-fundraising-marketing
- Charity Commission API documentation:  
  https://register-of-charities.charitycommission.gov.uk/en/documentation-on-the-api
- OSCR public APIs and register download terms:  
  https://www.oscr.org.uk/about-charities/search-the-register/download-the-scottish-charity-register/oscr-public-apis/
- Companies House API developer guidelines:  
  https://developer.company-information.service.gov.uk/developer-guidelines
- Buttercup Charity Commission record:  
  https://register-of-charities.charitycommission.gov.uk/en/charity-search/-/charity-details/4043784
- Buttercup Companies House record:  
  https://find-and-update.company-information.service.gov.uk/company/06666946
- Stannp API documentation, example print/mail provider:  
  https://www.stannp.com/uk/direct-mail-api

All references must be rechecked before production launch and at least
quarterly after launch.
