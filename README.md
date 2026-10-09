# Encore — taste-grounded tour routing for independent artists

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

Enter an artist → Encore asks Qloo's taste graph **where the artist's audience over-indexes**, routes a road tour
through the best markets, and builds a playbook for every stop — **venues** whose crowd matches, **local co-bill acts**,
and the **podcasts and brands** those fans love for promotion. An LLM agent picks the final set of markets (respecting
the artist's notes) and writes a grounded reason for every stop and every recommendation.

> Status: works end-to-end on **mock data** (Qloo hackathon key pending). Live Qloo calls activate once `QLOO_API_KEY` is set.

## How it works
```
artist ─▶ Qloo /search ─▶ artist entity
        ├▶ /v2/insights filter.type=artist        → "fans also love" (taste drivers)
        ├▶ /v2/insights filter.type=destination   → ranked markets (affinity)
        └▶ per market: place / artist / podcast / brand insights (location-scoped)
                    │
                    ▼
     Agent (MiniMax-M3 or StepFun step-3.5-flash, OpenAI-compatible)
       - chooses N markets from the ranking (honours notes like "avoid big cities")
       - optional tools: get_city_playbook, estimate_route_km
       - writes a reason per city + per item, citing affinity/rank/drivers
                    │  (validated: unknown ids dropped, gaps filled by rule-based reasons)
                    ▼
     Code: nearest-neighbour + 2-opt routing from the home city, one show/day,
           travel day before legs > 700 km → map (OpenStreetMap/Leaflet) + Markdown export
```
If the LLM is disabled, out of quota, slow or returns bad JSON, Encore falls back to deterministic,
signal-citing reasons — the plan is always complete.

## Run locally
```bash
npm install
npm run dev            # http://localhost:3000 — mock data, rule-based reasons, no API calls
```
Enable the agent (costs credits, ~1 call per plan). Keys come from the environment — never commit them:
```bash
export MINIMAX_API_KEY=...
ENCORE_LLM=minimax npm run dev          # MiniMax-M3 via https://api.minimax.cn/v1
# or
export STEPFUN_API_KEY=...
ENCORE_LLM=stepfun npm run dev          # step-3.5-flash via https://api.stepfun.com/v1
```
Options (see `.env.example`): `ENCORE_AGENT_MAX_STEPS=3` lets the agent call tools before answering;
`MINIMAX_MODEL` / `MINIMAX_BASE_URL` / `MINIMAX_THINKING=adaptive`; `STEPFUN_MODEL` / `STEPFUN_BASE_URL`; `LLM_TIMEOUT_MS`.

Provider notes:
- **MiniMax**: no `response_format` JSON mode, so JSON is enforced by the prompt and a tolerant parser
  (strips `<think>…</think>`, code fences and prose, picks the first valid object). Requests set
  `reasoning_split: true`; in tool loops the assistant message is echoed back unmodified (incl. `reasoning_details`),
  as MiniMax requires. Errors reported via `base_resp.status_code` (e.g. 1008 insufficient balance) trigger the fallback.
- **StepFun**: uses `response_format: {"type":"json_object"}`.

API: `POST /api/plan` with `{"artist":"…","homeCity":"Chicago","countryCode":"US","shows":8,"startDate":"2026-11-06","notes":"…"}`.

## Qloo usage
- Base URL: `https://hackathon.api.qloo.com`, header `X-Api-Key`
- `/search` → resolve the artist entity
- `/v2/insights` with `filter.type` = artist / destination / place / podcast / brand, `signal.interests.entities`,
  `signal.location.query`, `filter.location.query`, `filter.geocode.country_code`
- Qloo responses are cached privately server-side only and are **not** stored in this repo.
- Without a key the app uses clearly-labelled **synthetic** placeholder data (`src/lib/encore/sources.ts`), not Qloo data.

## License
MIT
