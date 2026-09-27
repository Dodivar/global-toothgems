import clsx from "clsx";
import { ArrowLeft, Box, LayoutGrid, Layers, LifeBuoy, MessageSquareHeart, UserRound, X, type LucideIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import monogram from "../../../assets/monogram-blue.png";
import { useAuth } from "../../../lib/auth";
import { useFocusTrap } from "../../../lib/useFocusTrap";
import { STUDIO_PATH, studioSectionPath, type StudioSection } from "../../../lib/studioUrl";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { openWorkspaceDialog } from "../../../lib/studioWorkspace/workspaceUi";
import { focusRing } from "./workspaceStyles";

interface NavItem {
  section: StudioSection | null;
  icon: LucideIcon;
  key: string;
}

const NAV: NavItem[] = [
  { section: null, icon: Box, key: "studio" },
  { section: "creations", icon: LayoutGrid, key: "creations" },
  { section: "groups", icon: Layers, key: "groups" },
  { section: "help", icon: LifeBuoy, key: "help" },
];

/**
 * The Studio workspace navigation.
 *
 * On desktop, a slim rail (icon + short label, never icon-only) that leaves
 * the 3D canvas nearly all the width. Below `lg`, the same entries in a
 * drawer opened from the top bar, so the stage keeps the whole screen.
 */
export function StudioSidebar({
  section,
  drawerOpen,
  onCloseDrawer,
}: {
  section: StudioSection | null;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <nav
        aria-label={t("studio.workspace.nav.label")}
        className="relative z-30 hidden w-[84px] flex-none flex-col items-center border-r border-[var(--border-subtle)] bg-[var(--surface-card)] py-3 lg:flex"
      >
        <RailContent section={section} />
      </nav>
      {drawerOpen && <Drawer section={section} onClose={onCloseDrawer} />}
    </>
  );
}

function useCounts() {
  const ws = useWorkspace();
  return ws.status === "ready" ? { creations: ws.creations.length, groups: ws.groups.length } : null;
}

function RailContent({ section }: { section: StudioSection | null }) {
  const { t } = useTranslation();
  const counts = useCounts();
  const { signedIn, initials } = useAuth();
  const { pathname } = useLocation();

  return (
    <>
      <Link
        to={STUDIO_PATH}
        aria-label={t("studio.editor.backToStudio")}
        title={t("studio.editor.backToStudio")}
        className={clsx("group/home relative mb-4 grid h-11 w-11 place-items-center rounded-[var(--radius-md)] hover:bg-[var(--gt-ink-100)]", focusRing)}
      >
        <img src={monogram} alt="" className="h-8 w-8 object-contain transition-opacity group-hover/home:opacity-0" />
        <ArrowLeft size={18} aria-hidden="true" className="absolute opacity-0 transition-opacity group-hover/home:opacity-100" />
      </Link>
      <ul className="m-0 grid w-full list-none gap-1 px-2 p-0">
        {NAV.map((item) => {
          const active = item.section === section;
          const count = item.section === "creations" ? counts?.creations : item.section === "groups" ? counts?.groups : undefined;
          return (
            <li key={item.key}>
              <Link
                to={studioSectionPath(item.section)}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "group/nav relative flex flex-col items-center gap-1 rounded-[var(--radius-md)] px-1 py-2 text-center transition-colors",
                  active ? "text-[var(--gt-ink-900)]" : "text-[var(--gt-ink-600)] hover:text-[var(--gt-ink-900)]",
                  focusRing,
                )}
              >
                {/* The active entry: a quiet blue pill behind the icon and a thin marker on the edge. */}
                <span
                  aria-hidden="true"
                  className={clsx(
                    "absolute -left-2 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--gt-ink-900)] transition-opacity",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
                <span
                  className={clsx(
                    "relative grid h-8 w-12 place-items-center rounded-[var(--radius-pill)] transition-colors duration-[var(--duration-fast)]",
                    active ? "bg-[var(--gt-blue-300)]" : "group-hover/nav:bg-[var(--gt-ink-100)]",
                  )}
                >
                  <item.icon size={18} aria-hidden="true" strokeWidth={active ? 2.2 : 1.8} />
                  {count !== undefined && count > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full border-2 border-[var(--surface-card)] bg-[var(--gt-ink-900)] px-1 text-[9.5px] font-bold leading-[14px] text-white">
                      {count}
                    </span>
                  )}
                </span>
                <span className={clsx("text-[10.5px] leading-tight", active ? "font-bold" : "font-semibold")}>
                  {t(`studio.workspace.nav.short.${item.key}`)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto grid w-full justify-items-center gap-1 px-2">
        <button
          type="button"
          onClick={() => openWorkspaceDialog({ kind: "feedback" })}
          className={clsx(
            "group/nav flex w-full flex-col items-center gap-1 rounded-[var(--radius-md)] px-1 py-2 text-[var(--gt-ink-600)] transition-colors hover:text-[var(--gt-ink-900)]",
            focusRing,
          )}
        >
          <span className="grid h-8 w-12 place-items-center rounded-[var(--radius-pill)] group-hover/nav:bg-[var(--gt-fuchsia-50)] group-hover/nav:text-[var(--gt-fuchsia-600)]">
            <MessageSquareHeart size={18} aria-hidden="true" strokeWidth={1.8} />
          </span>
          <span className="text-[10.5px] font-semibold leading-tight">{t("studio.workspace.nav.short.feedback")}</span>
        </button>
        <Link
          to={signedIn ? "/compte" : "/connexion"}
          state={signedIn ? undefined : { from: pathname }}
          aria-label={signedIn ? t("studio.workspace.nav.account") : t("studio.workspace.signIn.cta")}
          title={signedIn ? t("studio.workspace.nav.account") : t("studio.workspace.signIn.cta")}
          className={clsx(
            "mt-1 grid h-9 w-9 place-items-center rounded-full text-[11px] font-bold transition-colors",
            signedIn ? "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)] hover:bg-[var(--gt-blue-200)]" : "border border-[var(--border-default)] text-[var(--gt-ink-600)] hover:bg-[var(--gt-ink-100)]",
            focusRing,
          )}
        >
          {signedIn ? initials : <UserRound size={16} aria-hidden="true" />}
        </Link>
      </div>
    </>
  );
}

function Drawer({ section, onClose }: { section: StudioSection | null; onClose: () => void }) {
  const { t } = useTranslation();
  const counts = useCounts();
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  const { pathname } = useLocation();
  const { signedIn, displayName } = useAuth();

  return (
    <div className="fixed inset-0 z-[450] lg:hidden">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-[rgba(17,17,17,.38)] backdrop-blur-[2px] motion-safe:animate-[gt-fade-in_var(--duration-fast)_both]" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t("studio.workspace.nav.label")}
        tabIndex={-1}
        className="gt-ws-drawer absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col bg-[var(--surface-card)] shadow-[var(--shadow-lg)]"
      >
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
          <img src={monogram} alt="" aria-hidden="true" className="h-8 w-8 object-contain" />
          <div className="grid min-w-0 flex-1 leading-tight">
            <span className="text-[15px] font-[var(--weight-black)] text-[var(--text-primary)]">{t("studio.editor.appName")}</span>
            <span className="text-[11px] font-semibold text-[var(--text-subtle)]">
              {signedIn ? displayName : t("studio.workspace.nav.signedOut")}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("studio.workspace.close")}
            className={clsx("grid h-9 w-9 place-items-center rounded-full hover:bg-[var(--gt-ink-100)]", focusRing)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <ul className="m-0 grid list-none gap-1 p-3">
          {NAV.map((item) => {
            const active = item.section === section;
            const count = item.section === "creations" ? counts?.creations : item.section === "groups" ? counts?.groups : undefined;
            return (
              <li key={item.key}>
                <Link
                  to={studioSectionPath(item.section)}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 transition-colors",
                    active ? "bg-[var(--gt-blue-100)] text-[var(--gt-ink-900)]" : "text-[var(--gt-ink-700)] hover:bg-[var(--gt-ink-100)]",
                    focusRing,
                  )}
                >
                  <item.icon size={19} aria-hidden="true" className={active ? "text-[var(--gt-blue-700)]" : ""} />
                  <span className="grid min-w-0 flex-1">
                    <span className={clsx("text-[14px]", active ? "font-bold" : "font-semibold")}>{t(`studio.workspace.nav.${item.key}`)}</span>
                    <span className="truncate text-[11.5px] text-[var(--text-muted)]">{t(`studio.workspace.nav.desc.${item.key}`)}</span>
                  </span>
                  {count !== undefined && count > 0 && (
                    <span className="rounded-full bg-[var(--gt-ink-900)] px-2 py-0.5 text-[10.5px] font-bold text-white">{count}</span>
                  )}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => {
                onClose();
                openWorkspaceDialog({ kind: "feedback" });
              }}
              className={clsx("flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-[var(--gt-ink-700)] hover:bg-[var(--gt-ink-100)]", focusRing)}
            >
              <MessageSquareHeart size={19} aria-hidden="true" />
              <span className="grid">
                <span className="text-[14px] font-semibold">{t("studio.workspace.nav.feedback")}</span>
                <span className="text-[11.5px] text-[var(--text-muted)]">{t("studio.workspace.nav.desc.feedback")}</span>
              </span>
            </button>
          </li>
        </ul>
        <div className="mt-auto grid gap-1 border-t border-[var(--border-subtle)] p-3">
          <Link
            to={signedIn ? "/compte" : "/connexion"}
            state={signedIn ? undefined : { from: pathname }}
            onClick={onClose}
            className={clsx("flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-[13.5px] font-semibold text-[var(--gt-ink-700)] hover:bg-[var(--gt-ink-100)]", focusRing)}
          >
            <UserRound size={18} aria-hidden="true" />
            {signedIn ? t("studio.workspace.nav.account") : t("studio.workspace.signIn.cta")}
          </Link>
          <Link
            to={STUDIO_PATH}
            onClick={onClose}
            className={clsx("flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-[13.5px] font-semibold text-[var(--gt-ink-700)] hover:bg-[var(--gt-ink-100)]", focusRing)}
          >
            <ArrowLeft size={18} aria-hidden="true" />
            {t("studio.editor.backToStudio")}
          </Link>
        </div>
      </div>
    </div>
  );
}
