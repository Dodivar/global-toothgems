"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, BadgeCheck, Images, LocateFixed, MapPin, Search, Sparkles, Store, X } from "lucide-react";
import { Button } from "../components/ui/Button";
import { DirectoryMap } from "../components/glowbook/DirectoryMap";
import { BookingCreationNotice } from "../components/glowbook/BookingCreationNotice";
import type { DirectoryMapPoint } from "../components/glowbook/DirectoryMapCanvas";
import { Link } from "../lib/navigation";
import { useResolve } from "../lib/navigation/hooks";
import { matchListedCity, shownDistance, sortByDistance, type DirectoryCity, type DirectoryEntry, type Point } from "../lib/glowbookDirectory";
import { geocoderSearchUrl, parseGeocoderResults } from "../lib/studioWorkspace/glowbookPlace";
import { GLOWBOOK_INTRO_PATH } from "../lib/studioUrl";
import { trackDirectoryArtistOpened, trackDirectorySearched, trackDirectoryViewed, type DirectorySearchOutcome } from "../lib/directoryAnalytics";

/**
 * "Find an artist near me" (decision 145): `/fr/artistes`, `/en/artists` and
 * the city pages. The list is rendered on the server, by name, and is the way
 * to browse; the map below repeats it and loads as the visitor scrolls near
 * it (like the Glowbook's). Sorting by distance happens in the browser only:
 *
 *   - "Near me" asks the browser for the position on a click, never stores or
 *     sends it (not even to our analytics);
 *   - a typed city is matched against the cities already listed first; only
 *     an unknown one is looked up on OpenStreetMap's geocoder (one request
 *     per search, never as-you-type, as its usage policy requires).
 *
 * Distances are whole kilometres: an area is only known to ~1 km.
 */

const SECTION_X = "px-4 sm:px-[clamp(16px,4vw,48px)]";

type Origin = Point & { label: string; kind: "city" | "nearMe" };
type Status = { kind: "idle" } | { kind: "busy"; method: "city" | "nearMe" } | { kind: "error"; message: string };

export interface ArtistDirectoryProps {
  artists: DirectoryEntry[];
  cities: DirectoryCity[];
  /** The city page shown, or null for the whole directory. */
  city: DirectoryCity | null;
}

export function ArtistDirectory({ artists, cities, city }: ArtistDirectoryProps) {
  const { t, i18n } = useTranslation();
  const resolve = useResolve();
  const queryId = useId();
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    trackDirectoryViewed(city !== null, artists.length);
  }, [city, artists.length]);

  const shown = useMemo(() => sortByDistance(artists, origin), [artists, origin]);
  const points = useMemo<DirectoryMapPoint[]>(
    () =>
      artists.map((a) => ({
        handle: a.handle,
        name: a.displayName,
        place: a.place,
        href: resolve(`/glowbook/${a.handle}`),
        avatarUrl: a.avatarUrl,
        certified: a.certified,
        creationCount: a.creationCount,
        onOpen: () => trackDirectoryArtistOpened(shown.findIndex((s) => s.handle === a.handle) + 1, origin !== null, "map"),
      })),
    [artists, resolve, shown, origin],
  );

  const fail = (method: "city" | "near_me", outcome: DirectorySearchOutcome, key: string) => {
    trackDirectorySearched(method, outcome);
    setStatus({ kind: "error", message: t(key) });
  };

  const searchCity = async (e: FormEvent) => {
    e.preventDefault();
    const text = query.trim();
    if (text.length < 2) return;
    const listed = matchListedCity(text, artists);
    if (listed) {
      trackDirectorySearched("city", "ok", true);
      setOrigin({ lat: listed.lat, lng: listed.lng, label: text, kind: "city" });
      setStatus({ kind: "idle" });
      return;
    }
    setStatus({ kind: "busy", method: "city" });
    try {
      const response = await fetch(geocoderSearchUrl(text, i18n.language.startsWith("en") ? "en" : "fr"), { headers: { Accept: "application/json" } });
      if (!response.ok) return fail("city", "failed", "directory.search.failed");
      const [first] = parseGeocoderResults(await response.json());
      if (!first) return fail("city", "not_found", "directory.search.notFound");
      trackDirectorySearched("city", "ok", false);
      setOrigin({ lat: first.lat, lng: first.lng, label: first.area ?? text, kind: "city" });
      setStatus({ kind: "idle" });
    } catch {
      fail("city", "failed", "directory.search.failed");
    }
  };

  const nearMe = () => {
    if (!("geolocation" in navigator)) return fail("near_me", "unavailable", "directory.nearMe.unavailable");
    setStatus({ kind: "busy", method: "nearMe" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        trackDirectorySearched("near_me", "ok");
        setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude, label: "", kind: "nearMe" });
        setStatus({ kind: "idle" });
      },
      (error) =>
        error.code === error.PERMISSION_DENIED
          ? fail("near_me", "denied", "directory.nearMe.denied")
          : fail("near_me", "failed", "directory.nearMe.failed"),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  };

  const clear = () => {
    setOrigin(null);
    setQuery("");
    setStatus({ kind: "idle" });
  };

  const sortedNote = origin
    ? origin.kind === "nearMe"
      ? t("directory.sorted.nearMe")
      : t("directory.sorted.city", { place: origin.label })
    : t("directory.sorted.name");

  return (
    <div className="overflow-x-clip">
      {/* ---------------------------------------------------------------- Hero */}
      <section aria-labelledby="gt-directory-title" className={clsx("pb-8 pt-6 sm:pt-[clamp(28px,5vw,64px)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-5">
          {city && (
            <Link
              to="/artistes"
              className="inline-flex w-fit items-center gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              {t("directory.city.back")}
            </Link>
          )}
          <span className="gt-eyebrow">{t("directory.eyebrow")}</span>
          <h1
            id="gt-directory-title"
            className="m-0 max-w-[22ch] text-[clamp(32px,8vw,40px)] font-[var(--weight-black)] leading-[1.02] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)] sm:text-[length:var(--text-display-1)]"
          >
            {city ? t("directory.city.title", { city: city.name }) : t("directory.title")}
          </h1>
          {city && (
            <p className="m-0 max-w-[60ch] text-[length:var(--text-body-md)] text-[var(--text-body)]">
              {t("directory.city.intro", { count: city.count, city: city.name })}
            </p>
          )}
          {/* Come from the Studio with a creation to have made (decision 149). */}
          <BookingCreationNotice />

          {artists.length > 1 && (
            <form onSubmit={searchCity} role="search" aria-label={t("directory.search.label")} className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
              <label htmlFor={queryId} className="grid min-w-0 flex-1 gap-1.5 sm:max-w-[420px]">
                <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">{t("directory.search.label")}</span>
                <input
                  id={queryId}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("directory.search.placeholder")}
                  autoComplete="address-level2"
                  maxLength={120}
                  className="h-11 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-4 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)]"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="dark" iconLeft={Search} loading={status.kind === "busy" && status.method === "city"} disabled={query.trim().length < 2}>
                  {t("directory.search.submit")}
                </Button>
                <Button type="button" variant="outline" iconLeft={LocateFixed} onClick={nearMe} loading={status.kind === "busy" && status.method === "nearMe"}>
                  {t("directory.nearMe.button")}
                </Button>
              </div>
            </form>
          )}
          {artists.length > 1 && <p className="m-0 text-[12px] text-[var(--text-subtle)]">{t("directory.privacyNote")}</p>}
        </div>
      </section>

      {/* ---------------------------------------------------------------- List */}
      <section aria-labelledby="gt-directory-results" className={clsx("pb-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="gt-directory-results" className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)]">
              {t("directory.results", { count: artists.length })}
            </h2>
            <p role="status" aria-live="polite" className="m-0 inline-flex items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {status.kind === "error" ? <span className="text-[var(--status-error-fg)]">{status.message}</span> : artists.length > 1 && sortedNote}
              {origin && (
                <button type="button" onClick={clear} className="inline-flex items-center gap-1 font-semibold text-[var(--text-primary)] underline underline-offset-2">
                  <X size={14} aria-hidden="true" />
                  {t("directory.sorted.clear")}
                </button>
              )}
            </p>
          </div>

          {artists.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((artist, index) => (
                <ArtistCard key={artist.handle} artist={artist} onOpen={() => trackDirectoryArtistOpened(index + 1, origin !== null, "list")} />
              ))}
            </ul>
          )}

          {artists.length > 0 && (
            <div className="grid gap-2">
              <h2 className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)]">{t("directory.map.title")}</h2>
              <DirectoryMap points={points} focus={origin} />
              <p className="m-0 text-[12px] text-[var(--text-subtle)]">{t("directory.map.note")}</p>
            </div>
          )}

          {cities.length > 0 && (
            <nav aria-labelledby="gt-directory-cities" className="grid gap-3">
              <h2 id="gt-directory-cities" className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)]">
                {t("directory.cities.title")}
              </h2>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {cities.map((c) => (
                  <li key={c.slug}>
                    <Link
                      to={`/artistes/${c.slug}`}
                      aria-current={city?.slug === c.slug ? "page" : undefined}
                      className={clsx(
                        "inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] border px-4 text-[13px] font-semibold",
                        city?.slug === c.slug
                          ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--gt-white)]"
                          : "border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:border-[var(--border-strong)]",
                      )}
                    >
                      <MapPin size={13} aria-hidden="true" />
                      {t("directory.cities.item", { city: c.name, count: c.count })}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <ArtistsBand />
        </div>
      </section>
    </div>
  );
}

function ArtistCard({ artist, onOpen }: { artist: DirectoryEntry & { distanceKm: number | null }; onOpen: () => void }) {
  const { t } = useTranslation();
  const distance = artist.distanceKm === null ? null : shownDistance(artist.distanceKm);
  const area = artist.place.mode === "area";
  return (
    <li className="min-w-0">
      <Link
        to={`/glowbook/${artist.handle}`}
        onClick={onOpen}
        className="group grid h-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] transition-shadow hover:shadow-[var(--shadow-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <span className="relative block aspect-[4/3] bg-[var(--surface-sunken)]">
          {artist.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, sized by its frame
            <img src={artist.coverUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true" className="grid h-full w-full place-items-center text-[var(--text-subtle)]">
              <Sparkles size={26} />
            </span>
          )}
          {distance && (
            <span className="absolute left-3 top-3 rounded-[var(--radius-pill)] bg-white/90 px-2.5 py-1 text-[12px] font-bold text-[var(--gt-ink-900)] backdrop-blur">
              {distance.under
                ? t(area ? "directory.distance.aboutOne" : "directory.distance.underOne")
                : t(area ? "directory.distance.about" : "directory.distance.km", { km: distance.km })}
            </span>
          )}
        </span>
        <span className="grid content-start gap-2 p-4">
          <span className="flex items-center gap-3">
            {artist.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
              <img src={artist.avatarUrl} alt="" loading="lazy" className="h-10 w-10 flex-none rounded-full object-cover" />
            ) : (
              <span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--surface-brand)] text-[15px] font-black text-[var(--gt-ink-900)]">
                {artist.displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="grid min-w-0">
              <span className="truncate text-[length:var(--text-body-md)] font-[var(--weight-black)] text-[var(--gt-ink-900)] group-hover:underline">{artist.displayName}</span>
              {artist.location && <span className="truncate text-[12.5px] text-[var(--text-muted)]">{artist.location}</span>}
            </span>
          </span>
          <span className="inline-flex items-start gap-1.5 text-[13px] text-[var(--text-body)]">
            {area ? <MapPin size={14} aria-hidden="true" className="mt-0.5 flex-none" /> : <Store size={14} aria-hidden="true" className="mt-0.5 flex-none" />}
            <span className="min-w-0">
              {t(area ? "directory.card.area" : "directory.card.salon", { place: artist.place.label })}
            </span>
          </span>
          {artist.bio && <span className="line-clamp-2 text-[13px] text-[var(--text-muted)]">{artist.bio}</span>}
          <span className="flex flex-wrap items-center gap-2 pt-1 text-[12px]">
            {artist.certified && (
              <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] px-2 py-0.5 font-bold text-[var(--gt-blue-700)]">
                <BadgeCheck size={13} aria-hidden="true" />
                {t("directory.card.certified")}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
              <Images size={13} aria-hidden="true" />
              {t("directory.card.creations", { count: artist.creationCount })}
            </span>
            <span className="ml-auto inline-flex items-center gap-1 font-bold text-[var(--text-primary)]">
              {t("directory.card.open")}
              <ArrowRight size={13} aria-hidden="true" />
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="grid justify-items-start gap-2 rounded-[var(--radius-xl)] border border-dashed border-[var(--border-default)] p-6">
      <MapPin size={22} aria-hidden="true" className="text-[var(--text-subtle)]" />
      <p className="m-0 text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">{t("directory.empty.title")}</p>
      <p className="m-0 max-w-[60ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("directory.empty.body")}</p>
    </div>
  );
}

function ArtistsBand() {
  const { t } = useTranslation();
  return (
    <aside aria-labelledby="gt-directory-artists" className="grid gap-3 rounded-[var(--radius-xl)] bg-[var(--surface-brand)] p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div className="grid gap-1">
        <h2 id="gt-directory-artists" className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)] text-[var(--gt-ink-900)]">
          {t("directory.artists.title")}
        </h2>
        <p className="m-0 max-w-[60ch] text-[length:var(--text-body-sm)] text-[var(--gt-ink-800)]">{t("directory.artists.body")}</p>
      </div>
      <Link
        to={GLOWBOOK_INTRO_PATH}
        className="inline-flex h-11 w-fit flex-none items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--surface-inverse)] px-5 text-[13px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-inverse)]"
      >
        {t("directory.artists.cta")}
        <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </aside>
  );
}
