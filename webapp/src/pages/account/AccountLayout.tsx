import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Award,
  GraduationCap,
  LayoutDashboard,
  Lock,
  LogOut,
  Package,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../lib/auth";
import { useCommunity } from "../../lib/community";
import { useOrders } from "../../lib/orders";
import { formatMonthYear } from "../../lib/format";

/**
 * Shell of the member area: a left sidebar on desktop, a scrollable row of pills
 * on small screens, and the active section in the main column.
 *
 * The sections used to be one long scrolling page. They are routes now, so the
 * navigation is a `NavLink` list — it gives the current entry `aria-current`
 * without any state of its own, and each section keeps its own URL. The
 * breakpoint is pure CSS (`lg:`) rather than a JS media query, so nothing
 * shifts after hydration.
 */

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** Only the dashboard needs it: every other path is a distinct prefix. */
  end?: boolean;
  /**
   * The Artist Community, which is the one entry whose availability depends on
   * what the account owns. It is never removed and never disabled: without a
   * training it still leads somewhere, to the preview of what is behind it.
   */
  community?: boolean;
}

const SECTIONS: NavItem[] = [
  { to: "/compte", labelKey: "account.navDashboard", icon: LayoutDashboard, end: true },
  { to: "/compte/communaute", labelKey: "community.navEntry", icon: Users, community: true },
  { to: "/compte/attestations", labelKey: "account.navCertificates", icon: Award },
  { to: "/compte/commandes", labelKey: "account.navOrders", icon: Package },
  { to: "/compte/fidelite", labelKey: "account.navLoyalty", icon: Sparkles },
  { to: "/compte/profil", labelKey: "account.navProfile", icon: UserRound },
];

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

function SidebarLink({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  const { hasAccess } = useCommunity();
  const Icon = item.icon;
  /* The community is the only entry that can be locked, and a lock icon alone
     would say it in colour and shape only — so the state is also written out,
     under the label on the sidebar and as text in the mobile row. */
  const locked = item.community === true && !hasAccess;

  return (
    <li>
      <NavLink
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          clsx(
            "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-[length:var(--text-body-sm)] font-semibold transition-colors",
            focusRing,
            isActive
              ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
              : locked
                ? "border border-dashed border-[var(--border-default)] bg-[var(--surface-brand-wash)] text-[var(--text-muted)] hover:border-[var(--gt-blue-300)] hover:text-[var(--text-primary)]"
                : "text-[var(--text-body)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
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

function TabLink({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  const { hasAccess } = useCommunity();
  const Icon = item.icon;
  const locked = item.community === true && !hasAccess;

  return (
    <li>
      <NavLink
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          clsx(
            "flex items-center gap-2 whitespace-nowrap rounded-[var(--radius-pill)] border px-3.5 py-2 text-[length:var(--text-caption)] font-semibold transition-colors",
            focusRing,
            isActive
              ? "border-transparent bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
              : locked
                ? "border-dashed border-[var(--border-default)] bg-[var(--surface-brand-wash)] text-[var(--text-muted)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-body)]",
          )
        }
      >
        <Icon size={14} strokeWidth={2} aria-hidden="true" />
        {t(item.labelKey)}
        {locked && (
          <>
            <Lock size={12} strokeWidth={2} aria-hidden="true" />
            <span className="sr-only">{t("community.navEntryLocked")}</span>
          </>
        )}
      </NavLink>
    </li>
  );
}

export function AccountLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { displayName, initials, email, signOut } = useAuth();
  const { memberSince } = useOrders();

  const leave = () => {
    signOut();
    navigate("/");
  };

  const identity = (
    <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-xs)]">
      <span
        aria-hidden="true"
        className="grid h-11 w-11 flex-none place-items-center rounded-full bg-[var(--surface-brand)] text-[length:var(--text-body-sm)] font-[var(--weight-black)] text-[var(--gt-ink-900)]"
      >
        {initials}
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="gt-eyebrow">{t("account.eyebrow")}</span>
        <strong className="truncate text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{displayName}</strong>
        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {memberSince ? t("account.memberSince", { date: formatMonthYear(memberSince) }) : email}
        </span>
      </span>
    </div>
  );

  return (
    <div className="mx-auto grid max-w-[var(--max-width-account)] grid-cols-1 items-start gap-[clamp(20px,3vw,40px)] px-[clamp(14px,4vw,48px)] py-[clamp(24px,4vw,44px)] lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="grid gap-4 lg:sticky lg:top-[92px]">
        {identity}

        {/* Desktop: the administration sidebar. */}
        <nav aria-label={t("account.navLabel")} className="hidden lg:grid lg:gap-1">
          <ul className="m-0 grid list-none gap-1 p-0">
            {SECTIONS.map((item) => (
              <SidebarLink key={item.to} item={item} />
            ))}
          </ul>

          <span className="my-2 h-px bg-[var(--border-subtle)]" />

          <Link
            to="/academy"
            className={clsx(
              "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-body)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
              focusRing,
            )}
          >
            <GraduationCap size={16} strokeWidth={2} aria-hidden="true" />
            <span className="flex-1">{t("account.navCatalogue")}</span>
            <ArrowUpRight size={14} aria-hidden="true" className="text-[var(--text-subtle)]" />
          </Link>

          <button
            type="button"
            onClick={leave}
            className={clsx(
              "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
              focusRing,
            )}
          >
            <LogOut size={16} strokeWidth={2} aria-hidden="true" />
            {t("auth.signOut")}
          </button>
        </nav>

        {/* Small screens: the same destinations as a scrollable pill row. */}
        {/* `min-w-0` keeps the row from widening the grid column: without it the
            pills size the page and the whole dashboard scrolls sideways. */}
        <nav aria-label={t("account.navLabel")} className="min-w-0 overflow-x-auto lg:hidden">
          <ul className="m-0 flex list-none gap-2 p-0 pb-1">
            {SECTIONS.map((item) => (
              <TabLink key={item.to} item={item} />
            ))}
            <li>
              <Link
                to="/academy"
                className={clsx(
                  "flex items-center gap-2 whitespace-nowrap rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3.5 py-2 text-[length:var(--text-caption)] font-semibold text-[var(--text-body)]",
                  focusRing,
                )}
              >
                <GraduationCap size={14} strokeWidth={2} aria-hidden="true" />
                {t("account.navCatalogue")}
                <ArrowUpRight size={12} aria-hidden="true" className="text-[var(--text-subtle)]" />
              </Link>
            </li>
            {/* The sidebar's sign-out is desktop-only, so the row carries its own:
                leaving the account must not require opening the profile first. */}
            <li>
              <button
                type="button"
                onClick={leave}
                className={clsx(
                  "flex items-center gap-2 whitespace-nowrap rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3.5 py-2 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]",
                  focusRing,
                )}
              >
                <LogOut size={14} strokeWidth={2} aria-hidden="true" />
                {t("auth.signOut")}
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      <div className="grid min-w-0 gap-[clamp(28px,4vw,44px)]">
        <Outlet />
      </div>
    </div>
  );
}
