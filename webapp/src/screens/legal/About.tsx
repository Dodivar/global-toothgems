import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Gem, GraduationCap, Landmark } from "lucide-react";
import { LegalLayout } from "../../components/legal/LegalLayout";
import { ContentBlocks } from "../../components/legal/ContentBlocks";
import { LEGAL_PATHS } from "../../data/legal/routes";
import { l } from "../../data/legal/types";

/**
 * About Global Toothgems — the footer's "Company" destination.
 *
 * Kept deliberately short: it says what the site offers, which the rest of the
 * prototype shows, and leaves the company's own story to the company. The
 * story, founding facts and team are placeholders, not invented biography.
 */
export function About() {
  const { t } = useTranslation();

  const offers = [
    { icon: Gem, key: "shop", to: "/boutique" },
    { icon: GraduationCap, key: "academy", to: "/academy" },
    { icon: Landmark, key: "company", to: LEGAL_PATHS.legalNotice },
  ];

  return (
    <LegalLayout
      eyebrow={t("legal.about.eyebrow")}
      title={t("legal.about.title")}
      intro={t("legal.about.intro")}
      crumbs={[]}
      contactCategory="professional"
    >
      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
        {offers.map(({ icon: Icon, key, to }) => (
          <li key={key} className="grid content-start gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
            <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]">
              <Icon size={20} />
            </span>
            <h2 className="text-[length:var(--text-h4)]">{t(`legal.about.${key}Title`)}</h2>
            <p className="m-0 text-[length:var(--text-body-sm)] leading-[1.6] text-[var(--text-body)]">{t(`legal.about.${key}Body`)}</p>
            <Link to={to} className="gt-legal-link inline-flex items-center gap-1.5 justify-self-start text-[length:var(--text-body-sm)]">
              {t(`legal.about.${key}Cta`)}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="about-story" className="grid gap-4">
        <h2 id="about-story" className="text-[length:var(--text-h3)]">
          {t("legal.about.storyTitle")}
        </h2>
        <div className="gt-legal-prose grid gap-4">
          <ContentBlocks
            blocks={[
              {
                kind: "p",
                text: l(
                  "[[!Histoire de l’entreprise, fondation et équipe]]",
                  "[[!Company story, founding and team]]",
                ),
              },
              {
                kind: "internal",
                text: l(
                  "Aucune date de création, aucun chiffre ni aucun nom n’a été inventé ici. Les statistiques affichées ailleurs dans le prototype (artistes formés, pays, avis) sont des exemples de maquette à vérifier avant publication.",
                  "No founding date, figure or name has been invented here. Statistics shown elsewhere in the prototype (artists trained, countries, reviews) are mockup examples to verify before publication.",
                ),
              },
            ]}
          />
        </div>
      </section>
    </LegalLayout>
  );
}
