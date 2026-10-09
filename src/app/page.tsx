"use client";
import { useState } from "react";
import type { TourPlan } from "@/lib/encore/types";

export default function Home() {
  const [artist, setArtist] = useState("");
  const [countryCode, setCountryCode] = useState("US");
  const [shows, setShows] = useState(8);
  const [plan, setPlan] = useState<TourPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setPlan(null);
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artist, countryCode: countryCode || undefined, shows }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) setError(typeof data.error === "string" ? data.error : "Request failed");
    else setPlan(data);
  }

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Encore</h1>
        <p className="text-neutral-500">Taste-grounded tour routing for independent artists — powered by Qloo.</p>
      </header>

      <form onSubmit={run} className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col text-sm">Artist
          <input className="border rounded px-3 py-2 min-w-64" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="e.g. an indie band" required />
        </label>
        <label className="flex flex-col text-sm">Country
          <input className="border rounded px-3 py-2 w-20" value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} maxLength={2} />
        </label>
        <label className="flex flex-col text-sm">Shows
          <input type="number" min={3} max={15} className="border rounded px-3 py-2 w-20" value={shows} onChange={(e) => setShows(Number(e.target.value))} />
        </label>
        <button disabled={loading} className="bg-black text-white rounded px-4 py-2 disabled:opacity-50">{loading ? "Routing…" : "Plan my tour"}</button>
      </form>

      {error && <p className="text-red-600">{error}</p>}

      {plan && (
        <section className="space-y-4">
          {plan.mode === "mock" && <p className="text-amber-600 text-sm">Mock mode: synthetic placeholder data (no Qloo API key configured).</p>}
          <p className="text-sm">Fans of <b>{plan.artist.name}</b> also love: {plan.similarArtists.map((s) => s.name).join(", ")}</p>
          {/* TODO: map view of route */}
          <ol className="grid gap-4 md:grid-cols-2">
            {plan.cities.map((c, i) => (
              <li key={c.city} className="border rounded p-4 space-y-2">
                <div className="flex justify-between"><b>{i + 1}. {c.city}</b><span className="text-sm">affinity {c.affinity}</span></div>
                <div className="h-2 bg-neutral-200 rounded"><div className="h-2 bg-black rounded" style={{ width: `${Math.min(100, c.affinity * 100)}%` }} /></div>
                <p className="text-sm"><b>Venues:</b> {c.venues.map((v) => v.name).join(", ")}</p>
                <p className="text-sm"><b>Local co-bills:</b> {c.localCoBills.map((v) => v.name).join(", ")}</p>
                <p className="text-sm"><b>Fans also love:</b> {c.fanCrossTaste.map((v) => `${v.name} (${v.domain})`).join(", ")}</p>
                {c.why && <p className="text-xs text-neutral-500">{c.why}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
