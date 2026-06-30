import type { Pool } from "pg";

export const supportedJobs = [
  "prune_expired_sessions",
  "supersede_expired_eligibility",
  "enforce_retention",
] as const;

export type SupportedJob = (typeof supportedJobs)[number];

export function isSupportedJob(value: string): value is SupportedJob {
  return supportedJobs.includes(value as SupportedJob);
}

export function hourlyIdempotencyKey(jobName: SupportedJob, now: Date): string {
  return `${jobName}:${now.toISOString().slice(0, 13)}`;
}

export async function executeJob(pool: Pool, jobName: SupportedJob): Promise<number> {
  if (jobName === "prune_expired_sessions") {
    const result = await pool.query("delete from user_sessions where expires_at <= now()");
    return result.rowCount ?? 0;
  }
  if (jobName === "supersede_expired_eligibility") {
    const result = await pool.query(
    `update eligibility_decisions set superseded_at = now(), updated_at = now()
     where superseded_at is null and expires_at <= now()`,
    );
    return result.rowCount ?? 0;
  }
  const results = await Promise.all([
    pool.query(
      `update outreach_channel_decisions set superseded_at = now(), updated_at = now()
       where superseded_at is null and expires_at <= now()`,
    ),
    pool.query(
      `update postal_address_assessments set superseded_at = now(), updated_at = now()
       where superseded_at is null and expires_at <= now()`,
    ),
    pool.query(
      `update preference_service_checks set active = false, updated_at = now()
       where active = true and expires_at <= now()`,
    ),
    pool.query(
      `update suppression_entries set active = false, updated_at = now()
       where active = true and reason not like '%do_not_contact%' and updated_at <= now() - interval '7 years'`,
    ),
  ]);
  return results.reduce((total, result) => total + (result.rowCount ?? 0), 0);
}
