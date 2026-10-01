import { describe, expect, it } from "vitest";
import { TRAINING_COURSES } from "../../data/adminTrainingSeed";
import type { TrainingCourse } from "../../data/adminTraining";
import { learnerAccess } from "./access";
import type { LearnerCourseCard } from "./learnerCourse";
import {
  attemptsLeft,
  buildPath,
  completeStep,
  emptyRecord,
  frontier,
  isUnlocked,
  quizKey,
  recordQuizAttempt,
  scoreQuiz,
  summarize,
} from "./path";
import { safeHref, sanitizeHtml } from "./sanitizeHtml";

const AT = "2026-09-30T10:00:00.000Z";
const course = TRAINING_COURSES.find((c) => c.id === "pose-professionnelle")!;

/** Walks a learner through `count` nodes, passing every check with 100 %. */
function walk(target: TrainingCourse, count: number) {
  let record = emptyRecord("2026-09-01");
  for (const node of buildPath(target).slice(0, count)) {
    record = node.kind === "step" ? completeStep(target, record, node.key, AT) : recordQuizAttempt(target, record, node.key, 100, AT);
  }
  return record;
}

describe("buildPath", () => {
  it("lists every step in order, each module's check after its last step", () => {
    const path = buildPath(course);
    const expected = course.modules.flatMap((m) => [...m.steps.map((s) => s.id), ...(m.quiz ? [quizKey(m.id)] : [])]);
    expect(path.map((n) => n.key)).toEqual(expected);
    expect(path.filter((n) => n.kind === "quiz")).toHaveLength(course.modules.filter((m) => m.quiz).length);
  });
});

describe("gating", () => {
  it("opens only the first node for a new learner", () => {
    const path = buildPath(course);
    const record = emptyRecord("2026-09-01");
    expect(isUnlocked(0, path, record, course)).toBe(true);
    expect(isUnlocked(1, path, record, course)).toBe(false);
  });

  it("refuses to complete a locked step", () => {
    const path = buildPath(course);
    const record = emptyRecord("2026-09-01");
    expect(completeStep(course, record, path[2].key, AT)).toBe(record);
  });

  it("keeps the next module locked until the check is passed", () => {
    const path = buildPath(course);
    const firstQuiz = path.findIndex((n) => n.kind === "quiz");
    let record = walk(course, firstQuiz);
    record = recordQuizAttempt(course, record, path[firstQuiz].key, 20, AT);
    expect(frontier(path, record, course)).toBe(firstQuiz);
    expect(isUnlocked(firstQuiz + 1, path, record, course)).toBe(false);
    record = recordQuizAttempt(course, record, path[firstQuiz].key, 80, AT);
    expect(isUnlocked(firstQuiz + 1, path, record, course)).toBe(true);
  });

  it("does not gate on checks when the course does not require them", () => {
    const relaxed: TrainingCourse = { ...course, completion: { ...course.completion, allQuizzes: false } };
    const path = buildPath(relaxed);
    const firstQuiz = path.findIndex((n) => n.kind === "quiz");
    const record = walk(relaxed, firstQuiz);
    expect(isUnlocked(firstQuiz + 1, path, record, relaxed)).toBe(true);
  });

  it("ignores progress on steps that no longer exist", () => {
    const record = { ...emptyRecord("2026-09-01"), completedSteps: ["deleted-step"] };
    expect(summarize(course, record).doneCount).toBe(0);
  });
});

describe("summarize", () => {
  it("reports module and course progress", () => {
    const moduleOneSize = buildPath(course).filter((n) => n.moduleIndex === 0).length;
    const summary = summarize(course, walk(course, moduleOneSize));
    expect(summary.modules[0].status).toBe("completed");
    expect(summary.modules[1].status).toBe("notStarted");
    expect(summary.modules[2].status).toBe("locked");
    expect(summary.modulesDone).toBe(1);
    expect(summary.nextIndex).toBe(moduleOneSize);
    expect(summary.completed).toBe(false);
    expect(summary.remainingMinutes).toBeLessThan(summary.totalMinutes);
  });

  it("completes the course and stamps the date once", () => {
    const record = walk(course, buildPath(course).length);
    const summary = summarize(course, record);
    expect(summary.completed).toBe(true);
    expect(summary.pct).toBe(100);
    expect(summary.remainingMinutes).toBe(0);
    expect(record.completedOn).toBe("2026-09-30");
  });

  it("withholds completion while the average score is under the course minimum", () => {
    const strict: TrainingCourse = { ...course, completion: { ...course.completion, allQuizzes: false, minScore: 90 } };
    let record = emptyRecord("2026-09-01");
    for (const node of buildPath(strict)) {
      record = node.kind === "step" ? completeStep(strict, record, node.key, AT) : recordQuizAttempt(strict, record, node.key, 60, AT);
    }
    expect(summarize(strict, record).completed).toBe(false);
    expect(record.completedOn).toBeNull();
  });
});

describe("knowledge checks", () => {
  const quiz = course.modules[0].quiz!;

  it("scores deterministically from the chosen answers", () => {
    const allRight = Object.fromEntries(quiz.questions.map((q) => [q.id, q.answers.find((a) => a.correct)!.id]));
    expect(scoreQuiz(quiz, allRight)).toMatchObject({ correct: quiz.questions.length, score: 100, passed: true });
    expect(scoreQuiz(quiz, {})).toMatchObject({ correct: 0, score: 0, passed: false });
  });

  it("counts attempts down and stops accepting them", () => {
    const limited = { ...quiz, settings: { ...quiz.settings, allowRetry: true, attempts: 2 } };
    expect(attemptsLeft(limited, undefined)).toBe(2);
    expect(attemptsLeft(limited, { attempts: 1, bestScore: 20, passed: false })).toBe(1);
    expect(attemptsLeft(limited, { attempts: 2, bestScore: 20, passed: false })).toBe(0);
    expect(attemptsLeft({ ...limited, settings: { ...limited.settings, allowRetry: false } }, undefined)).toBe(1);
  });

  it("keeps the best score and a pass once earned", () => {
    const path = buildPath(course);
    const index = path.findIndex((n) => n.kind === "quiz");
    let record = walk(course, index);
    record = recordQuizAttempt(course, record, path[index].key, 100, AT);
    record = recordQuizAttempt(course, record, path[index].key, 0, AT);
    expect(record.quizResults[path[index].key]).toMatchObject({ bestScore: 100, passed: true, attempts: 1 });
  });
});

describe("learnerAccess", () => {
  const byId = (id: string) => TRAINING_COURSES.find((c) => c.id === id)!;
  const cardOf = (course: TrainingCourse | undefined): LearnerCourseCard => ({
    id: "course",
    title: { fr: "", en: "" },
    summary: { fr: "", en: "" },
    level: "all",
    cover: "",
    status: course?.status ?? "published",
    issuesCertificate: true,
  });
  const access = (course: TrainingCourse | undefined, enrolled = true) =>
    learnerAccess("ready", cardOf(course), course, enrolled).state;

  it("waits for the held courses, and says when they failed", () => {
    expect(learnerAccess("loading", undefined, undefined, false).state).toBe("loading");
    expect(learnerAccess("idle", undefined, undefined, false).state).toBe("loading");
    expect(learnerAccess("error", undefined, undefined, false).state).toBe("error");
  });

  it("requires an enrolment", () => {
    expect(access(byId("pose-professionnelle"), false)).toBe("notEnrolled");
    expect(learnerAccess("ready", undefined, undefined, true).state).toBe("notEnrolled");
  });

  it("never opens a draft", () => {
    expect(access(byId("cristaux-charms"))).toBe("preparing");
    expect(access(undefined)).toBe("preparing");
  });

  it("opens a published course", () => {
    expect(access(byId("pose-professionnelle"))).toBe("open");
  });

  it("keeps a withdrawn course closed, even for its holders (owner, 2026-10-01)", () => {
    const withdrawn = { ...byId("pose-professionnelle"), status: "unpublished" as const };
    expect(access(withdrawn)).toBe("unavailable");
    expect(learnerAccess("ready", { ...cardOf(withdrawn), status: "unpublished" }, undefined, true).state).toBe("unavailable");
  });
});

describe("sanitizeHtml", () => {
  it("keeps the authored subset", () => {
    const html = "<h3>Title</h3><p>Some <strong>bold</strong> and <em>soft</em> text.</p><ul><li>One</li></ul>";
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("drops scripts, handlers and unknown tags", () => {
    expect(sanitizeHtml('<p onclick="x()">Hi</p><script>alert(1)</script>')).toBe("<p>Hi</p>");
    expect(sanitizeHtml('<img src=x onerror="alert(1)"><p>ok</p>')).toBe("<p>ok</p>");
    expect(sanitizeHtml('<div style="x"><span>text</span></div>')).toBe("text");
  });

  it("only keeps safe link targets", () => {
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com" rel="noopener noreferrer" target="_blank">x</a>',
    );
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(safeHref("java&#115;cript:alert(1)")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("java\tscript:alert(1)")).toBeNull();
    expect(() => sanitizeHtml('<a href="&#99999999;">x</a>')).not.toThrow();
  });

  it("does not let quoted brackets smuggle attributes", () => {
    const out = sanitizeHtml('<a title=">" onmouseover="alert(1)">x</a>');
    expect(out).not.toMatch(/<a[^>]*onmouseover/);
  });

  it("closes what it opened and ignores stray closers", () => {
    expect(sanitizeHtml("<p><strong>open")).toBe("<p><strong>open</strong></p>");
    expect(sanitizeHtml("text</p>")).toBe("text");
  });
});
