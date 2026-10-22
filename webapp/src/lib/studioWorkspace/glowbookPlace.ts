/**
 * Where the artist works, on their Glowbook (decision 108). Pure: the shape
 * the database stores, the rules it checks (repeated so the form can say what
 * is wrong first), the rounding of an area, the directions links, the search
 * results of OpenStreetMap's Nominatim and the circle drawn around an area.
 *
 * Two modes:
 *   - "exact": a salon open to clients — the pin, its address and directions
 *     are public;
 *   - "area": at home, mobile, by appointment — only an area (~1 km) is
 *     public; the database rounds the coordinates before storing them, so a
 *     home address is never held.
 *
 * The map is free to run: MapLibre GL (open source) draws OpenFreeMap's
 * vector tiles (no key, no quota), and the artist's address search calls
 * Nominatim on demand (one request per search, never as-you-type: its usage
 * policy forbids autocomplete). Both credit OpenStreetMap.
 */

export const PLACE_MODES = ["area", "exact"] as const;
export type PlaceMode = (typeof PLACE_MODES)[number];

export interface GlowbookPlace {
  mode: PlaceMode;
  /** The address (exact) or the area's name (area), as shown. */
  label: string;
  lat: number;
  lng: number;
}

export const PLACE_LABEL_MIN = 2;
export const PLACE_LABEL_MAX = 120;
/** Decimals kept per mode: 2 ≈ 1.1 km for an area, 5 ≈ 1 m for a salon (the database rounds the same way). */
export const PLACE_DECIMALS: Record<PlaceMode, number> = { area: 2, exact: 5 };
/** The circle drawn around an area: wider than the rounding, so it always holds the real place. */
export const AREA_RADIUS_METERS = 1500;

/** The map's tiles and style: OpenFreeMap (free, no key, commercial use allowed). Swap here to change provider. */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
/** OpenStreetMap's public geocoder, used only by the artist's explicit search. */
export const GEOCODER_URL = "https://nominatim.openstreetmap.org/search";

const round = (v: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

/** The coordinates as the database will store them for this mode. */
export function roundPlace(place: GlowbookPlace): GlowbookPlace {
  const d = PLACE_DECIMALS[place.mode];
  return { ...place, label: place.label.trim(), lat: round(place.lat, d), lng: round(place.lng, d) };
}

const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const toNumber = (v: unknown): number | null => {
  if (isNumber(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** A place from the database's JSON (`look.place`) or from a row's `place_*` columns; null when incomplete. */
export function placeFromJson(o: Record<string, unknown> | null | undefined): GlowbookPlace | null {
  if (!o) return null;
  const nested = o.place && typeof o.place === "object" && !Array.isArray(o.place) ? (o.place as Record<string, unknown>) : null;
  const mode = nested ? nested.mode : o.place_mode;
  const label = nested ? nested.label : o.place_label;
  // numeric columns can reach the browser as strings
  const lat = toNumber(nested ? nested.lat : o.place_lat);
  const lng = toNumber(nested ? nested.lng : o.place_lng);
  if (!PLACE_MODES.includes(mode as PlaceMode) || typeof label !== "string" || !label.trim() || lat === null || lng === null) return null;
  return { mode: mode as PlaceMode, label, lat, lng };
}

export type PlaceProblem = "placeLabel" | "placeCoordinates";

export function validatePlace(place: GlowbookPlace | null): PlaceProblem | null {
  if (!place) return null;
  const label = place.label.trim();
  if (label.length < PLACE_LABEL_MIN || label.length > PLACE_LABEL_MAX) return "placeLabel";
  if (!isNumber(place.lat) || !isNumber(place.lng) || Math.abs(place.lat) > 90 || Math.abs(place.lng) > 180) return "placeCoordinates";
  return null;
}

export const samePlace = (a: GlowbookPlace | null, b: GlowbookPlace | null) =>
  a === b || (!!a && !!b && a.mode === b.mode && a.label === b.label && a.lat === b.lat && a.lng === b.lng);

/* ------------------------------------------------------------- directions */

export type DirectionsApp = "google" | "apple" | "osm";

/**
 * Links that open the visitor's maps app on the salon — plain URLs, nothing
 * to pay. Only for a salon: an area has no door to go to.
 */
export function directionsLinks(place: GlowbookPlace): { app: DirectionsApp; href: string }[] {
  if (place.mode !== "exact") return [];
  const at = `${place.lat},${place.lng}`;
  return [
    { app: "google", href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(at)}` },
    { app: "apple", href: `https://maps.apple.com/?daddr=${encodeURIComponent(at)}&q=${encodeURIComponent(place.label)}` },
    { app: "osm", href: `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=17/${place.lat}/${place.lng}` },
  ];
}

/* ---------------------------------------------------------- address search */

export interface PlaceCandidate {
  label: string;
  /** A short name for an area: the district or town, when Nominatim gives one. */
  area: string | null;
  lat: number;
  lng: number;
}

/** Nominatim's search address for what the artist typed, in their language. */
export function geocoderSearchUrl(query: string, language: string): string {
  const params = new URLSearchParams({ q: query.trim(), format: "jsonv2", addressdetails: "1", limit: "5", "accept-language": language });
  return `${GEOCODER_URL}?${params.toString()}`;
}

const AREA_KEYS = ["suburb", "city_district", "borough", "quarter", "neighbourhood", "village", "town", "city", "municipality"] as const;
const TOWN_KEYS = ["city", "town", "village", "municipality"] as const;

/** Nominatim's answer → up to five candidates; anything malformed is dropped. */
export function parseGeocoderResults(json: unknown): PlaceCandidate[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((raw): PlaceCandidate[] => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const lat = toNumber(r.lat);
    const lng = toNumber(r.lon);
    const label = typeof r.display_name === "string" ? r.display_name.trim() : "";
    if (lat === null || lng === null || !label || Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
    const address = r.address && typeof r.address === "object" ? (r.address as Record<string, unknown>) : {};
    const pick = (keys: readonly string[]) => keys.map((k) => address[k]).find((v): v is string => typeof v === "string" && !!v.trim()) ?? null;
    const district = pick(AREA_KEYS);
    const town = pick(TOWN_KEYS);
    const area = district && town && district !== town ? `${district}, ${town}` : (district ?? town);
    return [{ label: label.slice(0, PLACE_LABEL_MAX), area: area ? area.slice(0, PLACE_LABEL_MAX) : null, lat, lng }];
  }).slice(0, 5);
}

/** The place a candidate gives in a mode: an area keeps only the district's name. */
export function placeFromCandidate(candidate: PlaceCandidate, mode: PlaceMode): GlowbookPlace {
  return roundPlace({ mode, label: mode === "area" ? (candidate.area ?? candidate.label) : candidate.label, lat: candidate.lat, lng: candidate.lng });
}

/**
 * The place after the artist switches mode. An area never keeps a street
 * address (the district's name, else nothing to fill in). A salon takes the
 * picked result's own coordinates — an area's are rounded ~1 km away — and,
 * without one, keeps no name, so the artist searches the address first.
 */
export function switchPlaceMode(place: GlowbookPlace, next: PlaceMode, picked: PlaceCandidate | null): GlowbookPlace {
  if (place.mode === next) return place;
  if (next === "area") return roundPlace({ ...place, mode: "area", label: picked?.area ?? "" });
  if (picked) return placeFromCandidate(picked, "exact");
  return roundPlace({ ...place, mode: "exact", label: "" });
}

/* ------------------------------------------------------------------ circle */

/** A closed ring of [lng, lat] around a point, `radius` metres away (GeoJSON polygon for an area). */
export function circleRing(lat: number, lng: number, radius: number, steps = 64): [number, number][] {
  const earth = 6_371_000;
  const dLat = (radius / earth) * (180 / Math.PI);
  const dLng = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([round(lng + dLng * Math.cos(a), 6), round(lat + dLat * Math.sin(a), 6)]);
  }
  ring.push(ring[0]);
  return ring;
}
