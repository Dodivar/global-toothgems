import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Badge } from "../ui/Badge";
import { QuizQuestion } from "../ui/QuizQuestion";
import { ASSESSMENT_QUESTION_TOTAL, PASS_SCORE, QUIZ } from "../../data/lessons";
import { pick } from "../../data/types";

/**
 * The knowledge assessment, presented as a learning loop rather than an exam.
 *
 * Two deliberate choices run through this section. Nothing here uses the error
 * palette: a score below the pass mark is drawn in the brand blue, never in red,
 * because "not yet" is not an error state. And the meter is explicitly labelled
 * as an example — the visitor reading a sales page has no score, and inventing
 * one for them would be a lie dressed as reassurance.
 */

/** Illustrative figures for the meter. Labelled as an example in the UI. */
const EXAMPLE_SCORE = 72;
const EXAMPLE_TO_REVIEW = 2;

/**
 * The score meter: a track, the learner's position on it, and the pass mark
 * shown as a notch. The required score is also written out underneath, so the
 * threshold is never carried by the notch's position alone.
 */
function ScoreMeter({ score, required }: { score: number; required: number }) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-3">
      <div className="flex items-end justify-between gap-4">
        <span className="grid gap-0.5">
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("training.quizYourScoreLabel")}</span>
          <strong className="text-[34px] font-[var(--weight-black)] leading-none tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            {score}%
          </strong>
        </span>
        <span className="grid justify-items-end gap-0.5 text-right">
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("training.quizRequiredLabel")}</span>
          <strong className="text-[length:var(--text-h4)] leading-none text-[var(--accent-cta-ink)]">{required}%</strong>
        </span>
      </div>

      <div
        role="img"
        aria-label={t("training.quizMeterAria", { score, required })}
        className="relative h-3 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--gt-blue-100)]"
      >
        <span
          className="block h-full rounded-[var(--radius-pill)] bg-[var(--gt-blue-400)] transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out-soft)]"
          style={{ width: `${score}%` }}
        />
        {/* The pass mark, drawn on the track itself. */}
        <span
          aria-hidden="true"
          className="absolute top-0 h-full w-[3px] rounded-[var(--radius-pill)] bg-[var(--accent-cta-ink)]"
          style={{ left: `calc(${required}% - 1.5px)` }}
        />
      </div>

      <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
        {t("training.quizToReview", { count: EXAMPLE_TO_REVIEW })}
      </p>
    </div>
  );
}

/** The loop the learner runs until the score is reached. */
function LearningLoop() {
  const { t } = useTranslation();
  const steps = [
    t("training.quizLoop1"),
    t("training.quizLoop2"),
    t("training.quizLoop3"),
    t("training.quizLoop4"),
    t("training.quizLoop5"),
  ];

  return (
    <div className="grid gap-2">
      <span className="gt-eyebrow">{t("training.quizLoopLabel")}</span>
      <ol className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-2 p-0">
        {steps.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span className="rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-[var(--surface-card)] px-3 py-1.5 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
              {step}
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden="true" className="text-[var(--gt-blue-500)]">
                &rarr;
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AssessmentPanel({ lang }: { lang: string }) {
  const { t } = useTranslation();
  // Remounting the question is the reset: `QuizQuestion` owns its own answer
  // state, and replaying is exactly what the section is promising.
  const [attempt, setAttempt] = useState(0);

  return (
    <div className="grid gap-[clamp(20px,3vw,32px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
      <div className="grid gap-6">
        <div className="grid gap-5 rounded-[var(--radius-card)] border border-[var(--gt-blue-200)] bg-[var(--surface-card)] p-[var(--space-6)] shadow-[var(--shadow-xs)]">
          <div className="flex items-center justify-between gap-3">
            <span className="gt-eyebrow">{t("training.quizMeterTitle")}</span>
            <Badge tone="neutral" size="sm">
              {t("training.quizMeterExample")}
            </Badge>
          </div>
          <ScoreMeter score={EXAMPLE_SCORE} required={PASS_SCORE} />
          <p className="m-0 rounded-[var(--radius-md)] bg-[var(--gt-emerald-50)] p-4 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
            {t("training.quizReassure")}
          </p>
        </div>

        <LearningLoop />

        <ul className="m-0 grid list-none gap-3 p-0">
          {[
            { title: t("training.quizPoint1Title"), body: t("training.quizPoint1Body") },
            { title: t("training.quizPoint2Title"), body: t("training.quizPoint2Body") },
            { title: t("training.quizPoint3Title"), body: t("training.quizPoint3Body", { score: PASS_SCORE }) },
          ].map((point) => (
            <li key={point.title} className="grid gap-1 border-l-2 border-[var(--gt-blue-300)] pl-4">
              <strong className="text-[length:var(--text-body-md)] text-[var(--text-primary)]">{point.title}</strong>
              <span className="text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{point.body}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* A real question from this training's player, playable and replayable. */}
      <div className="grid gap-3 rounded-[var(--radius-xl)] bg-[var(--surface-card)] p-[clamp(16px,2vw,24px)] shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="gt-eyebrow">{t("training.quizSampleEyebrow")}</span>
          <span className="flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("training.quizSampleTotal", { count: ASSESSMENT_QUESTION_TOTAL })}
            {/* Replaying is the whole message of this section, so the attempt
                count is shown and announced rather than silently reset. */}
            {attempt > 0 && (
              <span role="status" aria-live="polite">
                <Badge tone="brand" size="sm" icon={RefreshCw}>
                  {t("training.quizAttempt", { count: attempt + 1 })}
                </Badge>
              </span>
            )}
          </span>
        </div>
        <QuizQuestion
          key={attempt}
          question={pick(QUIZ.question, lang)}
          options={QUIZ.options.map((o) => pick(o, lang))}
          correctIndex={QUIZ.correctIndex}
          explanation={pick(QUIZ.explanation, lang)}
          index={QUIZ.index}
          total={QUIZ.total}
          continueLabel={t("training.quizRetry")}
          onAnswer={() => setAttempt((a) => a + 1)}
        />
        <p className="m-0 px-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("training.quizSampleNote")}</p>
      </div>
    </div>
  );
}
