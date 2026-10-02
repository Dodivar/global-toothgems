import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Stars } from "../reviews/Stars";
import { Link } from "../../lib/navigation";
import { pick } from "../../data/types";
import type { CustomerReview } from "../../data/reviewSystem";
import { courseHref } from "../../lib/academyUrl";
import { courseSlug, type PublicCourse } from "../../lib/academy/publicCourse";
import { publicDate } from "../../lib/reviewRules";
import { useReviewAuthor, useReviews } from "../../lib/reviews";
import { useReveal } from "../../lib/useReveal";

/** Reviews shown: enough to reassure, few enough to stay a glance. */
const LIMIT = 3;

/**
 * Social proof: the newest published reviews of the courses on the
 * catalogue, from the review store (moderated reviews only). Nothing is
 * written for the page: with no published course review the section is not
 * rendered at all. Course reviews are not stored in the database yet, so
 * on a live project it stays out of the page until they are.
 */
export function LearnerReviews({ courses, lang }: { courses: PublicCourse[]; lang: string }) {
  const { reviews, loading } = useReviews();
  const shown = useMemo(() => {
    const ids = new Set(courses.map((course) => course.id));
    return reviews
      .filter((review) => review.status === "published" && review.subject.kind === "course" && ids.has(review.subject.id))
      // Newest first, like the home page's feed: never picked by rating.
      .sort((a, b) => publicDate(b).localeCompare(publicDate(a)))
      .slice(0, LIMIT);
  }, [reviews, courses]);

  if (loading || shown.length === 0) return null;
  return <ReviewsBand reviews={shown} courses={courses} lang={lang} />;
}

function ReviewsBand({ reviews, courses, lang }: { reviews: CustomerReview[]; courses: PublicCourse[]; lang: string }) {
  const { t } = useTranslation();
  const authorOf = useReviewAuthor();
  const ref = useReveal<HTMLElement>();
  const locale = lang.startsWith("en") ? "en" : "fr";

  return (
    <section ref={ref} aria-labelledby="academy-proof-title" className="gt-reveal gt-alt-section bg-[var(--surface-page)]">
      <div className="gt-alt-wide grid gap-[clamp(28px,4vw,56px)] px-[var(--gt-alt-gutter)]">
        <div className="grid max-w-[720px] gap-4">
          <span className="gt-eyebrow">{t("academyPage.proof.eyebrow")}</span>
          <h2 id="academy-proof-title" className="gt-alt-h2">{t("academyPage.proof.title")}</h2>
          <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-muted)]">{t("academyPage.proof.lead")}</p>
        </div>
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          {reviews.map((review) => {
            const course = courses.find((c) => c.id === review.subject.id);
            return (
              <li key={review.id}>
                <figure className="m-0 grid h-full content-start gap-4 rounded-[var(--radius-xl)] bg-[var(--gt-emerald-50)] p-[clamp(22px,2.4vw,32px)]">
                  <Stars rating={review.rating} tone="accent" size={16} />
                  <blockquote lang={review.lang} className="m-0 grid gap-2">
                    <p className="m-0 text-[length:var(--text-h4)] font-bold leading-snug text-[var(--text-primary)]">{review.title}</p>
                    <p className="m-0 line-clamp-5 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{review.body}</p>
                  </blockquote>
                  <figcaption className="mt-auto grid gap-1 text-[length:var(--text-body-sm)]">
                    <span className="font-semibold text-[var(--text-primary)]">{authorOf(review)}</span>
                    {course && (
                      <Link to={courseHref(courseSlug(course, locale))} className="text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]">
                        {t("academyPage.proof.course", { title: pick(course.title, lang) })}
                      </Link>
                    )}
                  </figcaption>
                </figure>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
