import type { SourcePolicy } from "@lead-gen/policy";
import type { ApprovedSourceUse, SourceField } from "@lead-gen/shared";

export const collectionDenialReasons = [
  "SOURCE_DISABLED",
  "SOURCE_POLICY_EXPIRED",
  "SOURCE_HOSTNAME_NOT_APPROVED",
  "SOURCE_PURPOSE_NOT_APPROVED",
  "SOURCE_FIELD_NOT_APPROVED",
  "CLIENT_SUSPENDED",
  "CAMPAIGN_SUSPENDED",
  "RATE_LIMIT_EXCEEDED",
  "VOLUME_LIMIT_EXCEEDED",
] as const;

export type CollectionDenialReason = (typeof collectionDenialReasons)[number];

export type CollectionAuthorizationInput = {
  policy: SourcePolicy;
  hostname: string;
  requestedFields: SourceField[];
  purpose: ApprovedSourceUse;
  now: Date;
  clientSuspended?: boolean;
  campaignSuspended?: boolean;
  requestsInWindow?: number;
  rateLimit?: number;
  recordsCollected?: number;
  volumeLimit?: number;
};

export type CollectionAuthorization =
  | { allowed: true; policyId: string; policyVersion: string }
  | { allowed: false; reasonCodes: CollectionDenialReason[] };

function hostnameMatches(hostname: string, pattern: string | null): boolean {
  if (!pattern) return true;
  const normalHostname = hostname.trim().toLowerCase();
  const normalPattern = pattern.trim().toLowerCase();
  if (normalPattern.startsWith("*.")) {
    const suffix = normalPattern.slice(1);
    return normalHostname.endsWith(suffix) && normalHostname !== suffix.slice(1);
  }
  return normalHostname === normalPattern;
}

export function authorizeCollection(input: CollectionAuthorizationInput): CollectionAuthorization {
  const reasons = new Set<CollectionDenialReason>();
  const approvedUses = new Set(input.policy.approvedUses);
  const approvedFields = new Set(input.policy.approvedFields);

  if (!input.policy.enabled) reasons.add("SOURCE_DISABLED");
  if (input.policy.expiresAt.getTime() <= input.now.getTime()) {
    reasons.add("SOURCE_POLICY_EXPIRED");
  }
  if (!hostnameMatches(input.hostname, input.policy.hostnamePattern)) {
    reasons.add("SOURCE_HOSTNAME_NOT_APPROVED");
  }
  if (!approvedUses.has(input.purpose)) reasons.add("SOURCE_PURPOSE_NOT_APPROVED");
  if (input.requestedFields.some((field) => !approvedFields.has(field))) {
    reasons.add("SOURCE_FIELD_NOT_APPROVED");
  }
  if (input.clientSuspended) reasons.add("CLIENT_SUSPENDED");
  if (input.campaignSuspended) reasons.add("CAMPAIGN_SUSPENDED");
  if (
    input.rateLimit !== undefined &&
    (input.requestsInWindow ?? 0) >= input.rateLimit
  ) {
    reasons.add("RATE_LIMIT_EXCEEDED");
  }
  if (
    input.volumeLimit !== undefined &&
    (input.recordsCollected ?? 0) >= input.volumeLimit
  ) {
    reasons.add("VOLUME_LIMIT_EXCEEDED");
  }

  if (reasons.size > 0) return { allowed: false, reasonCodes: [...reasons] };
  return {
    allowed: true,
    policyId: input.policy.id,
    policyVersion: input.policy.version,
  };
}
