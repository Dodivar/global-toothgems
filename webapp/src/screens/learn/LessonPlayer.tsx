"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams } from "../../lib/navigation";
import { LessonWorkspace, PlayerBar } from "../../components/learning/LessonWorkspace";
import { pick } from "../../data/types";
import { completionHref, learnHref, lessonHref } from "../../lib/academyUrl";
import { isNodeDone, isUnlocked } from "../../lib/learning/path";
import { useProgress } from "../../lib/progress";
import { useToast } from "../../lib/toast";
import { LearnAccessState } from "./LearnAccessState";
import { useLearnerCourse } from "./useLearnerCourse";

/**
 * The learning interface, for a learner on their own account.
 *
 * The layout is `LessonWorkspace` (shared with the back office's preview); this
 * screen owns the record: it reads the learner's progress, and validating a
 * step is the primary action — reading a lesson's URL never marks it done.
 */
export function LessonPlayer() {
  const { courseId = "", nodeKey = "" } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { visitNode, completeStep, quizGrader } = useProgress();
  const { card, access, training, record, summary, progress } = useLearnerCourse(courseId);
  const [saving, setSaving] = useState(false);
  const [justCompleted, setJustCompleted] = useState<string | null>(null);

  const index = summary ? summary.path.findIndex((n) => n.key === nodeKey) : -1;
  const node = summary && index >= 0 ? summary.path[index] : undefined;
  const unlocked = Boolean(node && training && record && summary && isUnlocked(index, summary.path, record, training));
  const nodeKind = node?.kind;
  // One grader per check on screen: it holds the attempt being answered.
  const grader = useMemo(
    () => (nodeKind === "quiz" ? quizGrader(courseId, nodeKey) : null),
    [courseId, nodeKey, nodeKind, quizGrader],
  );

  useEffect(() => {
    if (node && unlocked) visitNode(courseId, node.key);
  }, [courseId, node, unlocked, visitNode]);

  useEffect(() => {
    if (!justCompleted) return;
    const timer = setTimeout(() => setJustCompleted(null), 1800);
    return () => clearTimeout(timer);
  }, [justCompleted]);

  if (access.state !== "open" || !training || !record || !summary) {
    return (
      <div className="min-h-screen bg-[var(--surface-page)]">
        <PlayerBar back={{ to: learnHref(courseId), label: t("learning.backToOverview") }} title={card ? pick(card.title, lang) : ""} />
        <LearnAccessState access={access} courseId={courseId} />
      </div>
    );
  }
  if (!node) return <Navigate to={learnHref(courseId)} replace />;

  const done = isNodeDone(node, record);
  const nextNode = summary.path[index + 1];
  const prevNode = summary.path[index - 1];

  const advance = async () => {
    if (saving) return;
    if (node.kind === "step" && !done) {
      // The server validates the step (and refuses a locked one); move on only once it is recorded.
      setSaving(true);
      const saved = await completeStep(courseId, node.key);
      setSaving(false);
      if (!saved) {
        showToast(t("learning.toast.saveFailedTitle"), t("learning.toast.saveFailedBody"), "error");
        return;
      }
      setJustCompleted(node.key);
      showToast(
        t("learning.toast.lessonDone"),
        nextNode ? t("learning.toast.upNext", { title: pick(nextNode.title, lang) }) : undefined,
      );
    }
    navigate(nextNode ? lessonHref(courseId, nextNode.key) : completionHref(courseId));
  };

  const goPrevious = () => prevNode && navigate(lessonHref(courseId, prevNode.key));

  return (
    <LessonWorkspace
      course={training}
      summary={summary}
      record={record}
      node={node}
      unlocked={unlocked}
      grader={grader}
      justCompleted={justCompleted}
      lessonHref={(key) => lessonHref(courseId, key)}
      back={{ to: learnHref(courseId), label: t("learning.backToOverview") }}
      completionHref={completionHref(courseId)}
      completed={progress.completed}
      onAdvance={advance}
      onPrevious={goPrevious}
      onGoTo={(key) => navigate(lessonHref(courseId, key))}
      onQuizSubmitted={(score) => {
        if (score.passed) {
          setJustCompleted(node.key);
          showToast(t("learning.toast.quizPassed"), t("learning.toast.quizPassedBody", { score: score.score }));
        }
      }}
    />
  );
}
