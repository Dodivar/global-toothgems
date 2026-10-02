import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { Check, Compass, Mountain, Sprout, TrendingUp, Briefcase, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { PATHWAYS, type Pathway } from "../../lib/academy/catalog";

const ICONS: Record<Pathway, LucideIcon> = { new: Sprout, improve: TrendingUp, professional: Briefcase, refine: Mountain };

/**
 * "Where are you in your tooth gem journey?" — four starting points, one tap
 * each. Choosing one moves the courses that suit it to the top of the
 * catalogue and marks them; choosing it again (or "back to the whole
 * catalogue") lets go. Not a quiz: one question, no hidden scoring.
 */
export function Pathways({
  value,
  onChange,
  matches,
  sectionRef,
}: {
  value: Pathway | null;
  onChange: (pathway: Pathway | null) => void;
  /** Courses that suit the chosen starting point. */
  matches: number;
  sectionRef?: Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation();

  return (
    <div ref={sectionRef} id="point-de-depart" tabIndex={-1} className="grid scroll-mt-24 gap-6 outline-none">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
        <div className="grid gap-3">
          <span className="gt-eyebrow inline-flex items-center gap-2 !text-[var(--gt-blue-700)]">
            <Compass size={14} aria-hidden="true" />
            {t("academyPage.pathways.eyebrow")}
          </span>
          <h3 id="academy-pathways-title" className="gt-alt-h3 !text-[clamp(24px,2.2vw,34px)] !font-[var(--weight-black)]">
            {t("academyPage.pathways.title")}
          </h3>
        </div>
        <p className="m-0 max-w-[48ch] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("academyPage.pathways.lead")}</p>
      </div>
      <div role="group" aria-labelledby="academy-pathways-title" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PATHWAYS.map((pathway) => {
          const Icon = ICONS[pathway];
          const selected = value === pathway;
          return (
            <button
              key={pathway}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : pathway)}
              className={clsx(
                "gt-academy-path group relative grid grid-cols-[auto_1fr] items-center gap-x-4 sm:items-start gap-y-1 rounded-[var(--radius-lg)] border p-4 text-left sm:p-5",
                selected
                  ? "border-[var(--surface-inverse)] bg-[var(--surface-inverse)] text-[var(--gt-ink-300)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-body)] hover:border-[var(--gt-blue-300)]",
              )}
            >
              <span
                aria-hidden="true"
                className={clsx(
                  "grid h-11 w-11 sm:row-span-2 place-items-center rounded-full",
                  selected ? "bg-[var(--accent-cta)] text-[var(--text-on-accent)]" : "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
                )}
              >
                {selected ? <Check size={19} strokeWidth={2.5} /> : <Icon size={19} strokeWidth={1.75} />}
              </span>
              <span className={clsx("text-[15px] font-bold leading-snug", selected ? "text-[var(--gt-off-white)]" : "text-[var(--text-primary)]")}>
                {t(`academyPage.pathways.${pathway}.title`)}
              </span>
              <span className="hidden text-[length:var(--text-body-sm)] sm:block">{t(`academyPage.pathways.${pathway}.body`)}</span>
            </button>
          );
        })}
      </div>
      <div className="flex min-h-6 flex-wrap items-center gap-x-4 gap-y-2">
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
