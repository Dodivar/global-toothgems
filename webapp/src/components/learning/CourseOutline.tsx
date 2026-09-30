import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ChevronDown, Clock } from "lucide-react";
import clsx from "clsx";
import type { TrainingCourse } from "../../data/adminTraining";
import { pick } from "../../data/types";
import { lessonHref } from "../../lib/academyUrl";
import { isNodeDone, isUnlocked, type CourseSummary, type LearnerRecord } from "../../lib/learning/path";
import { ModuleStatusBadge, NodeMarker, ThinProgress, type NodeStatus } from "./LearningStatus";

/**
 * The course's table of contents, as the learner moves through it.
 *
 * Modules fold; the one holding the current lesson is open. Each lesson says
 * where it stands with a marker and a word — done, current, available, locked —
 * and a locked lesson says what opens it rather than showing a bare padlock.
 * Used in the player's side panel and, unchanged, in its mobile sheet.
 */
export function CourseOutline({
  courseId,
  course,
  summary,
  record,
  currentKey,
  justCompleted,
  onNavigate,
}: {
  courseId: string;
  course: TrainingCourse;
  summary: CourseSummary;
  record: LearnerRecord;
  currentKey: string | null;
  /** A lesson validated a moment ago, so its tick can pop once. */
  justCompleted?: string | null;
  onNavigate?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const currentModule = summary.path.find((n) => n.key === currentKey)?.moduleId ?? summary.path[summary.nextIndex]?.moduleId;
  const [open, setOpen] = useState<Record<string, boolean>>(() => (currentModule ? { [currentModule]: true } : {}));
  // Moving into the next module unfolds it, without folding what the learner
  // opened by hand.
  const [seenModule, setSeenModule] = useState(currentModule);
  if (currentModule !== seenModule) {
    setSeenModule(currentModule);
    if (currentModule) setOpen((prev) => ({ ...prev, [currentModule]: true }));
  }

  return (
    <ol className="m-0 grid list-none gap-2 p-0">
      {course.modules.map((module, moduleIndex) => {
        const moduleSummary = summary.modules[moduleIndex];
        const expanded = open[module.id] ?? false;
        const nodes = summary.path.map((node, index) => ({ node, index })).filter(({ node }) => node.moduleId === module.id);
        const panelId = `outline-${module.id}`;
        return (
          <li
            key={module.id}
            className={clsx(
              "rounded-[var(--radius-md)] border transition-colors",
              module.id === currentModule ? "border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)]" : "border-transparent",
            )}
          >
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => setOpen((prev) => ({ ...prev, [module.id]: !expanded }))}
              className="grid w-full gap-2 rounded-[var(--radius-md)] p-3 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <span className="flex items-start gap-2">
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
                    {t("learning.moduleNumber", { number: moduleIndex + 1 })}
                  </span>
                  <span className="text-[length:var(--text-body-sm)] font-semibold leading-[var(--leading-snug)] text-[var(--text-primary)]">
                    {pick(module.title, lang)}
                  </span>
                </span>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={clsx("mt-1 flex-none text-[var(--text-muted)] transition-transform duration-[var(--duration-fast)]", expanded && "rotate-180")}
                />
              </span>
              <span className="flex items-center gap-2">
                <ModuleStatusBadge status={moduleSummary.status} />
                <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
                  {t("learning.moduleDone", { done: moduleSummary.done, total: moduleSummary.total })}
                </span>
              </span>
              <ThinProgress
                value={moduleSummary.total ? (moduleSummary.done / moduleSummary.total) * 100 : 0}
                label={t("learning.moduleProgress", { title: pick(module.title, lang) })}
              />
            </button>

            {expanded && (
              <ul id={panelId} className="m-0 grid list-none gap-0.5 p-0 px-1.5 pb-2">
                {nodes.map(({ node, index }) => {
                  const done = isNodeDone(node, record);
                  const unlocked = isUnlocked(index, summary.path, record, course);
                  const current = node.key === currentKey;
                  const status: NodeStatus = current ? "current" : done ? "done" : unlocked ? "open" : "locked";
                  const label = pick(node.title, lang);
                  const statusWord = t(`learning.nodeStatus.${status}`);
                  const content = (
                    <>
                      <NodeMarker status={status} kind={node.kind} number={node.indexInModule + 1} size="sm" celebrate={justCompleted === node.key} />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className={clsx("text-[length:var(--text-body-sm)] leading-[var(--leading-snug)]", current ? "font-bold text-[var(--text-primary)]" : unlocked ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-subtle)]")}>
                          {label}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                          <Clock size={10} aria-hidden="true" />
                          {node.kind === "quiz" ? t("learning.quizMinutes", { minutes: node.minutes }) : t("learning.minutes", { minutes: node.minutes })}
                          <span className="sr-only"> · {statusWord}</span>
                          {done && !current && <span aria-hidden="true"> · {statusWord}</span>}
                        </span>
                      </span>
                    </>
                  );
                  const rowClass = "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-left";
                  return (
                    <li key={node.key}>
                      {unlocked ? (
                        <Link
                          to={lessonHref(courseId, node.key)}
                          onClick={onNavigate}
                          aria-current={current ? "page" : undefined}
                          className={clsx(
                            rowClass,
                            "transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                            current ? "bg-[var(--surface-card)] shadow-[var(--shadow-xs)]" : "hover:bg-[var(--surface-card)]",
                          )}
                        >
                          {content}
                        </Link>
                      ) : (
                        // Not a link: a locked lesson cannot be opened, and it
                        // says so (the marker and the word), plus why.
                        <div className={clsx(rowClass, "cursor-not-allowed")} title={t("learning.lockedHint")}>
                          {content}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
