import { describe, expect, it, vi } from "vitest";

import { environmentSchema } from "@lead-gen/shared";
import { JobTransitionError } from "@lead-gen/jobs";

import { buildApp } from "./app.js";
import type { DatabasePool } from "./db.js";

describe("readiness", () => {
  it("serves a useful root response before the web build exists", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Lead Gen V2");

    await app.close();
  }, 15000);

  it("reports live capabilities disabled", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/readiness" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "foundation_only",
      launchFlags: {
        liveCollectionEnabled: false,
        productionExportsEnabled: false,
      },
    });

    await app.close();
  });
});

describe("operational errors", () => {
  it("returns conflict for an invalid job transition", async () => {
    const app = buildApp();
    app.get("/test-invalid-transition", async () => {
      throw new JobTransitionError("Cannot retry running job");
    });
    const response = await app.inject({ method: "GET", url: "/test-invalid-transition" });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ message: "Cannot retry running job" });
    await app.close();
  });
});

describe("public compliance intake", () => {
  it("creates a rights request with a minimised identifier", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: "rights-reference" }] })
      .mockResolvedValueOnce({ rows: [] });
    const app = buildApp({
      environment: environmentSchema.parse({ NODE_ENV: "test" }),
      pool: { query } as unknown as DatabasePool,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/public/rights-requests",
      payload: {
        requestType: "access",
        identifier: "person@example.com",
        details: "Please provide the records associated with this address.",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ reference: "rights-reference" });
    expect(query.mock.calls[0]?.[1]?.[1]).not.toBe("person@example.com");
    await app.close();
  });

  it("rejects an invalid objection mailbox", async () => {
    const app = buildApp({
      environment: environmentSchema.parse({ NODE_ENV: "test" }),
      pool: { query: vi.fn() } as unknown as DatabasePool,
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/public/objections",
      payload: { identifier: "not-an-email" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("accepts a public Do Not Contact request with minimised storage", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const app = buildApp({
      environment: environmentSchema.parse({ NODE_ENV: "test" }),
      pool: { query } as unknown as DatabasePool,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/public/do-not-contact",
      payload: {
        identifier: "person@example.com",
        details: "Please do not contact me again for fundraising.",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(query.mock.calls[0]?.[1]?.[1]).not.toBe("person@example.com");
    await app.close();
  });
});

describe("Cloudflare Zero Trust auth", () => {
  it("authenticates a user from the Access email header", async () => {
    const payload = Buffer.from(JSON.stringify({ email: "karl@buttercupchildrenstrust.org.uk" })).toString("base64url");
    const token = `header.${payload}.signature`;
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{
        userId: "user-1",
        email: "karl@buttercupchildrenstrust.org.uk",
        organisationId: "org-1",
        organisationName: "Buttercup",
        role: "owner",
        organisationApproved: true,
      }],
    });
    const app = buildApp({
      environment: environmentSchema.parse({ NODE_ENV: "test" }),
      pool: { query } as unknown as DatabasePool,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/me",
      cookies: {
        cf_authorization: token,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      email: "karl@buttercupchildrenstrust.org.uk",
      organisationName: "Buttercup",
      role: "owner",
    });
    await app.close();
  });

  it("rejects local password login", async () => {
    const app = buildApp({
      environment: environmentSchema.parse({ NODE_ENV: "test" }),
      pool: { query: vi.fn() } as unknown as DatabasePool,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { email: "karl@buttercupchildrenstrust.org.uk", password: "anything" },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json().message).toContain("Cloudflare Zero Trust");
    await app.close();
  });
});

describe("Buttercup export gates", () => {
  it("keeps the legacy mixed export disabled", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          userId: "user-1",
          email: "owner@example.com",
          organisationId: "org-1",
          organisationName: "Buttercup",
          role: "owner",
          organisationApproved: true,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "campaign-1",
          organisation_id: "org-1",
          principal_id: "principal-1",
          name: "Appeal",
          purpose: "Fundraising appeal",
          principal_verified_at: new Date(),
          principal_company_number: "06666946",
        }],
      });
    const app = buildApp({
      environment: environmentSchema.parse({ NODE_ENV: "test" }),
      pool: { query } as unknown as DatabasePool,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/campaigns/campaign-1/export.csv",
      cookies: { lead_gen_session: "test-session" },
    });

    expect(response.statusCode).toBe(410);
    expect(response.json().message).toContain("mixed legacy export is disabled");
    await app.close();
  });
});

describe("Buttercup admin routes", () => {
  it("stores the Google Places integration setting for owner users", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          userId: "user-1",
          email: "owner@example.com",
          organisationId: "org-1",
          organisationName: "Buttercup",
          role: "owner",
          organisationApproved: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const app = buildApp({
      environment: environmentSchema.parse({
        NODE_ENV: "test",
        SESSION_SECRET: "test-session-secret-with-enough-entropy",
      }),
      pool: { query } as unknown as DatabasePool,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/settings/google-places",
      cookies: { lead_gen_session: "test-session" },
      payload: { apiKey: "places-key" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, configured: true });
    expect(query.mock.calls[1]?.[0]).toContain("insert into platform_settings");
    expect(query.mock.calls[1]?.[1]?.[0]).toBe("integration.google_places_api_key");
    await app.close();
  });

  it("keeps Google discovery locked until Google Places is configured", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          userId: "user-1",
          email: "owner@example.com",
          organisationId: "org-1",
          organisationName: "Buttercup",
          role: "owner",
          organisationApproved: true,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          id: "campaign-1",
          organisation_id: "org-1",
          principal_id: "principal-1",
          name: "Appeal",
          purpose: "Fundraising appeal",
          status: "approved",
          principal_verified_at: new Date(),
          principal_company_number: "06666946",
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const app = buildApp({
      environment: environmentSchema.parse({ NODE_ENV: "test" }),
      pool: { query } as unknown as DatabasePool,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/campaigns/campaign-1/discover-google",
      cookies: { lead_gen_session: "test-session" },
      payload: {
        query: "charities",
        location: "Leeds",
        maxResults: 2,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain("Google Places API key is not configured");
    await app.close();
  });

  it("creates an approved letter template manifest for owner users", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          userId: "user-1",
          email: "owner@example.com",
          organisationId: "org-1",
          organisationName: "Buttercup",
          role: "owner",
          organisationApproved: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "template-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const app = buildApp({
      environment: environmentSchema.parse({ NODE_ENV: "test" }),
      pool: { query } as unknown as DatabasePool,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/settings/letter-templates",
      cookies: { lead_gen_session: "test-session" },
      payload: {
        version: "letter-2026-01",
        name: "Buttercup fundraising letter",
        subjectLine: "Buttercup fundraising appeal",
        bodyText: "Dear supporter, this is the approved fundraising letter copy with a Do Not Contact route.",
        mergeFields: ["organisation_name", "do_not_contact_url"],
        controllerIdentity: "Buttercup Children's Trust",
        doNotContactRoute: "/do-not-contact",
        evidenceReference: "template-approval-1",
        expiresAt: "2027-06-30T00:00:00.000Z",
        approved: true,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: "template-1" });
    expect(query.mock.calls[1]?.[0]).toContain("insert into letter_template_manifests");
    await app.close();
  });

  it("creates an approved email template for owner users", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          userId: "user-1",
          email: "owner@example.com",
          organisationId: "org-1",
          organisationName: "Buttercup",
          role: "owner",
          organisationApproved: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: "email-template-1" }] })
      .mockResolvedValueOnce({ rows: [] });
    const app = buildApp({
      environment: environmentSchema.parse({ NODE_ENV: "test" }),
      pool: { query } as unknown as DatabasePool,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/settings/email-templates",
      cookies: { lead_gen_session: "test-session" },
      payload: {
        version: "email-2026-01",
        name: "Buttercup introduction email",
        subjectLine: "Partnership enquiry from Buttercup Children's Trust",
        bodyText: "Hello, this is the approved email template copy with a Do Not Contact link.",
        mergeFields: ["organisation_name", "do_not_contact_url"],
        controllerIdentity: "Buttercup Children's Trust",
        doNotContactRoute: "/do-not-contact",
        evidenceReference: "email-template-approval-1",
        expiresAt: "2027-06-30T00:00:00.000Z",
        approved: true,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: "email-template-1" });
    expect(query.mock.calls[1]?.[0]).toContain("insert into email_template_manifests");
    await app.close();
  });

  it("runs DSAR search without exposing the raw search identifier as the reference hash", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          userId: "user-1",
          email: "owner@example.com",
          organisationId: "org-1",
          organisationName: "Buttercup",
          role: "owner",
          organisationApproved: true,
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const app = buildApp({
      environment: environmentSchema.parse({ NODE_ENV: "test" }),
      pool: { query } as unknown as DatabasePool,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/dsar-search?identifier=person%40example.com",
      cookies: { lead_gen_session: "test-session" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().identifierHash).not.toBe("person@example.com");
    await app.close();
  });
});
