import { useTranslation } from "react-i18next";
import { Link } from "../../lib/navigation";
import { ArrowRight, CloudOff, Hourglass, Loader2, SearchX, ShoppingBag, Sunrise } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { LearnerAccess } from "../../lib/learning/access";
import { courseHref } from "../../lib/academyUrl";
import { useProgress } from "../../lib/progress";
import { pick } from "../../data/types";

/**
 * The screens a learner meets when a course cannot be opened: still loading,
 * failed to load, unknown, not on the account, withdrawn ("back soon"), still
 * being prepared, or with nothing in it yet. Each says what happened and
 * offers the one useful way on.
 */
export function LearnAccessState({ access, courseId }: { access: LearnerAccess | null; courseId: string }) {
  const { t, i18n } = useTranslation();
  const { courseFor, reload } = useProgress();
  const card = courseFor(courseId);

  if (access?.state === "loading") {
    return (
      <div role="status" className="grid justify-items-center gap-3 px-4 py-[clamp(56px,10vw,120px)] text-[var(--text-muted)]">
        <Loader2 size={28} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
        <span className="text-[length:var(--text-body-sm)]">{t("learning.access.loading")}</span>
      </div>
    );
  }

  let icon: LucideIcon = SearchX;
  let title = t("learning.access.notFoundTitle");
  let body = t("learning.access.notFoundBody");
  let cta: { to: string; label: string } | null = { to: "/compte", label: t("learning.access.toDashboard") };

  if (access?.state === "error") {
    icon = CloudOff;
    title = t("learning.access.errorTitle");
    body = t("learning.access.errorBody");
    cta = null;
  } else if (access?.state === "notEnrolled") {
    icon = ShoppingBag;
    title = t("learning.access.notEnrolledTitle");
    body = t("learning.access.notEnrolledBody", { title: card ? pick(card.title, i18n.language) : "" });
    cta = { to: courseHref(courseId), label: t("learning.access.toCourse") };
  } else if (access?.state === "unavailable") {
    icon = Sunrise;
    title = t("learning.access.unavailableTitle");
    body = t("learning.access.unavailableBody", { title: card ? pick(card.title, i18n.language) : "" });
  } else if (access?.state === "preparing" || access?.state === "empty") {
    icon = Hourglass;
    title = t("learning.access.preparingTitle");
    body = t("learning.access.preparingBody");
  }

  const Icon = icon;
  const ctaClass =
    "mt-2 inline-flex h-[46px] items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--surface-inverse)] px-[22px] text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-inverse)] hover:bg-[var(--gt-ink-700)]";
  return (
    <div className="mx-auto grid max-w-[560px] justify-items-center gap-4 px-4 py-[clamp(56px,10vw,120px)] text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
        <Icon size={28} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <h1 className="text-[length:var(--text-h2)]">{title}</h1>
      <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-muted)]">{body}</p>
      {cta ? (
        <Link to={cta.to} className={ctaClass}>
          {cta.label}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      ) : (
        <button type="button" onClick={reload} className={ctaClass}>
          {t("learning.access.retry")}
        </button>
      )}
    </div>
  );
}
