import { useTranslation } from "react-i18next";
import { Link } from "../../lib/navigation";
import { ArrowRight, Hourglass, SearchX, ShoppingBag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getCourse } from "../../data/courses";
import type { LearnerAccess } from "../../lib/learning/access";
import { courseHref } from "../../lib/academyUrl";
import { pick } from "../../data/types";

/**
 * The screens a learner meets when a course cannot be opened: unknown, not on
 * the account, still being prepared, or with nothing in it yet. Each says what
 * happened and offers the one useful way on.
 */
export function LearnAccessState({ access, courseId }: { access: LearnerAccess | null; courseId: string }) {
  const { t, i18n } = useTranslation();
  const product = getCourse(courseId);

  let icon: LucideIcon = SearchX;
  let title = t("learning.access.notFoundTitle");
  let body = t("learning.access.notFoundBody");
  let cta = { to: "/compte", label: t("learning.access.toDashboard") };

  if (access?.state === "notEnrolled") {
    icon = ShoppingBag;
    title = t("learning.access.notEnrolledTitle");
    body = t("learning.access.notEnrolledBody", { title: product ? pick(product.title, i18n.language) : "" });
    cta = { to: courseHref(courseId), label: t("learning.access.toCourse") };
  } else if (access?.state === "preparing" || access?.state === "empty") {
    icon = Hourglass;
    title = t("learning.access.preparingTitle");
    body = t("learning.access.preparingBody");
  }

  const Icon = icon;
  return (
    <div className="mx-auto grid max-w-[560px] justify-items-center gap-4 px-4 py-[clamp(56px,10vw,120px)] text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
        <Icon size={28} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <h1 className="text-[length:var(--text-h2)]">{title}</h1>
      <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-muted)]">{body}</p>
      <Link
        to={cta.to}
        className="mt-2 inline-flex h-[46px] items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--surface-inverse)] px-[22px] text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-inverse)] hover:bg-[var(--gt-ink-700)]"
      >
        {cta.label}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}
