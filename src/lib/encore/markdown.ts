import type { Rec, TourPlan } from "./types";

const recLine = (r: Rec) => `  - **${r.name}** (affinity ${r.affinity.toFixed(2)}) — ${r.why}`;

export function planToMarkdown(p: TourPlan): string {
  const L: string[] = [];
  L.push(`# Encore tour plan — ${p.artist.name}`, "");
  L.push(`_Data: ${p.data.source === "mock" ? "MOCK (synthetic placeholder)" : "Qloo Insights API"} · Reasons: ${p.agent.mode === "llm" ? `${p.agent.provider} ${p.agent.model}` : "template fallback"} · Generated ${p.generatedAt}_`, "");
  L.push(p.summary, "");
  L.push(`**${p.totals.shows} shows · ${p.totals.days} days · ~${p.totals.km.toLocaleString("en-US")} km**${p.home ? ` · starting from ${p.home.city}` : ""}`, "");
  L.push("## Route", "", "| # | Date | City | Leg km | Affinity |", "|---|---|---|---|---|");
  for (const s of p.route) L.push(`| ${s.order} | ${s.date ?? ""}${s.travelDayBefore ? " (after travel day)" : ""} | ${s.city}, ${s.countryCode} | ${s.legKm} | ${s.affinity.toFixed(2)} |`);
  L.push("");
  for (const s of p.route) {
    L.push(`## ${s.order}. ${s.city}, ${s.countryCode} — ${s.date ?? ""}`, "", s.why, "");
    if (s.promoIdea) L.push(`**Promo idea:** ${s.promoIdea}`, "");
    L.push(`[OpenStreetMap](https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=12/${s.lat}/${s.lon})`, "");
    L.push("- Venues", ...s.venues.map(recLine));
    L.push("- Local co-bills", ...s.coBills.map(recLine));
    L.push("- Podcasts", ...s.podcasts.map(recLine));
    L.push("- Brands", ...s.brands.map(recLine), "");
  }
  L.push("## Market ranking", "", "| Rank | City | Affinity | In route |", "|---|---|---|---|");
  for (const c of p.ranking) L.push(`| ${c.rank} | ${c.city}, ${c.countryCode} | ${c.affinity.toFixed(2)} | ${c.inRoute ? "yes" : ""} |`);
  return L.join("\n") + "\n";
}
