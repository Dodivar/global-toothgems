/**
 * Addresses of the 3D Studio pages, held once like `academyUrl` and `shopUrl`:
 * the navigation, the home-page teaser and the Studio pages all link here.
 */
export const STUDIO_PATH = "/studio-3d";
export const STUDIO_SUBSCRIBE_PATH = "/studio-3d/abonnement";
/** English alias of the subscription page, like `/gift-card` for `/carte-cadeau`. */
export const STUDIO_SUBSCRIBE_ALIAS = "/studio-3d/subscribe";
/** The editor itself — the Studio's workshop ("atelier"). */
export const STUDIO_EDITOR_PATH = "/studio-3d/atelier";
/**
 * A design shared read-only: `/studio-3d/partage/<token>` for a saved
 * creation, `/studio-3d/partage#…` for a snapshot (see
 * `studioWorkspace/share.ts`). Beside the editor, not under it: it is not a
 * workspace section, and viewing a shared design needs no Studio access.
 */
export const STUDIO_SHARE_PATH = "/studio-3d/partage";

/**
 * The workspace sections around the editor, under its path
 * (`/studio-3d/atelier/mes-creations`…). French slugs like the rest of the
 * site; the English ones are accepted too, like the path aliases above.
 */
export type StudioSection = "creations" | "groups" | "help";

const SECTION_SLUGS: Record<StudioSection, string> = {
  creations: "mes-creations",
  groups: "mes-groupes",
  help: "aide",
};
const SLUG_ALIASES: Record<string, StudioSection> = { creations: "creations", groups: "groups", help: "help" };

export function studioSectionPath(section: StudioSection | null): string {
  return section ? `${STUDIO_EDITOR_PATH}/${SECTION_SLUGS[section]}` : STUDIO_EDITOR_PATH;
}

/** The section a pathname under the editor points at, or null for the editor itself. */
export function studioSectionFromPath(pathname: string): StudioSection | null {
  const rest = pathname.replace(/\/+$/, "").split("/").slice(3)[0];
  if (!rest) return null;
  const direct = (Object.keys(SECTION_SLUGS) as StudioSection[]).find((s) => SECTION_SLUGS[s] === rest);
  return direct ?? SLUG_ALIASES[rest] ?? null;
}
