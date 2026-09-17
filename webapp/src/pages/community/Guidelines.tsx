import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, ScrollText } from "lucide-react";
import clsx from "clsx";
import { GUIDELINES } from "../../data/community";
import { pick } from "../../data/types";
import { channelPath } from "../../components/community/routes";
import { cardBase, focusRing } from "../../components/community/styles";

/**
 * How the community treats each other.
 *
 * Written as four expectations rather than as a list of prohibitions: this is a
 * room of professionals, and a charter that opens with what gets you removed
 * sets the tone for everything posted underneath it.
 */
export function Guidelines() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  return (
    <>
      <header className="grid gap-2">
        <span className="gt-eyebrow flex items-center gap-2">
          <ScrollText size={13} aria-hidden="true" />
          {t("community.navGroupAbout")}
        </span>
        <h1 className="text-[length:var(--text-h2)]">{t("community.guidelinesTitle")}</h1>
        <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-md)] leading-[var(--leading-relaxed)] text-[var(--text-body)]">
          {t("community.guidelinesIntro")}
        </p>
      </header>

      <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
        {GUIDELINES.map((rule, index) => (
          <li key={rule.id} className={clsx("grid gap-2.5 p-[var(--space-5)]", cardBase)}>
            <span
              aria-hidden="true"
              className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface-brand-wash)] text-[length:var(--text-body-sm)] font-[var(--weight-black)] text-[var(--gt-blue-700)]"
            >
              {index + 1}
            </span>
            <h2 className="text-[length:var(--text-h4)] leading-[var(--leading-snug)]">{pick(rule.title, lang)}</h2>
            <p className="m-0 text-[length:var(--text-body-sm)] leading-[var(--leading-relaxed)] text-[var(--text-muted)]">
              {pick(rule.body, lang)}
            </p>
          </li>
        ))}
      </ol>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] bg-[var(--surface-inverse)] p-[var(--space-5)] text-[var(--text-inverse)]">
        <div className="grid gap-1">
          <strong className="text-[length:var(--text-h4)] text-[var(--gt-off-white)]">
            {t("community.guidelinesHelpTitle")}
          </strong>
          <span className="text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">
            {t("community.guidelinesHelpBody")}
          </span>
        </div>
        <Link
          to={channelPath("training")}
          className={clsx(
            "inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent-cta)] px-[22px] py-3 text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-cta-hover)]",
            focusRing,
          )}
        >
          {t("community.guidelinesHelpCta")}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </>
  );
}
