import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown, Heart, Menu, Search, ShoppingBag, User, X } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { useCart } from "../../lib/cart";
import { useToast } from "../../lib/toast";
import { MENU } from "../../data/menu";
import { pick } from "../../data/types";
import logoBlack from "../../assets/logo-wordmark-black.png";

type PanelKey = "shop" | "academy" | null;
type MobileTab = "gems" | "shop" | "academy";

export function Header() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { count } = useCart();
  const { showToast } = useToast();
  const lang = i18n.language;

  const [panel, setPanel] = useState<PanelKey>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<MobileTab>("gems");
  const rootRef = useRef<HTMLDivElement>(null);

  const links: { id: string; label: string; to: string; panel?: Exclude<PanelKey, null>; panelLabel?: string }[] = [
    { id: "home", label: t("nav.home"), to: "/" },
    { id: "shop", label: t("nav.shop"), to: "/boutique", panel: "shop", panelLabel: t("nav.openPanelShop") },
    { id: "academy", label: t("nav.academy"), to: "/academy", panel: "academy", panelLabel: t("nav.openPanelAcademy") },
  ];

  const closeAll = () => {
    setPanel(null);
    setMenuOpen(false);
  };

  // Backstop for history navigation (back/forward), which no click handler sees.
  useEffect(() => {
    setPanel(null);
    setMenuOpen(false);
  }, [location.pathname]);

  // Escape and outside clicks close whatever is open. Neither existed before.
  useEffect(() => {
    if (!panel && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPanel(null);
        setMenuOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
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
      <div className="hidden md:block">
        <header className="flex h-[76px] items-center gap-8 px-[var(--gutter-page-lg)]">
          <Link to="/" className="flex-none" onClick={closeAll}>
            <img src={logoBlack} alt="Global Toothgems" className="h-6 w-auto" />
          </Link>
          <nav aria-label={t("nav.primary")} className="flex flex-1 items-center gap-6 overflow-hidden">
            {links.map((link) => {
              const onRoute = location.pathname === link.to;
              const expanded = link.panel != null && panel === link.panel;
              return (
                <span key={link.id} className="flex items-center gap-0.5">
                  {/* The label navigates. Previously a nav item that owned a panel
                      only toggled that panel, so "Boutique" never reached /boutique. */}
                  <Link
                    to={link.to}
                    onClick={closeAll}
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
                      onClick={() => setPanel((p) => (p === link.panel ? null : link.panel ?? null))}
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
            <IconButton icon={User} label={t("nav.account")} onClick={notIncluded} />
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
          <div id="gt-nav-panel" className="border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
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
          <IconButton icon={User} label={t("nav.account")} onClick={notIncluded} />
          <IconButton icon={ShoppingBag} label={cartLabel} badge={count} onClick={() => navigate("/panier")} />
        </div>
        {menuOpen && (
          <div
            id="gt-mobile-menu"
            className="grid gap-3.5 border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 pb-5 pt-3.5"
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
