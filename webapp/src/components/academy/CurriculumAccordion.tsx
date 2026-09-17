import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Award, ChevronDown, Clock, ListVideo, PlayCircle } from "lucide-react";
import clsx from "clsx";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import {
  ASSESSMENT_QUESTION_TOTAL,
  MODULES,
  MODULE_OFFSETS,
  PREVIEW_LESSON_INDEX,
  moduleMinutes,
} from "../../data/lessons";
import { pick } from "../../data/types";

/**
 * The curriculum, module by module.
 *
 * Every module is a disclosure: an `aria-expanded` button owning a region that
 * is really hidden when collapsed, so the lessons inside are out of the tab
 * order and out of the accessibility tree rather than merely invisible. Several
 * modules can be open at once — the point of the section is comparison, and a
 * one-at-a-time accordion forces the reader to close what they just read.
 *
 * The last row is not a module: it is the validation step, which is what
 * actually closes the training. Showing it in the same progression is what makes
 * the assessment read as the final stage rather than as a hurdle bolted on.
 */
export function CurriculumAccordion({ lang }: { lang: string }) {
  const { t } = useTranslation();
  const baseId = useId();
  // The first module is open on arrival: the section has to show what a module
  // looks like inside without asking for a click first.
  const [open, setOpen] = useState<number[]>([0]);

  const allOpen = open.length === MODULES.length;
  const toggle = (i: number) => setOpen((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
  const toggleAll = () => setOpen(allOpen ? [] : MODULES.map((_, i) => i));

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={toggleAll}>
          {allOpen ? t("training.curriculumCollapseAll") : t("training.curriculumExpandAll")}
        </Button>
      </div>

      <ol className="m-0 grid list-none gap-3 p-0">
        {MODULES.map((module, i) => {
          const expanded = open.includes(i);
          const triggerId = `${baseId}-module-${i}`;
          const panelId = `${baseId}-panel-${i}`;

          return (
            <li
              key={module.title.fr}
              className={clsx(
                "overflow-hidden rounded-[var(--radius-card)] border bg-[var(--surface-card)] shadow-[var(--shadow-xs)]",
                "transition-[border-color,box-shadow] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
                expanded ? "border-[var(--border-default)] shadow-[var(--shadow-sm)]" : "border-[var(--border-subtle)]",
                "hover:border-[var(--border-default)] focus-within:border-[var(--border-default)]",
              )}
            >
              <h3 className="m-0">
                <button
                  type="button"
                  id={triggerId}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => toggle(i)}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 p-[var(--space-5)] text-left"
                >
                  <span
                    aria-hidden="true"
                    className="row-span-2 text-[26px] font-[var(--weight-black)] leading-none tracking-[var(--tracking-display)] text-[var(--gt-blue-300)]"
                    style={{ fontFamily: "var(--gt-font-mono)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[length:var(--text-h4)] font-bold text-[var(--text-primary)]">
                    {pick(module.short, lang)}
                  </span>
                  <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className={clsx(
                      "row-span-2 text-[var(--text-muted)] transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
                      expanded && "rotate-180",
                    )}
                  />
                  <span className="col-start-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[length:var(--text-body-sm)] font-normal text-[var(--text-muted)]">
                    <span className="flex items-center gap-1.5">
                      <ListVideo size={13} aria-hidden="true" />
                      {t("course.lessonCount", { count: module.lessons.length })}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock size={13} aria-hidden="true" />
                      {t("training.moduleDuration", { minutes: moduleMinutes(module) })}
                    </span>
                  </span>
                </button>
              </h3>

              <div id={panelId} role="region" aria-labelledby={triggerId} hidden={!expanded}>
                <div className="grid gap-4 border-t border-[var(--border-subtle)] px-[var(--space-5)] pb-[var(--space-5)] pt-4">
                  <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                    {pick(module.summary, lang)}
                  </p>
                  <ol className="m-0 grid list-none gap-1 p-0">
                    {module.lessons.map((lesson, j) => {
                      const flatIndex = MODULE_OFFSETS[i] + j;
                      const preview = flatIndex === PREVIEW_LESSON_INDEX;
                      return (
                        <li
                          key={lesson.title.fr}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-sm)] px-2 py-2 text-[length:var(--text-body-sm)] odd:bg-[var(--surface-sunken)]"
                        >
                          <PlayCircle size={15} aria-hidden="true" className="flex-none text-[var(--gt-blue-500)]" />
                          <span className="flex-1 text-[var(--text-primary)]">{pick(lesson.title, lang)}</span>
                          {preview && (
                            <Badge tone="highlight" size="sm">
                              {t("training.modulePreviewBadge")}
                            </Badge>
                          )}
                          <span className="tabular-nums text-[var(--text-muted)]">{lesson.duration}</span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            </li>
          );
        })}

        {/* The closing step. Not a disclosure: there is nothing to unfold, and
            making it one would promise lessons that do not exist. */}
        <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-1 rounded-[var(--radius-card)] border border-dashed border-[var(--gt-emerald-300)] bg-[var(--gt-emerald-50)] p-[var(--space-5)]">
          <span
            aria-hidden="true"
            className="row-span-3 text-[26px] font-[var(--weight-black)] leading-none tracking-[var(--tracking-display)] text-[var(--accent-cta-ink)]"
            style={{ fontFamily: "var(--gt-font-mono)" }}
          >
            {String(MODULES.length + 1).padStart(2, "0")}
          </span>
          <h3 className="flex items-center gap-2 text-[length:var(--text-h4)] text-[var(--text-primary)]">
            <Award size={17} aria-hidden="true" className="text-[var(--accent-cta-ink)]" />
            {t("training.moduleValidationTitle")}
          </h3>
          <span className="text-[length:var(--text-body-sm)] text-[var(--accent-cta-ink)]">
            {t("training.moduleValidationMeta", { count: ASSESSMENT_QUESTION_TOTAL })}
          </span>
          <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-body)]">
            {t("training.moduleValidationSummary")}
          </p>
        </li>
      </ol>
    </div>
  );
}
