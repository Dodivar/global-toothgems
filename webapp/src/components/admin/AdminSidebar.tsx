import { useTranslation } from "react-i18next";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Package,
  Settings,
  ShoppingBag,
  Tags,
  TicketPercent,
  Users,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import monogram from "../../assets/monogram-white.png";
import { useAdminAuth } from "../../lib/adminAuth";

/**
 * Persistent navigation rail.
 *
 * Two groups, and the second one is the point: Training and Settings are drawn
 * and permanently disabled, so the prototype shows the shape of the finished
 * platform without pretending those sections exist. Marking them rather than
 * hiding them is what lets the future administrator judge where their work will
 * live.
 *
 * Analytics moved up into the first group when the Statistics screen landed:
 * the entry, its label and its icon are unchanged, it is simply a destination
 * now rather than a promise.
 */

interface RailItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  end?: boolean;
}

const MAIN: RailItem[] = [
  { to: "/admin", labelKey: "admin.nav.dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/commandes", labelKey: "admin.nav.orders", icon: ShoppingBag },
  { to: "/admin/clients", labelKey: "admin.nav.customers", icon: Users },
  { to: "/admin/produits", labelKey: "admin.nav.products", icon: Package },
  { to: "/admin/categories", labelKey: "admin.nav.categories", icon: Tags },
  { to: "/admin/promotions", labelKey: "admin.nav.promotions", icon: TicketPercent },
  { to: "/admin/statistiques", labelKey: "admin.nav.analytics", icon: BarChart3 },
];

const SOON: { labelKey: string; icon: LucideIcon }[] = [
  { labelKey: "admin.nav.training", icon: GraduationCap },
  { labelKey: "admin.nav.settings", icon: Settings },
];

const railFocus =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gt-blue-300)]";

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
  const navigate = useNavigate();
  const { admin, signOut } = useAdminAuth();

  const leave = () => {
    signOut();
    navigate("/admin/connexion", { replace: true });
  };

  return (
    <div className="flex h-full flex-col bg-[var(--admin-rail)] text-[var(--admin-rail-text)]">
      {/* Brand */}
      <div
        className={clsx(
          "flex h-[var(--admin-header-h)] flex-none items-center gap-3 border-b border-[var(--admin-rail-border)]",
          collapsed ? "justify-center px-3" : "px-5",
        )}
      >
        <Link
          to="/admin"
          onClick={onNavigate}
          className={clsx("flex items-center gap-3 rounded-[var(--admin-radius-sm)]", railFocus)}
        >
          <img src={monogram} alt="" aria-hidden="true" className="h-7 w-auto flex-none" />
          {!collapsed && (
            <span className="grid leading-tight">
              <span className="text-[length:var(--text-body-sm)] font-bold tracking-[var(--tracking-tight)]">
                Global Toothgems
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--admin-rail-muted)]">
                {t("admin.shell.areaLabel")}
              </span>
            </span>
          )}
        </Link>
      </div>

      <nav
        aria-label={t("admin.nav.primary")}
        className="gt-admin-scroll flex-1 overflow-y-auto px-3 py-5"
      >
        {!collapsed && (
          <p className="m-0 mb-2 px-2 text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--admin-rail-muted)]">
            {t("admin.nav.groupMain")}
          </p>
        )}
        <ul className="m-0 grid list-none gap-1 p-0">
          {MAIN.map((item) => (
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
                    "relative flex items-center gap-3 rounded-[var(--admin-radius-sm)] py-2.5 text-[length:var(--text-body-sm)] font-medium transition-colors",
                    collapsed ? "justify-center px-0" : "px-3",
                    railFocus,
                    isActive
                      ? "bg-[var(--admin-rail-active)] font-semibold text-[var(--gt-white)]"
                      : "text-[var(--admin-rail-muted)] hover:bg-[var(--admin-rail-hover)] hover:text-[var(--admin-rail-text)]",
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

        <p
          className={clsx(
            "m-0 mb-2 mt-7 text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--admin-rail-muted)]",
            collapsed ? "text-center" : "px-2",
          )}
        >
          {collapsed ? "···" : t("admin.nav.groupSoon")}
        </p>
        <ul className="m-0 grid list-none gap-1 p-0">
          {SOON.map((item) => (
            <li key={item.labelKey}>
              {/* A disabled button rather than a styled div: it is announced as
                  unavailable instead of looking clickable and doing nothing. */}
              <button
                type="button"
                disabled
                aria-disabled="true"
                title={`${t(item.labelKey)} — ${t("admin.nav.soon")}`}
                className={clsx(
                  "flex w-full cursor-not-allowed items-center gap-3 rounded-[var(--admin-radius-sm)] py-2.5 text-left text-[length:var(--text-body-sm)] font-medium text-[rgba(250,250,248,.34)]",
                  collapsed ? "justify-center px-0" : "px-3",
                )}
              >
                <item.icon size={17} strokeWidth={1.9} aria-hidden="true" className="flex-none" />
                {!collapsed && (
                  <>
                    <span className="flex-1">{t(item.labelKey)}</span>
                    <span className="rounded-[var(--radius-pill)] border border-[var(--admin-rail-border)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--admin-rail-muted)]">
                      {t("admin.nav.soon")}
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Administrator */}
      <div className="flex-none border-t border-[var(--admin-rail-border)] p-3">
        <div className={clsx("flex items-center gap-3 rounded-[var(--admin-radius-sm)] p-2", collapsed && "justify-center p-0 py-2")}>
          <span
            aria-hidden="true"
            className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--surface-brand)] text-[length:var(--text-caption)] font-bold text-[var(--gt-ink-900)]"
          >
            {admin?.initials ?? "?"}
          </span>
          {!collapsed && (
            <span className="grid min-w-0 leading-tight">
              <strong className="truncate text-[length:var(--text-body-sm)] font-semibold">{admin?.name}</strong>
              <span className="truncate text-[length:var(--text-caption)] text-[var(--admin-rail-muted)]">
                {admin ? t(`admin.role.${admin.role}`) : ""}
              </span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={leave}
          aria-label={collapsed ? t("admin.shell.signOut") : undefined}
          title={collapsed ? t("admin.shell.signOut") : undefined}
          className={clsx(
            "mt-1 flex w-full items-center gap-3 rounded-[var(--admin-radius-sm)] py-2.5 text-[length:var(--text-body-sm)] font-medium text-[var(--admin-rail-muted)] transition-colors hover:bg-[var(--admin-rail-hover)] hover:text-[var(--admin-rail-text)]",
            collapsed ? "justify-center px-0" : "px-3",
            railFocus,
          )}
        >
          <LogOut size={17} strokeWidth={1.9} aria-hidden="true" className="flex-none" />
          {!collapsed && t("admin.shell.signOut")}
        </button>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("admin.shell.expand") : undefined}
          title={collapsed ? t("admin.shell.expand") : t("admin.shell.collapse")}
          className={clsx(
            "mt-1 hidden w-full items-center gap-3 rounded-[var(--admin-radius-sm)] py-2.5 text-[length:var(--text-caption)] font-medium text-[var(--admin-rail-muted)] transition-colors hover:bg-[var(--admin-rail-hover)] hover:text-[var(--admin-rail-text)] lg:flex",
            collapsed ? "justify-center px-0" : "px-3",
            railFocus,
          )}
        >
          {collapsed ? (
            <ChevronsRight size={17} strokeWidth={1.9} aria-hidden="true" />
          ) : (
            <>
              <ChevronsLeft size={17} strokeWidth={1.9} aria-hidden="true" />
              {t("admin.shell.collapse")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
