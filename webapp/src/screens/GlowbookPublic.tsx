"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Box, Gem, Star } from "lucide-react";
import clsx from "clsx";
import { GlowbookHero } from "../components/glowbook/GlowbookHero";
import { glowbookThemeStyle } from "../components/glowbook/theme";
import { DEFAULT_LOOK } from "../lib/studioWorkspace/glowbookLook";
import { certifiedTitles, visibleCreations, type SectionFilter } from "../lib/studioWorkspace/glowbookSections";
import { Link } from "../lib/navigation";
import type { PublicGlowbookPage } from "../lib/studioWorkspace/serverGlowbook";
import { glowbookCreationPath, STUDIO_PATH } from "../lib/studioUrl";

/**
 * An artist's Glowbook (decisions 99 and 100): their chosen Studio creations,
 * read only, behind the link in their Instagram bio, in the look they chose —
 * banner, profile picture, identity colour, background, layout, a creation in
 * the spotlight, their city and links. Everything shown was approved by a
 * moderator; the server reads it on every request. Each creation opens
 * read-only in the 3D viewer, where its gems can be put in the cart. The
 * artist's sections filter the creations (decision 102; "all" first, so the
 * server and the first browser render agree), and the "certified artist"
 * badge sits under the name when the database grants it.
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

  return (
    <div style={glowbookThemeStyle(look)} className="bg-[var(--gb-page)] text-[var(--gb-text)]">
      <GlowbookHero
        displayName={glowbook.displayName}
        handle={glowbook.handle}
        bio={glowbook.bio}
        instagram={glowbook.instagram}
        look={{ ...(look ?? DEFAULT_LOOK), location: glowbook.location }}
        avatarUrl={glowbook.avatarUrl}
        bannerUrl={glowbook.bannerUrl}
        certifiedTitles={titles}
      />

      <section aria-labelledby="gt-glowbook-creations" className="mx-auto grid max-w-[1180px] gap-6 px-4 pb-12 sm:px-8">
        <h2 id="gt-glowbook-creations" className="m-0 text-[length:var(--text-h3)] font-[var(--weight-black)] tracking-[var(--tracking-tight)]">
          {t("studio.glowbook.public.creationsTitle", { count: glowbook.items.length })}
        </h2>
        {glowbook.sections.length > 0 && glowbook.items.length > 0 && (
          <div role="group" aria-label={t("studio.glowbook.public.sectionsLabel")} className="-mt-2 flex flex-wrap gap-2">
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
        {glowbook.items.length === 0 ? (
          <p className="m-0 rounded-[var(--radius-md)] border border-dashed border-[var(--gb-border)] p-8 text-center text-[length:var(--text-body-sm)] text-[var(--gb-muted)]">
            {t("studio.glowbook.public.empty")}
          </p>
        ) : (
          <>
            {featured && <CreationCard item={featured} handle={glowbook.handle} featured />}
            {others.length > 0 && (
              <ul
                className={clsx(
                  "m-0 grid list-none gap-5 p-0",
                  large ? "grid-cols-[repeat(auto-fill,minmax(min(100%,380px),1fr))]" : "grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))]",
                )}
              >
                {others.map((item) => (
                  <li key={item.id} className="grid">
                    <CreationCard item={item} handle={glowbook.handle} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

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

function CreationCard({ item, handle, featured = false }: { item: Item; handle: string; featured?: boolean }) {
  const { t } = useTranslation();
  return (
    <Link
      to={glowbookCreationPath(handle, item.id)}
      aria-label={t("studio.glowbook.public.open3d", { name: item.name })}
      className={clsx(
        "group grid overflow-hidden rounded-[var(--radius-lg)] border border-[var(--gb-border)] bg-[var(--gb-card)] text-left shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]",
        featured && "md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
        focus,
      )}
    >
      <span className={clsx("relative block overflow-hidden bg-[var(--gb-soft)]", featured ? "aspect-[16/10]" : "aspect-[4/3]")}>
        <Render item={item} className="transition-transform duration-[var(--duration-base)] motion-safe:group-hover:scale-[1.03]" />
        <span
          aria-hidden="true"
          className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[rgba(22,26,32,.72)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[var(--tracking-wide)] text-white backdrop-blur-sm"
        >
          <Box size={12} />
          {t("studio.glowbook.public.view3d")}
        </span>
      </span>
      <span className={clsx("grid content-center gap-1", featured ? "p-5 sm:p-7" : "px-4 py-3")}>
        {featured && (
          <span className="inline-flex w-fit items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--gb-accent)] px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gb-on-accent)]">
            <Star size={11} aria-hidden="true" />
            {t("studio.glowbook.public.featured")}
          </span>
        )}
        <span className={clsx("font-bold", featured ? "text-[22px] leading-tight" : "truncate text-[15px]")}>{item.name}</span>
        {item.description && (
          <span className={clsx("text-[13px] text-[var(--gb-muted)]", featured ? "line-clamp-4 whitespace-pre-line" : "line-clamp-2")}>{item.description}</span>
        )}
        <span className="text-[12.5px] text-[var(--gb-muted)]">{t("studio.workspace.gems", { count: item.elementCount })}</span>
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
