import { runAgent } from "./agent";
import { defaultStartDate, geocodeCity, haversineKm, orderRoute, regionOf, schedule } from "./geo";
import { cityWhy, promoTemplate, recWhy, summaryTemplate } from "./reasons";
import { getDataSource } from "./sources";
import type { CityCandidate, Playbook, PlanRequest, Rec, Stop, TourPlan } from "./types";

const RANKING_SIZE = 15;

export async function buildTourPlan(req: PlanRequest): Promise<TourPlan> {
  const ds = getDataSource();
  const artist = await ds.resolveArtist(req.artist);
  const similar = await ds.similarArtists(artist.id);
  const size = Math.max(RANKING_SIZE, req.shows + 5);
  // Without a country filter, over-fetch so the home region still has enough markets.
  const global = await ds.rankCities(artist.id, req.countryCode, req.countryCode ? size : 50, similar);
  if (!global.length) throw new Error("No ranked markets found for this artist / country.");

  const homeGeo = geocodeCity(req.homeCity);
  const home = homeGeo ? { city: homeGeo.city, lat: homeGeo.lat, lon: homeGeo.lon } : undefined;

  // A road tour stays in one region: the home city's, else the top-ranked market's.
  const region = regionOf(homeGeo?.countryCode ?? req.countryCode ?? global[0].countryCode);
  const ranking = global
    .filter((c) => regionOf(c.countryCode) === region)
    .slice(0, size)
    .map((c, i) => ({ ...c, rank: i + 1 })); // rank within the touring region
  const routable = ranking;
  if (!routable.length) throw new Error("No ranked markets in the home city's region.");

  const shows = Math.min(req.shows, routable.length);
  const defaultRouteIds = routable.slice(0, shows).map((c) => c.id);
  const playbooks = new Map<string, Playbook>();
  const loadPlaybook = (c: CityCandidate) => ds.cityPlaybook(artist.id, c);
  await Promise.all(routable.slice(0, shows).map(async (c) => playbooks.set(c.id, await loadPlaybook(c))));

  const { output, info } = await runAgent({ artist, request: req, similar, ranking: routable, defaultRouteIds, playbooks, loadPlaybook, home });

  // Validate the agent's market choice: known ids only, no dupes, exactly `shows` stops.
  let chosen = defaultRouteIds;
  if (output?.route_city_ids?.length) {
    const known = new Set(routable.map((c) => c.id));
    const picked = [...new Set(output.route_city_ids.filter((id) => known.has(id)))];
    for (const id of defaultRouteIds) if (picked.length < shows && !picked.includes(id)) picked.push(id);
    chosen = picked.slice(0, shows);
  }
  const chosenCities = routable.filter((c) => chosen.includes(c.id));
  await Promise.all(chosenCities.filter((c) => !playbooks.has(c.id)).map(async (c) => playbooks.set(c.id, await loadPlaybook(c))));

  const ordered = orderRoute(chosenCities, home);
  const legs = ordered.map((c, i) => {
    const prev = i === 0 ? home : ordered[i - 1];
    return prev ? Math.round(haversineKm(prev, c)) : 0;
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
    const pb = playbooks.get(c.id)!;
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
