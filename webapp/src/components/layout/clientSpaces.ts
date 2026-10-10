import { Box, GraduationCap, House, LayoutGrid, Layers, ShoppingBag, UserRound, type LucideIcon } from "lucide-react";
import { STUDIO_EDITOR_PATH, studioSectionPath } from "../../lib/studioUrl";
import { MEMBER_SPACE_PATH } from "../../lib/memberSpace";

/**
 * The customer's destinations across the site, held once so the member-space
 * sidebar and the Studio rail name them, order them and draw them the same
 * way: a client who learns "Boutique" with a bag in one place finds the same
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
  /** Marked "New" in the navigation. */
  isNew?: boolean;
}

export const CLIENT_SPACES: Record<ClientSpaceId, ClientSpace> = {
  home: { id: "home", to: "/", icon: House, labelKey: "nav.home" },
  shop: { id: "shop", to: "/boutique", icon: ShoppingBag, labelKey: "nav.shop" },
  academy: { id: "academy", to: "/academy", icon: GraduationCap, labelKey: "nav.academy" },
  studio: { id: "studio", to: STUDIO_EDITOR_PATH, icon: Box, labelKey: "nav.studio", isNew: true },
  account: { id: "account", to: MEMBER_SPACE_PATH, icon: UserRound, labelKey: "nav.mySpace" },
};

/**
 * What the member-space sidebar offers under "Explore": everything but the
 * space it is in. The Studio is not here: the sidebar gives it a group of its
 * own (`STUDIO_SHORTCUTS`).
 */
export const MEMBER_SPACE_EXPLORE: ClientSpace[] = [CLIENT_SPACES.home, CLIENT_SPACES.shop, CLIENT_SPACES.academy];

/** What the Studio rail offers beside its own sections. The account is the rail's avatar. */
export const STUDIO_EXPLORE: ClientSpace[] = [CLIENT_SPACES.shop, CLIENT_SPACES.academy];

export interface StudioShortcut {
  id: "workshop" | "creations" | "groups";
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
 * and the storefront header's Studio panel: the workshop, the saved creations
 * and the Gem Groups, with the icons the Studio's own rail gives them. Every
 * one of them sits under the editor route, so whoever may not open the Studio
 * is turned away by `RequireStudioAccess` there, not by these links.
 */
export const STUDIO_SHORTCUTS: StudioShortcut[] = [
  { id: "workshop", to: STUDIO_EDITOR_PATH, icon: Box, labelKey: "nav.studioWorkshop", descKey: "nav.studioWorkshopSub", shortKey: "studio" },
  {
    id: "creations",
    to: studioSectionPath("creations"),
    icon: LayoutGrid,
    labelKey: "studio.workspace.nav.creations",
    descKey: "studio.workspace.nav.desc.creations",
    shortKey: "creations",
  },
  {
    id: "groups",
    to: studioSectionPath("groups"),
    icon: Layers,
    labelKey: "nav.studioGroups",
    descKey: "studio.workspace.nav.desc.groups",
    shortKey: "groups",
  },
];
