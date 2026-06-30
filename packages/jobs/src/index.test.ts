import { describe, expect, it } from "vitest";

import { JobTransitionError, retryDelayMs, transitionJob } from "./index.js";

describe("job state machine", () => {
  it("starts and completes a queued job", () => {
    const started = transitionJob(
      { status: "queued", attempts: 0, maxAttempts: 3, cancelRequested: false },
      { action: "start" },
    );
    expect(started).toMatchObject({ status: "running", attempts: 1 });
    expect(transitionJob(
      { ...started, maxAttempts: 3 },
      { action: "complete" },
    )).toMatchObject({ status: "completed" });
  });

  it("schedules bounded exponential retries then dead-letters", () => {
    const now = new Date("2026-06-12T12:00:00Z");
    const retry = transitionJob(
      { status: "running", attempts: 2, maxAttempts: 3, cancelRequested: false },
      { action: "fail", error: "temporary", now },
    );
    expect(retry).toMatchObject({
      status: "retry_scheduled",
      availableAt: new Date(now.getTime() + 2_000),
    });
    expect(transitionJob(
      { status: "running", attempts: 3, maxAttempts: 3, cancelRequested: false },
      { action: "fail", error: "still failing", now },
    )).toMatchObject({ status: "dead_letter" });
  });

  it("honours cancellation before and during execution", () => {
    expect(transitionJob(
      { status: "queued", attempts: 0, maxAttempts: 3, cancelRequested: false },
      { action: "request_cancel" },
    )).toMatchObject({ status: "cancelled", cancelRequested: true });
    expect(transitionJob(
      { status: "running", attempts: 1, maxAttempts: 3, cancelRequested: true },
      { action: "complete" },
    )).toMatchObject({ status: "cancelled" });
  });

  it("caps backoff at one hour", () => {
    expect(retryDelayMs(30)).toBe(3_600_000);
  });

  it("uses a typed error for invalid operational transitions", () => {
    expect(() => transitionJob(
      { status: "completed", attempts: 1, maxAttempts: 3, cancelRequested: false },
      { action: "request_cancel" },
    )).toThrow(JobTransitionError);
  });
});
