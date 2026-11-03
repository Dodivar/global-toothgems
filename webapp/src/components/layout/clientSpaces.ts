import { Box, Component, GraduationCap, House, Images, PencilRuler, Sparkles, Store, UserRound, type LucideIcon } from "lucide-react";
import { GLOWBOOK_INTRO_PATH, STUDIO_EDITOR_PATH, studioSectionPath } from "../../lib/studioUrl";
import { MEMBER_SPACE_PATH } from "../../lib/memberSpace";

/**
 * The customer's destinations across the site, held once so the member-space
 * sidebar (at the head of its groups) and the Studio rail name them and draw
 * them the same way: a client who learns "Boutique" with a bag in one place finds the same
 * bag in the other.
 *
 * The Studio entry opens the workshop itself rather than its sales page: from
 * a signed-in space, the Studio is the place you work in. Its access is still
 * decided by `RequireStudioAccess` on that route.
 */
export type ClientSpaceId = "home" | "shop" | "academy" | "studio" | "account";

export interface ClientSpace {
  id: ClientSpaceId;
  to: string;
  icon: LucideIcon;
  /** Full label, under `nav.*`. */
  labelKey: string;
}

export const CLIENT_SPACES: Record<ClientSpaceId, ClientSpace> = {
  home: { id: "home", to: "/", icon: House, labelKey: "nav.home" },
  shop: { id: "shop", to: "/boutique", icon: Store, labelKey: "nav.shop" },
  academy: { id: "academy", to: "/academy", icon: GraduationCap, labelKey: "nav.academy" },
  studio: { id: "studio", to: STUDIO_EDITOR_PATH, icon: Box, labelKey: "nav.studio" },
  account: { id: "account", to: MEMBER_SPACE_PATH, icon: UserRound, labelKey: "nav.mySpace" },
};

/** What the Studio rail offers beside its own sections. The account is the rail's avatar. */
export const STUDIO_EXPLORE: ClientSpace[] = [CLIENT_SPACES.shop, CLIENT_SPACES.academy];

interface StudioShortcut {
  id: "workshop" | "creations" | "groups" | "glowbook";
  to: string;
  icon: LucideIcon;
  labelKey: string;
  /** One line under the label, where there is room for it (the header's panel). */
  descKey: string;
  /** Under `account.shell.short`, for the member space's rail. */
  shortKey: string;
}

/**
 * The ways into the Studio workspace, held once for the member-space sidebar
 * (its Studio group) and the storefront header's Studio panel: the workshop, the saved creations
 * and the Gem Groups, with the icons the Studio's own rail gives them
 * (a drawing tool for the workshop, a gallery for the creations, a cluster of
 * stones for the Gem Groups). Every
 * one of them sits under the editor route, so whoever may not open the Studio
 * is turned away by `RequireStudioAccess` there, not by these links.
 */
export const STUDIO_SHORTCUTS: StudioShortcut[] = [
  { id: "workshop", to: STUDIO_EDITOR_PATH, icon: PencilRuler, labelKey: "nav.studioWorkshop", descKey: "nav.studioWorkshopSub", shortKey: "studio" },
  {
    id: "creations",
    to: studioSectionPath("creations"),
    icon: Images,
    labelKey: "studio.workspace.nav.creations",
    descKey: "studio.workspace.nav.desc.creations",
    shortKey: "creations",
  },
  {
    id: "groups",
    to: studioSectionPath("groups"),
    icon: Component,
    labelKey: "nav.studioGroups",
    descKey: "studio.workspace.nav.desc.groups",
    shortKey: "groups",
  },
];

/**
 * The storefront header's Studio entries (panel and phone menu): the ways
 * into the workspace, then the Glowbook's presentation page — a public page
 * open to everyone, which leads members whose plan includes the Glowbook to
 * theirs and the others to the plan.
 */
export const STUDIO_MENU: StudioShortcut[] = [
  ...STUDIO_SHORTCUTS,
  {
    id: "glowbook",
    to: GLOWBOOK_INTRO_PATH,
    icon: Sparkles,
    labelKey: "nav.studioGlowbook",
    descKey: "nav.studioGlowbookSub",
    shortKey: "glowbook",
  },
];
