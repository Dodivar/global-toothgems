import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import clsx from "clsx";

export type NoticeTone = "info" | "success" | "warning" | "error";

const TONE: Record<NoticeTone, { icon: LucideIcon; box: string; fg: string }> = {
  info: { icon: Info, box: "border-[var(--gt-blue-200)] bg-[var(--status-info-bg)]", fg: "text-[var(--status-info-fg)]" },
  success: { icon: CircleCheck, box: "border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)]", fg: "text-[var(--status-success-fg)]" },
  warning: { icon: TriangleAlert, box: "border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)]", fg: "text-[var(--status-warning-fg)]" },
  error: { icon: CircleAlert, box: "border-[var(--gt-red-400)] bg-[var(--status-error-bg)]", fg: "text-[var(--status-error-fg)]" },
};

/**
 * Inline message box: an icon, a bold title and a sentence, with optional
 * actions underneath. The same shape as the registration journey's failure
 * and expiry boxes, lifted out so every security state reads alike.
 *
 * `live` picks the announcement: "alert" for failures the user must act on,
 * "status" for confirmations. Omit it for a box that is simply part of the page.
 */
export function Notice({
  tone,
  title,
  children,
  actions,
  icon,
  live,
  className,
}: {
  tone: NoticeTone;
  title?: string;
  children?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  live?: "alert" | "status";
  className?: string;
}) {
  const { icon: DefaultIcon, box, fg } = TONE[tone];
  const Icon = icon ?? DefaultIcon;
  return (
    <div role={live} className={clsx("gt-field-message grid gap-3 rounded-[var(--radius-md)] border p-4", box, className)}>
      <div className="flex items-start gap-2.5 text-[length:var(--text-body-sm)]">
        <Icon size={17} aria-hidden="true" className={clsx("mt-[1px] flex-none", fg)} />
        <div className="grid min-w-0 gap-0.5">
          {title && <strong className="text-[var(--text-primary)]">{title}</strong>}
          {children && <div className="text-[var(--text-body)] [&_p]:m-0">{children}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2 pl-[26px]">{actions}</div>}
    </div>
  );
}
