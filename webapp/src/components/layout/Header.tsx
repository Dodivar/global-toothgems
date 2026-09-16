import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, Heart, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { Button } from "../ui/Button";
import { ShapeCarousel } from "../ui/ShapeCarousel";
import { ColorCarousel } from "../ui/ColorCarousel";
import { useAuth } from "../../lib/auth";
import { useCart } from "../../lib/cart";
import { useToast } from "../../lib/toast";
import { MENU } from "../../data/menu";
import { colorsInCatalog, shapesInCatalog } from "../../data/products";
import { colorHref, shapeHref } from "../../lib/shopUrl";
import { pick } from "../../data/types";
import logoBlack from "../../assets/logo-wordmark-black.png";

type PanelKey = "shop" | "academy" | null;
type MobileTab = "gems" | "shop" | "academy";

/** Long enough that a pointer crossing the nav on its way elsewhere does not
 *  open anything, short enough that a deliberate hover feels immediate. */
const HOVER_OPEN_MS = 120;
/** Grace for the trip from the nav item down into the panel. */
const HOVER_CLOSE_MS = 250;

export function Header() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { count } = useCart();
  const { signedIn } = useAuth();
  const { showToast } = useToast();
  const lang = i18n.language;

  const [panel, setPanel] = useState<PanelKey>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<MobileTab>("gems");
  const rootRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | null>(null);
  /** Panel the user just closed on purpose, held until the pointer leaves that
   *  nav item — otherwise the next mouse move reopens what they dismissed. */
  const dismissed = useRef<PanelKey>(null);

  const links: { id: string; label: string; to: string; panel?: Exclude<PanelKey, null>; panelLabel?: string }[] = [
    { id: "home", label: t("nav.home"), to: "/" },
    { id: "shop", label: t("nav.shop"), to: "/boutique", panel: "shop", panelLabel: t("nav.openPanelShop") },
    { id: "academy", label: t("nav.academy"), to: "/academy", panel: "academy", panelLabel: t("nav.openPanelAcademy") },
  ];

  const closeAll = () => {
    setPanel(null);
    setMenuOpen(false);
  };

  // Hover is an addition on top of the chevron button, never a replacement: the
  // click toggle, aria-expanded and keyboard paths below are untouched, and a
  // coarse pointer (which reports no hover) still only opens the panel on tap.
  const clearHoverTimer = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  const canHover = () => window.matchMedia("(hover: hover)").matches;
  const hoverTo = (next: PanelKey) => {
    if (!canHover()) return;
    if (next && dismissed.current === next) return;
    clearHoverTimer();
    hoverTimer.current = window.setTimeout(() => setPanel(next), next ? HOVER_OPEN_MS : HOVER_CLOSE_MS);
  };
  useEffect(() => clearHoverTimer, []);

  // Backstop for history navigation (back/forward), which no click handler sees.
  useEffect(() => {
    setPanel(null);
    setMenuOpen(false);
  }, [location.pathname]);

  // Escape and outside clicks close whatever is open.
  useEffect(() => {
    if (!panel && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearHoverTimer();
        setPanel(null);
        setMenuOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        clearHoverTimer();
        setPanel(null);
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [panel, menuOpen]);

  const notIncluded = () => showToast(t("common.notIncludedTitle"), t("common.notIncludedScreen"), "info");

  /** The account entry point: the login page is the only account screen in the maquette. */
  const openAccount = () => {
    closeAll();
    navigate("/connexion");
  };

  const panelItems = panel === "shop" ? [...MENU.gems, ...MENU.shop] : panel === "academy" ? MENU.academy : [];
  const panelRoot =
    panel === "shop"
      ? { label: t("nav.viewAllShop"), to: "/boutique" }
      : { label: t("nav.viewAllAcademy"), to: "/academy" };

  const mobileTabs: { key: MobileTab; label: string }[] = [
    { key: "gems", label: t("nav.menuTabGems") },
    { key: "shop", label: t("nav.menuTabShop") },
    { key: "academy", label: t("nav.menuTabAcademy") },
  ];
  const mobileItems = MENU[menuTab];
  const mobileRoot =
    menuTab === "academy" ? { label: t("nav.viewAllAcademy"), to: "/academy" } : { label: t("nav.viewAllShop"), to: "/boutique" };

  const cartLabel = count > 0 ? t("nav.cartWithCount", { count }) : t("nav.cart");

  const shapeGroups = shapesInCatalog();
  const colorGroups = colorsInCatalog();

  const goTo = (to: string) => {
    clearHoverTimer();
    closeAll();
    navigate(to);
  };

  /**
   * The shape and colour rows shared by the desktop panel and the mobile
   * drawer: a swipeable strip of the whole taxonomy plus a way to open the
   * full-page selector when the strip is not enough.
   */
  const pickers = (compact: boolean) => {
    /* `compact` is the desktop panel. There the strip itself is the offer and
       the whole-taxonomy page is only a fallback, so it drops to a quiet
       underlined link under the strip — the same treatment as "voir toute la
       boutique" and as the shop filter bar. The mobile drawer keeps the button,
       which is the tap target a thumb needs. */
    const section = (heading: string, to: string, label: string, carousel: ReactNode) => (
      /* Desktop is a flex column so the two links land on one baseline even
         though the colour tiles wrap onto a second line and the shape tiles
         do not. */
      <div className={`min-w-0 gap-3 ${compact ? "flex flex-col" : "grid content-start"}`}>
        {compact ? (
          <span className="gt-eyebrow">{heading}</span>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="gt-eyebrow">{heading}</span>
            <Button variant="outline" size="sm" onClick={() => goTo(to)}>
              {label}
            </Button>
          </div>
        )}
        {carousel}
        {compact && (
          <Link
            to={to}
            onClick={() => {
              clearHoverTimer();
              closeAll();
            }}
            className="mt-auto self-start text-xs text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]"
          >
            {label}
          </Link>
        )}
      </div>
    );

    return (
      <>
        {section(
          t("nav.shapesHeading"),
          "/formes",
          t("nav.viewAllShapes"),
          <ShapeCarousel compact={compact} groups={shapeGroups} hrefFor={(g) => shapeHref(g.shape)} onNavigate={closeAll} />,
        )}
        {section(
          t("nav.colorsHeading"),
          "/couleurs",
          t("nav.viewAllColors"),
          <ColorCarousel compact={compact} groups={colorGroups} hrefFor={(g) => colorHref(g.color)} onNavigate={closeAll} />,
        )}
      </>
    );
  };

  const langButton = (
    <button
      type="button"
      onClick={() => i18n.changeLanguage(lang.startsWith("en") ? "fr" : "en")}
      aria-label={t("common.langSwitchAria")}
      className="rounded-[var(--radius-pill)] px-2 py-1 text-xs font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
    >
      {/* Shows the language you switch TO, not the one you are already reading. */}
      {t("common.langSwitchCode")}
    </button>
  );

  return (
    <div ref={rootRef} className="sticky top-0 z-[60] border-b border-[var(--border-subtle)] bg-[var(--surface-page)]">
      {/* Desktop */}
      <div className="relative hidden md:block" onMouseLeave={() => hoverTo(null)}>
        <header className="flex h-[76px] items-center gap-8 px-[var(--gutter-page-lg)]">
          <Link to="/" className="flex-none" onClick={closeAll}>
            <img src={logoBlack} alt="Global Toothgems" className="h-6 w-auto" />
          </Link>
          <nav aria-label={t("nav.primary")} className="flex flex-1 items-center gap-6 overflow-hidden">
            {links.map((link) => {
              const onRoute = location.pathname === link.to;
              const expanded = link.panel != null && panel === link.panel;
              return (
                <span
                  key={link.id}
                  className="flex items-center gap-0.5"
                  onMouseEnter={() => hoverTo(link.panel ?? null)}
                  onMouseLeave={() => {
                    if (dismissed.current === link.panel) dismissed.current = null;
                  }}
                >
                  {/* The label navigates. Previously a nav item that owned a panel
                      only toggled that panel, so "Boutique" never reached /boutique. */}
                  <Link
                    to={link.to}
                    onClick={() => {
                      clearHoverTimer();
                      closeAll();
                    }}
                    aria-current={onRoute ? "page" : undefined}
                    className="border-b-2 pb-1 text-[13px] font-semibold uppercase tracking-[var(--tracking-wide)] transition-colors"
                    style={{
                      color: onRoute || expanded ? "var(--text-primary)" : "var(--text-muted)",
                      borderBottomColor: onRoute || expanded ? "var(--surface-brand)" : "transparent",
                    }}
                  >
                    {link.label}
                  </Link>
                  {link.panel && (
                    <button
                      type="button"
                      onClick={() => {
                        clearHoverTimer();
                        setPanel((p) => {
                          const next = p === link.panel ? null : link.panel ?? null;
                          dismissed.current = next === null ? link.panel ?? null : null;
                          return next;
                        });
                      }}
                      aria-expanded={expanded}
                      aria-controls="gt-nav-panel"
                      aria-label={link.panelLabel}
                      className="rounded-full p-1 text-[var(--text-muted)] transition-transform hover:text-[var(--text-primary)]"
                      style={{ transform: expanded ? "rotate(180deg)" : "none" }}
                    >
                      <ChevronDown size={14} aria-hidden="true" />
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
          <div className="flex items-center gap-1">
            {langButton}
            <IconButton icon={Search} label={t("nav.search")} onClick={notIncluded} />
            <IconButton icon={User} label={signedIn ? t("nav.account") : t("nav.signIn")} onClick={openAccount} />
            <IconButton
              icon={ShoppingBag}
              label={cartLabel}
              badge={count}
              onClick={() => {
                closeAll();
                navigate("/panier");
              }}
            />
          </div>
        </header>
        {panel && (
          /* An overlay rather than an in-flow block: with the shape and colour
             rows the panel is tall enough that pushing the page down on every
             hover would make the whole site jump. */
          <div
            id="gt-nav-panel"
            onMouseEnter={clearHoverTimer}
            className="absolute inset-x-0 top-full max-h-[calc(100vh-76px)] overflow-y-auto border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] shadow-[var(--shadow-lg)]"
          >
            <div className="mx-auto grid max-w-[var(--max-width-content)] gap-5 px-[var(--gutter-page-lg)] py-6">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
                {panelItems.map((item) => (
                  <Link
                    key={pick(item.title, lang)}
                    to={item.to}
                    onClick={closeAll}
                    className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2.5 text-left shadow-[var(--shadow-xs)] transition-shadow hover:shadow-[var(--shadow-md)]"
                  >
                    <img
                      src={item.thumb}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-11 w-11 flex-none rounded-[var(--radius-sm)] border border-[var(--gt-blue-200)] object-cover"
                    />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--text-primary)]">
                        {pick(item.title, lang)}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{pick(item.sub, lang)}</span>
                    </span>
                  </Link>
                ))}
              </div>
              {/* Side by side: stacked, the two strips plus the category cards
                  made the panel taller than a laptop viewport. */}
              {panel === "shop" && (
                <div className="grid gap-x-8 gap-y-5 border-t border-[var(--border-subtle)] pt-5 lg:grid-cols-2">
                  {pickers(true)}
                </div>
              )}
              <Link
                to={panelRoot.to}
                onClick={closeAll}
                className="justify-self-start text-xs text-[var(--text-muted)] underline decoration-1 underline-offset-4"
              >
                {panelRoot.label}
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Mobile */}
      <div className="md:hidden">
        <div className="relative flex items-center gap-1 px-3 py-2.5">
          <IconButton
            icon={menuOpen ? X : Menu}
            label={menuOpen ? t("nav.closeMenu") : t("nav.menu")}
            aria-expanded={menuOpen}
            aria-controls="gt-mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
          />
          <IconButton icon={Search} label={t("nav.search")} onClick={notIncluded} />
          <div className="flex-1" />
          <Link
            to="/"
            onClick={closeAll}
            className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center"
          >
            <img src={logoBlack} alt="Global Toothgems" className="h-4 w-auto" />
          </Link>
          <IconButton icon={Heart} label={t("nav.wishlist")} onClick={notIncluded} />
          <IconButton icon={User} label={signedIn ? t("nav.account") : t("nav.signIn")} onClick={openAccount} />
          <IconButton icon={ShoppingBag} label={cartLabel} badge={count} onClick={() => navigate("/panier")} />
        </div>
        {menuOpen && (
          <div
            id="gt-mobile-menu"
            className="grid max-h-[calc(100vh-60px)] gap-3.5 overflow-y-auto border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 pb-5 pt-3.5"
          >
            <div role="tablist" aria-label={t("nav.primary")} className="flex gap-4 border-b border-[var(--border-subtle)] px-1">
              {mobileTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={menuTab === tab.key}
                  onClick={() => setMenuTab(tab.key)}
                  className="border-b-2 bg-transparent pb-2.5 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)]"
                  style={{
                    color: menuTab === tab.key ? "var(--text-primary)" : "var(--text-muted)",
                    borderBottomColor: menuTab === tab.key ? "var(--gt-ink-900)" : "transparent",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="grid gap-2.5">
              {mobileItems.map((item) => (
                <Link
                  key={pick(item.title, lang)}
                  to={item.to}
                  onClick={closeAll}
                  className="flex items-center gap-3.5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 text-left shadow-[var(--shadow-xs)]"
                >
                  <img
                    src={item.thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-[46px] w-[46px] flex-none rounded-[var(--radius-sm)] border border-[var(--gt-blue-200)] object-cover"
                  />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate text-[11.5px] font-semibold uppercase tracking-[.06em] text-[var(--text-primary)]">
                      {pick(item.title, lang)}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">{pick(item.sub, lang)}</span>
                  </span>
                </Link>
              ))}
            </div>
            {menuTab === "gems" && (
              <div className="grid gap-4 border-t border-[var(--border-subtle)] pt-4">{pickers(false)}</div>
            )}
            <div className="flex items-center justify-between gap-3 pt-1">
              <Link
                to={mobileRoot.to}
                onClick={closeAll}
                className="text-xs text-[var(--text-muted)] underline decoration-1 underline-offset-4"
              >
                {mobileRoot.label}
              </Link>
              {langButton}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
