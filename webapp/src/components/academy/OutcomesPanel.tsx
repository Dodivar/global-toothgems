import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ClipboardList, Target } from "lucide-react";
import clsx from "clsx";
import { SectionIntro } from "./TrainingPrimitives";

/** Outcomes shown on a phone before "show all": enough to read the promise, short enough to reach the curriculum. */
const MOBILE_VISIBLE = 4;

/**
 * "What you'll be able to do": the course's objectives as authored in the back
 * office, its description and its prerequisites.
 *
 * Mobile first: one column of numbered cards, the first few only, the rest
 * behind a "show all" button — hidden with CSS from `sm` up, where every card
 * fits in two columns, so the markup is the same on the server and on the first
 * browser render whatever the screen. The hidden cards stay in the document
 * (search engines read them) but out of the accessibility tree until shown.
 * On wide screens the intro and description sit beside the cards and stay in
 * view while the reader goes down the list.
 */
export function OutcomesPanel({
  outcomes,
  description,
  requirements,
  lessons,
}: {
  outcomes: string[];
  description: string[];
  requirements: string[];
  lessons: number;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const [showAll, setShowAll] = useState(false);
  const hiddenCount = Math.max(0, outcomes.length - MOBILE_VISIBLE);
  const [lead, ...rest] = description;

  return (
    <div className="grid gap-[clamp(24px,4vw,56px)] lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:items-start">
      <div className="grid gap-4 lg:sticky lg:top-24">
        <SectionIntro
          id="training-outcomes"
          eyebrow={t("training.outcomesEyebrow")}
          title={t("training.outcomesTitle")}
          lead={t("training.outcomesLead", { count: lessons })}
        />
        {lead && (
          <p className="m-0 max-w-[var(--max-width-prose)] whitespace-pre-line border-l-2 border-[var(--gt-blue-300)] pl-4 text-[length:var(--text-body-lg)] font-medium text-[var(--text-primary)]">
            {lead}
          </p>
        )}
        {rest.map((paragraph, i) => (
          <p
            key={i}
            className="m-0 max-w-[var(--max-width-prose)] whitespace-pre-line text-[length:var(--text-body-md)] text-[var(--text-body)]"
          >
            {paragraph}
          </p>
        ))}
      </div>

      <div className="grid gap-5">
        {outcomes.length > 0 && (
          <div className="grid gap-3">
            <div className="flex items-center gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--gt-emerald-50)] text-[var(--accent-cta-ink)]"
              >
                <Target size={15} />
              </span>
              {t("training.outcomesCount", { count: outcomes.length })}
            </div>
            <ol
              id={listId}
              aria-label={t("training.outcomesListLabel")}
              className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2"
            >
              {outcomes.map((outcome, i) => {
                const folded = !showAll && i >= MOBILE_VISIBLE;
                return (
                  <li
                    key={`${i}-${outcome}`}
                    className={clsx(
                      "items-start gap-4 rounded-[var(--radius-card)] sm:odd:last:col-span-2 border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-xs)]",
                      folded ? "hidden sm:flex" : "flex",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 flex-none items-center justify-center rounded-[var(--radius-sm)] bg-[var(--gt-blue-50)] text-[15px] font-[var(--weight-black)] text-[var(--gt-blue-500)]"
                      style={{ fontFamily: "var(--gt-font-mono)" }}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="self-center text-[length:var(--text-body-md)] leading-snug text-[var(--text-body)]">
                      {outcome}
                    </span>
                  </li>
                );
              })}
            </ol>
            {hiddenCount > 0 && (
              <button
                type="button"
                aria-expanded={showAll}
                aria-controls={listId}
                onClick={() => setShowAll((v) => !v)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] px-4 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] sm:hidden"
              >
                {showAll ? t("training.outcomesShowLess") : t("training.outcomesShowAll", { count: hiddenCount })}
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={clsx("transition-transform duration-[var(--duration-normal)]", showAll && "rotate-180")}
                />
              </button>
            )}
          </div>
        )}

        {requirements.length > 0 && (
          <div className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 sm:p-5">
            <h3 className="m-0 flex items-center gap-2 text-[length:var(--text-h4)]">
              <ClipboardList size={17} aria-hidden="true" className="text-[var(--gt-blue-500)]" />
              {t("training.requirementsTitle")}
            </h3>
            <ul className="m-0 grid list-disc gap-1.5 pl-5 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
              {requirements.map((requirement) => (
                <li key={requirement}>{requirement}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
