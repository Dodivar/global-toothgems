/**
 * Public URL of a training's detail page.
 *
 * Five surfaces link to a training — the two home pages, the Academy
 * catalogue, the header's Academy panel and the footer's Academy column — so
 * the path lives here rather than being hand-written five times, exactly like
 * `shopUrl.ts` does for the filtered collections.
 */
export const courseHref = (id: string) => `/academy/formation/${id}`;
