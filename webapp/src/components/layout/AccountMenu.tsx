import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ChevronDown, LogOut, User } from "lucide-react";
import { Link, useLocation, useNavigate } from "../../lib/navigation";
import { useAuth } from "../../lib/auth";
import { useCommunity } from "../../lib/community";
import { GLOWBOOK_INTRO_PATH } from "../../lib/studioUrl";
import { accountMenuGroups } from "./memberMenu";
import { useGlowbookMenuTarget } from "./useGlowbookMenuTarget";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

/**
 * The storefront header's "My space" menu (owner, 2026-11-17): the member
 * space's own entries (`accountMenuGroups`, from the sidebar's groups) a click
 * away from any page, the favourites among them, and signing out.
 *
 * On wide screens the "My space" pill stays a link to the dashboard and a
 * chevron beside it opens the menu, as the Shop, Academy and Atelier entries
 * do; on phones the account icon opens it (no extra width in the header).
 * A disclosure of links, not an ARIA menu: every entry is a page, which can be
 * opened in a new tab. It closes on Escape, an outside click and navigation.
 */
export function AccountMenu({ variant, onOpen }: { variant: "desktop" | "mobile"; onOpen?: () => void }) {
  const { t } = useTranslation();
  const { initials, displayName, signOut } = useAuth();
  const { hasAccess } = useCommunity();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const panelId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // Open for the page it was opened on: any navigation closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  // The plan's rights are asked only once the menu opens, never on every page view.
  const { target, bookings } = useGlowbookMenuTarget(open);
  const groups = accountMenuGroups({ glowbook: target !== GLOWBOOK_INTRO_PATH, bookings, lounge: hasAccess });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpenOn(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenOn(null);
      button.current?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    if (open) return setOpenOn(null);
    onOpen?.();
    setOpenOn(pathname);
  };
  const close = () => setOpenOn(null);
  const leave = () => {
    close();
    signOut();
    navigate("/");
  };

  return (
    <div ref={wrap} className={clsx("relative flex items-center", variant === "desktop" && "mx-1")}>
      {variant === "desktop" ? (
        /* Signed in, the account is a named place — "My space", with the member's initials:
           the link goes to the dashboard, the chevron opens the menu. */
        <div className="inline-flex items-center rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-card)] transition-colors hover:border-[var(--gt-blue-300)]">
          <Link
            to="/compte"
            onClick={close}
            className={clsx(
              "inline-flex items-center gap-2 whitespace-nowrap rounded-l-[var(--radius-pill)] py-1 pl-1 pr-2 text-xs font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)]",
              focusRing,
            )}
          >
            <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-[var(--surface-brand)] text-[10.5px] font-[var(--weight-black)] text-[var(--gt-ink-900)]">
              {initials}
            </span>
            {t("nav.mySpace")}
          </Link>
          <button
            ref={button}
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={t("account.menu.open")}
            className={clsx(
              "mr-1 grid h-7 w-7 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
              focusRing,
            )}
          >
            <ChevronDown size={14} aria-hidden="true" className={clsx("transition-transform duration-[var(--duration-fast)]", open && "rotate-180")} />
          </button>
        </div>
      ) : (
        <button
          ref={button}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={t("account.menu.open")}
          title={t("nav.mySpace")}
          className={clsx(
            "relative inline-flex size-10 items-center justify-center rounded-[var(--radius-pill)] border border-transparent text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)] [&>svg]:size-[18px]",
            focusRing,
          )}
        >
          <User strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}

      {open && (
        <div
          id={panelId}
          className={clsx(
            "z-[60] overflow-y-auto rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2 shadow-[var(--shadow-lg)] motion-safe:animate-[gt-menu-in_var(--duration-fast)_var(--ease-out-soft)_both]",
            variant === "desktop"
              ? "absolute right-0 top-[calc(100%+8px)] max-h-[calc(100vh-96px)] w-[300px]"
              : "fixed inset-x-3 top-[64px] max-h-[calc(100dvh-80px)]",
          )}
        >
          <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-2 pb-3 pt-1">
            <span aria-hidden="true" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--surface-brand)] text-[length:var(--text-caption)] font-[var(--weight-black)] text-[var(--gt-ink-900)]">
              {initials}
            </span>
            <span className="grid min-w-0">
              <span className="gt-eyebrow">{t("nav.mySpace")}</span>
              <strong className="truncate text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{displayName}</strong>
            </span>
          </div>
          <nav aria-label={t("account.menu.label")} className="grid gap-3 py-2">
            {groups.map((group) => {
              const headingId = `${panelId}-${group.id}`;
              return (
                <div key={group.id} className="grid gap-0.5">
                  {group.labelKey && (
                    <span id={headingId} className="gt-eyebrow px-2 pb-0.5">
                      {t(group.labelKey)}
                    </span>
                  )}
                  <ul aria-labelledby={group.labelKey ? headingId : undefined} className="m-0 grid list-none gap-0.5 p-0">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const current = item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
                      return (
                        <li key={item.to}>
                          <Link
                            to={item.to}
                            onClick={close}
                            aria-current={current ? "page" : undefined}
                            className={clsx(
                              "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[length:var(--text-body-sm)] font-semibold transition-colors",
                              current
                                ? "bg-[var(--surface-brand-wash)] text-[var(--text-primary)]"
                                : "text-[var(--text-body)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
                              focusRing,
                            )}
                          >
                            <Icon size={15} strokeWidth={2} aria-hidden="true" className="flex-none" />
                            <span className="truncate">{t(item.labelKey)}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>
          <div className="border-t border-[var(--border-subtle)] pt-2">
            <button
              type="button"
              onClick={leave}
              className={clsx(
                "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-left text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
                focusRing,
              )}
            >
              <LogOut size={15} strokeWidth={2} aria-hidden="true" className="flex-none" />
              {t("auth.signOut")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
