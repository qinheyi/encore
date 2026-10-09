/**
 * Deterministic Qloo data pipeline. Each function is also exposed to the LLM
 * agent as a tool (see TODO in src/app/api/plan/route.ts), so the agent can
 * decide which extra lookups to run, while the core ranking stays grounded in
 * Qloo affinity scores rather than LLM guesses.
 */
import { insights, searchEntities, type QlooEntity } from "@/lib/qloo";
import type { CityPick, PlanRequest, TourPlan } from "./types";

const aff = (e: QlooEntity) => Math.round((e.query?.affinity ?? 0) * 100) / 100;

export async function resolveArtist(name: string) {
  const [hit] = await searchEntities(name, "urn:entity:artist", 1);
  if (!hit) throw new Error(`Artist not found in Qloo: ${name}`);
  return { id: hit.entity_id, name: hit.name };
}

export async function similarArtists(artistId: string, take = 8) {
  const rows = await insights("urn:entity:artist", { "signal.interests.entities": artistId }, take);
  return rows.filter((r) => r.entity_id !== artistId).map((r) => ({ name: r.name, affinity: aff(r) }));
}

export async function cityAffinity(artistId: string, countryCode?: string, take = 25) {
  const rows = await insights(
    "urn:entity:destination",
    { "signal.interests.entities": artistId, "filter.geocode.country_code": countryCode },
    take,
  );
  return rows.map((r) => ({ city: r.properties?.geocode?.name ?? r.name, countryCode: r.properties?.geocode?.country_code, affinity: aff(r) }));
}

export async function cityPlaybook(artistId: string, city: string): Promise<Omit<CityPick, "city" | "affinity" | "countryCode">> {
  // TODO(after API key): look up a "music venue"/"live music" tag id via /v2/tags and add `filter.tags`.
  const [venues, coBills, podcasts, brands] = await Promise.all([
    insights("urn:entity:place", { "signal.interests.entities": artistId, "filter.location.query": city }, 5),
    insights("urn:entity:artist", { "signal.interests.entities": artistId, "signal.location.query": city }, 5),
    insights("urn:entity:podcast", { "signal.interests.entities": artistId, "signal.location.query": city }, 3),
    insights("urn:entity:brand", { "signal.interests.entities": artistId, "signal.location.query": city }, 3),
  ]);
  return {
    venues: venues.map((v) => ({ name: v.name, affinity: aff(v), address: v.properties?.address as string | undefined })),
    localCoBills: coBills.filter((a) => a.entity_id !== artistId).map((a) => ({ name: a.name, affinity: aff(a) })),
    fanCrossTaste: [
      ...podcasts.map((p) => ({ domain: "podcast", name: p.name, affinity: aff(p) })),
      ...brands.map((b) => ({ domain: "brand", name: b.name, affinity: aff(b) })),
    ],
  };
}

export async function buildPlan(req: PlanRequest): Promise<TourPlan> {
  const artist = await resolveArtist(req.artist);
  const [similar, cities] = await Promise.all([
    similarArtists(artist.id),
    cityAffinity(artist.id, req.countryCode),
  ]);
  const top = cities.slice(0, req.shows);
  const picks: CityPick[] = [];
  for (const c of top) {
    // sequential to stay well inside hackathon rate limits
    picks.push({ ...c, ...(await cityPlaybook(artist.id, c.city)) });
  }
  // TODO: route ordering (nearest-neighbour from homeCity) + LLM "why" per city citing these signals.
  return { artist, similarArtists: similar, cities: picks, mode: "live", generatedAt: new Date().toISOString() };
}
