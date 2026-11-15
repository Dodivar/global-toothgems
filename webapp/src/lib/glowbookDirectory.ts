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
