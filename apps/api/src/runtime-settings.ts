import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { Environment } from "@lead-gen/shared";

import type { DatabasePool } from "./db.js";

const companiesHouseKey = "integration.companies_house_api_key";
const googlePlacesKey = "integration.google_places_api_key";
const productionExportsKey = "launch.production_exports_enabled";

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
};

function encryptionKey(environment: Environment): Buffer {
  return createHash("sha256").update(environment.SESSION_SECRET).digest();
}

function encrypt(value: string, environment: Environment): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(environment), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value: string, environment: Environment): string {
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
    [[companiesHouseKey, googlePlacesKey, productionExportsKey]],
  );
  const settings = new Map(result.rows.map((row) => [row.key, row.value]));
  const storedCompaniesHouseKey = settings.get(companiesHouseKey);
  let apiKey = environment.COMPANIES_HOUSE_API_KEY;
  if (storedCompaniesHouseKey) {
    try {
      apiKey = decrypt(storedCompaniesHouseKey, environment);
    } catch {
      apiKey = undefined;
    }
  }
  const storedGooglePlacesKey = settings.get(googlePlacesKey);
  let googleApiKey = environment.GOOGLE_PLACES_API_KEY;
  if (storedGooglePlacesKey) {
    try {
      googleApiKey = decrypt(storedGooglePlacesKey, environment);
    } catch {
      googleApiKey = undefined;
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
  await upsertSetting(pool, companiesHouseKey, encrypt(apiKey, environment), true, userId);
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
  await upsertSetting(pool, googlePlacesKey, encrypt(apiKey, environment), true, userId);
}

export async function setProductionExportsEnabled(
  pool: DatabasePool,
  userId: string,
  enabled: boolean,
): Promise<void> {
  await upsertSetting(pool, productionExportsKey, String(enabled), false, userId);
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
