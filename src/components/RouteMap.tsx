"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import L, { type LatLngBoundsExpression, type LatLngTuple } from "leaflet";
import type { TourPlan } from "@/lib/encore/types";

function FitBounds({ boundsKey }: { boundsKey: string }) {
  const map = useMap();
  useEffect(() => {
    const pts = JSON.parse(boundsKey) as LatLngTuple[];
    const fit = () => {
      // The container can change size after mount (fonts, layout, results streaming in): re-measure first.
      map.invalidateSize();
      if (pts.length === 1) map.setView(pts[0], 6, { animate: false });
      else if (pts.length) map.fitBounds(pts as LatLngBoundsExpression, { padding: [40, 40], maxZoom: 7, animate: false });
    };
    fit();
    const t = setTimeout(fit, 300);
    let last = "";
    const ro = new ResizeObserver(([e]) => {
      const size = `${Math.round(e.contentRect.width)}x${Math.round(e.contentRect.height)}`;
      if (size !== last) { last = size; fit(); }
    });
    ro.observe(map.getContainer());
    return () => { clearTimeout(t); ro.disconnect(); };
  }, [map, boundsKey]);
  return null;
}

/** Screen-space bearing (Web Mercator) from a to b, in degrees clockwise from north. */
function bearing(a: LatLngTuple, b: LatLngTuple) {
  const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const dx = ((b[1] - a[1]) * Math.PI) / 180;
  const dy = y(b[0]) - y(a[0]);
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

const pin = (n: number, city: string) =>
  L.divIcon({ className: "", html: `<div class="stop-pin" aria-label="Stop ${n}: ${city}">${n}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
const homeIcon = L.divIcon({ className: "", html: `<div class="home-pin" aria-label="Home">★</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
const arrow = (deg: number) =>
  L.divIcon({ className: "", html: `<div class="route-arrow" style="transform:rotate(${deg}deg)">▲</div>`, iconSize: [20, 20], iconAnchor: [10, 10] });

export default function RouteMap({ plan }: { plan: TourPlan }) {
  const home: LatLngTuple | undefined = plan.home ? [plan.home.lat, plan.home.lon] : undefined;
  const stops: LatLngTuple[] = plan.route.map((s) => [s.lat, s.lon]);
  const pts = [...(home ? [home] : []), ...stops];
  const legs = useMemo(() => {
    const out: { a: LatLngTuple; b: LatLngTuple; back?: boolean }[] = [];
    for (let i = 1; i < pts.length; i++) out.push({ a: pts[i - 1], b: pts[i] });
    if (home && stops.length) out.push({ a: stops[stops.length - 1], b: home, back: true });
    return out.filter((l) => Math.abs(l.a[0] - l.b[0]) + Math.abs(l.a[1] - l.b[1]) > 0.05);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pts)]);
  const others = plan.ranking.filter((c) => !c.inRoute);
  // Stops that sit close to an earlier stop get their label on the right so labels don't stack.
  const crowded = plan.route.map((s, i) => plan.route.slice(0, i).some((p) => Math.abs(p.lat - s.lat) < 1.6 && Math.abs(p.lon - s.lon) < 2.5));

  return (
    <MapContainer
      center={pts[0] ?? [40, -40]}
      zoom={4}
      scrollWheelZoom={false}
      zoomSnap={0.25}
      className="h-[360px] w-full rounded-2xl border border-white/10 md:h-[560px]"
      aria-label={`Tour map: ${plan.route.map((s) => s.city).join(", ")}`}
    >
      <TileLayer
        // Standard OSM tiles, darkened client-side with a CSS filter (see .encore-dark-tiles in globals.css).
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        className="encore-dark-tiles"
        maxZoom={19}
      />
      <FitBounds boundsKey={JSON.stringify(pts)} />
      {others.map((c) => (
        <CircleMarker key={c.id} center={[c.lat, c.lon]} radius={4} pathOptions={{ color: "#71717a", weight: 1, fillColor: "#a1a1aa", fillOpacity: 0.5 }}>
          <Tooltip className="encore-tip">{`#${c.rank} ${c.city} · affinity ${c.affinity.toFixed(2)} (not routed)`}</Tooltip>
        </CircleMarker>
      ))}
      {legs.map((l, i) => (
        <Polyline key={`g${i}`} positions={[l.a, l.b]} pathOptions={{ color: "#ff4d9d", weight: 8, opacity: l.back ? 0.08 : 0.18 }} />
      ))}
      {legs.map((l, i) => (
        <Polyline
          key={`l${i}`}
          positions={[l.a, l.b]}
          pathOptions={l.back ? { color: "#a1a1aa", weight: 2, opacity: 0.7, dashArray: "4 8" } : { color: "#ff7ab8", weight: 3, opacity: 0.95 }}
        />
      ))}
      {legs.filter((l) => !l.back).map((l, i) => (
        <Marker key={`a${i}`} position={[(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2]} icon={arrow(bearing(l.a, l.b))} interactive={false} keyboard={false} />
      ))}
      {home && plan.route[0]?.legKm !== 0 && (
        <Marker position={home} icon={homeIcon} zIndexOffset={500}>
          <Tooltip className="encore-tip" direction="left" offset={[-14, 0]} permanent>{`Home · ${plan.home!.city}`}</Tooltip>
        </Marker>
      )}
      {plan.route.map((s, i) => (
        <Marker key={s.id} position={[s.lat, s.lon]} icon={pin(s.order, s.city)} zIndexOffset={1000 - s.order}>
          <Tooltip className="encore-tip" direction={crowded[i] ? "right" : "top"} offset={crowded[i] ? [16, 0] : [0, -16]} permanent>{s.city}</Tooltip>
          <Popup>
            <strong>{s.order}. {s.city}</strong> — {s.date}
            <br />Affinity {s.affinity.toFixed(2)} · leg {s.legKm} km
            {s.venues[0] && <><br />Venue: {s.venues[0].name}</>}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
