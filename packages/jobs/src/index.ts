export const jobStatuses = [
  "queued",
  "running",
  "retry_scheduled",
  "completed",
  "cancelled",
  "dead_letter",
] as const;

export type JobStatus = (typeof jobStatuses)[number];

export type JobState = {
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  cancelRequested: boolean;
};

export type JobTransition =
  | { action: "start" }
  | { action: "complete" }
  | { action: "fail"; error: string; now: Date; baseDelayMs?: number }
  | { action: "request_cancel" }
  | { action: "retry"; now: Date };

export type JobTransitionResult = {
  status: JobStatus;
  attempts: number;
  lastError?: string;
  availableAt?: Date;
  cancelRequested: boolean;
};

export class JobTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobTransitionError";
  }
}

export function retryDelayMs(attempts: number, baseDelayMs = 1_000): number {
  return Math.min(baseDelayMs * 2 ** Math.max(attempts - 1, 0), 60 * 60 * 1_000);
}

export function transitionJob(
  state: JobState,
  transition: JobTransition,
): JobTransitionResult {
  if (transition.action === "request_cancel") {
    if (state.status === "completed" || state.status === "dead_letter") {
      throw new JobTransitionError(`Cannot cancel ${state.status} job`);
    }
    return {
      status: state.status === "running" ? "running" : "cancelled",
      attempts: state.attempts,
      cancelRequested: true,
    };
  }

  if (transition.action === "start") {
    if (!["queued", "retry_scheduled"].includes(state.status)) {
      throw new JobTransitionError(`Cannot start ${state.status} job`);
    }
    if (state.cancelRequested) {
      return { status: "cancelled", attempts: state.attempts, cancelRequested: true };
    }
    return {
      status: "running",
      attempts: state.attempts + 1,
      cancelRequested: false,
    };
  }

  if (transition.action === "complete") {
    if (state.status !== "running") throw new JobTransitionError(`Cannot complete ${state.status} job`);
    return {
      status: state.cancelRequested ? "cancelled" : "completed",
      attempts: state.attempts,
      cancelRequested: state.cancelRequested,
    };
  }

  if (transition.action === "fail") {
    if (state.status !== "running") throw new JobTransitionError(`Cannot fail ${state.status} job`);
    if (state.cancelRequested) {
      return {
        status: "cancelled",
        attempts: state.attempts,
        lastError: transition.error,
        cancelRequested: true,
      };
    }
    if (state.attempts >= state.maxAttempts) {
      return {
        status: "dead_letter",
        attempts: state.attempts,
        lastError: transition.error,
        cancelRequested: false,
      };
    }
    return {
      status: "retry_scheduled",
      attempts: state.attempts,
      lastError: transition.error,
      availableAt: new Date(
        transition.now.getTime() + retryDelayMs(state.attempts, transition.baseDelayMs),
      ),
      cancelRequested: false,
    };
  }

  if (state.status !== "dead_letter" && state.status !== "cancelled") {
    throw new JobTransitionError(`Cannot retry ${state.status} job`);
  }
  return {
    status: "queued",
    attempts: 0,
    availableAt: transition.now,
    cancelRequested: false,
  };
}
