import { useTranslation } from "react-i18next";
import {
  CircleCheck,
  CircleDashed,
  FileText,
  FolderTree,
  GraduationCap,
  History,
  LayoutTemplate,
  Mail,
  Package,
  PieChart,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import type { CoverageArea, TrPriority } from "../../data/adminTranslations";
import type { TrItemStatus } from "../../lib/settingsRules";

/**
 * The translation vocabulary: one icon per content type, one badge per status.
 * Status is word + icon + tone, in that order of importance.
 */

export const AREA_ICON: Record<CoverageArea, LucideIcon> = {
  storefront: LayoutTemplate,
  product: Package,
  category: FolderTree,
  module: GraduationCap,
  email: Mail,
  content: FileText,
};

const STATUS_META: Record<TrItemStatus, { icon: LucideIcon; cls: string }> = {
  missing: { icon: CircleDashed, cls: "border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]" },
  partial: { icon: PieChart, cls: "border-[var(--gt-blue-300)] bg-[var(--gt-blue-50)] text-[var(--gt-blue-700)]" },
  outdated: { icon: History, cls: "border-[var(--border-default)] bg-[var(--surface-sunken)] text-[var(--text-body)]" },
  complete: { icon: CircleCheck, cls: "border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]" },
};

export function TrStatusBadge({ status, className }: { status: TrItemStatus; className?: string }) {
  const { t } = useTranslation();
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={clsx("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-[var(--radius-pill)] border px-2 text-[11px] font-semibold", meta.cls, className)}>
      <Icon size={12} strokeWidth={2.2} aria-hidden="true" />
      {t(`settings.tr.status.${status}`)}
    </span>
  );
}

export function PriorityLabel({ priority }: { priority: TrPriority }) {
  const { t } = useTranslation();
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[length:var(--text-caption)] font-semibold",
        priority === "high" ? "text-[var(--accent-highlight-ink)]" : priority === "normal" ? "text-[var(--text-body)]" : "text-[var(--text-muted)]",
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          "h-2 w-2 rounded-full",
          priority === "high" ? "bg-[var(--accent-highlight)]" : priority === "normal" ? "bg-[var(--gt-blue-500)]" : "border border-[var(--gt-ink-400)]",
        )}
      />
      {t(`settings.tr.priority.${priority}`)}
    </span>
  );
}

export function useShortDate() {
  const { i18n } = useTranslation();
  const fmt = new Intl.DateTimeFormat(i18n.language.startsWith("fr") ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (iso: string) => fmt.format(new Date(`${iso}T12:00:00`));
}
