# Encore — taste-grounded tour routing for independent artists

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

Enter an artist → Encore uses Qloo's taste graph to rank cities by fan affinity, then builds a per-city
playbook: venues with matching audience taste, local co-bill artists, and what those fans also love
(podcasts, brands) for promotion — and an LLM agent explains *why* each stop is on the route, citing Qloo signals.

> Status: skeleton (mock mode). Live Qloo calls activate once `QLOO_API_KEY` is set.

## Run locally
```bash
cp .env.example .env.local   # add QLOO_API_KEY (hackathon key) — never commit it
npm install
npm run dev
```
Without a key the app runs in **mock mode** with synthetic placeholder data (not Qloo data).

## Qloo usage
- Base URL: `https://hackathon.api.qloo.com`, header `X-Api-Key`
- `/search` → resolve artist entity
- `/v2/insights` with `filter.type` = artist / destination / place / podcast / brand and `signal.interests.entities`, `signal.location.query`, `filter.location.query`
- Qloo responses are cached privately server-side only and are **not** stored in this repo.

## License
MIT
