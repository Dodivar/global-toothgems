import { useTranslation } from "react-i18next";
import { ArrowRight, Award, MonitorPlay, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";
import { photo } from "../../lib/images";
import type { PublicCourse } from "../../lib/academy/publicCourse";

/**
 * Académie B's opening, phone first: what the Academy is, one green way in
 * and three facts counted from the published catalogue. No course is named
 * here — the featured course follows right under it — and the photograph only
 * joins the copy once there is room beside it, so on a phone the catalogue
 * starts within the first screen.
 */
export function HeroB({ courses, onExplore }: { courses: PublicCourse[]; onExplore: () => void }) {
  const { t } = useTranslation();
  const certificate = courses.some((course) => course.issuesCertificate);

  const highlights = [
    courses.length > 0 && { icon: Sparkles, label: t("academyPage.hero.chipCourses", { count: courses.length }) },
    { icon: MonitorPlay, label: t("academyPage.hero.chipPace") },
    certificate && { icon: Award, label: t("academyPage.hero.chipCertificate") },
  ].filter((item): item is { icon: typeof Sparkles; label: string } => Boolean(item));

  return (
    <header className="gt-academyb-hero relative overflow-hidden">
      <div className="gt-alt-wide grid items-center gap-10 px-[var(--gt-alt-gutter)] pb-[clamp(36px,6vw,96px)] pt-[clamp(28px,5vw,80px)] md:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
        <div className="grid justify-items-start gap-5">
          <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("academyPage.hero.eyebrow")}</span>
          <h1 className="gt-alt-display max-w-[14ch] !text-[clamp(36px,5vw,80px)]">{t("academyPage.hero.title")}</h1>
          <p className="m-0 max-w-[52ch] text-[length:var(--text-body-md)] text-[var(--text-body)] sm:text-[length:var(--text-body-lg)]">
            {t("academyPage.hero.body")}
          </p>
          <Button variant="primary" size="lg" iconRight={ArrowRight} className="gt-alt-cta w-full sm:w-auto" onClick={onExplore}>
            {t("academyPage.hero.cta")}
          </Button>
          <ul aria-label={t("academyPage.hero.highlightsLabel")} className="m-0 grid w-full list-none gap-2 p-0 pt-1 sm:flex sm:w-auto sm:flex-wrap">
            {highlights.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5 text-[14px] font-semibold text-[var(--text-primary)] sm:rounded-[var(--radius-pill)] sm:bg-white sm:px-3.5 sm:py-2 sm:text-[13px] sm:shadow-[var(--shadow-sm)]">
                <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-white text-[var(--gt-blue-700)] sm:h-auto sm:w-auto sm:bg-transparent">
                  <Icon size={15} strokeWidth={1.9} />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto hidden w-full max-w-[420px] md:block">
          <div className="gt-alt-arch aspect-[4/5] overflow-hidden border-[6px] border-white shadow-[var(--shadow-lg)]">
            <img src={photo("mouth-05.jpg")} alt={t("academyPage.hero.imageAlt")} decoding="async" className="h-full w-full object-cover" />
          </div>
          <img
            src={photo("img-07.jpg")}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="gt-alt-cutout gt-alt-float absolute -left-[6%] top-[8%] w-[20%] max-w-[96px]"
          />
        </div>
      </div>
    </header>
  );
}
