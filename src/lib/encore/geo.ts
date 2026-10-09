/** Small gazetteer of touring markets (used to geocode the home city and for mock data). */
export interface GazetteerCity {
  city: string;
  countryCode: string;
  lat: number;
  lon: number;
  scene: number; // 0..1 rough size of the live-music market (used only by mock data)
}

export const GAZETTEER: GazetteerCity[] = [
  // United States
  { city: "New York", countryCode: "US", lat: 40.7128, lon: -74.006, scene: 1 },
  { city: "Los Angeles", countryCode: "US", lat: 34.0522, lon: -118.2437, scene: 0.98 },
  { city: "Chicago", countryCode: "US", lat: 41.8781, lon: -87.6298, scene: 0.9 },
  { city: "Austin", countryCode: "US", lat: 30.2672, lon: -97.7431, scene: 0.88 },
  { city: "Nashville", countryCode: "US", lat: 36.1627, lon: -86.7816, scene: 0.86 },
  { city: "Seattle", countryCode: "US", lat: 47.6062, lon: -122.3321, scene: 0.8 },
  { city: "Portland", countryCode: "US", lat: 45.5152, lon: -122.6784, scene: 0.76 },
  { city: "San Francisco", countryCode: "US", lat: 37.7749, lon: -122.4194, scene: 0.82 },
  { city: "Denver", countryCode: "US", lat: 39.7392, lon: -104.9903, scene: 0.74 },
  { city: "Minneapolis", countryCode: "US", lat: 44.9778, lon: -93.265, scene: 0.7 },
  { city: "Philadelphia", countryCode: "US", lat: 39.9526, lon: -75.1652, scene: 0.75 },
  { city: "Boston", countryCode: "US", lat: 42.3601, lon: -71.0589, scene: 0.74 },
  { city: "Atlanta", countryCode: "US", lat: 33.749, lon: -84.388, scene: 0.78 },
  { city: "New Orleans", countryCode: "US", lat: 29.9511, lon: -90.0715, scene: 0.72 },
  { city: "Detroit", countryCode: "US", lat: 42.3314, lon: -83.0458, scene: 0.64 },
  { city: "Washington", countryCode: "US", lat: 38.9072, lon: -77.0369, scene: 0.7 },
  { city: "Salt Lake City", countryCode: "US", lat: 40.7608, lon: -111.891, scene: 0.55 },
  { city: "Phoenix", countryCode: "US", lat: 33.4484, lon: -112.074, scene: 0.58 },
  { city: "Asheville", countryCode: "US", lat: 35.5951, lon: -82.5515, scene: 0.5 },
  // Canada
  { city: "Toronto", countryCode: "CA", lat: 43.6532, lon: -79.3832, scene: 0.88 },
  { city: "Montreal", countryCode: "CA", lat: 45.5017, lon: -73.5673, scene: 0.84 },
  { city: "Vancouver", countryCode: "CA", lat: 49.2827, lon: -123.1207, scene: 0.76 },
  { city: "Calgary", countryCode: "CA", lat: 51.0447, lon: -114.0719, scene: 0.55 },
  { city: "Ottawa", countryCode: "CA", lat: 45.4215, lon: -75.6972, scene: 0.55 },
  // United Kingdom
  { city: "London", countryCode: "GB", lat: 51.5074, lon: -0.1278, scene: 1 },
  { city: "Manchester", countryCode: "GB", lat: 53.4808, lon: -2.2426, scene: 0.85 },
  { city: "Glasgow", countryCode: "GB", lat: 55.8642, lon: -4.2518, scene: 0.8 },
  { city: "Bristol", countryCode: "GB", lat: 51.4545, lon: -2.5879, scene: 0.72 },
  { city: "Leeds", countryCode: "GB", lat: 53.8008, lon: -1.5491, scene: 0.68 },
  { city: "Birmingham", countryCode: "GB", lat: 52.4862, lon: -1.8904, scene: 0.66 },
  { city: "Brighton", countryCode: "GB", lat: 50.8225, lon: -0.1372, scene: 0.62 },
  // Germany
  { city: "Berlin", countryCode: "DE", lat: 52.52, lon: 13.405, scene: 0.95 },
  { city: "Hamburg", countryCode: "DE", lat: 53.5511, lon: 9.9937, scene: 0.8 },
  { city: "Cologne", countryCode: "DE", lat: 50.9375, lon: 6.9603, scene: 0.75 },
  { city: "Munich", countryCode: "DE", lat: 48.1351, lon: 11.582, scene: 0.72 },
  { city: "Leipzig", countryCode: "DE", lat: 51.3397, lon: 12.3731, scene: 0.62 },
  { city: "Frankfurt", countryCode: "DE", lat: 50.1109, lon: 8.6821, scene: 0.62 },
  // Australia
  { city: "Melbourne", countryCode: "AU", lat: -37.8136, lon: 144.9631, scene: 0.9 },
  { city: "Sydney", countryCode: "AU", lat: -33.8688, lon: 151.2093, scene: 0.88 },
  { city: "Brisbane", countryCode: "AU", lat: -27.4698, lon: 153.0251, scene: 0.7 },
  { city: "Perth", countryCode: "AU", lat: -31.9505, lon: 115.8605, scene: 0.62 },
  { city: "Adelaide", countryCode: "AU", lat: -34.9285, lon: 138.6007, scene: 0.58 },
  // Japan
  { city: "Tokyo", countryCode: "JP", lat: 35.6762, lon: 139.6503, scene: 1 },
  { city: "Osaka", countryCode: "JP", lat: 34.6937, lon: 135.5023, scene: 0.85 },
  { city: "Nagoya", countryCode: "JP", lat: 35.1815, lon: 136.9066, scene: 0.65 },
  { city: "Fukuoka", countryCode: "JP", lat: 33.5904, lon: 130.4017, scene: 0.62 },
  { city: "Sapporo", countryCode: "JP", lat: 43.0618, lon: 141.3545, scene: 0.58 },
];

export const COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "AU", name: "Australia" },
  { code: "JP", name: "Japan" },
];

/** Touring region: a van tour stays inside one region. */
const REGION: Record<string, string> = {
  US: "NA", CA: "NA", MX: "NA",
  GB: "EU", IE: "EU", DE: "EU", FR: "EU", NL: "EU", BE: "EU", ES: "EU", IT: "EU", AT: "EU", CH: "EU", DK: "EU", SE: "EU", NO: "EU", PL: "EU", CZ: "EU", PT: "EU",
  AU: "OC", NZ: "OC",
  JP: "JP",
};
export const regionOf = (countryCode: string) => REGION[countryCode.toUpperCase()] ?? countryCode.toUpperCase();

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

export function geocodeCity(name?: string): GazetteerCity | undefined {
  if (!name) return undefined;
  const n = norm(name.split(",")[0]);
  return GAZETTEER.find((c) => norm(c.city) === n);
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Pt = { lat: number; lon: number };

function pathLength(start: Pt | undefined, pts: Pt[]): number {
  let km = 0;
  let prev = start;
  for (const p of pts) {
    if (prev) km += haversineKm(prev, p);
    prev = p;
  }
  return km;
}

/**
 * Deterministic route ordering: nearest-neighbour from the home city (or the
 * highest-affinity stop when no home is known), then 2-opt improvement.
 * Geography is done in code, never by the LLM.
 */
export function orderRoute<T extends Pt & { affinity: number }>(stops: T[], home?: Pt): T[] {
  if (stops.length <= 2) return [...stops];
  const remaining = [...stops];
  const ordered: T[] = [];
  let cur: Pt;
  if (home) {
    cur = home;
  } else {
    remaining.sort((a, b) => b.affinity - a.affinity);
    const first = remaining.shift()!;
    ordered.push(first);
    cur = first;
  }
  while (remaining.length) {
    let best = 0;
    let bestD = Infinity;
    remaining.forEach((p, i) => {
      const d = haversineKm(cur, p);
      if (d < bestD) { bestD = d; best = i; }
    });
    const next = remaining.splice(best, 1)[0];
    ordered.push(next);
    cur = next;
  }
  // 2-opt
  let improved = true;
  let route = ordered;
  const fixedFirst = home ? 0 : 1; // without home, keep the top-affinity opener first
  for (let iter = 0; improved && iter < 50; iter++) {
    improved = false;
    for (let i = fixedFirst; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)];
        if (pathLength(home, candidate) + 1e-6 < pathLength(home, route)) {
          route = candidate;
          improved = true;
        }
      }
    }
  }
  return route;
}

/** Add dates: one show per day, plus a travel/off day before any leg longer than `longLegKm`. */
export function schedule(legsKm: number[], startDate: string, longLegKm = 700): { date: string; travelDayBefore: boolean }[] {
  const d = new Date(`${startDate}T00:00:00Z`);
  return legsKm.map((km, i) => {
    const travelDayBefore = i > 0 && km > longLegKm;
    if (i > 0) d.setUTCDate(d.getUTCDate() + (travelDayBefore ? 2 : 1));
    return { date: d.toISOString().slice(0, 10), travelDayBefore };
  });
}

/** Next Friday (UTC) from now — a sensible default tour start. */
export function defaultStartDate(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 28); // ~4 weeks out
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
