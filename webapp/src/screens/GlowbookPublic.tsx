"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Box, Gem, Star } from "lucide-react";
import clsx from "clsx";
import { GlowbookProfile, GlowbookTopBar } from "../components/glowbook/GlowbookIdentity";
import { SpotlightVideo } from "../components/glowbook/SpotlightVideo";
import { glowbookThemeStyle } from "../components/glowbook/theme";
import { DEFAULT_LOOK } from "../lib/studioWorkspace/glowbookLook";
import { certifiedTitles, visibleCreations, type SectionFilter } from "../lib/studioWorkspace/glowbookSections";
import { Link } from "../lib/navigation";
import type { PublicGlowbookPage } from "../lib/studioWorkspace/serverGlowbook";
import { glowbookCreationPath, STUDIO_PATH } from "../lib/studioUrl";

/**
 * An artist's Glowbook (decisions 99, 100 and 103): their chosen Studio
 * creations, read only, behind the link in their Instagram bio, in the look
 * they chose. The page opens on the work: a slim identity bar, then the
 * creation in the spotlight turning in a short video (its still render until
 * the artist's Studio has recorded it), then the others; the full profile —
 * bio, badge, links — closes the page, one tap away from the bar. Everything
 * shown was approved by a moderator; the server reads it on every request.
 * Each creation opens read-only in the 3D viewer, where its gems can be put
 * in the cart. The artist's sections filter the creations (decision 102;
 * "all" first, so the server and the first browser render agree).
 * Rendered on the server and hydrated: nothing here reads the browser during render.
 */
type Item = PublicGlowbookPage["items"][number];

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gb-accent)]";

export function GlowbookPublic({ glowbook }: { glowbook: PublicGlowbookPage }) {
  const { t, i18n } = useTranslation();
  const look = glowbook.look;
  const [filter, setFilter] = useState<SectionFilter>("all");
  const { featured, others, filter: active } = visibleCreations(glowbook.items, glowbook.sections, look?.featuredItemId ?? null, filter);
  const large = look?.layout === "large";
  const titles = glowbook.certification ? certifiedTitles(glowbook.certification, i18n.language) : [];
  const identity = {
    displayName: glowbook.displayName,
    handle: glowbook.handle,
    bio: glowbook.bio,
    instagram: glowbook.instagram,
    look: { ...(look ?? DEFAULT_LOOK), location: glowbook.location },
    avatarUrl: glowbook.avatarUrl,
    certifiedTitles: titles,
  };

  return (
    <div style={glowbookThemeStyle(look)} className="bg-[var(--gb-page)] text-[var(--gb-text)]">
      <GlowbookTopBar {...identity} />

      <section aria-labelledby="gt-glowbook-creations" className="mx-auto grid max-w-[1180px] gap-6 px-4 pb-14 pt-5 sm:px-8 sm:pt-8">
        {featured && (
          <Spotlight
            item={featured}
            handle={glowbook.handle}
            videoUrl={glowbook.spotlightVideoUrl}
            videoType={glowbook.spotlightVideo?.type ?? null}
          />
        )}

        <div className="grid gap-3">
          <h2 id="gt-glowbook-creations" className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)] tracking-[var(--tracking-tight)]">
            {t("studio.glowbook.public.creationsTitle", { count: glowbook.items.length })}
          </h2>
          {glowbook.sections.length > 0 && glowbook.items.length > 0 && (
            <div role="group" aria-label={t("studio.glowbook.public.sectionsLabel")} className="flex flex-wrap gap-2">
              {[{ id: "all", name: t("studio.glowbook.public.allSections") }, ...glowbook.sections].map((section) => {
                const on = active === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(section.id)}
                    className={clsx(
                      "inline-flex h-9 items-center rounded-[var(--radius-pill)] border px-4 text-[13px] font-bold transition-colors",
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
            <ul
              className={clsx(
                "m-0 grid list-none gap-4 p-0 sm:gap-5",
                large
                  ? "grid-cols-[repeat(auto-fill,minmax(min(100%,380px),1fr))]"
                  : "grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(250px,1fr))]",
              )}
            >
              {others.map((item) => (
                <li key={item.id} className="grid">
                  <CreationCard item={item} handle={glowbook.handle} />
                </li>
              ))}
            </ul>
          )
        )}
      </section>

      <div className="border-t border-[var(--gb-border)] bg-[var(--gb-soft)]">
        <GlowbookProfile {...identity} />
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
    </div>
  );
}

/** The creation in the spotlight: its turning video, large, beside its name and the way into 3D. */
function Spotlight({ item, handle, videoUrl, videoType }: { item: Item; handle: string; videoUrl: string | null; videoType: string | null }) {
  const { t } = useTranslation();
  return (
    <article
      aria-labelledby="gt-glowbook-spotlight"
      className="grid overflow-hidden rounded-[var(--radius-xl)] border border-[var(--gb-border)] bg-[var(--gb-card)] shadow-[var(--shadow-md)] md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
    >
      <div className="relative aspect-square bg-[var(--gb-soft)] md:aspect-auto md:min-h-[min(72vh,620px)]">
        <SpotlightVideo videoUrl={videoUrl} videoType={videoType} posterUrl={item.imageUrl} name={item.name} className="absolute inset-0" />
      </div>
      <div className="grid content-center gap-3 p-5 sm:p-8">
        <span className="inline-flex w-fit items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--gb-accent)] px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gb-on-accent)]">
          <Star size={11} aria-hidden="true" />
          {t("studio.glowbook.public.featured")}
        </span>
        <h2 id="gt-glowbook-spotlight" className="m-0 text-[clamp(1.5rem,3vw,2.1rem)] font-[var(--weight-black)] leading-tight tracking-[var(--tracking-tight)]">
          {item.name}
        </h2>
        {item.description && <p className="m-0 line-clamp-6 whitespace-pre-line text-[14px] leading-relaxed text-[var(--gb-muted)]">{item.description}</p>}
        <p className="m-0 text-[12.5px] text-[var(--gb-muted)]">{t("studio.workspace.gems", { count: item.elementCount })}</p>
        <Link
          to={glowbookCreationPath(handle, item.id)}
          aria-label={t("studio.glowbook.public.open3d", { name: item.name })}
          className={clsx(
            "mt-1 inline-flex h-10 w-fit items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--gb-accent)] px-5 text-[12px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gb-on-accent)] transition-opacity hover:opacity-90",
            focus,
          )}
        >
          <Box size={14} aria-hidden="true" />
          {t("studio.glowbook.public.view3d")}
        </Link>
      </div>
    </article>
  );
}

function CreationCard({ item, handle }: { item: Item; handle: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to={glowbookCreationPath(handle, item.id)}
      aria-label={t("studio.glowbook.public.open3d", { name: item.name })}
      className={clsx(
        "group grid overflow-hidden rounded-[var(--radius-lg)] border border-[var(--gb-border)] bg-[var(--gb-card)] text-left shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]",
        focus,
      )}
    >
      <span className="relative block aspect-square overflow-hidden bg-[var(--gb-soft)]">
        <Render item={item} className="transition-transform duration-[var(--duration-base)] motion-safe:group-hover:scale-[1.04]" />
        <span
          aria-hidden="true"
          className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[rgba(22,26,32,.72)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-white backdrop-blur-sm"
        >
          <Box size={12} />
          3D
        </span>
      </span>
      <span className="grid content-center gap-0.5 px-3.5 py-3">
        <span className="truncate text-[14.5px] font-bold">{item.name}</span>
        {item.description && <span className="line-clamp-2 text-[12.5px] text-[var(--gb-muted)]">{item.description}</span>}
      </span>
    </Link>
  );
}

function Render({ item, className }: { item: Item; className?: string }) {
  if (!item.imageUrl) {
    return (
      <span className="grid h-full w-full place-items-center text-[var(--gb-accent)]">
        <Gem size={36} aria-hidden="true" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- signed Storage URLs, not optimisable assets
  return <img src={item.imageUrl} alt={item.name} loading="lazy" className={`h-full w-full object-cover ${className ?? ""}`} />;
}
