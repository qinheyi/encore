/**
 * Data sources behind the agent's tools. Both return the same shapes so the
 * rest of the app does not care whether data is synthetic or live Qloo.
 */
import { insights, isMockMode, searchEntities, type QlooEntity } from "@/lib/qloo";
import { GAZETTEER } from "./geo";
import type { CityCandidate, Playbook, Rec, RecKind, Signal } from "./types";

export interface DataSource {
  name: "mock" | "qloo";
  note: string;
  resolveArtist(name: string): Promise<{ id: string; name: string }>;
  similarArtists(artistId: string): Promise<{ id: string; name: string; affinity: number }[]>;
  rankCities(artistId: string, countryCode: string | undefined, take: number, similar: { name: string; affinity: number }[]): Promise<CityCandidate[]>;
  cityPlaybook(artistId: string, city: CityCandidate): Promise<Omit<Playbook, never>>;
}

export function getDataSource(): DataSource {
  return isMockMode() ? mockSource : qlooSource;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ---------------------------------------------------------------------------
// Mock source: deterministic SYNTHETIC data seeded by the artist name.
// None of these names/scores come from Qloo. Used until the API key arrives.
// ---------------------------------------------------------------------------
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: string) {
  let s = hash(seed) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const pick = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)];
/** n distinct picks (sampling without replacement). */
const pickN = <T,>(r: () => number, arr: T[], n: number) => {
  const pool = [...arr];
  return Array.from({ length: Math.min(n, pool.length) }, () => pool.splice(Math.floor(r() * pool.length), 1)[0]);
};

const ADJ = ["Velvet", "Paper", "Neon", "Golden", "Hollow", "Silver", "Midnight", "Copper", "Static", "Lantern", "Wild", "Quiet", "Electric", "Amber", "Low"];
const NOUN = ["Owls", "Lanterns", "Harbor", "Echoes", "Satellites", "Pines", "Rivers", "Ghosts", "Comets", "Tides", "Foxes", "Mirrors", "Signals", "Orchards", "Kites"];
const VENUE_NOUN = ["Room", "Hall", "Ballroom", "Social Club", "Theatre", "Lounge", "Warehouse", "Tavern", "Music Hall", "Basement"];
const VENUE_TAGS = [["live music venue", "indie"], ["live music venue", "bar"], ["concert hall"], ["live music venue", "dance club"], ["bar", "late night"], ["listening room", "acoustic"]];
const PODCAST = ["Deep Cuts Radio", "The Setlist Show", "B-Sides & Banter", "Liner Notes", "Small Rooms Big Sounds", "The Opening Act", "Tape Hiss", "Encore Hour"];
const BRAND = ["Rivet Denim", "Northbound Coffee", "Analog Supply Co.", "Field Day Sneakers", "Static Records", "Ember Vintage", "Tinpan Guitars", "Low Tide Brewing"];

function mockRec(kind: RecKind, cityId: string, idx: number, name: string, affinity: number, tags: string[], extra: Signal[] = []): Rec {
  return {
    id: `${kind[0]}:${cityId.replace(/^c:/, "")}:${idx + 1}`,
    kind,
    name,
    affinity: r2(affinity),
    rankInCity: idx + 1,
    tags,
    signals: [{ label: "affinity", value: r2(affinity).toFixed(2) }, { label: "rank in city", value: `#${idx + 1}` }, ...extra],
    why: "",
    whySource: "template",
  };
}

const mockSource: DataSource = {
  name: "mock",
  note: "Synthetic placeholder data (no Qloo API key configured). Names and scores are invented for UI/agent development.",
  async resolveArtist(name) {
    return { id: `mock:artist:${slug(name)}`, name };
  },
  async similarArtists(artistId) {
    const r = rng(`${artistId}:similar`);
    const seen = new Set<string>();
    const out: { id: string; name: string; affinity: number }[] = [];
    while (out.length < 6) {
      const n = `The ${pick(r, ADJ)} ${pick(r, NOUN)}`;
      if (seen.has(n)) continue;
      seen.add(n);
      out.push({ id: `mock:artist:${slug(n)}`, name: n, affinity: r2(0.92 - out.length * 0.06 - r() * 0.03) });
    }
    return out;
  },
  async rankCities(artistId, countryCode, take, similar) {
    const r = rng(`${artistId}:cities:${countryCode ?? "ALL"}`);
    const pool = GAZETTEER.filter((c) => !countryCode || c.countryCode === countryCode);
    const scored = pool.map((c) => ({ c, s: 0.55 * c.scene + 0.45 * r() }));
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, take);
    const max = top[0]?.s || 1;
    return top.map(({ c, s }, i) => ({
      id: `c:${c.countryCode.toLowerCase()}:${slug(c.city)}`,
      city: c.city,
      countryCode: c.countryCode,
      lat: c.lat,
      lon: c.lon,
      affinity: r2(0.97 * (s / max)),
      rank: i + 1,
      drivers: similar.slice(0, 3).map((a, j) => ({ name: a.name, weight: r2(0.5 - j * 0.12 + r() * 0.05) })),
    }));
  },
  async cityPlaybook(artistId, city) {
    const r = rng(`${artistId}:${city.id}:playbook`);
    const base = city.affinity;
    const venues = Array.from({ length: 3 }, (_, i) =>
      mockRec("venue", city.id, i, `${pick(r, ADJ)} ${pick(r, VENUE_NOUN)}`, base * (0.95 - i * 0.07 - r() * 0.03), pick(r, VENUE_TAGS)),
    );
    const coBills = Array.from({ length: 2 }, (_, i) =>
      mockRec("coBill", city.id, i, `${pick(r, ADJ)} ${pick(r, NOUN)}`, base * (0.88 - i * 0.08 - r() * 0.04), ["local act", "based in " + city.city]),
    );
    const podcasts = pickN(r, PODCAST, 2).map((name, i) =>
      mockRec("podcast", city.id, i, name, base * (0.8 - i * 0.08 - r() * 0.04), ["music", "interviews"]),
    );
    const brands = pickN(r, BRAND, 2).map((name, i) =>
      mockRec("brand", city.id, i, name, base * (0.76 - i * 0.08 - r() * 0.04), ["lifestyle"]),
    );
    // de-duplicate names within a city
    const dedupe = (xs: Rec[]) => xs.filter((x, i) => xs.findIndex((y) => y.name === x.name) === i);
    return { venues: dedupe(venues), coBills: dedupe(coBills), podcasts: dedupe(podcasts), brands: dedupe(brands) };
  },
};

// ---------------------------------------------------------------------------
// Live Qloo source (activates when QLOO_API_KEY is set). Not yet exercised:
// the hackathon key has not arrived. Parameters follow docs.qloo.com.
// ---------------------------------------------------------------------------
const aff = (e: QlooEntity) => r2(e.query?.affinity ?? 0);

function qlooRec(kind: RecKind, cityId: string, e: QlooEntity, idx: number): Rec {
  const tags = (e.tags ?? []).slice(0, 3).map((t) => t.name);
  return {
    id: `${kind[0]}:${cityId.replace(/^c:/, "")}:${idx + 1}`,
    kind,
    name: e.name,
    affinity: aff(e),
    rankInCity: idx + 1,
    tags,
    address: typeof e.properties?.address === "string" ? e.properties.address : undefined,
    signals: [{ label: "affinity", value: aff(e).toFixed(2) }, { label: "rank in city", value: `#${idx + 1}` }],
    why: "",
    whySource: "template",
  };
}

const qlooSource: DataSource = {
  name: "qloo",
  note: "Live data from the Qloo Insights API (hackathon environment).",
  async resolveArtist(name) {
    const [hit] = await searchEntities(name, "urn:entity:artist", 1);
    if (!hit) throw new Error(`Artist not found in Qloo: ${name}`);
    return { id: hit.entity_id, name: hit.name };
  },
  async similarArtists(artistId) {
    const rows = await insights("urn:entity:artist", { "signal.interests.entities": artistId }, 8);
    return rows.filter((x) => x.entity_id !== artistId).slice(0, 6).map((x) => ({ id: x.entity_id, name: x.name, affinity: aff(x) }));
  },
  async rankCities(artistId, countryCode, take, similar) {
    const rows = await insights(
      "urn:entity:destination",
      { "signal.interests.entities": artistId, "filter.geocode.country_code": countryCode, "feature.explainability": true },
      take,
    );
    return rows
      .filter((x) => typeof x.location?.lat === "number" && typeof x.location?.lon === "number")
      .map((x, i) => ({
        id: `c:${(x.properties?.geocode?.country_code ?? "xx").toLowerCase()}:${slug(x.properties?.geocode?.name ?? x.name)}`,
        city: x.properties?.geocode?.name ?? x.name,
        countryCode: x.properties?.geocode?.country_code ?? countryCode ?? "",
        lat: x.location!.lat!,
        lon: x.location!.lon!,
        affinity: aff(x),
        rank: i + 1,
        // TODO: map query.explainability contributions here once the response shape is confirmed with a real key.
        drivers: similar.slice(0, 3).map((a) => ({ name: a.name, weight: a.affinity })),
      }));
  },
  async cityPlaybook(artistId, city) {
    // TODO(after key): add a live-music venue tag from /v2/tags as `filter.tags` for venues.
    const loc = city.city;
    const [venues, coBills, podcasts, brands] = await Promise.all([
      insights("urn:entity:place", { "signal.interests.entities": artistId, "filter.location.query": loc }, 3),
      insights("urn:entity:artist", { "signal.interests.entities": artistId, "signal.location.query": loc }, 3),
      insights("urn:entity:podcast", { "signal.interests.entities": artistId, "signal.location.query": loc }, 2),
      insights("urn:entity:brand", { "signal.interests.entities": artistId, "signal.location.query": loc }, 2),
    ]);
    return {
      venues: venues.map((e, i) => qlooRec("venue", city.id, e, i)),
      coBills: coBills.filter((e) => e.entity_id !== artistId).slice(0, 2).map((e, i) => qlooRec("coBill", city.id, e, i)),
      podcasts: podcasts.map((e, i) => qlooRec("podcast", city.id, e, i)),
      brands: brands.map((e, i) => qlooRec("brand", city.id, e, i)),
    };
  },
};
