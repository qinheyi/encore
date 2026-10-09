import { runAgent } from "./agent";
import { defaultStartDate, geocodeCity, haversineKm, orderRoute, regionOf, schedule } from "./geo";
import { cityWhy, promoTemplate, recWhy, summaryTemplate } from "./reasons";
import { getDataSource, mapPool } from "./sources";
import type { CityCandidate, Playbook, PlanRequest, Rec, Stop, TourPlan } from "./types";

const RANKING_SIZE = 15;
/** Cap parallel Qloo playbook fetches to avoid 429s. */
const PLAYBOOK_CONCURRENCY = 2;

/** Total wall-clock budget per plan; keep below the route's maxDuration (60s) with headroom. */
const PLAN_BUDGET_MS = Number(process.env.ENCORE_PLAN_BUDGET_MS) || 54_000;

export async function buildTourPlan(req: PlanRequest): Promise<TourPlan> {
  const startedAt = Date.now();
  const ds = getDataSource();
  const artist = await ds.resolveArtist(req.artist);
  const similar = await ds.similarArtists(artist.id);
  const size = Math.max(RANKING_SIZE, req.shows + 5);
  // Without a country filter, over-fetch so the home region still has enough markets.
  const global = await ds.rankCities(artist.id, req.countryCode, req.countryCode ? size : 50, similar);
  if (!global.length) {
    throw new Error(
      `No markets found for "${artist.name}"${req.countryCode ? ` in ${req.countryCode}` : ""}. Try another country or artist.`,
    );
  }

  const homeGeo = geocodeCity(req.homeCity);
  const home = homeGeo ? { city: homeGeo.city, lat: homeGeo.lat, lon: homeGeo.lon } : undefined;
  if (req.homeCity && !homeGeo) {
    // Soft warning only — we still plan, just without a geographic start.
  }

  // A road tour stays in one region: the home city's, else the top-ranked market's.
  const region = regionOf(homeGeo?.countryCode ?? req.countryCode ?? global[0].countryCode);
  const ranking = global
    .filter((c) => regionOf(c.countryCode) === region)
    .slice(0, size)
    .map((c, i) => ({ ...c, rank: i + 1 }));
  const routable = ranking;
  if (!routable.length) {
    throw new Error(`No ranked markets in the home city's region (${region}). Try a different home city or country.`);
  }

  const shows = Math.min(req.shows, routable.length);
  // Prefer including the home city when Qloo ranked it, so the tour starts where the artist lives.
  let defaultRouteIds = routable.slice(0, shows).map((c) => c.id);
  if (home) {
    const homeStop = routable.find((c) => c.city.toLowerCase() === home.city.toLowerCase());
    if (homeStop && !defaultRouteIds.includes(homeStop.id)) {
      defaultRouteIds = [homeStop.id, ...defaultRouteIds.filter((id) => id !== homeStop.id)].slice(0, shows);
    }
  }
  const playbooks = new Map<string, Playbook>();
  const loadPlaybook = async (c: CityCandidate) => {
    try {
      return await ds.cityPlaybook(artist.id, c);
    } catch (e) {
      // Partial failure: return empty playbook so the route still completes.
      console.warn(`playbook failed for ${c.city}:`, (e as Error).message);
      return { venues: [], coBills: [], podcasts: [], brands: [] };
    }
  };
  await mapPool(routable.slice(0, shows), PLAYBOOK_CONCURRENCY, async (c) => {
    playbooks.set(c.id, await loadPlaybook(c));
  });

  const { output, info } = await runAgent({ artist, request: req, similar, ranking: routable, defaultRouteIds, playbooks, loadPlaybook, home, deadline: startedAt + PLAN_BUDGET_MS });

  let chosen = defaultRouteIds;
  if (output?.route_city_ids?.length) {
    const known = new Set(routable.map((c) => c.id));
    const picked = [...new Set(output.route_city_ids.filter((id) => known.has(id)))];
    for (const id of defaultRouteIds) if (picked.length < shows && !picked.includes(id)) picked.push(id);
    chosen = picked.slice(0, shows);
  }
  const chosenCities = routable.filter((c) => chosen.includes(c.id));
  const missing = chosenCities.filter((c) => !playbooks.has(c.id));
  if (missing.length) {
    await mapPool(missing, PLAYBOOK_CONCURRENCY, async (c) => {
      playbooks.set(c.id, await loadPlaybook(c));
    });
  }

  const ordered = orderRoute(chosenCities, home);
  const legs = ordered.map((c, i) => {
    const prev = i === 0 ? home : ordered[i - 1];
    if (!prev) return 0;
    const km = Math.round(haversineKm(prev, c));
    // Same-city start (gazetteer vs Qloo coords) — treat as 0.
    return i === 0 && km < 25 ? 0 : km;
  });
  const dates = schedule(legs, req.startDate ?? defaultStartDate());

  let cityHits = 0, itemHits = 0, itemTotal = 0;
  const withWhy = (recs: Rec[], city: string): Rec[] =>
    recs.map((r) => {
      itemTotal++;
      const agentWhy = output?.items?.[r.id]?.trim();
      if (agentWhy) itemHits++;
      return { ...r, why: agentWhy || recWhy(r, artist.name, city), whySource: agentWhy ? "agent" : "template" };
    });

  const route: Stop[] = ordered.map((c, i) => {
    const pb = playbooks.get(c.id) ?? { venues: [], coBills: [], podcasts: [], brands: [] };
    const agentCity = output?.cities?.[c.id];
    const why = agentCity?.why?.trim();
    if (why) cityHits++;
    return {
      ...c,
      order: i + 1,
      date: dates[i].date,
      travelDayBefore: dates[i].travelDayBefore,
      legKm: legs[i],
      why: why || cityWhy(c, artist.name, ranking.length),
      whySource: why ? "agent" : "template",
      promoIdea: agentCity?.promo_idea?.trim() || promoTemplate(c.city, pb),
      venues: withWhy(pb.venues, c.city),
      coBills: withWhy(pb.coBills, c.city),
      podcasts: withWhy(pb.podcasts, c.city),
      brands: withWhy(pb.brands, c.city),
    };
  });

  const km = legs.reduce((a, b) => a + b, 0);
  const days = route.length + route.filter((s) => s.travelDayBefore).length;
  if (info.mode === "llm") info.coverage = { cities: `${cityHits}/${route.length}`, items: `${itemHits}/${itemTotal}` };
  const agentSummary = output?.summary?.trim();

  return {
    artist,
    request: { ...req, shows },
    similarArtists: similar.map(({ name, affinity }) => ({ name, affinity })),
    ranking: ranking.map((c) => ({ ...c, inRoute: chosen.includes(c.id) })),
    home,
    route,
    totals: { km, days, shows: route.length },
    summary: agentSummary || summaryTemplate(artist.name, route.map((s) => s.city), km),
    summarySource: agentSummary ? "agent" : "template",
    data: { source: ds.name, note: ds.note },
    agent: info,
    generatedAt: new Date().toISOString(),
  };
}
