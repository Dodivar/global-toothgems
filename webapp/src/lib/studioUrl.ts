/**
 * Addresses of the 3D Studio pages, held once like `academyUrl` and `shopUrl`:
 * the navigation, the home-page teaser and the Studio pages all link here.
 */
export const STUDIO_PATH = "/studio-3d";
export const STUDIO_SUBSCRIBE_PATH = "/studio-3d/abonnement";
/** English alias of the subscription page, like `/gift-card` for `/carte-cadeau`. */
export const STUDIO_SUBSCRIBE_ALIAS = "/studio-3d/subscribe";
/**
 * The subscription's checkout, a page of its own (signed-in members only,
 * `gateFor`): `?plan=<id>&interval=month|year&from=<surface>`. Paid, it opens
 * the editor.
 */
export const STUDIO_CHECKOUT_PATH = "/studio-3d/paiement";
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
 * A creation of an artist's public Glowbook in the read-only 3D viewer
 * (decision 99): `/studio-3d/glowbook/<handle>/<item id>`. Beside the share
 * viewer, open to everyone; the Glowbook page itself is a public page
 * (`/fr/glowbook/<handle>`).
 */
export const STUDIO_GLOWBOOK_VIEW_PATH = "/studio-3d/glowbook";

export function glowbookCreationPath(handle: string, itemId: string): string {
  return `${STUDIO_GLOWBOOK_VIEW_PATH}/${encodeURIComponent(handle)}/${encodeURIComponent(itemId)}`;
}

/**
 * The workspace sections around the editor, under its path
 * (`/studio-3d/atelier/mes-creations`…). French slugs like the rest of the
 * site; the English ones are accepted too, like the path aliases above.
 */
export type StudioSection = "creations" | "groups" | "templates" | "glowbook" | "help";

const SECTION_SLUGS: Record<StudioSection, string> = {
  creations: "mes-creations",
  groups: "mes-groupes",
  templates: "modeles",
  glowbook: "glowbook",
  help: "aide",
};
const SLUG_ALIASES: Record<string, StudioSection> = { creations: "creations", groups: "groups", templates: "templates", help: "help" };

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

const PAID_PLANS = ["essential", "artist", "atelier"] as const;
const INTERVALS = ["month", "year"] as const;
const SURFACES = ["studio_locked", "studio_page", "studio_subscribe_page"] as const;

export type StudioCheckoutSurface = (typeof SURFACES)[number];
export interface StudioCheckoutQuery {
  plan: (typeof PAID_PLANS)[number];
  interval: (typeof INTERVALS)[number];
  /** Where the plan was chosen: analytics, and where "Change plan" leads back to. */
  surface: StudioCheckoutSurface;
}

/** The checkout page for a plan, chosen on `surface`. */
export function studioCheckoutPath({ plan, interval, surface }: StudioCheckoutQuery): string {
  return `${STUDIO_CHECKOUT_PATH}?${new URLSearchParams({ plan, interval, from: surface })}`;
}

/** The checkout page's query, or null when the plan or the interval is not one on sale (an unknown origin counts as the subscription page). */
export function parseStudioCheckoutQuery(params: URLSearchParams): StudioCheckoutQuery | null {
  const plan = params.get("plan");
  const interval = params.get("interval");
  const from = params.get("from");
  if (!PAID_PLANS.includes(plan as StudioCheckoutQuery["plan"]) || !INTERVALS.includes(interval as StudioCheckoutQuery["interval"])) return null;
  return {
    plan: plan as StudioCheckoutQuery["plan"],
    interval: interval as StudioCheckoutQuery["interval"],
    surface: SURFACES.includes(from as StudioCheckoutSurface) ? (from as StudioCheckoutSurface) : "studio_subscribe_page",
  };
}

/** Where "Change plan" on the checkout page leads: back to the plans the member chose from. */
export function studioPlansPathFor(surface: StudioCheckoutSurface): string {
  return surface === "studio_locked" ? STUDIO_EDITOR_PATH : surface === "studio_page" ? STUDIO_PATH : STUDIO_SUBSCRIBE_PATH;
}
