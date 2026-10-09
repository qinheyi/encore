"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import type { TourPlan } from "@/lib/encore/types";

function FitBounds({ boundsKey }: { boundsKey: string }) {
  const map = useMap();
  useEffect(() => {
    const bounds = JSON.parse(boundsKey) as LatLngBoundsExpression;
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 7 });
  }, [map, boundsKey]);
  return null;
}

export default function RouteMap({ plan }: { plan: TourPlan }) {
  const pts: LatLngExpression[] = [
    ...(plan.home ? [[plan.home.lat, plan.home.lon] as [number, number]] : []),
    ...plan.route.map((s) => [s.lat, s.lon] as [number, number]),
  ];
  const others = plan.ranking.filter((c) => !c.inRoute);
  const boundsKey = JSON.stringify(pts);

  return (
    <MapContainer center={pts[0] ?? [40, -40]} zoom={4} scrollWheelZoom={false} className="h-[420px] w-full rounded-xl border border-stone-200">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds boundsKey={boundsKey} />
      <Polyline positions={pts} pathOptions={{ color: "#e11d48", weight: 3, dashArray: "6 6" }} />
      {others.map((c) => (
        <CircleMarker key={c.id} center={[c.lat, c.lon]} radius={4} pathOptions={{ color: "#a8a29e", fillOpacity: 0.6 }}>
          <Tooltip>{`#${c.rank} ${c.city} · affinity ${c.affinity.toFixed(2)} (not routed)`}</Tooltip>
        </CircleMarker>
      ))}
      {plan.home && (
        <CircleMarker center={[plan.home.lat, plan.home.lon]} radius={7} pathOptions={{ color: "#1c1917", fillColor: "#fff", fillOpacity: 1 }}>
          <Tooltip permanent direction="left">Home: {plan.home.city}</Tooltip>
        </CircleMarker>
      )}
      {plan.route.map((s) => (
        <CircleMarker key={s.id} center={[s.lat, s.lon]} radius={10} pathOptions={{ color: "#be123c", fillColor: "#e11d48", fillOpacity: 0.9 }}>
          <Tooltip permanent direction="top" offset={[0, -8]}>{`${s.order}. ${s.city}`}</Tooltip>
          <Popup>
            <strong>{s.order}. {s.city}</strong> — {s.date}
            <br />Affinity {s.affinity.toFixed(2)} · leg {s.legKm} km
            <br />Venue: {s.venues[0]?.name}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
