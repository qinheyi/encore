/**
 * Encore's agent layer.
 *
 * The agent receives the Qloo-derived evidence (ranked markets + per-city
 * playbooks) and decides which markets make the tour given the artist's notes,
 * then writes a grounded reason for every stop and recommendation.
 *
 * Provider: StepFun or MiniMax (see llm.ts), chosen with ENCORE_LLM.
 * - maxSteps = 1 (default): one structured call, no tools (cheapest).
 * - maxSteps > 1: the model may call tools (`get_city_playbook`,
 *   `estimate_route_km`) before answering; the last step never offers tools.
 *
 * Any failure (no key, HTTP error, bad JSON, timeout) returns `null` output and
 * the caller falls back to deterministic template reasons, so the app always
 * produces a complete plan.
 */
import { z } from "zod";
import { chatCompletion, extractJson, llmConfig, type ChatMessage, type ToolDef } from "./llm";
import { haversineKm, orderRoute } from "./geo";
import type { AgentInfo, CityCandidate, Playbook, PlanRequest } from "./types";

export interface AgentContext {
  artist: { id: string; name: string };
  request: PlanRequest;
  similar: { name: string; affinity: number }[];
  ranking: CityCandidate[];
  defaultRouteIds: string[];
  playbooks: Map<string, Playbook>;
  loadPlaybook: (city: CityCandidate) => Promise<Playbook>;
  home?: { lat: number; lon: number; city: string };
  /** Epoch ms by which the agent must finish (keeps the serverless function under its maxDuration). */
  deadline?: number;
}

const AgentOutput = z.object({
  route_city_ids: z.array(z.string()).optional(),
  summary: z.string().optional(),
  cities: z.record(z.string(), z.object({ why: z.string().optional(), promo_idea: z.string().optional() })).optional(),
  items: z.record(z.string(), z.string()).optional(),
});
export type AgentOutput = z.infer<typeof AgentOutput>;

export interface AgentResult {
  output: AgentOutput | null;
  info: AgentInfo;
}

const EMPTY_PLAYBOOK: Playbook = { venues: [], coBills: [], podcasts: [], brands: [] };

const compactPlaybook = (pb: Playbook) =>
  [...pb.venues, ...pb.coBills, ...pb.podcasts, ...pb.brands].map((r) => ({
    id: r.id, kind: r.kind, name: r.name, affinity: r.affinity, rank_in_city: r.rankInCity, tags: r.tags,
  }));

const SYSTEM_PROMPT = `You are Encore, a tour-routing agent for independent musicians.
You receive audience-taste evidence from the Qloo taste graph: ranked markets (cities) with affinity scores, and per-city candidate venues, local co-bill artists, podcasts and brands.
Rules:
- Ground every statement in the provided signals (affinity scores, ranks, taste drivers). Cite numbers.
- NEVER invent venues, artists, podcasts, brands or cities. Refer to items only by the exact ids you were given; never guess an id.
- Respect the artist's notes when choosing markets (e.g. "avoid big cities", "no more than 500 km a day").
- Do not attempt geography/ordering; code orders the route. Just choose the set of markets.
- Keep each reason under 35 words, concrete and useful to a booking agent. English only.
Return ONLY a JSON object (no markdown, no prose before or after) with this shape:
{
  "route_city_ids": ["<city id>", ...],            // exactly N ids chosen from ranked_markets
  "summary": "<2-3 sentence tour strategy>",
  "cities": { "<city id>": { "why": "<why this market>", "promo_idea": "<one promo idea using the listed podcasts/brands>" } },
  "items": { "<item id>": "<why this venue / co-bill / podcast / brand>" }
}
Write a "cities" entry for every chosen city and an "items" entry for every item listed under the chosen cities.`;

const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_city_playbook",
      description: "Load Qloo candidate venues, local co-bill artists, podcasts and brands for a ranked market that is not in the default playbooks.",
      parameters: { type: "object", properties: { city_id: { type: "string", description: "id from ranked_markets" } }, required: ["city_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "estimate_route_km",
      description: "Estimate total driving distance (km, great-circle) for a set of markets after Encore orders them.",
      parameters: { type: "object", properties: { city_ids: { type: "array", items: { type: "string" } } }, required: ["city_ids"] },
    },
  },
];

async function runTool(name: string, argsJson: string, ctx: AgentContext, seen: Set<string>): Promise<unknown> {
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(argsJson || "{}"); } catch { return { error: "invalid JSON arguments" }; }
  if (name === "get_city_playbook") {
    const city = ctx.ranking.find((c) => c.id === args.city_id);
    if (!city) return { error: `unknown city_id ${String(args.city_id)}` };
    let pb = ctx.playbooks.get(city.id);
    if (!pb) { pb = await ctx.loadPlaybook(city); ctx.playbooks.set(city.id, pb); }
    const items = compactPlaybook(pb);
    items.forEach((it) => seen.add(it.id));
    return { city_id: city.id, items };
  }
  if (name === "estimate_route_km") {
    const ids = Array.isArray(args.city_ids) ? (args.city_ids as string[]) : [];
    const stops = ctx.ranking.filter((c) => ids.includes(c.id));
    const ordered = orderRoute(stops, ctx.home);
    let km = 0;
    let prev: { lat: number; lon: number } | undefined = ctx.home;
    for (const s of ordered) { if (prev) km += haversineKm(prev, s); prev = s; }
    return { order: ordered.map((s) => s.city), total_km: Math.round(km) };
  }
  return { error: `unknown tool ${name}` };
}

export async function runAgent(ctx: AgentContext): Promise<AgentResult> {
  const cfg = llmConfig();
  const info: AgentInfo = { mode: "template", provider: cfg.provider, model: cfg.model, steps: 0, toolCalls: [] };
  if (!cfg.enabled) {
    info.fallbackReason = cfg.disabledReason;
    return { output: null, info };
  }

  const userPayload = {
    artist: ctx.artist.name,
    shows_requested: ctx.request.shows,
    artist_notes: ctx.request.notes || "(none)",
    home_city: ctx.home?.city ?? ctx.request.homeCity ?? "(unknown)",
    fans_also_love_artists: ctx.similar,
    ranked_markets: ctx.ranking.map((c) => ({
      id: c.id, city: c.city, country: c.countryCode, affinity: c.affinity, rank: c.rank,
      taste_drivers: c.drivers.map((d) => d.name),
    })),
    default_route_city_ids: ctx.defaultRouteIds,
    playbooks: Object.fromEntries(ctx.defaultRouteIds.map((id) => [id, compactPlaybook(ctx.playbooks.get(id) ?? EMPTY_PLAYBOOK)])),
    note: cfg.maxSteps > 1
      ? "Before choosing any market that is not in playbooks, you MUST call get_city_playbook for it, and you may call estimate_route_km to compare options. Only write item reasons for item ids you have actually seen."
      : "If you swap in a market that has no playbook, still write its city reason but do NOT write item reasons for it (code will). Only use item ids listed in playbooks.",
  };

  // Item ids the model has actually been shown; reasons for any other id are ungrounded.
  const seen = new Set<string>(ctx.defaultRouteIds.flatMap((id) => compactPlaybook(ctx.playbooks.get(id) ?? EMPTY_PLAYBOOK).map((it) => it.id)));

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(userPayload) },
  ];

  const t0 = Date.now();
  try {
    for (let step = 1; step <= cfg.maxSteps; step++) {
      const offerTools = step < cfg.maxSteps;
      const remaining = ctx.deadline ? ctx.deadline - Date.now() : undefined;
      if (remaining !== undefined && remaining < 5_000) throw new Error("time budget exhausted before LLM call");
      const res = await chatCompletion({ messages, tools: offerTools ? TOOLS : undefined, jsonMode: !offerTools, timeoutMs: remaining });
      info.steps = step;
      if (res.usage) {
        info.usage = {
          prompt_tokens: (info.usage?.prompt_tokens ?? 0) + (res.usage.prompt_tokens ?? 0),
          completion_tokens: (info.usage?.completion_tokens ?? 0) + (res.usage.completion_tokens ?? 0),
          total_tokens: (info.usage?.total_tokens ?? 0) + (res.usage.total_tokens ?? 0),
        };
      }
      const calls = res.message.tool_calls ?? [];
      if (offerTools && calls.length) {
        messages.push(res.message); // echo unmodified (MiniMax needs its reasoning fields back)
        for (const call of calls) {
          info.toolCalls.push(call.function.name);
          const out = await runTool(call.function.name, call.function.arguments, ctx, seen);
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out) });
        }
        continue;
      }
      if (res.finishReason === "length") throw new Error("model output truncated (finish_reason=length)");
      const parsed = AgentOutput.safeParse(extractJson(res.text));
      if (!parsed.success) throw new Error("model JSON did not match the expected shape");
      if (parsed.data.items) {
        const kept = Object.entries(parsed.data.items).filter(([id]) => seen.has(id));
        const dropped = Object.keys(parsed.data.items).length - kept.length;
        if (dropped) info.droppedItemReasons = dropped;
        parsed.data.items = Object.fromEntries(kept);
      }
      info.mode = "llm";
      info.latencyMs = Date.now() - t0;
      return { output: parsed.data, info };
    }
    throw new Error("agent exceeded max steps without a final answer");
  } catch (e) {
    info.mode = "template";
    info.fallbackReason = (e as Error).message.slice(0, 300);
    info.latencyMs = Date.now() - t0;
    return { output: null, info };
  }
}
