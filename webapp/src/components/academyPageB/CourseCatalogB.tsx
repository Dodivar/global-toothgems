import { useMemo, useState, type CSSProperties, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { SearchX } from "lucide-react";
import { Button } from "../ui/Button";
import { AcademyCourseCard, type CourseCardBadge } from "../academy/AcademyCourseCard";
import { CatalogControls } from "../academyPage/CatalogControls";
import { CatalogState, CONTROLS_FROM, PATHWAYS_FROM, SEARCH_FROM } from "../academyPage/CourseCatalog";
import { FeaturedCourseB } from "./FeaturedCourseB";
import { PathwaysB } from "./PathwaysB";
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

/**
 * Académie B's catalogue, straight under the hero: the title, the
 * starting-point chips (from two courses), the featured course in white and
 * blue, then — from three courses — the filters and the grid. Same rules as
 * the marketplace's `CourseCatalog` (filters are local state, every course is
 * a real link rendered on the server); only the composition differs.
 */
export function CourseCatalogB({
  courses,
  status,
  onRetry,
  featured,
  lang,
  sectionRef,
}: {
  courses: PublicCourse[];
  status: AcademyStatus;
  onRetry: () => void;
  featured: PublicCourse | undefined;
  lang: string;
  sectionRef: Ref<HTMLElement>;
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
    if (pathway && suitsPathway(course, pathway)) badges.push({ label: t("academyPage.card.forYou"), tone: "brand" });
    if (now && isNewCourse(course, now)) badges.push({ label: t("academyPage.card.new"), tone: "success" });
    return badges;
  };
  const gridKey = `${JSON.stringify(filters)}|${pathway ?? ""}`;

  return (
    <section
      ref={sectionRef}
      id="formations"
      tabIndex={-1}
      aria-labelledby="academyb-market-title"
      aria-busy={status === "loading" || status === "idle"}
      className="gt-academyb-market scroll-mt-6 py-[clamp(40px,6vw,104px)] outline-none"
    >
      <div className="gt-alt-wide grid gap-[clamp(24px,3.5vw,48px)] px-[var(--gt-alt-gutter)]">
        <div className="grid max-w-[760px] gap-3">
          <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("academyPage.market.eyebrow")}</span>
          <h2 id="academyb-market-title" className="gt-alt-h2 !text-[clamp(28px,3.4vw,52px)]">{t("academyPage.market.title")}</h2>
          <p className="m-0 max-w-[52ch] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("academyPage.market.lead")}</p>
        </div>

        {courses.length === 0 ? (
          <CatalogState status={status} onRetry={onRetry} />
        ) : (
          <>
            {courses.length >= PATHWAYS_FROM && <PathwaysB value={pathway} onChange={setPathway} matches={matches} />}

            {featured && (
              <FeaturedCourseB
                course={featured}
                lang={lang}
                badges={badgesFor(featured)}
                highlighted={pathway != null && suitsPathway(featured, pathway)}
              />
            )}

            {(withControls || grid.length > 0) && (
              <div className="grid gap-5">
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
                  <ul key={gridKey} className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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
                  <div className="grid justify-items-start gap-3 rounded-[var(--radius-xl)] border border-dashed border-[var(--gt-blue-300)] bg-white p-[clamp(20px,3vw,40px)]">
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
