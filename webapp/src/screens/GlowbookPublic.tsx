"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, AtSign, Gem, Sparkles } from "lucide-react";
import clsx from "clsx";
import { Dialog } from "../components/ui/Dialog";
import { Link } from "../lib/navigation";
import { instagramUrl } from "../lib/studioWorkspace/glowbook";
import type { PublicGlowbookPage } from "../lib/studioWorkspace/serverGlowbook";
import { STUDIO_PATH } from "../lib/studioUrl";

/**
 * An artist's Glowbook (decision 99): their chosen Studio creations, read
 * only, behind the link in their Instagram bio. Everything shown was approved
 * by a moderator; the server reads it on every request. Rendered on the
 * server and hydrated: nothing here reads the browser during render.
 */
/** A link drawn like the site's small buttons (`ui/Button`, which renders no router link nor new-tab anchor). */
const linkButton = (variant: "dark" | "outline") =>
  clsx(
    "inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] px-4 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] transition-colors duration-[var(--duration-fast)]",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
    variant === "dark"
      ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)] hover:bg-[var(--gt-ink-700)]"
      : "border border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--gt-ink-100)]",
  );

export function GlowbookPublic({ glowbook }: { glowbook: PublicGlowbookPage }) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? glowbook.items.find((i) => i.id === openId) : undefined;
  const initials = glowbook.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div className="bg-[var(--surface-page)]">
      <section className="relative overflow-hidden border-b border-[var(--border-subtle)] bg-[radial-gradient(ellipse_at_top,var(--gt-blue-100),transparent_70%)]">
        <div className="mx-auto grid max-w-[880px] justify-items-center gap-4 px-4 pb-10 pt-12 text-center sm:pt-16">
          <span
            aria-hidden="true"
            className="grid h-20 w-20 place-items-center rounded-full bg-[var(--gt-ink-900)] text-[26px] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-white shadow-[var(--shadow-lg)]"
          >
            {initials || <Sparkles size={28} />}
          </span>
          <p className="m-0 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--surface-card)] px-3 py-1 text-[11px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-700)] shadow-[var(--shadow-sm)]">
            <Sparkles size={12} aria-hidden="true" />
            {t("studio.glowbook.public.eyebrow")}
          </p>
          <h1 className="m-0 text-[clamp(1.9rem,4vw,2.75rem)] font-[var(--weight-black)] leading-[1.05] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            {glowbook.displayName}
          </h1>
          <p className="m-0 text-[14px] font-semibold text-[var(--text-muted)]">@{glowbook.handle}</p>
          {glowbook.bio && (
            <p className="m-0 max-w-[56ch] whitespace-pre-line text-[length:var(--text-body)] leading-relaxed text-[var(--text-primary)]">{glowbook.bio}</p>
          )}
          {glowbook.instagram && (
            <a href={instagramUrl(glowbook.instagram)} target="_blank" rel="noopener noreferrer" className={linkButton("outline")}>
              <AtSign size={14} aria-hidden="true" />
              {t("studio.glowbook.public.instagram", { account: glowbook.instagram })}
            </a>
          )}
        </div>
      </section>

      <section aria-labelledby="gt-glowbook-creations" className="mx-auto grid max-w-[1180px] gap-6 px-4 py-10 sm:px-8">
        <h2 id="gt-glowbook-creations" className="m-0 text-[length:var(--text-h3)] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
          {t("studio.glowbook.public.creationsTitle", { count: glowbook.items.length })}
        </h2>
        {glowbook.items.length === 0 ? (
          <p className="m-0 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] p-8 text-center text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("studio.glowbook.public.empty")}
          </p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-5 p-0">
            {glowbook.items.map((item) => (
              <li key={item.id} className="grid">
                <button
                  type="button"
                  onClick={() => setOpenId(item.id)}
                  className="group grid overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] text-left shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  <span className="block aspect-[4/3] overflow-hidden bg-[var(--gt-blue-100)]">
                    <Render item={item} className="transition-transform duration-[var(--duration-base)] motion-safe:group-hover:scale-[1.03]" />
                  </span>
                  <span className="grid gap-0.5 px-4 py-3">
                    <span className="truncate text-[15px] font-bold text-[var(--text-primary)]">{item.name}</span>
                    <span className="text-[12.5px] text-[var(--text-muted)]">{t("studio.workspace.gems", { count: item.elementCount })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-[var(--border-subtle)] bg-[var(--surface-card)]">
        <div className="mx-auto flex max-w-[880px] flex-col items-center gap-3 px-4 py-10 text-center">
          <p className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)] tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            {t("studio.glowbook.public.ctaTitle")}
          </p>
          <p className="m-0 max-w-[52ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("studio.glowbook.public.ctaBody")}</p>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Link to={STUDIO_PATH} className={linkButton("dark")}>
              {t("studio.glowbook.public.ctaStudio")}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <Link to="/boutique" className={linkButton("outline")}>
              <Gem size={14} aria-hidden="true" />
              {t("studio.glowbook.public.ctaShop")}
            </Link>
          </div>
        </div>
      </section>

      {open && (
        <Dialog open size="lg" onClose={() => setOpenId(null)} title={open.name} icon={<Gem size={17} />} closeLabel={t("studio.workspace.close")}>
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--gt-blue-100)]">
            <Render item={open} className="max-h-[60dvh]" />
          </div>
          <p className="m-0 text-[13px] font-semibold text-[var(--text-muted)]">{t("studio.workspace.gems", { count: open.elementCount })}</p>
          {open.description && (
            <p className="m-0 whitespace-pre-line text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-primary)]">{open.description}</p>
          )}
        </Dialog>
      )}
    </div>
  );
}

function Render({ item, className }: { item: PublicGlowbookPage["items"][number]; className?: string }) {
  if (!item.imageUrl) {
    return (
      <span className="grid aspect-[4/3] h-full w-full place-items-center text-[var(--gt-blue-600)]">
        <Gem size={36} aria-hidden="true" />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- signed Storage URLs, not optimisable assets
  return <img src={item.imageUrl} alt={item.name} loading="lazy" className={`h-full w-full object-cover ${className ?? ""}`} />;
}
