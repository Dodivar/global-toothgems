"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { Map as MapIcon, MapPin, Navigation } from "lucide-react";
import { ACCENT_COLORS, type Accent } from "../../lib/studioWorkspace/glowbookLook";
import { directionsLinks, type GlowbookPlace } from "../../lib/studioWorkspace/glowbookPlace";
import { GlowbookMap } from "./GlowbookMap";

/**
 * "Where to find me" on the public Glowbook (decision 108). The address (or
 * the area) and the directions links are rendered on the server and work
 * without the map. The map is drawn only when the visitor asks for it: its
 * tiles come from a third party (OpenFreeMap), which then sees the visitor's IP
 * address — so nothing is requested until that tap. Same markup on the server
 * and on the first browser render (the map is off at first).
 */
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gb-accent)]";
const pill = clsx(
  "inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gb-border)] bg-[var(--gb-card)] px-4 text-[12px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gb-text)] transition-opacity hover:opacity-85",
  focus,
);

export function GlowbookPlaceSection({ place, accent }: { place: GlowbookPlace; accent: Accent }) {
  const { t } = useTranslation();
  const [showMap, setShowMap] = useState(false);
  const links = directionsLinks(place);

  return (
    <section aria-labelledby="gt-glowbook-place" className="text-[var(--gb-text)]">
      <div className="mx-auto grid max-w-[880px] gap-4 px-4 py-10">
        <div className="grid justify-items-center gap-2 text-center">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gb-muted)]">{t("studio.glowbook.place.eyebrow")}</p>
          <h2 id="gt-glowbook-place" className="m-0 inline-flex items-center gap-2 text-[length:var(--text-h4)] font-[var(--weight-black)] tracking-[var(--tracking-tight)]">
            <MapPin size={18} aria-hidden="true" className="text-[var(--gb-accent)]" />
            {place.label}
          </h2>
          <p className="m-0 max-w-[52ch] text-[length:var(--text-body-sm)] text-[var(--gb-muted)]">
            {t(place.mode === "exact" ? "studio.glowbook.place.publicExact" : "studio.glowbook.place.publicArea")}
          </p>
        </div>

        {showMap ? (
          <GlowbookMap
            place={place}
            color={ACCENT_COLORS[accent].solid}
            className="h-[min(60vh,380px)] rounded-[var(--radius-lg)] border border-[var(--gb-border)]"
          />
        ) : null}

        <div className="flex flex-wrap justify-center gap-2">
          {!showMap && (
            <button type="button" onClick={() => setShowMap(true)} className={pill}>
              <MapIcon size={14} aria-hidden="true" />
              {t("studio.glowbook.place.showMap")}
            </button>
          )}
          {links.map((link) => (
            <a key={link.app} href={link.href} target="_blank" rel="noopener noreferrer nofollow" className={pill}>
              <Navigation size={14} aria-hidden="true" />
              {t(`studio.glowbook.place.directions.${link.app}`)}
            </a>
          ))}
        </div>
        {!showMap && <p className="m-0 text-center text-[11.5px] text-[var(--gb-muted)]">{t("studio.glowbook.place.mapNotice")}</p>}
      </div>
    </section>
  );
}
