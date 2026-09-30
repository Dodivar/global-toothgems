/**
 * Public URL of a training's detail page.
 *
 * Five surfaces link to a training — the two home pages, the Academy
 * catalogue, the header's Academy panel and the footer's Academy column — so
 * the path lives here rather than being hand-written five times, exactly like
 * `shopUrl.ts` does for the filtered collections.
 */
export const courseHref = (id: string) => `/academy/formation/${id}`;

/**
 * The learner's own pages for a course on their account: the overview, one
 * lesson (a step id or a module's `quiz-<moduleId>`), and the completion
 * screen. Keyed by the storefront course — the thing the account holds.
 */
export const LEARN_BASE = "/academy/mes-formations";
export const learnHref = (courseId: string) => `${LEARN_BASE}/${courseId}`;
export const lessonHref = (courseId: string, key: string) => `${LEARN_BASE}/${courseId}/lecon/${encodeURIComponent(key)}`;
export const completionHref = (courseId: string) => `${LEARN_BASE}/${courseId}/terminee`;
/** The lesson player is a full-screen workspace; see `App.tsx`. */
export const isLessonPlayerPath = (pathname: string) => pathname.startsWith(`${LEARN_BASE}/`) && pathname.includes("/lecon/");
