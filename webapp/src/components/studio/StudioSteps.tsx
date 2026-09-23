import { useTranslation } from "react-i18next";
import { Gem, Move, Sparkles } from "lucide-react";
import { useReveal } from "../../lib/useReveal";

/**
 * Choose → Compose → Create. Three steps, large outlined numerals and a
 * hairline joining them; the steps rise in one after another as the row
 * scrolls in (and simply appear under reduced motion).
 */
export function StudioSteps() {
  const { t } = useTranslation();
  const ref = useReveal<HTMLOListElement>();
  const steps = [
    { key: "choose", icon: Gem },
    { key: "compose", icon: Move },
    { key: "create", icon: Sparkles },
  ];

  return (
    <ol ref={ref} className="gt-reveal gt-studio-steps relative m-0 grid list-none grid-cols-1 gap-5 p-0 md:grid-cols-3 md:gap-6">
      <span aria-hidden="true" className="gt-studio-steps-line absolute left-[16%] right-[16%] top-[46px] hidden h-px md:block" />
      {steps.map(({ key, icon: Icon }, i) => (
        <li
          key={key}
          className="gt-studio-step relative grid justify-items-start gap-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(20px,2.4vw,28px)] md:justify-items-center md:text-center"
          style={{ transitionDelay: `${i * 120}ms` }}
        >
          <span className="relative grid place-items-center">
            <span aria-hidden="true" className="gt-studio-numeral text-[64px] font-[var(--weight-black)] leading-none">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span aria-hidden="true" className="absolute -bottom-1 -right-3 grid h-8 w-8 place-items-center rounded-full bg-[var(--surface-inverse)] text-white shadow-[var(--shadow-md)]">
              <Icon size={15} />
            </span>
          </span>
          <h3 className="text-[length:var(--text-h3)]">
            <span className="sr-only">{t("studio.steps.stepLabel", { n: i + 1 })} </span>
            {t(`studio.steps.${key}.title`)}
          </h3>
          <p className="m-0 max-w-[32ch] text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`studio.steps.${key}.body`)}</p>
        </li>
      ))}
    </ol>
  );
}
