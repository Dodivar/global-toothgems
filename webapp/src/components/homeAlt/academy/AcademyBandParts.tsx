import { useTranslation } from "react-i18next";
import { ArrowUpRight, Award } from "lucide-react";
import clsx from "clsx";
import { Link } from "../../../lib/navigation";
import { photo } from "../../../lib/images";
import { GEMS_CATEGORY, shopHref } from "../../../data/taxonomy";
import { STUDIO_PATH } from "../../../lib/studioUrl";
import { AcademyCourseCard } from "../../academy/AcademyCourseCard";
import type { CatalogueFigures, PublicCourse } from "../../../lib/academy/publicCourse";
import { formatDuration } from "../../../lib/trainingFilters";

/**
 * The parts of the home page's Academy band, on its dark ink: the
 * catalogue's figures, the course row and the Global Toothgems world.
 */

/**
 * The published catalogue in four figures, all counted from the courses
 * themselves (`catalogueFigures`): nothing is stated that the catalogue does
 * not hold, and a figure at zero is left out rather than shown as "0".
 */
export function AcademyFigures({ figures, className }: { figures: CatalogueFigures; className?: string }) {
  const { t, i18n } = useTranslation();
  const items = [
    figures.courses > 0 && { value: String(figures.courses), label: t("homeAlt.academy.figures.courses", { count: figures.courses }) },
    figures.lessons > 0 && { value: String(figures.lessons), label: t("homeAlt.academy.figures.lessons", { count: figures.lessons }) },
    figures.minutes > 0 && { value: formatDuration(figures.minutes, i18n.language), label: t("homeAlt.academy.figures.content") },
    figures.certificate
      ? { value: null, label: t("homeAlt.academy.figures.certificate") }
      : figures.checks > 0 && { value: String(figures.checks), label: t("homeAlt.academy.figures.checks", { count: figures.checks }) },
  ].filter((item): item is { value: string | null; label: string } => Boolean(item));
  if (items.length === 0) return null;

  return (
    <dl aria-label={t("homeAlt.academy.figuresLabel")} className={clsx("m-0 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4", className)}>
      {items.map((item) => (
        <div key={item.label} className="grid content-start gap-1 border-t border-white/15 pt-4">
          <dt className="order-2 text-[13px] font-medium text-[var(--gt-ink-300)]">{item.label}</dt>
          <dd className="order-1 m-0 text-[clamp(26px,2.6vw,40px)] font-[var(--weight-black)] leading-none tabular-nums text-[var(--gt-off-white)]">
            {item.value ?? <Award aria-hidden="true" className="h-[1em] w-[1em] text-[var(--gt-emerald-300)]" strokeWidth={1.75} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The courses after the one shown beside the statement, as editorial cards
 * (nothing while there are none), a swiped row on phones. No price: it
 * belongs to the course's own page.
 */
export function AcademyCourseRow({ courses, className }: { courses: PublicCourse[]; className?: string }) {
  const { t, i18n } = useTranslation();
  if (courses.length === 0) return null;

  return (
    <div className={className}>
      <h3 className="gt-alt-h3 mb-6 !text-[var(--gt-off-white)]">{t("homeAlt.academy.coursesTitle")}</h3>
      <ul className="gt-scroller gt-alt-snap-pad -mx-[var(--gt-alt-gutter)] my-0 flex list-none gap-4 px-[var(--gt-alt-gutter)] pb-4 md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 lg:grid-cols-3 lg:gap-6">
        {courses.map((course) => (
          <li key={course.id} className="w-[82%] max-w-[360px] flex-none snap-start md:w-auto md:max-w-none">
            <AcademyCourseCard course={course} lang={i18n.language} heading="h4" ctaLabel={t("homeAlt.academy.courseCta")} />
          </li>
        ))}
      </ul>
    </div>
  );
}

const ECOSYSTEM = [
  { key: "learn", to: "/academy", image: photo("img-12.jpg"), cutout: false },
  { key: "create", to: STUDIO_PATH, image: "/videos/studio-3d-intro-poster.jpg", cutout: false },
  { key: "equip", to: shopHref(GEMS_CATEGORY), image: photo("img-14.jpg"), cutout: true },
  { key: "shine", to: STUDIO_PATH, image: photo("mouth-05.jpg"), cutout: false },
] as const;

/**
 * The Academy as one door into the Global Toothgems world: learn, create in
 * the 3D Studio, get equipped in the shop, show the work on a Glowbook (whose
 * certified badge the Academy's certificates earn). Every tile is a real link.
 */
export function AcademyEcosystem({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <div className={clsx("grid gap-8", className)}>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-end md:gap-10">
        <div className="grid gap-3">
          <span className="gt-eyebrow !text-[var(--gt-blue-300)]">{t("homeAlt.academy.eco.eyebrow")}</span>
          <h3 className="gt-alt-h2 max-w-[18ch] !text-[var(--gt-off-white)]">{t("homeAlt.academy.eco.title")}</h3>
        </div>
        <p className="m-0 max-w-[48ch] text-[length:var(--text-body-md)] text-[var(--gt-ink-300)]">{t("homeAlt.academy.eco.body")}</p>
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:gap-4 lg:grid-cols-4 lg:gap-5">
        {ECOSYSTEM.map((tile, i) => (
          <li
            key={tile.key}
            className="gt-alt-tile group relative flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-white/12 bg-white/[.06]"
          >
            <span className={clsx("relative block aspect-[4/3] overflow-hidden", tile.cutout ? "bg-[var(--gt-blue-100)]" : "bg-[var(--surface-sunken)]")}>
              <img
                src={tile.image}
                alt=""
                loading="lazy"
                decoding="async"
                className={clsx("gt-alt-tile-art absolute inset-0 h-full w-full", tile.cutout ? "gt-alt-cutout object-contain p-[14%]" : "object-cover")}
              />
              <span
                aria-hidden="true"
                className="absolute left-3 top-3 grid h-7 min-w-7 place-items-center rounded-full bg-[var(--gt-ink-900)]/80 px-2 text-[11px] font-semibold tabular-nums text-[var(--gt-off-white)] backdrop-blur-sm"
              >
                0{i + 1}
              </span>
            </span>
            <span className="grid flex-1 content-start gap-1.5 p-[clamp(14px,1.6vw,22px)]">
              <span className="flex items-center justify-between gap-2 text-[clamp(16px,1.4vw,20px)] font-bold text-[var(--gt-off-white)]">
                <Link to={tile.to} className="gt-alt-tile-link text-inherit after:absolute after:inset-0 after:content-['']">
                  {t(`homeAlt.academy.eco.${tile.key}Title`)}
                </Link>
                <ArrowUpRight aria-hidden="true" size={18} className="gt-alt-tile-arrow shrink-0" />
              </span>
              <span className="text-[13px] leading-snug text-[var(--gt-ink-300)] sm:text-[length:var(--text-body-sm)]">
                {t(`homeAlt.academy.eco.${tile.key}Body`)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
