import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { courseDescription, courseJsonLd, courseTitle } from "../../src/lib/academy/courseMeta";
import { courseAddresses, courseSlug } from "../../src/lib/academy/publicCourse";
import { findPublicCourse } from "../../src/lib/academy/serverAcademy";
import { jsonLdScript } from "../../src/lib/catalog/productMeta";
import { localizedPath, type Locale } from "../../src/lib/localeRoutes";
import { siteUrl } from "../../src/lib/siteUrl";
import { CourseDetail } from "../../src/screens/CourseDetail";
import { publicPageMetadata } from "./metadata";
import { searchOf } from "./search";

/**
 * A course sales page, `/fr/academy/formation/<French slug>` and
 * `/en/academy/course/<English slug>` (Academy phase B; same rules as the
 * product pages). The server finds the published course (publishable key,
 * RLS; the fixtures in mock mode) and:
 * - answers 404 when the Academy does not offer it (unknown, draft, withdrawn);
 * - moves (308) an address naming it by another language's slug or its row
 *   id to its address in this language, query kept;
 * - gives the page its title, description, hreflang to the other language's
 *   slug, Open Graph image and structured data (schema.org Course).
 * The page itself is `CourseDetail`, given the course, rendered on the server
 * and hydrated in the browser.
 */
export type CoursePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function courseFor(props: CoursePageProps, locale: Locale) {
  const { id } = await props.params;
  const key = decodeURIComponent(id);
  const course = await findPublicCourse(key);
  if (!course) notFound();
  const own = courseSlug(course, locale);
  if (own !== key) permanentRedirect(`${localizedPath("course", locale, { id: own })}${searchOf(await props.searchParams)}`);
  return course;
}

export async function courseMetadata(props: CoursePageProps, locale: Locale): Promise<Metadata> {
  const course = await courseFor(props, locale);
  return publicPageMetadata({
    title: courseTitle(course, locale),
    description: courseDescription(course, locale),
    locale,
    alternates: courseAddresses(course),
    image: course.cover?.src,
  });
}

export async function CoursePage({ props, locale }: { props: CoursePageProps; locale: Locale }) {
  const course = await courseFor(props, locale);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(courseJsonLd(course, locale, siteUrl())) }} />
      <CourseDetail course={course} />
    </>
  );
}
