/**
 * Minimal Qloo Insights API client for the Qloo Agentic Hackathon.
 *
 * - Hackathon keys ONLY work against https://hackathon.api.qloo.com
 * - Auth header is `X-Api-Key` (not Bearer)
 * - /v2/insights is GET with query-string params
 * - Do NOT commit real Qloo responses to the public repo (Qloo rule);
 *   private server-side caching is allowed.
 */
export const QLOO_BASE_URL = "https://hackathon.api.qloo.com";

/** Confirmed via /v2/tags: genre tag for live-music venues. */
export const TAG_LIVE_MUSIC_VENUE = "urn:tag:genre:place:live_music_venue";

export type QlooEntityType =
  | "urn:entity:artist"
  | "urn:entity:book"
  | "urn:entity:brand"
  | "urn:entity:destination"
  | "urn:entity:movie"
  | "urn:entity:person"
  | "urn:entity:place"
  | "urn:entity:podcast"
  | "urn:entity:tv_show"
  | "urn:entity:video_game";

export interface ExplainContribution {
  entity_id?: string;
  tag_id?: string;
  score?: number;
}

export interface QlooEntity {
  entity_id: string;
  name: string;
  type?: string;
  subtype?: string;
  properties?: Record<string, unknown> & {
    geocode?: { name?: string; country_code?: string; admin1_region?: string };
    address?: string;
    is_closed?: boolean;
    live_music?: boolean;
  };
  location?: { lat?: number; lon?: number };
  query?: {
    affinity?: number;
    explainability?: {
      "signal.interests.entities"?: ExplainContribution[];
      [k: string]: unknown;
    };
  };
  tags?: { id: string; name: string; type?: string }[];
  popularity?: number;
}

export type InsightsParams = Record<string, string | number | boolean | undefined>;

/**
 * Mock when there is no key, or when QLOO_MOCK is explicitly "1".
 * Empty QLOO_MOCK with a present key → live.
 */
export function isMockMode(): boolean {
  const mock = (process.env.QLOO_MOCK || "").trim();
  return !process.env.QLOO_API_KEY || mock === "1" || mock.toLowerCase() === "true";
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function qlooGet<T>(path: string, params: InsightsParams, attempt = 0): Promise<T> {
  const key = process.env.QLOO_API_KEY;
  if (!key) throw new Error("QLOO_API_KEY is not set (use QLOO_MOCK=1 for mock mode)");
  const url = new URL(path, QLOO_BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { "X-Api-Key": key, accept: "application/json" },
    // Private server-side cache (allowed by Qloo rules); 6h.
    next: { revalidate: 60 * 60 * 6 },
  });
  if (res.status === 429 && attempt < 4) {
    const retryAfter = Number(res.headers.get("retry-after")) || 0;
    await sleep(Math.max(retryAfter * 1000, 800 * 2 ** attempt));
    return qlooGet(path, params, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Qloo ${path} ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Look up entity IDs by name (e.g. an artist). Prefers exact case-insensitive name match. */
export async function searchEntities(query: string, types: QlooEntityType, take = 5) {
  const data = await qlooGet<{ results?: QlooEntity[] }>("/search", { query, types, take });
  const rows = data.results ?? [];
  const q = query.trim().toLowerCase();
  const exact = rows.find((r) => r.name.trim().toLowerCase() === q);
  return exact ? [exact, ...rows.filter((r) => r !== exact)] : rows;
}

/** Core recommendation / affinity call. */
export async function insights(filterType: QlooEntityType, params: InsightsParams, take = 20) {
  const data = await qlooGet<{ results?: { entities?: QlooEntity[] } }>("/v2/insights", {
    "filter.type": filterType,
    take,
    ...params,
  });
  return data.results?.entities ?? [];
}

/** Tag lookup (used once at startup for venue filtering). */
export async function searchTags(query: string, take = 8) {
  const data = await qlooGet<{ results?: { id: string; name: string; type?: string }[] }>("/v2/tags", {
    "filter.query": query,
    take,
  });
  return data.results ?? [];
}

/** Run async tasks with a concurrency cap (avoids Qloo 429s when building many city playbooks). */
export async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
