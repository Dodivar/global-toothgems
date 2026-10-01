import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "../../lib/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Check, CircleCheck, Lightbulb, ListChecks, RotateCcw, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import type { Answer, Question, Quiz } from "../../data/adminTraining";
import type { ContentLang } from "../../lib/localized";
import { useTrainingMedia } from "../../lib/trainingMedia";
import { attemptsLeft, scoreQuiz, type QuizResult, type QuizScore } from "../../lib/learning/path";
import { contactHref } from "../../data/legal/routes";
import { ProgressRing, ThinProgress } from "./LearningStatus";

/**
 * A module's knowledge check, as the learner takes it.
 *
 * One question at a time — a phone screen holds one question and its answers
 * comfortably, five do not. Every behaviour comes from the settings the
 * administrator chose in the builder: immediate feedback or feedback at the
 * end, whether correct answers are revealed, shuffling (once per attempt, never
 * under the learner's cursor), retries and the number of attempts.
 *
 * The tone is deliberately supportive: a wrong answer is framed as the
 * explanation it unlocks, never in red capitals. Right and wrong always carry
 * an icon and a word, not just a colour.
 *
 * Scoring is `scoreQuiz` — the same deterministic rule the server applies. In
 * production the submitted answers go to the server, which scores and records
 * the attempt; the browser never decides a pass.
 */

type Phase = "intro" | "question" | "result";

function shuffled<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const LETTERS = "ABCDEFGH";

export function QuizPlayer({
  quiz,
  lang,
  result,
  unlimited = false,
  onSubmit,
  continueAction,
  reviewHref,
}: {
  quiz: Quiz;
  lang: ContentLang;
  /** The learner's record for this check; absent in the administrator's preview. */
  result?: QuizResult;
  /** Preview: attempts are not counted. */
  unlimited?: boolean;
  onSubmit: (score: QuizScore) => void;
  /** Shown once the check is passed: the way on through the course. */
  continueAction?: { label: string; onClick: () => void };
  /** The module's first lesson, offered as revision after a miss. */
  reviewHref?: string;
}) {
  const { t } = useTranslation();
  const { urlOf } = useTrainingMedia();
  const [phase, setPhase] = useState<Phase>("intro");
  const [order, setOrder] = useState<Record<string, Answer[]>>({});
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [score, setScore] = useState<QuizScore | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const left = unlimited ? Number.POSITIVE_INFINITY : attemptsLeft(quiz, result);
  const passedBefore = Boolean(result?.passed);
  const total = quiz.questions.length;
  const { immediateFeedback, showAnswers, passingScore, allowRetry } = quiz.settings;

  // Moving between questions moves the reader too: focus lands on the new
  // question, so a screen reader announces it instead of staying on "Next".
  useEffect(() => {
    if (phase !== "intro") heading.current?.focus();
  }, [phase, index]);

  if (total === 0) {
    return (
      <p className="m-0 rounded-[var(--radius-card)] bg-[var(--surface-sunken)] p-5 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
        {t("learning.quiz.empty")}
      </p>
    );
  }

  const start = () => {
    const next: Record<string, Answer[]> = {};
    for (const question of quiz.questions) {
      next[question.id] = quiz.settings.shuffleAnswers ? shuffled(question.answers) : question.answers;
    }
    setOrder(next);
    setChosen({});
    setRevealed({});
    setIndex(0);
    setScore(null);
    setPhase("question");
  };

  const submit = () => {
    const outcome = scoreQuiz(quiz, chosen);
    setScore(outcome);
    setPhase("result");
    onSubmit(outcome);
  };

  /* ------------------------------------------------------------------------ */

  if (phase === "intro") {
    return (
      <section className="grid gap-5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(20px,3.4vw,36px)] shadow-[var(--shadow-xs)]">
        <span className="grid h-12 w-12 place-items-center rounded-[var(--radius-md)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
          <ListChecks size={22} strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="grid gap-2">
          <h2 className="text-[length:var(--text-h3)]">{quiz.title[lang]}</h2>
          {quiz.intro[lang] && (
            <p className="m-0 max-w-[60ch] text-[length:var(--text-body-md)] text-[var(--text-muted)]">{quiz.intro[lang]}</p>
          )}
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-body)]">
          <li className="rounded-[var(--radius-pill)] bg-[var(--surface-sunken)] px-3 py-1.5">
            {t("learning.quiz.questions", { count: total })}
          </li>
          <li className="rounded-[var(--radius-pill)] bg-[var(--surface-sunken)] px-3 py-1.5">
            {t("learning.quiz.passMark", { score: passingScore })}
          </li>
          {!unlimited && !passedBefore && (
            <li className="rounded-[var(--radius-pill)] bg-[var(--surface-sunken)] px-3 py-1.5">
              {t("learning.quiz.attemptsLeft", { count: left })}
            </li>
          )}
        </ul>

        {passedBefore ? (
          <div className="grid gap-4">
            <p role="status" className="m-0 flex items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--status-success-bg)] p-4 text-[length:var(--text-body-sm)] text-[var(--status-success-fg)]">
              <CircleCheck size={18} strokeWidth={2.2} aria-hidden="true" className="mt-0.5 flex-none" />
              <span>
                <strong className="block">{t("learning.quiz.alreadyPassed")}</strong>
                {t("learning.quiz.bestScore", { score: result?.bestScore ?? 0 })}
              </span>
            </p>
            {continueAction && (
              <div>
                <Button variant="primary" iconRight={ArrowRight} onClick={continueAction.onClick}>
                  {continueAction.label}
                </Button>
              </div>
            )}
          </div>
        ) : left > 0 ? (
          <div className="grid gap-3">
            <p className="m-0 flex items-start gap-2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              <Sparkles size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--accent-highlight)]" />
              {t("learning.quiz.reassure")}
            </p>
            <div>
              <Button variant="primary" iconRight={ArrowRight} onClick={start}>
                {result ? t("learning.quiz.retry") : t("learning.quiz.start")}
              </Button>
            </div>
          </div>
        ) : (
          <NoAttemptsLeft reviewHref={reviewHref} />
        )}
      </section>
    );
  }

  /* ------------------------------------------------------------------------ */

  if (phase === "result" && score) {
    const canRetry = !score.passed && (unlimited || (allowRetry && left > 0));
    return (
      <section className="grid gap-6 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(20px,3.4vw,36px)] shadow-[var(--shadow-xs)]">
        <div className="flex flex-wrap items-center gap-5">
          <ProgressRing value={score.score} label={t("learning.quiz.scoreLabel")} tone={score.passed ? "emerald" : "brand"} />
          <div role="status" className="grid min-w-0 flex-1 gap-1.5">
            <h2 ref={heading} tabIndex={-1} className="flex items-center gap-2 text-[length:var(--text-h3)] outline-none">
              {score.passed ? (
                <CircleCheck size={24} strokeWidth={2.2} aria-hidden="true" className="flex-none text-[var(--status-success-fg)]" />
              ) : (
                <Lightbulb size={24} strokeWidth={2.2} aria-hidden="true" className="flex-none text-[var(--gt-blue-600)]" />
              )}
              {score.passed ? t("learning.quiz.passedTitle") : t("learning.quiz.failedTitle")}
            </h2>
            <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">
              {t("learning.quiz.scoreLine", { correct: score.correct, total: score.total, pass: passingScore })}
            </p>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {score.passed ? t("learning.quiz.passedBody") : t("learning.quiz.failedBody")}
            </p>
          </div>
        </div>

        {!immediateFeedback && (
          <ol className="m-0 grid list-none gap-3 p-0">
            {quiz.questions.map((question, i) => (
              <ReviewRow key={question.id} question={question} number={i + 1} chosenId={chosen[question.id]} lang={lang} showAnswers={showAnswers} />
            ))}
          </ol>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {score.passed && continueAction && (
            <Button variant="primary" iconRight={ArrowRight} onClick={continueAction.onClick}>
              {continueAction.label}
            </Button>
          )}
          {canRetry && (
            <Button variant="primary" iconLeft={RotateCcw} onClick={start}>
              {t("learning.quiz.retry")}
            </Button>
          )}
          {!score.passed && reviewHref && (
            <Link
              to={reviewHref}
              className="inline-flex h-[46px] items-center gap-2 rounded-[var(--radius-pill)] px-4 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)]"
            >
              <BookOpen size={16} aria-hidden="true" />
              {t("learning.quiz.reviewModule")}
            </Link>
          )}
          {!score.passed && !unlimited && allowRetry && left > 0 && (
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("learning.quiz.attemptsLeft", { count: left })}
            </span>
          )}
        </div>
        {!score.passed && !canRetry && <NoAttemptsLeft />}
      </section>
    );
  }

  /* ------------------------------------------------------------------------ */

  const question = quiz.questions[index];
  const answers = order[question.id] ?? question.answers;
  const answerId = chosen[question.id];
  const reveal = immediateFeedback && Boolean(revealed[question.id]);
  const last = index === total - 1;
  const selectedAnswer = question.answers.find((a) => a.id === answerId);

  const advance = () => (last ? submit() : setIndex(index + 1));

  return (
    <section className="grid gap-5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(18px,3.4vw,36px)] shadow-[var(--shadow-xs)]">
      <header className="grid gap-2.5">
        <div className="flex items-center justify-between gap-3 text-[length:var(--text-caption)] font-semibold">
          <span className="text-[var(--text-muted)]">{quiz.title[lang]}</span>
          <span className="tabular-nums text-[var(--text-primary)]">
            {t("learning.quiz.questionOf", { current: index + 1, total })}
          </span>
        </div>
        <ThinProgress value={((index + (reveal || !immediateFeedback ? 1 : 0)) / total) * 100} label={t("learning.quiz.progressLabel")} />
      </header>

      <fieldset key={question.id} className="gt-learn-step m-0 grid gap-4 border-0 p-0">
        <legend className="contents">
          <h2 ref={heading} tabIndex={-1} className="text-[clamp(19px,2.2vw,24px)] leading-[var(--leading-snug)] outline-none">
            {question.text[lang]}
          </h2>
        </legend>

        {question.image && urlOf(question.image) && (
          <img src={urlOf(question.image)} alt="" className="max-h-[320px] w-full max-w-[480px] rounded-[var(--radius-media)] object-cover" />
        )}

        <div className="grid gap-2.5">
          {answers.map((option, i) => {
            const selected = answerId === option.id;
            const showAsCorrect = reveal && option.correct && (showAnswers || selected);
            const showAsWrong = reveal && selected && !option.correct;
            return (
              <label
                key={option.id}
                className={clsx(
                  "flex min-h-[56px] cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border-2 p-3 transition-[border-color,background-color,box-shadow] duration-[var(--duration-fast)] sm:p-3.5",
                  "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]",
                  showAsCorrect
                    ? "border-[var(--gt-emerald-500)] bg-[var(--gt-emerald-50)]"
                    : showAsWrong
                      ? "border-[var(--gt-blue-400)] bg-[var(--gt-blue-50)]"
                      : selected
                        ? "border-[var(--gt-ink-900)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-[var(--gt-ink-400)]",
                  reveal && "cursor-default",
                )}
              >
                <input
                  type="radio"
                  name={`quiz-${question.id}`}
                  checked={selected}
                  disabled={reveal}
                  onChange={() => setChosen((prev) => ({ ...prev, [question.id]: option.id }))}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={clsx(
                    "grid h-8 w-8 flex-none place-items-center rounded-full text-[length:var(--text-caption)] font-bold",
                    showAsCorrect
                      ? "bg-[var(--gt-emerald-500)] text-[var(--gt-white)]"
                      : showAsWrong
                        ? "bg-[var(--gt-blue-600)] text-[var(--gt-white)]"
                        : selected
                          ? "bg-[var(--gt-ink-900)] text-[var(--gt-white)]"
                          : "bg-[var(--surface-sunken)] text-[var(--text-muted)]",
                  )}
                >
                  {showAsCorrect ? <Check size={15} strokeWidth={3} /> : showAsWrong ? <X size={15} strokeWidth={3} /> : LETTERS[i]}
                </span>
                <span className="min-w-0 flex-1 text-[length:var(--text-body-md)] text-[var(--text-primary)]">{option.text[lang]}</span>
                {showAsCorrect && (
                  <span className="flex-none text-[length:var(--text-caption)] font-bold text-[var(--status-success-fg)]">
                    {t("learning.quiz.correctTag")}
                  </span>
                )}
                {showAsWrong && (
                  <span className="flex-none text-[length:var(--text-caption)] font-bold text-[var(--gt-blue-700)]">
                    {t("learning.quiz.yourAnswer")}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      {reveal && selectedAnswer && <Feedback question={question} answer={selectedAnswer} lang={lang} showAnswers={showAnswers} />}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] pt-4">
        {!immediateFeedback && index > 0 && (
          <Button variant="ghost" iconLeft={ArrowLeft} onClick={() => setIndex(index - 1)}>
            {t("learning.quiz.previousQuestion")}
          </Button>
        )}
        {immediateFeedback && !reveal ? (
          <Button
            variant="dark"
            disabled={!answerId}
            onClick={() => setRevealed((prev) => ({ ...prev, [question.id]: true }))}
          >
            {t("learning.quiz.check")}
          </Button>
        ) : (
          <Button variant={last ? "primary" : "dark"} iconRight={ArrowRight} disabled={!answerId} onClick={advance}>
            {last ? (immediateFeedback ? t("learning.quiz.seeResult") : t("learning.quiz.submit")) : t("learning.quiz.nextQuestion")}
          </Button>
        )}
        {!answerId && <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("learning.quiz.chooseAnswer")}</span>}
      </div>
    </section>
  );
}

/** Feedback after one answer, in the administrator's own words. */
function Feedback({ question, answer, lang, showAnswers }: { question: Question; answer: Answer; lang: ContentLang; showAnswers: boolean }) {
  const { t } = useTranslation();
  const right = answer.correct;
  const correctAnswer = question.answers.find((a) => a.correct);
  return (
    <div
      role="status"
      className={clsx(
        "gt-celebrate grid gap-2 rounded-[var(--radius-md)] border-l-4 p-4 text-[length:var(--text-body-sm)]",
        right
          ? "border-[var(--gt-emerald-500)] bg-[var(--status-success-bg)] text-[var(--text-body)]"
          : "border-[var(--gt-blue-500)] bg-[var(--status-info-bg)] text-[var(--text-body)]",
      )}
    >
      <strong className={clsx("flex items-center gap-2 text-[length:var(--text-body-md)]", right ? "text-[var(--status-success-fg)]" : "text-[var(--status-info-fg)]")}>
        {right ? <CircleCheck size={18} strokeWidth={2.2} aria-hidden="true" /> : <Lightbulb size={18} strokeWidth={2.2} aria-hidden="true" />}
        {right ? t("learning.quiz.correctTitle") : t("learning.quiz.incorrectTitle")}
      </strong>
      <p className="m-0">{right ? question.correctFeedback[lang] : question.incorrectFeedback[lang]}</p>
      {answer.explanation?.[lang] && <p className="m-0 text-[var(--text-muted)]">{answer.explanation[lang]}</p>}
      {!right && showAnswers && correctAnswer && (
        <p className="m-0">
          <strong>{t("learning.quiz.rightAnswer")}</strong> {correctAnswer.text[lang]}
        </p>
      )}
      {question.learnMore?.[lang] && (
        <p className="m-0 flex items-start gap-1.5 border-t border-[rgba(17,17,17,.08)] pt-2 text-[var(--text-muted)]">
          <Sparkles size={14} aria-hidden="true" className="mt-0.5 flex-none text-[var(--accent-highlight)]" />
          <span>
            <strong className="text-[var(--text-primary)]">{t("learning.quiz.goFurther")} </strong>
            {question.learnMore[lang]}
          </span>
        </p>
      )}
    </div>
  );
}

/** One line of the end-of-check review, used when feedback waits for the end. */
function ReviewRow({
  question,
  number,
  chosenId,
  lang,
  showAnswers,
}: {
  question: Question;
  number: number;
  chosenId: string | undefined;
  lang: ContentLang;
  showAnswers: boolean;
}) {
  const { t } = useTranslation();
  const answer = question.answers.find((a) => a.id === chosenId);
  const right = Boolean(answer?.correct);
  const correct = question.answers.find((a) => a.correct);
  return (
    <li className="grid gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-4">
      <p className="m-0 flex items-start gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
        <span
          className={clsx(
            "mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full",
            right ? "bg-[var(--gt-emerald-500)] text-[var(--gt-white)]" : "bg-[var(--gt-blue-600)] text-[var(--gt-white)]",
          )}
          aria-hidden="true"
        >
          {right ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
        </span>
        <span>
          <span className="sr-only">{right ? t("learning.quiz.correctTitle") : t("learning.quiz.incorrectTitle")} — </span>
          {number}. {question.text[lang]}
        </span>
      </p>
      <p className="m-0 pl-7 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        {t("learning.quiz.yourAnswer")} : {answer?.text[lang] ?? "—"}
        {!right && showAnswers && correct && (
          <>
            {" · "}
            {t("learning.quiz.rightAnswer")} {correct.text[lang]}
          </>
        )}
      </p>
      <p className="m-0 pl-7 text-[length:var(--text-caption)] text-[var(--text-body)]">
        {right ? question.correctFeedback[lang] : question.incorrectFeedback[lang]}
      </p>
    </li>
  );
}

function NoAttemptsLeft({ reviewHref }: { reviewHref?: string }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-2 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash-strong)] p-4 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
      <strong className="text-[var(--text-primary)]">{t("learning.quiz.noAttemptsTitle")}</strong>
      <p className="m-0">{t("learning.quiz.noAttemptsBody")}</p>
      <div className="flex flex-wrap gap-4">
        {reviewHref && (
          <Link to={reviewHref} className="font-semibold underline decoration-1 underline-offset-4">
            {t("learning.quiz.reviewModule")}
          </Link>
        )}
        <Link to={contactHref()} className="font-semibold underline decoration-1 underline-offset-4">
          {t("learning.quiz.contact")}
        </Link>
      </div>
    </div>
  );
}
