/** Deterministic, signal-citing explanations used when the LLM agent is off or fails. */
import type { CityCandidate, Rec } from "./types";

export function cityWhy(c: CityCandidate, artist: string, total: number): string {
  const drivers = c.drivers.slice(0, 2).map((d) => d.name).join(" and ");
  return `Ranked #${c.rank} of ${total} markets for ${artist}'s audience (affinity ${c.affinity.toFixed(2)}).` +
    (drivers ? ` The local taste overlap is driven by fans who also love ${drivers}.` : "");
}

export function recWhy(r: Rec, artist: string, city: string): string {
  const a = r.affinity.toFixed(2);
  switch (r.kind) {
    case "venue":
      return `#${r.rankInCity} venue match in ${city}: its crowd over-indexes on ${artist}'s fans (affinity ${a})${r.tags.length ? `; tagged ${r.tags.join(", ")}` : ""}.`;
    case "coBill":
      return `Local act with ${a} affinity among ${artist}'s fans in ${city} — a natural opener who brings an overlapping crowd.`;
    case "podcast":
      return `${artist}'s fans in ${city} over-index on this show (affinity ${a}) — pitch an interview or a host-read ad before the date.`;
    case "brand":
      return `Brand affinity ${a} with ${artist}'s ${city} audience — candidate for a merch collab or a sponsored after-show.`;
  }
}

export function promoTemplate(city: string, recs: { podcasts: Rec[]; brands: Rec[] }): string | undefined {
  const p = recs.podcasts[0]?.name;
  const b = recs.brands[0]?.name;
  if (!p && !b) return undefined;
  return [p && `Book a spot on ${p}`, b && `pitch a ${city} pop-up with ${b}`].filter(Boolean).join("; ") + ".";
}

export function summaryTemplate(artist: string, cities: string[], km: number): string {
  return `${cities.length}-date route for ${artist} through ${cities.slice(0, 3).join(", ")}${cities.length > 3 ? " and more" : ""}, ` +
    `chosen by audience-taste affinity and ordered to keep driving to about ${Math.round(km).toLocaleString("en-US")} km.`;
}
