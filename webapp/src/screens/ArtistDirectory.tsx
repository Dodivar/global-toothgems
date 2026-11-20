"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, BadgeCheck, ChevronDown, Images, LocateFixed, MapPin, Search, Sparkles, Store, X } from "lucide-react";
import { Button } from "../components/ui/Button";
import { DirectoryMap } from "../components/glowbook/DirectoryMap";
import { BookingCreationNotice } from "../components/glowbook/BookingCreationNotice";
import type { DirectoryMapPoint } from "../components/glowbook/DirectoryMapCanvas";
import { Link } from "../lib/navigation";
import { useResolve } from "../lib/navigation/hooks";
import {
  CITY_GROUPS_PAGE_SIZE,
  DIRECTORY_PAGE_SIZE,
  groupByCity,
  groupByDistance,
  matchListedCity,
  showsCityRows,
  shownDistance,
  sortByDistance,
  type ApproximateOrigin,
  type DirectoryCity,
  type DirectoryEntry,
  type DistanceBand,
  type OriginKind,
  type Point,
} from "../lib/glowbookDirectory";
import { geocoderSearchUrl, parseGeocoderResults } from "../lib/studioWorkspace/glowbookPlace";
import { GLOWBOOK_INTRO_PATH } from "../lib/studioUrl";
import { trackDirectoryArtistOpened, trackDirectorySearched, trackDirectoryViewed, type DirectorySearchOutcome } from "../lib/directoryAnalytics";

/**
 * "Find an artist near me" (decision 145): `/fr/artistes`, `/en/artists` and
 * the city pages. Mobile first, top to bottom: the search, the cities as
 * quick links, the map across the site's whole width (numbered bubbles where
 * artists are close together), then the artists.
 *
 * The list is sorted from where the visitor is, as precisely as we may know
 * it without asking (decision 145 (j), owner's request 2026-11-20):
 *
 *   - on the main page, the approximate area the host derives from the IP
 *     address, read by the server (`approxOrigin`), labelled as approximate
 *     and clearable — the same on the server and the first browser render;
 *   - the device's position when the visitor allowed it on an earlier visit
 *     (asked to the browser after hydration, never prompted on arrival);
 *   - "Near me" on a click, or a typed city, matched against the listed
 *     cities first; only an unknown one is looked up on OpenStreetMap's
 *     geocoder (one request per search, never as-you-type).
 *
 * The position never leaves the browser and is never stored. Sorted from a
 * place, the artists come in distance bands (< 10 km, 10–30, 30–100,
 * beyond), 12 at a time; without one, the main page shows one row per city
 * once there are more artists than a page, each row linking to its city page.
 * Distances are whole kilometres (an area is only known to ~1 km), and none
 * is printed from an IP guess.
 */

const SECTION_X = "px-4 sm:px-[clamp(16px,4vw,48px)]";

type Origin = Point & { label: string; kind: OriginKind };
type Status = { kind: "idle" } | { kind: "busy"; method: "city" | "nearMe" } | { kind: "error"; message: string };
type ShownArtist = DirectoryEntry & { distanceKm: number | null };
/** `list`: a compact row on phones (picture on the left), a card from 520 px; `rail`: always a card. */
type CardLayout = "list" | "rail";

export interface ArtistDirectoryProps {
  artists: DirectoryEntry[];
  cities: DirectoryCity[];
  /** The city page shown, or null for the whole directory. */
  city: DirectoryCity | null;
  /** The visitor's approximate area from the IP address (main page only), else null. */
  approxOrigin?: ApproximateOrigin | null;
}

const fromApprox = (approx: ApproximateOrigin | null | undefined): Origin | null =>
  approx ? { lat: approx.lat, lng: approx.lng, label: approx.label ?? "", kind: "approx" } : null;

export function ArtistDirectory({ artists, cities, city, approxOrigin = null }: ArtistDirectoryProps) {
  const { t, i18n } = useTranslation();
  const resolve = useResolve();
  const queryId = useId();
  const [query, setQuery] = useState("");
  const [origin, setOriginState] = useState<Origin | null>(() => fromApprox(approxOrigin));
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [visible, setVisible] = useState(DIRECTORY_PAGE_SIZE);
  const [cityRowsShown, setCityRowsShown] = useState(CITY_GROUPS_PAGE_SIZE);

  /** A new origin starts the list again from its first page. */
  const setOrigin = useCallback((next: Origin | null) => {
    setOriginState(next);
    setVisible(DIRECTORY_PAGE_SIZE);
  }, []);

  const originRef = useRef(origin);
  useEffect(() => {
    originRef.current = origin;
  }, [origin]);

  useEffect(() => {
    trackDirectoryViewed(city !== null, artists.length);
  }, [city, artists.length]);

  // The device's position, only when the visitor already allowed this site:
  // no prompt on arrival. It refines an IP guess, never a visitor's own search.
  useEffect(() => {
    if (artists.length < 2 || !("geolocation" in navigator) || !navigator.permissions?.query) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((permission) => {
        if (cancelled || permission.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (cancelled || (originRef.current && originRef.current.kind !== "approx")) return;
            setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude, label: "", kind: "nearMe" });
          },
          () => undefined,
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [artists.length, setOrigin]);

  const shown = useMemo(() => sortByDistance(artists, origin), [artists, origin]);
  const positionOf = useMemo(() => new Map(shown.map((a, i) => [a.handle, i + 1])), [shown]);
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
      })),
    [artists, resolve],
  );
  const openedOnMap = (handle: string) => trackDirectoryArtistOpened(positionOf.get(handle) ?? 0, origin !== null, "map");
  const openedInList = (handle: string) => trackDirectoryArtistOpened(positionOf.get(handle) ?? 0, origin !== null, "list");

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

  const sortedNote = !origin
    ? t("directory.sorted.name")
    : origin.kind === "nearMe"
      ? t("directory.sorted.nearMe")
      : origin.kind === "approx"
        ? origin.label
          ? t("directory.sorted.approx", { place: origin.label })
          : t("directory.sorted.approxUnknown")
        : t("directory.sorted.city", { place: origin.label });

  const cityGroups = useMemo(() => (city ? [] : groupByCity(shown, cities)), [city, shown, cities]);
  const mode: "distance" | "cities" | "grid" = origin ? "distance" : !city && showsCityRows(artists.length, cityGroups.length) ? "cities" : "grid";
  const bandTotals = useMemo(() => {
    const totals = new Map<DistanceBand, number>();
    for (const g of groupByDistance(shown, shown.length)) totals.set(g.band, g.items.length);
    return totals;
  }, [shown]);
  const showDistance = origin !== null && origin.kind !== "approx";
  const card = (layout: CardLayout) => (artist: ShownArtist) => (
    <ArtistCard key={artist.handle} artist={artist} layout={layout} showDistance={showDistance} onOpen={() => openedInList(artist.handle)} />
  );

  return (
    <div className="overflow-x-clip">
      {/* ---------------------------------------------------------------- Hero */}
      <section aria-labelledby="gt-directory-title" className={clsx("pb-6 pt-6 sm:pb-8 sm:pt-[clamp(28px,5vw,64px)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-4 sm:gap-5">
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
            className="m-0 max-w-[22ch] text-[clamp(30px,8vw,40px)] font-[var(--weight-black)] leading-[1.02] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)] sm:text-[length:var(--text-display-1)]"
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
            <form onSubmit={searchCity} role="search" aria-label={t("directory.search.label")} className="grid gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
              <div className="grid min-w-0 flex-1 gap-1.5 sm:max-w-[480px]">
                <label htmlFor={queryId} className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
                  {t("directory.search.label")}
                </label>
                <div className="flex gap-2">
                  <input
                    id={queryId}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("directory.search.placeholder")}
                    autoComplete="address-level2"
                    enterKeyHint="search"
                    maxLength={120}
                    className="h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-4 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)] sm:text-sm"
                  />
                  <Button
                    type="submit"
                    variant="dark"
                    iconLeft={Search}
                    loading={status.kind === "busy" && status.method === "city"}
                    disabled={query.trim().length < 2}
                    className="w-11 flex-none !px-0 sm:w-auto sm:!px-[22px]"
                  >
                    <span className="sr-only sm:not-sr-only">{t("directory.search.submit")}</span>
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                iconLeft={LocateFixed}
                onClick={nearMe}
                loading={status.kind === "busy" && status.method === "nearMe"}
                className="w-full sm:w-auto"
              >
                {t("directory.nearMe.button")}
              </Button>
            </form>
          )}

          {cities.length > 0 && <CityLinks cities={cities} current={city} />}
          {artists.length > 1 && (
            <details className="group text-[12px] leading-relaxed text-[var(--text-subtle)]">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-semibold text-[var(--text-muted)] underline underline-offset-2 [&::-webkit-details-marker]:hidden">
                {t("directory.privacySummary")}
                <ChevronDown size={13} aria-hidden="true" className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <p className="m-0 mt-1.5 max-w-[70ch]">{t("directory.privacyNote")}</p>
            </details>
          )}
        </div>
      </section>

      {/* ------------------------------------------------- Map, full width */}
      {artists.length > 0 && (
        <section aria-labelledby="gt-directory-map" className="pb-8">
          <div className={clsx("mx-auto flex max-w-[var(--max-width-content)] flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3", SECTION_X, "sm:box-content")}>
            <h2 id="gt-directory-map" className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)]">
              {t("directory.map.title")}
            </h2>
            <a href="#gt-directory-results" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--text-primary)] underline underline-offset-2">
              {t("directory.map.toList")}
              <ChevronDown size={14} aria-hidden="true" />
            </a>
          </div>
          <DirectoryMap
            points={points}
            focus={origin}
            onOpen={openedOnMap}
            frameClassName="h-[min(56vh,440px)] w-full border-y border-[var(--border-subtle)] md:h-[min(68vh,560px)]"
          />
          <p className={clsx("mx-auto my-0 max-w-[var(--max-width-content)] pt-2 text-[12px] text-[var(--text-subtle)]", SECTION_X, "sm:box-content")}>{t("directory.map.note")}</p>
        </section>
      )}

      {/* ---------------------------------------------------------------- List */}
      <section aria-labelledby="gt-directory-results" className={clsx("scroll-mt-24 pb-[var(--section-y)]", SECTION_X)}>
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-5">
          <div className="grid gap-1 sm:flex sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-2">
            <h2 id="gt-directory-results" className="m-0 scroll-mt-24 text-[length:var(--text-h4)] font-[var(--weight-black)]">
              {t("directory.results", { count: artists.length })}
            </h2>
            <p role="status" aria-live="polite" className="m-0 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
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
          ) : mode === "distance" ? (
            <>
              <div className="grid gap-7">
                {groupByDistance(shown, visible).map((group) => (
                  <GroupBlock key={group.band} title={t(`directory.groups.band.${group.band}`)} count={bandTotals.get(group.band) ?? group.items.length}>
                    <CardGrid>{group.items.map(card("list"))}</CardGrid>
                  </GroupBlock>
                ))}
              </div>
              <ShowMore shown={Math.min(visible, shown.length)} total={shown.length} onMore={() => setVisible((v) => v + DIRECTORY_PAGE_SIZE)} />
            </>
          ) : mode === "cities" ? (
            <>
              <div className="grid gap-8">
                {cityGroups.slice(0, cityRowsShown).map((group) => (
                  <GroupBlock
                    key={group.city?.slug ?? "other"}
                    title={group.city ? group.city.name : t("directory.groups.other")}
                    count={group.total}
                    action={
                      group.city && (
                        <Link
                          to={`/artistes/${group.city.slug}`}
                          className="inline-flex flex-none items-center gap-1 text-[13px] font-bold text-[var(--text-primary)] underline-offset-2 hover:underline"
                        >
                          {group.total > group.items.length ? t("directory.groups.seeAll", { count: group.total }) : t("directory.groups.cityPage")}
                          <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                      )
                    }
                  >
                    <CardRail>{group.items.map(card("rail"))}</CardRail>
                  </GroupBlock>
                ))}
              </div>
              {cityRowsShown < cityGroups.length && (
                <div className="flex justify-center">
                  <Button type="button" variant="outline" iconLeft={ChevronDown} onClick={() => setCityRowsShown((n) => n + CITY_GROUPS_PAGE_SIZE)}>
                    {t("directory.more.cities", { count: cityGroups.length - cityRowsShown })}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <CardGrid>{shown.slice(0, visible).map(card("list"))}</CardGrid>
              <ShowMore shown={Math.min(visible, shown.length)} total={shown.length} onMore={() => setVisible((v) => v + DIRECTORY_PAGE_SIZE)} />
            </>
          )}

          <ArtistsBand />
        </div>
      </section>
    </div>
  );
}

/** The cities as quick links: one scrolling row on phones, wrapped on larger screens. */
function CityLinks({ cities, current }: { cities: DirectoryCity[]; current: DirectoryCity | null }) {
  const { t } = useTranslation();
  return (
    <nav aria-labelledby="gt-directory-cities" className="grid gap-2">
      <h2 id="gt-directory-cities" className="m-0 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
        {t("directory.cities.title")}
      </h2>
      <ul className="-mx-4 m-0 flex list-none gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        {cities.map((c) => (
          <li key={c.slug} className="flex-none">
            <Link
              to={`/artistes/${c.slug}`}
              aria-current={current?.slug === c.slug ? "page" : undefined}
              className={clsx(
                "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] border px-4 text-[13px] font-semibold",
                current?.slug === c.slug
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
  );
}

function GroupBlock({ title, count, action, children }: { title: string; count: number; action?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <div className="flex items-center gap-3">
        <h3 id={id} className="m-0 flex min-w-0 items-baseline gap-2 text-[length:var(--text-body-lg,17px)] font-[var(--weight-black)] text-[var(--gt-ink-900)]">
          <span className="truncate">{title}</span>
          <span className="flex-none text-[13px] font-semibold text-[var(--text-muted)]">{t("directory.groups.count", { count })}</span>
        </h3>
        <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-[var(--border-subtle)]" />
        {action}
      </div>
      {children}
    </section>
  );
}

function CardGrid({ children }: { children: ReactNode }) {
  return <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 min-[520px]:grid-cols-2 min-[520px]:gap-4 lg:grid-cols-3">{children}</ul>;
}

/** A city's row: swiped sideways on phones (the next card peeks in), a grid from tablets up. */
function CardRail({ children }: { children: ReactNode }) {
  return (
    <ul className="-mx-4 m-0 flex list-none snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden [&>li]:w-[min(78%,300px)] [&>li]:flex-none [&>li]:snap-start sm:[&>li]:w-auto">
      {children}
    </ul>
  );
}

function ShowMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  const { t } = useTranslation();
  if (shown >= total) return null;
  return (
    <div className="grid justify-items-center gap-2">
      <p className="m-0 text-[12.5px] text-[var(--text-muted)]">{t("directory.more.progress", { shown, total })}</p>
      <Button type="button" variant="outline" iconLeft={ChevronDown} onClick={onMore}>
        {t("directory.more.button")}
      </Button>
    </div>
  );
}

function ArtistCard({ artist, layout, showDistance, onOpen }: { artist: ShownArtist; layout: CardLayout; showDistance: boolean; onOpen: () => void }) {
  const { t } = useTranslation();
  const distance = !showDistance || artist.distanceKm === null ? null : shownDistance(artist.distanceKm);
  const area = artist.place.mode === "area";
  const row = layout === "list";
  // In a list on phones the card is a row: the picture on the left, no avatar or bio.
  return (
    <li className="min-w-0">
      <Link
        to={`/glowbook/${artist.handle}`}
        onClick={onOpen}
        className={clsx(
          "group grid h-full overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] transition-shadow hover:shadow-[var(--shadow-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
          row ? "grid-cols-[112px_1fr] min-[520px]:grid-cols-1 min-[520px]:grid-rows-[auto_1fr]" : "grid-rows-[auto_1fr]",
        )}
      >
        <span className={clsx("relative block bg-[var(--surface-sunken)]", row ? "min-h-[112px] min-[520px]:aspect-[4/3] min-[520px]:min-h-0" : "aspect-[4/3]")}>
          <span className="absolute inset-0 overflow-hidden">
            {artist.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, sized by its frame
              <img src={artist.coverUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
            ) : (
              <span aria-hidden="true" className="grid h-full w-full place-items-center text-[var(--text-subtle)]">
                <Sparkles size={26} />
              </span>
            )}
          </span>
          {distance && (
            <span className={clsx("absolute rounded-[var(--radius-pill)] bg-white/90 font-bold text-[var(--gt-ink-900)] backdrop-blur", row ? "left-2 top-2 px-2 py-0.5 text-[11px] min-[520px]:left-3 min-[520px]:top-3 min-[520px]:px-2.5 min-[520px]:py-1 min-[520px]:text-[12px]" : "left-3 top-3 px-2.5 py-1 text-[12px]")}>
              {distance.under
                ? t(area ? "directory.distance.aboutOne" : "directory.distance.underOne")
                : t(area ? "directory.distance.about" : "directory.distance.km", { km: distance.km })}
            </span>
          )}
          {artist.certified && (
            <span className={clsx("absolute right-3 top-3 items-center gap-1 rounded-[var(--radius-pill)] bg-white/90 px-2 py-1 text-[11.5px] font-bold text-[var(--gt-blue-700)] backdrop-blur", row ? "hidden min-[520px]:inline-flex" : "inline-flex")}>
              <BadgeCheck size={13} aria-hidden="true" />
              {t("directory.card.certified")}
            </span>
          )}
          <span className={clsx("absolute -bottom-5 left-4", row && "hidden min-[520px]:block")}>
            {artist.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
              <img src={artist.avatarUrl} alt="" loading="lazy" className="h-11 w-11 rounded-full object-cover ring-[3px] ring-[var(--surface-card)]" />
            ) : (
              <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-brand)] text-[16px] font-black text-[var(--gt-ink-900)] ring-[3px] ring-[var(--surface-card)]">
                {artist.displayName.slice(0, 1).toUpperCase()}
              </span>
            )}
          </span>
        </span>
        <span className={clsx("grid min-w-0 content-start gap-1.5", row ? "px-3 py-3 min-[520px]:px-4 min-[520px]:pb-4 min-[520px]:pt-7" : "px-4 pb-4 pt-7")}>
          <span className="grid min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[length:var(--text-body-md)] font-[var(--weight-black)] text-[var(--gt-ink-900)] group-hover:underline">{artist.displayName}</span>
              {artist.certified && row && (
                <BadgeCheck size={15} role="img" aria-label={t("directory.card.certified")} className="flex-none text-[var(--gt-blue-700)] min-[520px]:hidden" />
              )}
            </span>
            {artist.location && <span className="truncate text-[12.5px] text-[var(--text-muted)]">{artist.location}</span>}
          </span>
          <span className="inline-flex min-w-0 items-start gap-1.5 text-[13px] text-[var(--text-body)]">
            {area ? <MapPin size={14} aria-hidden="true" className="mt-0.5 flex-none" /> : <Store size={14} aria-hidden="true" className="mt-0.5 flex-none" />}
            <span className="line-clamp-1 min-w-0">{t(area ? "directory.card.area" : "directory.card.salon", { place: artist.place.label })}</span>
          </span>
          {artist.bio && <span className={clsx("line-clamp-2 text-[13px] text-[var(--text-muted)]", row && "hidden min-[520px]:[display:-webkit-box]")}>{artist.bio}</span>}
          <span className="mt-auto flex items-center gap-2 pt-1 text-[12px]">
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
