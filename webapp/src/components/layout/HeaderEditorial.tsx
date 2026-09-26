import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronDown, Heart, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { Button } from "../ui/Button";
import { ShapeCarousel } from "../ui/ShapeCarousel";
import { ColorCarousel } from "../ui/ColorCarousel";
import { useAuth } from "../../lib/auth";
import { useCart } from "../../lib/cart";
import { useToast } from "../../lib/toast";
import { MENU } from "../../data/menu";
import { colorsInCatalog, shapesInCatalog } from "../../data/products";
import { useCatalog } from "../../lib/catalog/CatalogProvider";
import { colorHref, shapeHref } from "../../lib/shopUrl";
import { pick } from "../../data/types";
import { NewTag } from "../studio/NewTag";
import { STUDIO_PATH } from "../../lib/studioUrl";
import logoBlack from "../../assets/logo-wordmark-black.png";

/**
 * Editorial-direction navigation, worn only by the alternative home page at
 * `/accueil-b`.
 *
 * Every behaviour here is `Header`'s, copied deliberately rather than
 * refactored: the hover open/close timers, the dismissed-panel latch, the
 * Escape and outside-click handlers, `aria-expanded`/`aria-controls`, the
 * mobile tablist and the signed-in branch of the account button. Only the
 * layout and the type treatment differ — a masthead rule, centred nav on a wide
 * letter-spaced grid, square panel cells and hairlines instead of cards.
 *
 * Forking rather than restyling `Header` is the point: the two home pages are
 * meant to be compared, and the existing page must keep the chrome it was
 * designed with.
 */

type PanelKey = "shop" | "academy" | null;
type MobileTab = "gems" | "shop" | "academy";

/** Long enough that a pointer crossing the nav on its way elsewhere does not
 *  open anything, short enough that a deliberate hover feels immediate. */
const HOVER_OPEN_MS = 120;
/** Grace for the trip from the nav item down into the panel. */
const HOVER_CLOSE_MS = 250;

export function HeaderEditorial() {
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

  const links: { id: string; label: string; to: string; panel?: Exclude<PanelKey, null>; panelLabel?: string; isNew?: boolean }[] = [
    { id: "home", label: t("nav.home"), to: "/accueil-b" },
    { id: "shop", label: t("nav.shop"), to: "/boutique", panel: "shop", panelLabel: t("nav.openPanelShop") },
    { id: "academy", label: t("nav.academy"), to: "/academy", panel: "academy", panelLabel: t("nav.openPanelAcademy") },
    { id: "studio", label: t("nav.studio"), to: STUDIO_PATH, isNew: true },
  ];

  const closeAll = () => {
    setPanel(null);
    setMenuOpen(false);
  };

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

  /** The account entry point: the member dashboard once signed in, the login page otherwise. */
  const openAccount = () => {
    closeAll();
    navigate(signedIn ? "/compte" : "/connexion");
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

  const { products } = useCatalog();
  const shapeGroups = shapesInCatalog(products);
  const colorGroups = colorsInCatalog(products);

  const goTo = (to: string) => {
    clearHoverTimer();
    closeAll();
    navigate(to);
  };

  const pickers = (compact: boolean) => {
    const section = (heading: string, to: string, label: string, carousel: ReactNode) => (
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
      className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
    >
      {/* Shows the language you switch TO, not the one you are already reading. */}
      {t("common.langSwitchCode")}
    </button>
  );

  return (
    <div
      ref={rootRef}
      className="sticky top-0 z-[60] border-b border-[var(--gt-ink-900)] bg-[var(--gt-off-white)]"
    >
      {/* Desktop */}
      <div className="relative hidden md:block" onMouseLeave={() => hoverTo(null)}>
        <header className="grid h-[84px] grid-cols-[1fr_auto_1fr] items-center gap-8 px-[clamp(20px,4vw,56px)]">
          <Link to="/accueil-b" className="justify-self-start" onClick={closeAll}>
            <img src={logoBlack} alt="Global Toothgems" className="h-[22px] w-auto" />
          </Link>
          {/* Centred masthead nav: the wide tracking is the whole treatment, so
              the items get room rather than decoration. */}
          <nav aria-label={t("nav.primary")} className="flex items-center gap-10 justify-self-center">
            {links.map((link) => {
              const onRoute = location.pathname === link.to;
              const expanded = link.panel != null && panel === link.panel;
              const active = onRoute || expanded;
              return (
                <span
                  key={link.id}
                  className="flex items-center gap-1"
                  onMouseEnter={() => hoverTo(link.panel ?? null)}
                  onMouseLeave={() => {
                    if (dismissed.current === link.panel) dismissed.current = null;
                  }}
                >
                  <Link
                    to={link.to}
                    onClick={() => {
                      clearHoverTimer();
                      closeAll();
                    }}
                    aria-current={onRoute ? "page" : undefined}
                    className="relative py-1 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] transition-colors"
                    style={{ color: active ? "var(--gt-ink-900)" : "var(--gt-ink-500)" }}
                  >
                    {link.label}
                    {link.isNew && <NewTag className="ml-1.5 align-middle" />}
                    {/* A hairline that draws itself in, rather than a 2px tab. */}
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-0.5 left-0 h-px bg-[var(--gt-ink-900)] transition-[width] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]"
                      style={{ width: active ? "100%" : 0 }}
                    />
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
                      aria-controls="gt-nav-panel-editorial"
                      aria-label={link.panelLabel}
                      className="p-1 text-[var(--gt-ink-400)] transition-transform hover:text-[var(--gt-ink-900)]"
                      style={{ transform: expanded ? "rotate(180deg)" : "none" }}
                    >
                      <ChevronDown size={13} aria-hidden="true" />
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
          <div className="flex items-center gap-1 justify-self-end">
            {langButton}
            <IconButton icon={Search} label={t("nav.search")} onClick={notIncluded} />
            <IconButton icon={User} label={signedIn ? t("nav.account") : t("nav.signIn")} onClick={openAccount} />
            {/* Shopping is the one action that gets visual weight in this
                direction: a ruled pill against everything else being plain. */}
            <button
              type="button"
              onClick={() => {
                closeAll();
                navigate("/panier");
              }}
              aria-label={cartLabel}
              className="ml-1 flex h-9 items-center gap-2 border border-[var(--gt-ink-900)] px-3.5 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-ink-900)] transition-colors hover:bg-[var(--gt-ink-900)] hover:text-[var(--gt-off-white)]"
            >
              <ShoppingBag size={14} aria-hidden="true" />
              <span aria-hidden="true">{count}</span>
            </button>
          </div>
        </header>
        {panel && (
          /* An overlay rather than an in-flow block: with the shape and colour
             rows the panel is tall enough that pushing the page down on every
             hover would make the whole site jump. */
          <div
            id="gt-nav-panel-editorial"
            onMouseEnter={clearHoverTimer}
            className="absolute inset-x-0 top-full max-h-[calc(100vh-84px)] overflow-y-auto border-t border-[var(--gt-ink-900)] bg-[var(--gt-off-white)] shadow-[var(--shadow-lg)]"
          >
            <div className="mx-auto grid max-w-[var(--max-width-content)] gap-6 px-[clamp(20px,4vw,56px)] py-8">
              {/* Square, hairline-ruled cells: the panel reads as an index, not
                  as a tray of cards. The rules live on the cells, not on a gap
                  track — an auto-filled last row is rarely full, and a gap track
                  would paint the empty cell as a grey block. */}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] border-l border-t border-[var(--border-subtle)]">
                {panelItems.map((item) => (
                  <Link
                    key={pick(item.title, lang)}
                    to={item.to}
                    onClick={closeAll}
                    className="group flex items-center gap-3 border-b border-r border-[var(--border-subtle)] p-3 text-left transition-colors hover:bg-[var(--gt-blue-50)]"
                  >
                    <img
                      src={item.thumb}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-11 w-11 flex-none object-cover"
                    />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--gt-ink-900)]">
                        {pick(item.title, lang)}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{pick(item.sub, lang)}</span>
                    </span>
                  </Link>
                ))}
              </div>
              {panel === "shop" && (
                <div className="grid gap-x-10 gap-y-6 border-t border-[var(--border-subtle)] pt-6 lg:grid-cols-2">
                  {pickers(true)}
                </div>
              )}
              <Link
                to={panelRoot.to}
                onClick={closeAll}
                className="justify-self-start text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--gt-ink-900)]"
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
            aria-controls="gt-mobile-menu-editorial"
            onClick={() => setMenuOpen((v) => !v)}
          />
          <IconButton icon={Search} label={t("nav.search")} onClick={notIncluded} />
          <div className="flex-1" />
          <Link
            to="/accueil-b"
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
            id="gt-mobile-menu-editorial"
            className="grid max-h-[calc(100vh-60px)] gap-4 overflow-y-auto border-t border-[var(--gt-ink-900)] bg-[var(--gt-off-white)] px-3 pb-6 pt-4"
          >
            <Link
              to={STUDIO_PATH}
              onClick={closeAll}
              className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-1 pb-3 text-[11.5px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-ink-900)]"
            >
              <span className="flex items-center gap-2">
                {t("nav.studio")}
                <NewTag />
              </span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <div role="tablist" aria-label={t("nav.primary")} className="flex gap-5 border-b border-[var(--border-subtle)] px-1">
              {mobileTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={menuTab === tab.key}
                  onClick={() => setMenuTab(tab.key)}
                  className="border-b bg-transparent pb-2.5 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)]"
                  style={{
                    color: menuTab === tab.key ? "var(--gt-ink-900)" : "var(--gt-ink-500)",
                    borderBottomColor: menuTab === tab.key ? "var(--gt-ink-900)" : "transparent",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="grid gap-px bg-[var(--border-subtle)]">
              {mobileItems.map((item) => (
                <Link
                  key={pick(item.title, lang)}
                  to={item.to}
                  onClick={closeAll}
                  className="flex items-center gap-3.5 bg-[var(--gt-off-white)] p-3 text-left"
                >
                  <img
                    src={item.thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-[46px] w-[46px] flex-none object-cover"
                  />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate text-[11.5px] font-semibold uppercase tracking-[.08em] text-[var(--gt-ink-900)]">
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
                className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)] underline decoration-1 underline-offset-4"
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
