import { describe, expect, it } from "vitest";
import {
  approximateOriginFromHeaders,
  centreOf,
  CITY_RAIL_SIZE,
  citySlug,
  DIRECTORY_PAGE_SIZE,
  directoryCities,
  distanceBand,
  distanceKm,
  groupByCity,
  groupByDistance,
  matchListedCity,
  showsCityRows,
  shownDistance,
  sortByDistance,
  toDirectoryArtists,
  usableApproximateOrigin,
} from "./glowbookDirectory";

const row = (over: Record<string, unknown> = {}) => ({
  handle: "lily",
  display_name: "Lily Gems",
  bio: "Hello",
  location: "Paris",
  avatar_path: "u/avatar.webp",
  cover_path: "u/look.jpg",
  certified: true,
  creation_count: 3,
  place: { mode: "area", label: "Batignolles, Paris", lat: 48.88, lng: 2.32 },
  ...over,
});

describe("citySlug", () => {
  it("keeps the city before a comma, without accents or case", () => {
    expect(citySlug("Paris, France")).toBe("paris");
    expect(citySlug("  paris ")).toBe("paris");
    expect(citySlug("Saint-Étienne")).toBe("saint-etienne");
    expect(citySlug("Aix en Provence (13)")).toBe("aix-en-provence");
  });
  it("answers null when nothing usable is left", () => {
    expect(citySlug(null)).toBeNull();
    expect(citySlug("")).toBeNull();
    expect(citySlug("—")).toBeNull();
    expect(citySlug("x")).toBeNull();
  });
});

describe("toDirectoryArtists", () => {
  it("maps a row, numeric strings included", () => {
    const [a] = toDirectoryArtists([row({ place: { mode: "exact", label: "1 rue X", lat: "48.85661", lng: "2.35222" } })]);
    expect(a).toMatchObject({ handle: "lily", displayName: "Lily Gems", citySlug: "paris", certified: true, creationCount: 3 });
    expect(a.place).toEqual({ mode: "exact", label: "1 rue X", lat: 48.85661, lng: 2.35222 });
  });
  it("drops incomplete rows and survives garbage", () => {
    expect(toDirectoryArtists(null)).toEqual([]);
    expect(toDirectoryArtists({})).toEqual([]);
    expect(toDirectoryArtists([row({ place: null }), row({ handle: "" }), 7, null])).toEqual([]);
  });
  it("never claims a badge it was not given", () => {
    expect(toDirectoryArtists([row({ certified: "yes" })])[0].certified).toBe(false);
  });
  it("has no city page without a city", () => {
    expect(toDirectoryArtists([row({ location: null })])[0].citySlug).toBeNull();
  });
});

describe("directoryCities", () => {
  it("groups spellings under one slug, the most used spelling and biggest city first", () => {
    const artists = toDirectoryArtists([
      row({ handle: "a", location: "Paris" }),
      row({ handle: "b", location: "paris, France" }),
      row({ handle: "c", location: "Paris" }),
      row({ handle: "d", location: "Lyon" }),
      row({ handle: "e", location: null }),
    ]);
    expect(directoryCities(artists)).toEqual([
      { slug: "paris", name: "Paris", count: 3 },
      { slug: "lyon", name: "Lyon", count: 1 },
    ]);
  });
});

describe("distances", () => {
  it("measures Paris → Lyon at about 392 km", () => {
    expect(distanceKm({ lat: 48.8566, lng: 2.3522 }, { lat: 45.764, lng: 4.8357 })).toBeCloseTo(392, -1);
  });
  it("shows whole kilometres, never metres", () => {
    expect(shownDistance(0.2)).toEqual({ km: 1, under: true });
    expect(shownDistance(3.6)).toEqual({ km: 4, under: false });
  });
  it("sorts by distance only when there is an origin", () => {
    const artists = toDirectoryArtists([
      row({ handle: "lyon", place: { mode: "area", label: "Lyon", lat: 45.76, lng: 4.84 } }),
      row({ handle: "paris", place: { mode: "area", label: "Paris", lat: 48.86, lng: 2.35 } }),
    ]);
    expect(sortByDistance(artists, null).map((a) => [a.handle, a.distanceKm])).toEqual([
      ["lyon", null],
      ["paris", null],
    ]);
    expect(sortByDistance(artists, { lat: 48.85, lng: 2.35 }).map((a) => a.handle)).toEqual(["paris", "lyon"]);
  });
});

describe("matchListedCity", () => {
  const artists = toDirectoryArtists([
    row({ handle: "a", location: "Paris", place: { mode: "area", label: "A", lat: 48.8, lng: 2.3 } }),
    row({ handle: "b", location: "Paris", place: { mode: "area", label: "B", lat: 48.9, lng: 2.4 } }),
  ]);
  it("answers a listed city's centre without asking the geocoder", () => {
    const m = matchListedCity("paris ", artists);
    expect(m?.slug).toBe("paris");
    expect(m?.lat).toBeCloseTo(48.85);
    expect(m?.lng).toBeCloseTo(2.35);
  });
  it("answers null for a city nobody lists", () => {
    expect(matchListedCity("Lille", artists)).toBeNull();
    expect(matchListedCity("", artists)).toBeNull();
  });
  it("centres a city page", () => {
    expect(centreOf([])).toBeNull();
    expect(centreOf(artists)?.lat).toBeCloseTo(48.85);
  });
});

/* A directory at scale: 60 artists in 6 cities, plus 4 without a city. */
const CITIES: [string, number, number, number][] = [
  ["Paris", 48.86, 2.35, 20],
  ["Lyon", 45.76, 4.84, 12],
  ["Marseille", 43.3, 5.37, 10],
  ["Bordeaux", 44.84, -0.58, 8],
  ["Lille", 50.63, 3.06, 6],
  ["Nantes", 47.22, -1.55, 4],
];
const many = toDirectoryArtists([
  ...CITIES.flatMap(([city, lat, lng, n]) =>
    Array.from({ length: n }, (_, i) => row({ handle: `${city}-${i}`, location: city, place: { mode: "area", label: city, lat: lat + i * 0.01, lng } })),
  ),
  ...Array.from({ length: 4 }, (_, i) => row({ handle: `nocity-${i}`, location: null, place: { mode: "area", label: "Somewhere", lat: 46 + i, lng: 2 } })),
]);

describe("approximate origin", () => {
  const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null;
  it("reads Vercel's geo headers, rounded, with the city decoded", () => {
    expect(approximateOriginFromHeaders(headers({ "x-vercel-ip-latitude": "45.7578", "x-vercel-ip-longitude": "4.8351", "x-vercel-ip-city": "Saint-%C3%89tienne" }))).toEqual({
      lat: 45.76,
      lng: 4.84,
      label: "Saint-Étienne",
    });
  });
  it("answers null without headers (local development) or with nonsense", () => {
    expect(approximateOriginFromHeaders(headers({}))).toBeNull();
    expect(approximateOriginFromHeaders(headers({ "x-vercel-ip-latitude": "abc", "x-vercel-ip-longitude": "2" }))).toBeNull();
    expect(approximateOriginFromHeaders(headers({ "x-vercel-ip-latitude": "95", "x-vercel-ip-longitude": "2" }))).toBeNull();
  });
  it("keeps the position without a city, and survives a badly encoded one", () => {
    expect(approximateOriginFromHeaders(headers({ "x-vercel-ip-latitude": "48.8", "x-vercel-ip-longitude": "2.3", "x-vercel-ip-city": "%E0%A4%A" }))).toEqual({ lat: 48.8, lng: 2.3, label: null });
  });
  it("is used only near at least one listed artist", () => {
    const lyon = { lat: 45.76, lng: 4.84, label: "Lyon" };
    const newYork = { lat: 40.71, lng: -74, label: "New York" };
    expect(usableApproximateOrigin(lyon, many)).toEqual(lyon);
    expect(usableApproximateOrigin(newYork, many)).toBeNull();
    expect(usableApproximateOrigin(lyon, [])).toBeNull();
    expect(usableApproximateOrigin(null, many)).toBeNull();
  });
});

describe("grouping by distance", () => {
  it("cuts the bands at 10, 30 and 100 km", () => {
    expect([0, 9.9, 10, 29.9, 30, 99, 100, 800].map(distanceBand)).toEqual(["near", "near", "close", "close", "region", "region", "far", "far"]);
  });
  it("keeps the sorted order, takes one page and never makes an empty band", () => {
    const sorted = sortByDistance(many, { lat: 45.76, lng: 4.84 });
    const groups = groupByDistance(sorted, DIRECTORY_PAGE_SIZE);
    expect(groups.flatMap((g) => g.items)).toEqual(sorted.slice(0, DIRECTORY_PAGE_SIZE));
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
    expect(groups[0].band).toBe("near");
    expect(groups[0].items.every((a) => a.location === "Lyon")).toBe(true);
    expect(groupByDistance(sorted, 1000).flatMap((g) => g.items)).toHaveLength(many.length);
  });
});

describe("grouping by city", () => {
  const cities = directoryCities(many);
  const groups = groupByCity(many, cities);
  it("orders the rows like the cities, the artists without a city last", () => {
    expect(groups.map((g) => g.city?.slug ?? null)).toEqual(["paris", "lyon", "marseille", "bordeaux", "lille", "nantes", null]);
  });
  it("caps a city's row and counts the rest; no artist without a city is hidden", () => {
    expect(groups[0]).toMatchObject({ total: 20 });
    expect(groups[0].items).toHaveLength(CITY_RAIL_SIZE);
    expect(groups[5].items).toHaveLength(4);
    expect(groups[6]).toMatchObject({ city: null, total: 4 });
    expect(groups[6].items).toHaveLength(4);
  });
  it("shows rows only beyond one page and two places", () => {
    expect(showsCityRows(many.length, groups.length)).toBe(true);
    expect(showsCityRows(DIRECTORY_PAGE_SIZE, 5)).toBe(false);
    expect(showsCityRows(40, 1)).toBe(false);
  });
});
