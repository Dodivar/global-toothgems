import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
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
  PanelLeftOpen,
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
import { useChat } from "../../lib/communityChat/chatStore";
import { parseLoungePath } from "../../lib/communityChat/loungeRoutes";
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
 *
 * In the Members' Lounge the lounge has its own navigation, so the shell
 * steps back instead of stacking a second full menu beside it: on desktop the
 * sidebar narrows to a rail of the same sections (icon + short label, like the
 * Studio's rail), and the full menu opens over the page from it; on phones the
 * top bar is left out and the lounge opens the same menu from its own drawer
 * (`useMemberShellMenu`).
 */

const MemberShellMenuContext = createContext<{ openMenu: () => void } | null>(null);

/** Opens the member-space menu from inside a page (the lounge, whose screen hides the shell's own bar). */
export function useMemberShellMenu() {
  return useContext(MemberShellMenuContext);
}

interface SectionItem {
  to: string;
  labelKey: string;
  /** Under `account.shell.short`, for the rail. */
  shortKey: string;
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
  /** The Members' Lounge: carries its unread activity. */
  lounge?: boolean;
}

const SECTIONS: SectionItem[] = [
  { to: "/compte", labelKey: "account.navDashboard", shortKey: "dashboard", icon: LayoutDashboard, end: true },
  { to: "/compte/communaute", labelKey: "community.navEntry", shortKey: "community", icon: Users, community: true },
  { to: "/compte/salons", labelKey: "lounge.navEntry", shortKey: "lounge", icon: MessagesSquare, community: true, lounge: true },
  { to: "/compte/attestations", labelKey: "account.navCertificates", shortKey: "certificates", icon: Award },
  { to: "/compte/commandes", labelKey: "account.navOrders", shortKey: "orders", icon: Package },
  { to: "/compte/avis", labelKey: "reviews.nav.account", shortKey: "reviews", icon: MessageSquareText },
  { to: "/compte/fidelite", labelKey: "account.navLoyalty", shortKey: "loyalty", icon: Sparkles },
  { to: "/compte/profil", labelKey: "account.navProfile", shortKey: "profile", icon: UserRound },
  { to: "/compte/securite", labelKey: "account.navSecurity", shortKey: "security", icon: ShieldCheck },
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
  const { hasAccess } = useCommunity();
  /* The lounge's own navigation takes the lead; the locked lounge and its
     404 (an unknown room) keep the full shell. */
  const compact = hasAccess && parseLoungePath(pathname).kind !== "notFound";
  const menu = useMemo(() => ({ openMenu: () => setDrawerPath(pathname) }), [pathname]);

  return (
    <MemberShellMenuContext.Provider value={menu}>
    <div className="flex min-h-[100dvh] bg-[var(--surface-page)]">
      <aside
        className={clsx(
          "sticky top-0 hidden h-[100dvh] flex-none flex-col overflow-hidden border-r border-[var(--border-subtle)] bg-[var(--surface-card)] transition-[width] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] lg:flex",
          compact ? "w-[88px]" : "w-[272px]",
        )}
      >
        {compact ? <Rail onExpand={menu.openMenu} expanded={drawerOpen} /> : <SidebarBody />}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Small screens: the menu, where you are, and the cart. Left out in
            the lounge, whose header takes its place. */}
        <div
          className={clsx(
            "sticky top-0 z-40 h-14 flex-none items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 lg:hidden",
            compact ? "hidden" : "flex",
          )}
        >
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

      {/* In the lounge the drawer is also the desktop's full menu, opened from the rail. */}
      {drawerOpen && <Drawer onClose={() => setDrawerPath(null)} everywhere={compact} />}
    </div>
    </MemberShellMenuContext.Provider>
  );
}

function Drawer({ onClose, everywhere = false }: { onClose: () => void; everywhere?: boolean }) {
  const { t } = useTranslation();
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  return (
    <div className={clsx("fixed inset-0 z-[450]", !everywhere && "lg:hidden")}>
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
        {item.lounge && !locked && <LoungeActivity />}
      </NavLink>
    </li>
  );
}

/**
 * The lounge's unread activity beside its entry: a number on a fuchsia pill
 * for what is addressed to you (mentions, private messages), a dot for the
 * rest — and both written out for screen readers.
 */
function LoungeActivity({ onRail = false }: { onRail?: boolean }) {
  const { t } = useTranslation();
  const { activity } = useChat();
  if (activity.attention > 0) {
    return (
      <span
        className={clsx(
          "grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--accent-highlight-ink)] px-1 text-[10px] font-bold leading-none text-white",
          onRail ? "absolute -right-1 -top-1 border-2 border-[var(--surface-card)]" : "ml-auto",
        )}
      >
        <span aria-hidden="true">{activity.attention}</span>
        <span className="sr-only">{t("lounge.nav.attention", { count: activity.attention })}</span>
      </span>
    );
  }
  if (activity.unread > 0) {
    return (
      <span className={clsx("h-2 w-2 rounded-full bg-current", onRail ? "absolute right-0 top-0" : "ml-auto")}>
        <span className="sr-only">{t("lounge.nav.unread")}</span>
      </span>
    );
  }
  return null;
}

const railRow =
  "group/nav relative flex w-full flex-col items-center gap-1 rounded-[var(--radius-md)] px-0.5 py-1.5 text-center transition-colors";

/**
 * The member space as a rail, in the lounge: the same sections, icons and
 * order as the sidebar, each with a short label (never icon-only), the full
 * name as a tooltip. "Menu" opens the whole sidebar over the page — the rest
 * of the site, help and signing out are one step away.
 */
function Rail({ onExpand, expanded }: { onExpand: () => void; expanded: boolean }) {
  const { t } = useTranslation();
  const { initials, displayName } = useAuth();
  const { count } = useCart();

  return (
    <nav aria-label={t("account.navLabel")} className="flex h-full w-[88px] flex-col items-center overflow-y-auto overflow-x-hidden overscroll-contain py-3">
      <Link
        to="/"
        aria-label={t("nav.home")}
        title={t("nav.home")}
        className={clsx("mb-3 grid h-11 w-11 flex-none place-items-center rounded-[var(--radius-md)] hover:bg-[var(--gt-ink-100)]", focusRing)}
      >
        <img src={monogram.src} alt="" className="h-8 w-8 object-contain" />
      </Link>

      <ul className="m-0 grid w-full list-none gap-0.5 px-1.5 py-0">
        {SECTIONS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              title={t(item.labelKey)}
              className={({ isActive }) =>
                clsx(railRow, isActive ? "text-[var(--gt-ink-900)]" : "text-[var(--gt-ink-600)] hover:text-[var(--gt-ink-900)]", focusRing)
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "absolute -left-2 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--gt-ink-900)] transition-opacity",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span
                    className={clsx(
                      "relative grid h-8 w-12 place-items-center rounded-[var(--radius-pill)] transition-colors duration-[var(--duration-fast)]",
                      isActive ? "bg-[var(--gt-blue-300)]" : "group-hover/nav:bg-[var(--gt-ink-100)]",
                    )}
                  >
                    <item.icon size={18} aria-hidden="true" strokeWidth={isActive ? 2.2 : 1.8} />
                    {item.lounge && <LoungeActivity onRail />}
                  </span>
                  <span aria-hidden="true" className={clsx("max-w-full text-[10px] leading-tight tracking-[-0.01em]", isActive ? "font-bold" : "font-semibold")}>
                    {t(`account.shell.short.${item.shortKey}`)}
                  </span>
                  <span className="sr-only">{t(item.labelKey)}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-auto grid w-full flex-none justify-items-center gap-0.5 px-2 pt-3">
        <span aria-hidden="true" className="mb-1 h-px w-10 bg-[var(--border-subtle)]" />
        <Link
          to="/panier"
          title={count > 0 ? t("nav.cartWithCount", { count }) : t("nav.cart")}
          className={clsx(railRow, "text-[var(--gt-ink-600)] hover:text-[var(--gt-ink-900)]", focusRing)}
        >
          <span className="relative grid h-8 w-12 place-items-center rounded-[var(--radius-pill)] group-hover/nav:bg-[var(--gt-ink-100)]">
            <ShoppingBag size={18} aria-hidden="true" strokeWidth={1.8} />
            {count > 0 && (
              <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-[18px] rounded-full border-2 border-[var(--surface-card)] bg-[var(--gt-ink-900)] px-1 text-[9.5px] font-bold leading-[14px] text-white">
                {count}
              </span>
            )}
          </span>
          <span aria-hidden="true" className="text-[10.5px] font-semibold leading-tight">
            {t("account.shell.short.cart")}
          </span>
          <span className="sr-only">{count > 0 ? t("nav.cartWithCount", { count }) : t("nav.cart")}</span>
        </Link>
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={expanded}
          aria-label={t("account.shell.expandMenu")}
          title={t("account.shell.expandMenu")}
          className={clsx(railRow, "text-[var(--gt-ink-600)] hover:text-[var(--gt-ink-900)]", focusRing)}
        >
          <span className="grid h-8 w-12 place-items-center rounded-[var(--radius-pill)] group-hover/nav:bg-[var(--gt-ink-100)]">
            <PanelLeftOpen size={18} aria-hidden="true" strokeWidth={1.8} />
          </span>
          <span aria-hidden="true" className="text-[10.5px] font-semibold leading-tight">
            {t("account.shell.short.menu")}
          </span>
        </button>
        <Link
          to="/compte/profil"
          title={displayName}
          aria-label={`${t("account.navProfile")} — ${displayName}`}
          className={clsx("mt-1 grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-brand)] text-[11px] font-[var(--weight-black)] text-[var(--gt-ink-900)]", focusRing)}
        >
          <span aria-hidden="true">{initials}</span>
        </Link>
      </div>
    </nav>
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
