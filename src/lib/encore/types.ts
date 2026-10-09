import { z } from "zod";

export const PlanRequest = z.object({
  artist: z.string().trim().min(1).max(120),
  homeCity: z.string().trim().max(120).optional(),
  countryCode: z.string().trim().length(2).toUpperCase().optional(),
  shows: z.number().int().min(3).max(12).default(8),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(500).optional(), // free-text constraints for the agent
});
export type PlanRequest = z.infer<typeof PlanRequest>;

export interface Signal {
  label: string;
  value: string;
}

export type RecKind = "venue" | "coBill" | "podcast" | "brand";

/** One recommendation (venue / local co-bill / podcast / brand) with its evidence. */
export interface Rec {
  id: string;
  kind: RecKind;
  name: string;
  affinity: number; // 0..1, Qloo affinity (or synthetic in mock mode)
  rankInCity: number; // 1-based rank among same-kind results for this city
  tags: string[];
  address?: string;
  signals: Signal[];
  why: string;
  whySource: "agent" | "template";
}

export interface CityCandidate {
  id: string; // e.g. "c:us:austin"
  city: string;
  countryCode: string;
  lat: number;
  lon: number;
  affinity: number;
  rank: number; // 1-based among all ranked destinations
  drivers: { name: string; weight: number }[]; // which taste signals drive the affinity
}

export interface Playbook {
  venues: Rec[];
  coBills: Rec[];
  podcasts: Rec[];
  brands: Rec[];
}

export interface Stop extends CityCandidate, Playbook {
  order: number; // 1-based position in the route
  date?: string; // YYYY-MM-DD
  legKm: number; // distance from previous stop (or home)
  travelDayBefore: boolean;
  why: string;
  whySource: "agent" | "template";
  promoIdea?: string;
}

export interface AgentInfo {
  mode: "llm" | "template";
  provider?: string;
  model?: string;
  steps: number;
  toolCalls: string[];
  coverage?: { cities: string; items: string };
  /** Item reasons the model wrote for items it was never shown (discarded as ungrounded). */
  droppedItemReasons?: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  fallbackReason?: string;
  latencyMs?: number;
}

export interface TourPlan {
  artist: { id: string; name: string; image?: string };
  request: PlanRequest;
  similarArtists: { name: string; affinity: number }[];
  ranking: (CityCandidate & { inRoute: boolean })[];
  home?: { city: string; lat: number; lon: number };
  route: Stop[];
  totals: { km: number; days: number; shows: number; /** drive from the last show back home */ returnKm?: number };
  summary: string;
  summarySource: "agent" | "template";
  data: { source: "mock" | "qloo"; note: string };
  agent: AgentInfo;
  generatedAt: string;
}
