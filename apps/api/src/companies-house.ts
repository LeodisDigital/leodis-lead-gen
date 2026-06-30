export type CompaniesHouseProfile = {
  companyName: string;
  companyNumber: string;
  companyStatus: string;
  companyType: string;
  sicCodes: string[];
  registeredAddress: Record<string, string>;
};

export type CompaniesHouseSearchResult = Pick<
  CompaniesHouseProfile,
  "companyName" | "companyNumber" | "companyStatus" | "companyType"
>;

const supportedCompanyTypes = new Set([
  "ltd",
  "plc",
  "llp",
  "private-limited-guarant-nsc",
  "private-limited-shares-section-30-exemption",
]);

export async function fetchCompaniesHouseProfile(
  companyNumber: string,
  apiKey?: string,
): Promise<CompaniesHouseProfile | null> {
  if (!apiKey) return null;
  const response = await fetch(
    `https://api.company-information.service.gov.uk/company/${encodeURIComponent(companyNumber)}`,
    {
      headers: {
        authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Companies House returned ${response.status}`);
  const body = (await response.json()) as Record<string, unknown>;
  return {
    companyName: String(body.company_name ?? companyNumber),
    companyNumber: String(body.company_number ?? companyNumber),
    companyStatus: String(body.company_status ?? "unknown"),
    companyType: String(body.type ?? "unknown"),
    sicCodes: Array.isArray(body.sic_codes) ? body.sic_codes.map(String) : [],
    registeredAddress:
      typeof body.registered_office_address === "object" &&
      body.registered_office_address !== null
        ? (body.registered_office_address as Record<string, string>)
        : {},
  };
}

export async function searchCompaniesHouseCompanies(
  query: string,
  apiKey?: string,
): Promise<CompaniesHouseSearchResult[]> {
  if (!apiKey) return [];
  const response = await fetch(
    `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(query)}&items_per_page=5`,
    {
      headers: {
        authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error(`Companies House returned ${response.status}`);
  const body = (await response.json()) as Record<string, unknown>;
  const items = Array.isArray(body.items) ? body.items : [];
  return items.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      companyName: String(row.title ?? ""),
      companyNumber: String(row.company_number ?? ""),
      companyStatus: String(row.company_status ?? "unknown"),
      companyType: String(row.company_type ?? "unknown"),
    };
  }).filter((item) => item.companyName && item.companyNumber);
}

export function isSupportedActiveCompany(profile: CompaniesHouseProfile): boolean {
  return profile.companyStatus === "active" && supportedCompanyTypes.has(profile.companyType);
}

export function isSupportedActiveCompanySearchResult(profile: CompaniesHouseSearchResult): boolean {
  return profile.companyStatus === "active" && supportedCompanyTypes.has(profile.companyType);
}
