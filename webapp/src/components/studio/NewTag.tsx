import { useTranslation } from "react-i18next";
import clsx from "clsx";

/**
 * The small "New" mark beside the Studio in the navigation and on its teasers.
 * Fuchsia, the brand's selective highlight, at the size of a footnote: enough
 * to be noticed next to "Shop" without competing with it.
 */
export function NewTag({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={clsx(
        "inline-flex h-[17px] items-center rounded-[var(--radius-pill)] border border-[var(--gt-fuchsia-300)] bg-[var(--gt-fuchsia-50)] px-1.5 text-[9px] font-bold uppercase tracking-[.1em] text-[var(--accent-highlight-ink)]",
        className,
      )}
    >
      {t("nav.new")}
    </span>
  );
}
