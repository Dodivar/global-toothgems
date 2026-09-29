import { Box, GraduationCap, House, ShoppingBag, UserRound, type LucideIcon } from "lucide-react";
import { STUDIO_EDITOR_PATH } from "../../lib/studioUrl";
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

/** What the member-space sidebar offers under "Explore": everything but the space it is in. */
export const MEMBER_SPACE_EXPLORE: ClientSpace[] = [CLIENT_SPACES.home, CLIENT_SPACES.shop, CLIENT_SPACES.academy, CLIENT_SPACES.studio];

/** What the Studio rail offers beside its own sections. The account is the rail's avatar. */
export const STUDIO_EXPLORE: ClientSpace[] = [CLIENT_SPACES.shop, CLIENT_SPACES.academy];
