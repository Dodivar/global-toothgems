import { useTranslation } from "react-i18next";
import { useReveal } from "../../lib/useReveal";

/**
 * How the Academy works, at the height of the whole platform: six steps from
 * choosing to the certificate. The mechanics of one course (its modules, its
 * pass mark, its diploma) are on that course's page and are not repeated
 * here. The certificate step only appears when a published course issues one.
 */
export function HowItWorks({ certificate }: { certificate: boolean }) {
  const { t } = useTranslation();
  const ref = useReveal<HTMLElement>();
  const steps = (["s1", "s2", "s3", "s4", "s5", "s6"] as const).filter((step) => step !== "s6" || certificate);

  return (
    <section ref={ref} aria-labelledby="academy-steps-title" className="gt-reveal gt-alt-section bg-[var(--surface-page)]">
      <div className="gt-alt-wide grid gap-[clamp(32px,4vw,64px)] px-[var(--gt-alt-gutter)]">
        <div className="grid max-w-[760px] gap-4">
          <span className="gt-eyebrow">{t("academyPage.steps.eyebrow")}</span>
          <h2 id="academy-steps-title" className="gt-alt-h2">{t("academyPage.steps.title")}</h2>
          <p className="m-0 max-w-[56ch] text-[length:var(--text-body-md)] text-[var(--text-muted)]">{t("academyPage.steps.lead")}</p>
        </div>
        <ol className="gt-academy-steps m-0 grid list-none gap-x-6 gap-y-8 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-flow-col xl:grid-cols-none xl:auto-cols-fr">
          {steps.map((step, i) => (
            <li key={step} className="gt-academy-step relative grid content-start gap-2 pl-14 xl:pl-0 xl:pt-16">
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 grid h-10 w-10 place-items-center rounded-full border border-[var(--gt-blue-300)] bg-[var(--surface-card)] text-[13px] font-bold tabular-nums text-[var(--gt-blue-700)]"
              >
                {i + 1}
              </span>
              <h3 className="text-[length:var(--text-h4)] font-bold text-[var(--text-primary)]">{t(`academyPage.steps.${step}.title`)}</h3>
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`academyPage.steps.${step}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
