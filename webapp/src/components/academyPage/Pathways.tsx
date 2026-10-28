import { useTranslation } from "react-i18next";
import { Check, Mountain, Sprout, TrendingUp, Briefcase, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { PATHWAYS, type Pathway } from "../../lib/academy/catalog";

const ICONS: Record<Pathway, LucideIcon> = { new: Sprout, improve: TrendingUp, professional: Briefcase, refine: Mountain };

/**
 * The starting-point picker as one row of chips — swiped on a phone, wrapped
 * on wider screens. One tap moves the courses that suit it to the top of the
 * catalogue and marks them, a second tap lets go: not a quiz, one question,
 * no hidden scoring, and a starting point never hides a course. The pressed state is a fill, a check and `aria-pressed`, never the
 * colour alone.
 */
export function Pathways({ value, onChange, matches }: { value: Pathway | null; onChange: (pathway: Pathway | null) => void; matches: number }) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3">
      <h3 id="academy-pathways-title" className="text-[length:var(--text-h4)] font-bold text-[var(--text-primary)]">
        {t("academyPage.pathways.title")}
      </h3>
      <div
        role="group"
        aria-labelledby="academy-pathways-title"
        className="gt-scroller gt-alt-snap-pad -mx-[var(--gt-alt-gutter)] flex gap-2 px-[var(--gt-alt-gutter)] pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      >
        {PATHWAYS.map((pathway) => {
          const selected = value === pathway;
          const Icon = selected ? Check : ICONS[pathway];
          return (
            <button
              key={pathway}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : pathway)}
              className={clsx(
                "gt-academy-chip inline-flex min-h-11 flex-none snap-start items-center gap-2 rounded-[var(--radius-pill)] border px-4 text-[14px] font-semibold",
                selected
                  ? "border-[var(--gt-blue-700)] bg-[var(--gt-blue-700)] text-white"
                  : "border-[var(--gt-blue-200)] bg-white text-[var(--text-primary)] hover:border-[var(--gt-blue-400)]",
              )}
            >
              <Icon size={16} strokeWidth={selected ? 2.5 : 1.9} aria-hidden="true" className={selected ? undefined : "text-[var(--gt-blue-700)]"} />
              {t(`academyPage.pathways.${pathway}.title`)}
            </button>
          );
        })}
      </div>
      <div className="flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1">
        <p role="status" className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
          {value ? (matches > 0 ? t("academyPage.pathways.matches", { count: matches }) : t("academyPage.pathways.none")) : ""}
        </p>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            {t("academyPage.pathways.reset")}
          </button>
        )}
      </div>
    </div>
  );
}
