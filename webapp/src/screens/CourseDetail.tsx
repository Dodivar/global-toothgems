"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "../lib/navigation";
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleCheck,
  Clock,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { AssessmentPanel } from "../components/academy/AssessmentPanel";
import { CommunityPanel } from "../components/academy/CommunityPanel";
import { CurriculumAccordion } from "../components/academy/CurriculumAccordion";
import { DiplomaPanel } from "../components/academy/DiplomaPanel";
import { TrainingHero } from "../components/academy/TrainingHero";
import { CheckItem, FeatureCard, Section, SectionIntro, StepCard } from "../components/academy/TrainingPrimitives";
import { ReviewsSection } from "../components/reviews/ReviewsSection";
import { pick } from "../data/types";
import { lessonCount, type PublicCourse } from "../lib/academy/publicCourse";
import { formatDuration } from "../lib/trainingFilters";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/cart";
import { courseLineId } from "../lib/checkout/cartLines";
import { useProgress } from "../lib/progress";
import { learnHref } from "../lib/academyUrl";
import { useToast } from "../lib/toast";
import { useFormat } from "../lib/format";

/**
 * The training detail page: the sales page for one Academy course.
 *
 * It answers the visitor's questions in the order they ask them — what this is,
 * why it matters, what they will be able to do, what is inside, how it runs, how
 * the assessment works, what they earn, who they join, why now — and only then
 * asks for the decision. Nothing on it is invented: the title, level, price,
 * duration, objectives, modules, steps and pass marks are the published
 * course's (`lib/academy`, read by the server page: `app/_public/coursePage.tsx`),
 * the diploma is the member area's own document, and what the platform does
 * not have yet — a live forum, a learner's real quiz score — is labelled as a
 * preview and as an example rather than dressed up as real.
 *
 * A real course is sold (`enrolment: "sale"`, phase D): "Buy" puts one seat
 * in the cart, which goes through the same checkout and Stripe payment as the
 * shop; the database grants access once the payment is confirmed, so a member
 * who holds the course is offered to open it instead. The prototype's courses
 * (mock mode) keep the demo enrolment.
 *
 * The route is open, like `/academy`: this is what sells the training, so gating
 * it would hide the thing it advertises. Only the lesson player is gated.
 */
export function CourseDetail({ course }: { course: PublicCourse }) {
  const { formatMoney } = useFormat();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { signedIn, displayName } = useAuth();
  const { openCourse, progressFor, courseFor, status: learningStatus } = useProgress();
  const { lines, addCourse } = useCart();
  const { showToast } = useToast();
  const lang = i18n.language;
  const demo = course.enrolment === "demo";
  const forSale = course.enrolment === "sale" && Boolean(course.dbId);

  const curriculumRef = useRef<HTMLElement>(null);
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  // The sticky mobile bar only appears once the hero's own call to action has
  // scrolled away, so it never duplicates a button already on screen.
  useEffect(() => {
    const el = heroCtaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setShowStickyBar(!entry.isIntersecting), { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [course.id]);

  const title = pick(course.title, lang);
  /**
   * The seeded demo enrolments exist whether or not anyone is signed in, and
   * this page is public: a visitor must never be told they are already enrolled
   * on somebody else's progress. Signed out, the training reads as new; signed
   * in, a real course shows the member's own progress only when they hold it.
   */
  const stored = progressFor(course.id);
  // A real course the member holds (granted, or bought from phase D on) opens from here.
  const holder = signedIn && !demo && stored.enrolled && courseFor(course.id)?.status === "published";
  const progress =
    signedIn && (demo || holder)
      ? stored
      : { ...stored, enrolled: false, completed: false, doneCount: 0, pct: 0, completedOn: null, startedOn: null };
  // While a signed-in member's courses are being read, "buy" waits: they may already hold it.
  const checkingAccess = signedIn && forSale && (learningStatus === "idle" || learningStatus === "loading");
  const inCart = forSale && lines.some((line) => line.id === courseLineId(course.dbId!));
  const startLabel = progress.completed
    ? t("training.ctaReview")
    : progress.enrolled
      ? t("training.ctaResume")
      : t("training.ctaStart");
  const ctaLabel = demo || holder ? startLabel : forSale ? (inCart ? t("training.ctaInCart") : t("training.ctaBuy")) : null;
  const lessons = lessonCount(course);
  const duration = formatDuration(course.minutes, lang);

  /**
   * Course content requires an account — it is the one thing on this page that
   * does. `RequireAccount` guards the player route, but this handler has to
   * check too, otherwise it would announce "course opened" a moment before the
   * guard threw the visitor back out. The training they asked for travels with
   * them, so signing in opens that one rather than whichever course happened to
   * be active. Opening the course also puts it on the account, so the toast
   * stays true.
   */
  const start = () => {
    if (holder) {
      openCourse(course.id);
      navigate(learnHref(course.id));
      return;
    }
    if (forSale) {
      // Indicative price only: create_order() prices the seat again. An account
      // is asked for in the cart, where the basket waits for the sign-in.
      if (!checkingAccess) {
        addCourse({
          courseId: course.dbId!,
          productId: course.id,
          name: title,
          image: course.cover?.src ?? "",
          unitPrice: course.currentPrice.minor,
          currency: course.currentPrice.currency,
        });
        navigate("/panier");
      }
      return;
    }
    if (!demo) return;
    if (!signedIn) {
      navigate("/connexion", { state: { from: "/academy/lecon", course: course.id } });
      return;
    }
    openCourse(course.id);
    navigate("/academy/lecon");
    showToast(t("academy.toastCourseTitle"), t("academy.toastCourseBody", { title }));
  };

  /** Moves the reader to the curriculum and puts the keyboard there with them. */
  const exploreCurriculum = () => {
    const el = curriculumRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  };

  const experience = [
    { icon: BookOpen, title: t("training.exp1Title"), body: t("training.exp1Body"), tone: "brand" as const },
    { icon: Sparkles, title: t("training.exp2Title"), body: t("training.exp2Body"), tone: "fuchsia" as const },
    { icon: HeartHandshake, title: t("training.exp3Title"), body: t("training.exp3Body"), tone: "brand" as const },
    { icon: ShieldCheck, title: t("training.exp4Title"), body: t("training.exp4Body"), tone: "brand" as const },
    { icon: Target, title: t("training.exp5Title"), body: t("training.exp5Body"), tone: "emerald" as const },
  ];

  const outcomes = course.objectives.map((objective) => pick(objective, lang));
  const requirements = course.requirements.map((requirement) => pick(requirement, lang));
  const description = course.description ? pick(course.description, lang).split(/\n{2,}/).filter((p) => p.trim()) : [];

  const journey = [1, 2, 3, 4, 5].map((n) => ({
    title: t(`training.journey${n}Title`),
    body: t(`training.journey${n}Body`),
  }));

  const why = [
    { icon: Sparkles, title: t("training.why1Title"), body: t("training.why1Body") },
    { icon: Clock, title: t("training.why2Title"), body: t("training.why2Body") },
    { icon: CircleCheck, title: t("training.why3Title"), body: t("training.why3Body") },
    { icon: Users, title: t("training.why4Title"), body: t("training.why4Body") },
  ];

  const finalPoints = [1, 2, 3, 4].map((n) => t(`training.finalPoint${n}`));

  return (
    <div>
      <TrainingHero
        course={course}
        lang={lang}
        progress={progress}
        signedIn={signedIn}
        moduleCount={course.modules.length}
        ctaRef={heroCtaRef}
        onStart={start}
        ctaLabel={ctaLabel}
        ctaBusy={checkingAccess}
        onExploreCurriculum={exploreCurriculum}
      />

      {/* 2 — What you'll experience */}
      <Section labelledBy="training-experience">
        <SectionIntro
          id="training-experience"
          eyebrow={t("training.expEyebrow")}
          title={t("training.expTitle")}
          lead={t("training.expLead")}
        />
        {/* Five cards on a six-column grid: three across, then the last two
            spanning half each, so the row never ends on an orphan. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {experience.map((item, i) => (
            <FeatureCard
              key={item.title}
              icon={item.icon}
              title={item.title}
              body={item.body}
              tone={item.tone}
              className={i < 3 ? "lg:col-span-2" : "lg:col-span-3"}
            />
          ))}
        </div>
      </Section>

      {/* 3 — Learning outcomes: the course's own objectives and prerequisites */}
      {(outcomes.length > 0 || requirements.length > 0 || description.length > 0) && (
        <Section tone="sand" labelledBy="training-outcomes">
          <div className="grid gap-[clamp(24px,4vw,56px)] lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] lg:items-start">
            <div className="grid gap-4">
              <SectionIntro
                id="training-outcomes"
                eyebrow={t("training.outcomesEyebrow")}
                title={t("training.outcomesTitle")}
                lead={t("training.outcomesLead", { count: lessons })}
              />
              {description.map((paragraph, i) => (
                <p key={i} className="m-0 max-w-[var(--max-width-prose)] whitespace-pre-line text-[length:var(--text-body-md)] text-[var(--text-body)]">
                  {paragraph}
                </p>
              ))}
            </div>
            <div className="grid gap-6">
              {outcomes.length > 0 && (
                <ul aria-label={t("training.outcomesListLabel")} className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
                  {outcomes.map((outcome) => (
                    <CheckItem key={outcome}>{outcome}</CheckItem>
                  ))}
                </ul>
              )}
              {requirements.length > 0 && (
                <div className="grid gap-3">
                  <h3 className="text-[length:var(--text-h4)]">{t("training.requirementsTitle")}</h3>
                  <ul className="m-0 grid list-disc gap-1.5 pl-5 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                    {requirements.map((requirement) => (
                      <li key={requirement}>{requirement}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* 4 — Curriculum */}
      <section
        id="programme"
        ref={curriculumRef}
        tabIndex={-1}
        aria-labelledby="training-curriculum"
        className="scroll-mt-6 bg-[var(--surface-page)] px-[clamp(14px,4vw,48px)] py-[clamp(56px,7vw,var(--section-y))]"
      >
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-[clamp(20px,3vw,32px)]">
          <SectionIntro
            id="training-curriculum"
            eyebrow={t("training.curriculumEyebrow")}
            title={t("training.curriculumTitle")}
            lead={t("training.curriculumLead", {
              modules: course.modules.length,
              lessons,
              duration,
            })}
          />
          <CurriculumAccordion course={course} lang={lang} />
        </div>
      </section>

      {/* 5 — How the training runs */}
      <Section tone="ink" labelledBy="training-journey">
        <SectionIntro
          id="training-journey"
          eyebrow={t("training.journeyEyebrow")}
          title={t("training.journeyTitle")}
          lead={t("training.journeyLead")}
          dark
        />
        <ol className="m-0 grid list-none gap-x-6 gap-y-8 p-0 sm:grid-cols-2 lg:grid-cols-5">
          {journey.map((step, i) => (
            <StepCard key={step.title} step={i + 1} title={step.title} body={step.body} last={i === journey.length - 1} />
          ))}
        </ol>
      </Section>

      {/* 6 — Questions & answers */}
      <Section tone="wash" labelledBy="training-assessment">
        <SectionIntro
          id="training-assessment"
          eyebrow={t("training.quizEyebrow")}
          title={t("training.quizTitle")}
          lead={t("training.quizLead")}
        />
        <AssessmentPanel lang={lang} passScore={course.minScore} />
      </Section>

      {/* 7 — Diploma, when the course issues one */}
      {course.issuesCertificate && (
        <Section tone="ink" labelledBy="training-diploma">
          <SectionIntro
            id="training-diploma"
            eyebrow={t("training.diplomaEyebrow")}
            title={t("training.diplomaTitle")}
            dark
          />
          <DiplomaPanel
            course={course}
            lang={lang}
            holder={signedIn ? displayName : t("training.diplomaHolderPlaceholder")}
            signedIn={signedIn}
          />
        </Section>
      )}

      {/* 8 — Artist community */}
      <Section labelledBy="training-community">
        <SectionIntro
          id="training-community"
          eyebrow={t("training.communityEyebrow")}
          title={t("training.communityTitle")}
        />
        <CommunityPanel
          onOpenForum={() => showToast(t("common.notIncludedTitle"), t("common.notIncludedForum"), "info")}
        />
      </Section>

      {/* 8b — Student reviews: right after the community, because a review
          here is one artist telling the next what the training changed. */}
      <ReviewsSection subject={{ kind: "course", id: course.id }} />

      {/* 9 — Why this training */}
      <Section tone="sand" labelledBy="training-why">
        <SectionIntro id="training-why" eyebrow={t("training.whyEyebrow")} title={t("training.whyTitle")} center />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-4">
          {why.map((item) => (
            <FeatureCard key={item.title} icon={item.icon} title={item.title} body={item.body} />
          ))}
        </div>
      </Section>

      {/* 10 — Final call to action */}
      <section
        aria-labelledby="training-final"
        className="relative overflow-hidden bg-[var(--surface-inverse)] px-[clamp(14px,4vw,48px)] py-[clamp(56px,8vw,104px)] text-center"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[.18]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, var(--gt-blue-300) 0, transparent 38%), radial-gradient(circle at 80% 30%, var(--gt-emerald-400) 0, transparent 34%), radial-gradient(circle at 55% 95%, var(--gt-fuchsia-400) 0, transparent 40%)",
          }}
        />
        <div className="relative mx-auto grid max-w-[var(--max-width-prose)] justify-items-center gap-5">
          <span className="gt-accent text-[clamp(18px,2.2vw,24px)] text-[var(--gt-blue-300)]">
            {t("training.finalScript")}
          </span>
          <h2
            id="training-final"
            className="text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-off-white)]"
          >
            {t("training.finalTitle")}
          </h2>
          <p className="m-0 text-[length:var(--text-body-lg)] text-[var(--gt-ink-300)]">{t("training.finalBody")}</p>
          {ctaLabel && (
            <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={start} loading={checkingAccess} disabled={checkingAccess}>
              {ctaLabel}
            </Button>
          )}
          <ul className="m-0 flex list-none flex-wrap justify-center gap-x-5 gap-y-2 p-0">
            {finalPoints.map((point) => (
              <li key={point} className="flex items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">
                <Check size={14} strokeWidth={2.5} aria-hidden="true" className="text-[var(--accent-cta)]" />
                {point}
              </li>
            ))}
          </ul>
          <Link
            to="/academy"
            className="text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)] underline decoration-1 underline-offset-4 hover:text-[var(--gt-off-white)]"
          >
            {t("training.notFoundCta")}
          </Link>
        </div>
      </section>

      {/* Sticky mobile bar: the page is long, and the decision should never be
          more than a thumb away once the hero's own button has scrolled off.
          Only where there is a decision to make. */}
      {ctaLabel && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 shadow-[var(--shadow-lg)] transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] lg:hidden"
          style={{ transform: showStickyBar ? "translateY(0)" : "translateY(120%)" }}
          aria-hidden={!showStickyBar}
        >
          <div className="flex items-center gap-3">
            <div className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-xs text-[var(--text-muted)]">{title}</span>
              <strong className="text-sm text-[var(--text-primary)]">{formatMoney(course.currentPrice.minor, course.currentPrice.currency)}</strong>
            </div>
            <Button variant="primary" onClick={start} tabIndex={showStickyBar ? 0 : -1} loading={checkingAccess} disabled={checkingAccess}>
              {progress.enrolled ? t("training.ctaResume") : forSale && !holder ? (inCart ? t("training.ctaInCart") : t("training.stickyBuy")) : t("training.stickyCta")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
