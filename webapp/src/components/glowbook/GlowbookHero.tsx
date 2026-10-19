import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { AtSign, CalendarCheck, Globe, MapPin, Music2, Sparkles } from "lucide-react";
import { instagramUrl } from "../../lib/studioWorkspace/glowbook";
import { DEFAULT_LOOK, initialsOf, tiktokUrl, type GlowbookLook } from "../../lib/studioWorkspace/glowbookLook";
import { GlowbookBadge } from "./GlowbookBadge";

/**
 * The top of a Glowbook (decision 100): banner, profile picture, name, handle,
 * city, bio and links, in the colours of `glowbookThemeStyle` (set by the
 * parent). Shared by the public page and the Studio's preview.
 */
export interface GlowbookHeroProps {
  displayName: string;
  handle: string;
  bio: string;
  instagram: string | null;
  look: GlowbookLook | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  /** The Studio's preview: links are drawn, not followed. */
  preview?: boolean;
  /** Course titles behind the "certified artist" badge (decision 102); none: no badge. */
  certifiedTitles?: readonly string[];
}

const pill =
  "inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-pill)] px-4 text-[12px] font-bold uppercase tracking-[var(--tracking-wide)] transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gb-accent)]";

export function GlowbookHero({ displayName, handle, bio, instagram, look, avatarUrl, bannerUrl, preview = false, certifiedTitles = [] }: GlowbookHeroProps) {
  const { t } = useTranslation();
  const l = look ?? DEFAULT_LOOK;
  const links: { key: string; href: string; label: string; icon: ReactNode; primary?: boolean }[] = [];
  if (l.bookingUrl) links.push({ key: "booking", href: l.bookingUrl, label: t("studio.glowbook.public.booking"), icon: <CalendarCheck size={14} />, primary: true });
  if (instagram) links.push({ key: "instagram", href: instagramUrl(instagram), label: t("studio.glowbook.public.instagram", { account: instagram }), icon: <AtSign size={14} /> });
  if (l.tiktok) links.push({ key: "tiktok", href: tiktokUrl(l.tiktok), label: t("studio.glowbook.public.tiktok", { account: l.tiktok }), icon: <Music2 size={14} /> });
  if (l.websiteUrl) links.push({ key: "website", href: l.websiteUrl, label: t("studio.glowbook.public.website"), icon: <Globe size={14} /> });

  return (
    <section className="text-[var(--gb-text)]">
      <div
        className={clsx("relative w-full overflow-hidden", preview ? "aspect-[3/1]" : "aspect-[3/1] max-h-[340px] sm:aspect-[4/1]")}
        style={{ background: "linear-gradient(135deg, var(--gb-accent), var(--gb-soft))" }}
      >
        {bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
          <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>
      <div className={clsx("mx-auto grid max-w-[880px] justify-items-center gap-3 px-4 text-center", preview ? "pb-5" : "pb-10")}>
        <span
          className={clsx(
            "relative z-[1] -mt-12 grid flex-none place-items-center overflow-hidden rounded-full border-4 border-[var(--gb-page)] bg-[var(--gb-accent)] font-[var(--weight-black)] text-[var(--gb-on-accent)] shadow-[var(--shadow-md)]",
            preview ? "h-20 w-20 text-[22px]" : "h-24 w-24 text-[28px] sm:-mt-14 sm:h-28 sm:w-28",
          )}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
            <img src={avatarUrl} alt={t("studio.glowbook.public.avatarAlt", { name: displayName })} className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true">{initialsOf(displayName) || <Sparkles size={26} />}</span>
          )}
        </span>
        <h1
          className={clsx(
            "m-0 font-[var(--weight-black)] leading-[1.05] tracking-[var(--tracking-tight)]",
            preview ? "text-[22px]" : "text-[clamp(1.9rem,4vw,2.75rem)]",
          )}
        >
          {displayName}
        </h1>
        <p className="m-0 inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13.5px] font-semibold text-[var(--gb-muted)]">
          <span>@{handle}</span>
          {l.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin size={13} aria-hidden="true" />
              {l.location}
            </span>
          )}
        </p>
        <GlowbookBadge titles={certifiedTitles} />
        {bio && <p className="m-0 max-w-[56ch] whitespace-pre-line text-[length:var(--text-body)] leading-relaxed">{bio}</p>}
        {links.length > 0 && (
          <ul className="m-0 mt-1 flex list-none flex-wrap justify-center gap-2 p-0">
            {links.map((link) => {
              const cls = clsx(
                pill,
                link.primary
                  ? "bg-[var(--gb-accent)] text-[var(--gb-on-accent)]"
                  : "border border-[var(--gb-border)] bg-[var(--gb-card)] text-[var(--gb-text)]",
              );
              return (
                <li key={link.key}>
                  {preview ? (
                    <span className={cls}>
                      {link.icon}
                      {link.label}
                    </span>
                  ) : (
                    <a href={link.href} target="_blank" rel="noopener noreferrer nofollow" className={cls}>
                      <span aria-hidden="true" className="contents">
                        {link.icon}
                      </span>
                      {link.label}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
