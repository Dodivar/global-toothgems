import { useTranslation } from "react-i18next";
import { Box, GraduationCap, UserRound } from "lucide-react";
import { Link } from "../../lib/navigation";
import { courseHref } from "../../lib/academyUrl";
import { pick } from "../../data/types";
import type { ProductInclusion } from "../../data/products";

/**
 * What a pack opens besides its articles (decision 139): the Academy course,
 * the months of 3D Studio, and that both open on the buyer's account. Display
 * only — the database grants them once the order is paid. Renders the same on
 * the server and in the browser (no browser state).
 */
export function PackInclusions({ inclusions }: { inclusions: ProductInclusion[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "fr";

  return (
    <section
      aria-labelledby="pack-inclusions-title"
      className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--gt-blue-200)] bg-[var(--surface-brand-wash-strong)] p-[var(--space-5)]"
    >
      <h2 id="pack-inclusions-title" className="m-0 text-[length:var(--text-h4)]">
        {t("product.pack.title")}
      </h2>
      <ul className="m-0 grid list-none gap-3 p-0">
        <li className="flex items-start gap-3">
          <Box size={18} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-700)]" />
          <span className="text-sm text-[var(--text-body)]">{t("product.pack.articles")}</span>
        </li>
        {inclusions.map((inclusion) =>
          inclusion.kind === "course" ? (
            <li key={`course-${inclusion.courseId}`} className="flex items-start gap-3">
              <GraduationCap size={18} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-700)]" />
              <span className="grid gap-0.5 text-sm text-[var(--text-body)]">
                <strong className="text-[var(--text-primary)]">{t("product.pack.course", { title: pick(inclusion.title, lang) })}</strong>
                <span>{t("product.pack.courseHint")}</span>
                <Link
                  to={courseHref(lang === "en" ? (inclusion.slugs.en ?? inclusion.slugs.fr) : inclusion.slugs.fr)}
                  className="w-fit font-semibold text-[var(--text-link)] underline decoration-1 underline-offset-2"
                >
                  {t("product.pack.courseLink")}
                </Link>
              </span>
            </li>
          ) : (
            <li key="studio" className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center text-[11px] font-black text-[var(--gt-blue-700)]">
                3D
              </span>
              <span className="grid gap-0.5 text-sm text-[var(--text-body)]">
                <strong className="text-[var(--text-primary)]">
                  {t("product.pack.studio", { plan: t(`product.pack.plan.${inclusion.plan}`), count: inclusion.months })}
                </strong>
                <span>{t("product.pack.studioHint")}</span>
              </span>
            </li>
          ),
        )}
      </ul>
      <p className="m-0 flex items-start gap-2 border-t border-[var(--gt-blue-200)] pt-3 text-xs text-[var(--text-muted)]">
        <UserRound size={14} aria-hidden="true" className="mt-px flex-none" />
        {t("product.pack.account")}
      </p>
    </section>
  );
}
