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
 * "Why learn with Global Toothgems?" — the outcome of training, whichever
 * course is chosen. Six short benefits, never a course's own modules (those
 * are on its page). A swiped row on a phone, so the catalogue stays close.
 */
export function ValueSection() {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} aria-labelledby="academy-value-title" className="gt-reveal gt-alt-section bg-[var(--surface-page)]">
      <div className="gt-alt-wide grid gap-[clamp(28px,4vw,56px)] px-[var(--gt-alt-gutter)]">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
          <div className="grid gap-4">
            <span className="gt-eyebrow">{t("academyPage.value.eyebrow")}</span>
            <h2 id="academy-value-title" className="gt-alt-h2 max-w-[18ch]">{t("academyPage.value.title")}</h2>
          </div>
          <p className="m-0 max-w-[48ch] text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("academyPage.value.lead")}</p>
        </div>
        <ul className="gt-scroller gt-alt-snap-pad -mx-[var(--gt-alt-gutter)] my-0 flex list-none gap-4 px-[var(--gt-alt-gutter)] pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 2xl:grid-cols-6">
          {BENEFITS.map(({ key, icon: Icon }, i) => (
            <li
              key={key}
              className="grid w-[72%] max-w-[300px] flex-none snap-start content-start gap-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(20px,2vw,28px)] sm:w-auto sm:max-w-none"
            >
              <span className="flex items-center justify-between">
                <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
                  <Icon size={19} strokeWidth={1.75} />
                </span>
                <span aria-hidden="true" className="text-[11px] font-semibold tabular-nums tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-600)]">
                  0{i + 1}
                </span>
              </span>
              <h3 className="text-[length:var(--text-h4)] font-bold text-[var(--text-primary)]">{t(`academyPage.value.${key}.title`)}</h3>
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`academyPage.value.${key}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
