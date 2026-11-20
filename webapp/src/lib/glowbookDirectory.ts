import { placeFromJson, type GlowbookPlace } from "./studioWorkspace/glowbookPlace";

/**
 * The artist directory, "Find an artist near me" (decision 145). Pure: the
 * shape `glowbook_directory()` returns, the city pages, distances and the
 * order of the list. No React, no Supabase client, no `window`.
 *
 * Rules decided with the owner (2026-11-14):
 *   - an artist appears only after switching "Appear in the directory" on,
 *     while their Glowbook is public, with a place and a creation (the
 *     database decides; this module only reads what it returns);
 *   - one page per city an artist writes in their Glowbook's "City" field,
 *     the same slug in both languages (`/fr/artistes/paris`,
 *     `/en/artists/paris`), only for cities with at least one artist;
 *   - "near me" and the city search sort by distance in the browser: the
 *     visitor's position never leaves it. An area is rounded to ~1 km by the
 *     database, so distances are shown in whole kilometres only.
 */

export interface DirectoryArtist {
  handle: string;
  displayName: string;
  bio: string;
  /** The Glowbook's "City" field, as written by the artist; null when empty. */
  location: string | null;
  /** The city page this artist belongs to; null without a city. */
  citySlug: string | null;
  place: GlowbookPlace;
  certified: boolean;
  creationCount: number;
  avatarPath: string | null;
  coverPath: string | null;
}

/** An artist as the page receives it: the pictures signed by the server. */
export interface DirectoryEntry extends Omit<DirectoryArtist, "avatarPath" | "coverPath"> {
  avatarUrl: string | null;
  coverUrl: string | null;
}

export interface DirectoryCity {
  slug: string;
  /** The spelling most of its artists use. */
  name: string;
  count: number;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * The city page of a "City" field: the part before a comma or a bracket,
 * accents removed, lower-cased, words joined by hyphens ("Paris, France" and
 * "paris" → "paris"; "Saint-Étienne" → "saint-etienne"). Null when nothing
 * usable is left.
 */
export function citySlug(location: string | null | undefined): string | null {
  if (!location) return null;
  const head = location.split(/[,(/]/)[0] ?? "";
  const slug = head
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug.length >= 2 ? slug : null;
}

/** A city name for display, from a "City" field (the part before a comma). */
export function cityName(location: string): string {
  return (location.split(/[,(/]/)[0] ?? location).trim();
}

/** Reads `glowbook_directory()`'s JSON defensively: anything incomplete is dropped. */
export function toDirectoryArtists(json: unknown): DirectoryArtist[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((raw): DirectoryArtist[] => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const o = raw as Record<string, unknown>;
    const handle = str(o.handle);
    const displayName = str(o.display_name);
    const place = placeFromJson(o.place && typeof o.place === "object" ? { place: o.place } : null);
    if (!handle || !displayName || !place) return [];
    const location = str(o.location) || null;
    return [
      {
        handle,
        displayName,
        bio: str(o.bio),
        location,
        citySlug: citySlug(location),
        place,
        certified: o.certified === true,
        creationCount: typeof o.creation_count === "number" ? o.creation_count : 0,
        avatarPath: str(o.avatar_path) || null,
        coverPath: str(o.cover_path) || null,
      },
    ];
  });
}

/** The cities with at least one artist, the most represented first, then by name. */
export function directoryCities(artists: readonly Pick<DirectoryArtist, "citySlug" | "location">[]): DirectoryCity[] {
  const byCity = new Map<string, Map<string, number>>();
  for (const a of artists) {
    if (!a.citySlug || !a.location) continue;
    const names = byCity.get(a.citySlug) ?? new Map<string, number>();
    const name = cityName(a.location);
    names.set(name, (names.get(name) ?? 0) + 1);
    byCity.set(a.citySlug, names);
  }
  return [...byCity.entries()]
    .map(([slug, names]) => {
      const count = [...names.values()].reduce((s, n) => s + n, 0);
      const name = [...names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      return { slug, name, count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));
}

/* -------------------------------------------------------------- distances */

export interface Point {
  lat: number;
  lng: number;
}

/** Great-circle distance in kilometres (haversine). */
export function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A distance as shown: whole kilometres, never metres (an area is only known
 * to ~1 km). `{ km: 1, under: true }` reads "less than 1 km" for a salon,
 * "about 1 km" for an area.
 */
export function shownDistance(km: number): { km: number; under: boolean } {
  if (km < 1) return { km: 1, under: true };
  return { km: Math.round(km), under: false };
}

/** The list in the order shown: by distance from `origin` when there is one, else as given (by name). */
export function sortByDistance<T extends { place: GlowbookPlace }>(artists: readonly T[], origin: Point | null): (T & { distanceKm: number | null })[] {
  const withDistance = artists.map((a) => ({ ...a, distanceKm: origin ? distanceKm(origin, a.place) : null }));
  if (!origin) return withDistance;
  return withDistance.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}

/**
 * A search typed by the visitor, matched against the cities already listed
 * first, so most searches never leave the site. Returns the city's centre
 * (the average of its artists' points) or null — then the page asks
 * OpenStreetMap's geocoder.
 */
export function matchListedCity(query: string, artists: readonly Pick<DirectoryArtist, "citySlug" | "place">[]): (Point & { slug: string }) | null {
  const slug = citySlug(query);
  if (!slug) return null;
  const inCity = artists.filter((a) => a.citySlug === slug);
  if (!inCity.length) return null;
  const lat = inCity.reduce((s, a) => s + a.place.lat, 0) / inCity.length;
  const lng = inCity.reduce((s, a) => s + a.place.lng, 0) / inCity.length;
  return { slug, lat, lng };
}

/** The point at the middle of a set of artists (a city page's map), or null. */
export function centreOf(artists: readonly { place: GlowbookPlace }[]): Point | null {
  if (!artists.length) return null;
  return {
    lat: artists.reduce((s, a) => s + a.place.lat, 0) / artists.length,
    lng: artists.reduce((s, a) => s + a.place.lng, 0) / artists.length,
  };
}

/* ------------------------------------------------- the visitor's position */

/**
 * Where the list is sorted from: a city typed by the visitor, the device's
 * position ("near me", or already allowed on an earlier visit), or the
 * approximate area the host derives from the IP address (`approx`, the
 * default on the main page when known — decision 145 (j)).
 */
export type OriginKind = "city" | "nearMe" | "approx";

export interface ApproximateOrigin extends Point {
  /** The city the host names, when it gives one. */
  label: string | null;
}

/** Beyond this, an IP area says nothing useful about the listed artists (another country). */
export const APPROXIMATE_ORIGIN_MAX_KM = 1000;

/**
 * Reads the approximate visitor area the host gives with each request
 * (Vercel: `x-vercel-ip-latitude`, `x-vercel-ip-longitude`, the city
 * URL-encoded in `x-vercel-ip-city`). Rounded to 2 decimals (~1 km): it is a
 * guess from the IP address, not a position. Null when missing (local
 * development) or malformed.
 */
export function approximateOriginFromHeaders(get: (name: string) => string | null | undefined): ApproximateOrigin | null {
  const lat = Number.parseFloat(get("x-vercel-ip-latitude") ?? "");
  const lng = Number.parseFloat(get("x-vercel-ip-longitude") ?? "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  let label: string | null = null;
  const raw = get("x-vercel-ip-city");
  if (raw) {
    try {
      label = decodeURIComponent(raw).trim().slice(0, 80) || null;
    } catch {
      label = null;
    }
  }
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100, label };
}

/** The approximate origin when at least one listed artist is within reach of it, else null. */
export function usableApproximateOrigin(origin: ApproximateOrigin | null, artists: readonly { place: GlowbookPlace }[]): ApproximateOrigin | null {
  if (!origin || !artists.length) return null;
  return artists.some((a) => distanceKm(origin, a.place) <= APPROXIMATE_ORIGIN_MAX_KM) ? origin : null;
}

/* ------------------------------------------------- grouping and pages */

/** Cards revealed at a time ("Show more"). The first batch is rendered on the server. */
export const DIRECTORY_PAGE_SIZE = 12;
/** Cards per city on the main page; the city page shows them all. */
export const CITY_RAIL_SIZE = 6;
/** Cities revealed at a time on the main page. */
export const CITY_GROUPS_PAGE_SIZE = 4;

export type DistanceBand = "near" | "close" | "region" | "far";

/** < 10 km, 10–30 km, 30–100 km, beyond. */
export function distanceBand(km: number): DistanceBand {
  if (km < 10) return "near";
  if (km < 30) return "close";
  if (km < 100) return "region";
  return "far";
}

export interface BandGroup<T> {
  band: DistanceBand;
  items: T[];
}

/**
 * The list sorted by distance, cut into its distance bands, keeping the
 * order. Only the first `limit` artists are taken ("Show more" raises it);
 * a band is never empty.
 */
export function groupByDistance<T extends { distanceKm: number | null }>(sorted: readonly T[], limit: number): BandGroup<T>[] {
  const groups: BandGroup<T>[] = [];
  for (const item of sorted.slice(0, Math.max(0, limit))) {
    const band = distanceBand(item.distanceKm ?? Number.POSITIVE_INFINITY);
    const last = groups[groups.length - 1];
    if (last && last.band === band) last.items.push(item);
    else groups.push({ band, items: [item] });
  }
  return groups;
}

export interface CityGroup<T> {
  /** Null for the artists without a city ("Other areas"), always last. */
  city: DirectoryCity | null;
  /** The first `perCity` of the city, in the order given; every one for the artists without a city (no page lists them elsewhere). */
  items: T[];
  total: number;
}

/**
 * The main page without a search: one row per city, the most represented
 * first (the order of `cities`), then the artists without a city. A city's
 * row holds at most `perCity` artists; its city page lists them all.
 */
export function groupByCity<T extends { citySlug: string | null }>(artists: readonly T[], cities: readonly DirectoryCity[], perCity = CITY_RAIL_SIZE): CityGroup<T>[] {
  const bySlug = new Map<string, T[]>();
  const other: T[] = [];
  for (const a of artists) {
    if (!a.citySlug) {
      other.push(a);
      continue;
    }
    const list = bySlug.get(a.citySlug) ?? [];
    list.push(a);
    bySlug.set(a.citySlug, list);
  }
  const groups: CityGroup<T>[] = cities.flatMap((city) => {
    const list = bySlug.get(city.slug);
    return list?.length ? [{ city, items: list.slice(0, perCity), total: list.length }] : [];
  });
  if (other.length) groups.push({ city: null, items: other, total: other.length });
  return groups;
}

/**
 * Whether the main page shows city rows rather than one grid: only when there
 * are more artists than one page and they live in at least two places —
 * a handful of artists reads better as a single grid.
 */
export function showsCityRows(artistCount: number, groupCount: number): boolean {
  return artistCount > DIRECTORY_PAGE_SIZE && groupCount >= 2;
}
