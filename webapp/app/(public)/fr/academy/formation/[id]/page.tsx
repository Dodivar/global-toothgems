import { CoursePage, courseMetadata, type CoursePageProps } from "../../../../../_public/coursePage";

/** A course sales page in French: `/fr/academy/formation/<French slug>` (see `app/_public/coursePage.tsx`). */
export function generateMetadata(props: CoursePageProps) {
  return courseMetadata(props, "fr");
}

export default function Page(props: CoursePageProps) {
  return <CoursePage props={props} locale="fr" />;
}
