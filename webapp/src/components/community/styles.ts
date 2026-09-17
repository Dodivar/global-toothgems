/**
 * Class strings shared across the community screens.
 *
 * The member area declares its focus ring locally in `AccountLayout`; the
 * community has a dozen interactive surfaces, so it declares it once here
 * rather than a dozen times.
 */

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

/** The community's standard card: the member-area panel, made hoverable. */
export const cardBase =
  "rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)]";

/**
 * Hover lift. `transition-[...]` rather than `transition-all`, so the browser
 * only animates what actually changes, and `--duration-normal` collapses to
 * 1 ms under `prefers-reduced-motion` through the token.
 */
export const cardHover =
  "transition-[transform,box-shadow,border-color] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] hover:-translate-y-0.5 hover:border-[var(--border-default)] hover:shadow-[var(--shadow-md)]";
