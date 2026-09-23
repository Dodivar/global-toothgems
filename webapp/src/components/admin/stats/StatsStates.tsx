import { useTranslation } from "react-i18next";
import { PlugZap, RotateCw } from "lucide-react";
import { AdminButton } from "../AdminButton";

/**
 * Loading and failure states for the report.
 *
 * The skeletons are shaped like what replaces them — a KPI card, a chart, a run
 * of table rows — so a range change does not make the page jump. Each one
 * announces itself once through a live region, because a screen reader sees
 * nothing at all in a grey rectangle.
 */

export function KpiSkeleton() {
  return (
    <li className="gt-admin-panel grid content-start gap-3 p-4" aria-hidden="true">
      <div className="gt-skeleton h-2.5 w-24 rounded-full" />
      <div className="gt-skeleton h-7 w-28 rounded-[var(--radius-xs)]" />
      <div className="gt-skeleton h-4 w-20 rounded-full" />
    </li>
  );
}

export function ChartSkeleton({ height = 252, label }: { height?: number; label: string }) {
  return (
    <div className="grid gap-3" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="gt-skeleton rounded-[var(--admin-radius-sm)]" style={{ height }} />
      <div className="flex gap-3">
        <div className="gt-skeleton h-2.5 w-16 rounded-full" />
        <div className="gt-skeleton h-2.5 w-16 rounded-full" />
        <div className="gt-skeleton h-2.5 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function RowsSkeleton({ rows = 5, label }: { rows?: number; label: string }) {
  return (
    <div className="grid gap-3" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="gt-skeleton h-9 w-9 flex-none rounded-[var(--admin-radius-sm)]" />
          <div className="grid flex-1 gap-2">
            <div className="gt-skeleton h-2.5 w-2/5 rounded-full" />
            <div className="gt-skeleton h-2 w-1/4 rounded-full" />
          </div>
          <div className="gt-skeleton h-2.5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Friendly rather than alarming, and it always offers the way out: the figures
 * are late, not lost.
 */
export function StatsError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="gt-admin-panel grid justify-items-center gap-3 px-6 py-[clamp(40px,7vw,72px)] text-center">
      <span
        aria-hidden="true"
        className="grid h-12 w-12 place-items-center rounded-full bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]"
      >
        <PlugZap size={20} strokeWidth={1.8} />
      </span>
      <h2 className="text-[length:var(--text-h4)]">{t("admin.stats.error.title")}</h2>
      <p className="m-0 max-w-[52ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
        {t("admin.stats.error.body")}
      </p>
      <AdminButton variant="dark" iconLeft={RotateCw} onClick={onRetry} className="mt-1">
        {t("admin.stats.error.retry")}
      </AdminButton>
    </div>
  );
}
