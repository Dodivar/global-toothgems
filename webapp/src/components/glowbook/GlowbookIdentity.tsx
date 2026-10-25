import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { AtSign, BadgeCheck, CalendarCheck, Globe, MapPin, Music2, Sparkles, UserRound } from "lucide-react";
import { instagramUrl } from "../../lib/studioWorkspace/glowbook";
import { DEFAULT_LOOK, initialsOf, tiktokUrl, type GlowbookLook } from "../../lib/studioWorkspace/glowbookLook";
import { GlowbookBadge } from "./GlowbookBadge";

/**
 * Who the artist is, on their Glowbook (decisions 100 and 103). The page
 * opens on the creations: the identity is a slim bar on top (picture, name,
 * city, booking, a "Profile" link) and the full profile — bio, badge, links —
 * sits at the bottom of the page, where that link leads. No banner any more.
 * In the colours of `glowbookThemeStyle` (set by the parent); shared by the
 * public page and the Studio's preview. Same markup on the server and in the
 * browser.
 */
export interface GlowbookIdentityProps {
  displayName: string;
  handle: string;
  bio: string;
  instagram: string | null;
  look: GlowbookLook | null;
  avatarUrl: string | null;
  /** The Studio's preview: links are drawn, not followed. */
  preview?: boolean;
  /** Course titles behind the "certified artist" badge (decision 102); none: no badge. */
  certifiedTitles?: readonly string[];
}

/** The id of the profile section, the target of the bar's "Profile" link. */
export const GLOWBOOK_PROFILE_ID = "gt-glowbook-profile";

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gb-accent)]";
const pill = clsx(
  "inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-pill)] px-4 text-[12px] font-bold uppercase tracking-[var(--tracking-wide)] transition-opacity hover:opacity-85",
  focus,
);

export function GlowbookAvatar({ name, url, className }: { name: string; url: string | null; className: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={clsx(
        "grid flex-none place-items-center overflow-hidden rounded-full bg-[var(--gb-accent)] font-[var(--weight-black)] text-[var(--gb-on-accent)]",
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
        <img src={url} alt={t("studio.glowbook.public.avatarAlt", { name })} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{initialsOf(name) || <Sparkles size={18} />}</span>
      )}
    </span>
  );
}

/**
 * The slim bar on top of the page: who, where, book, profile. It follows its
 * own width, not the viewport's, so the Studio's preview column draws it as a
 * phone would.
 */
export function GlowbookTopBar({ displayName, handle, look, avatarUrl, preview = false, certifiedTitles = [] }: GlowbookIdentityProps) {
  const { t } = useTranslation();
  const l = look ?? DEFAULT_LOOK;
  const certified = certifiedTitles.length > 0;
  const bookingClass = clsx(pill, "bg-[var(--gb-accent)] px-3 text-[var(--gb-on-accent)] @[640px]:px-4");
  const profileClass = clsx(pill, "border border-[var(--gb-border)] bg-[var(--gb-card)] px-3 text-[var(--gb-text)] @[640px]:px-4");
  return (
    <header className="@container border-b border-[var(--gb-border)] bg-[var(--gb-card)] text-[var(--gb-text)]">
      <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-2.5 @[640px]:px-8">
        <GlowbookAvatar name={displayName} url={avatarUrl} className="h-10 w-10 text-[14px] @[640px]:h-11 @[640px]:w-11" />
        <div className="grid min-w-0 flex-1 leading-tight">
          <h1 className="m-0 inline-flex min-w-0 items-center gap-1.5 text-[16px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] @[640px]:text-[18px]">
            <span className="truncate">{displayName}</span>
            {certified && (
              <BadgeCheck size={16} className="flex-none text-[var(--gb-accent)]" aria-label={t("studio.glowbook.badge.label")} role="img" />
            )}
          </h1>
          <p className="m-0 inline-flex min-w-0 items-center gap-2 text-[12.5px] font-semibold text-[var(--gb-muted)]">
            <span className="truncate">@{handle}</span>
            {l.location && (
              <span className="hidden min-w-0 items-center gap-1 @[640px]:inline-flex">
                <MapPin size={12} aria-hidden="true" />
                <span className="truncate">{l.location}</span>
              </span>
            )}
          </p>
        </div>
        {l.bookingUrl &&
          (preview ? (
            <span className={bookingClass}>
              <CalendarCheck size={14} aria-hidden="true" />
              <span className="hidden whitespace-nowrap @[640px]:inline">{t("studio.glowbook.public.booking")}</span>
            </span>
          ) : (
            <a
              href={l.bookingUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              aria-label={t("studio.glowbook.public.booking")}
              className={bookingClass}
            >
              <CalendarCheck size={14} aria-hidden="true" />
              <span className="hidden whitespace-nowrap @[640px]:inline">{t("studio.glowbook.public.booking")}</span>
            </a>
          ))}
        {preview ? (
          <span className={profileClass}>
            <UserRound size={14} aria-hidden="true" />
            <span className="hidden whitespace-nowrap @[640px]:inline">{t("studio.glowbook.public.profile")}</span>
          </span>
        ) : (
          <a href={`#${GLOWBOOK_PROFILE_ID}`} aria-label={t("studio.glowbook.public.profileOpen", { name: displayName })} className={profileClass}>
            <UserRound size={14} aria-hidden="true" />
            <span className="hidden whitespace-nowrap @[640px]:inline">{t("studio.glowbook.public.profile")}</span>
          </a>
        )}
      </div>
    </header>
  );
}

/** The full profile, at the bottom of the page: picture, name, city, badge, bio and every link. */
export function GlowbookProfile({ displayName, handle, bio, instagram, look, avatarUrl, preview = false, certifiedTitles = [] }: GlowbookIdentityProps) {
  const { t } = useTranslation();
  const l = look ?? DEFAULT_LOOK;
  const links: { key: string; href: string; label: string; icon: ReactNode; primary?: boolean }[] = [];
  if (l.bookingUrl) links.push({ key: "booking", href: l.bookingUrl, label: t("studio.glowbook.public.booking"), icon: <CalendarCheck size={14} />, primary: true });
  if (instagram) links.push({ key: "instagram", href: instagramUrl(instagram), label: t("studio.glowbook.public.instagram", { account: instagram }), icon: <AtSign size={14} /> });
  if (l.tiktok) links.push({ key: "tiktok", href: tiktokUrl(l.tiktok), label: t("studio.glowbook.public.tiktok", { account: l.tiktok }), icon: <Music2 size={14} /> });
  if (l.websiteUrl) links.push({ key: "website", href: l.websiteUrl, label: t("studio.glowbook.public.website"), icon: <Globe size={14} /> });

  return (
    <section
      id={preview ? undefined : GLOWBOOK_PROFILE_ID}
      aria-labelledby={preview ? undefined : `${GLOWBOOK_PROFILE_ID}-title`}
      className="scroll-mt-20 text-[var(--gb-text)]"
    >
      <div className={clsx("mx-auto grid max-w-[880px] justify-items-center gap-3 px-4 text-center", preview ? "py-5" : "py-12")}>
        <p className="m-0 text-[11px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gb-muted)]">{t("studio.glowbook.public.profileEyebrow")}</p>
        <GlowbookAvatar
          name={displayName}
          url={avatarUrl}
          className={clsx("border-4 border-[var(--gb-card)] shadow-[var(--shadow-md)]", preview ? "h-16 w-16 text-[20px]" : "h-24 w-24 text-[28px]")}
        />
        <h2
          id={preview ? undefined : `${GLOWBOOK_PROFILE_ID}-title`}
          className={clsx("m-0 font-[var(--weight-black)] leading-[1.05] tracking-[var(--tracking-tight)]", preview ? "text-[20px]" : "text-[clamp(1.6rem,3.4vw,2.3rem)]")}
        >
          {displayName}
        </h2>
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
