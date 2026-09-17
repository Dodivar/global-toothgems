import { useTranslation } from "react-i18next";
import { Archive, CircleCheck, CircleSlash, PencilLine, TriangleAlert, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import type { DisplayState } from "../../data/adminCatalog";

/**
 * The one label that says where a product stands.
 *
 * Colour is never the only carrier: every state also has its own icon and its
 * own word, so the badge still works in greyscale, for a colour-blind
 * administrator, and when read aloud.
 */
const STATE: Record<DisplayState, { icon: LucideIcon; className: string }> = {
  active: {
    icon: CircleCheck,
    className: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--gt-emerald-300)]",
  },
  draft: {
    icon: PencilLine,
    className: "bg-[var(--gt-blue-50)] text-[var(--gt-blue-700)] border-[var(--gt-blue-200)]",
  },
  low_stock: {
    icon: TriangleAlert,
    className: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-[var(--gt-amber-400)]",
  },
  out_of_stock: {
    icon: CircleSlash,
    className: "bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border-[var(--gt-red-400)]",
  },
  archived: {
    icon: Archive,
    className: "bg-[var(--gt-ink-100)] text-[var(--text-muted)] border-[var(--border-default)]",
  },
};

export function ProductStatusBadge({ state, size = "md" }: { state: DisplayState; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const { icon: Icon, className } = STATE[state];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] border font-semibold",
        size === "sm" ? "h-[22px] px-2 text-[10px]" : "h-7 px-2.5 text-[length:var(--text-caption)]",
        className,
      )}
    >
      <Icon size={size === "sm" ? 11 : 13} strokeWidth={2.2} aria-hidden="true" />
      {t(`admin.state.${state}`)}
    </span>
  );
}
