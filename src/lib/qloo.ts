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

export interface QlooEntity {
  entity_id: string;
  name: string;
  type?: string;
  subtype?: string;
  properties?: Record<string, unknown> & {
    geocode?: { name?: string; country_code?: string; admin1_region?: string };
    address?: string;
  };
  location?: { lat?: number; lon?: number };
  query?: { affinity?: number; explainability?: unknown };
  tags?: { id: string; name: string; type?: string }[];
  popularity?: number;
}

export type InsightsParams = Record<string, string | number | boolean | undefined>;

export function isMockMode(): boolean {
  return !process.env.QLOO_API_KEY || process.env.QLOO_MOCK === "1";
}

async function qlooGet<T>(path: string, params: InsightsParams): Promise<T> {
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
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Qloo ${path} ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Look up entity IDs by name (e.g. an artist). */
export async function searchEntities(query: string, types: QlooEntityType, take = 5) {
  const data = await qlooGet<{ results?: QlooEntity[] }>("/search", { query, types, take });
  return data.results ?? [];
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
