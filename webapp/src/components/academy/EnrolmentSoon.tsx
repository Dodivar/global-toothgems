import { useTranslation } from "react-i18next";
import { CalendarClock } from "lucide-react";
import clsx from "clsx";

/**
 * In place of the "start" button on a real course until courses are sold
 * (phase D): what the visitor can expect, said plainly, rather than a button
 * that would pretend to enrol them. Text, not a disabled control.
 */
export function EnrolmentSoon({ dark = false }: { dark?: boolean }) {
  const { t } = useTranslation();
  return (
    <p
      className={clsx(
        "m-0 flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-left",
        dark ? "border-white/20 text-[var(--gt-ink-300)]" : "border-[var(--gt-blue-200)] bg-[var(--surface-card)] text-[var(--text-body)]",
      )}
    >
      <CalendarClock size={18} aria-hidden="true" className={clsx("mt-0.5 flex-none", dark ? "text-[var(--gt-blue-300)]" : "text-[var(--gt-blue-600)]")} />
      <span className="grid gap-0.5">
        <strong className={clsx("text-[length:var(--text-body-md)]", dark ? "text-[var(--gt-off-white)]" : "text-[var(--text-primary)]")}>
          {t("training.enrolSoonTitle")}
        </strong>
        <span className="text-[length:var(--text-body-sm)]">{t("training.enrolSoonBody")}</span>
      </span>
    </p>
  );
}
