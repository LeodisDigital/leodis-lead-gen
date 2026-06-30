import { describe, expect, it, vi } from "vitest";

import { executeJob, hourlyIdempotencyKey, isSupportedJob } from "./jobs.js";

describe("maintenance jobs", () => {
  it("uses stable hourly idempotency keys", () => {
    expect(hourlyIdempotencyKey(
      "prune_expired_sessions",
      new Date("2026-06-12T17:59:59Z"),
    )).toBe("prune_expired_sessions:2026-06-12T17");
  });

  it("rejects jobs outside the explicit worker allowlist", () => {
    expect(isSupportedJob("prune_expired_sessions")).toBe(true);
    expect(isSupportedJob("enforce_retention")).toBe(true);
    expect(isSupportedJob("review_campaign_lead")).toBe(false);
  });

  it("executes the selected maintenance statement", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 4 });
    await expect(executeJob({ query } as never, "prune_expired_sessions")).resolves.toBe(4);
    expect(query).toHaveBeenCalledWith("delete from user_sessions where expires_at <= now()");
  });

  it("executes retention enforcement as bounded update statements", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({ rowCount: 3 })
      .mockResolvedValueOnce({ rowCount: 4 });
    await expect(executeJob({ query } as never, "enforce_retention")).resolves.toBe(10);
    expect(query).toHaveBeenCalledTimes(4);
  });
});
