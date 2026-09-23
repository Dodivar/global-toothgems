import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

/**
 * Empty states for the workspace.
 *
 * Each one says why the space is empty, what would fill it, and offers the one
 * action that does — plus, where it helps, a hint of what the filled state
 * looks like, so a brand-new shop sees the shape of the tool it has not used
 * yet. The illustration is a glyph on a pastel medallion with two glints: the
 * brand's sparkle, kept small so it reads as friendly rather than festive.
 */
export function PromoEmpty({
  icon: Icon,
  title,
  body,
  actions,
  tone = "brand",
  compact,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  actions?: ReactNode;
  tone?: "brand" | "highlight" | "neutral" | "warning";
  compact?: boolean;
  children?: ReactNode;
}) {
  const star = "M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z";
  return (
    <div className={clsx("grid justify-items-center gap-3 text-center", compact ? "px-4 py-8" : "px-6 py-[clamp(40px,7vw,72px)]")}>
      <span aria-hidden="true" className="relative">
        <span
          className={clsx(
            "grid place-items-center rounded-full",
            compact ? "h-14 w-14" : "h-20 w-20",
            tone === "brand" && "bg-[radial-gradient(circle_at_30%_25%,var(--gt-white),var(--gt-blue-200))] text-[var(--gt-blue-700)]",
            tone === "highlight" && "bg-[radial-gradient(circle_at_30%_25%,var(--gt-white),var(--gt-fuchsia-50)_45%,var(--gt-fuchsia-300))] text-[var(--accent-highlight-ink)]",
            tone === "neutral" && "bg-[radial-gradient(circle_at_30%_25%,var(--gt-white),var(--gt-ink-200))] text-[var(--text-body)]",
            tone === "warning" && "bg-[radial-gradient(circle_at_30%_25%,var(--gt-white),var(--gt-amber-50)_40%,var(--gt-amber-400))] text-[var(--status-warning-fg)]",
          )}
        >
          <Icon size={compact ? 22 : 30} strokeWidth={1.6} />
        </span>
        <svg viewBox="0 0 24 24" className="gt-sys-twinkle absolute -right-1 -top-1 h-4 w-4 text-[var(--gt-blue-400)]">
          <path d={star} fill="currentColor" />
        </svg>
        <svg viewBox="0 0 24 24" className="gt-sys-twinkle absolute -left-2 bottom-1 h-2.5 w-2.5 text-[var(--gt-fuchsia-300)]" style={{ ["--gt-delay" as string]: "900ms" }}>
          <path d={star} fill="currentColor" />
        </svg>
      </span>
      <h3 className={compact ? "text-[length:var(--text-body-md)]" : "text-[length:var(--text-h4)]"}>{title}</h3>
      <p className="m-0 max-w-[50ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{body}</p>
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
      {children}
    </div>
  );
}
