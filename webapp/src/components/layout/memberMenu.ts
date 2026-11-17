import {
  Award,
  CalendarCheck,
  CalendarDays,
  CreditCard,
  Heart,
  LayoutDashboard,
  MessageSquareText,
  MessagesSquare,
  Package,
  ShieldCheck,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { ActivitySection } from "../../lib/memberActivity";
import { AGENDA_PATH } from "../../lib/agendaRoutes";
import { GLOWBOOK_SPACE_PATH } from "../../lib/studioUrl";
import { CLIENT_SPACES, STUDIO_SHORTCUTS } from "./clientSpaces";

/**
 * The member space's menu, held once: the sidebar and its rail (`MemberShell`)
 * and the storefront header's "My space" menu (`AccountMenu`) draw the same
 * entries, in the same groups, with the same names and icons.
 *
 * The "Atelier" group is the artist space (owner, 2026-11-17): the 3D Studio,
 * My Glowbook, the calendar and the subscription, side by side.
 */
export interface MemberMenuItem {
  to: string;
  labelKey: string;
  /** Under `account.shell.short`, for the rail; none for an entry left off it. */
  shortKey?: string;
  icon: LucideIcon;
  /** The dashboard and the home page need it: every other path is a distinct prefix. */
  end?: boolean;
  /**
   * The Members' Lounge, the entry whose
   * availability depends on what the account owns. They are never removed and
   * never disabled: without a training they still lead somewhere, to the
   * preview of what is behind them.
   */
  community?: boolean;
  /** The Members' Lounge: carries its unread activity. */
  lounge?: boolean;
  /**
   * The plan right the entry needs (decision 153): the Glowbook page (Artist and
   * up) or the calendar (Atelier). Below it the entry is locked and leads to
   * the Glowbook's presentation page.
   */
  plan?: "glowbook" | "bookings";
  /** Carries a badge for what is new there since the member last looked. */
  activity?: ActivitySection;
}

export interface MemberMenuGroup {
  id: string;
  /** None for the first group: the dashboard needs no heading. */
  labelKey?: string;
  items: MemberMenuItem[];
}

export const MEMBER_MENU_GROUPS: MemberMenuGroup[] = [
  {
    id: "home",
    items: [
      { to: "/compte", labelKey: "account.navDashboard", shortKey: "dashboard", icon: LayoutDashboard, end: true },
      { to: CLIENT_SPACES.home.to, labelKey: CLIENT_SPACES.home.labelKey, shortKey: "home", icon: CLIENT_SPACES.home.icon, end: true },
      { to: CLIENT_SPACES.shop.to, labelKey: CLIENT_SPACES.shop.labelKey, shortKey: "shop", icon: CLIENT_SPACES.shop.icon },
      { to: CLIENT_SPACES.academy.to, labelKey: CLIENT_SPACES.academy.labelKey, shortKey: "academy", icon: CLIENT_SPACES.academy.icon },
    ],
  },
  {
    id: "purchases",
    labelKey: "account.shell.groupPurchases",
    items: [
      { to: "/compte/commandes", labelKey: "account.navOrders", shortKey: "orders", icon: Package, activity: "orders" },
      { to: "/compte/fidelite", labelKey: "account.navLoyalty", shortKey: "loyalty", icon: Sparkles, activity: "loyalty" },
      { to: "/compte/avis", labelKey: "reviews.nav.account", shortKey: "reviews", icon: MessageSquareText, activity: "reviews" },
      // Glowbook appointments (decision 144): those the member booked on artists' pages, and an artist's own.
      { to: "/compte/rendez-vous", labelKey: "booking.mine.nav", shortKey: "appointments", icon: CalendarCheck },
    ],
  },
  {
    id: "learning",
    labelKey: "account.shell.groupLearning",
    items: [
      { to: "/compte/attestations", labelKey: "account.navCertificates", shortKey: "certificates", icon: Award },
      { to: "/compte/salons", labelKey: "lounge.navEntry", shortKey: "lounge", icon: MessagesSquare, community: true, lounge: true },
    ],
  },
  {
    id: "studio",
    labelKey: "account.shell.groupAtelier",
    items: [
      // Only the workshop: creations and groups are one click away inside it.
      ...STUDIO_SHORTCUTS.filter((shortcut) => shortcut.id === "workshop").map((shortcut) => ({
        to: shortcut.to,
        labelKey: shortcut.labelKey,
        shortKey: shortcut.shortKey,
        icon: shortcut.icon,
        end: true,
      })),
      // Always listed; locked (leading to the presentation page) below the Artist plan.
      {
        to: GLOWBOOK_SPACE_PATH,
        labelKey: "nav.myGlowbook",
        shortKey: "glowbook",
        icon: Sparkles,
        plan: "glowbook",
      },
      // The artist's calendar (decision 147), in the member space; locked below the Atelier plan (decision 153).
      { to: AGENDA_PATH, labelKey: "nav.studioAgenda", shortKey: "agenda", icon: CalendarDays, plan: "bookings" },
      { to: "/compte/studio", labelKey: "account.navStudio", shortKey: "subscription", icon: CreditCard },
    ],
  },
  {
    id: "account",
    labelKey: "account.shell.groupAccount",
    items: [
      { to: "/compte/profil", labelKey: "account.navProfile", shortKey: "profile", icon: UserRound },
      { to: "/compte/securite", labelKey: "account.navSecurity", shortKey: "security", icon: ShieldCheck },
    ],
  },
];

/** The favourites, a filter of the shop: in the header's menu only (owner, 2026-11-17: no room in the header itself). */
export const FAVORITES_ENTRY: MemberMenuItem = { to: "/boutique?favoris=1", labelKey: "account.menu.favorites", icon: Heart };

/** What the header's menu needs to know to leave out what the member cannot open. */
export interface AccountMenuRights {
  /** The plan opens the Glowbook page / the calendar; null while unknown. */
  glowbook: boolean | null;
  bookings: boolean | null;
  /** A training (or a staff role) opens the Members' Lounge. */
  lounge: boolean;
}

/**
 * The header's "My space" menu, derived from the member space's: the same
 * groups and entries, minus the ways out to the storefront (the header has
 * them already) and minus what the member cannot open yet — locked entries
 * stay in the sidebar, where their lock explains them; a short menu is the
 * point here. The favourites join the purchases. Empty groups are dropped.
 */
export function accountMenuGroups(rights: AccountMenuRights): MemberMenuGroup[] {
  const opens = (item: MemberMenuItem) => {
    if (item.plan === "glowbook") return rights.glowbook === true;
    if (item.plan === "bookings") return rights.bookings === true;
    if (item.community) return rights.lounge;
    // One or the other, as in the header's Atelier menu (owner, 2026-11-16): a member whose plan runs
    // the calendar reads their week there and has no use for "My appointments" here.
    if (item.to === "/compte/rendez-vous") return rights.bookings !== true;
    return true;
  };
  const exits = new Set([CLIENT_SPACES.home.to, CLIENT_SPACES.shop.to, CLIENT_SPACES.academy.to]);
  return MEMBER_MENU_GROUPS.map((group) => {
    const items = group.items.filter((item) => !exits.has(item.to) && opens(item));
    if (group.id === "purchases") {
      const orders = items.findIndex((item) => item.to === "/compte/commandes");
      items.splice(orders + 1, 0, FAVORITES_ENTRY);
    }
    return { ...group, items };
  }).filter((group) => group.items.length > 0);
}
