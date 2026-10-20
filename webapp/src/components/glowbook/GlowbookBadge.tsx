import { useTranslation } from "react-i18next";
import { BadgeCheck } from "lucide-react";

/**
 * "Artiste certifiée Global Toothgems" (decision 102): shown under the
 * artist's name when the database finds an Academy course they completed with
 * a certificate, with the course title(s). Drawn in the page's colours
 * (`--gb-*`); an icon and words, never colour alone. Same markup on the
 * server and in the browser.
 */
export function GlowbookBadge({ titles }: { titles: readonly string[] }) {
  const { t } = useTranslation();
  if (!titles.length) return null;
  return (
    <p className="m-0 grid justify-items-center gap-1">
      <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--gb-accent)] bg-[var(--gb-card)] px-3 py-1 text-[11.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gb-accent)]">
        <BadgeCheck size={14} aria-hidden="true" />
        {t("studio.glowbook.badge.label")}
      </span>
      <span className="max-w-[56ch] text-[12.5px] text-[var(--gb-muted)]">{t("studio.glowbook.badge.courses", { titles: titles.join(" · ") })}</span>
    </p>
  );
}
