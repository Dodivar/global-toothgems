import { describe, expect, it } from "vitest";
import {
  AREA_RADIUS_METERS,
  circleRing,
  directionsLinks,
  geocoderSearchUrl,
  parseGeocoderResults,
  placeFromCandidate,
  placeFromJson,
  roundPlace,
  samePlace,
  validatePlace,
  type GlowbookPlace,
} from "./glowbookPlace";
import { DEFAULT_LOOK, lookFromColumns, lookPatch, validateLook } from "./glowbookLook";

const salon: GlowbookPlace = { mode: "exact", label: "12 rue de la Paix, Lyon", lat: 45.74831, lng: 4.84269 };

describe("placeFromJson", () => {
  it("reads the public JSON and a row's columns (numeric columns may be strings)", () => {
    expect(placeFromJson({ place: { mode: "exact", label: salon.label, lat: 45.74831, lng: 4.84269 } })).toEqual(salon);
    expect(placeFromJson({ place_mode: "area", place_label: "Lyon 7e", place_lat: "45.75", place_lng: "4.84" })).toEqual({
      mode: "area",
      label: "Lyon 7e",
      lat: 45.75,
      lng: 4.84,
    });
  });
  it("is null when incomplete or unknown", () => {
    expect(placeFromJson(null)).toBeNull();
    expect(placeFromJson({ place: null })).toBeNull();
    expect(placeFromJson({ place_mode: "home", place_label: "Lyon", place_lat: 1, place_lng: 1 })).toBeNull();
    expect(placeFromJson({ place_mode: "area", place_label: " ", place_lat: 1, place_lng: 1 })).toBeNull();
    expect(placeFromJson({ place_mode: "area", place_label: "Lyon", place_lat: null, place_lng: 1 })).toBeNull();
  });
});

describe("roundPlace / validatePlace", () => {
  it("rounds an area to ~1 km and a salon to ~1 m, like the database", () => {
    expect(roundPlace({ mode: "area", label: " Lyon ", lat: 45.748312, lng: 4.842687 })).toEqual({ mode: "area", label: "Lyon", lat: 45.75, lng: 4.84 });
    expect(roundPlace({ ...salon, lat: 45.7483123, lng: 4.8426871 })).toEqual(salon);
  });
  it("refuses a short or long name and impossible coordinates", () => {
    expect(validatePlace(null)).toBeNull();
    expect(validatePlace(salon)).toBeNull();
    expect(validatePlace({ ...salon, label: " x " })).toBe("placeLabel");
    expect(validatePlace({ ...salon, label: "x".repeat(121) })).toBe("placeLabel");
    expect(validatePlace({ ...salon, lat: 91 })).toBe("placeCoordinates");
    expect(validatePlace({ ...salon, lng: Number.NaN })).toBe("placeCoordinates");
    expect(validateLook({ ...DEFAULT_LOOK, place: { ...salon, label: "" } })).toBe("placeLabel");
  });
});

describe("directionsLinks", () => {
  it("opens Google Maps, Apple Maps and OpenStreetMap on a salon", () => {
    const links = directionsLinks(salon);
    expect(links.map((l) => l.app)).toEqual(["google", "apple", "osm"]);
    expect(links[0].href).toBe("https://www.google.com/maps/dir/?api=1&destination=45.74831%2C4.84269");
    expect(links[1].href).toBe("https://maps.apple.com/?daddr=45.74831%2C4.84269&q=12%20rue%20de%20la%20Paix%2C%20Lyon");
    expect(links[2].href).toBe("https://www.openstreetmap.org/?mlat=45.74831&mlon=4.84269#map=17/45.74831/4.84269");
  });
  it("gives none for an area: there is no door to go to", () => {
    expect(directionsLinks({ mode: "area", label: "Lyon", lat: 45.75, lng: 4.84 })).toEqual([]);
  });
});

describe("address search", () => {
  it("asks Nominatim once, in the artist's language", () => {
    expect(geocoderSearchUrl(" Lyon 7e ", "fr")).toBe(
      "https://nominatim.openstreetmap.org/search?q=Lyon+7e&format=jsonv2&addressdetails=1&limit=5&accept-language=fr",
    );
  });
  it("reads results, naming an area by district and town, and drops malformed ones", () => {
    const results = parseGeocoderResults([
      { lat: "45.7483", lon: "4.8427", display_name: "12, Rue de la Paix, Lyon 7e, Lyon, France", address: { suburb: "Lyon 7e", city: "Lyon" } },
      { lat: "48.85", lon: "2.35", display_name: "Paris, France", address: { city: "Paris" } },
      { lat: "x", lon: "2", display_name: "Broken" },
      { lat: "91", lon: "2", display_name: "Off the globe" },
      null,
    ]);
    expect(results).toEqual([
      { label: "12, Rue de la Paix, Lyon 7e, Lyon, France", area: "Lyon 7e, Lyon", lat: 45.7483, lng: 4.8427 },
      { label: "Paris, France", area: "Paris", lat: 48.85, lng: 2.35 },
    ]);
    expect(parseGeocoderResults({ error: "x" })).toEqual([]);
  });
  it("keeps only the district's name for an area, never the street", () => {
    const candidate = { label: "12, Rue de la Paix, Lyon 7e, Lyon, France", area: "Lyon 7e, Lyon", lat: 45.748312, lng: 4.842687 };
    expect(placeFromCandidate(candidate, "area")).toEqual({ mode: "area", label: "Lyon 7e, Lyon", lat: 45.75, lng: 4.84 });
    expect(placeFromCandidate(candidate, "exact")).toEqual({ mode: "exact", label: candidate.label, lat: 45.74831, lng: 4.84269 });
  });
});

describe("the look carries the place", () => {
  it("reads it from a row and sends it whole when it changes", () => {
    const look = lookFromColumns({ place_mode: "exact", place_label: salon.label, place_lat: 45.74831, place_lng: 4.84269 });
    expect(look.place).toEqual(salon);
    expect(lookPatch(look, { ...look })).toEqual({});
    expect(lookPatch(look, { ...look, place: { ...salon, lat: 45.7484 } })).toEqual({ place: { ...salon, lat: 45.7484 } });
    expect(lookPatch(look, { ...look, place: null })).toEqual({ place: null });
    expect(samePlace(salon, { ...salon })).toBe(true);
  });
});

describe("circleRing", () => {
  it("draws a closed ring the right distance away", () => {
    const ring = circleRing(45.75, 4.84, AREA_RADIUS_METERS, 16);
    expect(ring).toHaveLength(17);
    expect(ring[0]).toEqual(ring[16]);
    const north = ring[4];
    expect((north[1] - 45.75) * 111_195).toBeCloseTo(AREA_RADIUS_METERS, -1);
  });
});
