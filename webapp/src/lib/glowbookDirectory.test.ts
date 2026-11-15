import { describe, expect, it } from "vitest";
import {
  centreOf,
  citySlug,
  directoryCities,
  distanceKm,
  matchListedCity,
  shownDistance,
  sortByDistance,
  toDirectoryArtists,
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
