import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFooterColumns } from "./useFooterColumns";
import logoBlue from "../../assets/logo-wordmark-blue.png";

export function Footer() {
  const { t, i18n } = useTranslation();
  const columns = useFooterColumns();

  const linkClass =
    "justify-self-start py-1 text-left text-sm text-[var(--text-body)] transition-colors hover:text-[var(--text-link-hover)]";

  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--surface-page)] px-[clamp(14px,4vw,48px)] py-[var(--section-y-sm)]">
      <div className="mx-auto grid max-w-[var(--max-width-content)] gap-10">
        {/* Brand block, then five link columns: two to browse (shop, academy),
            three to get help or read the rules. Two columns on a phone, three on
            a tablet, one row on a desktop. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-3 lg:grid-cols-[minmax(0,1.3fr)_repeat(5,minmax(0,1fr))] lg:gap-x-8">
          <div className="col-span-2 grid content-start gap-3 sm:col-span-3 lg:col-span-1">
            <img src={logoBlue} alt="Global Toothgems" className="h-6 w-auto justify-self-start" loading="lazy" decoding="async" />
            <p className="m-0 max-w-[260px] text-sm text-[var(--text-muted)]">{t("footer.blurb")}</p>
          </div>
          {columns.map((col) => (
            <nav key={col.id} aria-label={col.heading} className="grid content-start gap-3">
              <span className="gt-eyebrow">{col.heading}</span>
              <div className="grid gap-1">
                {col.items.map((item) =>
                  item.to ? (
                    <Link key={item.label} to={item.to} className={linkClass}>
                      {item.label}
                    </Link>
                  ) : (
                    <button key={item.label} type="button" onClick={item.action} className={linkClass}>
                      {item.label}
                    </button>
                  ),
                )}
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
