import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

/**
 * A slot for media the Studio does not have yet: renders, screen recordings,
 * before/after pairs, member creations.
 *
 * REPLACEABLE CONTENT. Every instance carries `data-placeholder` with its kind
 * so the real asset can be found and swapped in; the visible tag
 * ("[STUDIO VIDEO PLACEHOLDER]") is deliberately left in the design so nobody
 * mistakes the illustration underneath for published media. The illustration
 * (`children`) is only there so the layout reads as finished in the meantime.
 */

export type PlaceholderTone = "blue" | "ink" | "sand" | "blush";

const TONES: Record<PlaceholderTone, string> = {
  blue: "gt-studio-ph--blue text-[var(--gt-ink-900)]",
  ink: "gt-studio-ph--ink text-white",
  sand: "gt-studio-ph--sand text-[var(--gt-ink-900)]",
  blush: "gt-studio-ph--blush text-[var(--gt-ink-900)]",
};

interface MediaPlaceholderProps {
  /** The machine tag, e.g. "STUDIO VIDEO PLACEHOLDER". */
  tag: string;
  /** Human caption: what will go here. */
  caption: string;
  icon?: LucideIcon;
  tone?: PlaceholderTone;
  className?: string;
  /** Optional illustration shown under the tag until the media arrives. */
  children?: ReactNode;
  /** Optional overlay control, e.g. a play button. */
  action?: ReactNode;
}

export function MediaPlaceholder({ tag, caption, icon: Icon, tone = "blue", className, children, action }: MediaPlaceholderProps) {
  return (
    <figure
      data-placeholder={tag}
      className={clsx(
        "gt-studio-ph group relative m-0 grid overflow-hidden rounded-[var(--radius-lg)] [&>*]:col-start-1 [&>*]:row-start-1",
        TONES[tone],
        className,
      )}
    >
      {children && <div className="gt-studio-ph-art grid h-full w-full place-items-center">{children}</div>}
      <div aria-hidden="true" className="gt-studio-ph-sheen pointer-events-none" />
      {action && <div className="z-[1] grid place-items-center">{action}</div>}
      <figcaption className="z-[1] flex flex-col justify-between gap-3 self-stretch p-[clamp(12px,2vw,20px)]">
        <span
          className={clsx(
            "inline-flex items-center gap-1.5 self-start rounded-[var(--radius-pill)] px-2.5 py-1 font-[family-name:var(--gt-font-mono)] text-[10px] font-semibold tracking-[.04em]",
            tone === "ink" ? "bg-white/12 text-white/90 ring-1 ring-white/20" : "bg-white/70 text-[var(--gt-ink-700)] ring-1 ring-black/5",
          )}
        >
          {Icon && <Icon size={12} aria-hidden="true" />}[{tag}]
        </span>
        <span className={clsx("max-w-[34ch] text-[12.5px] font-semibold leading-snug", tone === "ink" ? "text-white/85" : "text-[var(--gt-ink-700)]")}>
          {caption}
        </span>
      </figcaption>
    </figure>
  );
}
