/** Cost per Text Search request in microdollars ($0.032 = 32000 micros). */
export const PLACES_TEXT_SEARCH_COST_MICROS = 32_000;

export type GooglePlaceCandidate = {
  placeId: string;
  name: string;
  websiteUri?: string;
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  types: string[];
  sourceUrl: string;
};

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  websiteUri?: string;
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  types?: string[];
};

export async function searchGooglePlacesText(
  input: {
    query: string;
    location?: string;
    maxResults: number;
  },
  apiKey?: string,
): Promise<GooglePlaceCandidate[]> {
  if (!apiKey) return [];
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
      "x-goog-fieldmask": [
        "places.id",
        "places.displayName",
        "places.websiteUri",
        "places.formattedAddress",
        "places.nationalPhoneNumber",
        "places.types",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: input.location ? `${input.query} in ${input.location}` : input.query,
      maxResultCount: input.maxResults,
      regionCode: "GB",
      languageCode: "en",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Google Places returned ${response.status}`);
  const body = (await response.json()) as { places?: GooglePlace[] };
  return (body.places ?? []).map((place) => {
    const name = place.displayName?.text?.trim() || place.id || "Unnamed place";
    const placeId = place.id || name;
    return {
      placeId,
      name,
      websiteUri: place.websiteUri,
      formattedAddress: place.formattedAddress,
      nationalPhoneNumber: place.nationalPhoneNumber,
      types: place.types ?? [],
      sourceUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`,
    };
  }).filter((place) => place.name);
}
