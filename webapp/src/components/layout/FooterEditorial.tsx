import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useToast } from "../../lib/toast";
import logoBlue from "../../assets/logo-wordmark-blue.png";

/**
 * Editorial-direction footer, worn only by the alternative home page.
 *
 * Same columns, same destinations and the same "this prototype has no screen
 * for that" fallback as `Footer`. What changes is the close: an oversized
 * wordmark on a dark field, the link columns set as a ruled index, and the
 * legal line held on a hairline rather than a boxed bar.
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

export function FooterEditorial() {
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

  /* Links move right on hover instead of changing colour: the same affordance,
     read as a margin mark rather than as a state change. */
  const linkClass =
    "group flex items-center gap-2 justify-self-start py-1 text-left text-sm text-[var(--gt-ink-300)] transition-colors hover:text-[var(--gt-off-white)]";

  return (
    <footer className="bg-[var(--gt-ink-900)] px-[clamp(20px,4vw,56px)] pb-10 pt-[var(--section-y-sm)] text-[var(--gt-off-white)]">
      <div className="mx-auto grid max-w-[var(--max-width-content)] gap-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className="grid content-start gap-5">
            <img src={logoBlue} alt="Global Toothgems" className="h-9 w-auto justify-self-start" loading="lazy" decoding="async" />
            <p className="m-0 max-w-[320px] text-[length:var(--text-body-md)] leading-[var(--leading-normal)] text-[var(--gt-ink-300)]">
              {t("footer.blurb")}
            </p>
          </div>
          {/* Hairline-separated index columns, not three floating stacks. */}
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-3">
            {columns.map((col) => (
              <nav key={col.heading} aria-label={col.heading} className="grid content-start gap-4">
                <span className="border-b border-[var(--gt-ink-700)] pb-3 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
                  {col.heading}
                </span>
                <div className="grid">
                  {col.items.map((item, i) => {
                    const to = col.targets[i];
                    return to ? (
                      <Link key={item} to={to} className={linkClass}>
                        <span
                          aria-hidden="true"
                          className="h-px w-0 bg-[var(--gt-blue-300)] transition-[width] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] group-hover:w-4"
                        />
                        {item}
                      </Link>
                    ) : (
                      <button key={item} type="button" onClick={notIncluded} className={linkClass}>
                        <span
                          aria-hidden="true"
                          className="h-px w-0 bg-[var(--gt-blue-300)] transition-[width] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] group-hover:w-4"
                        />
                        {item}
                      </button>
                    );
                  })}
                </div>
              </nav>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--gt-ink-700)] pt-6 text-xs text-[var(--gt-ink-400)]">
          <span>{t("footer.copyright")}</span>
          <button
            type="button"
            onClick={() => i18n.changeLanguage(i18n.language.startsWith("en") ? "fr" : "en")}
            aria-label={t("common.langSwitchAria")}
            className="uppercase tracking-[var(--tracking-eyebrow)] underline decoration-1 underline-offset-4 transition-colors hover:text-[var(--gt-off-white)]"
          >
            FR · EN
          </button>
        </div>
      </div>
    </footer>
  );
}
