import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useToast } from "../../lib/toast";
import logoBlue from "../../assets/logo-wordmark-blue.png";

/**
 * Destinations per column, positionally matched to the translated label lists so
 * the routes stay correct in both languages. `null` marks an item this prototype
 * does not have a screen for — those stay buttons that say so, rather than links
 * that go nowhere.
 */
const SHOP_TARGETS: (string | null)[] = [
  "/boutique?categorie=Gems",
  "/boutique?categorie=Outils",
  "/boutique?categorie=Kits",
  "/boutique?categorie=Suivi",
  null,
  "/fidelite",
];
const ACADEMY_TARGETS: (string | null)[] = ["/academy", "/academy", "/academy", "/academy"];
const HELP_TARGETS: (string | null)[] = [null, null, null, null];

export function Footer() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();

  const shopItems = t("footer.shopItems", { returnObjects: true }) as string[];
  const academyItems = t("footer.academyItems", { returnObjects: true }) as string[];
  const helpItems = t("footer.helpItems", { returnObjects: true }) as string[];

  const columns = [
    { heading: t("footer.colShop"), items: shopItems, targets: SHOP_TARGETS },
    { heading: t("footer.colAcademy"), items: academyItems, targets: ACADEMY_TARGETS },
    { heading: t("footer.colHelp"), items: helpItems, targets: HELP_TARGETS },
  ];

  const notIncluded = () => showToast(t("common.notIncludedTitle"), t("common.notIncludedScreen"), "info");

  const linkClass =
    "justify-self-start text-left text-sm text-[var(--text-body)] transition-colors hover:text-[var(--text-link-hover)]";

  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--surface-page)] px-[clamp(14px,4vw,48px)] py-[var(--section-y-sm)]">
      <div className="mx-auto grid max-w-[var(--max-width-content)] gap-10">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-8">
          <div className="grid gap-3">
            <img src={logoBlue} alt="Global Toothgems" className="h-6 w-auto" loading="lazy" decoding="async" />
            <p className="m-0 max-w-[260px] text-sm text-[var(--text-muted)]">{t("footer.blurb")}</p>
          </div>
          {columns.map((col) => (
            <nav key={col.heading} aria-label={col.heading} className="grid content-start gap-3">
              <span className="gt-eyebrow">{col.heading}</span>
              <div className="grid gap-2">
                {col.items.map((item, i) => {
                  const to = col.targets[i];
                  // Previously every one of these was a <span>: visible, but
                  // unreachable by keyboard and invisible to assistive tech.
                  return to ? (
                    <Link key={item} to={to} className={linkClass}>
                      {item}
                    </Link>
                  ) : (
                    <button key={item} type="button" onClick={notIncluded} className={linkClass}>
                      {item}
                    </button>
                  );
                })}
              </div>
            </nav>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-6 text-xs text-[var(--text-muted)]">
          <span>{t("footer.copyright")}</span>
          <button
            type="button"
            onClick={() => i18n.changeLanguage(i18n.language.startsWith("en") ? "fr" : "en")}
            aria-label={t("common.langSwitchAria")}
            className="underline decoration-1 underline-offset-4 transition-colors hover:text-[var(--text-primary)]"
          >
            FR · EN
          </button>
        </div>
      </div>
    </footer>
  );
}
