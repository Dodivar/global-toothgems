"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { MapPin, Navigation } from "lucide-react";
import { GLOWBOOK_COLORS } from "../../lib/studioWorkspace/glowbookLook";
import { directionsLinks, type GlowbookPlace } from "../../lib/studioWorkspace/glowbookPlace";
import { GlowbookMap } from "./GlowbookMap";

/**
 * Where the artist works, on the public Glowbook (decision 108), right under
 * their profile in the same band (decision 152): the place's name and what it
 * is, then the map across the site's whole width, then the directions. The address (or
 * the area) and the directions links are rendered on the server and work
 * without the map. The map loads by itself as the visitor scrolls near it
 * (owner's choice, 2026-10-22): a visitor who never reaches the bottom of the
 * page downloads neither MapLibre nor tiles. The tiles come from a third party
 * (OpenFreeMap), which then sees the visitor's IP address (listed in the
 * privacy policy). The map's frame is drawn from the start, on the server
 * too, so nothing shifts when it arrives.
 */
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gb-accent)]";
const pill = clsx(
  "inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gb-border)] bg-[var(--gb-card)] px-4 text-[12px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gb-text)] transition-opacity hover:opacity-85",
  focus,
);

export function GlowbookPlaceSection({ place }: { place: GlowbookPlace }) {
  const { t } = useTranslation();
  const [showMap, setShowMap] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const links = directionsLinks(place);

  // Load the map once its frame comes within a screen of the viewport.
  useEffect(() => {
    const el = frame.current;
    if (!el || showMap) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShowMap(true);
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [showMap]);

  return (
    <section aria-labelledby="gt-glowbook-place" className="text-[var(--gb-text)]">
      <div className="mx-auto grid max-w-[880px] justify-items-center gap-1 px-4 pb-5 text-center">
        <h3 id="gt-glowbook-place" className="m-0 inline-flex items-center gap-1.5 text-[16px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--gb-text)]">
          <MapPin size={17} aria-hidden="true" className="flex-none text-[var(--gb-accent)]" />
          {place.label}
        </h3>
        <p className="m-0 max-w-[52ch] text-[13px] leading-relaxed text-[var(--gb-muted)]">
          {t(place.mode === "exact" ? "studio.glowbook.place.publicExact" : "studio.glowbook.place.publicArea")}
        </p>
      </div>

      {/* The site's whole width, on phones and desktops alike. */}
      <div ref={frame} className="relative h-[min(62vh,420px)] w-full overflow-hidden border-y border-[var(--gb-border)] bg-[var(--gb-soft)] md:h-[min(68vh,560px)]">
          {showMap ? (
            <GlowbookMap place={place} color={GLOWBOOK_COLORS.solid} className="h-full w-full" />
          ) : (
            <span aria-hidden="true" className="grid h-full w-full place-items-center text-[var(--gb-muted)]">
              <MapPin size={22} />
            </span>
          )}
      </div>

      <div className="flex flex-wrap justify-center gap-2 px-4 py-5">
        {links.map((link) => (
          <a key={link.app} href={link.href} target="_blank" rel="noopener noreferrer nofollow" className={pill}>
            <Navigation size={14} aria-hidden="true" />
            {t(`studio.glowbook.place.directions.${link.app}`)}
          </a>
        ))}
      </div>
    </section>
  );
}
