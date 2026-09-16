import { useTranslation } from "react-i18next";
import logoBlue from "../../assets/logo-wordmark-blue.png";

export function Footer() {
  const { t, i18n } = useTranslation();
  const shopItems = t("footer.shopItems", { returnObjects: true }) as string[];
  const academyItems = t("footer.academyItems", { returnObjects: true }) as string[];
  const helpItems = t("footer.helpItems", { returnObjects: true }) as string[];

  const columns = [
    { heading: t("footer.colShop"), items: shopItems },
    { heading: t("footer.colAcademy"), items: academyItems },
    { heading: t("footer.colHelp"), items: helpItems },
  ];

  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--surface-page)] px-[clamp(14px,4vw,48px)] py-[var(--section-y-sm)]">
      <div className="mx-auto grid max-w-[var(--max-width-content)] gap-10">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-8">
          <div className="grid gap-3">
            <img src={logoBlue} alt="Global Toothgems" className="h-6 w-auto" />
            <p className="m-0 max-w-[260px] text-sm text-[var(--text-muted)]">{t("footer.blurb")}</p>
          </div>
          {columns.map((col) => (
            <div key={col.heading} className="grid gap-3 content-start">
              <span className="gt-eyebrow">{col.heading}</span>
              <div className="grid gap-2">
                {col.items.map((item) => (
                  <span key={item} className="text-sm text-[var(--text-body)]">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-6 text-xs text-[var(--text-muted)]">
          <span>{t("footer.copyright")}</span>
          <span>{i18n.language.startsWith("en") ? "FR · EN" : "FR · EN"}</span>
        </div>
      </div>
    </footer>
  );
}
