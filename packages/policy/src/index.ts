import { z } from "zod";
import {
  approvedSourceUses,
  outreachChannels,
  sourceClasses,
  sourceFields,
} from "@lead-gen/shared";

export const policyVersion = "2026-06-11.1";

export const defaultLaunchFlags = Object.freeze({
  liveCollectionEnabled: false,
  productionExportsEnabled: false,
  corporateEmailExportsEnabled: false,
  postalExportsEnabled: false,
});

export const charitySourceClasses = new Set([
  "companies-house",
  "charity-commission",
  "oscr",
  "ccni",
  "client-provided-prospect",
  "charity-website",
  "preference-service",
  "suppression-import",
]);

export const approvedEntityTypes = new Set([
  "uk_limited_company",
  "uk_plc",
  "uk_llp",
  "registered_charity",
  "charitable_company",
]);

export const approvedRoleMailboxLocalParts = new Set([
  "business",
  "commercial",
  "contact",
  "enquiries",
  "hello",
  "info",
  "office",
  "sales",
]);

export const sourcePolicySchema = z.object({
  id: z.string().uuid(),
  version: z.string().min(1),
  sourceClass: z.enum(sourceClasses),
  hostnamePattern: z.string().min(1).nullable(),
  owner: z.string().min(1).default("platform owner"),
  evidenceReference: z.string().min(1).nullable().default(null),
  enabled: z.boolean(),
  approvedUses: z.array(z.enum(approvedSourceUses)).min(1),
  approvedFields: z.array(z.enum(sourceFields)).min(1),
  approvedChannels: z.array(z.enum(outreachChannels)).default([]),
  retentionDays: z.number().int().positive().max(3650).default(365),
  attributionRequired: z.boolean().default(true),
  prohibitedReuse: z.array(z.string().min(1)).default([]),
  notes: z.string().max(2_000).nullable().default(null),
  reviewedAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
});

export type SourcePolicy = z.infer<typeof sourcePolicySchema>;

export function classifyMailboxLocalPart(localPart: string): "role" | "unknown" {
  return approvedRoleMailboxLocalParts.has(localPart.trim().toLowerCase())
    ? "role"
    : "unknown";
}
