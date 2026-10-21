"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams, useSearchParams } from "../../lib/navigation";
import { Award, Eye, GraduationCap, RotateCcw, X } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { EmptyState } from "../../components/admin/EmptyState";
import { LessonWorkspace, PlayerBar } from "../../components/learning/LessonWorkspace";
import type { TrainingCourse } from "../../data/adminTraining";
import { localGrader } from "../../lib/learning/grading";
import { emptyRecord, summarize, type LearnerRecord } from "../../lib/learning/path";
import { useAdminTraining } from "../../lib/adminTraining";
import { useLocalized } from "../../lib/localized";

/**
 * The course as a learner meets it.
 *
 * The very workspace the learner's player renders (`LessonWorkspace`), not a
 * lookalike: same bar, same lesson column, same contents and progress, same
 * knowledge check. Only the record differs — it lives in this page and is
 * thrown away on leaving, so nothing here writes to the course or to anyone's
 * progress. Checks are graded in the browser (the preview holds the answer
 * keys).
 *
 * Unlike a learner, the administrator can open any lesson from the contents
 * (nothing is locked), while "Next" after a knowledge check still waits for it
 * to be passed, exactly as it will for a learner.
 *
 * The node on screen is in the address (`?etape=<node key>`, or `?module=<id>`
 * for a module's first node), which is what makes the builder's "Preview this
 * step" open on that step.
 */
const BANNER_HEIGHT = 48;

export function TrainingPreview() {
  const { t } = useTranslation();
  const L = useLocalized();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { getCourse, loading } = useAdminTraining();
  const course = getCourse(id);

  const [record, setRecord] = useState<LearnerRecord>(() => emptyRecord(new Date().toISOString().slice(0, 10)));
  const [finished, setFinished] = useState(false);
  const [justCompleted, setJustCompleted] = useState<string | null>(null);

  const summary = useMemo(() => (course ? summarize(course, record) : null), [course, record]);

  const wantedStep = params.get("etape");
  const wantedModule = params.get("module");
  const path = summary?.path ?? [];
  const found = wantedStep
    ? path.findIndex((n) => n.key === wantedStep)
    : wantedModule
      ? path.findIndex((n) => n.moduleId === wantedModule)
      : -1;
  const index = found >= 0 ? found : 0;
  const node = path[index];

  const quiz = node?.kind === "quiz" && course ? course.modules[node.moduleIndex].quiz : undefined;
  const grader = useMemo(() => (quiz ? localGrader(quiz) : null), [quiz]);

  // Only the query changes from one node to the next, which keeps the scroll
  // position: start each lesson at its top, as the learner's pages do.
  const shownKey = node?.key;
  useEffect(() => {
    if (shownKey) window.scrollTo({ top: 0 });
  }, [shownKey]);

  useEffect(() => {
    if (!justCompleted) return;
    const timer = setTimeout(() => setJustCompleted(null), 1800);
    return () => clearTimeout(timer);
  }, [justCompleted]);

  if (!course || !summary) {
    return loading ? (
      <p className="m-0 p-8 text-center text-[var(--text-muted)]" role="status">
        {t("admin.training.builder.loading")}
      </p>
    ) : (
      <Navigate to="/admin/formations" replace />
    );
  }

  const builderPath = `/admin/formations/${course.id}`;
  const previewHref = (key: string) => `${builderPath}/apercu?etape=${encodeURIComponent(key)}`;
  const exit = () => navigate(builderPath);
  const back = { to: builderPath, label: t("admin.training.preview.backToBuilder") };
  const banner = <PreviewBanner onExit={exit} />;
  const restart = () => {
    setFinished(false);
    setRecord(emptyRecord(new Date().toISOString().slice(0, 10)));
    navigate(previewHref(path[0]?.key ?? ""));
  };

  if (!node || finished) {
    return (
      <div className="min-h-screen bg-[var(--surface-page)]">
        <PlayerBar back={back} title={L(course.title)} banner={banner} />
        <div className="mx-auto max-w-[720px] px-[clamp(16px,3vw,40px)] py-12">
          {node ? (
            <CompletionCard course={course} onRestart={restart} onExit={exit} />
          ) : (
            <div className="gt-admin-panel">
              <EmptyState
                icon={GraduationCap}
                title={t("admin.training.preview.emptyTitle")}
                body={t("admin.training.preview.emptyBody")}
                action={
                  <AdminButton variant="primary" onClick={exit}>
                    {t("admin.training.preview.backToBuilder")}
                  </AdminButton>
                }
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  const nextNode = path[index + 1];
  const prevNode = path[index - 1];

  const advance = () => {
    if (node.kind === "step" && !record.completedSteps.includes(node.key)) {
      setRecord((prev) => ({ ...prev, completedSteps: [...prev.completedSteps, node.key] }));
      setJustCompleted(node.key);
    }
    if (nextNode) navigate(previewHref(nextNode.key));
    else setFinished(true);
  };

  return (
    <LessonWorkspace
      course={course}
      summary={summary}
      record={record}
      node={node}
      unlocked
      allUnlocked
      grader={grader}
      justCompleted={justCompleted}
      lessonHref={previewHref}
      back={back}
      banner={banner}
      bannerHeight={BANNER_HEIGHT}
      onAdvance={advance}
      onPrevious={() => prevNode && navigate(previewHref(prevNode.key))}
      onGoTo={(key) => navigate(previewHref(key))}
      onQuizSubmitted={(score) => {
        // The learner's record rules, without the server: attempts counted,
        // best score kept, a pass stays a pass.
        setRecord((prev) => {
          const previous = prev.quizResults[node.key];
          return {
            ...prev,
            quizResults: {
              ...prev.quizResults,
              [node.key]: {
                attempts: (previous?.attempts ?? 0) + 1,
                bestScore: Math.max(previous?.bestScore ?? 0, score.score),
                passed: Boolean(previous?.passed) || score.passed,
              },
            },
          };
        });
        if (score.passed) setJustCompleted(node.key);
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The preview banner.
 *
 * Part of the workspace's sticky header, high contrast and always carrying its
 * way out. A preview an administrator cannot tell apart from the real thing is
 * how mock content ends up being treated as published.
 */
function PreviewBanner({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="border-b border-[var(--gt-ink-700)] bg-[var(--gt-ink-900)] text-[var(--text-inverse)]">
      <div className="mx-auto flex min-h-12 max-w-[1680px] items-center gap-3 px-[clamp(12px,3vw,40px)] py-1.5">
        <span
          aria-hidden="true"
          className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[var(--accent-cta)] text-[var(--gt-ink-900)]"
        >
          <Eye size={14} strokeWidth={2.2} />
        </span>
        <p className="m-0 flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 leading-tight">
          <strong className="text-[length:var(--text-body-sm)] font-bold">{t("admin.training.preview.banner")}</strong>
          <span className="hidden text-[length:var(--text-caption)] text-[rgba(250,250,248,.68)] sm:inline">
            {t("admin.training.preview.bannerBody")}
          </span>
        </p>
        <AdminButton variant="primary" size="sm" iconLeft={X} onClick={onExit}>
          {t("admin.training.preview.exit")}
        </AdminButton>
      </div>
    </div>
  );
}

function CompletionCard({
  course,
  onRestart,
  onExit,
}: {
  course: TrainingCourse;
  onRestart: () => void;
  onExit: () => void;
}) {
  const { t } = useTranslation();
  const L = useLocalized();

  return (
    <article className="gt-admin-panel grid justify-items-center gap-4 p-[clamp(28px,4vw,48px)] text-center">
      <span
        aria-hidden="true"
        className="gt-celebrate grid h-16 w-16 place-items-center rounded-full bg-[var(--gt-emerald-50)] text-[var(--accent-cta-ink)]"
      >
        <Award size={30} strokeWidth={1.8} />
      </span>
      <h2 className="text-[length:var(--text-h2)]">{t("admin.training.preview.completeTitle")}</h2>
      <p className="m-0 max-w-[48ch] text-[length:var(--text-body-md)] text-[var(--text-muted)]">
        {t("admin.training.preview.completeBody")}
      </p>
      <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{L(course.title)}</p>
      {course.completion.certificate && (
        <p className="m-0 rounded-[var(--radius-pill)] bg-[var(--gt-blue-50)] px-4 py-2 text-[length:var(--text-caption)] text-[var(--gt-blue-700)]">
          {t("admin.training.preview.completeCertificate")}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        <AdminButton variant="outline" iconLeft={RotateCcw} onClick={onRestart}>
          {t("admin.training.preview.quizRetry")}
        </AdminButton>
        <AdminButton variant="primary" iconLeft={X} onClick={onExit}>
          {t("admin.training.preview.exit")}
        </AdminButton>
      </div>
    </article>
  );
}
