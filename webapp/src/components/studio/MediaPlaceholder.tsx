import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { Play } from "lucide-react";

/**
 * A deliberate stand-in for a visual that does not exist yet, on the
 * alternative Studio page (`/studio-3d-b`).
 *
 * It is a `<figure>` with a real caption, not a broken image: the hatched
 * surface names the asset to come, what it should show and the format it
 * should be delivered in, so the owner can commission it. Nothing in it is
 * interactive — the play glyph on the hero frame is decorative and cannot be
 * clicked or focused, because the page must never offer a control that does
 * nothing.
 */
export interface PlaceholderCopy {
  /** The asset: "screen recording of the Studio". */
  title: string;
  /** What it should show. */
  body: string;
  /** Format and framing notes. */
  caption: string;
}

export function MediaPlaceholder({
  copy,
  icon: Icon,
  ratio = "aspect-[16/9]",
  play = false,
  className,
}: {
  copy: PlaceholderCopy;
  icon: LucideIcon;
  /** Tailwind aspect class for the surface. */
  ratio?: string;
  /** Draws a decorative play glyph, for a film. */
  play?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <figure className={clsx("m-0 grid gap-2.5", className)}>
      <div
        className={clsx(
          "gt-studio-b-ph relative grid w-full place-items-center overflow-hidden rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--gt-blue-300)] p-5 text-center sm:p-7",
          ratio,
        )}
      >
        <div className="grid max-w-[46ch] justify-items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--gt-blue-300)] bg-white/80 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-700)]">
            <Icon size={12} aria-hidden="true" />
            {t("studioPage.placeholder.label")}
          </span>
          {play && (
            <span
              aria-hidden="true"
              className="pointer-events-none grid h-12 w-12 place-items-center rounded-full border border-[var(--gt-blue-300)] bg-white/85 text-[var(--gt-blue-700)] shadow-[var(--shadow-sm)]"
            >
              <Play size={18} fill="currentColor" strokeWidth={0} />
            </span>
          )}
          <p className="m-0 text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">{copy.title}</p>
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{copy.body}</p>
        </div>
      </div>
      <figcaption className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {copy.caption} {t("studioPage.placeholder.note")}
      </figcaption>
    </figure>
  );
}

/**
 * The hero's media area: the same placeholder inside a premium window frame,
 * so the page reads as a product showcase rather than an empty box.
 */
export function HeroMediaPlaceholder({ copy, icon }: { copy: PlaceholderCopy; icon: LucideIcon }) {
  return (
    <div className="gt-studio-b-frame rounded-[var(--radius-xl)] border border-white/70 p-2.5 sm:p-3">
      <div aria-hidden="true" className="flex items-center gap-1.5 px-2 pb-2.5 pt-1">
        <span className="h-2 w-2 rounded-full bg-[var(--gt-blue-300)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--gt-blue-200)]" />
        <span className="h-2 w-2 rounded-full bg-[var(--gt-ink-200)]" />
      </div>
      <MediaPlaceholder copy={copy} icon={icon} play ratio="aspect-[16/10] sm:aspect-[16/9]" />
    </div>
  );
}
