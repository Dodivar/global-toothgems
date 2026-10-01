import { CoursePage, courseMetadata, type CoursePageProps } from "../../../../../_public/coursePage";

/** A course sales page in English: `/en/academy/course/<English slug>` (see `app/_public/coursePage.tsx`). */
export function generateMetadata(props: CoursePageProps) {
  return courseMetadata(props, "en");
}

export default function Page(props: CoursePageProps) {
  return <CoursePage props={props} locale="en" />;
}
