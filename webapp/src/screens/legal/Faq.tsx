import { useDeferredValue, useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronDown, Search, X } from "lucide-react";
import { FAQ } from "../../data/legal/faq";
import { contactHref } from "../../data/legal/routes";
import { pick } from "../../data/types";
import { LegalLayout } from "../../components/legal/LegalLayout";
import { RichText } from "../../components/legal/RichText";
import { ICONS } from "../../components/legal/tones";

/** The words a reader sees, without the inline markup. */
function plain(text: string) {
  return text
    .replace(/\[\[!?(.+?)\]\]/g, "$1")
    .replace(/<<(.+?)\|.+?>>/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1");
}

/** Case- and accent-insensitive, so "delai" finds "délai". */
function normalise(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * The FAQ, as one accordion per category.
 *
 * Native `<details>` like the loyalty FAQ: keyboard-operable, announced as
 * expandable, and every answer has an address (`#faq-…`) the other pages can
 * link to — the layout opens it on arrival. A search narrows the list as you
 * type and opens what it finds; the result count is announced politely.
 */
export function Faq() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const searchId = useId();
  const searching = deferred.trim().length > 1;

  const groups = useMemo(() => {
    const needle = normalise(deferred.trim());
    return FAQ.map((category) => ({
      category,
      items: searching
        ? category.items.filter((item) =>
            normalise(`${pick(item.question, lang)} ${item.answer.map((a) => plain(pick(a, lang))).join(" ")}`).includes(needle),
          )
        : category.items,
    })).filter((group) => group.items.length > 0);
  }, [deferred, lang, searching]);

  const total = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <LegalLayout
      eyebrow={t("legal.faq.eyebrow")}
      title={t("legal.faq.title")}
      intro={t("legal.faq.intro")}
      toc={groups.map((g) => ({ id: `faq-${g.category.id}`, label: pick(g.category.title, lang) }))}
      contactCategory="other"
    >
      <div className="grid gap-2">
        <label htmlFor={searchId} className="gt-field-label">
          {t("legal.faq.searchLabel")}
        </label>
        <div className="relative">
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("legal.faq.searchPlaceholder")}
            className="gt-field pl-12 pr-12 [&::-webkit-search-cancel-button]:hidden"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("legal.faq.clear")}
              className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]"
            >
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>
        <p role="status" className="m-0 min-h-5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {searching ? t("legal.faq.results", { count: total }) : ""}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] p-6">
          <strong className="text-[length:var(--text-body-lg)] text-[var(--text-primary)]">{t("legal.faq.emptyTitle")}</strong>
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("legal.faq.emptyBody")}</p>
          <Link to={contactHref()} className="gt-legal-link inline-flex items-center gap-1.5">
            {t("legal.cta.contact")}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="grid gap-12">
          {groups.map(({ category, items }) => {
            const Icon = ICONS[category.icon];
            return (
              <section key={category.id} id={`faq-${category.id}`} aria-labelledby={`faq-${category.id}-title`} className="gt-legal-anchor grid gap-4">
                <h2 id={`faq-${category.id}-title`} className="flex items-center gap-3 text-[clamp(20px,2.4vw,24px)]">
                  <span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]">
                    <Icon size={19} />
                  </span>
                  {pick(category.title, lang)}
                  <span className="text-[length:var(--text-body-sm)] font-medium text-[var(--text-muted)]">
                    ({items.length})
                  </span>
                </h2>
                <div className="grid gap-2.5">
                  {items.map((item) => (
                    <details
                      key={searching ? `search-${item.id}` : item.id}
                      id={`faq-${item.id}`}
                      open={searching || undefined}
                      className="gt-faq-item gt-legal-anchor group rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] transition-shadow open:border-[var(--gt-blue-200)] open:shadow-[var(--shadow-sm)]"
                    >
                      <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-[var(--radius-card)] px-5 py-3.5">
                        <h3 className="text-[length:var(--text-body-md)] font-semibold leading-[1.4] tracking-normal">{pick(item.question, lang)}</h3>
                        <ChevronDown
                          size={18}
                          aria-hidden="true"
                          className="flex-none text-[var(--gt-blue-700)] transition-transform duration-[var(--duration-fast)] group-open:rotate-180"
                        />
                      </summary>
                      <div className="grid max-w-[var(--max-width-prose)] gap-3 px-5 pb-5 text-[length:var(--text-body-sm)] leading-[1.7] text-[var(--text-body)]">
                        {item.answer.map((paragraph, i) => (
                          <p key={i} className="m-0">
                            <RichText text={pick(paragraph, lang)} />
                          </p>
                        ))}
                        <Link
                          to={contactHref(category.contact)}
                          className="inline-flex items-center gap-1.5 justify-self-start text-[length:var(--text-caption)] font-semibold text-[var(--gt-blue-700)] hover:text-[var(--text-link-hover)]"
                        >
                          {t("legal.faq.stillNeedHelp")}
                          <ArrowRight size={13} aria-hidden="true" />
                        </Link>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </LegalLayout>
  );
}
