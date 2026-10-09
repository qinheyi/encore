/**
 * Data sources behind the agent's tools. Both return the same shapes so the
 * rest of the app does not care whether data is synthetic or live Qloo.
 *
 * Live mode activates when QLOO_API_KEY is set and QLOO_MOCK is not "1".
 */
import {
  insights,
  isMockMode,
  mapPool,
  searchEntities,
  TAG_LIVE_MUSIC_VENUE,
  type QlooEntity,
} from "@/lib/qloo";
import { GAZETTEER } from "./geo";
import type { CityCandidate, Playbook, Rec, RecKind, Signal } from "./types";

export interface DataSource {
  name: "mock" | "qloo";
  note: string;
  resolveArtist(name: string): Promise<{ id: string; name: string }>;
  similarArtists(artistId: string): Promise<{ id: string; name: string; affinity: number }[]>;
  rankCities(artistId: string, countryCode: string | undefined, take: number, similar: { id?: string; name: string; affinity: number }[]): Promise<CityCandidate[]>;
  cityPlaybook(artistId: string, city: CityCandidate): Promise<Omit<Playbook, never>>;
}

export function getDataSource(): DataSource {
  return isMockMode() ? mockSource : qlooSource;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const normCity = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

// ---------------------------------------------------------------------------
// Mock source: deterministic SYNTHETIC data seeded by the artist name.
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
      mockRec("coBill", city.id, i, `${pick(r, ADJ)} ${pick(r, NOUN)}`, base * (0.88 - i * 0.08 - r() * 0.04), ["taste-aligned opener"]),
    );
    const podcasts = pickN(r, PODCAST, 2).map((name, i) =>
      mockRec("podcast", city.id, i, name, base * (0.8 - i * 0.08 - r() * 0.04), ["music", "interviews"]),
    );
    const brands = pickN(r, BRAND, 2).map((name, i) =>
      mockRec("brand", city.id, i, name, base * (0.76 - i * 0.08 - r() * 0.04), ["lifestyle"]),
    );
    const dedupe = (xs: Rec[]) => xs.filter((x, i) => xs.findIndex((y) => y.name === x.name) === i);
    return { venues: dedupe(venues), coBills: dedupe(coBills), podcasts: dedupe(podcasts), brands: dedupe(brands) };
  },
};

// ---------------------------------------------------------------------------
// Live Qloo source
// ---------------------------------------------------------------------------
const aff = (e: QlooEntity) => r2(e.query?.affinity ?? 0);
const pop = (e: QlooEntity) => e.popularity ?? 0;

function qlooRec(kind: RecKind, cityId: string, e: QlooEntity, idx: number): Rec {
  const tags = (e.tags ?? [])
    .map((t) => t.name)
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .slice(0, 3);
  const address = typeof e.properties?.address === "string" ? e.properties.address : undefined;
  return {
    id: `${kind[0]}:${cityId.replace(/^c:/, "")}:${idx + 1}`,
    kind,
    name: e.name,
    affinity: aff(e),
    rankInCity: idx + 1,
    tags,
    address,
    signals: [
      { label: "affinity", value: aff(e).toFixed(2) },
      { label: "rank in city", value: `#${idx + 1}` },
      ...(pop(e) ? [{ label: "popularity", value: pop(e).toFixed(2) }] : []),
    ],
    why: "",
    whySource: "template",
  };
}

/** Known touring markets get a soft boost so tiny high-affinity towns don't dominate. */
const GAZETTEER_KEYS = new Set(GAZETTEER.map((c) => `${c.countryCode}:${normCity(c.city)}`));
function isTouringMarket(city: string, countryCode: string) {
  return GAZETTEER_KEYS.has(`${countryCode}:${normCity(city)}`);
}

function driversFromExplain(
  e: QlooEntity,
  artistId: string,
  similar: { id?: string; name: string; affinity: number }[],
): { name: string; weight: number }[] {
  const contrib = e.query?.explainability?.["signal.interests.entities"] ?? [];
  const idToName = new Map<string, string>();
  for (const s of similar) if (s.id) idToName.set(s.id, s.name);
  const mapped = contrib
    .filter((c) => c.entity_id && c.entity_id !== artistId)
    .map((c) => ({ name: idToName.get(c.entity_id!) ?? "", weight: r2(c.score ?? 0) }))
    .filter((d) => d.name);
  if (mapped.length) return mapped.slice(0, 3);
  // Fallback when explainability only echoes the headliner (single-entity signal).
  return similar.slice(0, 3).map((a) => ({ name: a.name, weight: a.affinity }));
}

const qlooSource: DataSource = {
  name: "qloo",
  note: "Live data from the Qloo Insights API (hackathon environment).",
  async resolveArtist(name) {
    const hits = await searchEntities(name, "urn:entity:artist", 5);
    const hit = hits[0];
    if (!hit) throw new Error(`Artist not found in Qloo: ${name}`);
    return { id: hit.entity_id, name: hit.name };
  },
  async similarArtists(artistId) {
    const rows = await insights("urn:entity:artist", { "signal.interests.entities": artistId }, 10);
    return rows
      .filter((x) => x.entity_id !== artistId)
      .slice(0, 6)
      .map((x) => ({ id: x.entity_id, name: x.name, affinity: aff(x) }));
  },
  async rankCities(artistId, countryCode, take, similar) {
    // Multi-entity signal so explainability returns named taste drivers (not just the headliner).
    const signalIds = [artistId, ...similar.slice(0, 3).map((s) => s.id).filter(Boolean)].join(",");
    const rows = await insights(
      "urn:entity:destination",
      {
        "signal.interests.entities": signalIds,
        "filter.geocode.country_code": countryCode,
        "filter.popularity.min": 0.55,
        "feature.explainability": true,
      },
      Math.max(40, take * 3),
    );

    const scored = rows
      .filter((x) => typeof x.location?.lat === "number" && typeof x.location?.lon === "number")
      .filter((x) => {
        // Road tours: skip Alaska / Hawaii (and far-offshore US points).
        const admin = String(x.properties?.geocode?.admin1_region ?? "").toLowerCase();
        if (admin.includes("hawaii") || admin.includes("alaska") || admin === "hi" || admin === "ak") return false;
        const lon = x.location!.lon!;
        const lat = x.location!.lat!;
        if (lon < -130 && lat < 50) return false; // Hawaii belt
        if (lon < -130 && lat >= 50) return false; // Alaska
        return true;
      })
      .map((x) => {
        const city = x.properties?.geocode?.name ?? x.name;
        const cc = x.properties?.geocode?.country_code ?? countryCode ?? "";
        const a = x.query?.affinity ?? 0;
        const p = x.popularity ?? 0;
        // Blend affinity with popularity; soft-boost known touring markets.
        let score = a * (0.45 + 0.55 * p);
        if (isTouringMarket(city, cc)) score *= 1.18;
        return { x, city, cc, a, p, score };
      });

    // Deduplicate near-identical metro names (keep highest score).
    const byKey = new Map<string, (typeof scored)[0]>();
    for (const row of scored) {
      const key = `${row.cc}:${normCity(row.city)}`;
      const prev = byKey.get(key);
      if (!prev || row.score > prev.score) byKey.set(key, row);
    }
    const ranked = [...byKey.values()].sort((a, b) => b.score - a.score).slice(0, take);

    return ranked.map((row, i) => ({
      id: `c:${row.cc.toLowerCase()}:${slug(row.city)}`,
      city: row.city,
      countryCode: row.cc,
      lat: row.x.location!.lat!,
      lon: row.x.location!.lon!,
      affinity: r2(row.a),
      rank: i + 1,
      drivers: driversFromExplain(row.x, artistId, similar),
    }));
  },
  async cityPlaybook(artistId, city) {
    const loc = city.city;
    // Stagger slightly inside the pool to reduce burst 429s.
    const [venuesRaw, coBills, podcasts, brands] = await Promise.all([
      insights(
        "urn:entity:place",
        {
          "signal.interests.entities": artistId,
          "filter.location.query": loc,
          "filter.tags": TAG_LIVE_MUSIC_VENUE,
        },
        6,
      ),
      insights("urn:entity:artist", { "signal.interests.entities": artistId, "signal.location.query": loc }, 5),
      insights("urn:entity:podcast", { "signal.interests.entities": artistId, "signal.location.query": loc }, 3),
      insights("urn:entity:brand", { "signal.interests.entities": artistId, "signal.location.query": loc }, 3),
    ]);

    const musicHint = (e: QlooEntity) => {
      const names = (e.tags ?? []).map((t) => t.name.toLowerCase());
      const hits = names.filter((n) => /live music|music venue|concert|music hall|club|bar|theater|theatre|ballroom/.test(n)).length;
      return hits + (e.properties?.live_music ? 2 : 0);
    };
    const venues = venuesRaw
      .filter((e) => e.properties?.is_closed !== true)
      .sort((a, b) => musicHint(b) - musicHint(a) || aff(b) - aff(a))
      .slice(0, 3)
      .map((e, i) => qlooRec("venue", city.id, e, i));

    return {
      venues,
      // Location-scoped artist insights still return taste-aligned openers (not necessarily "local bands").
      coBills: coBills.filter((e) => e.entity_id !== artistId).slice(0, 2).map((e, i) => qlooRec("coBill", city.id, e, i)),
      podcasts: podcasts.slice(0, 2).map((e, i) => qlooRec("podcast", city.id, e, i)),
      brands: brands.slice(0, 2).map((e, i) => qlooRec("brand", city.id, e, i)),
    };
  },
};

export { mapPool };
