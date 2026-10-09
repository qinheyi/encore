/**
 * SYNTHETIC demo data used when QLOO_API_KEY is absent.
 * These values are invented placeholders (not Qloo responses) so the UI can be
 * built before the hackathon API key arrives. Never replace with real Qloo
 * responses in the public repo.
 */
import type { TourPlan } from "@/lib/encore/types";

export function mockPlan(artistName: string, shows = 8): TourPlan {
  const cities = [
    ["Austin", "US"], ["Chicago", "US"], ["Denver", "US"], ["Portland", "US"],
    ["Nashville", "US"], ["Minneapolis", "US"], ["Philadelphia", "US"], ["Atlanta", "US"],
    ["Seattle", "US"], ["Brooklyn", "US"],
  ].slice(0, shows);
  return {
    artist: { id: "mock:artist", name: artistName },
    similarArtists: [1, 2, 3, 4, 5].map((i) => ({ name: `Similar Artist ${i}`, affinity: 0.9 - i * 0.05 })),
    cities: cities.map(([city, cc], i) => ({
      city,
      countryCode: cc,
      affinity: Math.round((0.95 - i * 0.06) * 100) / 100,
      venues: [1, 2, 3].map((v) => ({ name: `${city} Venue ${v}`, affinity: 0.9 - v * 0.1 })),
      localCoBills: [1, 2].map((v) => ({ name: `${city} Local Act ${v}`, affinity: 0.8 - v * 0.1 })),
      fanCrossTaste: [
        { domain: "podcast", name: "Example Podcast", affinity: 0.7 },
        { domain: "brand", name: "Example Brand", affinity: 0.65 },
        { domain: "place", name: `${city} Example Bar`, affinity: 0.6 },
      ],
      why: "(mock) Placeholder rationale — the live agent cites Qloo affinity signals here.",
    })),
    mode: "mock",
    generatedAt: new Date().toISOString(),
  };
}
