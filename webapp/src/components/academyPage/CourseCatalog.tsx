import { useMemo, useState, type CSSProperties, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { GraduationCap, SearchX } from "lucide-react";
import { Button } from "../ui/Button";
import { AcademyCourseCard, type CourseCardBadge } from "../academy/AcademyCourseCard";
import { CatalogControls } from "./CatalogControls";
import { FeaturedCourse } from "./FeaturedCourse";
import { Pathways } from "./Pathways";
import type { AcademyStatus } from "../../lib/academy/AcademyProvider";
import {
  catalogFacets,
  DEFAULT_CATALOG_FILTERS,
  filterCatalog,
  isNewCourse,
  orderForPathway,
  suitsPathway,
  type CatalogFilters,
  type Pathway,
} from "../../lib/academy/catalog";
import type { PublicCourse } from "../../lib/academy/publicCourse";
import { useHydrated } from "../../lib/useHydrated";

/** From this many courses the catalogue gets its filters and lists every course (the featured one included). */
export const CONTROLS_FROM = 3;
/** From this many, the starting-point picker (it needs a choice to steer). */
export const PATHWAYS_FROM = 2;
/** From this many, a search field. */
const SEARCH_FROM = 7;

/**
 * The marketplace itself, the page's centre: the featured course, the
 * starting-point picker, the controls and the grid. It scales with the
 * catalogue rather than pretending to be bigger than it is — one course is
 * shown as the feature alone; two add the picker and the other course; from
 * three the whole catalogue is listed, filterable and sortable.
 *
 * Every course is rendered on the server as a real link with the filters at
 * their defaults (the filters are local state, never read from the address),
 * so the catalogue is crawlable and works before hydration.
 */
export function CourseCatalog({
  courses,
  status,
  onRetry,
  featured,
  lang,
  sectionRef,
  pathwaysRef,
}: {
  courses: PublicCourse[];
  status: AcademyStatus;
  onRetry: () => void;
  featured: PublicCourse | undefined;
  lang: string;
  sectionRef: Ref<HTMLElement>;
  pathwaysRef: Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation();
  const hydrated = useHydrated();
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_CATALOG_FILTERS);
  const [pathway, setPathway] = useState<Pathway | null>(null);

  const withControls = courses.length >= CONTROLS_FROM;
  const facets = useMemo(() => catalogFacets(courses), [courses]);
  const grid = useMemo(() => {
    if (!withControls) return courses.filter((course) => course !== featured);
    return orderForPathway(filterCatalog(courses, filters, lang), pathway);
  }, [courses, featured, filters, lang, pathway, withControls]);
  const matches = pathway ? courses.filter((course) => suitsPathway(course, pathway)).length : 0;

  // "New" reads the clock: only once hydrated, so the server's markup and the
  // first browser render agree.
  const now = useMemo(() => (hydrated ? new Date() : null), [hydrated]);
  const badgesFor = (course: PublicCourse): CourseCardBadge[] => {
    const badges: CourseCardBadge[] = [];
    if (pathway && suitsPathway(course, pathway)) badges.push({ label: t("academyPage.card.forYou"), tone: "highlight" });
    if (now && isNewCourse(course, now)) badges.push({ label: t("academyPage.card.new"), tone: "brand" });
    return badges;
  };

  // Replays the cards' entrance when the result changes (the CSS keeps it
  // instant under reduced motion).
  const gridKey = `${JSON.stringify(filters)}|${pathway ?? ""}`;

  return (
    <section
      ref={sectionRef}
      id="formations"
      tabIndex={-1}
      aria-labelledby="academy-market-title"
      aria-busy={status === "loading" || status === "idle"}
      className="gt-academy-market gt-alt-section scroll-mt-6 outline-none"
    >
      <div className="gt-alt-wide grid gap-[clamp(36px,5vw,72px)] px-[var(--gt-alt-gutter)]">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
          <div className="grid gap-4">
            <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("academyPage.market.eyebrow")}</span>
            <h2 id="academy-market-title" className="gt-alt-h2 max-w-[16ch]">{t("academyPage.market.title")}</h2>
          </div>
          <p className="m-0 max-w-[48ch] text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("academyPage.market.lead")}</p>
        </div>

        {courses.length === 0 ? (
          <CatalogState status={status} onRetry={onRetry} />
        ) : (
          <>
            {featured && (
              <FeaturedCourse
                course={featured}
                lang={lang}
                badges={badgesFor(featured)}
                highlighted={pathway != null && suitsPathway(featured, pathway)}
              />
            )}

            {courses.length >= PATHWAYS_FROM && <Pathways value={pathway} onChange={setPathway} matches={matches} sectionRef={pathwaysRef} />}

            {(withControls || grid.length > 0) && (
              <div className="grid gap-6">
                {withControls && (
                  <>
                    <h3 className="gt-alt-h3">{t("academyPage.market.allTitle")}</h3>
                    <CatalogControls
                      filters={filters}
                      onChange={setFilters}
                      facets={facets}
                      showSearch={courses.length >= SEARCH_FROM}
                      countFor={(draft) => filterCatalog(courses, draft, lang).length}
                      resultCount={grid.length}
                    />
                  </>
                )}
                {grid.length > 0 ? (
                  <ul key={gridKey} className="m-0 grid list-none grid-cols-1 gap-[clamp(16px,1.6vw,28px)] p-0 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {grid.map((course, i) => (
                      <li key={course.id} className="gt-academy-card-in" style={{ "--gt-delay": `${Math.min(i, 6) * 60}ms` } as CSSProperties}>
                        <AcademyCourseCard
                          course={course}
                          lang={lang}
                          showPrice
                          showCategory
                          clampSummary
                          heading="h4"
                          badges={badgesFor(course)}
                          highlighted={pathway != null && suitsPathway(course, pathway)}
                          ctaLabel={t("academyPage.card.cta")}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="grid justify-items-start gap-3 rounded-[var(--radius-xl)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-card)] p-[clamp(24px,3vw,40px)]">
                    <SearchX size={24} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
                    <h4 className="text-[length:var(--text-h4)] font-bold text-[var(--text-primary)]">{t("academyPage.noMatch.title")}</h4>
                    <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("academyPage.noMatch.body")}</p>
                    <Button variant="outline" onClick={() => setFilters({ ...DEFAULT_CATALOG_FILTERS, sort: filters.sort })}>
                      {t("academyPage.filters.clear")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** No course to show: still loading, failed to load (with a retry), or none published yet. */
function CatalogState({ status, onRetry }: { status: AcademyStatus; onRetry: () => void }) {
  const { t } = useTranslation();
  if (status === "error") {
    return (
      <div role="alert" className="grid justify-items-start gap-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(24px,3vw,40px)]">
        <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-primary)]">{t("academyPage.loadError")}</p>
        <Button variant="outline" onClick={onRetry}>{t("academyPage.retry")}</Button>
      </div>
    );
  }
  if (status === "ready") {
    return (
      <div className="grid justify-items-start gap-2 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(24px,3vw,40px)]">
        <GraduationCap size={24} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
        <h3 className="text-[length:var(--text-h4)] font-bold text-[var(--text-primary)]">{t("academyPage.empty.title")}</h3>
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("academyPage.empty.body")}</p>
      </div>
    );
  }
  return (
    <p role="status" className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
      {t("academyPage.loading")}
    </p>
  );
}
