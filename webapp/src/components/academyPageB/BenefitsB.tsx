import { useTranslation } from "react-i18next";
import { Briefcase, Gem, HeartHandshake, Palette, ShieldCheck, Sparkles } from "lucide-react";
import { useReveal } from "../../lib/useReveal";

const BENEFITS = [
  { key: "technique", icon: Gem },
  { key: "confidence", icon: HeartHandshake },
  { key: "practice", icon: ShieldCheck },
  { key: "results", icon: Sparkles },
  { key: "identity", icon: Palette },
  { key: "business", icon: Briefcase },
] as const;

/**
 * "Why learn with us", once, as a plain list: an icon, a title and one line
 * per benefit, in one column on a phone, two then three beside each other on
 * wider screens. No numbering and no timeline — what one course contains and
 * how it runs is on that course's page.
 */
export function BenefitsB() {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} aria-labelledby="academyb-value-title" className="gt-reveal bg-white py-[clamp(48px,7vw,120px)]">
      <div className="gt-alt-wide grid gap-[clamp(24px,4vw,56px)] px-[var(--gt-alt-gutter)]">
        <div className="grid max-w-[760px] gap-3">
          <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("academyPage.value.eyebrow")}</span>
          <h2 id="academyb-value-title" className="gt-alt-h2 !text-[clamp(28px,3.4vw,52px)]">{t("academyPage.value.title")}</h2>
          <p className="m-0 max-w-[52ch] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("academyPage.value.lead")}</p>
        </div>
        <ul className="m-0 grid list-none gap-x-10 gap-y-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map(({ key, icon: Icon }) => (
            <li key={key} className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1">
              <span aria-hidden="true" className="row-span-2 grid h-11 w-11 place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
                <Icon size={19} strokeWidth={1.75} />
              </span>
              <h3 className="pt-0.5 text-[16px] font-bold leading-snug text-[var(--text-primary)]">{t(`academyPage.value.${key}.title`)}</h3>
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`academyPage.value.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
