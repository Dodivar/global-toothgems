import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Lock, Play } from "lucide-react";
import { Button } from "../components/ui/Button";
import { CourseCard } from "../components/ui/CourseCard";
import { COURSES } from "../data/courses";
import { pick } from "../data/types";
import { useAuth } from "../lib/auth";
import { useProgress } from "../lib/progress";
import { useToast } from "../lib/toast";
import { photo } from "../lib/images";
import { useReveal } from "../lib/useReveal";

const STATS = [
  { value: 1840, labelKey: "academy.stat1Label" },
  { value: 14, labelKey: "academy.stat2Label" },
  { value: 39, labelKey: "academy.stat3Label" },
];

/**
 * Counts up to `value` once the number scrolls into view. Renders the final
 * value immediately under reduced motion, and always renders a real number so
 * the figure is never blank.
 */
function CountUp({ value, locale }: { value: number; locale: string }) {
  // Starts at the final value when motion is reduced, so the figure is correct
  // on first paint and the effect never has to walk it back.
  const [shown, setShown] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? value : 0,
  );
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      setShown(value);
      return;
    }

    let raf = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const duration = 1100;
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          // easeOutCubic: fast at first, settles on the final figure.
          setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return <span ref={ref}>{new Intl.NumberFormat(locale).format(shown)}</span>;
}

export function Academy() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { signedIn } = useAuth();
  const { openCourse } = useProgress();
  const { showToast } = useToast();
  const lang = i18n.language;
  const numberLocale = lang.startsWith("en") ? "en-IE" : "fr-FR";

  const coursesRef = useReveal<HTMLDivElement>();
  const communityRef = useReveal<HTMLElement>();

  /**
   * Course content requires an account. RequireAccount already guards the route,
   * but these handlers have to check too: otherwise they would announce
   * "enrolment saved" a moment before the guard threw the visitor back out.
   *
   * Opening a course also puts it on the account, so the member dashboard shows
   * it straight away — the toast says it is enrolled, so it has to be true.
   */
  const openLesson = (courseId: string, toastTitle: string, toastBody: string) => {
    if (!signedIn) {
      navigate("/connexion", { state: { from: "/academy/lecon" } });
      return;
    }
    openCourse(courseId);
    navigate("/academy/lecon");
    showToast(toastTitle, toastBody);
  };

  /** The hero CTAs sell the entry-level course. */
  const enroll = () => openLesson("fondation", t("academy.toastEnrollTitle"), t("academy.toastEnrollBody"));
  const preview = () => openLesson("fondation", t("academy.toastPreviewTitle"), t("academy.toastPreviewBody"));

  return (
    <div>
      <section className="relative overflow-hidden bg-[var(--surface-inverse)] px-[clamp(14px,4vw,48px)] py-[clamp(56px,8vw,104px)] text-[var(--text-inverse)]">
        {/* A faint gem field behind the dark hero: enough to separate the Academy
            from the storefront without competing with the copy. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[.16]"
          style={{
            backgroundImage: `radial-gradient(circle at 18% 22%, var(--gt-blue-300) 0, transparent 38%), radial-gradient(circle at 82% 12%, var(--gt-emerald-400) 0, transparent 34%), radial-gradient(circle at 62% 88%, var(--gt-fuchsia-400) 0, transparent 40%)`,
          }}
        />
        <div className="relative mx-auto grid max-w-[var(--max-width-content)] gap-10">
          <div className="grid max-w-[720px] gap-5">
            <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
              {t("academy.eyebrow")}
            </span>
            <h1
              className="text-[length:var(--text-display-1)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-off-white)]"
              dangerouslySetInnerHTML={{ __html: t("academy.title") }}
            />
            <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-lg)] text-[var(--gt-ink-300)]">{t("academy.body")}</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" size="lg" onClick={enroll}>{t("academy.ctaEnroll")}</Button>
              <Button variant="glass" size="lg" iconLeft={Play} onClick={preview}>{t("academy.ctaPreview")}</Button>
            </div>
            {!signedIn && (
              <p className="m-0 flex items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">
                <Lock size={14} aria-hidden="true" />
                {t("academy.accountRequired")}
              </p>
            )}
          </div>
          <dl aria-label={t("academy.statsLabel")} className="m-0 grid grid-cols-3 gap-6 border-t border-white/15 pt-8">
            {STATS.map((s) => (
              <div key={s.labelKey} className="flex flex-col-reverse gap-1">
                <dt className="text-sm text-[var(--gt-ink-300)]">{t(s.labelKey)}</dt>
                <dd className="m-0 text-[28px] font-[var(--weight-black)] text-[var(--gt-off-white)]">
                  <CountUp value={s.value} locale={numberLocale} />
                </dd>
              </div>
            ))}
          </dl>
          <div ref={coursesRef} className="gt-reveal grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {COURSES.map((c) => (
              <CourseCard
                key={c.id}
                tone="ink"
                course={{
                  id: c.id,
                  title: pick(c.title, lang),
                  level: pick(c.level, lang),
                  lessonCount: c.lessonCount,
                  duration: c.duration,
                  price: c.price,
                  image: c.image,
                }}
                /* The catalogue now opens the training's own page rather than
                   dropping the visitor straight into the player: the detail
                   page is where the curriculum, the assessment, the diploma and
                   the community access are explained. The hero buttons above
                   still start the Foundation directly. */
                onSelect={() => navigate(`/academy/formation/${c.id}`)}
              />
            ))}
          </div>
        </div>
      </section>

      <section ref={communityRef} className="gt-reveal px-[clamp(14px,4vw,48px)] py-[var(--section-y)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-center gap-[clamp(32px,5vw,64px)] lg:grid-cols-2">
          <div className="grid gap-4">
            <span className="gt-eyebrow">{t("academy.communityEyebrow")}</span>
            <h2 className="text-[length:var(--text-h2)]">{t("academy.communityTitle")}</h2>
            {/* Classic editorial drop cap — the intended use of .gt-lettrine,
                which was defined in the design system and never used. */}
            <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-md)] text-[var(--text-body)]">
              <span aria-hidden="true">
                <span className="gt-lettrine float-left mr-2 mt-1">{t("academy.communityBody").charAt(0)}</span>
                {t("academy.communityBody").slice(1)}
              </span>
              <span className="sr-only">{t("academy.communityBody")}</span>
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => showToast(t("common.notIncludedTitle"), t("common.notIncludedArtists"), "info")}>
                {t("academy.communityCta")}
              </Button>
            </div>
          </div>
          <div className="gt-sparkle relative aspect-[4/3] overflow-hidden rounded-[var(--radius-lg)]">
            <img
              src={photo("mouth-04.jpg")}
              alt=""
              loading="lazy"
              decoding="async"
              className="block h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      <section className="px-[clamp(14px,4vw,48px)] pb-[var(--section-y)] text-center">
        <div className="mx-auto flex max-w-[var(--max-width-content)] flex-wrap justify-center gap-3">
          <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={enroll}>{t("academy.ctaEnroll")}</Button>
        </div>
      </section>
    </div>
  );
}
