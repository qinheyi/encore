"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { COUNTRIES } from "@/lib/encore/geo";
import { planToMarkdown } from "@/lib/encore/markdown";
import type { Rec, Stop, TourPlan } from "@/lib/encore/types";

const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full animate-pulse rounded-xl bg-stone-200" />,
});

const KIND_LABEL: Record<Rec["kind"], string> = {
  venue: "Venues",
  coBill: "Local co-bills",
  podcast: "Podcasts",
  brand: "Brands",
};

function Badge({ tone, children }: { tone: "amber" | "green" | "stone" | "rose"; children: React.ReactNode }) {
  const tones = {
    amber: "bg-amber-100 text-amber-900 ring-amber-300",
    green: "bg-emerald-100 text-emerald-900 ring-emerald-300",
    stone: "bg-stone-100 text-stone-700 ring-stone-300",
    rose: "bg-rose-100 text-rose-900 ring-rose-300",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${tones[tone]}`}>{children}</span>;
}

function AffinityBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-24 rounded-full bg-stone-200" title={`affinity ${value.toFixed(2)}`}>
      <div className="h-1.5 rounded-full bg-rose-500" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

function RecList({ title, recs }: { title: string; recs: Rec[] }) {
  if (!recs.length) return null;
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</h4>
      <ul className="space-y-2">
        {recs.map((r) => (
          <li key={r.id} className="text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.name}</span>
              <span className="font-mono text-xs text-stone-500">{r.affinity.toFixed(2)}</span>
              {r.tags.slice(0, 2).map((t) => (
                <span key={t} className="rounded bg-stone-100 px-1.5 text-[11px] text-stone-600">{t}</span>
              ))}
            </div>
            <p className="text-stone-600">
              <span className="mr-1 text-[10px] font-semibold uppercase text-stone-400">{r.whySource === "agent" ? "Agent" : "Rule"}</span>
              {r.why}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StopCard({ s }: { s: Stop }) {
  const osm = `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=12/${s.lat}/${s.lon}`;
  return (
    <article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">
          <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-sm text-white">{s.order}</span>
          {s.city}, {s.countryCode}
        </h3>
        <div className="flex items-center gap-3 text-sm text-stone-500">
          <span>{s.date}{s.travelDayBefore ? " · after travel day" : ""}</span>
          <span>{s.legKm} km leg</span>
          <span className="font-mono">affinity {s.affinity.toFixed(2)}</span>
          <a href={osm} target="_blank" rel="noreferrer" className="text-rose-700 underline">OpenStreetMap ↗</a>
        </div>
      </header>
      <p className="mb-2 text-sm">
        <span className="mr-1 text-[10px] font-semibold uppercase text-stone-400">{s.whySource === "agent" ? "Agent" : "Rule"}</span>
        {s.why}
      </p>
      {s.promoIdea && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><strong>Promo idea:</strong> {s.promoIdea}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <RecList title={KIND_LABEL.venue} recs={s.venues} />
        <RecList title={KIND_LABEL.coBill} recs={s.coBills} />
        <RecList title={KIND_LABEL.podcast} recs={s.podcasts} />
        <RecList title={KIND_LABEL.brand} recs={s.brands} />
      </div>
    </article>
  );
}

function download(plan: TourPlan) {
  const blob = new Blob([planToMarkdown(plan)], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `encore-${plan.artist.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [artist, setArtist] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [countryCode, setCountryCode] = useState("US");
  const [shows, setShows] = useState(8);
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<TourPlan | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artist,
          homeCity: homeCity || undefined,
          countryCode: countryCode || undefined,
          shows,
          startDate: startDate || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPlan(data as TourPlan);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const input = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none";

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">Encore</h1>
        <p className="mt-2 max-w-2xl text-stone-600">
          Taste-driven tour routing for independent artists. Encore reads the Qloo taste graph to find where your audience
          over-indexes, routes the tour, and lines up venues, local openers, podcasts and brand partners — explaining every pick.
        </p>
      </header>

      <form onSubmit={submit} className="mb-10 grid gap-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm md:grid-cols-6">
        <label className="md:col-span-2">
          <span className="mb-1 block text-xs font-medium text-stone-600">Artist</span>
          <input className={input} value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="e.g. Phoebe Bridgers" required />
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-xs font-medium text-stone-600">Home city (route start)</span>
          <input className={input} value={homeCity} onChange={(e) => setHomeCity(e.target.value)} placeholder="e.g. Chicago" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-stone-600">Country</span>
          <select className={input} value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
            <option value="">Any</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-stone-600">Shows</span>
          <input className={input} type="number" min={3} max={12} value={shows} onChange={(e) => setShows(Number(e.target.value))} />
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-xs font-medium text-stone-600">Start date</span>
          <input className={input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="md:col-span-3">
          <span className="mb-1 block text-xs font-medium text-stone-600">Notes for the agent (optional)</span>
          <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. skip the biggest markets, we have a van and no budget for flights" />
        </label>
        <div className="flex items-end">
          <button disabled={loading || !artist} className="w-full rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
            {loading ? "Planning…" : "Plan tour"}
          </button>
        </div>
      </form>

      {error && <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">Error: {error}</p>}

      {plan && (
        <section className="space-y-8">
          <div className="flex flex-wrap items-center gap-2">
            {plan.data.source === "mock" ? <Badge tone="amber">Data: MOCK placeholder</Badge> : <Badge tone="green">Data: Qloo live</Badge>}
            {plan.agent.mode === "llm" ? (
              <Badge tone="green">Agent: {plan.agent.provider} {plan.agent.model} · {plan.agent.steps} step(s){plan.agent.toolCalls.length ? ` · tools: ${plan.agent.toolCalls.join(", ")}` : ""}</Badge>
            ) : (
              <Badge tone="stone">Agent: rule-based fallback{plan.agent.fallbackReason ? ` (${plan.agent.fallbackReason})` : ""}</Badge>
            )}
            {plan.agent.coverage && <Badge tone="rose">Agent reasons: {plan.agent.coverage.cities} cities, {plan.agent.coverage.items} items{plan.agent.droppedItemReasons ? ` · ${plan.agent.droppedItemReasons} ungrounded dropped` : ""}</Badge>}
            <button onClick={() => download(plan)} className="ml-auto rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-50">
              Download plan (.md)
            </button>
          </div>
          {plan.data.source === "mock" && <p className="text-xs text-amber-800">{plan.data.note}</p>}

          <div>
            <h2 className="text-2xl font-semibold">{plan.artist.name}: {plan.totals.shows} shows · {plan.totals.days} days · ~{plan.totals.km.toLocaleString("en-US")} km</h2>
            <p className="mt-2 max-w-3xl text-stone-700">{plan.summary}</p>
            {plan.similarArtists.length > 0 && (
              <p className="mt-2 text-sm text-stone-500">Fans also love: {plan.similarArtists.map((a) => a.name).join(", ")}</p>
            )}
          </div>

          <RouteMap plan={plan} />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 font-semibold">Route & schedule</h3>
              <ol className="space-y-1 text-sm">
                {plan.home && <li className="text-stone-500">Start: {plan.home.city}</li>}
                {plan.route.map((s) => (
                  <li key={s.id} className="flex justify-between gap-4">
                    <span>{s.order}. {s.city}{s.travelDayBefore && <span className="ml-1 text-xs text-amber-700">(travel day before)</span>}</span>
                    <span className="font-mono text-stone-500">{s.date} · {s.legKm} km</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 font-semibold">Market ranking</h3>
              <table className="w-full text-sm">
                <tbody>
                  {plan.ranking.map((c) => (
                    <tr key={c.id} className={c.inRoute ? "font-medium" : "text-stone-500"}>
                      <td className="w-8 py-0.5">#{c.rank}</td>
                      <td>{c.city}, {c.countryCode}</td>
                      <td><AffinityBar value={c.affinity} /></td>
                      <td className="w-12 text-right font-mono">{c.affinity.toFixed(2)}</td>
                      <td className="w-16 text-right text-xs">{c.inRoute ? "routed" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            {plan.route.map((s) => <StopCard key={s.id} s={s} />)}
          </div>
        </section>
      )}

      <footer className="mt-16 text-xs text-stone-500">
        Taste data: Qloo Insights API (mock placeholders until the hackathon key is configured). Map © OpenStreetMap contributors.
      </footer>
    </main>
  );
}
