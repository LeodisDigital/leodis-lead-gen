import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { Environment } from "@lead-gen/shared";

import type { DatabasePool } from "./db.js";

const companiesHouseKey = "integration.companies_house_api_key";
const googlePlacesKey = "integration.google_places_api_key";
const productionExportsKey = "launch.production_exports_enabled";
const bctAdminUrlKey = "integration.bct_admin_url";
const bctApiTokenKey = "integration.bct_api_token";

type SettingRow = {
  key: string;
  value: string;
};

export type RuntimeSettings = {
  companiesHouseApiKey?: string;
  companiesHouseConfigured: boolean;
  googlePlacesApiKey?: string;
  googlePlacesConfigured: boolean;
  productionExportsEnabled: boolean;
  liveCollectionEnabled: boolean;
  liveCollectionAvailable: boolean;
  bctAdminUrl?: string;
  bctApiToken?: string;
  bctAdminConfigured: boolean;
};

function encryptionKey(environment: Environment): Buffer {
  return createHash("sha256").update(environment.SESSION_SECRET).digest();
}

export function encryptSetting(value: string, environment: Environment): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(environment), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSetting(value: string, environment: Environment): string {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part ?? "", "base64url"));
  if (!iv || !tag || !encrypted) throw new Error("Invalid encrypted setting");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(environment), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export async function getRuntimeSettings(
  pool: DatabasePool,
  environment: Environment,
): Promise<RuntimeSettings> {
  const result = await pool.query<SettingRow>(
    "select key, value from platform_settings where key = any($1::text[])",
    [[companiesHouseKey, googlePlacesKey, productionExportsKey, bctAdminUrlKey, bctApiTokenKey]],
  );
  const settings = new Map(result.rows.map((row) => [row.key, row.value]));
  const storedCompaniesHouseKey = settings.get(companiesHouseKey);
  let apiKey = environment.COMPANIES_HOUSE_API_KEY;
  if (storedCompaniesHouseKey) {
    try {
      apiKey = decryptSetting(storedCompaniesHouseKey, environment);
    } catch {
      apiKey = undefined;
    }
  }
  const storedGooglePlacesKey = settings.get(googlePlacesKey);
  let googleApiKey = environment.GOOGLE_PLACES_API_KEY;
  if (storedGooglePlacesKey) {
    try {
      googleApiKey = decryptSetting(storedGooglePlacesKey, environment);
    } catch {
      googleApiKey = undefined;
    }
  }
  const storedBctUrl = settings.get(bctAdminUrlKey);
  const storedBctToken = settings.get(bctApiTokenKey);
  let bctToken: string | undefined;
  if (storedBctToken) {
    try {
      bctToken = decryptSetting(storedBctToken, environment);
    } catch {
      bctToken = undefined;
    }
  }
  return {
    companiesHouseApiKey: apiKey,
    companiesHouseConfigured: Boolean(apiKey),
    googlePlacesApiKey: googleApiKey,
    googlePlacesConfigured: Boolean(googleApiKey),
    productionExportsEnabled:
      settings.get(productionExportsKey) === undefined
        ? environment.PRODUCTION_EXPORTS_ENABLED
        : settings.get(productionExportsKey) === "true",
    liveCollectionEnabled: environment.LIVE_COLLECTION_ENABLED || Boolean(googleApiKey),
    liveCollectionAvailable: Boolean(googleApiKey),
    bctAdminUrl: storedBctUrl || undefined,
    bctApiToken: bctToken,
    bctAdminConfigured: Boolean(storedBctUrl && bctToken),
  };
}

export async function setCompaniesHouseApiKey(
  pool: DatabasePool,
  environment: Environment,
  userId: string,
  apiKey: string,
): Promise<void> {
  if (!apiKey) {
    await pool.query("delete from platform_settings where key = $1", [companiesHouseKey]);
    return;
  }
  await upsertSetting(pool, companiesHouseKey, encryptSetting(apiKey, environment), true, userId);
}

export async function setGooglePlacesApiKey(
  pool: DatabasePool,
  environment: Environment,
  userId: string,
  apiKey: string,
): Promise<void> {
  if (!apiKey) {
    await pool.query("delete from platform_settings where key = $1", [googlePlacesKey]);
    return;
  }
  await upsertSetting(pool, googlePlacesKey, encryptSetting(apiKey, environment), true, userId);
}

export async function setProductionExportsEnabled(
  pool: DatabasePool,
  userId: string,
  enabled: boolean,
): Promise<void> {
  await upsertSetting(pool, productionExportsKey, String(enabled), false, userId);
}

export async function setBctAdminConfig(
  pool: DatabasePool,
  environment: Environment,
  userId: string,
  url: string,
  token: string,
): Promise<void> {
  if (!url && !token) {
    await pool.query("delete from platform_settings where key = any($1::text[])", [[bctAdminUrlKey, bctApiTokenKey]]);
    return;
  }
  if (url) {
    await upsertSetting(pool, bctAdminUrlKey, url, false, userId);
  }
  if (token) {
    await upsertSetting(pool, bctApiTokenKey, encryptSetting(token, environment), true, userId);
  }
}

const googlePlacesBudgetKey = "integration.google_places_monthly_budget_micros";
const DEFAULT_BUDGET_MICROS = 200_000_000; // $200

export async function getGooglePlacesBudgetMicros(pool: DatabasePool): Promise<number> {
  const result = await pool.query<SettingRow>(
    "select value from platform_settings where key = $1 limit 1",
    [googlePlacesBudgetKey],
  );
  const stored = result.rows[0]?.value;
  return stored ? Number(stored) : DEFAULT_BUDGET_MICROS;
}

export async function getCurrentMonthUsageMicros(pool: DatabasePool, provider: string): Promise<{ totalMicros: number; requestCount: number }> {
  const result = await pool.query<{ total: string; count: string }>(
    `select coalesce(sum(estimated_cost_micros), 0)::text as total,
            count(*)::text as count
     from api_usage_log
     where provider = $1
       and created_at >= date_trunc('month', now())`,
    [provider],
  );
  return {
    totalMicros: Number(result.rows[0]?.total ?? 0),
    requestCount: Number(result.rows[0]?.count ?? 0),
  };
}

export async function logApiUsage(
  pool: DatabasePool,
  provider: string,
  endpoint: string,
  costMicros: number,
  userId?: string,
): Promise<void> {
  await pool.query(
    `insert into api_usage_log (provider, endpoint, estimated_cost_micros, created_by)
     values ($1, $2, $3, $4)`,
    [provider, endpoint, costMicros, userId ?? null],
  );
}

async function upsertSetting(
  pool: DatabasePool,
  key: string,
  value: string,
  sensitive: boolean,
  userId: string,
): Promise<void> {
  await pool.query(
    `insert into platform_settings (key, value, sensitive, updated_by)
     values ($1, $2, $3, $4)
     on conflict (key) do update set
       value = excluded.value,
       sensitive = excluded.sensitive,
       updated_by = excluded.updated_by,
       updated_at = now()`,
    [key, value, sensitive, userId],
  );
}
