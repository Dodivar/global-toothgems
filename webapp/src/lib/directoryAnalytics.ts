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

export function trackDirectoryArtistOpened(position: number, sortedByDistance: boolean, via: "list" | "map") {
  captureEvent("artist_directory_artist_opened", { position, sorted_by_distance: sortedByDistance, via });
}
