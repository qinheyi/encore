"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { COUNTRIES } from "@/lib/encore/geo";
import { planToMarkdown } from "@/lib/encore/markdown";
import type { Rec, Stop, TourPlan } from "@/lib/encore/types";

const RouteMap = dynamic(() => import("@/components/RouteMap"), {
  ssr: false,
  loading: () => <div className="h-[360px] w-full animate-pulse rounded-2xl bg-white/5 md:h-[560px]" />,
});

const EXAMPLES = [
  { artist: "Phoebe Bridgers", homeCity: "Chicago", countryCode: "US", shows: 6 },
  { artist: "Japanese Breakfast", homeCity: "Philadelphia", countryCode: "US", shows: 6 },
  { artist: "Fontaines D.C.", homeCity: "London", countryCode: "GB", shows: 5 },
];

const STEPS = [
  "Resolving the artist in Qloo’s entity graph",
  "Finding who fans also love",
  "Analysing fan taste — ranking cities where the audience over-indexes",
  "Pulling live-music venues, openers, podcasts & brands per city",
  "Routing the van — nearest-neighbour + 2-opt loop from home",
  "Agent writing a reason for every pick",
];

const REGION_NAME: Record<string, string> = { US: "North America", CA: "North America", GB: "UK & Europe", DE: "Europe", AU: "Australia", JP: "Japan" };

const KIND: { key: keyof Pick<Stop, "venues" | "coBills" | "podcasts" | "brands">; label: string; icon: string }[] = [
  { key: "venues", label: "Venues", icon: "🎤" },
  { key: "coBills", label: "Openers / co-bills", icon: "🎸" },
  { key: "podcasts", label: "Podcasts", icon: "🎧" },
  { key: "brands", label: "Brand partners", icon: "🏷️" },
];

function fmtDate(iso?: string) {
  if (!iso) return { dow: "", md: "TBA" };
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    dow: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).toUpperCase(),
    md: d.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" }).toUpperCase(),
  };
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function AffinityBar({ value, label = true }: { value: number; label?: boolean }) {
  const pct = Math.max(4, Math.min(100, Math.round(value * 100)));
  return (
    <div className="flex items-center gap-2" aria-label={`affinity ${value.toFixed(2)}`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-gradient-to-r from-neon-pink to-neon-orange" style={{ width: `${pct}%` }} />
      </div>
      {label && <span className="font-mono text-xs tabular-nums text-zinc-300">{value.toFixed(2)}</span>}
    </div>
  );
}

function SourceTag({ src }: { src: "agent" | "template" }) {
  return (
    <span className={`mr-1.5 rounded px-1 py-px text-[10px] font-bold uppercase tracking-wider ${src === "agent" ? "bg-neon-cyan/15 text-neon-cyan" : "bg-white/10 text-zinc-300"}`}>
      {src === "agent" ? "Agent" : "Rule"}
    </span>
  );
}

function RecList({ label, icon, recs }: { label: string; icon: string; recs: Rec[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-300">
        <span aria-hidden>{icon}</span>{label}
      </h4>
      {recs.length === 0 ? (
        <p className="text-xs text-zinc-400">No picks returned for this city.</p>
      ) : (
        <ul className="space-y-2">
          {recs.slice(0, 4).map((r) => (
            <li key={r.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-neon-pink">
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-100">{r.name}</span>
                  <span className="w-16 shrink-0"><AffinityBar value={r.affinity} label={false} /></span>
                  <span className="font-mono text-[11px] tabular-nums text-zinc-400">{r.affinity.toFixed(2)}</span>
                  <span aria-hidden className="text-xs text-zinc-500 transition group-open:rotate-90">›</span>
                </summary>
                <div className="mt-1.5 space-y-1 pl-0.5 text-xs leading-relaxed text-zinc-300">
                  {r.address && <p className="text-zinc-400">{r.address}</p>}
                  {r.tags.length > 0 && (
                    <p className="flex flex-wrap gap-1">
                      {r.tags.slice(0, 3).map((t) => <span key={t} className="rounded bg-white/10 px-1.5 py-px text-[10px] text-zinc-300">{t}</span>)}
                    </p>
                  )}
                  <p><SourceTag src={r.whySource} />{r.why}</p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StopCard({ s }: { s: Stop }) {
  const d = fmtDate(s.date);
  const empty = s.venues.length + s.coBills.length + s.podcasts.length + s.brands.length === 0;
  return (
    <article id={`stop-${s.order}`} className="scroll-mt-6 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02]">
      <header className="flex flex-wrap items-center gap-4 border-b border-white/10 p-4 md:p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neon-pink to-neon-orange font-display text-xl text-black">{s.order}</span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs tracking-widest text-neon-orange">{d.dow} {d.md}{s.travelDayBefore ? " · after a travel day" : ""}</p>
          <h3 className="font-display text-3xl uppercase leading-none tracking-wide md:text-4xl">{s.city}<span className="ml-2 text-lg text-zinc-400">{s.countryCode}</span></h3>
        </div>
        <div className="w-full sm:w-56">
          <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wider text-zinc-400">
            <span>Audience affinity</span><span>#{s.rank}</span>
          </div>
          <AffinityBar value={s.affinity} />
          <p className="mt-1 text-right text-[11px] text-zinc-400">{s.legKm ? `${s.legKm.toLocaleString("en-US")} km drive in` : "Hometown show"}</p>
        </div>
      </header>
      <div className="space-y-4 p-4 md:p-5">
        <p className="text-sm leading-relaxed text-zinc-200"><SourceTag src={s.whySource} />{s.why}</p>
        {s.drivers.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
            Taste drivers:
            {s.drivers.slice(0, 3).map((d) => <span key={d.name} className="rounded-full border border-neon-cyan/30 px-2 py-0.5 text-neon-cyan">{d.name}</span>)}
          </p>
        )}
        {s.promoIdea && (
          <p className="rounded-xl border border-neon-orange/30 bg-neon-orange/10 px-3 py-2 text-sm text-orange-100">
            <strong className="mr-1 font-semibold text-neon-orange">Promo idea</strong>{s.promoIdea}
          </p>
        )}
        {empty ? (
          <p className="rounded-xl bg-white/5 px-3 py-2 text-sm text-zinc-300">Qloo returned no venue / opener / promo picks for this stop — the market still ranks for audience affinity.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {KIND.map((k) => <RecList key={k.key} label={k.label} icon={k.icon} recs={s[k.key]} />)}
          </div>
        )}
      </div>
    </article>
  );
}

function TourDates({ plan }: { plan: TourPlan }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
      <h3 className="mb-1 text-center font-display text-4xl uppercase tracking-[0.12em] text-neon">Tour Dates</h3>
      <p className="mb-4 text-center text-[11px] uppercase tracking-[0.3em] text-zinc-400">{plan.home ? `Leaving ${plan.home.city}` : "Routed by taste"}</p>
      <ol className="divide-y divide-white/10">
        {plan.route.map((s) => {
          const d = fmtDate(s.date);
          return (
            <li key={s.id}>
              <a href={`#stop-${s.order}`} className="group grid grid-cols-[4.5rem_1fr_auto] items-baseline gap-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-neon-pink">
                <span className="font-mono text-sm tabular-nums text-neon-orange">{d.md}</span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-xl uppercase tracking-wide text-zinc-100 group-hover:text-neon-pink">{s.city}</span>
                  <span className="block truncate text-xs text-zinc-400">{s.venues[0]?.name ?? "Venue TBA"}</span>
                </span>
                <span className="font-mono text-xs tabular-nums text-zinc-400">{s.legKm ? `+${s.legKm.toLocaleString("en-US")}km` : "home"}</span>
              </a>
            </li>
          );
        })}
      </ol>
      {plan.totals.returnKm !== undefined && plan.totals.returnKm > 0 && (
        <p className="mt-3 border-t border-dashed border-white/15 pt-3 text-center text-xs text-zinc-400">
          Drive home to {plan.home?.city}: {plan.totals.returnKm.toLocaleString("en-US")} km
        </p>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="font-display text-4xl leading-none text-neon md:text-5xl">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-300">{label}</p>
    </div>
  );
}

function ArtistArt({ name, image }: { name: string; image?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-2xl ring-neon md:w-40">
      {image && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={name} className="h-full w-full object-cover" onError={() => setBroken(true)} referrerPolicy="no-referrer" />
      ) : (
        <div aria-hidden className="flex h-full w-full items-center justify-center bg-[conic-gradient(from_210deg,#ff4d9d,#ff9f43,#3ee6f0,#7c3aed,#ff4d9d)]">
          <span className="font-display text-5xl text-black/80 md:text-6xl">{initials(name)}</span>
        </div>
      )}
    </div>
  );
}

function LoadingSteps() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1700);
    return () => clearInterval(t);
  }, []);
  return (
    <section aria-live="polite" aria-busy="true" className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-black/50 p-6">
      <div className="mb-4 flex items-center gap-4">
        <div className="eq" aria-hidden><span /><span /><span /><span /><span /></div>
        <p className="font-display text-2xl uppercase tracking-wide">Soundchecking your tour…</p>
      </div>
      <ol className="space-y-2">
        {STEPS.map((label, i) => (
          <li key={label} className={`flex items-center gap-3 text-sm ${i < step ? "text-zinc-400" : i === step ? "text-zinc-50" : "text-zinc-400"}`}>
            <span aria-hidden className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${i < step ? "bg-neon-cyan/20 text-neon-cyan" : i === step ? "border-2 border-neon-pink border-t-transparent animate-spin" : "border border-white/20"}`}>
              {i < step ? "✓" : ""}
            </span>
            {label}
          </li>
        ))}
      </ol>
    </section>
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

type Form = { artist: string; homeCity: string; countryCode: string; shows: number; startDate: string; notes: string };

export default function Home() {
  const [f, setF] = useState<Form>({ artist: "", homeCity: "", countryCode: "US", shows: 6, startDate: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<TourPlan | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  async function run(form: Form) {
    setLoading(true);
    setError(null);
    setPlan(null);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artist: form.artist,
          homeCity: form.homeCity || undefined,
          countryCode: form.countryCode || undefined,
          shows: form.shows,
          startDate: form.startDate || undefined,
          notes: form.notes || undefined,
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

  const input =
    "w-full rounded-xl border border-white/15 bg-black/50 px-3.5 py-2.5 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-neon-pink focus:outline-none focus:ring-2 focus:ring-neon-pink/40";
  const lab = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-300";
  const region = plan ? REGION_NAME[plan.route[0]?.countryCode ?? ""] ?? plan.route[0]?.countryCode : "";
  const year = plan?.route[0]?.date?.slice(0, 4) ?? "";

  return (
    <div className="min-h-screen">
      <section className="stage-bg grain relative overflow-hidden border-b border-white/10">
        <div className="relative mx-auto max-w-6xl px-4 pb-12 pt-10 md:pb-16 md:pt-16">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-200">
            <span className="h-1.5 w-1.5 rounded-full bg-neon-pink shadow-[0_0_8px_#ff4d9d]" /> Qloo Taste AI × agentic tour routing
          </p>
          <h1 className="font-display text-[clamp(4.5rem,16vw,11rem)] uppercase leading-[0.85] tracking-tight">
            <span className="text-neon neon-glow">Encore</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-200 md:text-xl">
            Route your next tour by where your fans <em className="not-italic text-neon-orange">actually</em> are. Encore reads the Qloo taste graph,
            ranks the cities where your audience over-indexes, draws the van route, and lines up venues, openers, podcasts and brands — with a reason for every pick.
          </p>

          <form
            onSubmit={(e) => { e.preventDefault(); run(f); }}
            className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-black/55 p-4 backdrop-blur md:grid-cols-12 md:p-5"
          >
            <label className="md:col-span-4">
              <span className={lab}>Artist</span>
              <input className={`${input} text-base`} value={f.artist} onChange={(e) => set("artist", e.target.value)} placeholder="e.g. Phoebe Bridgers" required />
            </label>
            <label className="md:col-span-3">
              <span className={lab}>Home city (route start)</span>
              <input className={input} value={f.homeCity} onChange={(e) => set("homeCity", e.target.value)} placeholder="e.g. Chicago" />
            </label>
            <label className="md:col-span-2">
              <span className={lab}>Country</span>
              <select className={input} value={f.countryCode} onChange={(e) => set("countryCode", e.target.value)}>
                <option value="">Any</option>
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
            <label className="md:col-span-1">
              <span className={lab}>Shows</span>
              <input className={input} type="number" min={3} max={12} value={f.shows} onChange={(e) => set("shows", Number(e.target.value))} />
            </label>
            <label className="md:col-span-2">
              <span className={lab}>Start date</span>
              <input className={input} type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </label>
            <label className="md:col-span-9">
              <span className={lab}>Notes for the agent (optional)</span>
              <input className={input} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. skip the biggest markets — we have a van and no budget for flights" />
            </label>
            <div className="flex items-end md:col-span-3">
              <button
                disabled={loading || !f.artist}
                className="w-full rounded-xl bg-gradient-to-r from-neon-pink to-neon-orange px-5 py-3 font-display text-xl uppercase tracking-wider text-black transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Planning…" : "Plan the tour →"}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:col-span-12">
              <span className="text-xs text-zinc-400">Try:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.artist}
                  type="button"
                  disabled={loading}
                  onClick={() => { const next = { ...f, ...ex, notes: "" }; setF(next); run(next); }}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:border-neon-pink hover:text-neon-pink focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink disabled:opacity-50"
                >
                  {ex.artist} <span className="text-zinc-400">· from {ex.homeCity}</span>
                </button>
              ))}
            </div>
          </form>
        </div>
      </section>

      <main ref={resultsRef} className="mx-auto max-w-6xl scroll-mt-4 px-4 py-10">
        {error && (
          <div role="alert" className="mb-6 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            <strong className="font-semibold">Could not plan this tour.</strong> {error}
          </div>
        )}

        {loading && <LoadingSteps />}

        {!plan && !loading && !error && (
          <div className="grid gap-4 text-sm text-zinc-300 md:grid-cols-3">
            {[
              ["01", "Taste, not guesswork", "Qloo’s cross-domain taste graph ranks cities by how strongly your audience — and fans of artists like you — over-index there."],
              ["02", "A route a van can drive", "Code (not the LLM) orders the stops: a nearest-neighbour + 2-opt loop from your home city, with travel days for long hauls."],
              ["03", "Every pick explained", "The agent writes a grounded reason for each city, venue, opener, podcast and brand — ungrounded claims are dropped."],
            ].map(([n, t, d]) => (
              <div key={n} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="font-mono text-xs text-neon-orange">{n}</p>
                <h2 className="mt-1 font-display text-2xl uppercase tracking-wide text-zinc-50">{t}</h2>
                <p className="mt-2 leading-relaxed">{d}</p>
              </div>
            ))}
          </div>
        )}

        {plan && (
          <section className="space-y-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:gap-6">
              <div className="flex min-w-0 flex-1 items-center gap-4 md:items-end md:gap-6">
                <ArtistArt name={plan.artist.name} image={plan.artist.image} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-neon-cyan">{region} tour {year}</p>
                  <h2 className="break-words font-display text-4xl uppercase leading-[0.9] tracking-wide sm:text-5xl md:text-7xl">{plan.artist.name}</h2>
                  {plan.similarArtists.length > 0 && (
                    <p className="mt-3 hidden flex-wrap items-center gap-1.5 text-xs text-zinc-400 md:flex">
                      Fans also love
                      {plan.similarArtists.slice(0, 5).map((a) => <span key={a.name} className="rounded-full bg-white/10 px-2 py-0.5 text-zinc-200">{a.name}</span>)}
                    </p>
                  )}
                </div>
              </div>
              {plan.similarArtists.length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400 md:hidden">
                  Fans also love
                  {plan.similarArtists.slice(0, 5).map((a) => <span key={a.name} className="rounded-full bg-white/10 px-2 py-0.5 text-zinc-200">{a.name}</span>)}
                </p>
              )}
              <button onClick={() => download(plan)} className="self-start rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:border-neon-pink focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink md:self-end">
                ↓ Download plan (.md)
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {plan.data.source === "mock"
                ? <span className="rounded-full bg-amber-400/15 px-2.5 py-1 font-semibold text-amber-200">Data: MOCK placeholder</span>
                : <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 font-semibold text-emerald-200">Data: Qloo live</span>}
              {plan.agent.mode === "llm"
                ? <span className="rounded-full bg-neon-cyan/15 px-2.5 py-1 font-semibold text-cyan-100">Agent: {plan.agent.provider} {plan.agent.model}{plan.agent.latencyMs ? ` · ${(plan.agent.latencyMs / 1000).toFixed(1)}s` : ""}</span>
                : <span title={plan.agent.fallbackReason} className="rounded-full bg-white/10 px-2.5 py-1 font-semibold text-zinc-200">Agent: rule-based reasons (LLM off)</span>}
              {plan.agent.coverage && <span className="rounded-full bg-neon-pink/15 px-2.5 py-1 font-semibold text-pink-100">Reasons: {plan.agent.coverage.cities} cities · {plan.agent.coverage.items} items</span>}
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat value={String(plan.totals.shows)} label="Shows" />
              <Stat value={plan.totals.km.toLocaleString("en-US")} label="Tour km" />
              <Stat value={String(plan.totals.days)} label="Days on the road" />
              <Stat value={Math.max(...plan.route.map((s) => s.affinity)).toFixed(2)} label="Peak affinity" />
            </div>

            <p className="max-w-3xl text-lg leading-relaxed text-zinc-200"><SourceTag src={plan.summarySource} />{plan.summary}</p>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <RouteMap plan={plan} />
              <TourDates plan={plan} />
            </div>

            <div className="space-y-5">
              {plan.route.map((s) => <StopCard key={s.id} s={s} />)}
            </div>

            <details className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <summary className="cursor-pointer font-display text-2xl uppercase tracking-wide">Market ranking ({plan.ranking.length})</summary>
              <ol className="mt-4 grid gap-x-8 gap-y-2 md:grid-cols-2">
                {plan.ranking.map((c) => (
                  <li key={c.id} className={`grid grid-cols-[2.25rem_1fr_7rem_3.5rem] items-center gap-2 text-sm ${c.inRoute ? "text-zinc-50" : "text-zinc-400"}`}>
                    <span className="font-mono text-xs">#{c.rank}</span>
                    <span className="truncate">{c.city}, {c.countryCode}</span>
                    <AffinityBar value={c.affinity} label={false} />
                    <span className="text-right text-[11px] font-semibold uppercase text-neon-cyan">{c.inRoute ? "routed" : ""}</span>
                  </li>
                ))}
              </ol>
            </details>
            {plan.data.source === "mock" && <p className="text-xs text-amber-200/80">{plan.data.note}</p>}
          </section>
        )}
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-xs text-zinc-400 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-zinc-200">
            Powered by <strong className="text-neon font-semibold">Qloo Taste AI</strong>
          </p>
          <p>
            Map data © <a className="underline hover:text-zinc-200" href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors (dark style applied in-browser) · Built for the Qloo Agentic Hackathon ·{" "}
            <a className="underline hover:text-zinc-200" href="https://github.com/qinheyi/encore">Source</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
