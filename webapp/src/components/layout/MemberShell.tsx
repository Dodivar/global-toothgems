import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation, useNavigate, useLanguageSwitch } from "../../lib/navigation";
import {
  Award,
  Cookie,
  Languages,
  LayoutDashboard,
  LifeBuoy,
  Lock,
  LogOut,
  Menu,
  MessageSquareText,
  MessagesSquare,
  Package,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UserCog,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../lib/auth";
import { useAdminAuth } from "../../lib/adminAuth";
import { useCart } from "../../lib/cart";
import { useCommunity } from "../../lib/community";
import { useCookieConsent } from "../../lib/cookieConsent";
import { useOrders } from "../../lib/orders";
import { useFormat } from "../../lib/format";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { LEGAL_PATHS } from "../../data/legal/routes";
import { NewTag } from "../studio/NewTag";
import { MEMBER_SPACE_EXPLORE } from "./clientSpaces";
import monogram from "../../assets/monogram-blue.png";
import logoBlack from "../../assets/logo-wordmark-black.png";

/**
 * Shell of the member space: the account and the Artist Community.
 *
 * One navigation, on the left and the full height of the screen, the way the
 * 3D Studio has its rail: the storefront header and footer are left out on
 * these routes (see `isMemberSpacePath`), so everything they carried lives
 * here instead — the way back to the home page, the shop, the Academy and the
 * Studio, the cart, the language and the cookie settings. The member's own
 * sections come first: this is their space, and the rest of the site is
 * where they go from it.
 *
 * Below `lg` the same content opens as a drawer from a slim top bar, like the
 * Studio's. The breakpoint is CSS, so nothing shifts after hydration.
 */

interface SectionItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** Only the dashboard needs it: every other path is a distinct prefix. */
  end?: boolean;
  /**
   * The Artist Community and the Members' Lounge, the entries whose
   * availability depends on what the account owns. They are never removed and
   * never disabled: without a training they still lead somewhere, to the
   * preview of what is behind them.
   */
  community?: boolean;
}

const SECTIONS: SectionItem[] = [
  { to: "/compte", labelKey: "account.navDashboard", icon: LayoutDashboard, end: true },
  { to: "/compte/communaute", labelKey: "community.navEntry", icon: Users, community: true },
  { to: "/compte/salons", labelKey: "lounge.navEntry", icon: MessagesSquare, community: true },
  { to: "/compte/attestations", labelKey: "account.navCertificates", icon: Award },
  { to: "/compte/commandes", labelKey: "account.navOrders", icon: Package },
  { to: "/compte/avis", labelKey: "reviews.nav.account", icon: MessageSquareText },
  { to: "/compte/fidelite", labelKey: "account.navLoyalty", icon: Sparkles },
  { to: "/compte/profil", labelKey: "account.navProfile", icon: UserRound },
  { to: "/compte/securite", labelKey: "account.navSecurity", icon: ShieldCheck },
];

/** The section a pathname belongs to, for the title of the mobile bar. */
function currentSection(pathname: string): SectionItem | undefined {
  return SECTIONS.find((s) => (s.end ? pathname === s.to : pathname === s.to || pathname.startsWith(`${s.to}/`)));
}

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

const rowBase =
  "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-[length:var(--text-body-sm)] font-semibold transition-colors";
const rowIdle = "text-[var(--text-body)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]";

export function MemberShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { count } = useCart();
  /* The drawer is open for the page it was opened on: any navigation —
     including back/forward, which no click handler sees — closes it. */
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;
  const section = currentSection(pathname);

  return (
    <div className="flex min-h-[100dvh] bg-[var(--surface-page)]">
      <aside className="sticky top-0 hidden h-[100dvh] w-[272px] flex-none flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-card)] lg:flex">
        <SidebarBody />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Small screens: the menu, where you are, and the cart. */}
        <div className="sticky top-0 z-40 flex h-14 flex-none items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerPath(pathname)}
            aria-label={t("account.shell.openMenu")}
            aria-expanded={drawerOpen}
            className={clsx("grid h-10 w-10 place-items-center rounded-[var(--radius-sm)] text-[var(--gt-ink-700)] hover:bg-[var(--gt-ink-100)]", focusRing)}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <Link to="/" aria-label={t("nav.home")} className={clsx("grid h-10 w-10 flex-none place-items-center rounded-[var(--radius-sm)]", focusRing)}>
            <img src={monogram.src} alt="" className="h-7 w-7 object-contain" />
          </Link>
          <p className="m-0 min-w-0 flex-1 truncate text-[15px] font-[var(--weight-black)] text-[var(--text-primary)]">
            {section ? t(section.labelKey) : t("account.eyebrow")}
          </p>
          <CartLink count={count} compact />
        </div>

        {children}
      </div>

      {drawerOpen && <Drawer onClose={() => setDrawerPath(null)} />}
    </div>
  );
}

function Drawer({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  return (
    <div className="fixed inset-0 z-[450] lg:hidden">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(17,17,17,.38)] backdrop-blur-[2px] motion-safe:animate-[gt-fade-in_var(--duration-fast)_both]"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t("account.shell.menuLabel")}
        tabIndex={-1}
        className="gt-ws-drawer absolute inset-y-0 left-0 flex w-[min(320px,88vw)] flex-col bg-[var(--surface-card)] shadow-[var(--shadow-lg)]"
      >
        <SidebarBody onNavigate={onClose} closeButton={
          <button
            type="button"
            onClick={onClose}
            aria-label={t("account.shell.closeMenu")}
            className={clsx("grid h-9 w-9 flex-none place-items-center rounded-full hover:bg-[var(--gt-ink-100)]", focusRing)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        } />
      </div>
    </div>
  );
}

/**
 * Everything the sidebar holds, top to bottom: the brand, who is signed in,
 * their sections, the rest of the site, then the small print and signing out.
 * Rendered once in the desktop sidebar and once in the mobile drawer.
 */
function SidebarBody({ onNavigate, closeButton }: { onNavigate?: () => void; closeButton?: ReactNode }) {
  const { formatMonthYear } = useFormat();
  const { t } = useTranslation();
  const switchLanguage = useLanguageSwitch();
  const navigate = useNavigate();
  const { displayName, initials, email, signOut } = useAuth();
  const { memberSince } = useOrders();
  const { count } = useCart();
  const { openSettings } = useCookieConsent();
  /* Staff (any role the admin session accepts) get a way back to the back
     office. Navigation only: `RequireAdmin` and RLS still decide access. */
  const { signedIn: isStaff } = useAdminAuth();

  const leave = () => {
    onNavigate?.();
    signOut();
    navigate("/");
  };

  return (
    <>
      <div className="flex h-16 flex-none items-center gap-2 border-b border-[var(--border-subtle)] px-5">
        <Link to="/" onClick={onNavigate} className={clsx("flex-1 rounded-[var(--radius-sm)]", focusRing)}>
          <img src={logoBlack.src} alt={t("account.shell.homeAlt")} className="h-5 w-auto" />
        </Link>
        {closeButton}
      </div>

      <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain px-3 py-4">
        {/* Who is signed in: the space is theirs. */}
        <div className="flex items-center gap-3 px-2">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--surface-brand)] text-[length:var(--text-caption)] font-[var(--weight-black)] text-[var(--gt-ink-900)]"
          >
            {initials}
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span className="gt-eyebrow">{t("account.eyebrow")}</span>
            <strong className="truncate text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{displayName}</strong>
            <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {memberSince ? t("account.memberSince", { date: formatMonthYear(memberSince) }) : email}
            </span>
          </span>
        </div>

        <nav aria-label={t("account.navLabel")}>
          <ul className="m-0 grid list-none gap-0.5 p-0">
            {SECTIONS.map((item) => (
              <SectionLink key={item.to} item={item} onNavigate={onNavigate} />
            ))}
          </ul>
        </nav>

        {/* The rest of the site: what the storefront header used to offer. */}
        <nav aria-labelledby="gt-member-explore" className="grid gap-1">
          <span id="gt-member-explore" className="gt-eyebrow px-3">
            {t("nav.explore")}
          </span>
          <ul className="m-0 grid list-none gap-0.5 p-0">
            {MEMBER_SPACE_EXPLORE.map((space) => (
              <li key={space.id}>
                <Link to={space.to} onClick={onNavigate} className={clsx(rowBase, rowIdle, focusRing)}>
                  <space.icon size={16} strokeWidth={2} aria-hidden="true" />
                  <span className="flex flex-1 items-center gap-2">
                    {t(space.labelKey)}
                    {space.isNew && <NewTag />}
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <CartLink count={count} onNavigate={onNavigate} />
            </li>
          </ul>
        </nav>
      </div>

      <div className="grid flex-none gap-1 border-t border-[var(--border-subtle)] px-3 py-3">
        <div className="flex flex-wrap items-center gap-1">
          <Link
            to={LEGAL_PATHS.help}
            onClick={onNavigate}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
              focusRing,
            )}
          >
            <LifeBuoy size={14} aria-hidden="true" />
            {t("account.shell.help")}
          </Link>
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              openSettings();
            }}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
              focusRing,
            )}
          >
            <Cookie size={14} aria-hidden="true" />
            {t("account.shell.cookies")}
          </button>
          {isStaff && (
            <Link
              to="/admin"
              onClick={onNavigate}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
                focusRing,
              )}
            >
              <UserCog size={14} aria-hidden="true" />
              {t("account.shell.adminSpace")}
            </Link>
          )}
          <button
            type="button"
            onClick={switchLanguage}
            aria-label={t("common.langSwitchAria")}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-2.5 py-1.5 text-[length:var(--text-caption)] font-semibold uppercase text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
              focusRing,
            )}
          >
            <Languages size={14} aria-hidden="true" />
            {/* Shows the language you switch TO, like the storefront header. */}
            {t("common.langSwitchCode")}
          </button>
        </div>
        <button type="button" onClick={leave} className={clsx(rowBase, "text-left text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]", focusRing)}>
          <LogOut size={16} strokeWidth={2} aria-hidden="true" />
          {t("auth.signOut")}
        </button>
      </div>
    </>
  );
}

function SectionLink({ item, onNavigate }: { item: SectionItem; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const { hasAccess } = useCommunity();
  const Icon = item.icon;
  /* The community entries are the only ones that can be locked, and a lock icon alone
     would say it in colour and shape only — so the state is also written out. */
  const locked = item.community === true && !hasAccess;

  return (
    <li>
      <NavLink
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        className={({ isActive }) =>
          clsx(
            rowBase,
            focusRing,
            isActive
              ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
              : locked
                ? "border border-dashed border-[var(--border-default)] bg-[var(--surface-brand-wash-strong)] text-[var(--text-muted)] hover:border-[var(--gt-blue-300)] hover:text-[var(--text-primary)]"
                : rowIdle,
          )
        }
      >
        <Icon size={16} strokeWidth={2} aria-hidden="true" />
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate">{t(item.labelKey)}</span>
          {locked && (
            <span className="text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">
              {t("community.navEntryLocked")}
            </span>
          )}
        </span>
        {locked && <Lock size={13} strokeWidth={2} aria-hidden="true" className="ml-auto flex-none" />}
      </NavLink>
    </li>
  );
}

/** The cart, with its count: a full row in the sidebar, an icon in the mobile bar. */
function CartLink({ count, compact, onNavigate }: { count: number; compact?: boolean; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const label = count > 0 ? t("nav.cartWithCount", { count }) : t("nav.cart");

  if (compact) {
    return (
      <Link
        to="/panier"
        aria-label={label}
        className={clsx("relative grid h-10 w-10 flex-none place-items-center rounded-[var(--radius-sm)] text-[var(--gt-ink-700)] hover:bg-[var(--gt-ink-100)]", focusRing)}
      >
        <ShoppingBag size={19} aria-hidden="true" />
        {count > 0 && (
          <span aria-hidden="true" className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-[var(--gt-ink-900)] px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {count}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link to="/panier" onClick={onNavigate} aria-label={label} className={clsx(rowBase, rowIdle, focusRing)}>
      <ShoppingBag size={16} strokeWidth={2} aria-hidden="true" />
      <span className="flex-1">{t("nav.cart")}</span>
      {count > 0 && (
        <span aria-hidden="true" className="rounded-full bg-[var(--gt-ink-900)] px-2 py-0.5 text-[10.5px] font-bold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
