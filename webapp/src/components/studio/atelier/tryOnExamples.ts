import type { StudioStill } from "../StudioPageImage";

/**
 * Real AI try-ons supplied by the owner (`public/images/atelier-page/`): the
 * client's photo, the render with the gems, and the design as the Studio
 * draws it. Each picture exists at two widths, like the Studio page's stills
 * (`<base>-<w>.webp` and twice that). Nothing is shown in their place until
 * they exist: the section says the examples are coming (no simulated render).
 *
 * To add one: export the three pictures (photo and render the same size),
 * put them in `public/images/atelier-page/`, add a line below.
 */
export interface TryOnExample {
  id: string;
  photo: StudioStill;
  render: StudioStill;
  creation: StudioStill | null;
}

export const TRY_ON_EXAMPLES: readonly TryOnExample[] = [];
