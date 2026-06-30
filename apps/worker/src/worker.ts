import { randomUUID } from "node:crypto";

import { transitionJob, type JobStatus } from "@lead-gen/jobs";
import { workerEnvironmentSchema } from "@lead-gen/shared";
import pg from "pg";

import {
  executeJob,
  hourlyIdempotencyKey,
  isSupportedJob,
  supportedJobs,
} from "./jobs.js";

const { Pool } = pg;
const environment = workerEnvironmentSchema.parse(process.env);
const pool = new Pool({ connectionString: environment.DATABASE_URL, max: 4 });
const workerId = `worker-${randomUUID()}`;
let stopping = false;

type ClaimedJob = {
  id: string;
  job_name: string;
  attempts: number;
  max_attempts: number;
  cancel_requested_at: Date | null;
};

async function scheduleMaintenance(now = new Date()): Promise<void> {
  for (const jobName of supportedJobs) {
    await pool.query(
      `insert into job_runs
        (queue_name, job_name, idempotency_key, status, trace_id, payload, max_attempts)
       values ('maintenance', $1, $2, 'queued', $3, '{}'::jsonb, 3)
       on conflict (queue_name, idempotency_key) do nothing`,
      [jobName, hourlyIdempotencyKey(jobName, now), randomUUID()],
    );
  }
}

async function recoverExpiredLeases(): Promise<void> {
  await pool.query(
    `update job_runs set
       status = case when attempts >= max_attempts then 'dead_letter' else 'retry_scheduled' end,
       available_at = now(),
       last_error = 'Worker lease expired before completion',
       worker_id = null,
       lease_expires_at = null,
       updated_at = now()
     where status = 'running' and lease_expires_at <= now()`,
  );
}

async function claimJob(): Promise<ClaimedJob | null> {
  const result = await pool.query<ClaimedJob>(
    `with candidate as (
       select id from job_runs
       where queue_name = 'maintenance'
         and job_name = any($1::text[])
         and status in ('queued', 'retry_scheduled')
         and available_at <= now()
         and cancel_requested_at is null
       order by available_at, created_at
       for update skip locked
       limit 1
     )
     update job_runs j set
       status = 'running',
       attempts = j.attempts + 1,
       worker_id = $2,
       lease_expires_at = now() + ($3 * interval '1 second'),
       started_at = now(),
       updated_at = now()
     from candidate
     where j.id = candidate.id
     returning j.id, j.job_name, j.attempts, j.max_attempts, j.cancel_requested_at`,
    [supportedJobs, workerId, environment.WORKER_LEASE_SECONDS],
  );
  return result.rows[0] ?? null;
}

async function finishJob(job: ClaimedJob, error?: unknown): Promise<void> {
  const latest = await pool.query<{ cancel_requested_at: Date | null }>(
    "select cancel_requested_at from job_runs where id = $1 and worker_id = $2",
    [job.id, workerId],
  );
  if (!latest.rows[0]) return;
  const state = {
    status: "running" as JobStatus,
    attempts: job.attempts,
    maxAttempts: job.max_attempts,
    cancelRequested: Boolean(latest.rows[0].cancel_requested_at),
  };
  const next = error
    ? transitionJob(state, { action: "fail", error: String(error), now: new Date() })
    : transitionJob(state, { action: "complete" });
  await pool.query(
    `update job_runs set status = $1, last_error = $2, available_at = coalesce($3, available_at),
       completed_at = case when $1 in ('completed','cancelled','dead_letter') then now() else null end,
       worker_id = null, lease_expires_at = null, updated_at = now()
     where id = $4 and worker_id = $5`,
    [next.status, next.lastError ?? null, next.availableAt ?? null, job.id, workerId],
  );
}

async function tick(): Promise<void> {
  await recoverExpiredLeases();
  await scheduleMaintenance();
  const job = await claimJob();
  if (!job || !isSupportedJob(job.job_name)) return;
  try {
    const affected = await executeJob(pool, job.job_name);
    console.log(JSON.stringify({ event: "job.completed", jobId: job.id, jobName: job.job_name, affected }));
    await finishJob(job);
  } catch (error) {
    console.error(JSON.stringify({ event: "job.failed", jobId: job.id, jobName: job.job_name, error: String(error) }));
    await finishJob(job, error);
  }
}

async function run(): Promise<void> {
  console.log(JSON.stringify({ event: "worker.started", workerId, supportedJobs }));
  while (!stopping) {
    try {
      await tick();
    } catch (error) {
      console.error(JSON.stringify({ event: "worker.tick_failed", error: String(error) }));
    }
    await new Promise((resolve) => setTimeout(resolve, environment.WORKER_POLL_INTERVAL_MS));
  }
  await pool.end();
}

const shutdown = () => {
  stopping = true;
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await run();
