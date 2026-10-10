import { useTranslation } from "react-i18next";
import { Link, NavLink, useNavigate, useLanguageSwitch } from "../../lib/navigation";
import {
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  GraduationCap,
  Languages,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Package,
  Settings,
  ShoppingBag,
  Store,
  Tags,
  TicketPercent,
  UserCog,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import monogram from "../../assets/monogram-white.png";
import { useAdminAuth } from "../../lib/adminAuth";

/**
 * Persistent navigation rail.
 *
 * Laid out like the member space's sidebar (`MemberShell`), in the rail's own
 * dark colours: the brand (with the desktop collapse toggle beside it), who is
 * signed in, the sections, then at the foot the switch to the member space,
 * the store and the language on one line, and signing out last.
 *
 * The sections are grouped by job — selling (orders, customers, promotions,
 * reviews), the catalogue, the Academy, and running the back office itself
 * (team, settings) — under the dashboard and statistics, which read across all
 * of them. Collapsed, a group's heading becomes a thin divider.
 *
 * The collapse toggle lives in the header, not under "Sign out": two
 * look-alike rows stacked at the foot made one easy to hit for the other.
 */

interface RailItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  end?: boolean;
}

interface RailGroup {
  id: string;
  /** None for the first group: the dashboard needs no heading. */
  labelKey?: string;
  items: RailItem[];
}

const GROUPS: RailGroup[] = [
  {
    id: "overview",
    items: [
      { to: "/admin", labelKey: "admin.nav.dashboard", icon: LayoutDashboard, end: true },
      { to: "/admin/statistiques", labelKey: "admin.nav.analytics", icon: BarChart3 },
    ],
  },
  {
    id: "sales",
    labelKey: "admin.nav.groupSales",
    items: [
      { to: "/admin/commandes", labelKey: "admin.nav.orders", icon: ShoppingBag },
      { to: "/admin/clients", labelKey: "admin.nav.customers", icon: Users },
      { to: "/admin/promotions", labelKey: "admin.nav.promotions", icon: TicketPercent },
      { to: "/admin/avis", labelKey: "reviews.nav.admin", icon: MessageSquareText },
    ],
  },
  {
    id: "catalogue",
    labelKey: "admin.nav.groupCatalogue",
    items: [
      { to: "/admin/produits", labelKey: "admin.nav.products", icon: Package },
      { to: "/admin/categories", labelKey: "admin.nav.categories", icon: Tags },
    ],
  },
  {
    id: "academy",
    labelKey: "admin.nav.groupAcademy",
    items: [{ to: "/admin/formations", labelKey: "admin.nav.training", icon: GraduationCap }],
  },
  {
    id: "administration",
    labelKey: "admin.nav.groupAdministration",
    items: [
      { to: "/admin/utilisateurs", labelKey: "admin.nav.users", icon: UserCog },
      { to: "/admin/parametres", labelKey: "admin.nav.settings", icon: Settings },
    ],
  },
];

const railFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gt-blue-300)]";

const railIdle = "text-[var(--admin-rail-muted)] hover:bg-[var(--admin-rail-hover)] hover:text-[var(--admin-rail-text)]";

/** A full row of the rail: the sections, the member space, signing out. */
const railRow = (collapsed: boolean) =>
  clsx(
    "relative flex w-full items-center gap-3 rounded-[var(--admin-radius-sm)] py-2.5 text-[length:var(--text-body-sm)] font-medium transition-colors",
    collapsed ? "justify-center px-0" : "px-3",
    railFocus,
  );

/** The smaller utilities at the foot (store, language): one line, icon-only squares when collapsed. */
const footTool = (collapsed: boolean) =>
  clsx(
    "inline-flex h-9 items-center gap-1.5 rounded-[var(--admin-radius-sm)] text-[length:var(--text-caption)] font-semibold transition-colors",
    railIdle,
    collapsed ? "w-9 justify-center" : "px-2.5",
    railFocus,
  );

export function AdminSidebar({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle: () => void;
  /** Lets the small-screen drawer close itself when a destination is chosen. */
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const switchLanguage = useLanguageSwitch();
  const navigate = useNavigate();
  const { admin, signOut } = useAdminAuth();

  const leave = () => {
    signOut();
    navigate("/admin/connexion", { replace: true });
  };

  /* Desktop only: the small-screen drawer closes with its scrim instead. */
  const toggle = (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? t("admin.shell.expand") : t("admin.shell.collapse")}
      title={collapsed ? t("admin.shell.expand") : t("admin.shell.collapse")}
      className={clsx(
        "hidden h-8 w-8 flex-none place-items-center rounded-[var(--admin-radius-sm)] transition-colors lg:grid",
        railIdle,
        railFocus,
      )}
    >
      {collapsed ? (
        <ChevronsRight size={17} strokeWidth={1.9} aria-hidden="true" />
      ) : (
        <ChevronsLeft size={17} strokeWidth={1.9} aria-hidden="true" />
      )}
    </button>
  );

  return (
    <div className="flex h-full flex-col bg-[var(--admin-rail)] text-[var(--admin-rail-text)]">
      {/* Brand and, on desktop, the collapse toggle. Collapsed, the rail is too
          narrow for both: the toggle takes the header, the way to expand it. */}
      <div
        className={clsx(
          "flex h-[var(--admin-header-h)] flex-none items-center gap-2 border-b border-[var(--admin-rail-border)]",
          collapsed ? "justify-center px-3" : "pl-5 pr-3",
        )}
      >
        <Link
          to="/admin"
          onClick={onNavigate}
          className={clsx(
            "min-w-0 flex-1 items-center gap-3 rounded-[var(--admin-radius-sm)]",
            collapsed ? "flex lg:hidden" : "flex",
            railFocus,
          )}
        >
          <img src={monogram.src} alt="" aria-hidden="true" className="h-7 w-auto flex-none" />
          {!collapsed && (
            <span className="grid min-w-0 leading-tight">
              <span className="truncate text-[length:var(--text-body-sm)] font-bold tracking-[var(--tracking-tight)]">
                Global Toothgems
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--admin-rail-muted)]">
                {t("admin.shell.areaLabel")}
              </span>
            </span>
          )}
        </Link>
        {toggle}
      </div>

      {/* Who is signed in, under the brand as in the member space. */}
      <div
        className={clsx(
          "flex flex-none items-center gap-3 border-b border-[var(--admin-rail-border)] py-4",
          collapsed ? "justify-center px-3" : "px-5",
        )}
        title={collapsed && admin ? `${admin.name} — ${t(`admin.role.${admin.role}`)}` : undefined}
      >
        <span
          aria-hidden="true"
          className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--surface-brand)] text-[length:var(--text-caption)] font-bold text-[var(--gt-ink-900)]"
        >
          {admin?.initials ?? "?"}
        </span>
        {collapsed ? (
          <span className="sr-only">{admin?.name}</span>
        ) : (
          <span className="grid min-w-0 leading-tight">
            <strong className="truncate text-[length:var(--text-body-sm)] font-semibold">{admin?.name}</strong>
            <span className="truncate text-[length:var(--text-caption)] text-[var(--admin-rail-muted)]">
              {admin ? t(`admin.role.${admin.role}`) : ""}
            </span>
          </span>
        )}
      </div>

      <nav
        aria-label={t("admin.nav.primary")}
        className="gt-admin-scroll grid flex-1 content-start gap-5 overflow-y-auto px-3 py-5"
      >
        {GROUPS.map((group) => {
          const headingId = `gt-admin-nav-${group.id}`;
          return (
            <div key={group.id} className="grid gap-1.5">
              {group.labelKey &&
                (collapsed ? (
                  <>
                    {/* The heading is gone visually; keep it for screen readers. */}
                    <span aria-hidden="true" className="mx-auto mb-1 h-px w-8 bg-[var(--admin-rail-border)]" />
                    <span id={headingId} className="sr-only">
                      {t(group.labelKey)}
                    </span>
                  </>
                ) : (
                  <p
                    id={headingId}
                    className="m-0 px-3 text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--admin-rail-muted)]"
                  >
                    {t(group.labelKey)}
                  </p>
                ))}
              <ul
                aria-labelledby={group.labelKey ? headingId : undefined}
                className="m-0 grid list-none gap-0.5 p-0"
              >
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      // Collapsed, the label is gone from the DOM, so the name has to
                      // be supplied explicitly — a `title` alone is a tooltip, not a
                      // guarantee.
                      aria-label={collapsed ? t(item.labelKey) : undefined}
                      title={collapsed ? t(item.labelKey) : undefined}
                      className={({ isActive }) =>
                        clsx(
                          railRow(collapsed),
                          isActive ? "bg-[var(--admin-rail-active)] font-semibold text-[var(--gt-white)]" : railIdle,
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* The active marker is a shape, not a tint: the rail is
                              near-black, where a background alone is easy to miss. */}
                          <span
                            aria-hidden="true"
                            className={clsx(
                              "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-[2px] bg-[var(--accent-cta)] transition-opacity",
                              isActive ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <item.icon size={17} strokeWidth={1.9} aria-hidden="true" className="flex-none" />
                          {!collapsed && <span>{t(item.labelKey)}</span>}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* The foot, in the same order as the member space's: switching space
          first (a full row — for staff it is a primary move), the small
          utilities on one line, then signing out, alone at the very bottom. */}
      <div className="grid flex-none gap-1 border-t border-[var(--admin-rail-border)] p-3">
        {/* Staff are members too: their own account is one click away. */}
        <Link
          to="/compte"
          onClick={onNavigate}
          aria-label={collapsed ? t("admin.shell.memberSpace") : undefined}
          title={collapsed ? t("admin.shell.memberSpace") : undefined}
          className={clsx(railRow(collapsed), railIdle)}
        >
          <UserRound size={17} strokeWidth={1.9} aria-hidden="true" className="flex-none" />
          {!collapsed && t("admin.shell.memberSpace")}
        </Link>

        <div className={clsx("flex gap-1", collapsed ? "flex-col items-center" : "items-center")}>
          {/* The storefront is the other half of the job; the admin should
              never be a dead end away from it. */}
          <Link
            to="/"
            onClick={onNavigate}
            aria-label={collapsed ? t("admin.shell.viewStore") : undefined}
            title={collapsed ? t("admin.shell.viewStore") : undefined}
            className={clsx(footTool(collapsed), !collapsed && "flex-1")}
          >
            <Store size={14} strokeWidth={1.9} aria-hidden="true" className="flex-none" />
            {!collapsed && t("admin.shell.viewStore")}
          </Link>
          <button
            type="button"
            onClick={switchLanguage}
            aria-label={t("common.langSwitchAria")}
            title={t("common.langSwitchAria")}
            className={clsx(footTool(collapsed), "uppercase")}
          >
            <Languages size={14} strokeWidth={1.9} aria-hidden="true" className="flex-none" />
            {/* Shows the language you switch TO, like the storefront header. */}
            {!collapsed && t("common.langSwitchCode")}
          </button>
        </div>

        <span aria-hidden="true" className="my-1 h-px bg-[var(--admin-rail-border)]" />

        <button
          type="button"
          onClick={leave}
          aria-label={collapsed ? t("admin.shell.signOut") : undefined}
          title={collapsed ? t("admin.shell.signOut") : undefined}
          className={clsx(railRow(collapsed), railIdle)}
        >
          <LogOut size={17} strokeWidth={1.9} aria-hidden="true" className="flex-none" />
          {!collapsed && t("admin.shell.signOut")}
        </button>
      </div>
    </div>
  );
}
