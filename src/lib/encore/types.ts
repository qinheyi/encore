import { z } from "zod";

export const PlanRequest = z.object({
  artist: z.string().min(1).max(120),
  homeCity: z.string().max(120).optional(),
  countryCode: z.string().length(2).optional(), // restrict destinations, e.g. "US"
  shows: z.number().int().min(3).max(15).default(8),
});
export type PlanRequest = z.infer<typeof PlanRequest>;

export interface CityPick {
  city: string;
  countryCode?: string;
  affinity: number; // 0..1 from Qloo
  venues: { name: string; affinity: number; address?: string }[];
  localCoBills: { name: string; affinity: number }[];
  fanCrossTaste: { domain: string; name: string; affinity: number }[];
  why?: string; // filled by the LLM agent, must cite Qloo signals
}

export interface TourPlan {
  artist: { id: string; name: string };
  similarArtists: { name: string; affinity: number }[];
  cities: CityPick[];
  mode: "mock" | "live";
  generatedAt: string;
}
