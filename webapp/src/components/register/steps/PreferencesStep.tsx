import { useTranslation } from "react-i18next";
import { Brush, CircleAlert, Gem, GraduationCap, HeartHandshake, Layers, RotateCw, Sparkles, UserRound, WifiOff } from "lucide-react";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { ChoiceGroup, type Choice } from "../ChoiceGroup";
import { ConsentCheckbox } from "../ConsentCheckbox";
import { StepHeading } from "./StepHeading";
import type { LegalDoc } from "../LegalDialog";
import type { Interest, Persona } from "../../../lib/registration";
import type { StepProps } from "./types";

export type CreateFailure = "network" | "server" | null;

/**
 * Step 3 — optional personalisation, then consent.
 *
 * The two questions are clearly optional and skippable by simply continuing.
 * Consent is visually and structurally separate from them: the required terms
 * acceptance first, then marketing in its own group, unticked, with its own
 * explanation, so nobody reads one as a condition of the other.
 */
export function PreferencesStep({
  data,
  errors,
  set,
  fieldRef,
  headingRef,
  onOpenLegal,
  failure,
  onRetry,
  creating,
}: StepProps & {
  onOpenLegal: (doc: LegalDoc) => void;
  failure: CreateFailure;
  onRetry: () => void;
  creating: boolean;
}) {
  const { t } = useTranslation();

  const personas: Choice<Persona>[] = [
    { value: "artist", label: t("register.persona.artist"), description: t("register.persona.artistBody"), icon: Brush },
    { value: "student", label: t("register.persona.student"), description: t("register.persona.studentBody"), icon: GraduationCap },
    { value: "customer", label: t("register.persona.customer"), description: t("register.persona.customerBody"), icon: Gem },
    { value: "other", label: t("register.persona.other"), description: t("register.persona.otherBody"), icon: UserRound },
  ];

  const interests: Choice<Interest>[] = [
    { value: "products", label: t("register.interest.products"), icon: Gem },
    { value: "training", label: t("register.interest.training"), icon: GraduationCap },
    { value: "community", label: t("register.interest.community"), icon: HeartHandshake },
    { value: "all", label: t("register.interest.all"), icon: Layers },
  ];

  const legalLink = (doc: LegalDoc, label: string) => (
    <a
      href={doc === "terms" ? "/conditions-generales" : "/confidentialite"}
      onClick={(e) => {
        e.preventDefault();
        onOpenLegal(doc);
      }}
      className="font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-[3px] hover:text-[var(--text-link-hover)]"
    >
      {label}
    </a>
  );

  return (
    <div className="grid gap-7">
      <StepHeading
        headingRef={headingRef}
        title={t("register.preferences.title")}
        body={t("register.preferences.body")}
        aside={
          <Badge tone="brand" size="sm" icon={Sparkles}>
            {t("register.optional")}
          </Badge>
        }
      />

      <ChoiceGroup
        name="reg-persona"
        legend={t("register.persona.legend")}
        choices={personas}
        value={data.persona}
        onChange={(v) => set("persona", v)}
        clearLabel={t("register.clearChoice")}
      />

      <ChoiceGroup
        name="reg-interest"
        legend={t("register.interest.legend")}
        choices={interests}
        value={data.interest}
        onChange={(v) => set("interest", v)}
        clearLabel={t("register.clearChoice")}
      />

      <div className="grid gap-5 border-t border-[var(--border-subtle)] pt-6">
        <fieldset className="m-0 min-w-0 grid gap-3 border-0 p-0">
          <legend className="mb-3 p-0 text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">
            {t("register.consent.legend")}
          </legend>
          <ConsentCheckbox
            ref={fieldRef("terms") as React.Ref<HTMLInputElement>}
            id="reg-terms"
            required
            checked={data.terms}
            onChange={(v) => set("terms", v)}
            error={errors.terms}
          >
            {t("register.consent.termsBefore")} {legalLink("terms", t("register.consent.terms"))}{" "}
            {t("register.consent.and")} {legalLink("privacy", t("register.consent.privacy"))}
            {t("register.consent.termsAfter")}
            <span className="sr-only"> ({t("register.consent.required")})</span>
          </ConsentCheckbox>
        </fieldset>

        <fieldset className="m-0 min-w-0 grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--gt-off-white)] p-4">
          <legend className="px-1 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
            {t("register.consent.marketingLegend")}
          </legend>
          <ConsentCheckbox
            id="reg-marketing"
            checked={data.marketing}
            onChange={(v) => set("marketing", v)}
            description={t("register.consent.marketingBody")}
          >
            {t("register.consent.marketing")}
          </ConsentCheckbox>
        </fieldset>
      </div>

      {failure && !creating && (
        <div role="alert" className="gt-field-message grid gap-3 rounded-[var(--radius-md)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] p-4">
          <p className="m-0 flex items-start gap-2.5 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
            {failure === "network" ? (
              <WifiOff size={17} aria-hidden="true" className="mt-[1px] flex-none" />
            ) : (
              <CircleAlert size={17} aria-hidden="true" className="mt-[1px] flex-none" />
            )}
            <span>
              <strong className="block">{t(`register.failure.${failure}Title`)}</strong>
              <span className="text-[var(--text-body)]">{t(`register.failure.${failure}Body`)}</span>
            </span>
          </p>
          <div className="pl-[26px]">
            <Button variant="dark" size="sm" iconLeft={RotateCw} onClick={onRetry}>
              {t("register.failure.retry")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
