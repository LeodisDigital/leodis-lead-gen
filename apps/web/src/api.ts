export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
    ...options,
  });
  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const body = (await response.text().catch(() => "")).trim().replace(/\s+/g, " ");
      throw new Error(body ? `Request failed with ${response.status}: ${body.slice(0, 140)}` : `Request failed with ${response.status}`);
    }
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed with ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const body = (await response.text().catch(() => "")).trim().replace(/\s+/g, " ");
    throw new Error(body ? `Expected JSON from ${path}, received ${contentType || "unknown content type"}: ${body.slice(0, 140)}` : `Expected JSON from ${path}, received ${contentType || "unknown content type"}`);
  }
  return response.json() as Promise<T>;
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}
