const FALLBACK_API_ORIGIN = "https://leadgen-api.bctrust.uk";

function proxyApiRequest(request, env) {
  const sourceUrl = new URL(request.url);
  const apiOrigin = env.API_ORIGIN || FALLBACK_API_ORIGIN;
  const targetUrl = new URL(sourceUrl.pathname + sourceUrl.search, apiOrigin);
  const headers = new Headers(request.headers);

  headers.set("host", targetUrl.host);
  headers.set("x-forwarded-host", sourceUrl.host);
  headers.set("x-forwarded-proto", sourceUrl.protocol.replace(":", ""));

  return fetch(
    new Request(targetUrl, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "manual",
    }),
  );
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return proxyApiRequest(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
