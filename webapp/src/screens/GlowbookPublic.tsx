"use client";

import { useCallback, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Box, CalendarCheck, Gem, Star } from "lucide-react";
import clsx from "clsx";
import { GlowbookProfile, GlowbookTopBar } from "../components/glowbook/GlowbookIdentity";
import { GlowbookPlaceSection } from "../components/glowbook/GlowbookPlaceSection";
import { BookingDialog, type BookableItem } from "../components/glowbook/BookingDialog";
import { CreationViewer } from "../components/glowbook/CreationViewer";
import { useBookingReturn } from "../components/glowbook/useBookingReturn";
import { SpotlightVideo } from "../components/glowbook/SpotlightVideo";
import { glowbookThemeStyle } from "../components/glowbook/theme";
import { DEFAULT_LOOK } from "../lib/studioWorkspace/glowbookLook";
import { certifiedTitles, visibleCreations, type SectionFilter } from "../lib/studioWorkspace/glowbookSections";
import { Link } from "../lib/navigation";
import type { PublicGlowbookPage } from "../lib/studioWorkspace/serverGlowbook";
import { glowbookCreationPath, STUDIO_PATH } from "../lib/studioUrl";

/**
 * An artist's Glowbook (decisions 99, 100 and 103): their chosen Studio
 * creations, read only, behind the link in their Instagram bio, every page
 * in the same colours (decision 150: no colour, background or layout of the
 * artist's any more). The page opens on the work: a slim identity bar, then the
 * creation in the spotlight turning in a short video (its still render until
 * the artist's Studio has recorded it) — edge to edge on phones, its name and
 * buttons laid over the bottom of the picture —, then the others as
 * picture-first cards; the full profile — bio, badge, booking — closes the
 * page, one tap away from the bar. Everything shown was approved by a
 * moderator; the server reads it on every request.
 *
 * Decision 151: a card opens the creations full screen, swiped like stories
 * (`CreationViewer`; the card stays a link to the 3D view for a new tab or
 * without JavaScript); each creation can be booked as it is ("Book this
 * design", the same booking dialog, which keeps the creation through the
 * sign-in round trip) or opened in 3D, where its gems go to the cart. On
 * phones a "Book" bar stays at the bottom of the screen while the page
 * scrolls (sticky, so it stops before the site's footer). The artist's
 * sections filter the creations (decision 102; "all" first, so the server
 * and the first browser render agree), one scrolling row on phones. Where the
 * artist works closes the profile (decision 108).
 * Rendered on the server and hydrated: nothing here reads the browser during render.
 */
type Item = PublicGlowbookPage["items"][number];

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gb-accent)]";

export function GlowbookPublic({ glowbook }: { glowbook: PublicGlowbookPage }) {
  const { t, i18n } = useTranslation();
  const look = glowbook.look;
  const [filter, setFilter] = useState<SectionFilter>("all");
  // The calendar (decision 144): open only when the server said the page takes bookings now.
  // null until the visitor opens or closes it: back from signing in, it opens by itself.
  const [opened, setBooking] = useState<boolean | null>(null);
  // The creation being booked ("Book this design"); null: a design of the visitor's own; undefined: not chosen here.
  const [bookFor, setBookFor] = useState<BookableItem | null | undefined>(undefined);
  const [viewer, setViewer] = useState<number | null>(null);
  const closeViewer = useCallback(() => setViewer(null), []);
  const bookable = glowbook.booking !== null;
  const book = (creation: BookableItem | null) => {
    setBookFor(creation);
    setBooking(true);
  };
  const onBook = bookable ? () => book(null) : undefined;
  // Back from signing in with a design and an hour chosen: the dialog opens again on them.
  const back = useBookingReturn(bookable);
  const booking = opened ?? back !== null;
  const returned = back?.itemId ? glowbook.items.find((i) => i.id === back.itemId) : undefined;
  const creation = bookFor !== undefined ? bookFor : returned ? { id: returned.id, name: returned.name } : null;
  const { featured, others, filter: active } = visibleCreations(glowbook.items, glowbook.sections, look?.featuredItemId ?? null, filter);
  // The viewer swipes through what the page shows, in its order.
  const shown = featured ? [featured, ...others] : others;
  const titles = glowbook.certification ? certifiedTitles(glowbook.certification, i18n.language) : [];
  const identity = {
    displayName: glowbook.displayName,
    handle: glowbook.handle,
    bio: glowbook.bio,
    look: { ...(look ?? DEFAULT_LOOK), location: glowbook.location },
    avatarUrl: glowbook.avatarUrl,
    certifiedTitles: titles,
    onBook,
  };
  /** A card opens the viewer; a new tab (or a modified click) still follows the link to the 3D view. */
  const openViewer = (event: MouseEvent<HTMLAnchorElement>, item: Item) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setViewer(Math.max(0, shown.findIndex((i) => i.id === item.id)));
  };

  return (
    <div style={glowbookThemeStyle()} className="bg-[var(--gb-page)] text-[var(--gb-text)]">
      <GlowbookTopBar {...identity} />

      <section aria-labelledby="gt-glowbook-creations" className="mx-auto grid max-w-[1180px] gap-6 px-4 pb-14 sm:px-8 sm:pt-8">
        {featured && (
          <Spotlight
            item={featured}
            handle={glowbook.handle}
            videoUrl={glowbook.spotlightVideoUrl}
            videoType={glowbook.spotlightVideo?.type ?? null}
            onBook={bookable ? () => book({ id: featured.id, name: featured.name }) : undefined}
          />
        )}

        <div className={clsx("grid gap-3", !featured && "pt-5 sm:pt-0")}>
          <h2 id="gt-glowbook-creations" className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)] tracking-[var(--tracking-tight)]">
            {t("studio.glowbook.public.creationsTitle", { count: glowbook.items.length })}
          </h2>
          {glowbook.sections.length > 0 && glowbook.items.length > 0 && (
            <div
              role="group"
              aria-label={t("studio.glowbook.public.sectionsLabel")}
              className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {[{ id: "all", name: t("studio.glowbook.public.allSections") }, ...glowbook.sections].map((section) => {
                const on = active === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(section.id)}
                    className={clsx(
                      "inline-flex h-9 flex-none items-center rounded-[var(--radius-pill)] border px-4 text-[13px] font-bold transition-colors",
                      on
                        ? "border-[var(--gb-accent)] bg-[var(--gb-accent)] text-[var(--gb-on-accent)]"
                        : "border-[var(--gb-border)] bg-[var(--gb-card)] text-[var(--gb-text)] hover:border-[var(--gb-accent)]",
                      focus,
                    )}
                  >
                    {section.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {glowbook.items.length === 0 ? (
          <p className="m-0 rounded-[var(--radius-md)] border border-dashed border-[var(--gb-border)] p-8 text-center text-[length:var(--text-body-sm)] text-[var(--gb-muted)]">
            {t("studio.glowbook.public.empty")}
          </p>
        ) : (
          others.length > 0 && (
            <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-5 p-0 sm:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] sm:gap-x-5 sm:gap-y-7">
              {others.map((item, i) => (
                <li key={item.id} className="grid">
                  <CreationCard item={item} handle={glowbook.handle} eager={i < 2} onOpen={(e) => openViewer(e, item)} />
                </li>
              ))}
            </ul>
          )
        )}
      </section>

      <div className="border-t border-[var(--gb-border)] bg-[var(--gb-soft)]">
        <GlowbookProfile {...identity} />
        {look?.place && (
          <div className="border-t border-[var(--gb-border)]">
            <GlowbookPlaceSection place={look.place} />
          </div>
        )}
      </div>

      <section className="border-t border-[var(--gb-border)] bg-[var(--gb-card)]">
        <div className="mx-auto flex max-w-[880px] flex-col items-center gap-3 px-4 py-10 text-center">
          <p className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)] tracking-[var(--tracking-tight)]">{t("studio.glowbook.public.ctaTitle")}</p>
          <p className="m-0 max-w-[52ch] text-[length:var(--text-body-sm)] text-[var(--gb-muted)]">{t("studio.glowbook.public.ctaBody")}</p>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Link
              to={STUDIO_PATH}
              className={clsx(
                "inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--gb-accent)] px-4 text-[12px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gb-on-accent)]",
                focus,
              )}
            >
              {t("studio.glowbook.public.ctaStudio")}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <Link
              to="/boutique"
              className={clsx(
                "inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gb-border)] px-4 text-[12px] font-bold uppercase tracking-[var(--tracking-wide)]",
                focus,
              )}
            >
              <Gem size={14} aria-hidden="true" />
              {t("studio.glowbook.public.ctaShop")}
            </Link>
          </div>
        </div>
      </section>

      {/* Phones: the way to book stays in reach while the page scrolls, and stops before the site's footer. */}
      {bookable && (
        <div className="sticky bottom-0 z-[40] border-t border-[var(--gb-border)] bg-[var(--gb-card)] px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-6px_18px_rgba(20,22,28,.08)] md:hidden">
          <button
            type="button"
            onClick={() => book(null)}
            className={clsx(
              "inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--gb-accent)] px-5 text-[13px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gb-on-accent)]",
              focus,
            )}
          >
            <CalendarCheck size={17} aria-hidden="true" />
            {t("studio.glowbook.public.stickyBook")}
          </button>
        </div>
      )}

      {viewer !== null && shown.length > 0 && (
        <CreationViewer
          items={shown}
          start={Math.min(viewer, shown.length - 1)}
          handle={glowbook.handle}
          artistName={glowbook.displayName}
          spotlight={featured ? { itemId: featured.id, videoUrl: glowbook.spotlightVideoUrl, videoType: glowbook.spotlightVideo?.type ?? null } : null}
          onClose={closeViewer}
          onBook={bookable ? (item) => book({ id: item.id, name: item.name }) : undefined}
        />
      )}

      {bookable && (
        <BookingDialog
          open={booking}
          onClose={() => setBooking(false)}
          handle={glowbook.handle}
          artistName={glowbook.displayName}
          creation={creation}
          initialSlot={back?.slot ?? null}
        />
      )}
    </div>
  );
}

/**
 * The creation in the spotlight: its turning video, large. On phones it runs
 * edge to edge with its name and buttons over a dark scrim at the bottom of
 * the picture; from the tablet up they sit in a panel beside it.
 */
function Spotlight({
  item,
  handle,
  videoUrl,
  videoType,
  onBook,
}: {
  item: Item;
  handle: string;
  videoUrl: string | null;
  videoType: string | null;
  onBook?: () => void;
}) {
  const { t } = useTranslation();
  const button =
    "inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-[var(--radius-pill)] px-3 text-[12px] font-bold uppercase tracking-[var(--tracking-wide)] transition-opacity hover:opacity-90 sm:px-5";
  const light = "bg-white text-[#16171b] md:bg-[var(--gb-accent)] md:text-[var(--gb-on-accent)]";
  return (
    <article
      aria-labelledby="gt-glowbook-spotlight"
      className="relative -mx-4 grid overflow-hidden bg-[var(--gb-card)] sm:mx-0 sm:rounded-[var(--radius-xl)] sm:border sm:border-[var(--gb-border)] sm:shadow-[var(--shadow-md)] md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
    >
      <div className="relative aspect-square bg-[var(--gb-soft)] md:aspect-auto md:min-h-[min(72vh,620px)]">
        <SpotlightVideo videoUrl={videoUrl} videoType={videoType} posterUrl={item.imageUrl} name={item.name} priority className="absolute inset-0" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 grid content-end gap-1.5 bg-[linear-gradient(to_top,rgba(10,11,14,.9)_0%,rgba(10,11,14,.7)_50%,rgba(10,11,14,0)_100%)] px-4 pb-4 pt-14 text-white md:pointer-events-auto md:static md:content-center md:gap-3 md:bg-none md:p-8 md:text-[var(--gb-text)]">
        <span className="inline-flex w-fit items-center gap-1 rounded-[var(--radius-pill)] bg-white px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[#16171b] md:bg-[var(--gb-accent)] md:text-[var(--gb-on-accent)]">
          <Star size={11} aria-hidden="true" />
          {t("studio.glowbook.public.featured")}
        </span>
        <h2
          id="gt-glowbook-spotlight"
          className="m-0 text-[clamp(1.35rem,3vw,2.1rem)] font-[var(--weight-black)] leading-tight tracking-[var(--tracking-tight)] text-white md:text-[var(--gb-text)]"
        >
          {item.name}
        </h2>
        {item.description && <p className="m-0 hidden whitespace-pre-line text-[14px] leading-relaxed text-[var(--gb-muted)] md:line-clamp-6">{item.description}</p>}
        <p className="m-0 text-[12.5px] text-white/80 md:text-[var(--gb-muted)]">{t("studio.workspace.gems", { count: item.elementCount })}</p>
        {/* Side by side on a phone: the short label there, the full one from the tablet up. */}
        <div className={clsx("pointer-events-auto mt-1.5 grid gap-2 md:flex md:flex-wrap", onBook ? "grid-cols-2" : "grid-cols-1")}>
          {onBook && (
            <button type="button" onClick={onBook} className={clsx(button, light, focus)}>
              <CalendarCheck size={15} aria-hidden="true" className="flex-none" />
              <span className="truncate md:hidden">{t("studio.glowbook.public.bookShort")}</span>
              <span className="hidden md:inline">{t("studio.glowbook.public.bookCreation")}</span>
            </button>
          )}
          <Link
            to={glowbookCreationPath(handle, item.id)}
            aria-label={t("studio.glowbook.public.open3d", { name: item.name })}
            className={clsx(
              button,
              onBook ? "border border-white/45 text-white md:border-[var(--gb-border)] md:text-[var(--gb-text)]" : light,
              focus,
            )}
          >
            <Box size={15} aria-hidden="true" className="flex-none" />
            <span className="truncate">{t("studio.glowbook.public.view3d")}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

/** A creation as a picture first: its render, then its name. Opens the full-screen viewer. */
function CreationCard({
  item,
  handle,
  eager,
  onOpen,
}: {
  item: Item;
  handle: string;
  eager: boolean;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { t } = useTranslation();
  return (
    <Link
      to={glowbookCreationPath(handle, item.id)}
      onClick={onOpen}
      aria-label={t("studio.glowbook.public.openCreation", { name: item.name })}
      className={clsx("group grid content-start gap-2 rounded-[var(--radius-lg)] text-left", focus)}
    >
      <span className="relative block aspect-square overflow-hidden rounded-[var(--radius-lg)] bg-[var(--gb-soft)] shadow-[var(--shadow-sm)] transition-shadow group-hover:shadow-[var(--shadow-md)]">
        <Render item={item} eager={eager} className="transition-transform duration-[var(--duration-base)] motion-safe:group-hover:scale-[1.04]" />
      </span>
      <span className="grid gap-0.5 px-0.5">
        <span className="truncate text-[14px] font-bold leading-snug">{item.name}</span>
        {item.description && <span className="hidden text-[12.5px] text-[var(--gb-muted)] sm:line-clamp-1">{item.description}</span>}
      </span>
    </Link>
  );
}

function Render({ item, eager, className }: { item: Item; eager: boolean; className?: string }) {
  if (!item.imageUrl) {
    return (
      <span className="grid h-full w-full place-items-center text-[var(--gb-accent)]">
        <Gem size={36} aria-hidden="true" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- signed Storage URLs, not optimisable assets
  return <img src={item.imageUrl} alt={item.name} loading={eager ? "eager" : "lazy"} decoding="async" className={`h-full w-full object-cover ${className ?? ""}`} />;
}
