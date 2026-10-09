# Encore — an AI tour-planning agent for independent musicians

**Live demo:** _DEMO_URL_PLACEHOLDER_ · Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/) · MIT licensed

Type an artist's name. Encore asks the **Qloo Taste AI** graph *where that artist's audience over-indexes*, picks the
best markets, routes a road tour through them, and builds a playbook for every stop:

- **Live-music venues** whose crowd matches the artist's fans
- **Co-bill / opener fits**: taste-aligned artists who share the audience
- **Podcasts and brands** those fans love, for promotion and merch partners

An LLM agent picks the final set of markets (following notes like *"van tour, keep it East Coast"*) and writes a
grounded reason for every stop and recommendation, citing Qloo affinity scores and taste drivers. A map
(OpenStreetMap / Leaflet), a day-by-day schedule and a Markdown export are included.

## How it works
```
artist ─▶ Qloo /search                                  → artist entity
        ├▶ /v2/insights filter.type=artist               → "fans also love" (taste drivers)
        ├▶ /v2/insights filter.type=destination          → ranked markets
        │     signal = artist + top similar artists, feature.explainability → named drivers per city
        │     filter.popularity.min, blended with popularity so tiny towns don't dominate
        └▶ per market (location-scoped insights):
              place   + filter.tags=urn:tag:genre:place:live_music_venue → venues
              artist / podcast / brand                                     → openers, promo, partners
                    │
                    ▼
     Agent (MiniMax-M3 by default; StepFun also supported; OpenAI-compatible APIs)
       - chooses N markets from the ranking, honouring the artist's notes
       - writes a reason per city and per item, citing affinity / rank / drivers
       - output is validated: unknown or never-shown ids are dropped, gaps filled by rule-based reasons
                    │
                    ▼
     Code: nearest-neighbour + 2-opt routing from the home city, one show per day,
           travel day before legs > 700 km → map + schedule + Markdown export
```
**Always returns a complete plan.** If the LLM is disabled, out of quota, slow (the agent stops at a ~54 s budget so the
60 s function never times out) or returns bad JSON, Encore falls back to deterministic, signal-citing reasons.

## Run locally
```bash
npm install
cp .env.example .env.local     # fill in keys; never commit them
npm run dev                    # http://localhost:3000
```
With no `QLOO_API_KEY`, the app runs on clearly-labelled **synthetic mock data** (badge: "Data: MOCK placeholder").

### Environment variables
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `QLOO_API_KEY` | for live data | — | Qloo hackathon API key (`X-Api-Key`) |
| `QLOO_MOCK` | no | empty | `1` forces mock data even with a key |
| `ENCORE_LLM` | no | empty (off) | `minimax` or `stepfun` enables the agent |
| `MINIMAX_API_KEY` | if `ENCORE_LLM=minimax` | — | MiniMax API key |
| `MINIMAX_BASE_URL` | no | `https://api.minimax.cn/v1` | MiniMax OpenAI-compatible endpoint |
| `MINIMAX_MODEL` | no | `MiniMax-M3` | Model name (M3 runs with thinking disabled for speed) |
| `MINIMAX_THINKING` | no | empty | `adaptive` re-enables M3 thinking |
| `STEPFUN_API_KEY` / `STEPFUN_BASE_URL` / `STEPFUN_MODEL` | if `ENCORE_LLM=stepfun` | `https://api.stepfun.com/v1`, `step-3.5-flash` | StepFun alternative |
| `ENCORE_AGENT_MAX_STEPS` | no | `1` | `1` = one structured call; `2–4` = allow tool calls (`get_city_playbook`, `estimate_route_km`) |
| `ENCORE_PLAN_BUDGET_MS` | no | `54000` | Per-plan time budget; past it the agent falls back to templates |
| `LLM_TIMEOUT_MS` | no | `110000` | Upper bound for one LLM request |

### API
`POST /api/plan`
```json
{"artist":"Phoebe Bridgers","homeCity":"Chicago","countryCode":"US","shows":6,"startDate":"2026-11-06","notes":"Van tour; prefer mid-size rooms."}
```
Returns ranked markets, the ordered route with dates and leg distances, per-stop venues / openers / podcasts / brands
with reasons, and metadata on the data source and agent (model, latency, reason coverage, fallback reason).

## Qloo APIs used
- Base URL `https://hackathon.api.qloo.com`, header `X-Api-Key`
- `GET /search?types=urn:entity:artist` to resolve the artist entity
- `GET /v2/insights` with:
  - `filter.type=urn:entity:artist` + `signal.interests.entities` for similar artists (taste drivers)
  - `filter.type=urn:entity:destination` + `filter.geocode.country_code`, `filter.popularity.min`, `feature.explainability` for market ranking with per-driver contributions
  - `filter.type=urn:entity:place` + `filter.location.query` + `filter.tags=urn:tag:genre:place:live_music_venue` for venues
  - `filter.type=urn:entity:artist | podcast | brand` + `signal.location.query` for openers, podcasts and brands
- `GET /v2/tags` was used during development to find the live-music venue tag
- Qloo responses are cached privately server-side only (Next.js fetch cache) and are **not** stored in this repository.

## Tech
Next.js 15 (App Router) · TypeScript · Tailwind · zod · Leaflet / react-leaflet with OpenStreetMap tiles · deployed on Vercel.

## License
[MIT](./LICENSE)
