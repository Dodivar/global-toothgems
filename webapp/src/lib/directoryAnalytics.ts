import { captureEvent, captureOnce } from "./analyticsCore";

/**
 * The artist directory's product analytics (decision 145), facts only:
 * counts, booleans and outcomes — never the text searched, the visitor's
 * position or a distance. Consent and the never-in-the-way rule come from
 * `analyticsCore.ts`. Listed in `docs/studio-trial-analytics.md`.
 */

export function trackDirectoryViewed(cityPage: boolean, artistCount: number) {
  captureOnce(`gt-directory-evt:viewed:${cityPage ? "city" : "all"}`, "artist_directory_viewed", { city_page: cityPage, artist_count: artistCount });
}

export type DirectorySearchOutcome = "ok" | "not_found" | "denied" | "unavailable" | "failed";

export function trackDirectorySearched(method: "city" | "near_me", outcome: DirectorySearchOutcome, listedCity = false) {
  captureEvent("artist_directory_searched", { method, outcome, listed_city: listedCity });
}

/** Where the list was sorted from when a card was opened: the IP area, the device, a typed city, or nothing (by name). */
export type DirectorySortOrigin = "approx" | "device" | "city" | "none";

export function trackDirectoryArtistOpened(position: number, origin: DirectorySortOrigin, via: "list" | "map") {
  captureEvent("artist_directory_artist_opened", { position, sorted_by_distance: origin !== "none", sort_origin: origin, via });
}
