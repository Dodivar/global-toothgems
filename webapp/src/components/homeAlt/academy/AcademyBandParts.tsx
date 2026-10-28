import { useTranslation } from "react-i18next";
import { ArrowUpRight, Award } from "lucide-react";
import clsx from "clsx";
import { Link } from "../../../lib/navigation";
import { photo } from "../../../lib/images";
import { GEMS_CATEGORY, shopHref } from "../../../data/taxonomy";
import { STUDIO_PATH } from "../../../lib/studioUrl";
import { AcademyCourseCard } from "../../academy/AcademyCourseCard";
import { useAcademy } from "../../../lib/academy/AcademyProvider";
import type { CatalogueFigures } from "../../../lib/academy/publicCourse";
import { formatDuration } from "../../../lib/trainingFilters";

/** Whether a part sits on the light page or on a dark band. */
export type BandTone = "light" | "dark";

/**
 * The published catalogue in four figures, all counted from the courses
 * themselves (`catalogueFigures`): nothing is stated that the catalogue does
 * not hold, and a figure at zero is left out rather than shown as "0".
 */
export function AcademyFigures({
  figures,
  tone,
  narrow = false,
  className,
}: {
  figures: CatalogueFigures;
  tone: BandTone;
  /** Two columns until the large breakpoint, for a figures tile beside another. */
  narrow?: boolean;
  className?: string;
}) {
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
  const dark = tone === "dark";

  return (
    <dl aria-label={t("homeAlt.academy.figuresLabel")} className={clsx("m-0 grid grid-cols-2 gap-x-6 gap-y-5", narrow ? "lg:grid-cols-4" : "sm:grid-cols-4", className)}>
      {items.map((item) => (
        <div key={item.label} className={clsx("grid content-start gap-1 border-t pt-4", dark ? "border-white/15" : "border-[var(--gt-ink-200)]")}>
          <dt className={clsx("order-2 text-[13px] font-medium", dark ? "text-[var(--gt-ink-300)]" : "text-[var(--text-body)]")}>{item.label}</dt>
          <dd className={clsx("order-1 m-0 text-[clamp(26px,2.6vw,40px)] font-[var(--weight-black)] leading-none tabular-nums", dark ? "text-[var(--gt-off-white)]" : "text-[var(--text-primary)]")}>
            {item.value ?? <Award aria-hidden="true" className={clsx("h-[1em] w-[1em]", dark ? "text-[var(--gt-emerald-300)]" : "text-[var(--gt-emerald-600)]")} strokeWidth={1.75} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The published courses as editorial cards (none shown until one is online),
 * a swiped row on phones. No price: it belongs to the course's own page.
 */
export function AcademyCourseRow({ tone, className }: { tone: BandTone; className?: string }) {
  const { t, i18n } = useTranslation();
  const { courses } = useAcademy();
  if (courses.length === 0) return null;
  const dark = tone === "dark";

  return (
    <div className={className}>
      <h3 className={clsx("gt-alt-h3 mb-6", dark && "!text-[var(--gt-off-white)]")}>{t("homeAlt.academy.coursesTitle")}</h3>
      <ul className="gt-scroller gt-alt-snap-pad -mx-[var(--gt-alt-gutter)] my-0 flex list-none gap-4 px-[var(--gt-alt-gutter)] pb-4 md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
        {courses.slice(0, 3).map((course, i) => (
          <li key={course.id} className={clsx("w-[82%] max-w-[360px] flex-none snap-start md:w-auto md:max-w-none", i === 0 && "md:col-span-2 lg:col-span-1")}>
            <AcademyCourseCard
              course={course}
              lang={i18n.language}
              featured={i === 0}
              heading="h4"
              badges={i === 0 ? [{ label: t("homeAlt.academy.featured"), tone: "brand" }] : []}
              ctaLabel={t("homeAlt.academy.courseCta")}
            />
          </li>
        ))}
      </ul>
      <p className={clsx("m-0 mt-6 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)]", dark ? "text-[var(--gt-ink-300)]" : "text-[var(--text-muted)]")}>
        {t("homeAlt.academy.footnote")}
      </p>
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
export function AcademyEcosystem({ tone, className }: { tone: BandTone; className?: string }) {
  const { t } = useTranslation();
  const dark = tone === "dark";

  return (
    <div className={clsx("grid gap-8", className)}>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-end md:gap-10">
        <div className="grid gap-3">
          <span className={clsx("gt-eyebrow", dark ? "!text-[var(--gt-blue-300)]" : "!text-[var(--gt-blue-700)]")}>{t("homeAlt.academy.eco.eyebrow")}</span>
          <h3 className={clsx("gt-alt-h2 max-w-[18ch]", dark && "!text-[var(--gt-off-white)]")}>{t("homeAlt.academy.eco.title")}</h3>
        </div>
        <p className={clsx("m-0 max-w-[48ch] text-[length:var(--text-body-md)]", dark ? "text-[var(--gt-ink-300)]" : "text-[var(--text-body)]")}>{t("homeAlt.academy.eco.body")}</p>
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:gap-4 lg:grid-cols-4 lg:gap-5">
        {ECOSYSTEM.map((tile, i) => (
          <li
            key={tile.key}
            className={clsx(
              "gt-alt-tile group relative flex flex-col overflow-hidden rounded-[var(--radius-xl)] border",
              dark ? "border-white/12 bg-white/[.06]" : "border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]",
            )}
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
              <span className={clsx("flex items-center justify-between gap-2 text-[clamp(16px,1.4vw,20px)] font-bold", dark ? "text-[var(--gt-off-white)]" : "text-[var(--text-primary)]")}>
                <Link to={tile.to} className="gt-alt-tile-link text-inherit after:absolute after:inset-0 after:content-['']">
                  {t(`homeAlt.academy.eco.${tile.key}Title`)}
                </Link>
                <ArrowUpRight aria-hidden="true" size={18} className="gt-alt-tile-arrow shrink-0" />
              </span>
              <span className={clsx("text-[13px] leading-snug sm:text-[length:var(--text-body-sm)]", dark ? "text-[var(--gt-ink-300)]" : "text-[var(--text-body)]")}>
                {t(`homeAlt.academy.eco.${tile.key}Body`)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
