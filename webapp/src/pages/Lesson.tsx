import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Download, FileText, ListVideo, Lock, Maximize, Pause, Play, Subtitles } from "lucide-react";
import { Button } from "../components/ui/Button";
import { ProgressBar } from "../components/ui/ProgressBar";
import { IconButton } from "../components/ui/IconButton";
import { QuizQuestion } from "../components/ui/QuizQuestion";
import { ReviewRequestCard } from "../components/reviews/ReviewRequestCard";
import {
  FLAT,
  MODULES,
  QUIZ,
  LESSON_POINTS,
  LESSON_POINTS_FALLBACK,
  moduleIndexForFlatIndex,
  parseDuration,
} from "../data/lessons";
import { pick } from "../data/types";
import { useProgress } from "../lib/progress";
import { useReviewRequests } from "../lib/reviews";
import { useToast } from "../lib/toast";
import { photo } from "../lib/images";
import { useIsMobile } from "../lib/useIsMobile";

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function Lesson() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const lang = i18n.language;

  /* Progress lives in the account, not in this page: the member dashboard reads
     the same numbers, so validating a lesson here has to move it there too. */
  const { activeCourse, progressFor, setActiveLesson, completeLesson: validateLesson } = useProgress();
  const { doneCount, activeIdx, remainingMinutes } = progressFor(activeCourse.id);
  // Halfway through (or finished), the course can be reviewed: the player asks
  // once, quietly, below the lesson statistics.
  const reviewRequest = useReviewRequests().find((r) => r.subject.kind === "course" && r.subject.id === activeCourse.id);

  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(31);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [quizCorrect, setQuizCorrect] = useState<boolean | null>(null);
  const [justCompleted, setJustCompleted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const activeLesson = FLAT[activeIdx];
  const activeModuleIdx = moduleIndexForFlatIndex(activeIdx);
  const activeModule = MODULES[activeModuleIdx];
  const durationSeconds = parseDuration(activeLesson.duration);
  const isMobile = useIsMobile();

  const togglePlay = () => {
    if (playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPlaying(false);
      return;
    }
    setPlaying(true);
    intervalRef.current = setInterval(() => {
      setPct((p) => {
        const next = p + 1.2;
        if (next >= 100) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setPlaying(false);
          return 100;
        }
        return next;
      });
    }, 500);
  };

  const resetPlayback = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPlaying(false);
    setPct(0);
  };

  const openLesson = (i: number) => {
    if (i > doneCount) {
      showToast(t("lesson.toastLockedTitle"), t("lesson.toastLockedBody", { title: pick(FLAT[doneCount].title, lang) }), "info");
      return;
    }
    resetPlayback();
    setActiveLesson(i);
    setContentsOpen(false);
  };

  const completeLesson = () => {
    const nextIdx = Math.min(FLAT.length - 1, activeIdx + 1);
    const completedTitle = pick(activeLesson.title, lang);
    const nextTitle = pick(FLAT[nextIdx].title, lang);
    validateLesson(activeIdx);
    resetPlayback();
    setQuizCorrect(null);
    // A brief, non-blocking completion moment. It never gates the next lesson.
    setJustCompleted(true);
    setTimeout(() => setJustCompleted(false), 1600);
    showToast(t("lesson.toastCompleteTitle"), t("lesson.toastCompleteBody", { title: completedTitle, next: nextTitle }));
  };

  const resource = () => showToast(t("lesson.toastResourceTitle"), t("lesson.toastResourceBody"), "info");

  const coursePct = Math.round((doneCount / FLAT.length) * 100);

  const points = LESSON_POINTS[activeIdx] ?? LESSON_POINTS_FALLBACK;
  const nextIdxPreview = Math.min(FLAT.length - 1, activeIdx + 1);

  const lessonBtnSize = isMobile ? "sm" : "md";

  let flatCursor = -1;

  const contents = (
    <>
      <div className="grid gap-2">
        <span className="gt-eyebrow">{t("lesson.eyebrow")}</span>
        <h2 className="text-[length:var(--text-h3)]">{pick(activeCourse.title, lang)}</h2>
      </div>
      <ProgressBar value={coursePct} label={t("lesson.progressLabel", { done: doneCount, total: FLAT.length })} />
      <p className="m-0 text-xs text-[var(--text-muted)]">{t("lesson.remainingVideo", { minutes: remainingMinutes })}</p>

      <div className="grid gap-4">
        {MODULES.map((module) => (
          <div key={module.title.fr} className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
              {pick(module.title, lang)}
            </span>
            {module.lessons.map((lsn) => {
              flatCursor += 1;
              const i = flatCursor;
              const done = i < doneCount;
              const current = i === activeIdx;
              const locked = i > doneCount;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => openLesson(i)}
                  disabled={locked}
                  aria-current={current ? "true" : undefined}
                  /* Locked items now say why, instead of showing a bare padlock. */
                  title={locked ? t("lesson.lockedReason") : undefined}
                  className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-left transition-colors disabled:cursor-not-allowed"
                  style={{ background: current ? "var(--surface-sunken)" : "transparent" }}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[10px] font-semibold"
                    style={{
                      background: done ? "var(--gt-emerald-500)" : current ? "var(--gt-ink-900)" : "transparent",
                      color: done || current ? "#fff" : "var(--text-muted)",
                      border: done || current ? "none" : "1px solid var(--border-default)",
                    }}
                  >
                    {done ? <Check size={12} strokeWidth={3} /> : locked ? "" : i + 1}
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span
                      className="truncate text-sm"
                      style={{ fontWeight: current ? 700 : 500, color: locked ? "var(--text-subtle)" : "var(--text-primary)" }}
                    >
                      {pick(lsn.title, lang)}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {done ? t("lesson.doneStatus", { duration: lsn.duration }) : locked ? t("lesson.lockedStatus", { duration: lsn.duration }) : lsn.duration}
                    </span>
                  </span>
                  {locked && <Lock size={13} color="var(--text-subtle)" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="grid gap-1.5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-4">
        <strong className="text-sm text-[var(--text-primary)]">{t("lesson.certificateTitle")}</strong>
        <span className="text-xs text-[var(--text-muted)]">{t("lesson.certificateBody")}</span>
        {/* The certificate itself lives in the member area, so point at it. */}
        <Link
          to="/compte"
          className="mt-1 justify-self-start text-xs font-semibold text-[var(--text-link)] underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)]"
        >
          {t("lesson.certificateLink")}
        </Link>
      </div>
    </>
  );

  return (
    <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 gap-8 px-[clamp(14px,4vw,48px)] py-[clamp(24px,3vw,48px)] lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* On mobile the full syllabus used to stack above the video, pushing the
          player itself below the fold. It is a disclosure there, a rail here. */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setContentsOpen((v) => !v)}
          aria-expanded={contentsOpen}
          aria-controls="gt-lesson-contents"
          className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2.5">
            <ListVideo size={16} aria-hidden="true" />
            <span className="grid gap-0.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {contentsOpen ? t("lesson.sidebarClose") : t("lesson.sidebarToggle")}
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                {t("lesson.progressLabel", { done: doneCount, total: FLAT.length })} · {coursePct}%
              </span>
            </span>
          </span>
          <ChevronDown size={16} aria-hidden="true" style={{ transform: contentsOpen ? "rotate(180deg)" : "none" }} />
        </button>
        {contentsOpen && (
          <div id="gt-lesson-contents" className="mt-3 grid gap-5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-4">
            {contents}
          </div>
        )}
      </div>

      <aside className="hidden content-start gap-5 lg:sticky lg:top-24 lg:grid">{contents}</aside>

      <div className="grid gap-8">
        <nav aria-label={t("lesson.breadcrumbAcademy")} className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Link to="/academy" className="underline decoration-1 underline-offset-2">
            {t("lesson.breadcrumbAcademy")}
          </Link>
          <span aria-hidden="true">·</span>
          <span>{pick(activeModule.title, lang)}</span>
          <span aria-hidden="true">·</span>
          <span className="text-[var(--text-primary)]" aria-current="page">{t("lesson.lessonLabel", { number: activeIdx + 1 })}</span>
        </nav>

        <h1 className="text-[length:var(--text-h1)]">{pick(activeLesson.title, lang)}</h1>

        <div
          role="group"
          aria-label={t("lesson.playerLabel")}
          className="relative aspect-video overflow-hidden rounded-[var(--radius-lg)] bg-[var(--gt-ink-900)]"
        >
          <img
            src={photo("mouth-04.jpg")}
            alt=""
            decoding="async"
            className="h-full w-full object-cover opacity-70"
          />
          <div className="gt-glass-heavy absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-[var(--radius-lg)] px-4 py-3">
            <IconButton icon={playing ? Pause : Play} label={playing ? t("lesson.pause") : t("lesson.play")} variant="glass" size="sm" onClick={togglePlay} />
            <div
              role="progressbar"
              aria-label={t("lesson.playerLabel")}
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25"
            >
              <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
            </div>
            <span className="whitespace-nowrap text-xs font-medium tabular-nums text-white">
              {formatClock((pct / 100) * durationSeconds)} / {activeLesson.duration}
            </span>
            <IconButton icon={Subtitles} label={t("lesson.captions")} variant="glass" size="sm" onClick={() => showToast(t("lesson.toastCaptionsTitle"), t("lesson.toastCaptionsBody"), "info")} />
            <IconButton icon={Maximize} label={t("lesson.fullscreen")} variant="glass" size="sm" onClick={() => showToast(t("lesson.toastFullscreenTitle"), t("lesson.toastFullscreenBody"), "info")} />
          </div>
          {justCompleted && (
            <div className="gt-celebrate pointer-events-none absolute inset-0 grid place-items-center bg-[var(--gt-ink-900)]/45">
              <span className="flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--gt-emerald-400)] px-5 py-3 text-sm font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)]">
                <Check size={16} strokeWidth={3} aria-hidden="true" />
                {t("lesson.completedCelebration")}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="dark" size={lessonBtnSize} onClick={completeLesson}>
            {isMobile ? t("lesson.completeShort") : t("lesson.completeFull")}
          </Button>
          <Button variant="outline" size={lessonBtnSize} iconLeft={FileText} onClick={resource}>{t("lesson.notes")}</Button>
          <Button variant="ghost" size={lessonBtnSize} iconLeft={Download} onClick={resource}>
            {isMobile ? t("lesson.pdfShort") : t("lesson.pdfFull")}
          </Button>
        </div>

        <dl className="m-0 grid grid-cols-3 gap-4">
          {[
            [`${doneCount}/${FLAT.length}`, t("lesson.statDone")],
            [`${remainingMinutes} min`, t("lesson.statRemaining")],
            /* Unanswered is not the same as wrong: show a dash until the quiz
               has actually been attempted. */
            [quizCorrect == null ? `—/${QUIZ.total}` : `${quizCorrect ? 1 : 0}/${QUIZ.total}`, t("lesson.statQuiz")],
          ].map(([value, label]) => (
            <div key={label} className="flex flex-col-reverse gap-1 rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-4 text-center">
              <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
              <dd className="m-0 text-lg font-bold tabular-nums text-[var(--text-primary)]">{value}</dd>
            </div>
          ))}
        </dl>

        {reviewRequest && <ReviewRequestCard request={reviewRequest} variant="compact" />}

        <div className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-[var(--space-5)]">
          <h2 className="text-[length:var(--text-h4)]">{t("lesson.inThisLessonTitle")}</h2>
          <ul className="m-0 grid gap-2 pl-5 text-sm text-[var(--text-body)]">
            {points.map((p) => (
              <li key={p.fr}>{pick(p, lang)}</li>
            ))}
          </ul>
        </div>

        <div>
          <span className="gt-eyebrow mb-2 block">{t("lesson.quizEyebrow")}</span>
          <QuizQuestion
            key={activeIdx}
            question={pick(QUIZ.question, lang)}
            options={QUIZ.options.map((o) => pick(o, lang))}
            correctIndex={QUIZ.correctIndex}
            explanation={pick(QUIZ.explanation, lang)}
            index={QUIZ.index}
            total={QUIZ.total}
            submitLabel={t("lesson.quizSubmit")}
            continueLabel={t("lesson.quizContinue")}
            onAnswer={(_picked, correct) => {
              setQuizCorrect(correct);
              showToast(
                correct ? t("lesson.toastQuizCorrectTitle") : t("lesson.toastQuizIncorrectTitle"),
                correct ? t("lesson.toastQuizCorrectBody") : t("lesson.toastQuizIncorrectBody"),
                correct ? "success" : "warning",
              );
            }}
          />
        </div>

        <div className="grid gap-3 rounded-[var(--radius-card)] bg-[var(--surface-inverse)] p-[var(--space-6)] text-[var(--text-inverse)]">
          <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
            {t("lesson.nextLessonEyebrow")}
          </span>
          <strong className="text-lg">{pick(FLAT[nextIdxPreview].title, lang)}</strong>
          <span className="text-sm text-[var(--gt-ink-300)]">
            {pick(MODULES[moduleIndexForFlatIndex(nextIdxPreview)].title, lang)} · {FLAT[nextIdxPreview].duration}
          </span>
          <div>
            <Button variant="primary" onClick={completeLesson}>{t("lesson.nextLessonCta")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
