import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heart, Menu, Search, ShoppingBag, User, X } from "lucide-react";
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

  const links: { id: string; label: string; to: string; panel?: PanelKey }[] = [
    { id: "home", label: t("nav.home"), to: "/" },
    { id: "shop", label: t("nav.shop"), to: "/boutique", panel: "shop" },
    { id: "academy", label: t("nav.academy"), to: "/academy", panel: "academy" },
  ];

  const notIncluded = () => showToast(t("common.notIncludedTitle"), t("common.notIncludedScreen"), "info");

  const handleNavClick = (link: (typeof links)[number]) => {
    if (link.panel) {
      setPanel((p) => (p === link.panel ? null : link.panel!));
    } else {
      setPanel(null);
      navigate(link.to);
    }
  };

  const closeAll = () => {
    setPanel(null);
    setMenuOpen(false);
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
  const mobileRoot = menuTab === "academy" ? { label: t("nav.viewAllAcademy"), to: "/academy" } : { label: t("nav.viewAllShop"), to: "/boutique" };

  return (
    <div className="sticky top-0 z-[60] border-b border-[var(--border-subtle)] bg-[var(--surface-page)]">
      {/* Desktop */}
      <div className="hidden md:block">
        <header className="flex h-[76px] items-center gap-8 px-[var(--gutter-page-lg)]">
          <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); closeAll(); }} className="flex-none">
            <img src={logoBlack} alt="Global Toothgems" className="h-6 w-auto" />
          </a>
          <nav className="flex flex-1 items-center gap-6 overflow-hidden">
            {links.map((link) => {
              const active = location.pathname === link.to || (link.panel && panel === link.panel);
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => handleNavClick(link)}
                  className="border-b-2 pb-1 text-[13px] font-semibold uppercase tracking-[var(--tracking-wide)] transition-colors"
                  style={{
                    color: active ? "var(--text-primary)" : "var(--text-muted)",
                    borderBottomColor: active ? "var(--surface-brand)" : "transparent",
                  }}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => i18n.changeLanguage(lang.startsWith("en") ? "fr" : "en")}
              className="px-2 text-xs font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {lang.startsWith("en") ? "EN" : "FR"}
            </button>
            <IconButton icon={Search} label={t("nav.search")} onClick={notIncluded} />
            <IconButton icon={User} label={t("nav.account")} onClick={notIncluded} />
            <IconButton icon={ShoppingBag} label={t("nav.cart")} badge={count} onClick={() => { closeAll(); navigate("/panier"); }} />
          </div>
        </header>
        {panel && (
          <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
            <div className="mx-auto grid max-w-[var(--max-width-content)] gap-5 px-[var(--gutter-page-lg)] py-6">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
                {panelItems.map((item) => (
                  <button
                    key={pick(item.title, lang)}
                    type="button"
                    onClick={() => {
                      closeAll();
                      navigate(item.to);
                    }}
                    className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2.5 text-left shadow-[var(--shadow-xs)] transition-shadow hover:shadow-[var(--shadow-md)]"
                  >
                    <span
                      className="h-11 w-11 flex-none rounded-[var(--radius-sm)] border border-[var(--gt-blue-200)] bg-cover bg-center"
                      style={{ backgroundImage: `url(${item.thumb})` }}
                    />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--text-primary)]">
                        {pick(item.title, lang)}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{pick(item.sub, lang)}</span>
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  closeAll();
                  navigate(panelRoot.to);
                }}
                className="justify-self-start bg-transparent p-0 text-xs text-[var(--text-muted)] underline decoration-1 underline-offset-4"
              >
                {panelRoot.label}
              </button>
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
            onClick={() => setMenuOpen((v) => !v)}
          />
          <IconButton icon={Search} label={t("nav.search")} onClick={notIncluded} />
          <div className="flex-1" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center">
            <img src={logoBlack} alt="Global Toothgems" className="h-4 w-auto" />
          </div>
          <IconButton icon={Heart} label={t("nav.wishlist")} onClick={notIncluded} />
          <IconButton icon={User} label={t("nav.account")} onClick={notIncluded} />
          <IconButton icon={ShoppingBag} label={t("nav.cart")} badge={count} onClick={() => navigate("/panier")} />
        </div>
        {menuOpen && (
          <div className="grid gap-3.5 border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 pb-5 pt-3.5">
            <div className="flex gap-4 border-b border-[var(--border-subtle)] px-1">
              {mobileTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
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
                <button
                  key={pick(item.title, lang)}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(item.to);
                  }}
                  className="flex items-center gap-3.5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 text-left shadow-[var(--shadow-xs)]"
                >
                  <span
                    className="h-[46px] w-[46px] flex-none rounded-[var(--radius-sm)] border border-[var(--gt-blue-200)] bg-cover bg-center"
                    style={{ backgroundImage: `url(${item.thumb})` }}
                  />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate text-[11.5px] font-semibold uppercase tracking-[.06em] text-[var(--text-primary)]">
                      {pick(item.title, lang)}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">{pick(item.sub, lang)}</span>
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                navigate(mobileRoot.to);
              }}
              className="justify-self-start bg-transparent p-1 text-xs text-[var(--text-muted)] underline decoration-1 underline-offset-4"
            >
              {mobileRoot.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
